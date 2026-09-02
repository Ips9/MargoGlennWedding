import './style.css'

const weddingDate = new Date('2027-10-02T00:00:00')

const calendarEvent = {
  title: 'Margo & Glenn — Onze trouwdag',
  location: 'Hottentot Hoeve, Cassenbroek 1, 2820 Bonheiden',
  description: 'Trouwdag van Margo & Glenn.',
  startDate: '20271002',
  endDate: '20271003',
  startDateTime: '2027-10-02T00:00:00',
  endDateTime: '2027-10-03T00:00:00'
}


/* =========================
   CALENDAR
========================= */

function createCalendarFile() {

  const event = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Margo & Glenn//Wedding//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:margo-glenn-2027-10-02@wedding',
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART;VALUE=DATE:${calendarEvent.startDate}`,
    `DTEND;VALUE=DATE:${calendarEvent.endDate}`,
    `SUMMARY:${escapeICS(calendarEvent.title)}`,
    `LOCATION:${escapeICS(calendarEvent.location)}`,
    `DESCRIPTION:${escapeICS(calendarEvent.description)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  const blob = new Blob([event], {
    type: 'text/calendar;charset=utf-8'
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'Margo-en-Glenn-02-10-2027.ics'

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}


function formatICSDate(date) {

  const year =
    date.getUTCFullYear()

  const month =
    String(
      date.getUTCMonth() + 1
    ).padStart(2, '0')

  const day =
    String(
      date.getUTCDate()
    ).padStart(2, '0')

  const hours =
    String(
      date.getUTCHours()
    ).padStart(2, '0')

  const minutes =
    String(
      date.getUTCMinutes()
    ).padStart(2, '0')

  const seconds =
    String(
      date.getUTCSeconds()
    ).padStart(2, '0')

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}


function escapeICS(value) {

  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}


/* =========================
   COUNTDOWN
========================= */

function formatCountdown() {

  const now = new Date()

  const difference =
    weddingDate - now


  if (difference <= 0) {
    return 'Vandaag is onze dag ♡'
  }


  const days =
    Math.floor(
      difference /
      (1000 * 60 * 60 * 24)
    )


  const hours =
    Math.floor(
      (difference /
        (1000 * 60 * 60)) % 24
    )


  const minutes =
    Math.floor(
      (difference /
        (1000 * 60)) % 60
    )


  return `${days} dagen · ${hours} uur · ${minutes} minuten`
}


/* =========================
   GOOGLE CALENDAR
========================= */

function openGoogleCalendar() {

  const url =
    'https://calendar.google.com/calendar/render' +
    '?action=TEMPLATE' +
    `&text=${encodeURIComponent(
      calendarEvent.title
    )}` +
    `&dates=${calendarEvent.startDate}/${calendarEvent.endDate}` +
    `&location=${encodeURIComponent(
      calendarEvent.location
    )}` +
    `&details=${encodeURIComponent(
      calendarEvent.description
    )}`

  window.open(
    url,
    '_blank'
  )
}


/* =========================
   OUTLOOK CALENDAR
========================= */

function openOutlookCalendar() {

  const url =
    'https://outlook.live.com/calendar/0/deeplink/compose' +
    `?subject=${encodeURIComponent(
      calendarEvent.title
    )}` +
    `&startdt=${encodeURIComponent(
      calendarEvent.startDateTime
    )}` +
    `&enddt=${encodeURIComponent(
      calendarEvent.endDateTime
    )}` +
    `&location=${encodeURIComponent(
      calendarEvent.location
    )}` +
    `&body=${encodeURIComponent(
      calendarEvent.description
    )}`

  window.open(
    url,
    '_blank'
  )
}


/* =========================
   PAGE
========================= */

document.querySelector('#app').innerHTML = `

  <main class="site">

    <!-- =========================
         HERO
    ========================== -->

    <section class="hero">

      <div class="hero-decoration hero-decoration-left"></div>

      <div class="hero-decoration hero-decoration-right"></div>

      <div class="hero-content">

        <img
          class="wedding-logo"
          src="/logo.png"
          alt="Margo & Glenn — 2 oktober 2027"
        />

        <div class="hero-divider">

          <span></span>

          <span class="heart">♡</span>

          <span></span>

        </div>

        <p class="eyebrow">
          Onze trouwdag
        </p>

        <h1>
          Laat ons weten<br />
          <em>of je er kan bij zijn</em>
        </h1>

        <p class="intro">
          Op 2 oktober 2027 vieren we graag samen met jullie
          onze liefde en de start van onze toekomst als man en vrouw.
        </p>

        <div class="hero-actions">

          <a
            href="#rsvp"
            class="button button-primary"
          >
            RSVP
          </a>

          <button
            id="calendarButton"
            class="button button-secondary"
            type="button"
          >
            Voeg toe aan kalender
          </button>

        </div>

      </div>

    </section>


    <!-- =========================
         ONZE DAG
    ========================== -->

    <section
      id="details"
      class="section details-section"
    >

      <div class="section-heading">

        <p class="eyebrow">
          02 · 10 · 2027
        </p>

        <h2>
          Onze dag
        </h2>

        <div class="small-line"></div>

        <div class="adults-only">

          <strong>
            Adults only
          </strong>

          <p>
            Een avond zonder zorgen voor iedereen.<br />
            Daarom vieren we onze dag graag samen zonder kinderen.
          </p>

        </div>

      </div>


      <div class="details-grid">

        <article class="detail-card">

          <div class="detail-icon">
            ♡
          </div>

          <h3>
            Wanneer
          </h3>

          <p>
            Zaterdag<br />
            <strong>
              2 oktober 2027
            </strong>
          </p>

        </article>


        <article class="detail-card">

          <div class="detail-icon">
            ⌖
          </div>

          <h3>
            Waar
          </h3>

          <p>
            <strong>
              Hottentot Hoeve
            </strong><br />
            Cassenbroek 1<br />
            2820 Bonheiden
          </p>

          <a
            class="text-link"
            href="https://www.google.com/maps/search/?api=1&query=Hottentot+Hoeve+Bonheiden"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bekijk de locatie →
          </a>

        </article>

      </div>

    </section>


    <!-- =========================
         COUNTDOWN
    ========================== -->

    <section class="countdown-section">

      <div class="countdown-inner">

        <p class="eyebrow">
          En tot dan...
        </p>

        <h2>
          We tellen samen af
        </h2>

        <div
          id="countdown"
          class="countdown"
        >
          ${formatCountdown()}
        </div>

        <div class="hero-divider">

          <span></span>

          <span class="heart">
            ♡
          </span>

          <span></span>

        </div>

      </div>

    </section>


    <!-- =========================
         PRAKTISCH
    ========================== -->

    <section class="section practical-section">

      <div class="section-heading">

        <p class="eyebrow">
          Praktisch
        </p>

        <h2>
          Alle details op één plek
        </h2>

        <div class="small-line"></div>

      </div>


      <div class="practical-content">

        <div class="practical-item">

          <h3>
            📍 Locatie
          </h3>

          <p>
            <strong>
              Hottentot Hoeve
            </strong><br />
            Cassenbroek 1<br />
            2820 Bonheiden
          </p>

          <a
            class="button button-secondary"
            href="https://www.google.com/maps/search/?api=1&query=Hottentot+Hoeve+Bonheiden"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bekijk locatie
          </a>

        </div>


        <div class="practical-item">

          <h3>
            📅 Kalender
          </h3>

          <p>
            Zet onze trouwdag alvast in je agenda
            zodat je hem zeker vrijhoudt.
          </p>

          <div class="calendar-buttons">

            <button
              id="calendarButton2"
              class="calendar-icon-button"
              type="button"
              aria-label="Download kalenderbestand"
              title="Download kalenderbestand"
            >
              📅
            </button>

            <button
              id="googleCalendarButton"
              class="calendar-icon-button"
              type="button"
              aria-label="Google Calendar"
              title="Google Calendar"
            >
              <span class="calendar-provider-icon google-calendar-icon">
                G
              </span>
            </button>

            <button
              id="outlookCalendarButton"
              class="calendar-icon-button"
              type="button"
              aria-label="Outlook Calendar"
              title="Outlook Calendar"
            >
              <span class="calendar-provider-icon outlook-calendar-icon">
                O
              </span>
            </button>

            <button
              id="appleCalendarButton"
              class="calendar-icon-button"
              type="button"
              aria-label="Apple Calendar"
              title="Apple Calendar"
            >
              <span class="calendar-provider-icon apple-calendar-icon">
                A
              </span>
            </button>

          </div>

          <p class="calendar-help">
            📅 = kalenderbestand · G = Google · O = Outlook · A = Apple
          </p>

        </div>

      </div>

    </section>


    <!-- =========================
         RSVP
    ========================== -->

    <section
      id="rsvp"
      class="section rsvp-section"
    >

      <div class="section-heading">

        <p class="eyebrow">
          RSVP
        </p>

        <h2>
          Laat ons weten of je erbij bent
        </h2>

        <div class="small-line"></div>

      </div>


      <div class="rsvp-content">

        <div id="rsvp-app">

          <!-- =====================
               UITNODIGING
          ====================== -->

          <div
            class="invitation-card"
            id="invitationCard"
          >

            <div class="invitation-card-inner">

              <div class="invitation-card-decoration">
                ♡
              </div>

              <p class="eyebrow">
                Onze persoonlijke uitnodiging
              </p>

              <h3>
                Voor jullie
              </h3>

              <p class="invitation-card-intro">
                Open hieronder je persoonlijke uitnodiging
                met de code die je van ons kreeg.
              </p>

              <button
                type="button"
                id="openInvitationButton"
                class="button button-primary"
              >
                Open mijn uitnodiging
              </button>


              <!-- =====================
                   CODE FORMULIER
              ====================== -->

              <div
                id="invitation-code-panel"
                class="invitation-code-panel"
                hidden
              >

                <div class="invitation-card-divider">

                  <span></span>

                  <span>
                    ♡
                  </span>

                  <span></span>

                </div>

                <p class="invitation-code-label">
                  Persoonlijke uitnodigingscode
                </p>

                <form
                  id="invitationForm"
                >

                  <div class="rsvp-code-row">

                    <input
                      id="invitationCode"
                      name="invitationCode"
                      type="text"
                      placeholder="MG-XXXXXX"
                      autocomplete="off"
                      maxlength="9"
                      required
                    />

                    <button
                      type="submit"
                      class="button button-primary"
                    >
                      Open uitnodiging
                    </button>

                  </div>

                </form>

              </div>

            </div>

          </div>


          <!-- =====================
               ERROR
          ====================== -->

          <div
            id="invitationError"
            class="rsvp-message rsvp-error"
            hidden
          ></div>


          <!-- =====================
               RSVP FORM
          ====================== -->

          <div
            id="rsvp-form-container"
            hidden
          >

            <div class="rsvp-invitation-heading">

              <p class="eyebrow">
                Welkom
              </p>

              <h3 id="invitationHeading"></h3>

              <p id="invitationIntro"></p>

            </div>

            <form id="rsvpForm">

              <div id="guestList"></div>

              <div class="rsvp-submit-area">

                <button
                  type="submit"
                  class="button button-primary"
                >
                  Bevestig RSVP
                </button>

              </div>

            </form>

          </div>


          <!-- =====================
               SUCCESS
          ====================== -->

          <div
            id="rsvp-success"
            class="rsvp-message rsvp-success"
            hidden
          ></div>

        </div>

      </div>

    </section>


    <!-- =========================
         FOOTER
    ========================== -->

    <footer class="footer">

      <div class="footer-divider">

        <span></span>

        <span class="heart">
          ♡
        </span>

        <span></span>

      </div>

      <p>
        Margo &amp; Glenn
      </p>

      <small>
        02 · 10 · 2027
      </small>

    </footer>

  </main>
`


/* =========================
   RSVP STATE
========================= */

let currentInvitationCode = null
let currentInvitation = null


/* =========================
   LOAD INVITATION
========================= */

async function loadInvitation(code) {

  const errorElement =
    document.querySelector(
      '#invitationError'
    )

  const invitationCard =
    document.querySelector(
      '#invitationCard'
    )

  const formContainer =
    document.querySelector(
      '#rsvp-form-container'
    )

  const success =
    document.querySelector(
      '#rsvp-success'
    )


  if (!errorElement ||
      !invitationCard ||
      !formContainer ||
      !success) {
    return
  }


  errorElement.hidden = true
  errorElement.textContent = ''

  success.hidden = true
  formContainer.hidden = true


  try {

    const response =
      await fetch(
        `/api/invitation?code=${encodeURIComponent(code)}`
      )


    const data =
      await response.json()


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        'Deze uitnodigingscode is ongeldig.'
      )
    }


    currentInvitationCode = code
    currentInvitation = data


    renderInvitation(data)


    invitationCard.hidden = true

    formContainer.hidden = false


  } catch (error) {

    console.error(
      'Invitation loading failed:',
      error
    )


    errorElement.textContent =
      error.message ||
      'Deze uitnodigingscode is ongeldig.'


    errorElement.hidden = false
  }
}


/* =========================
   RENDER INVITATION
========================= */

function renderInvitation(data) {

  const heading =
    document.querySelector(
      '#invitationHeading'
    )

  const intro =
    document.querySelector(
      '#invitationIntro'
    )

  const guestList =
    document.querySelector(
      '#guestList'
    )


  if (!heading ||
      !intro ||
      !guestList) {
    return
  }


  const guests =
    Array.isArray(data.guests)
      ? data.guests
      : []


  heading.textContent =
    guests.length === 1
      ? `Welkom ${guests[0].name}`
      : 'Welkom'


  intro.textContent =
    'Laat ons weten voor welke onderdelen jullie aanwezig zullen zijn.'


  guestList.innerHTML =
    guests
      .map(renderGuest)
      .join('')


  setupDietaryControls(
    guestList
  )
}


/* =========================
   RENDER GUEST
========================= */

function renderGuest(guest) {

  const dinnerStatus =
    guest.dinnerRsvpStatus ||
    ''


  const eveningStatus =
    guest.eveningRsvpStatus ||
    ''


  const dinnerRequirements =
    Array.isArray(
      guest.dinnerDietaryRequirements
    )
      ? guest.dinnerDietaryRequirements
      : []


  const eveningRequirements =
    Array.isArray(
      guest.eveningDietaryRequirements
    )
      ? guest.eveningDietaryRequirements
      : []


  return `

    <article
      class="rsvp-guest"
      data-guest-id="${guest.id}"
    >

      <div class="rsvp-guest-heading">

        <h4>
          ${escapeHtml(guest.name)}
        </h4>

      </div>


      ${
        guest.invitedToDinner
          ? renderEventChoice(
              'dinner',
              guest.id,
              'Diner',
              'Zaterdag 2 oktober 2027',
              dinnerStatus,
              dinnerRequirements
            )
          : ''
      }


      ${
        guest.invitedToEvening
          ? renderEventChoice(
              'evening',
              guest.id,
              'Avondfeest',
              'Zaterdag 2 oktober 2027',
              eveningStatus,
              eveningRequirements
            )
          : ''
      }

    </article>

  `
}


/* =========================
   RENDER EVENT CHOICE
========================= */

function renderEventChoice(
  eventPart,
  guestId,
  title,
  date,
  currentStatus,
  dietaryRequirements
) {

  const attending =
    currentStatus === 'attending'


  const declined =
    currentStatus === 'declined'


  return `

    <div class="rsvp-event">

      <div class="rsvp-event-heading">

        <div>

          <h5>
            ${title}
          </h5>

          <span>
            ${date}
          </span>

        </div>

      </div>


      <div class="rsvp-choice-group">

        <label class="rsvp-choice">

          <input
            type="radio"
            name="${eventPart}-${guestId}"
            value="attending"
            ${attending ? 'checked' : ''}
            required
          />

          <span>
            Ja, ik kom
          </span>

        </label>


        <label class="rsvp-choice">

          <input
            type="radio"
            name="${eventPart}-${guestId}"
            value="declined"
            ${declined ? 'checked' : ''}
            required
          />

          <span>
            Nee, ik kom niet
          </span>

        </label>

      </div>


      <div
        class="rsvp-dietary-wrapper"
        data-dietary-wrapper="${eventPart}-${guestId}"
        ${attending ? '' : 'hidden'}
      >

        ${renderDietarySection(
          eventPart,
          guestId,
          dietaryRequirements
        )}

      </div>

    </div>

  `
}


/* =========================
   DIETARY SECTION
========================= */

function renderDietarySection(
  eventPart,
  guestId,
  requirements
) {

  const hasRequirement =
    category =>
      requirements.some(
        requirement =>
          requirement.category === category
      )


  const otherRequirement =
    requirements.find(
      requirement =>
        requirement.category === 'other'
    )


  const otherChecked =
    Boolean(otherRequirement)


  return `

    <div
      class="rsvp-dietary"
      data-dietary-event="${eventPart}"
      data-guest-id="${guestId}"
    >

      <h6>
        Allergieën &amp; dieetvoorkeuren
      </h6>

      <p>
        Heb je een allergie, intolerantie of dieetvoorkeur?
        Duid hieronder aan wat voor jou van toepassing is.
      </p>


      <div class="dietary-options">

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'vegetarian',
          'Vegetarisch',
          hasRequirement('vegetarian')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'vegan',
          'Veganistisch',
          hasRequirement('vegan')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'gluten',
          'Glutenvrij',
          hasRequirement('gluten')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'lactose',
          'Lactosevrij',
          hasRequirement('lactose')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'nuts',
          'Noten',
          hasRequirement('nuts')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'shellfish',
          'Schaaldieren',
          hasRequirement('shellfish')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'fish',
          'Vis',
          hasRequirement('fish')
        )}

        ${renderDietaryCheckbox(
          eventPart,
          guestId,
          'other',
          'Iets anders',
          otherChecked
        )}

      </div>


      <div
        class="dietary-other"
        data-dietary-other="${eventPart}-${guestId}"
        ${otherChecked ? '' : 'hidden'}
      >

        <p class="dietary-other-label">
          Is dit een allergie of een voorkeur?
        </p>


        <div class="dietary-other-types">

          <label>

            <input
              type="radio"
              name="${eventPart}-other-type-${guestId}"
              value="allergy"
              ${
                otherRequirement?.otherType === 'allergy'
                  ? 'checked'
                  : ''
              }
              ${otherChecked ? 'required' : ''}
            />

            Allergie / intolerantie

          </label>


          <label>

            <input
              type="radio"
              name="${eventPart}-other-type-${guestId}"
              value="preference"
              ${
                otherRequirement?.otherType === 'preference'
                  ? 'checked'
                  : ''
              }
              ${otherChecked ? 'required' : ''}
            />

            Voorkeur

          </label>

        </div>


        <input
          type="text"
          class="dietary-other-text"
          data-dietary-other-text="${eventPart}-${guestId}"
          value="${escapeHtml(
            otherRequirement?.otherText || ''
          )}"
          maxlength="250"
          placeholder="Bijvoorbeeld: geen varkensvlees"
          ${otherChecked ? 'required' : ''}
        />

      </div>

    </div>

  `
}


/* =========================
   DIETARY CHECKBOX
========================= */

function renderDietaryCheckbox(
  eventPart,
  guestId,
  category,
  label,
  checked
) {

  return `

    <label class="dietary-option">

      <input
        type="checkbox"
        data-dietary-category="${category}"
        data-event-part="${eventPart}"
        data-guest-id="${guestId}"
        ${checked ? 'checked' : ''}
      />

      <span>
        ${label}
      </span>

    </label>

  `
}


/* =========================
   DIETARY CONTROLS
========================= */

function setupDietaryControls(container) {

  container.addEventListener(
    'change',
    event => {

      const target =
        event.target


      /* =====================
         DINNER / EVENING
      ====================== */

      if (
        target.matches(
          'input[type="radio"][name^="dinner-"], input[type="radio"][name^="evening-"]'
        )
      ) {

        const name =
          target.name


        const match =
          name.match(
            /^(dinner|evening)-(\d+)$/
          )


        if (!match) {
          return
        }


        const eventPart =
          match[1]

        const guestId =
          match[2]


        const wrapper =
          container.querySelector(
            `[data-dietary-wrapper="${eventPart}-${guestId}"]`
          )


        if (!wrapper) {
          return
        }


        wrapper.hidden =
          target.value !== 'attending'


        return
      }


      /* =====================
         DIETARY CHECKBOX
      ====================== */

      if (
        target.matches(
          'input[data-dietary-category]'
        )
      ) {

        const eventPart =
          target.dataset.eventPart

        const guestId =
          target.dataset.guestId

        const category =
          target.dataset.dietaryCategory


        if (
          !eventPart ||
          !guestId ||
          !category
        ) {
          return
        }


        if (category === 'other') {

          const other =
            container.querySelector(
              `[data-dietary-other="${eventPart}-${guestId}"]`
            )


          if (!other) {
            return
          }


          other.hidden =
            !target.checked


          const typeInputs =
            other.querySelectorAll(
              `input[name="${eventPart}-other-type-${guestId}"]`
            )


          const textInput =
            other.querySelector(
              `[data-dietary-other-text="${eventPart}-${guestId}"]`
            )


          typeInputs.forEach(
            input => {
              input.required =
                target.checked
            }
          )


          if (textInput) {

            textInput.required =
              target.checked

          }


          if (!target.checked) {

            typeInputs.forEach(
              input => {
                input.checked = false
              }
            )


            if (textInput) {
              textInput.value = ''
            }

          }

        }

      }

    }
  )
}


/* =========================
   RSVP SUBMIT
========================= */

async function submitRsvp(event) {

  event.preventDefault()


  const form =
    event.currentTarget


  const submitButton =
    form.querySelector(
      'button[type="submit"]'
    )


  const originalText =
    submitButton
      ? submitButton.textContent
      : ''


  if (submitButton) {

    submitButton.disabled =
      true

    submitButton.textContent =
      'Bezig...'

  }


  try {

    const guests =
      collectRsvpGuests(form)


    const response =
      await fetch(
        '/api/rsvp',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            code:
              currentInvitationCode,

            guests
          })
        }
      )


    const data =
      await response.json()


    if (
      !response.ok ||
      !data.ok
    ) {

      throw new Error(
        data.error ||
        'Er ging iets mis bij het opslaan van je RSVP.'
      )
    }


    const formContainer =
      document.querySelector(
        '#rsvp-form-container'
      )


    const success =
      document.querySelector(
        '#rsvp-success'
      )


    formContainer.hidden =
      true


    success.innerHTML = `

      <div class="rsvp-success-inner">

        <div class="rsvp-success-decoration">
          ♡
        </div>

        <p class="eyebrow">
          Bedankt!
        </p>

        <h3>
          Jullie RSVP is ontvangen.
        </h3>

        <p>
          We hebben jullie antwoord goed ontvangen.
          We kijken ernaar uit om samen met jullie
          onze dag te vieren.
        </p>

      </div>

    `


    success.hidden =
      false


  } catch (error) {

    console.error(
      'RSVP submission failed:',
      error
    )


    let errorElement =
      form.querySelector(
        '.rsvp-submit-error'
      )


    if (!errorElement) {

      errorElement =
        document.createElement(
          'div'
        )


      errorElement.className =
        'rsvp-message rsvp-error rsvp-submit-error'


      form
        .querySelector(
          '.rsvp-submit-area'
        )
        ?.before(
          errorElement
        )

    }


    errorElement.textContent =
      error.message ||
      'Er ging iets mis bij het verzenden van je RSVP.'


    errorElement.hidden =
      false


  } finally {

    if (submitButton) {

      submitButton.disabled =
        false

      submitButton.textContent =
        originalText

    }

  }
}


