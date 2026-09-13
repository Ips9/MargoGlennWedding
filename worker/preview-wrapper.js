import application from './admin-api-wrapper.js'
import { getAccessIdentity } from './access.js'

export function domainRedirect(request, env) {
  const host = env.PUBLIC_SITE_HOST
  if (!host) return null
  const url = new URL(request.url)
  if (url.hostname === host || url.hostname === `www.${host}`) {
    if (url.hostname !== host || url.protocol !== 'https:') {
      url.hostname = host
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 308)
    }
  }
  // Existing invitation links open the new site; legacy API/preview URLs remain valid.
  if (url.hostname === 'margo-glenn-wedding.margo-glenn-wedding.workers.dev' && url.pathname === '/' && ['GET', 'HEAD'].includes(request.method)) {
    url.hostname = host
    url.protocol = 'https:'
    return Response.redirect(url.toString(), 308)
  }
  return null
}

export default {
  async fetch(request, env, ctx) {
    const redirect = domainRedirect(request, env)
    if (redirect) return redirect

    const url = new URL(request.url)

    if (url.pathname === '/admin/api/invitation/delete' && request.method === 'POST') {
      return handleAdminInvitationDelete(request, env, ctx)
    }

    if (url.pathname === '/admin/api/dashboard' && request.method === 'GET') {
      const response = await application.fetch(request, env, ctx)
      return adjustAdminDashboardResponse(response)
    }

    return application.fetch(request, env, ctx)
  },
}

async function adjustAdminDashboardResponse(response) {
  if (!response.ok) return response

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return response

  try {
    const data = await response.json()
    if (!data?.ok || !Array.isArray(data.invitations)) {
      return Response.json(data, { status: response.status, headers: response.headers })
    }

    const activeInvitations = data.invitations.filter((invitation) => invitation.active)
    const activeGuests = activeInvitations.flatMap((invitation) => Array.isArray(invitation.guests) ? invitation.guests : [])

    data.summary = {
      ...data.summary,
      activeInvitations: activeInvitations.length,
      guests: activeGuests.length,
      dinnerAttending: activeGuests.filter((guest) => guest.dinnerRsvpStatus === 'attending').length,
      dinnerDeclined: activeGuests.filter((guest) => guest.dinnerRsvpStatus === 'declined').length,
      eveningAttending: activeGuests.filter((guest) => guest.eveningRsvpStatus === 'attending').length,
      eveningDeclined: activeGuests.filter((guest) => guest.eveningRsvpStatus === 'declined').length,
    }

    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, no-store')
    return Response.json(data, { status: response.status, headers })
  } catch (error) {
    console.error('Admin dashboard post-processing failed:', error)
    return Response.json({ ok: false, error: 'Unable to load admin dashboard' }, { status: 500 })
  }
}

async function handleAdminInvitationDelete(request, env, ctx) {
  const identity = await getAccessIdentity(request, env, ctx)
  if (!identity) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige JSON' }, { status: 400 })
  }

  const id = Number(body?.id)
  const invitationCode = typeof body?.invitationCode === 'string' ? body.invitationCode.trim().toUpperCase() : ''

  if (!Number.isInteger(id) || id <= 0 || !invitationCode) {
    return Response.json({ ok: false, error: 'Ongeldige uitnodiging.' }, { status: 400 })
  }

  const db = env.margo_glenn_wedding_db

  try {
    const invitation = await db.prepare(`
      SELECT id, invitation_code
      FROM invitations
      WHERE id = ? AND invitation_code = ?
      LIMIT 1
    `).bind(id, invitationCode).first()

    if (!invitation) {
      return Response.json({ ok: false, error: 'Uitnodiging niet gevonden.' }, { status: 404 })
    }

    const photos = await db.prepare(`
      SELECT storage_key, size_bytes
      FROM wedding_photos
      WHERE invitation_id = ?
    `).bind(id).all()

    const photoRows = photos.results || []
    const photoBytes = photoRows.reduce((total, photo) => total + Number(photo.size_bytes || 0), 0)

    const statements = [
      db.prepare(`DELETE FROM guest_dietary_requirements WHERE guest_id IN (SELECT id FROM guests WHERE invitation_id = ?)` ).bind(id),
      db.prepare(`DELETE FROM rsvp_responses WHERE guest_id IN (SELECT id FROM guests WHERE invitation_id = ?)` ).bind(id),
      db.prepare(`DELETE FROM guestbook_entries WHERE invitation_id = ?`).bind(id),
      db.prepare(`DELETE FROM invitation_song_requests WHERE invitation_id = ?`).bind(id),
      db.prepare(`DELETE FROM guest_sessions WHERE invitation_id = ?`).bind(id),
      db.prepare(`DELETE FROM wedding_photos WHERE invitation_id = ?`).bind(id),
      db.prepare(`DELETE FROM guests WHERE invitation_id = ?`).bind(id),
      db.prepare(`
        UPDATE wedding_photo_quota
        SET used_bytes = MAX(0, used_bytes - ?)
        WHERE id = 1
          AND EXISTS (SELECT 1 FROM invitations WHERE id = ? AND invitation_code = ?)
      `).bind(photoBytes, id, invitationCode),
      db.prepare(`DELETE FROM invitations WHERE id = ? AND invitation_code = ?`).bind(id, invitationCode),
    ]

    const results = await db.batch(statements)
    const invitationDelete = results[results.length - 1]

    if (invitationDelete?.meta?.changes !== 1) {
      return Response.json({ ok: false, error: 'Uitnodiging kon niet worden verwijderd.' }, { status: 409 })
    }

    const storageKeys = photoRows.map((photo) => photo.storage_key).filter(Boolean)
    if (env.WEDDING_PHOTOS && storageKeys.length) {
      const cleanup = Promise.all(storageKeys.map((key) => env.WEDDING_PHOTOS.delete(key)))
        .catch((error) => console.error(`R2 cleanup failed after deleting invitation ${invitationCode}:`, error))
      if (ctx?.waitUntil) ctx.waitUntil(cleanup)
      else await cleanup
    }

    console.log(`Invitation ${invitationCode} permanently deleted by ${identity.email ?? 'unknown'}`)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Invitation deletion failed:', error)
    return Response.json({ ok: false, error: 'Uitnodiging kon niet worden verwijderd.' }, { status: 500 })
  }
}
