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
          Allow: 'GET'
        }
      }
    )
  }

  const url = new URL(request.url)
  const rawCode = url.searchParams.get('code')

  if (!rawCode) {
    return invalidInvitationResponse()
  }

  const code = rawCode.trim().toUpperCase()

  if (!/^MG-[A-Z0-9]{6}$/.test(code)) {
    return invalidInvitationResponse()
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
      return invalidInvitationResponse()
    }

    const result = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          id,
          name,
          invited_to_dinner,
          invited_to_evening,
          dinner_rsvp_status,
          evening_rsvp_status
        FROM guests
        WHERE invitation_id = ?
        ORDER BY id
      `)
      .bind(invitation.id)
      .all()

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

    const guests = result.results.map((guest) => ({
      id: guest.id,
      name: guest.name,
      invitedToDinner: guest.invited_to_dinner === 1,
      invitedToEvening: guest.invited_to_evening === 1,
      dinnerRsvpStatus: guest.dinner_rsvp_status,
      eveningRsvpStatus: guest.evening_rsvp_status
    }))

    return Response.json({
      ok: true,
      guests,
      deadlines: settings
        ? {
            rsvpDeadline: settings.rsvp_deadline,
            rsvpChangeDeadline: settings.rsvp_change_deadline
          }
        : null
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
 * Expected body:
 *
 * {
 *   "code": "MG-XXXXXX",
 *   "guests": [
 *     {
 *       "id": 1,
 *       "dinner": "attending",
 *       "evening": "declined",
 *       "dietary": {
 *         "dinner": [
 *           {
 *             "category": "vegetarian"
 *           }
 *         ],
 *         "evening": []
 *       }
 *     }
 *   ]
 * }
 *
 * The invitation code is treated as a bearer credential.
 * The server never trusts guest IDs without verifying that
 * they belong to the supplied invitation.
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
          Allow: 'POST'
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
        error: 'Invalid request'
      },
      {
        status: 400
      }
    )
  }

  const rawCode = body?.code

  if (typeof rawCode !== 'string') {
    return Response.json(
      {
        ok: false,
        error: 'Invalid invitation'
      },
      {
        status: 400
      }
    )
  }

  const code = rawCode.trim().toUpperCase()

  if (!/^MG-[A-Z0-9]{6}$/.test(code)) {
    return invalidInvitationResponse()
  }

  if (!Array.isArray(body.guests) || body.guests.length === 0) {
    return Response.json(
      {
        ok: false,
        error: 'No guests supplied'
      },
      {
        status: 400
      }
    )
  }

  try {
    /*
     * --------------------------------------------------------
     * Resolve invitation
     * --------------------------------------------------------
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
      return invalidInvitationResponse()
    }

    /*
     * --------------------------------------------------------
     * Load actual guests belonging to invitation.
     * --------------------------------------------------------
     */

    const guestResult = await env.margo_glenn_wedding_db
      .prepare(`
        SELECT
          id,
          invited_to_dinner,
          invited_to_evening,
          dinner_rsvp_status,
          evening_rsvp_status
        FROM guests
        WHERE invitation_id = ?
        ORDER BY id
      `)
      .bind(invitation.id)
      .all()

    const guestsById = new Map(
      guestResult.results.map((guest) => [guest.id, guest])
    )

    /*
     * Never allow the client to submit guests belonging
     * to another invitation.
     */

    for (const submittedGuest of body.guests) {
      if (
        !Number.isInteger(submittedGuest?.id) ||
        !guestsById.has(submittedGuest.id)
      ) {
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
    }

    /*
     * Prevent duplicate guest IDs in one submission.
     */

    const submittedIds = body.guests.map((guest) => guest.id)

    if (new Set(submittedIds).size !== submittedIds.length) {
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

    /*
     * --------------------------------------------------------
     * Load wedding deadlines.
     * --------------------------------------------------------
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
          error: 'Wedding settings unavailable'
        },
        {
          status: 500
        }
      )
    }

    const now = new Date()
    const changeDeadline = new Date(settings.rsvp_change_deadline)

    /*
     * Once the change deadline has passed, guests can no longer
     * modify their RSVP themselves.
     */

    if (now > changeDeadline) {
      return Response.json(
        {
          ok: false,
          error: 'RSVP changes are closed'
        },
        {
          status: 403
        }
      )
    }

    /*
     * --------------------------------------------------------
     * Validate every guest submission before writing anything.
     * --------------------------------------------------------
     */

    const allowedDietaryCategories = new Set([
      'vegetarian',
      'vegan',
      'gluten',
      'lactose',
      'nuts',
      'shellfish',
      'fish',
      'other'
    ])

    const allowedOtherTypes = new Set([
      'preference',
      'allergy'
    ])

    for (const submittedGuest of body.guests) {
      const guest = guestsById.get(submittedGuest.id)

      /*
       * Dinner RSVP
       */

      if (submittedGuest.dinner !== undefined) {
        if (!guest.invited_to_dinner) {
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

        if (!['attending', 'declined'].includes(submittedGuest.dinner)) {
          return Response.json(
            {
              ok: false,
              error: 'Invalid dinner RSVP'
            },
            {
              status: 400
            }
          )
        }
      }

      /*
       * Evening RSVP
       */

      if (submittedGuest.evening !== undefined) {
        if (!guest.invited_to_evening) {
          return Response.json(
            {
              ok: false,
              error: 'Guest is not invited to evening party'
            },
            {
              status: 400
            }
          )
        }

        if (!['attending', 'declined'].includes(submittedGuest.evening)) {
          return Response.json(
            {
              ok: false,
              error: 'Invalid evening RSVP'
            },
            {
              status: 400
            }
          )
        }
      }

      /*
       * Dietary requirements
       */

      if (submittedGuest.dietary !== undefined) {
        const dietary = submittedGuest.dietary

        if (
          dietary === null ||
          typeof dietary !== 'object'
        ) {
          return Response.json(
            {
              ok: false,
              error: 'Invalid dietary information'
            },
            {
              status: 400
            }
          )
        }

        for (const eventPart of ['dinner', 'evening']) {
          if (dietary[eventPart] === undefined) {
            continue
          }

          if (!Array.isArray(dietary[eventPart])) {
            return Response.json(
              {
                ok: false,
                error: `Invalid dietary information for ${eventPart}`
              },
              {
                status: 400
              }
            )
          }

          /*
           * A guest may select each category only once.
           */

          const categories = dietary[eventPart].map(
            (item) => item?.category
          )

          if (new Set(categories).size !== categories.length) {
            return Response.json(
              {
                ok: false,
                error: `Duplicate dietary category for ${eventPart}`
              },
              {
                status: 400
              }
            )
          }

          for (const item of dietary[eventPart]) {
            if (!allowedDietaryCategories.has(item?.category)) {
              return Response.json(
                {
                  ok: false,
                  error: 'Invalid dietary category'
                },
                {
                  status: 400
                }
              )
            }

            if (item.category === 'other') {
              if (
                !allowedOtherTypes.has(item?.otherType) ||
                typeof item?.otherText !== 'string' ||
                item.otherText.trim().length === 0
              ) {
                return Response.json(
                  {
                    ok: false,
                    error: 'Invalid other dietary requirement'
                  },
                  {
                    status: 400
                  }
                )
              }
            } else {
              if (
                item?.otherType !== undefined ||
                item?.otherText !== undefined
              ) {
                return Response.json(
                  {
                    ok: false,
                    error: 'Invalid dietary information'
                  },
                  {
                    status: 400
                  }
                )
              }
            }
          }
        }
      }
    }

    /*
     * --------------------------------------------------------
     * Write RSVP data.
     * --------------------------------------------------------
     *
     * We deliberately update only the supplied guests.
     * This makes the API suitable for both one-person and
     * multi-person invitations.
     * --------------------------------------------------------
     */

    for (const submittedGuest of body.guests) {
      const guest = guestsById.get(submittedGuest.id)

      if (submittedGuest.dinner !== undefined) {
        await env.margo_glenn_wedding_db
          .prepare(`
            UPDATE guests
            SET
              dinner_rsvp_status = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND invitation_id = ?
          `)
          .bind(
            submittedGuest.dinner,
            submittedGuest.id,
            invitation.id
          )
          .run()

        await env.margo_glenn_wedding_db
          .prepare(`
            INSERT INTO rsvp_responses (
              guest_id,
              status
            )
            VALUES (?, ?)
          `)
          .bind(
            submittedGuest.id,
            submittedGuest.dinner
          )
          .run()
      }

      if (submittedGuest.evening !== undefined) {
        await env.margo_glenn_wedding_db
          .prepare(`
            UPDATE guests
            SET
              evening_rsvp_status = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND invitation_id = ?
          `)
          .bind(
            submittedGuest.evening,
            submittedGuest.id,
            invitation.id
          )
          .run()

        await env.margo_glenn_wedding_db
          .prepare(`
            INSERT INTO rsvp_responses (
              guest_id,
              status
            )
            VALUES (?, ?)
          `)
          .bind(
            submittedGuest.id,
            submittedGuest.evening
          )
          .run()
      }

      /*
       * Replace dietary requirements for the supplied guest.
       *
       * This means editing an RSVP also edits the catering
       * information cleanly.
       */

      if (submittedGuest.dietary !== undefined) {
        await env.margo_glenn_wedding_db
          .prepare(`
            DELETE FROM guest_dietary_requirements
            WHERE guest_id = ?
          `)
          .bind(submittedGuest.id)
          .run()

        for (const eventPart of ['dinner', 'evening']) {
          const requirements =
            submittedGuest.dietary[eventPart] ?? []

          for (const requirement of requirements) {
            await env.margo_glenn_wedding_db
              .prepare(`
                INSERT INTO guest_dietary_requirements (
                  guest_id,
                  event_part,
                  category,
                  other_type,
                  other_text
                )
                VALUES (?, ?, ?, ?, ?)
              `)
              .bind(
                submittedGuest.id,
                eventPart,
                requirement.category,
                requirement.otherType ?? null,
                requirement.otherText?.trim() ?? null
              )
              .run()
          }
        }
      }
    }

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
 * Helpers
 * ------------------------------------------------------------
 */

function invalidInvitationResponse() {
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