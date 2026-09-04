import { prepareRsvpChanges } from './rsvp.js'
import { HttpError, LOGIN_LIMIT, RATE_WINDOW_SECONDS, consumeRateLimit, limitedLoginResponse,
  loginKey, normalizeInvitationCode, randomToken, readLimitedJson, sha256, unixNow } from './guest-security.js'
import { photoQuota, photoUploadAllowed, readPhotoForm, storeWeddingPhoto, validatePhoto } from './photo-storage.js'
import { handleGuestExtrasApi } from './guest-extras.js'

const COOKIE_NAME = 'wedding_guest_session'
const SESSION_SECONDS = 12 * 60 * 60

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', ...extraHeaders,
  } })
}

function cookie(request, value, maxAge = SESSION_SECONDS) {
  const url = new URL(request.url)
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  return `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/api; HttpOnly; SameSite=Strict${localHttp ? '' : '; Secure'}`
}

function sessionToken(request) {
  const cookies = (request.headers.get('cookie') || '').split(';')
  const match = cookies.map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))
  const token = match?.slice(COOKIE_NAME.length + 1)
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : null
}

function checkOrigin(request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  if ((origin && origin !== new URL(request.url).origin) ||
      (fetchSite && !['same-origin', 'none'].includes(fetchSite)) ||
      (isWrite && !origin)) throw new HttpError('Ongeldige aanvraag.', 403)
}

async function authenticate(request, env) {
  const raw = sessionToken(request)
  if (!raw) return null
  const sessionHash = await sha256(raw)
  const db = env.margo_glenn_wedding_db, now = unixNow()
  await db.prepare('DELETE FROM guest_sessions WHERE expires_at <= ?').bind(now).run()
  const session = await db.prepare(`SELECT s.session_hash,s.invitation_id,s.csrf_token,s.expires_at,i.invitation_code
    FROM guest_sessions s JOIN invitations i ON i.id=s.invitation_id
    WHERE s.session_hash=? AND s.expires_at>? AND i.active=1 LIMIT 1`).bind(sessionHash, now).first()
  if (!session || !normalizeInvitationCode(session.invitation_code, env)) return null
  return session
}

function checkCsrf(request, session) {
  const supplied = request.headers.get('x-csrf-token')
  if (!supplied || supplied !== session.csrf_token) throw new HttpError('Je sessie kon niet worden bevestigd. Vernieuw de pagina.', 403)
}

async function sessionData(db, invitationId, csrfToken) {
  const [guestResult, dietaryResult, song] = await Promise.all([
    db.prepare(`SELECT id,name,email,invited_to_dinner,invited_to_evening,rsvp_status,dinner_rsvp_status,evening_rsvp_status
      FROM guests WHERE invitation_id=? ORDER BY id`).bind(invitationId).all(),
    db.prepare(`SELECT id,guest_id,category,other_text FROM guest_dietary_requirements
      WHERE guest_id IN (SELECT id FROM guests WHERE invitation_id=?) ORDER BY guest_id,id`).bind(invitationId).all(),
    db.prepare('SELECT title,artist,requested_by,updated_at FROM invitation_song_requests WHERE invitation_id=?').bind(invitationId).first(),
  ])
  const guests = guestResult.results.map(guest => {
    const seen = new Set()
    const dietaryRequirements = dietaryResult.results.filter(item => item.guest_id === guest.id).filter(item => {
      if (seen.has(item.category)) return false
      seen.add(item.category)
      return true
    }).map(item => ({ id: item.id, category: item.category, otherText: item.other_text }))
    return { id: guest.id, name: guest.name, invitedToDinner: guest.invited_to_dinner === 1,
      invitedToEvening: guest.invited_to_evening === 1, rsvpStatus: guest.rsvp_status,
      dinnerRsvpStatus: guest.dinner_rsvp_status, eveningRsvpStatus: guest.evening_rsvp_status, dietaryRequirements }
  })
  return { ok: true, guests, email: guestResult.results.find(guest => guest.email)?.email || '',
    song: song ? { title: song.title, artist: song.artist, requestedBy: song.requested_by, updatedAt: song.updated_at } : null,
    csrfToken }
}

