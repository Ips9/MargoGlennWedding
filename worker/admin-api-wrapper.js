import legacyWorker from './index.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/api/invitation' && request.method === 'GET') {
      return handlePublicInvitation(request, env)
    }

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

    if (url.pathname === '/admin/api/invitation/create' && request.method === 'POST') {
      return handleAdminInvitationCreate(request, env, identity)
    }

    if (url.pathname === '/admin/api/invitation/toggle' && request.method === 'POST') {
      return handleAdminInvitationToggle(request, env, identity)
    }

    return Response.json({ ok: false, error: 'Not found' }, { status: 404 })
  }
}

async function getAdminIdentity(request, ctx) {
  if (ctx.access) {
    try {
      const identity = await ctx.access.getIdentity()
      if (identity) return identity
    } catch (error) {
      console.error('Cloudflare Access identity lookup failed:', error)
    }
  }

  const email = request.headers.get('cf-access-authenticated-user-email')
  return email ? { email } : null
}

async function handlePublicInvitation(request, env) {
  const code = (new URL(request.url).searchParams.get('code') || '').trim().toUpperCase()

  if (!/^MG-[A-Z0-9]{6}$/.test(code)) {
    return Response.json({ ok: false, error: 'Invalid invitation' }, { status: 404 })
  }

  const db = env.margo_glenn_wedding_db

  try {
    // Keep the critical invitation lookup small and independent.
    const invitation = await withTimeout(
      db.prepare(`
        SELECT id, active
        FROM invitations
        WHERE invitation_code = ?
        LIMIT 1
      `).bind(code).first(),
      5000
    )

    if (!invitation || invitation.active !== 1) {
      return Response.json({ ok: false, error: 'Invalid invitation' }, { status: 404 })
    }

    // Guest data is all the RSVP form needs in order to render.
    // Do this before any optional dietary-history lookup.
    const guestResult = await withTimeout(
      db.prepare(`
        SELECT
          id,
          name,
          email,
          invited_to_dinner,
          invited_to_evening,
          rsvp_status,
          dinner_rsvp_status,
          evening_rsvp_status
        FROM guests
        WHERE invitation_id = ?
        ORDER BY id
      `).bind(invitation.id).all(),
      5000
    )

    const guests = guestResult.results.map((guest) => ({
      id: guest.id,
      name: guest.name,
      email: guest.email || '',
      invitedToDinner: guest.invited_to_dinner === 1,
      invitedToEvening: guest.invited_to_evening === 1,
      rsvpStatus: guest.rsvp_status,
      dinnerRsvpStatus: guest.dinner_rsvp_status,
      eveningRsvpStatus: guest.evening_rsvp_status,
      dietaryRequirements: []
    }))

    // Dietary data is optional for opening the invitation. If its table/query
    // is unavailable for any reason, the RSVP can still render and continue.
    try {
      const dietaryResult = await withTimeout(
        db.prepare(`
          SELECT
            id,
            guest_id,
            event_part,
            category,
            other_type,
            other_text
          FROM guest_dietary_requirements
          WHERE guest_id IN (
            SELECT id FROM guests WHERE invitation_id = ?
          )
          ORDER BY guest_id, event_part, id
        `).bind(invitation.id).all(),
        2000
      )

      for (const guest of guests) {
        const seen = new Set()
        guest.dietaryRequirements = dietaryResult.results
          .filter((row) => row.guest_id === guest.id)
          .filter((row) => {
            if (seen.has(row.category)) return false
            seen.add(row.category)
            return true
          })
          .map((row) => ({
            id: row.id,
            eventPart: row.event_part,
            category: row.category,
            otherType: row.other_type,
            otherText: row.other_text
          }))
      }
    } catch (error) {
      console.warn('Dietary lookup skipped:', error)
    }

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

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${milliseconds}ms`)), milliseconds)
    })
  ])
}

async function handleAdminDashboard(env, identity) {
  try {
    const db = env.margo_glenn_wedding_db
    const invitationResult = await db.prepare(`SELECT id, invitation_code, active FROM invitations ORDER BY id`).all()
    const guestResult = await db.prepare(`SELECT id, invitation_id, name, email, invited_to_dinner, invited_to_evening, rsvp_status, dinner_rsvp_status, evening_rsvp_status FROM guests ORDER BY invitation_id,id`).all()
    const dietaryResult = await db.prepare(`SELECT id,guest_id,event_part,category,other_type,other_text FROM guest_dietary_requirements ORDER BY guest_id,event_part,id`).all()
    const rsvpResult = await db.prepare(`SELECT id,guest_id,status,event_part,submitted_at AS created_at FROM rsvp_responses ORDER BY submitted_at DESC`).all()

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
        guests
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
      const insertResult = await db.prepare(`INSERT INTO invitations (invitation_code, active) VALUES (?,1)`).bind(code).run()
      const invitationId = insertResult.meta.last_row_id
      if (!invitationId) throw new Error('Invitation ID was not returned')

      const statements = normalizedGuests.map((guest) =>
        db.prepare(`INSERT INTO guests (invitation_id,name,email,invited_to_dinner,invited_to_evening) VALUES (?,?,NULL,?,?)`)
          .bind(invitationId, guest.name, guest.invitedToDinner ? 1 : 0, guest.invitedToEvening ? 1 : 0)
      )
      await db.batch(statements)

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
