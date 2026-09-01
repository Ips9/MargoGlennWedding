export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    /*
     * ==========================================================
     * ADMIN
     * ==========================================================
     *
     * Cloudflare Access must protect:
     *
     *   /admin*
     *
     * Access authenticates the user before the Worker runs.
     * We then use ctx.access to verify that Access actually
     * authenticated the request.
     *
     * ==========================================================
     */

    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return handleAdminPage(request, env, ctx)
    }

    if (url.pathname.startsWith('/admin/api/')) {
      return handleAdminApi(request, env, ctx)
    }


    /*
     * ==========================================================
     * PUBLIC API
     * ==========================================================
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
     * ==========================================================
     * STATIC WEBSITE
     * ==========================================================
     */

    return env.ASSETS.fetch(request)
  }
}


/*
 * ============================================================
 * ACCESS
 * ============================================================
 */

async function getAccessIdentity(ctx) {
  if (!ctx.access) {
    return null
  }

  try {
    return await ctx.access.getIdentity()
  } catch (error) {
    console.error('Cloudflare Access identity lookup failed:', error)
    return null
  }
}


/*
 * ============================================================
 * ADMIN PAGE
 * ============================================================
 */

async function handleAdminPage(request, env, ctx) {
  const identity = await getAccessIdentity(ctx)

  if (!identity) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  /*
   * admin.html lives in:
   *
   *   public/admin.html
   *
   * We serve that file instead of the normal website.
   */

  return env.ASSETS.fetch(
    new Request(
      new URL('/admin.html', request.url),
      request
    )
  )
}


/*
 * ============================================================
 * ADMIN API
 * ============================================================
 */

async function handleAdminApi(request, env, ctx) {
  const identity = await getAccessIdentity(ctx)

  if (!identity) {
    return Response.json(
      {
        ok: false,
        error: 'Unauthorized'
      },
      {
        status: 401
      }
    )
  }

  const url = new URL(request.url)


  /*
   * ----------------------------------------------------------
   * GET /admin/api/health
   * ----------------------------------------------------------
   */

  if (
    url.pathname === '/admin/api/health' &&
    request.method === 'GET'
  ) {
    return Response.json({
      ok: true,
      authenticated: true,
      email: identity.email ?? null
    })
  }


  /*
   * ----------------------------------------------------------
   * GET /admin/api/dashboard
   * ----------------------------------------------------------
   */

  if (
    url.pathname === '/admin/api/dashboard' &&
    request.method === 'GET'
  ) {
    return handleAdminDashboard(env, identity)
  }


  /*
   * ----------------------------------------------------------
   * POST /admin/api/invitation/toggle
   * ----------------------------------------------------------
   */

  if (
    url.pathname === '/admin/api/invitation/toggle' &&
    request.method === 'POST'
  ) {
    return handleAdminInvitationToggle(
      request,
      env,
      identity
    )
  }


  /*
   * ----------------------------------------------------------
   * Unknown endpoint
   * ----------------------------------------------------------
   */

  return Response.json(
    {
      ok: false,
      error: 'Not found'
    },
    {
      status: 404
    }
  )
}


/*
 * ============================================================
 * ADMIN DASHBOARD
 * ============================================================
 */