/* =========================
   COLLECT RSVP
========================= */

function collectRsvpGuests(form) {

  const guestElements =
    form.querySelectorAll(
      '.rsvp-guest'
    )


  return Array.from(
    guestElements
  ).map(
    guestElement => {

      const guestId =
        Number(
          guestElement.dataset.guestId
        )


      const guest = {
        id: guestId
      }


      /* =====================
         DINNER
      ====================== */

      const dinnerInput =
        guestElement.querySelector(
          `input[name="dinner-${guestId}"]:checked`
        )


      if (dinnerInput) {

        guest.dinner = {

          status:
            dinnerInput.value,

          dietaryRequirements:
            collectDietaryRequirements(
              guestElement,
              'dinner',
              guestId
            )

        }

      }


      /* =====================
         EVENING
      ====================== */

      const eveningInput =
        guestElement.querySelector(
          `input[name="evening-${guestId}"]:checked`
        )


      if (eveningInput) {

        guest.evening = {

          status:
            eveningInput.value,

          dietaryRequirements:
            collectDietaryRequirements(
              guestElement,
              'evening',
              guestId
            )

        }

      }


      return guest

    }
  )
}


/* =========================
   COLLECT DIETARY
========================= */

function collectDietaryRequirements(
  guestElement,
  eventPart,
  guestId
) {

  const dietarySection =
    guestElement.querySelector(
      `[data-dietary-event="${eventPart}"][data-guest-id="${guestId}"]`
    )


  if (!dietarySection) {
    return []
  }


  const checkboxes =
    dietarySection.querySelectorAll(
      'input[data-dietary-category]'
    )


  const requirements = []


  checkboxes.forEach(
    checkbox => {

      if (!checkbox.checked) {
        return
      }


      const category =
        checkbox.dataset.dietaryCategory


      if (category !== 'other') {

        requirements.push({
          category
        })

        return
      }


      const typeInput =
        dietarySection.querySelector(
          `input[name="${eventPart}-other-type-${guestId}"]:checked`
        )


      const textInput =
        dietarySection.querySelector(
          `[data-dietary-other-text="${eventPart}-${guestId}"]`
        )


      requirements.push({

        category:
          'other',

        otherType:
          typeInput
            ? typeInput.value
            : '',

        otherText:
          textInput
            ? textInput.value.trim()
            : ''

      })

    }
  )


  return requirements
}


