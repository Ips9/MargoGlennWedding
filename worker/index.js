export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    /*
     * ----------------------------------------------------------
     * API
     * ----------------------------------------------------------
     */

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        service: 'margo-glenn-wedding-api'
      })
    }

    if (url.pathname === '/api/invitation') {
      return handleInvitation(request, env)
    }

    if (url.pathname === '/api/rsvp') {
      return handleRsvp(request, env)
    }


    /*
     * ----------------------------------------------------------
     * Static website
     * ----------------------------------------------------------
     */

    return env.ASSETS.fetch(request)
  }
}


/*
 * ------------------------------------------------------------
 * Invitation API
 * ------------------------------------------------------------
 *
 * GET /api/invitation?code=MG-XXXXXX
 *
 * Returns the guests belonging to the invitation.
 *
 * The invitation code itself is deliberately NOT returned.
 * ------------------------------------------------------------
 */

async function handleInvitation(request, env) {
  if (request.method !== 'GET') {
    return Response.json(
      {
        ok: false,
        error: 'Method not allowed'
      },
      {
        status: 405,
        headers: {
          'Allow': 'GET'
        }
      }
    )
  }

  const url = new URL(request.url)
  const rawCode = url.searchParams.get('code')

  if (!rawCode) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid invitation'
      },
      {
        status: 404
      }
    )
  }

  const code = rawCode.trim().toUpperCase()

  if (!/^MG-[A-Z0-9]{6}$/.test(code)) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid invitation'
      },
      {
        status: 404
      }
    )
  }

  try {
    const invitation = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          id,
          active
        FROM invitations
        WHERE invitation_code = ?
        LIMIT 1
      `)
      .bind(code)
      .first()

    if (!invitation || invitation.active !== 1) {
      return Response.json(
        {
          ok: false,
          error: 'Invalid invitation'
        },
        {
          status: 404
        }
      )
    }

    const result = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          id,
          name,
          invited_to_dinner,
          invited_to_evening,
          rsvp_status,
          dinner_rsvp_status,
          evening_rsvp_status
        FROM guests
        WHERE invitation_id = ?
        ORDER BY id
      `)
      .bind(invitation.id)
      .all()

    const guests = result.results.map((guest) => ({
      id: guest.id,
      name: guest.name,
      invitedToDinner: guest.invited_to_dinner === 1,
      invitedToEvening: guest.invited_to_evening === 1,
      rsvpStatus: guest.rsvp_status,
      dinnerRsvpStatus: guest.dinner_rsvp_status,
      eveningRsvpStatus: guest.evening_rsvp_status
    }))

    return Response.json({
      ok: true,
      guests
    })
  } catch (error) {
    console.error('Invitation lookup failed:', error)

    return Response.json(
      {
        ok: false,
        error: 'Unable to process invitation'
      },
      {
        status: 500
      }
    )
  }
}


/*
 * ------------------------------------------------------------
 * RSVP API
 * ------------------------------------------------------------
 *
 * POST /api/rsvp
 *
 * Expected JSON:
 *
 * {
 *   "code": "MG-TEST02",
 *   "guests": [
 *     {
 *       "id": 2,
 *       "dinner": {
 *         "status": "attending",
 *         "dietaryRequirements": [
 *           {
 *             "category": "vegetarian"
 *           }
 *         ]
 *       },
 *       "evening": {
 *         "status": "attending",
 *         "dietaryRequirements": [
 *           {
 *             "category": "gluten"
 *           }
 *         ]
 *       }
 *     }
 *   ]
 * }
 *
 * Dinner and evening are deliberately handled separately.
 * Dietary requirements are also stored separately per event part.
 * ------------------------------------------------------------
 */