async function handleAdminDashboard(env, identity) {
  try {

    /*
     * --------------------------------------------------------
     * Invitations
     * --------------------------------------------------------
     */

    const invitationResult =
      await env.margo_glenn_wedding_db
        .prepare(`
          SELECT
            id,
            invitation_code,
            active
          FROM invitations
          ORDER BY id
        `)
        .all()


    /*
     * --------------------------------------------------------
     * Guests
     * --------------------------------------------------------
     */

    const guestResult =
      await env.margo_glenn_wedding_db
        .prepare(`
          SELECT
            id,
            invitation_id,
            name,
            invited_to_dinner,
            invited_to_evening,
            rsvp_status,
            dinner_rsvp_status,
            evening_rsvp_status
          FROM guests
          ORDER BY invitation_id, id
        `)
        .all()


    /*
     * --------------------------------------------------------
     * Dietary requirements
     * --------------------------------------------------------
     */

    const dietaryResult =
      await env.margo_glenn_wedding_db
        .prepare(`
          SELECT
            id,
            guest_id,
            event_part,
            category,
            other_type,
            other_text
          FROM guest_dietary_requirements
          ORDER BY guest_id, event_part, id
        `)
        .all()


    /*
     * --------------------------------------------------------
     * RSVP history
     * --------------------------------------------------------
     */

    const rsvpResult =
      await env.margo_glenn_wedding_db
        .prepare(`
          SELECT
            id,
            guest_id,
            status,
            event_part,
            created_at
          FROM rsvp_responses
          ORDER BY created_at DESC
        `)
        .all()


    /*
     * --------------------------------------------------------
     * Build invitation structure
     * --------------------------------------------------------
     */

    const invitations =
      invitationResult.results.map((invitation) => {

        const guests =
          guestResult.results
            .filter(
              (guest) =>
                guest.invitation_id === invitation.id
            )
            .map((guest) => {

              const dietaryRequirements =
                dietaryResult.results
                  .filter(
                    (requirement) =>
                      requirement.guest_id === guest.id
                  )
                  .map((requirement) => ({
                    id: requirement.id,
                    eventPart: requirement.event_part,
                    category: requirement.category,
                    otherType: requirement.other_type,
                    otherText: requirement.other_text
                  }))


              const rsvpHistory =
                rsvpResult.results
                  .filter(
                    (response) =>
                      response.guest_id === guest.id
                  )
                  .map((response) => ({
                    id: response.id,
                    status: response.status,
                    eventPart: response.event_part,
                    createdAt: response.created_at
                  }))


              return {
                id: guest.id,
                name: guest.name,

                invitedToDinner:
                  guest.invited_to_dinner === 1,

                invitedToEvening:
                  guest.invited_to_evening === 1,

                rsvpStatus:
                  guest.rsvp_status,

                dinnerRsvpStatus:
                  guest.dinner_rsvp_status,

                eveningRsvpStatus:
                  guest.evening_rsvp_status,

                dietaryRequirements,

                rsvpHistory
              }
            })


        return {
          id: invitation.id,

          invitationCode:
            invitation.invitation_code,

          active:
            invitation.active === 1,

          guests
        }
      })


    /*
     * --------------------------------------------------------
     * Summary
     * --------------------------------------------------------
     */

    const allGuests = guestResult.results

    const summary = {
      invitations:
        invitations.length,

      activeInvitations:
        invitations.filter(
          (invitation) => invitation.active
        ).length,

      guests:
        allGuests.length,

      dinnerAttending:
        allGuests.filter(
          (guest) =>
            guest.dinner_rsvp_status === 'attending'
        ).length,

      dinnerDeclined:
        allGuests.filter(
          (guest) =>
            guest.dinner_rsvp_status === 'declined'
        ).length,

      eveningAttending:
        allGuests.filter(
          (guest) =>
            guest.evening_rsvp_status === 'attending'
        ).length,

      eveningDeclined:
        allGuests.filter(
          (guest) =>
            guest.evening_rsvp_status === 'declined'
        ).length
    }


    /*
     * --------------------------------------------------------
     * Response
     * --------------------------------------------------------
     */

    return Response.json({
      ok: true,

      admin: {
        email: identity.email ?? null
      },

      summary,

      invitations
    })

  } catch (error) {

    console.error(
      'Admin dashboard failed:',
      error
    )

    return Response.json(
      {
        ok: false,
        error: 'Unable to load admin dashboard'
      },
      {
        status: 500
      }
    )
  }
}


/*
 * ============================================================
 * ADMIN INVITATION TOGGLE
 * ============================================================
 */