/* =========================
   ESCAPE HTML
========================= */

function escapeHtml(value) {

  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

}


/* =========================
   INVITATION UI
========================= */

const openInvitationButton =
  document.querySelector(
    '#openInvitationButton'
  )


const invitationPanel =
  document.querySelector(
    '#invitation-code-panel'
  )


const invitationInput =
  document.querySelector(
    '#invitationCode'
  )


const invitationForm =
  document.querySelector(
    '#invitationForm'
  )


/* =========================
   OPEN INVITATION BUTTON
========================= */

if (openInvitationButton) {

  openInvitationButton.addEventListener(
    'click',
    () => {

      console.log(
        'Open uitnodiging clicked'
      )


      if (!invitationPanel) {

        console.error(
          'Invitation code panel not found'
        )

        return
      }


      /*
       * Maak het paneel expliciet zichtbaar.
       *
       * hidden wordt verwijderd omdat het
       * paneel anders display:none krijgt.
       */

      invitationPanel.hidden =
        false


      /*
       * De CSS gebruikt opacity: 0 op het
       * gesloten paneel. Door is-open toe te
       * voegen wordt het paneel zichtbaar
       * en komt de animatie correct in beeld.
       */

      invitationPanel.classList.add(
        'is-open'
      )


      invitationPanel.style.display =
        'block'


      /*
       * Verberg de eerste knop.
       */

      openInvitationButton.style.display =
        'none'


      /*
       * Focus op het invoerveld.
       */

      if (invitationInput) {

        invitationInput.focus()

        invitationInput.select()

      }

    }
  )

}