async function login(request, env) {
  const db = env.margo_glenn_wedding_db
  if (!await consumeRateLimit(db, 'login', await loginKey(request), LOGIN_LIMIT)) return limitedLoginResponse()
  const body = await readLimitedJson(request, 4096)
  const code = normalizeInvitationCode(body.code, env)
  const invalid = () => json({ ok: false, error: 'Deze uitnodiging kon niet worden gevonden. Controleer je code.' }, 401)
  if (!code) return invalid()
  const invitation = await db.prepare(`SELECT id FROM invitations WHERE invitation_code=? AND active=1
    AND EXISTS (SELECT 1 FROM guests WHERE invitation_id=invitations.id) LIMIT 1`).bind(code).first()
  if (!invitation) return invalid()

  const rawToken = randomToken(), csrfToken = randomToken(), now = unixNow()
  const hash = await sha256(rawToken), oldToken = sessionToken(request)
  const statements = [db.prepare('DELETE FROM guest_sessions WHERE expires_at <= ?').bind(now)]
  if (oldToken) statements.push(db.prepare('DELETE FROM guest_sessions WHERE session_hash=?').bind(await sha256(oldToken)))
  // Bound retained sessions for an invitation, while supporting several devices.
  statements.push(db.prepare(`DELETE FROM guest_sessions WHERE invitation_id=? AND session_hash NOT IN
    (SELECT session_hash FROM guest_sessions WHERE invitation_id=? ORDER BY created_at DESC,rowid DESC LIMIT 19)`)
    .bind(invitation.id, invitation.id))
  statements.push(db.prepare(`INSERT INTO guest_sessions (session_hash,invitation_id,csrf_token,expires_at,created_at)
    SELECT ?,id,?,?,? FROM invitations WHERE id=? AND active=1`).bind(hash, csrfToken, now + SESSION_SECONDS, now, invitation.id))
  const results = await db.batch(statements)
  if (results.at(-1).meta.changes !== 1) return invalid()
  const data = await sessionData(db, invitation.id, csrfToken)
  return json(data, 200, { 'Set-Cookie': cookie(request, rawToken) })
}

async function saveRsvp(request, env, session) {
  const body = await readLimitedJson(request)
  const db = env.margo_glenn_wedding_db
  const { statements, guests } = await prepareRsvpChanges(db, session.invitation_id, body)
  if (body.song !== undefined) {
    if (body.song === null) {
      statements.push(db.prepare('DELETE FROM invitation_song_requests WHERE invitation_id=?').bind(session.invitation_id))
    } else {
      const title = typeof body.song?.title === 'string' ? body.song.title.trim() : ''
      const artist = typeof body.song?.artist === 'string' ? body.song.artist.trim() : ''
      if (!body.song || Array.isArray(body.song) || !title || !artist || title.length > 120 || artist.length > 120) {
        throw new HttpError('Vul een geldige titel en artiest in, of laat de muziekwens leeg.')
      }
      const requestedBy = guests.map(guest => guest.name).join(' & ')
      statements.push(db.prepare(`INSERT INTO invitation_song_requests (invitation_id,title,artist,requested_by)
        VALUES (?,?,?,?) ON CONFLICT(invitation_id) DO UPDATE SET title=excluded.title,artist=excluded.artist,
        requested_by=excluded.requested_by,updated_at=CURRENT_TIMESTAMP`).bind(session.invitation_id, title, artist, requestedBy))
    }
  }
  // D1 rolls the complete batch back if any song or RSVP statement fails.
  await db.batch(statements)
  return json(await sessionData(db, session.invitation_id, session.csrf_token))
}

