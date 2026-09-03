import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { FormData } from 'miniflare'
import { createTestRuntime } from './runtime.js'
import worker from '../worker/preview-wrapper.js'

const ORIGIN = 'https://wedding.test'
const QUOTA_BYTES = 10_000_000_000
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6x1sAAAAASUVORK5CYII=', 'base64')
let runtime, db, bucket

before(async () => {
  ({ runtime, db, bucket } = await createTestRuntime())
})
after(async () => { await runtime?.dispose() })

async function api(path, { body, ip, ...options } = {}) {
  const headers = new Headers(options.headers)
  if (ip) headers.set('CF-Connecting-IP', ip)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await runtime.dispatchFetch(`${ORIGIN}${path}`, {
    ...options,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body), method: options.method || 'POST' } : {}),
  })
  return { response, data: await response.json() }
}

function upload(code = 'MG-TEST01', filename = 'wedding.png', type = 'image/png', contents = PHOTO) {
  const form = new FormData()
  form.set('code', code)
  form.set('photo', new File([contents], filename, { type }))
  return runtime.dispatchFetch(`${ORIGIN}/api/photos`, { method: 'POST', body: form })
}

test('invitation lookup normalizes valid codes and rejects unknown/inactive invitations', async () => {
  const valid = await api('/api/invitation?code=%20mg-test02%20')
  assert.equal(valid.response.status, 200)
  assert.equal(valid.data.guests.length, 2)
  assert.ok(valid.data.guests.every(g => g.invitedToDinner && g.invitedToEvening))
  assert.match(valid.response.headers.get('cache-control'), /no-store/)
  assert.equal((await api('/api/invitation?code=invalid')).response.status, 404)
  assert.equal((await api('/api/invitation?code=MG-ZZZZZZ')).response.status, 404)
  await db.prepare("UPDATE invitations SET active=0 WHERE invitation_code='MG-TEST03'").run()
  try {
    assert.equal((await api('/api/invitation?code=MG-TEST03')).response.status, 404)
  } finally {
    await db.prepare("UPDATE invitations SET active=1 WHERE invitation_code='MG-TEST03'").run()
  }
})

test('group RSVP persists separate parts, optional email and one set of diet preferences per guest', async () => {
  const invitation = (await api('/api/invitation?code=MG-TEST02')).data
  const [first, second] = invitation.guests
  const result = await api('/api/rsvp', {
    body: {
      code: 'MG-TEST02',
      email: 'guest@example.test',
      guests: [
        { id: first.id, dinner: { status: 'declined' }, evening: { status: 'attending' }, dietaryRequirements: [{ category: 'vegan' }, { category: 'other', otherText: 'Geen noten' }] },
        { id: second.id, dinner: { status: 'attending' }, evening: { status: 'declined' }, dietaryRequirements: [] },
      ],
    },
  })
  assert.equal(result.response.status, 200, JSON.stringify(result.data))
  const saved = (await api('/api/invitation?code=MG-TEST02')).data
  assert.equal(saved.email, 'guest@example.test')
  assert.deepEqual(saved.guests.map(g => [g.dinnerRsvpStatus, g.eveningRsvpStatus]), [['declined', 'attending'], ['attending', 'declined']])
  assert.ok(saved.guests.every(g => g.rsvpStatus === 'attending'))
  assert.deepEqual(saved.guests[0].dietaryRequirements.map(d => d.category).sort(), ['other', 'vegan'])
  assert.equal(saved.guests[0].dietaryRequirements.find(d => d.category === 'other').otherText, 'Geen noten')
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM guest_dietary_requirements WHERE guest_id=?').bind(first.id).first()).count, 2)
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rsvp_responses WHERE guest_id IN (?,?)').bind(first.id, second.id).first()).count, 4)
})

test('RSVP rejects another invitation’s guest and does not mutate their attendance', async () => {
  const guest = (await api('/api/invitation?code=MG-TEST03')).data.guests[0]
  const result = await api('/api/rsvp', { body: { code: 'MG-TEST01', guests: [{ id: guest.id, dinner: { status: 'attending' }, evening: { status: 'attending' }, dietaryRequirements: [] }] } })
  assert.equal(result.response.status, 400)
  const saved = (await api('/api/invitation?code=MG-TEST03')).data.guests[0]
  assert.equal(saved.dinnerRsvpStatus, 'pending')
  assert.equal(saved.eveningRsvpStatus, 'pending')
})