async function handleRsvp(request, env) {
  if (request.method !== 'POST') {
    return Response.json(
      {
        ok: false,
        error: 'Method not allowed'
      },
      {
        status: 405,
        headers: {
          'Allow': 'POST'
        }
      }
    )
  }

  let body

  try {
    body = await request.json()
  } catch {
    return Response.json(
      {
        ok: false,
        error: 'Invalid JSON'
      },
      {
        status: 400
      }
    )
  }

  const code = typeof body?.code === 'string'
    ? body.code.trim().toUpperCase()
    : ''

  if (!/^MG-[A-Z0-9]{6}$/.test(code)) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid invitation'
      },
      {
        status: 404
      }
    )
  }

  if (!Array.isArray(body?.guests) || body.guests.length === 0) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid guest data'
      },
      {
        status: 400
      }
    )
  }

  try {
    /*
     * ----------------------------------------------------------
     * Validate invitation
     * ----------------------------------------------------------
     */

    const invitation = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          id,
          active
        FROM invitations
        WHERE invitation_code = ?
        LIMIT 1
      `)
      .bind(code)
      .first()

    if (!invitation || invitation.active !== 1) {
      return Response.json(
        {
          ok: false,
          error: 'Invalid invitation'
        },
        {
          status: 404
        }
      )
    }


    /*
     * ----------------------------------------------------------
     * Validate deadlines
     * ----------------------------------------------------------
     */

    const settings = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          rsvp_deadline,
          rsvp_change_deadline
        FROM wedding_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first()

    if (!settings) {
      return Response.json(
        {
          ok: false,
          error: 'RSVP settings unavailable'
        },
        {
          status: 500
        }
      )
    }

    const now = new Date()
    const changeDeadline = new Date(settings.rsvp_change_deadline)

    if (now > changeDeadline) {
      return Response.json(
        {
          ok: false,
          error: 'RSVP deadline has passed'
        },
        {
          status: 400
        }
      )
    }


    /*
     * ----------------------------------------------------------
     * Load guests belonging to invitation
     * ----------------------------------------------------------
     */

    const guestResult = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          id,
          invited_to_dinner,
          invited_to_evening
        FROM guests
        WHERE invitation_id = ?
        ORDER BY id
      `)
      .bind(invitation.id)
      .all()

    const guestsById = new Map(
      guestResult.results.map((guest) => [
        guest.id,
        guest
      ])
    )


    /*
     * ----------------------------------------------------------
     * Validate submitted guests
     * ----------------------------------------------------------
     */

    const submittedGuestIds = new Set()

    for (const submittedGuest of body.guests) {
      const guestId = Number(submittedGuest?.id)

      if (!Number.isInteger(guestId)) {
        return Response.json(
          {
            ok: false,
            error: 'Invalid guest'
          },
          {
            status: 400
          }
        )
      }

      if (submittedGuestIds.has(guestId)) {
        return Response.json(
          {
            ok: false,
            error: 'Duplicate guest'
          },
          {
            status: 400
          }
        )
      }

      submittedGuestIds.add(guestId)

      const guest = guestsById.get(guestId)

      if (!guest) {
        return Response.json(
          {
            ok: false,
            error: 'Invalid guest'
          },
          {
            status: 400
          }
        )
      }


      /*
       * --------------------------------------------------------
       * Validate dinner
       * --------------------------------------------------------
       */

      if (guest.invited_to_dinner === 1) {
        const dinner = submittedGuest.dinner

        if (!dinner || !['attending', 'declined'].includes(dinner.status)) {
          return Response.json(
            {
              ok: false,
              error: 'Dinner RSVP is required'
            },
            {
              status: 400
            }
          )

        }

        const dietaryError = validateDietaryRequirements(
          dinner.dietaryRequirements
        )

        if (dietaryError) {
          return Response.json(
            {
              ok: false,
              error: dietaryError
            },
            {
              status: 400
            }
          )
        }
      } else if (submittedGuest.dinner !== undefined) {
        return Response.json(
          {
            ok: false,
            error: 'Guest is not invited to dinner'
          },
          {
            status: 400
          }
        )
      }


      /*
       * --------------------------------------------------------
       * Validate evening
       * --------------------------------------------------------
       */

      if (guest.invited_to_evening === 1) {
        const evening = submittedGuest.evening

        if (!evening || !['attending', 'declined'].includes(evening.status)) {
          return Response.json(
            {
              ok: false,
              error: 'Evening RSVP is required'
            },
            {
              status: 400
            }
          )
        }

        const dietaryError = validateDietaryRequirements(
          evening.dietaryRequirements
        )

        if (dietaryError) {
          return Response.json(
            {
              ok: false,
              error: dietaryError
            },
            {
              status: 400
            }
          )
        }
      } else if (submittedGuest.evening !== undefined) {
        return Response.json(
          {
            ok: false,
            error: 'Guest is not invited to evening'
          },
          {
            status: 400
          }
        )
      }
    }


    /*
     * ----------------------------------------------------------
     * Require every invited guest to be included
     * ----------------------------------------------------------
     */

    for (const guest of guestResult.results) {
      if (!submittedGuestIds.has(guest.id)) {
        return Response.json(
          {
            ok: false,
            error: 'All invited guests must be included'
          },
          {
            status: 400
          }
        )
      }
    }


    /*
     * ----------------------------------------------------------
     * Save everything atomically
     * ----------------------------------------------------------
     */

    const statements = []

    for (const submittedGuest of body.guests) {
      const guestId = Number(submittedGuest.id)
      const guest = guestsById.get(guestId)

      if (guest.invited_to_dinner === 1) {
        statements.push(
          env.margo_glenn_wedding_db
            .prepare(`
              UPDATE guests
              SET
                dinner_rsvp_status = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(
              submittedGuest.dinner.status,
              guestId
            )
        )

        statements.push(
          env.margo_glenn_wedding_db
            .prepare(`
              INSERT INTO rsvp_responses (
                guest_id,
                status,
                event_part
              )
              VALUES (?, ?, 'dinner')
            `)
            .bind(
              guestId,
              submittedGuest.dinner.status
            )
        )

        statements.push(
          env.margo_glenn_wedding_db
            .prepare(`
              DELETE FROM guest_dietary_requirements
              WHERE guest_id = ?
                AND event_part = 'dinner'
            `)
            .bind(guestId)
        )

        for (const requirement of submittedGuest.dinner.dietaryRequirements || []) {
          statements.push(
            env.margo_glenn_wedding_db
              .prepare(`
                INSERT INTO guest_dietary_requirements (
                  guest_id,
                  event_part,
                  category,
                  other_type,
                  other_text
                )
                VALUES (?, 'dinner', ?, ?, ?)
              `)
              .bind(
                guestId,
                requirement.category,
                requirement.otherType ?? null,
                requirement.otherText ?? null
              )
          )
        }
      }


      if (guest.invited_to_evening === 1) {
        statements.push(
          env.margo_glenn_wedding_db
            .prepare(`
              UPDATE guests
              SET
                evening_rsvp_status = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(
              submittedGuest.evening.status,
              guestId
            )
        )

        statements.push(
          env.margo_glenn_wedding_db
            .prepare(`
              INSERT INTO rsvp_responses (
                guest_id,
                status,
                event_part
              )
              VALUES (?, ?, 'evening')
            `)
            .bind(
              guestId,
              submittedGuest.evening.status
            )
        )

        statements.push(
          env.margo_glenn_wedding_db
            .prepare(`
              DELETE FROM guest_dietary_requirements
              WHERE guest_id = ?
                AND event_part = 'evening'
            `)
            .bind(guestId)
        )

        for (const requirement of submittedGuest.evening.dietaryRequirements || []) {
          statements.push(
            env.margo_glenn_wedding_db
              .prepare(`
                INSERT INTO guest_dietary_requirements (
                  guest_id,
                  event_part,
                  category,
                  other_type,
                  other_text
                )
              VALUES (?, 'evening', ?, ?, ?)
              `)
              .bind(
                guestId,
                requirement.category,
                requirement.otherType ?? null,
                requirement.otherText ?? null
              )
          )
        }
      }
    }


    /*
     * ----------------------------------------------------------
     * Execute transaction
     * ----------------------------------------------------------
     */

    await env.margo_glenn_wedding_db.batch(statements)


    /*
     * ----------------------------------------------------------
     * Success
     * ----------------------------------------------------------
     */

    return Response.json({
      ok: true
    })
  } catch (error) {
    console.error('RSVP submission failed:', error)

    return Response.json(
      {
        ok: false,
        error: 'Unable to save RSVP'
      },
      {
        status: 500
      }
    )
  }
}


