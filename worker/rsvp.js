export class RsvpError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

// Return prepared writes so callers can include related changes in ONE D1 batch.
export async function prepareRsvpChanges(db, invitationId, body) {
  if (!Array.isArray(body?.guests) || body.guests.length === 0) throw new RsvpError('Invalid guest data')
  if (body.email !== undefined && typeof body.email !== 'string') throw new RsvpError('Ongeldig e-mailadres')
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new RsvpError('Ongeldig e-mailadres')

  const settings = await db.prepare('SELECT rsvp_change_deadline FROM wedding_settings WHERE id=1 LIMIT 1').first()
  if (!settings) throw new RsvpError('RSVP settings unavailable', 500)
  const deadline = new Date(settings.rsvp_change_deadline).getTime()
  if (!Number.isFinite(deadline)) throw new RsvpError('RSVP settings unavailable', 500)
  if (Date.now() > deadline) throw new RsvpError('RSVP deadline has passed')

  const { results: guests } = await db.prepare(`SELECT id,name,invited_to_dinner,invited_to_evening
    FROM guests WHERE invitation_id=? ORDER BY id`).bind(invitationId).all()
  const guestsById = new Map(guests.map(guest => [guest.id, guest]))
  const submittedIds = new Set()
  for (const submitted of body.guests) {
    const id = Number(submitted?.id)
    if (!Number.isSafeInteger(id) || id <= 0 || submittedIds.has(id)) throw new RsvpError('Invalid or duplicate guest')
    submittedIds.add(id)
    const guest = guestsById.get(id)
    if (!guest) throw new RsvpError('Invalid guest')
    if (guest.invited_to_dinner === 1 && !['attending', 'declined'].includes(submitted.dinner?.status)) throw new RsvpError('Dinner RSVP is required')
    if (guest.invited_to_evening === 1 && !['attending', 'declined'].includes(submitted.evening?.status)) throw new RsvpError('Evening RSVP is required')
    if (guest.invited_to_dinner !== 1 && submitted.dinner !== undefined) throw new RsvpError('Guest is not invited to dinner')
    if (guest.invited_to_evening !== 1 && submitted.evening !== undefined) throw new RsvpError('Guest is not invited to evening')
    const requirements = submitted.dietaryRequirements === undefined ? [] : submitted.dietaryRequirements
    if (!Array.isArray(requirements)) throw new RsvpError('Invalid dietary requirements')
    const attending = submitted.dinner?.status === 'attending' || submitted.evening?.status === 'attending'
    if (!attending && requirements.length) throw new RsvpError('Dietary requirements require attendance')
    validateDietaryRequirements(requirements)
  }
  if (submittedIds.size !== guests.length) throw new RsvpError('All invited guests must be included')

  const statements = []
  for (const submitted of body.guests) {
    const guestId = Number(submitted.id), guest = guestsById.get(guestId)
    if (guest.invited_to_dinner === 1) {
      statements.push(db.prepare('UPDATE guests SET dinner_rsvp_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(submitted.dinner.status, guestId))
      statements.push(db.prepare("INSERT INTO rsvp_responses (guest_id,status,event_part) VALUES (?,?,'dinner')").bind(guestId, submitted.dinner.status))
    }
    if (guest.invited_to_evening === 1) {
      statements.push(db.prepare('UPDATE guests SET evening_rsvp_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(submitted.evening.status, guestId))
      statements.push(db.prepare("INSERT INTO rsvp_responses (guest_id,status,event_part) VALUES (?,?,'evening')").bind(guestId, submitted.evening.status))
    }
    statements.push(db.prepare('UPDATE guests SET email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(email || null, guestId))
    statements.push(db.prepare('DELETE FROM guest_dietary_requirements WHERE guest_id=?').bind(guestId))
    const attending = submitted.dinner?.status === 'attending' || submitted.evening?.status === 'attending'
    statements.push(db.prepare('UPDATE guests SET rsvp_status=? WHERE id=?').bind(attending ? 'attending' : 'declined', guestId))
    if (attending) {
      const eventPart = guest.invited_to_dinner === 1 ? 'dinner' : 'evening'
      for (const requirement of submitted.dietaryRequirements || []) {
        statements.push(db.prepare(`INSERT INTO guest_dietary_requirements
          (guest_id,event_part,category,other_type,other_text) VALUES (?,?,?,?,?)`)
          .bind(guestId, eventPart, requirement.category, requirement.category === 'other' ? 'allergy' : null,
            requirement.category === 'other' ? requirement.otherText.trim() : null))
      }
    }
  }
  return { statements, guests }
}

function validateDietaryRequirements(requirements) {
  const allowed = new Set(['vegetarian', 'vegan', 'other']), seen = new Set()
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== 'object') throw new RsvpError('Invalid dietary requirement')
    const category = requirement.category
    if (!allowed.has(category)) throw new RsvpError('Invalid dietary requirement category')
    if (seen.has(category)) throw new RsvpError('Duplicate dietary requirement')
    seen.add(category)
    if (category === 'other') {
      if (typeof requirement.otherText !== 'string' || !requirement.otherText.trim() || requirement.otherText.trim().length > 250) {
        throw new RsvpError('Other dietary requirement requires a description')
      }
    } else if (requirement.otherText !== undefined && requirement.otherText !== null) {
      throw new RsvpError('Invalid dietary requirement')
    }
  }
}
