import legacyWorker from './index.js'
import { getAccessIdentity } from './access.js'
import { handleGuestApi } from './guest-api.js'
import { LOGIN_LIMIT, limitedLoginResponse, loginKey, normalizeInvitationCode, refundRateLimit, reserveRateLimit } from './guest-security.js'
import { PHOTO_QUOTA_BYTES, photoUploadAllowed, readPhotoForm, storeWeddingPhoto, validatePhoto } from './photo-storage.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/guest/')) return handleGuestApi(request, env)

    // Preview endpoints retain code-based access, with the same failed-code budget.
    // Successful list, upload and image requests do not spend login attempts.
    const guardedPaths = ['/api/invitation', '/api/rsvp', '/api/photos', '/api/photo']
    if (guardedPaths.includes(url.pathname)) {
      return guardLegacyInvitation(request, env, () => {
        if (url.pathname === '/api/invitation' && request.method === 'GET') return handlePublicInvitation(request, env)
        if (url.pathname === '/api/photos' && request.method === 'GET') return handlePublicPhotoList(request, env)
        if (url.pathname === '/api/photos' && request.method === 'POST') return handlePublicPhotoUpload(request, env)
        if (url.pathname === '/api/photo' && request.method === 'GET') return handlePublicPhoto(request, env)
        return legacyWorker.fetch(request, env, ctx)
      })
    }

    if (url.pathname === '/api/music/suggestions' && (request.method === 'GET' || request.method === 'POST')) {
      return request.method === 'GET' ? handlePublicMusicList(env) : handlePublicMusicCreate(request, env)
    }

    if (!url.pathname.startsWith('/admin/api/')) {
      return legacyWorker.fetch(request, env, ctx)
    }

    const identity = await getAccessIdentity(request, env, ctx)
    if (!identity) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (url.pathname === '/admin/api/health' && request.method === 'GET') {
      return Response.json({ ok: true, authenticated: true, email: identity.email ?? null })
    }

    if (url.pathname === '/admin/api/dashboard' && request.method === 'GET') {
      return handleAdminDashboard(env, identity)
    }

    if (url.pathname === '/admin/api/invitation/create' && request.method === 'POST') {
      return handleAdminInvitationCreate(request, env, identity)
    }

    if (url.pathname === '/admin/api/invitation/toggle' && request.method === 'POST') {
      return handleAdminInvitationToggle(request, env, identity)
    }

    return Response.json({ ok: false, error: 'Not found' }, { status: 404 })
  }
}