test('single evening guest can RSVP without email; uninvited parts and incomplete groups are rejected', async () => {
  const guest = (await api('/api/invitation?code=MG-TEST01')).data.guests[0]
  const valid = await api('/api/rsvp', { body: { code: 'MG-TEST01', guests: [{ id: guest.id, evening: { status: 'attending' }, dietaryRequirements: [{ category: 'vegetarian' }] }] } })
  assert.equal(valid.response.status, 200, JSON.stringify(valid.data))
  assert.equal((await api('/api/invitation?code=MG-TEST01')).data.email, '')
  const invalid = await api('/api/rsvp', { body: { code: 'MG-TEST01', guests: [{ id: guest.id, dinner: { status: 'attending' }, evening: { status: 'attending' }, dietaryRequirements: [] }] } })
  assert.equal(invalid.response.status, 400)
  const group = (await api('/api/invitation?code=MG-TEST02')).data.guests
  const incomplete = await api('/api/rsvp', { body: { code: 'MG-TEST02', guests: [{ id: group[0].id, dinner: { status: 'attending' }, evening: { status: 'attending' }, dietaryRequirements: [] }] } })
  assert.equal(incomplete.response.status, 400)
})

test('music suggestions persist and duplicate titles/artists are matched case-insensitively', async () => {
  const first = await api('/api/music/suggestions', { ip: '203.0.113.10', body: { title: 'Wedding Song', artist: 'Test Artist', suggestedBy: 'Test Guest' } })
  assert.equal(first.response.status, 200)
  const duplicate = await api('/api/music/suggestions', { ip: '203.0.113.11', body: { title: 'wedding song', artist: 'TEST ARTIST' } })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.data.duplicate, true)
  const songs = (await api('/api/music/suggestions')).data.suggestions
  assert.equal(songs.filter(s => s.title.toLowerCase() === 'wedding song').length, 1)
  assert.equal(songs.find(s => s.title === 'Wedding Song').suggested_by, 'Test Guest')
})

test('parallel music requests enforce the eight-per-hour IP limit', async () => {
  const requests = Array.from({ length: 12 }, (_, i) => api('/api/music/suggestions', { ip: '203.0.113.12', body: { title: `Concurrent song ${i}`, artist: 'Concurrency test' } }))
  const results = await Promise.all(requests)
  assert.equal(results.filter(r => r.response.status === 200 && !r.data.duplicate).length, 8, JSON.stringify(results.map(r => ({ status: r.response.status, data: r.data }))))
  assert.equal(results.filter(r => r.response.status === 429).length, 4)
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM music_suggestions WHERE source_ip=?').bind('203.0.113.12').first()).count, 8)
})

test('parallel duplicate music requests create only one suggestion', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => api('/api/music/suggestions', { ip: `203.0.113.${30 + i}`, body: { title: 'One concurrent song', artist: 'One concurrent artist' } })))
  assert.ok(results.every(r => r.response.status === 200))
  assert.equal(results.filter(r => r.data.duplicate).length, 4)
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM music_suggestions WHERE title='One concurrent song'").first()).count, 1)
})

test('photos upload to R2, round-trip through the private API, and stay scoped to their invitation', async () => {
  const uploaded = await upload()
  const data = await uploaded.json()
  assert.equal(uploaded.status, 200, JSON.stringify(data))
  const listed = await api('/api/photos?code=MG-TEST01')
  assert.ok(listed.data.photos.some(photo => photo.id === data.photo.id))
  const image = await runtime.dispatchFetch(`${ORIGIN}${data.photo.url}`)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/png')
  assert.match(image.headers.get('cache-control'), /no-store/)
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PHOTO)
  const other = await api('/api/photos?code=MG-TEST02')
  assert.equal(other.data.photos.length, 0)
  assert.equal((await runtime.dispatchFetch(`${ORIGIN}/api/photo?id=${data.photo.id}&code=MG-TEST02`)).status, 404)
  assert.equal((await runtime.dispatchFetch(`${ORIGIN}/api/photo?id=${data.photo.id}`)).status, 404)
  assert.equal((await upload('MG-ZZZZZZ')).status, 404)
})

