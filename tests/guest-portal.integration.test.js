import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import { FormData } from 'miniflare'
import { createTestRuntime } from './runtime.js'

const ORIGIN = 'https://wedding.test'
const COOKIE_NAME = 'wedding_guest_session'
const QUOTA_BYTES = 10_000_000_000
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6x1sAAAAASUVORK5CYII=', 'base64')
let runtime, db, bucket, nextIp = 1

before(async () => { ({ runtime, db, bucket } = await createTestRuntime()) })
after(async () => { await runtime?.dispose() })

async function raw(path, { session, body, method, csrf = true, origin = ORIGIN, headers = {} } = {}) {
  const requestHeaders = new Headers(headers)
  if (origin !== null) requestHeaders.set('Origin', origin)
  if (session?.cookie) requestHeaders.set('Cookie', session.cookie)
  if (session?.csrfToken && csrf) requestHeaders.set('X-CSRF-Token', session.csrfToken)
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')
  return runtime.dispatchFetch(`${ORIGIN}${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function api(path, options) {
  const response = await raw(path, options)
  return { response, data: await response.json() }
}

async function login(code = 'MG-TEST01', options = {}) {
  const result = await api('/api/guest/session', {
    body: { code }, headers: { 'CF-Connecting-IP': `198.51.100.${nextIp++}` }, ...options,
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  const setCookie = result.response.headers.get('set-cookie')
  assert.ok(setCookie, 'Login must issue a session cookie')
  return { ...result.data, cookie: setCookie.split(';')[0], setCookie }
}

function attendance(session, { email = '', song = null, attending = true } = {}) {
  const status = attending ? 'attending' : 'declined'
  return {
    email,
    song,
    guests: session.guests.map(g => ({
      id: g.id,
      ...(g.invitedToDinner ? { dinner: { status } } : {}),
      ...(g.invitedToEvening ? { evening: { status } } : {}),
      dietaryRequirements: [],
    })),
  }
}

function sessionHash(session) {
  return createHash('sha256').update(session.cookie.slice(session.cookie.indexOf('=') + 1)).digest('hex')
}

function upload(session, { type = 'image/png', contents = PHOTO, filename = 'wedding.png', csrf = true, origin = ORIGIN } = {}) {
  const body = new FormData()
  body.set('photo', new File([contents], filename, { type }))
  const headers = { Cookie: session.cookie, Origin: origin }
  if (csrf) headers['X-CSRF-Token'] = session.csrfToken
  return runtime.dispatchFetch(`${ORIGIN}/api/guest/photos`, { method: 'POST', headers, body })
}

test('guest data and mutations require a real cookie; URL codes and fabricated sessions do not authenticate', async () => {
  for (const path of ['/api/guest/session', '/api/guest/photos', '/api/guest/photo?id=1', '/api/guest/photos?code=MG-TEST01']) {
    const response = await raw(path)
    assert.equal(response.status, 401, path)
    await response.arrayBuffer()
  }
  const forged = { cookie: `${COOKIE_NAME}=${'a'.repeat(64)}`, csrfToken: 'forged' }
  assert.equal((await api('/api/guest/session', { session: forged })).response.status, 401)
  assert.equal((await api('/api/guest/rsvp', { body: { code: 'MG-TEST01', guests: [] } })).response.status, 401)
  assert.equal((await raw('/api/guest/photos', { method: 'POST', session: forged })).status, 401)
  const invalid = await api('/api/guest/session', { body: { code: 'MG-NOPE00' }, headers: { 'CF-Connecting-IP': '198.51.100.190' } })
  assert.ok([401, 404].includes(invalid.response.status))
  assert.equal(invalid.data.guests, undefined)
  assert.equal(invalid.response.headers.get('set-cookie'), null)
})

test('published test invitation codes are rejected unless the local-only opt-in is enabled', async () => {
  const isolated = await createTestRuntime({ bindings: { ALLOW_TEST_INVITATIONS: 'false' } })
  try {
    for (const code of ['MG-TEST01', 'MG-TEST02', 'MG-TEST03']) {
      const response = await isolated.runtime.dispatchFetch(`${ORIGIN}/api/guest/session`, {
        method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      })
      assert.ok([401, 404].includes(response.status), `${code} must not grant a production session`)
      assert.equal(response.headers.get('set-cookie'), null)
      await response.arrayBuffer()
      const legacy = await isolated.runtime.dispatchFetch(`${ORIGIN}/api/invitation?code=${code}`)
      assert.equal(legacy.status, 404)
      await legacy.arrayBuffer()
    }
  } finally {
    await isolated.runtime.dispose()
  }
})

test('login creates a private opaque twelve-hour server session, restore works, and logout revokes it', async () => {
  const session = await login(' mg-test02 ')
  assert.equal(session.guests.length, 2)
  assert.match(session.cookie, new RegExp(`^${COOKIE_NAME}=[a-f0-9]{64}$`))
  assert.match(session.setCookie, /HttpOnly/i)
  assert.match(session.setCookie, /SameSite=Strict/i)
  assert.match(session.setCookie, /Secure/i)
  assert.match(session.setCookie, /Path=\/api(?:;|$)/i)
  assert.match(session.setCookie, /Max-Age=43200/i)
  assert.ok(typeof session.csrfToken === 'string' && session.csrfToken.length >= 32)
  const row = await db.prepare('SELECT * FROM guest_sessions WHERE session_hash=?').bind(sessionHash(session)).first()
  assert.ok(row)
  const secondsRemaining = row.expires_at - Math.floor(Date.now() / 1000)
  assert.ok(secondsRemaining > 43100 && secondsRemaining <= 43201)
  assert.notEqual(row.session_hash, session.cookie.split('=')[1])
  const restored = await api('/api/guest/session', { session })
  assert.equal(restored.response.status, 200)
  assert.match(restored.response.headers.get('cache-control'), /no-store/)
  assert.equal(restored.data.csrfToken, session.csrfToken)
  assert.deepEqual(restored.data.guests.map(g => g.id), session.guests.map(g => g.id))
  const logout = await api('/api/guest/session', { session, method: 'DELETE' })
  assert.equal(logout.response.status, 200)
  assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/i)
  assert.equal((await api('/api/guest/session', { session })).response.status, 401)
  assert.equal(await db.prepare('SELECT session_hash FROM guest_sessions WHERE session_hash=?').bind(sessionHash(session)).first(), null)
})

test('expired sessions and invitations deactivated after login lose access on every request', async () => {
  const expired = await login('MG-TEST03')
  await db.prepare('UPDATE guest_sessions SET expires_at=? WHERE session_hash=?').bind(Math.floor(Date.now() / 1000) - 1, sessionHash(expired)).run()
  assert.equal((await api('/api/guest/session', { session: expired })).response.status, 401)
  assert.equal((await api('/api/guest/rsvp', { session: expired, body: attendance(expired) })).response.status, 401)
  const active = await login('MG-TEST03')
  await db.prepare("UPDATE invitations SET active=0 WHERE invitation_code='MG-TEST03'").run()
  try {
    assert.equal((await api('/api/guest/session', { session: active })).response.status, 401)
    assert.equal((await api('/api/guest/photos', { session: active })).response.status, 401)
    assert.equal((await upload(active)).status, 401)
    const deniedLogin = await api('/api/guest/session', { body: { code: 'MG-TEST03' }, headers: { 'CF-Connecting-IP': '198.51.100.191' } })
    assert.ok([401, 404].includes(deniedLogin.response.status))
  } finally {
    await db.prepare("UPDATE invitations SET active=1 WHERE invitation_code='MG-TEST03'").run()
  }
})

test('RSVP, photo upload and logout require CSRF; foreign origins cannot log in or mutate', async () => {
  const session = await login()
  const payload = attendance(session)
  for (const options of [
    { csrf: false },
    { session: { ...session, csrfToken: 'incorrect-token' } },
    { origin: 'https://attacker.test' },
    { headers: { 'Sec-Fetch-Site': 'cross-site' } },
    { headers: { 'Sec-Fetch-Site': 'same-site' } },
  ]) {
    const result = await api('/api/guest/rsvp', { session, body: payload, ...options })
    assert.equal(result.response.status, 403, JSON.stringify(options))
  }
  assert.equal((await api('/api/guest/session', { session, method: 'DELETE', csrf: false })).response.status, 403)
  assert.equal((await upload(session, { csrf: false })).status, 403)
  assert.equal((await upload(session, { origin: 'https://attacker.test' })).status, 403)
  const loginFromForeignOrigin = await api('/api/guest/session', { body: { code: 'MG-TEST01' }, origin: 'https://attacker.test' })
  assert.equal(loginFromForeignOrigin.response.status, 403)
  assert.equal((await api('/api/guest/session', { session })).response.status, 200, 'Rejected logout must leave the session usable')
})

test('repeated failed login attempts reach the shared per-IP limit', async () => {
  const headers = { 'CF-Connecting-IP': '198.51.100.200' }
  const results = await Promise.all(Array.from({ length: 20 }, () => api('/api/guest/session', { body: { code: 'MG-NOPE00' }, headers })))
  assert.ok(results.every(r => [401, 404].includes(r.response.status)), JSON.stringify(results.map(r => r.response.status)))
  const blocked = await api('/api/guest/session', { body: { code: 'MG-TEST01' }, headers })
  assert.equal(blocked.response.status, 429)
  assert.equal(blocked.response.headers.get('set-cookie'), null)
})

test('legacy lookup reserves its shared attempt budget before evaluating concurrent credentials', { timeout: 10000 }, async () => {
  const { default: worker } = await import('../worker/preview-wrapper.js')
  const originalStatements = new WeakMap()
  let lookupCount = 0, releaseLookups, signalOutcome
  const lookupGate = new Promise(resolve => { releaseLookups = resolve })
  const outcome = new Promise(resolve => { signalOutcome = resolve })
  const guardedDb = {
    prepare(sql) {
      let statement = db.prepare(sql)
      const wrapped = {
        bind(...values) { statement = statement.bind(...values); originalStatements.set(wrapped, statement); return wrapped },
        first(...args) { return statement.first(...args) },
        run(...args) { return statement.run(...args) },
        async all(...args) {
          if (/FROM invitations i\s/i.test(sql)) {
            lookupCount++
            if (lookupCount > 20) signalOutcome('too-many-lookups')
            // Hold credential results, making a check-after-response limiter's
            // race deterministic rather than depending on network scheduling.
            await lookupGate
          }
          return statement.all(...args)
        },
      }
      originalStatements.set(wrapped, statement)
      return wrapped
    },
    batch(statements) { return db.batch(statements.map(statement => originalStatements.get(statement) || statement)) },
  }
  const requests = Array.from({ length: 21 }, () => worker.fetch(new Request(`${ORIGIN}/api/invitation?code=MG-AAAAAA`, {
    headers: { 'CF-Connecting-IP': '198.51.100.209' },
  }), { margo_glenn_wedding_db: guardedDb, ALLOW_TEST_INVITATIONS: 'true' }, {}).then(response => {
    if (response.status === 429) signalOutcome('limited-before-lookup')
    return response
  }))
  try {
    assert.equal(await outcome, 'limited-before-lookup')
    assert.ok(lookupCount <= 20)
  } finally {
    releaseLookups()
    const responses = await Promise.all(requests)
    await Promise.all(responses.map(response => response.arrayBuffer()))
  }
})

test('malformed RSVP, guest scope and song payloads are rejected without side effects', async () => {
  const session = await login('MG-TEST02')
  const foreign = await login('MG-TEST03')
  const base = attendance(session)
  const before = (await db.prepare('SELECT COUNT(*) AS count FROM rsvp_responses').first()).count
  const invalid = [
    { ...base, guests: null },
    { ...base, guests: [] },
    { ...base, guests: [base.guests[0]] },
    { ...base, guests: [base.guests[0], base.guests[0]] },
    { ...base, guests: [base.guests[0], { ...base.guests[1], id: foreign.guests[0].id }] },
    { ...base, guests: [{ ...base.guests[0], dinner: { status: 'maybe' } }, base.guests[1]] },
    { ...base, guests: [{ ...base.guests[0], dietaryRequirements: { category: 'vegan' } }, base.guests[1]] },
    { ...base, guests: [{ ...base.guests[0], dietaryRequirements: null }, base.guests[1]] },
    { ...base, guests: [{ ...base.guests[0], dietaryRequirements: [{ category: 'other', otherText: '' }] }, base.guests[1]] },
    { ...base, email: 'not-an-email' },
    { ...base, song: 'a string' },
    { ...base, song: { title: '', artist: 'Artist' } },
    { ...base, song: { title: 'T'.repeat(121), artist: 'Artist' } },
    { ...base, song: { title: 'Song', artist: {} } },
  ]
  for (const payload of invalid) {
    const result = await api('/api/guest/rsvp', { session, body: payload })
    assert.equal(result.response.status, 400, JSON.stringify({ payload, response: result.data }))
  }
  const evening = await login('MG-TEST01')
  const wrongScope = attendance(evening)
  wrongScope.guests[0].dinner = { status: 'attending' }
  assert.equal((await api('/api/guest/rsvp', { session: evening, body: wrongScope })).response.status, 400)
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rsvp_responses').first()).count, before)
})

test('RSVP and one optional song persist per invitation with server-derived guest attribution', async () => {
  const session = await login('MG-TEST02')
  const payload = attendance(session, { email: 'photos@example.test', song: { title: 'Our song', artist: 'Our artist', requestedBy: 'Forged name', requested_by: 'Forged name' } })
  payload.guests[0].dinner.status = 'declined'
  payload.guests[0].dietaryRequirements = [{ category: 'vegan' }, { category: 'other', otherText: 'Geen noten' }]
  payload.guests[1].evening.status = 'declined'
  const result = await api('/api/guest/rsvp', { session, body: payload })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  const restored = (await api('/api/guest/session', { session })).data
  assert.equal(restored.email, 'photos@example.test')
  assert.equal(restored.song.title, 'Our song')
  assert.equal(restored.song.artist, 'Our artist')
  assert.deepEqual(restored.guests.map(g => [g.dinnerRsvpStatus, g.eveningRsvpStatus]), [['declined', 'attending'], ['attending', 'declined']])
  assert.ok(restored.guests.every(g => g.rsvpStatus === 'attending'))
  assert.deepEqual(restored.guests[0].dietaryRequirements.map(d => d.category).sort(), ['other', 'vegan'])
  const invitationId = (await db.prepare('SELECT invitation_id FROM guests WHERE id=?').bind(session.guests[0].id).first()).invitation_id
  const song = await db.prepare('SELECT * FROM invitation_song_requests WHERE invitation_id=?').bind(invitationId).first()
  assert.equal(song.requested_by, session.guests.map(g => g.name).join(' & '))
  const other = await login('MG-TEST01')
  assert.equal(other.song, null)
  assert.equal((await api('/api/guest/rsvp', { session: other, body: attendance(other, { song: null }) })).response.status, 200)
  assert.equal((await api('/api/guest/session', { session: other })).data.song, null)
  const edited = attendance(session, { song: { title: 'Changed song', artist: 'Changed artist' } })
  assert.equal((await api('/api/guest/rsvp', { session, body: edited })).response.status, 200)
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM invitation_song_requests WHERE invitation_id=?').bind(invitationId).first()).count, 1)
  assert.equal((await api('/api/guest/session', { session })).data.song.title, 'Changed song')
  assert.equal((await api('/api/guest/rsvp', { session, body: attendance(session, { song: null, attending: false }) })).response.status, 200)
  const removed = (await api('/api/guest/session', { session })).data
  assert.equal(removed.song, null)
  assert.ok(removed.guests.every(g => g.rsvpStatus === 'declined' && !g.dietaryRequirements.length))
})

test('concurrent RSVP song edits retain exactly one song row per invitation', async () => {
  const session = await login('MG-TEST02')
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => api('/api/guest/rsvp', {
    session, body: attendance(session, { song: { title: `Concurrent ${i}`, artist: 'Same invitation' } }),
  })))
  assert.ok(results.every(r => r.response.status === 200), JSON.stringify(results.map(r => r.data)))
  const invitationId = (await db.prepare('SELECT invitation_id FROM guests WHERE id=?').bind(session.guests[0].id).first()).invitation_id
  const songs = await db.prepare('SELECT * FROM invitation_song_requests WHERE invitation_id=?').bind(invitationId).all()
  assert.equal(songs.results.length, 1)
  assert.match(songs.results[0].title, /^Concurrent [0-5]$/)
  assert.equal(songs.results[0].requested_by, session.guests.map(g => g.name).join(' & '))
})

test('a song storage failure rolls back RSVP attendance, email, diets and history together', async () => {
  const session = await login('MG-TEST03')
  const beforeGuest = await db.prepare('SELECT * FROM guests WHERE id=?').bind(session.guests[0].id).first()
  const beforeHistory = (await db.prepare('SELECT COUNT(*) AS count FROM rsvp_responses WHERE guest_id=?').bind(session.guests[0].id).first()).count
  await db.prepare("CREATE TRIGGER test_reject_guest_song BEFORE INSERT ON invitation_song_requests BEGIN SELECT RAISE(ABORT, 'Injected song failure'); END").run()
  try {
    const payload = attendance(session, { email: 'rollback@example.test', song: { title: 'Must roll back', artist: 'Failure' } })
    payload.guests[0].dietaryRequirements = [{ category: 'vegan' }]
    const result = await api('/api/guest/rsvp', { session, body: payload })
    assert.equal(result.response.status, 500)
    assert.deepEqual(await db.prepare('SELECT * FROM guests WHERE id=?').bind(session.guests[0].id).first(), beforeGuest)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rsvp_responses WHERE guest_id=?').bind(session.guests[0].id).first()).count, beforeHistory)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM guest_dietary_requirements WHERE guest_id=?').bind(session.guests[0].id).first()).count, 0)
  } finally {
    await db.prepare('DROP TRIGGER test_reject_guest_song').run()
  }
})

test('photos have private cookie-only URLs and form a shared gallery for active authenticated guests', async () => {
  const first = await login('MG-TEST01')
  const other = await login('MG-TEST02')
  const response = await upload(first)
  const uploaded = await response.json()
  assert.equal(response.status, 200, JSON.stringify(uploaded))
  assert.match(uploaded.photo.url, /^\/api\/guest\/photo\?id=\d+$/)
  for (const session of [first, other]) {
    const gallery = await api('/api/guest/photos', { session })
    assert.equal(gallery.response.status, 200)
    assert.match(gallery.response.headers.get('cache-control'), /no-store/)
    assert.ok(gallery.data.photos.some(photo => photo.id === uploaded.photo.id))
    assert.ok(gallery.data.photos.every(photo => !/code=|session=|csrf|token=/i.test(photo.url)))
    const image = await raw(uploaded.photo.url, { session })
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('content-type'), 'image/png')
    assert.match(image.headers.get('cache-control'), /private/)
    assert.match(image.headers.get('cache-control'), /no-store/)
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PHOTO)
  }
  assert.equal((await raw(uploaded.photo.url)).status, 401)
  await db.prepare("UPDATE invitations SET active=0 WHERE invitation_code='MG-TEST02'").run()
  try {
    assert.equal((await raw(uploaded.photo.url, { session: other })).status, 401)
  } finally {
    await db.prepare("UPDATE invitations SET active=1 WHERE invitation_code='MG-TEST02'").run()
  }
})

test('photo MIME spoofing, mismatched magic and files over 10 MiB are rejected without storing bytes', async () => {
  const session = await login('MG-TEST03')
  const beforeQuota = (await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes
  const beforeKeys = (await bucket.list()).objects.map(object => object.key).sort()
  const tooLarge = Buffer.alloc(10 * 1024 * 1024 + 1)
  PHOTO.copy(tooLarge)
  for (const options of [
    { type: 'text/plain', contents: Buffer.from('not a photo') },
    { type: 'image/png', contents: Buffer.from('<svg><script>alert(1)</script></svg>') },
    { type: 'image/jpeg', contents: PHOTO },
    { type: 'image/png', contents: Buffer.alloc(0) },
    { type: 'image/png', contents: tooLarge },
  ]) {
    const response = await upload(session, options)
    assert.equal(response.status, 400, JSON.stringify(await response.json()))
  }
  assert.equal((await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes, beforeQuota)
  assert.deepEqual((await bucket.list()).objects.map(object => object.key).sort(), beforeKeys)
})

test('concurrent authenticated uploads enforce the shared 10 GB limit and expose a full-gallery state', async () => {
  const session = await login('MG-TEST01')
  const beforeCount = (await db.prepare('SELECT COUNT(*) AS count FROM wedding_photos').first()).count
  await db.prepare('UPDATE wedding_photo_quota SET used_bytes=? WHERE id=1').bind(QUOTA_BYTES - 2 * PHOTO.byteLength).run()
  try {
    const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => upload(session, { filename: `quota-${i}.png` })))
    const results = await Promise.all(responses.map(async response => ({ status: response.status, data: await response.json() })))
    assert.equal(results.filter(r => r.status === 200).length, 2, JSON.stringify(results))
    assert.equal(results.filter(r => r.status === 507 && r.data.quotaReached).length, 4)
    assert.equal((await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes, QUOTA_BYTES)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM wedding_photos').first()).count, beforeCount + 2)
    const gallery = (await api('/api/guest/photos', { session })).data
    assert.equal(gallery.quota.limitBytes, QUOTA_BYTES)
    assert.equal(gallery.quota.remainingBytes, 0)
    assert.equal(gallery.quota.uploadAvailable, false)
  } finally {
    const actual = await db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM wedding_photos').first()
    await db.prepare('UPDATE wedding_photo_quota SET used_bytes=? WHERE id=1').bind(actual.bytes).run()
  }
})

test('failed authenticated photo metadata insert deletes its R2 object and refunds the reservation', async () => {
  const session = await login('MG-TEST01')
  const beforeQuota = (await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes
  const beforeKeys = (await bucket.list()).objects.map(object => object.key).sort()
  await db.prepare("CREATE TRIGGER test_reject_portal_photo BEFORE INSERT ON wedding_photos BEGIN SELECT RAISE(ABORT, 'Injected portal metadata failure'); END").run()
  try {
    const response = await upload(session)
    assert.equal(response.status, 500)
    await response.arrayBuffer()
    assert.deepEqual((await bucket.list()).objects.map(object => object.key).sort(), beforeKeys)
    assert.equal((await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes, beforeQuota)
  } finally {
    await db.prepare('DROP TRIGGER test_reject_portal_photo').run()
  }
})

test('separate browser sessions share the thirty-upload rate limit for their invitation', async () => {
  const first = await login('MG-TEST03')
  const second = await login('MG-TEST03')
  // This invitation's earlier attempts only rejected invalid bytes; reset the
  // rate fixture so this test measures exactly one fresh fifteen-minute window.
  await db.prepare("DELETE FROM guest_rate_limits WHERE scope LIKE '%upload%' OR scope LIKE '%photo%'").run()
  const responses = await Promise.all(Array.from({ length: 32 }, (_, i) => upload(i % 2 ? first : second, { filename: `rate-${i}.png` })))
  const statuses = responses.map(response => response.status)
  await Promise.all(responses.map(response => response.arrayBuffer()))
  assert.equal(statuses.filter(status => status === 200).length, 30, JSON.stringify(statuses))
  assert.equal(statuses.filter(status => status === 429).length, 2, JSON.stringify(statuses))
})