async function guardLegacyInvitation(request, env, handler) {
  try {
    const db = env.margo_glenn_wedding_db, keyHash = await loginKey(request)
    const windowStart = await reserveRateLimit(db, 'login', keyHash, LOGIN_LIMIT)
    if (windowStart === null) return limitedLoginResponse()
    const response = await handler()
    // Reserve before checking credentials: even concurrent guesses are bounded.
    // Successful reads/uploads refund the attempt and keep the preview usable.
    if (response.status !== 404 && response.status !== 401) await refundRateLimit(db, 'login', keyHash, windowStart)
    return response
  } catch (error) {
    console.error('Preview invitation request failed:', error)
    return Response.json({ ok: false, error: 'Aanvraag kon niet worden verwerkt.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

async function handlePublicInvitation(request, env) {
  const code = normalizeInvitationCode(new URL(request.url).searchParams.get('code'), env)

  if (!code) {
    return Response.json({ ok: false, error: 'Invalid invitation' }, { status: 404 })
  }

  try {
    const result = await withTimeout(
      env.margo_glenn_wedding_db.prepare(`
        SELECT
          i.id AS invitation_id,
          g.id AS guest_id,
          g.name,
          g.email,
          g.invited_to_dinner,
          g.invited_to_evening,
          g.rsvp_status,
          g.dinner_rsvp_status,
          g.evening_rsvp_status,
          d.id AS dietary_id,
          d.event_part AS dietary_event_part,
          d.category AS dietary_category,
          d.other_type AS dietary_other_type,
          d.other_text AS dietary_other_text
        FROM invitations i
        INNER JOIN guests g ON g.invitation_id = i.id
        LEFT JOIN guest_dietary_requirements d ON d.guest_id = g.id
        WHERE i.invitation_code = ?
          AND i.active = 1
        ORDER BY g.id, d.id
      `).bind(code).all(),
      5000
    )

    if (!result.results.length) {
      return Response.json({ ok: false, error: 'Invalid invitation' }, { status: 404 })
    }

    const guestMap = new Map()

    for (const row of result.results) {
      let guest = guestMap.get(row.guest_id)
      if (!guest) {
        guest = {
          id: row.guest_id,
          name: row.name,
          email: row.email || '',
          invitedToDinner: row.invited_to_dinner === 1,
          invitedToEvening: row.invited_to_evening === 1,
          rsvpStatus: row.rsvp_status,
          dinnerRsvpStatus: row.dinner_rsvp_status,
          eveningRsvpStatus: row.evening_rsvp_status,
          dietaryRequirements: []
        }
        guestMap.set(row.guest_id, guest)
      }

      if (row.dietary_id != null && !guest.dietaryRequirements.some((item) => item.category === row.dietary_category)) {
        guest.dietaryRequirements.push({
          id: row.dietary_id,
          eventPart: row.dietary_event_part,
          category: row.dietary_category,
          otherType: row.dietary_other_type,
          otherText: row.dietary_other_text
        })
      }
    }

    const guests = Array.from(guestMap.values())
    const email = guests.find((guest) => guest.email)?.email || ''

    return new Response(JSON.stringify({ ok: true, email, guests }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    })
  } catch (error) {
    console.error('Public invitation lookup failed:', error)

    return Response.json(
      { ok: false, error: 'Unable to process invitation' },
      { status: 500 }
    )
  }
}

async function handlePublicMusicList(env) {
  try {
    const result = await env.margo_glenn_wedding_db.prepare(`
      SELECT id, title, artist, suggested_by, created_at
      FROM music_suggestions
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `).all()

    return Response.json({ ok: true, suggestions: result.results })
  } catch (error) {
    console.error('Music suggestion list failed:', error)
    return Response.json({ ok: false, error: 'Muzieksuggesties konden niet worden geladen.' }, { status: 500 })
  }
}

async function handlePublicMusicCreate(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const artist = typeof body?.artist === 'string' ? body.artist.trim() : ''
  const suggestedBy = typeof body?.suggestedBy === 'string' ? body.suggestedBy.trim() : ''
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'

  if (!title || title.length > 120 || !artist || artist.length > 120) {
    return Response.json({ ok: false, error: 'Vul een geldige titel en artiest in.' }, { status: 400 })
  }
  if (suggestedBy.length > 80) {
    return Response.json({ ok: false, error: 'De naam is te lang.' }, { status: 400 })
  }

  try {
    // Check both limits inside the write, so concurrent requests cannot race.
    const result = await env.margo_glenn_wedding_db.prepare(`
      INSERT INTO music_suggestions (title, artist, suggested_by, source_ip)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM music_suggestions WHERE lower(title) = lower(?) AND lower(artist) = lower(?)
      ) AND (
        SELECT COUNT(*) FROM music_suggestions
        WHERE source_ip = ? AND created_at >= datetime('now', '-1 hour')
      ) < 8
    `).bind(title, artist, suggestedBy || null, ip, title, artist, ip).run()

    if (result.meta.changes !== 1) {
      const duplicate = await env.margo_glenn_wedding_db.prepare(`
      SELECT id
      FROM music_suggestions
      WHERE lower(title) = lower(?)
        AND lower(artist) = lower(?)
      LIMIT 1
    `).bind(title, artist).first()

      if (duplicate) {
        return Response.json({ ok: true, duplicate: true, message: 'Dit nummer staat al op de lijst. ♡' })
      }
      return Response.json({ ok: false, error: 'Je hebt al heel wat nummers voorgesteld. Probeer het over een uurtje opnieuw. ♡' }, { status: 429, headers: { 'Retry-After': '3600' } })
    }

    return Response.json({
      ok: true,
      suggestion: {
        id: result.meta.last_row_id,
        title,
        artist,
        suggestedBy: suggestedBy || null
      }
    })
  } catch (error) {
    console.error('Music suggestion create failed:', error)
    return Response.json({ ok: false, error: 'Je nummer kon niet worden toegevoegd.' }, { status: 500 })
  }
}

async function findInvitation(code, env) {
  const normalized = normalizeInvitationCode(code, env)
  if (!normalized) return null

  return env.margo_glenn_wedding_db.prepare(`
    SELECT id, invitation_code
    FROM invitations
    WHERE invitation_code = ? AND active = 1
    LIMIT 1
  `).bind(normalized).first()
}

async function handlePublicPhotoList(request, env) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code') || ''
  const invitation = await findInvitation(code, env)

  if (!invitation) return Response.json({ ok: false, error: 'Deze fotosectie is niet beschikbaar voor deze code.' }, { status: 404 })
  if (!env.WEDDING_PHOTOS) return Response.json({ ok: false, error: 'Fotodelen is nog niet geconfigureerd.' }, { status: 503 })

  try {
    const [photos, quota] = await Promise.all([
      env.margo_glenn_wedding_db.prepare(`
        SELECT id, original_filename, mime_type, size_bytes, uploaded_at
        FROM wedding_photos
        WHERE invitation_id = ? AND approved = 1
        ORDER BY uploaded_at DESC, id DESC
      `).bind(invitation.id).all(),
      env.margo_glenn_wedding_db.prepare(`SELECT used_bytes FROM wedding_photo_quota WHERE id = 1`).first()
    ])

    const usedBytes = Number(quota?.used_bytes || 0)
    return Response.json({
      ok: true,
      photos: photos.results.map((photo) => ({
        id: photo.id,
        filename: photo.original_filename,
        sizeBytes: Number(photo.size_bytes),
        uploadedAt: photo.uploaded_at,
        url: `/api/photo?id=${encodeURIComponent(photo.id)}&code=${encodeURIComponent(String(code).trim().toUpperCase())}`
      })),
      quota: {
        usedBytes,
        limitBytes: PHOTO_QUOTA_BYTES,
        remainingBytes: Math.max(0, PHOTO_QUOTA_BYTES - usedBytes),
        uploadAvailable: usedBytes < PHOTO_QUOTA_BYTES
      }
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Photo list failed:', error)
    return Response.json({ ok: false, error: 'Foto\'s konden niet worden geladen.' }, { status: 500 })
  }
}

async function handlePublicPhotoUpload(request, env) {
  if (!env.WEDDING_PHOTOS) return Response.json({ ok: false, error: 'Fotodelen is nog niet geconfigureerd.' }, { status: 503 })
  try {
    const form = await readPhotoForm(request)
    const code = typeof form.get('code') === 'string' ? form.get('code') : ''
    const invitation = await findInvitation(code, env)
    if (!invitation) return Response.json({ ok: false, error: 'Deze fotosectie is niet beschikbaar voor deze code.' }, { status: 404 })
    if (!await photoUploadAllowed(env, invitation.id)) {
      return Response.json({ ok: false, error: 'Je hebt al heel wat foto’s gedeeld. Probeer over een kwartier opnieuw.' }, {
        status: 429, headers: { 'Retry-After': '900', 'Cache-Control': 'private, no-store' },
      })
    }
    const file = form.get('photo')
    await validatePhoto(file)
    const photo = await storeWeddingPhoto(file, invitation, env)
    return Response.json({ ok: true, photo: { ...photo,
      url: '/api/photo?id=' + encodeURIComponent(photo.id) + '&code=' + encodeURIComponent(String(code).trim().toUpperCase())
    } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status === 500) console.error('Photo upload failed:', error)
    return Response.json({ ok: false, error: status === 500 ? 'De foto kon niet worden opgeslagen. Probeer opnieuw.' : error.message,
      ...(error.quotaReached ? { quotaReached: true } : {})
    }, { status, headers: { 'Cache-Control': 'private, no-store' } })
  }
}

async function handlePublicPhoto(request, env) {
  if (!env.WEDDING_PHOTOS) return new Response('Photo storage not configured', { status: 503 })

  const url = new URL(request.url)
  const id = Number(url.searchParams.get('id'))
  const code = url.searchParams.get('code') || ''
  const invitation = await findInvitation(code, env)

  if (!Number.isInteger(id) || id <= 0 || !invitation) return new Response('Not found', { status: 404 })

  try {
    const photo = await env.margo_glenn_wedding_db.prepare(`
      SELECT storage_key, mime_type
      FROM wedding_photos
      WHERE id = ? AND invitation_id = ? AND approved = 1
      LIMIT 1
    `).bind(id, invitation.id).first()

    if (!photo) return new Response('Not found', { status: 404 })

    const object = await env.WEDDING_PHOTOS.get(photo.storage_key)
    if (!object) return new Response('Not found', { status: 404 })

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'private, no-store')
    headers.set('x-content-type-options', 'nosniff')
    headers.set('referrer-policy', 'no-referrer')
    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Photo read failed:', error)
    return new Response('Unable to load photo', { status: 500 })
  }
}

async function handleAdminDashboard(env, identity) {
  try {
    const db = env.margo_glenn_wedding_db
    const invitationResult = await db.prepare(`SELECT id, invitation_code, active FROM invitations ORDER BY id`).all()
    const guestResult = await db.prepare(`SELECT id, invitation_id, name, email, invited_to_dinner, invited_to_evening, rsvp_status, dinner_rsvp_status, evening_rsvp_status FROM guests ORDER BY invitation_id,id`).all()
    const dietaryResult = await db.prepare(`SELECT id,guest_id,event_part,category,other_type,other_text FROM guest_dietary_requirements ORDER BY guest_id,event_part,id`).all()
    const rsvpResult = await db.prepare(`SELECT id,guest_id,status,event_part,submitted_at AS created_at FROM rsvp_responses ORDER BY submitted_at DESC`).all()
    const songResult = await db.prepare('SELECT invitation_id,title,artist,requested_by,updated_at FROM invitation_song_requests').all()
    const photoCounts = await db.prepare('SELECT invitation_id,COUNT(*) AS photo_count FROM wedding_photos GROUP BY invitation_id').all()

    const invitations = invitationResult.results.map((invitation) => {
      const guests = guestResult.results
        .filter((g) => g.invitation_id === invitation.id)
        .map((guest) => {
          const seen = new Set()
          const dietaryRequirements = dietaryResult.results
            .filter((r) => r.guest_id === guest.id)
            .filter((r) => {
              if (seen.has(r.category)) return false
              seen.add(r.category)
              return true
            })
            .map((r) => ({ id: r.id, category: r.category, otherText: r.other_text }))

          const rsvpHistory = rsvpResult.results
            .filter((r) => r.guest_id === guest.id)
            .map((r) => ({ id: r.id, status: r.status, eventPart: r.event_part, createdAt: r.created_at }))

          return {
            id: guest.id,
            name: guest.name,
            email: guest.email || null,
            invitedToDinner: guest.invited_to_dinner === 1,
            invitedToEvening: guest.invited_to_evening === 1,
            rsvpStatus: guest.rsvp_status,
            dinnerRsvpStatus: guest.dinner_rsvp_status,
            eveningRsvpStatus: guest.evening_rsvp_status,
            dietaryRequirements,
            rsvpHistory
          }
        })

      return {
        id: invitation.id,
        invitationCode: invitation.invitation_code,
        active: invitation.active === 1,
        guests,
        song: (() => {
          const song = songResult.results.find(row => row.invitation_id === invitation.id)
          return song ? { title: song.title, artist: song.artist, requestedBy: song.requested_by, updatedAt: song.updated_at } : null
        })(),
        photoCount: Number(photoCounts.results.find(row => row.invitation_id === invitation.id)?.photo_count || 0)
      }
    })

    const allGuests = guestResult.results
    const summary = {
      invitations: invitations.length,
      activeInvitations: invitations.filter((i) => i.active).length,
      guests: allGuests.length,
      dinnerAttending: allGuests.filter((g) => g.dinner_rsvp_status === 'attending').length,
      dinnerDeclined: allGuests.filter((g) => g.dinner_rsvp_status === 'declined').length,
      eveningAttending: allGuests.filter((g) => g.evening_rsvp_status === 'attending').length,
      eveningDeclined: allGuests.filter((g) => g.evening_rsvp_status === 'declined').length
    }

    return Response.json({
      ok: true,
      admin: { email: identity.email ?? null },
      summary,
      invitations
    })
  } catch (error) {
    console.error('Admin dashboard failed:', error)
    return Response.json({ ok: false, error: 'Unable to load admin dashboard' }, { status: 500 })
  }
}

async function handleAdminInvitationCreate(request, env, identity) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige JSON' }, { status: 400 })
  }

  const guests = Array.isArray(body?.guests) ? body.guests : []
  if (guests.length < 1 || guests.length > 2) {
    return Response.json({ ok: false, error: 'Een uitnodiging moet 1 of 2 gasten bevatten.' }, { status: 400 })
  }

  const normalizedGuests = guests.map((guest, index) => ({
    name: typeof guest?.name === 'string' ? guest.name.trim() : '',
    invitedToDinner: guest?.invitedToDinner === true,
    invitedToEvening: guest?.invitedToEvening === true,
    index: index + 1
  }))

  for (const guest of normalizedGuests) {
    if (!guest.name || guest.name.length > 150) {
      return Response.json({ ok: false, error: `Naam van gast ${guest.index} is ongeldig.` }, { status: 400 })
    }
    if (!guest.invitedToDinner && !guest.invitedToEvening) {
      return Response.json({ ok: false, error: `Gast ${guest.index} moet voor minstens één onderdeel uitgenodigd zijn.` }, { status: 400 })
    }
  }

  const db = env.margo_glenn_wedding_db
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInvitationCode()
    try {
      const statements = [db.prepare(`INSERT INTO invitations (invitation_code, active) VALUES (?,1)`).bind(code)]
      statements.push(...normalizedGuests.map((guest) =>
        db.prepare(`INSERT INTO guests (invitation_id,name,email,invited_to_dinner,invited_to_evening) VALUES ((SELECT id FROM invitations WHERE invitation_code=?),?,NULL,?,?)`)
          .bind(code, guest.name, guest.invitedToDinner ? 1 : 0, guest.invitedToEvening ? 1 : 0)
      ))
      const results = await db.batch(statements)
      const invitationId = results[0].meta.last_row_id

      console.log(`Invitation ${code} created by ${identity.email ?? 'unknown'} for ${normalizedGuests.length} guest(s)`)

      return Response.json({
        ok: true,
        invitation: {
          id: invitationId,
          invitationCode: code,
          active: true,
          guests: normalizedGuests.map(({ name, invitedToDinner, invitedToEvening }) => ({ name, invitedToDinner, invitedToEvening }))
        }
      })
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('unique')) continue
      console.error('Invitation creation failed:', error)
      return Response.json({ ok: false, error: 'Uitnodiging kon niet worden aangemaakt.' }, { status: 500 })
    }
  }

  return Response.json({ ok: false, error: 'Kon geen unieke uitnodigingscode genereren. Probeer opnieuw.' }, { status: 500 })
}

function generateInvitationCode() {
  const values = new Uint32Array(6)
  crypto.getRandomValues(values)
  return `MG-${Array.from(values, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('')}`
}

async function handleAdminInvitationToggle(request, env, identity) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const id = Number(body?.id)
  const active = body?.active

  if (!Number.isInteger(id) || typeof active !== 'boolean') {
    return Response.json({ ok: false, error: 'Invalid invitation data' }, { status: 400 })
  }

  try {
    const result = await env.margo_glenn_wedding_db
      .prepare(`UPDATE invitations SET active=? WHERE id=?`)
      .bind(active ? 1 : 0, id)
      .run()

    if (result.meta.changes === 0) {
      return Response.json({ ok: false, error: 'Invitation not found' }, { status: 404 })
    }

    console.log(`Invitation ${id} set to ${active ? 'active' : 'inactive'} by ${identity.email ?? 'unknown'}`)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Invitation toggle failed:', error)
    return Response.json({ ok: false, error: 'Unable to update invitation' }, { status: 500 })
  }
}

async function withTimeout(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Operation timed out after ${milliseconds}ms`)), milliseconds)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
