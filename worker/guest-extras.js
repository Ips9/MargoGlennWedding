import { HttpError, readLimitedJson } from './guest-security.js'

const WEDDING_START = Date.parse('2027-10-02T00:00:00+02:00')
const GUESTBOOK_MAX_LENGTH = 1000
const PLUS_ONE_NAME_MAX_LENGTH = 100

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

async function ensureRsvpStillEditable(db) {
  const settings = await db.prepare('SELECT rsvp_change_deadline FROM wedding_settings WHERE id=1 LIMIT 1').first()
  if (!settings) throw new HttpError('RSVP settings unavailable', 500)
  const deadline = new Date(settings.rsvp_change_deadline).getTime()
  if (!Number.isFinite(deadline)) throw new HttpError('RSVP settings unavailable', 500)
  if (Date.now() > deadline) throw new HttpError('RSVP deadline has passed')
}

async function readInvitationGuests(db, invitationId) {
  const { results } = await db.prepare(`SELECT id,name,invited_to_dinner,invited_to_evening,is_plus_one
    FROM guests WHERE invitation_id=? ORDER BY is_plus_one,id`).bind(invitationId).all()
  return results
}

function plusOneStateFromGuests(guests) {
  const primaryGuests = guests.filter(guest => guest.is_plus_one !== 1)
  const plusOnes = guests.filter(guest => guest.is_plus_one === 1)
  const allowed = primaryGuests.length === 1 && plusOnes.length <= 1 && guests.length <= 2
  const primary = primaryGuests[0] || null
  const partner = plusOnes[0] || null
  return {
    allowed,
    primaryName: primary?.name || '',
    partnerName: partner?.name || '',
    invitedToDinner: primary?.invited_to_dinner === 1,
    invitedToEvening: primary?.invited_to_evening === 1,
  }
}

async function getPlusOne(env, session) {
  const guests = await readInvitationGuests(env.margo_glenn_wedding_db, session.invitation_id)
  return json({ ok: true, ...plusOneStateFromGuests(guests) })
}

function validatePartnerName(value) {
  if (typeof value !== 'string') throw new HttpError('Vul de naam van je partner in.')
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name || name.length > PLUS_ONE_NAME_MAX_LENGTH || /[\u0000-\u001F\u007F]/.test(name)) {
    throw new HttpError('Vul een geldige naam van je partner in.')
  }
  return name
}

async function refreshDerivedNames(db, invitationId) {
  const { results } = await db.prepare(`SELECT name FROM guests WHERE invitation_id=? ORDER BY is_plus_one,id`).bind(invitationId).all()
  const names = results.map(row => row.name).join(' & ')
  await db.batch([
    db.prepare(`UPDATE invitation_song_requests SET requested_by=?,updated_at=CURRENT_TIMESTAMP
      WHERE invitation_id=?`).bind(names, invitationId),
    db.prepare(`UPDATE guestbook_entries SET author_names=?,updated_at=CURRENT_TIMESTAMP
      WHERE invitation_id=?`).bind(names, invitationId),
  ])
}

async function savePlusOne(request, env, session) {
  const db = env.margo_glenn_wedding_db
  await ensureRsvpStillEditable(db)
  const body = await readLimitedJson(request, 4096)
  const remove = body.name === null
  const name = remove ? null : validatePartnerName(body.name)
  const guests = await readInvitationGuests(db, session.invitation_id)
  const state = plusOneStateFromGuests(guests)
  if (!state.allowed) throw new HttpError('Deze uitnodiging kan geen extra partner toevoegen.', 403)

  const primary = guests.find(guest => guest.is_plus_one !== 1)
  const partner = guests.find(guest => guest.is_plus_one === 1)

  if (remove) {
    if (partner) {
      await db.prepare('DELETE FROM guests WHERE id=? AND invitation_id=? AND is_plus_one=1')
        .bind(partner.id, session.invitation_id).run()
      await refreshDerivedNames(db, session.invitation_id)
    }
    return json({ ok: true, removed: Boolean(partner) })
  }

  if (partner) {
    await db.prepare(`UPDATE guests SET name=?,invited_to_dinner=?,invited_to_evening=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND invitation_id=? AND is_plus_one=1`)
      .bind(name, primary.invited_to_dinner, primary.invited_to_evening, partner.id, session.invitation_id).run()
  } else {
    const result = await db.prepare(`INSERT INTO guests
      (invitation_id,name,invited_to_dinner,invited_to_evening,is_plus_one)
      SELECT ?,?,?,?,1
      WHERE NOT EXISTS (SELECT 1 FROM guests WHERE invitation_id=? AND is_plus_one=1)`)
      .bind(session.invitation_id, name, primary.invited_to_dinner, primary.invited_to_evening, session.invitation_id).run()
    if (result.meta.changes !== 1) throw new HttpError('Je partner kon niet worden toegevoegd. Vernieuw de pagina en probeer opnieuw.', 409)
  }

  await refreshDerivedNames(db, session.invitation_id)
  return json({ ok: true, name })
}

function ensureGuestbookOpen() {
  if (Date.now() < WEDDING_START) throw new HttpError('Ons gastenboek opent op onze trouwdag. ♡', 403)
}

async function listGuestbook(env, session) {
  ensureGuestbookOpen()
  const db = env.margo_glenn_wedding_db
  const [entries, own] = await Promise.all([
    db.prepare(`SELECT id,author_names,message,created_at,updated_at FROM guestbook_entries
      WHERE approved=1 ORDER BY created_at ASC,id ASC`).all(),
    db.prepare(`SELECT id,message FROM guestbook_entries WHERE invitation_id=? LIMIT 1`)
      .bind(session.invitation_id).first(),
  ])
  return json({
    ok: true,
    entries: entries.results.map(entry => ({
      id: entry.id,
      authorNames: entry.author_names,
      message: entry.message,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    ownMessage: own?.message || '',
  })
}

async function saveGuestbook(request, env, session) {
  ensureGuestbookOpen()
  const body = await readLimitedJson(request, 8192)
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > GUESTBOOK_MAX_LENGTH) {
    throw new HttpError(`Schrijf een bericht van maximaal ${GUESTBOOK_MAX_LENGTH} tekens.`)
  }
  const db = env.margo_glenn_wedding_db
  const { results: guests } = await db.prepare(`SELECT name FROM guests WHERE invitation_id=? ORDER BY is_plus_one,id`)
    .bind(session.invitation_id).all()
  if (!guests.length) throw new HttpError('Deze uitnodiging heeft geen gasten.', 404)
  const authorNames = guests.map(guest => guest.name).join(' & ')
  await db.prepare(`INSERT INTO guestbook_entries (invitation_id,author_names,message,approved)
    VALUES (?,?,?,1)
    ON CONFLICT(invitation_id) DO UPDATE SET
      author_names=excluded.author_names,
      message=excluded.message,
      approved=1,
      updated_at=CURRENT_TIMESTAMP`)
    .bind(session.invitation_id, authorNames, message).run()
  return json({ ok: true })
}

export async function handleGuestExtrasApi(request, env, session) {
  const path = new URL(request.url).pathname
  if (path === '/api/guest/plus-one' && request.method === 'GET') return getPlusOne(env, session)
  if (path === '/api/guest/plus-one' && request.method === 'POST') return savePlusOne(request, env, session)
  if (path === '/api/guest/guestbook' && request.method === 'GET') return listGuestbook(env, session)
  if (path === '/api/guest/guestbook' && request.method === 'POST') return saveGuestbook(request, env, session)
  return null
}