/* =========================
   INVITATION FORM
========================= */

if (invitationForm) {

  invitationForm.addEventListener(
    'submit',
    async event => {

      event.preventDefault()


      if (!invitationInput) {
        return
      }


      const code =
        invitationInput.value
          .trim()
          .toUpperCase()


      if (!code) {

        invitationInput.focus()

        return

      }


      await loadInvitation(
        code
      )

    }
  )

}


/* =========================
   RSVP FORM
========================= */

const rsvpForm =
  document.querySelector(
    '#rsvpForm'
  )


if (rsvpForm) {

  rsvpForm.addEventListener(
    'submit',
    submitRsvp
  )

}


/* =========================
   CALENDAR BUTTONS
========================= */

document
  .querySelector(
    '#calendarButton'
  )
  ?.addEventListener(
    'click',
    createCalendarFile
  )


document
  .querySelector(
    '#calendarButton2'
  )
  ?.addEventListener(
    'click',
    createCalendarFile
  )


document
  .querySelector(
    '#googleCalendarButton'
  )
  ?.addEventListener(
    'click',
    openGoogleCalendar
  )


document
  .querySelector(
    '#outlookCalendarButton'
  )
  ?.addEventListener(
    'click',
    openOutlookCalendar
  )


document
  .querySelector(
    '#appleCalendarButton'
  )
  ?.addEventListener(
    'click',
    createCalendarFile
  )


/* =========================
   COUNTDOWN
========================= */

function updateCountdown() {

  const countdown =
    document.querySelector(
      '#countdown'
    )


  if (!countdown) {
    return
  }


  countdown.textContent =
    formatCountdown()
}


updateCountdown()


setInterval(
  updateCountdown,
  60000
)