test('unsupported MIME types and photos exceeding 10 MB are rejected before reserving quota', async () => {
  const beforeQuota = (await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes
  const beforeKeys = (await bucket.list()).objects.map(object => object.key).sort()
  const wrongType = await upload('MG-TEST01', 'document.txt', 'text/plain', Buffer.from('This is not a photo.'))
  assert.equal(wrongType.status, 400)
  assert.match((await wrongType.json()).error, /JPG|PNG|WebP/)
  const tooLarge = await upload('MG-TEST01', 'large.png', 'image/png', Buffer.alloc(10 * 1024 * 1024 + 1))
  assert.equal(tooLarge.status, 400)
  assert.match((await tooLarge.json()).error, /10 MB/)
  assert.equal((await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes, beforeQuota)
  assert.deepEqual((await bucket.list()).objects.map(object => object.key).sort(), beforeKeys)
})

test('parallel photo uploads cannot exceed the shared 10 GB quota', async () => {
  const previous = await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()
  const photoCount = (await db.prepare('SELECT COUNT(*) AS count FROM wedding_photos').first()).count
  await db.prepare('UPDATE wedding_photo_quota SET used_bytes=? WHERE id=1').bind(QUOTA_BYTES - PHOTO.byteLength * 2).run()
  try {
    const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => upload('MG-TEST01', `parallel-${i}.png`)))
    const results = await Promise.all(responses.map(async response => ({ status: response.status, data: await response.json() })))
    assert.equal(results.filter(r => r.status === 200).length, 2, JSON.stringify(results))
    assert.equal(results.filter(r => r.status === 507 && r.data.quotaReached).length, 4)
    assert.equal((await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes, QUOTA_BYTES)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM wedding_photos').first()).count, photoCount + 2)
    const quota = (await api('/api/photos?code=MG-TEST01')).data.quota
    assert.equal(quota.limitBytes, QUOTA_BYTES)
    assert.equal(quota.remainingBytes, 0)
    assert.equal(quota.uploadAvailable, false)
  } finally {
    const actual = await db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM wedding_photos').first()
    await db.prepare('UPDATE wedding_photo_quota SET used_bytes=? WHERE id=1').bind(actual?.bytes ?? previous.used_bytes).run()
  }
})

test('failed photo metadata insert removes the uploaded R2 object and refunds its quota reservation', async () => {
  const beforeQuota = (await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes
  const beforeKeys = (await bucket.list()).objects.map(object => object.key).sort()
  await db.prepare("CREATE TRIGGER test_reject_photo BEFORE INSERT ON wedding_photos BEGIN SELECT RAISE(ABORT, 'Injected metadata failure'); END").run()
  try {
    const response = await upload('MG-TEST01', 'metadata-failure.png')
    assert.equal(response.status, 500)
    await response.arrayBuffer()
    assert.deepEqual((await bucket.list()).objects.map(object => object.key).sort(), beforeKeys)
    assert.equal((await db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first()).used_bytes, beforeQuota)
  } finally {
    await db.prepare('DROP TRIGGER test_reject_photo').run()
  }
})

// For admin mutation tests only, explicitly supply a trusted platform identity.
// This does not simulate or claim to verify Cloudflare Access JWT authentication.
async function authenticatedAdmin(path, body) {
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, {
    ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  }), { margo_glenn_wedding_db: db }, {
    access: { getIdentity: async () => ({ email: 'admin@example.test' }) },
  })
  return { response, data: await response.json() }
}

test('admin handlers create scoped guests, expose persisted RSVP history and deactivate invitations', async () => {
  assert.equal((await api('/admin/api/dashboard')).response.status, 401)
  const created = await authenticatedAdmin('/admin/api/invitation/create', {
    guests: [
      { name: 'Dinner guest', invitedToDinner: true, invitedToEvening: false },
      { name: 'Evening guest', invitedToDinner: false, invitedToEvening: true },
    ],
  })
  assert.equal(created.response.status, 200, JSON.stringify(created.data))
  assert.match(created.data.invitation.invitationCode, /^MG-[A-Z0-9]{6}$/)
  const code = created.data.invitation.invitationCode
  const invitation = (await api(`/api/invitation?code=${code}`)).data
  assert.deepEqual(invitation.guests.map(g => [g.name, g.invitedToDinner, g.invitedToEvening]), [['Dinner guest', true, false], ['Evening guest', false, true]])
  const dashboard = await authenticatedAdmin('/admin/api/dashboard')
  assert.equal(dashboard.response.status, 200)
  assert.ok(dashboard.data.invitations.some(i => i.invitationCode === code))
  const answered = dashboard.data.invitations.find(i => i.invitationCode === 'MG-TEST02')
  assert.ok(answered.guests.every(g => g.rsvpHistory.length === 2 && g.rsvpHistory.every(r => r.createdAt)))
  const toggle = await authenticatedAdmin('/admin/api/invitation/toggle', { id: created.data.invitation.id, active: false })
  assert.equal(toggle.response.status, 200)
  assert.equal((await api(`/api/invitation?code=${code}`)).response.status, 404)
})

test('failed second guest insert rolls back both the invitation and first guest', async () => {
  const beforeInvitations = (await db.prepare('SELECT COUNT(*) AS count FROM invitations').first()).count
  const beforeGuests = (await db.prepare('SELECT COUNT(*) AS count FROM guests').first()).count
  await db.prepare("CREATE TRIGGER test_reject_guest BEFORE INSERT ON guests WHEN NEW.name='Rejected second guest' BEGIN SELECT RAISE(ABORT, 'Injected guest failure'); END").run()
  try {
    const result = await authenticatedAdmin('/admin/api/invitation/create', {
      guests: [
        { name: 'Valid first guest', invitedToDinner: true, invitedToEvening: false },
        { name: 'Rejected second guest', invitedToDinner: false, invitedToEvening: true },
      ],
    })
    assert.equal(result.response.status, 500)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM invitations').first()).count, beforeInvitations)
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM guests').first()).count, beforeGuests)
  } finally {
    await db.prepare('DROP TRIGGER test_reject_guest').run()
  }
})
