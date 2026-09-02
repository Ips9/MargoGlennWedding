import legacyWorker from './index.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/admin/api/')) {
      return legacyWorker.fetch(request, env, ctx)
    }

    const identity = await getAdminIdentity(request, ctx)
    if (!identity) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (url.pathname === '/admin/api/health' && request.method === 'GET') {
      return Response.json({ ok: true, authenticated: true, email: identity.email ?? null })
    }

    if (url.pathname === '/admin/api/dashboard' && request.method === 'GET') {
      return handleAdminDashboard(env, identity)
    }

    if (url.pathname === '/admin/api/invitation/toggle' && request.method === 'POST') {
      return handleAdminInvitationToggle(request, env, identity)
    }

    return Response.json({ ok: false, error: 'Not found' }, { status: 404 })
  }
}

async function getAdminIdentity(request, ctx) {
  // Direct Worker Access authentication, when available.
  if (ctx.access) {
    try {
      const identity = await ctx.access.getIdentity()
      if (identity) return identity
    } catch (error) {
      console.error('Cloudflare Access identity lookup failed:', error)
    }
  }

  // With Static Assets, Cloudflare's internal assets router does not pass
  // ctx.access to the user Worker. Access still authenticates the request and
  // supplies the authenticated email header to the Worker.
  const email = request.headers.get('cf-access-authenticated-user-email')
  if (email) return { email }

  return null
}

async function handleAdminDashboard(env, identity) {
  try {
    const db = env.margo_glenn_wedding_db
    const invitationResult = await db.prepare(`SELECT id, invitation_code, active FROM invitations ORDER BY id`).all()
    const guestResult = await db.prepare(`SELECT id, invitation_id, name, email, invited_to_dinner, invited_to_evening, rsvp_status, dinner_rsvp_status, evening_rsvp_status FROM guests ORDER BY invitation_id,id`).all()
    const dietaryResult = await db.prepare(`SELECT id,guest_id,event_part,category,other_type,other_text FROM guest_dietary_requirements ORDER BY guest_id,event_part,id`).all()
    const rsvpResult = await db.prepare(`SELECT id,guest_id,status,event_part,created_at FROM rsvp_responses ORDER BY created_at DESC`).all()

    const invitations = invitationResult.results.map(invitation => {
      const guests = guestResult.results.filter(g => g.invitation_id === invitation.id).map(guest => {
        const seen = new Set()
        const dietaryRequirements = dietaryResult.results
          .filter(r => r.guest_id === guest.id)
          .filter(r => {
            if (seen.has(r.category)) return false
            seen.add(r.category)
            return true
          })
          .map(r => ({ id: r.id, category: r.category, otherText: r.other_text }))

        const rsvpHistory = rsvpResult.results
          .filter(r => r.guest_id === guest.id)
          .map(r => ({ id: r.id, status: r.status, eventPart: r.event_part, createdAt: r.created_at }))

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
        guests
      }
    })

    const allGuests = guestResult.results
    const summary = {
      invitations: invitations.length,
      activeInvitations: invitations.filter(i => i.active).length,
      guests: allGuests.length,
      dinnerAttending: allGuests.filter(g => g.dinner_rsvp_status === 'attending').length,
      dinnerDeclined: allGuests.filter(g => g.dinner_rsvp_status === 'declined').length,
      eveningAttending: allGuests.filter(g => g.evening_rsvp_status === 'attending').length,
      eveningDeclined: allGuests.filter(g => g.evening_rsvp_status === 'declined').length
    }

    return Response.json({ ok: true, admin: { email: identity.email ?? null }, summary, invitations })
  } catch (error) {
    console.error('Admin dashboard failed:', error)
    return Response.json({ ok: false, error: 'Unable to load admin dashboard' }, { status: 500 })
  }
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