async function handleAdminInvitationToggle(
  request,
  env,
  identity
) {
  let body

  /*
   * ----------------------------------------------------------
   * Parse JSON
   * ----------------------------------------------------------
   */

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


  /*
   * ----------------------------------------------------------
   * Validate input
   * ----------------------------------------------------------
   */

  const id = Number(body?.id)
  const active = body?.active

  if (
    !Number.isInteger(id) ||
    typeof active !== 'boolean'
  ) {
    return Response.json(
      {
        ok: false,
        error: 'Invalid invitation data'
      },
      {
        status: 400
      }
    )
  }


  /*
   * ----------------------------------------------------------
   * Update
   * ----------------------------------------------------------
   */

  try {

    const result =
      await env.margo_glenn_wedding_db
        .prepare(`
          UPDATE invitations
          SET active = ?
          WHERE id = ?
        `)
        .bind(
          active ? 1 : 0,
          id
        )
        .run()


    if (result.meta.changes === 0) {
      return Response.json(
        {
          ok: false,
          error: 'Invitation not found'
        },
        {
          status: 404
        }
      )
    }


    console.log(
      `Invitation ${id} set to ${
        active ? 'active' : 'inactive'
      } by ${identity.email ?? 'unknown'}`
    )


    return Response.json({
      ok: true
    })

  } catch (error) {

    console.error(
      'Invitation toggle failed:',
      error
    )

    return Response.json(
      {
        ok: false,
        error: 'Unable to update invitation'
      },
      {
        status: 500
      }
    )
  }
}