/*
 * ------------------------------------------------------------
 * Dietary requirement validation
 * ------------------------------------------------------------
 */

function validateDietaryRequirements(requirements) {
  if (requirements === undefined) {
    return null
  }

  if (!Array.isArray(requirements)) {
    return 'Invalid dietary requirements'
  }

  const allowedCategories = new Set([
    'vegetarian',
    'vegan',
    'gluten',
    'lactose',
    'nuts',
    'shellfish',
    'fish',
    'other'
  ])

  const seenCategories = new Set()

  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== 'object') {
      return 'Invalid dietary requirement'
    }

    const category = requirement.category

    if (!allowedCategories.has(category)) {
      return 'Invalid dietary requirement category'
    }

    if (seenCategories.has(category)) {
      return 'Duplicate dietary requirement'
    }

    seenCategories.add(category)

    if (category === 'other') {
      if (
        !['preference', 'allergy'].includes(requirement.otherType) ||
        typeof requirement.otherText !== 'string' ||
        requirement.otherText.trim().length === 0
      ) {
        return 'Other dietary requirement requires a type and description'
      }
    } else {
      if (
        requirement.otherType !== undefined &&
        requirement.otherType !== null
      ) {
        return 'Invalid dietary requirement'
      }

      if (
        requirement.otherText !== undefined &&
        requirement.otherText !== null
      ) {
        return 'Invalid dietary requirement'
      }
    }
  }

  return null
}