async function listPhotos(env) {
  if (!env.WEDDING_PHOTOS) throw new HttpError('Fotodelen is nog niet geconfigureerd.', 503)
  const db = env.margo_glenn_wedding_db
  const [photos, quota] = await Promise.all([
    db.prepare(`SELECT id,original_filename,uploaded_at FROM wedding_photos WHERE approved=1
      ORDER BY uploaded_at DESC,id DESC`).all(),
    db.prepare('SELECT used_bytes FROM wedding_photo_quota WHERE id=1').first(),
  ])
  return json({ ok: true, photos: photos.results.map(photo => ({ id: photo.id, filename: photo.original_filename,
    uploadedAt: photo.uploaded_at, url: `/api/guest/photo?id=${encodeURIComponent(photo.id)}` })),
  quota: photoQuota(Number(quota?.used_bytes || 0)) })
}

async function uploadPhoto(request, env, session) {
  if (!env.WEDDING_PHOTOS) throw new HttpError('Fotodelen is nog niet geconfigureerd.', 503)
  if (!await photoUploadAllowed(env, session.invitation_id)) {
    return json({ ok: false, error: 'Je hebt al heel wat foto’s gedeeld. Probeer over een kwartier opnieuw.' }, 429,
      { 'Retry-After': String(RATE_WINDOW_SECONDS) })
  }
  const form = await readPhotoForm(request)
  if (Array.from(form.keys()).some(key => key !== 'photo') || form.getAll('photo').length !== 1) {
    throw new HttpError('Kies één foto per upload.')
  }
  const file = form.get('photo')
  await validatePhoto(file)
  const photo = await storeWeddingPhoto(file, { id: session.invitation_id }, env)
  return json({ ok: true, photo: { ...photo, url: `/api/guest/photo?id=${encodeURIComponent(photo.id)}` } })
}

async function getPhoto(request, env) {
  if (!env.WEDDING_PHOTOS) throw new HttpError('Fotodelen is nog niet geconfigureerd.', 503)
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError('Foto niet gevonden.', 404)
  const photo = await env.margo_glenn_wedding_db.prepare(`SELECT storage_key,mime_type FROM wedding_photos
    WHERE id=? AND approved=1 LIMIT 1`).bind(id).first()
  if (!photo) throw new HttpError('Foto niet gevonden.', 404)
  const object = await env.WEDDING_PHOTOS.get(photo.storage_key)
  if (!object) throw new HttpError('Foto niet gevonden.', 404)
  return new Response(object.body, { headers: {
    'Content-Type': photo.mime_type, 'Content-Length': String(object.size),
    'ETag': object.httpEtag, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  } })
}

export async function handleGuestApi(request, env) {
  try {
    checkOrigin(request)
    const path = new URL(request.url).pathname
    if (path === '/api/guest/session' && request.method === 'POST') return await login(request, env)
    const session = await authenticate(request, env)
    if (!session) return json({ ok: false, error: 'Meld je aan met je uitnodigingscode.' }, 401,
      { 'Set-Cookie': cookie(request, '', 0) })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) checkCsrf(request, session)

    const extrasResponse = await handleGuestExtrasApi(request, env, session)
    if (extrasResponse) return extrasResponse

    if (path === '/api/guest/session' && request.method === 'GET') return json(await sessionData(env.margo_glenn_wedding_db, session.invitation_id, session.csrf_token))
    if (path === '/api/guest/session' && request.method === 'DELETE') {
      await env.margo_glenn_wedding_db.prepare('DELETE FROM guest_sessions WHERE session_hash=?').bind(session.session_hash).run()
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) })
    }
    if (path === '/api/guest/rsvp' && request.method === 'POST') return await saveRsvp(request, env, session)
    if (path === '/api/guest/photos' && request.method === 'GET') return await listPhotos(env)
    if (path === '/api/guest/photos' && request.method === 'POST') return await uploadPhoto(request, env, session)
    if (path === '/api/guest/photo' && request.method === 'GET') return await getPhoto(request, env)
    return json({ ok: false, error: 'Niet gevonden.' }, 404)
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500 && status !== 507) console.error('Guest API failed:', error)
    return json({ ok: false, error: status === 500 ? 'Dat is niet gelukt. Probeer het opnieuw.' : error.message,
      ...(error.quotaReached ? { quotaReached: true } : {}) }, status)
  }
}