/*
 * ============================================================
 * PUBLIC INVITATION API
 * ============================================================
 *
 * GET /api/invitation?code=MG-XXXXXX
 *
 * ============================================================
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

  const rawCode =
    url.searchParams.get('code')


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


  const code =
    rawCode
      .trim()
      .toUpperCase()


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

    /*
     * --------------------------------------------------------
     * Find invitation
     * --------------------------------------------------------
     */

    const invitation =
      await env.margo_glenn_wedding_db
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


    if (
      !invitation ||
      invitation.active !== 1
    ) {
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
     * --------------------------------------------------------
     * Find guests
     * --------------------------------------------------------
     */

    const result =
      await env.margo_glenn_wedding_db
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


    /*
     * --------------------------------------------------------
     * Format response
     * --------------------------------------------------------
     */

    const guests =
      result.results.map((guest) => ({
        id: guest.id,

        name: guest.name,

        invitedToDinner:
          guest.invited_to_dinner === 1,

        invitedToEvening:
          guest.invited_to_evening === 1,

        rsvpStatus:
          guest.rsvp_status,

        dinnerRsvpStatus:
          guest.dinner_rsvp_status,

        eveningRsvpStatus:
          guest.evening_rsvp_status
      }))


    return Response.json({
      ok: true,
      guests
    })

  } catch (error) {

    console.error(
      'Invitation lookup failed:',
      error
    )

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
 * ============================================================
 * PUBLIC RSVP API
 * ============================================================
 *
 * POST /api/rsvp
 *
 * ============================================================
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


  /*
   * ----------------------------------------------------------
   * Parse JSON
   * ----------------------------------------------------------
   */

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


  /*
   * ----------------------------------------------------------
   * Validate invitation code
   * ----------------------------------------------------------
   */

  const code =
    typeof body?.code === 'string'
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


  /*
   * ----------------------------------------------------------
   * Validate guest array
   * ----------------------------------------------------------
   */

  if (
    !Array.isArray(body?.guests) ||
    body.guests.length === 0
  ) {
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
     * --------------------------------------------------------
     * Find invitation
     * --------------------------------------------------------
     */

    const invitation =
      await env.margo_glenn_wedding_db
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


    if (
      !invitation ||
      invitation.active !== 1
    ) {
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
     * --------------------------------------------------------
     * Load RSVP settings
     * --------------------------------------------------------
     */

    const settings =
      await env.margo_glenn_wedding_db
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


    /*
     * --------------------------------------------------------
     * Check deadline
     * --------------------------------------------------------
     */

    const now = new Date()

    const changeDeadline =
      new Date(
        settings.rsvp_change_deadline
      )


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
     * --------------------------------------------------------
     * Load invited guests
     * --------------------------------------------------------
     */

    const guestResult =
      await env.margo_glenn_wedding_db
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


    const guestsById =
      new Map(
        guestResult.results.map(
          (guest) => [
            guest.id,
            guest
          ]
        )
      )


    /*
     * --------------------------------------------------------
     * Validate submitted guests
     * --------------------------------------------------------
     */

    const submittedGuestIds =
      new Set()


    for (const submittedGuest of body.guests) {

      const guestId =
        Number(submittedGuest?.id)


      /*
       * Guest ID
       */

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


      /*
       * Duplicate guest
       */

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


      /*
       * Guest must belong to invitation
       */

      const guest =
        guestsById.get(guestId)


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
       * ------------------------------------------------------
       * Dinner
       * ------------------------------------------------------
       */

      if (guest.invited_to_dinner === 1) {

        const dinner =
          submittedGuest.dinner


        if (
          !dinner ||
          ![
            'attending',
            'declined'
          ].includes(dinner.status)
        ) {
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


        const dietaryError =
          validateDietaryRequirements(
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

      } else if (
        submittedGuest.dinner !== undefined
      ) {

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
       * ------------------------------------------------------
       * Evening
       * ------------------------------------------------------
       */

      if (guest.invited_to_evening === 1) {

        const evening =
          submittedGuest.evening


        if (
          !evening ||
          ![
            'attending',
            'declined'
          ].includes(evening.status)
        ) {
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


        const dietaryError =
          validateDietaryRequirements(
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

      } else if (
        submittedGuest.evening !== undefined
      ) {

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
     * --------------------------------------------------------
     * Require every invited guest
     * --------------------------------------------------------
     */

    for (const guest of guestResult.results) {

      if (
        !submittedGuestIds.has(guest.id)
      ) {
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
     * --------------------------------------------------------
     * Build database statements
     * --------------------------------------------------------
     */

    const statements = []


    for (const submittedGuest of body.guests) {

      const guestId =
        Number(submittedGuest.id)

      const guest =
        guestsById.get(guestId)


      /*
       * ------------------------------------------------------
       * Dinner
       * ------------------------------------------------------
       */

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


        for (
          const requirement
          of submittedGuest.dinner.dietaryRequirements || []
        ) {

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


      /*
       * ------------------------------------------------------
       * Evening
       * ------------------------------------------------------
       */

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


        for (
          const requirement
          of submittedGuest.evening.dietaryRequirements || []
        ) {

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
     * --------------------------------------------------------
     * Execute batch
     * --------------------------------------------------------
     */

    await env.margo_glenn_wedding_db
      .batch(statements)


    /*
     * --------------------------------------------------------
     * Success
     * --------------------------------------------------------
     */

    return Response.json({
      ok: true
    })

  } catch (error) {

    console.error(
      'RSVP submission failed:',
      error
    )

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
 * ============================================================
 * DIETARY REQUIREMENT VALIDATION
 * ============================================================
 */

function validateDietaryRequirements(requirements) {

  /*
   * No requirements is valid.
   */

  if (requirements === undefined) {
    return null
  }


  /*
   * Must be an array.
   */

  if (!Array.isArray(requirements)) {
    return 'Invalid dietary requirements'
  }


  /*
   * Allowed categories.
   */

  const allowedCategories =
    new Set([
      'vegetarian',
      'vegan',
      'gluten',
      'lactose',
      'nuts',
      'shellfish',
      'fish',
      'other'
    ])


  const seenCategories =
    new Set()


  /*
   * Validate each requirement.
   */

  for (const requirement of requirements) {

    if (
      !requirement ||
      typeof requirement !== 'object'
    ) {
      return 'Invalid dietary requirement'
    }


    const category =
      requirement.category


    /*
     * Category must be allowed.
     */

    if (
      !allowedCategories.has(category)
    ) {
      return 'Invalid dietary requirement category'
    }


    /*
     * Same category cannot be submitted twice.
     */

    if (
      seenCategories.has(category)
    ) {
      return 'Duplicate dietary requirement'
    }


    seenCategories.add(category)


    /*
     * "Other" requires type + description.
     */

    if (category === 'other') {

      if (
        ![
          'preference',
          'allergy'
        ].includes(
          requirement.otherType
        ) ||
        typeof requirement.otherText !== 'string' ||
        requirement.otherText.trim().length === 0
      ) {
        return 'Other dietary requirement requires a type and description'
      }

    } else {

      /*
       * Other fields are not allowed for normal categories.
       */

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