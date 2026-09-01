import './style.css'

const weddingDate = new Date('2027-10-02T00:00:00')

const calendarEvent = {
  title: 'Margo & Glenn \u2014 Onze trouwdag',
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
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

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
  const difference = weddingDate - now

  if (difference <= 0) {
    return 'Vandaag is onze dag \u2661'
  }

  const days = Math.floor(
    difference / (1000 * 60 * 60 * 24)
  )

  const hours = Math.floor(
    (difference / (1000 * 60 * 60)) % 24
  )

  const minutes = Math.floor(
    (difference / (1000 * 60)) % 60
  )

  return `${days} dagen \u00b7 ${hours} uur \u00b7 ${minutes} minuten`
}


/* =========================
   GOOGLE CALENDAR
========================= */

function openGoogleCalendar() {
  const url =
    'https://calendar.google.com/calendar/render' +
    '?action=TEMPLATE' +
    `&text=${encodeURIComponent(calendarEvent.title)}` +
    `&dates=${calendarEvent.startDate}/${calendarEvent.endDate}` +
    `&location=${encodeURIComponent(calendarEvent.location)}` +
    `&details=${encodeURIComponent(calendarEvent.description)}`

  window.open(url, '_blank')
}


/* =========================
   OUTLOOK CALENDAR
========================= */

function openOutlookCalendar() {
  const url =
    'https://outlook.live.com/calendar/0/deeplink/compose' +
    `?subject=${encodeURIComponent(calendarEvent.title)}` +
    `&startdt=${encodeURIComponent(calendarEvent.startDateTime)}` +
    `&enddt=${encodeURIComponent(calendarEvent.endDateTime)}` +
    `&location=${encodeURIComponent(calendarEvent.location)}` +
    `&body=${encodeURIComponent(calendarEvent.description)}`

  window.open(url, '_blank')
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
          alt="Margo & Glenn \u2014 2 oktober 2027"
        />

        <div class="hero-divider">
          <span></span>
          <span class="heart">&#9825;</span>
          <span></span>
        </div>

        <p class="eyebrow">Onze trouwdag</p>

        <h1>
          Een dag om te<br />
          <em>herinneren.</em>
        </h1>

        <p class="intro">
          Op 2 oktober 2027 vieren we samen met jullie
          de liefde, het leven en alles wat nog komt.
        </p>

        <div class="hero-actions">

          <a href="#rsvp" class="button button-primary">
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

    <section id="details" class="section details-section">

      <div class="section-heading">

        <p class="eyebrow">02 &#183; 10 &#183; 2027</p>

        <h2>Onze dag</h2>

        <div class="small-line"></div>

        <div class="adults-only">

          <strong>Adults only</strong>

          <p>
            Een avond zonder zorgen voor iedereen.<br />
            Daarom vieren we onze dag graag samen zonder kinderen.
          </p>

        </div>

      </div>


      <div class="details-grid">

        <!-- WANNEER -->

        <article class="detail-card">

          <div class="detail-icon">&#9825;</div>

          <h3>Wanneer</h3>

          <p>
            Zaterdag<br />
            <strong>2 oktober 2027</strong>
          </p>

        </article>


        <!-- WAAR -->

        <article class="detail-card">

          <div class="detail-icon">&#8982;</div>

          <h3>Waar</h3>

          <p>
            <strong>Hottentot Hoeve</strong><br />
            Cassenbroek 1<br />
            2820 Bonheiden
          </p>

          <a
            class="text-link"
            href="https://www.google.com/maps/search/?api=1&query=Hottentot+Hoeve+Bonheiden"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bekijk de locatie &#8594;
          </a>

        </article>

      </div>

    </section>


    <!-- =========================
         COUNTDOWN
    ========================== -->

    <section class="countdown-section">

      <div class="countdown-inner">

        <p class="eyebrow">En tot dan...</p>

        <h2>We tellen samen af</h2>

        <div id="countdown" class="countdown">
          ${formatCountdown()}
        </div>

        <div class="hero-divider">

          <span></span>

          <span class="heart">&#9825;</span>

          <span></span>

        </div>

      </div>

    </section>


    <!-- =========================
         PRAKTISCH
    ========================== -->

    <section class="section practical-section">

      <div class="section-heading">

        <p class="eyebrow">Praktisch</p>

        <h2>Alle details op &eacute;&eacute;n plek</h2>

        <div class="small-line"></div>

      </div>


      <div class="practical-content">

        <!-- LOCATIE -->

        <div class="practical-item">

          <h3>&#128205; Locatie</h3>

          <p>
            <strong>Hottentot Hoeve</strong><br />
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


        <!-- KALENDER -->

        <div class="practical-item">

          <h3>&#128197; Kalender</h3>

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
              &#128197;
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
            &#128197; = kalenderbestand &#183; G = Google &#183; O = Outlook &#183; A = Apple
          </p>

        </div>

      </div>

    </section>


    <!-- =========================
         RSVP
    ========================== -->

    <section id="rsvp" class="section rsvp-section">

      <div class="section-heading">

        <p class="eyebrow">RSVP</p>

        <h2>Laat ons weten of je erbij bent</h2>

        <div class="small-line"></div>

      </div>


      <div class="rsvp-content">

        <div id="rsvp-app">

          <!-- PERSOONLIJKE UITNODIGING -->

          <div class="invitation-card" id="invitationCard">

            <div class="invitation-card-inner">

              <div class="invitation-card-decoration">
                &#9825;
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


              <!-- CODE FORMULIER -->

              <div
                id="invitation-code-panel"
                class="invitation-code-panel"
                hidden
              >

                <div class="invitation-card-divider">

                  <span></span>

                  <span>&#9825;</span>

                  <span></span>

                </div>

                <p class="invitation-code-label">
                  Persoonlijke uitnodigingscode
                </p>

                <form id="invitationForm">

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

                  <p
                    id="invitationError"
                    class="rsvp-message rsvp-error"
                    hidden
                  ></p>

                </form>

              </div>

            </div>

          </div>


          <!-- RSVP FORM -->

          <div
            id="rsvp-form-container"
            hidden
          ></div>


          <!-- SUCCESS -->

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

    <footer>

      <div class="footer-decoration">
        &#10022;
      </div>

      <p>
        02 &#183; 10 &#183; 2027
      </p>

      <span class="footer-line"></span>

      <p class="footer-small">
        With love, Margo &amp; Glenn
      </p>

    </footer>

  </main>
`


/* =========================
   INVITATION CARD
========================= */

document
  .querySelector('#openInvitationButton')
  .addEventListener('click', () => {

    const panel = document.querySelector(
      '#invitation-code-panel'
    )

    const button = document.querySelector(
      '#openInvitationButton'
    )

    panel.hidden = false
    button.hidden = true

    requestAnimationFrame(() => {
      panel.classList.add('is-open')
    })

    setTimeout(() => {
      document
        .querySelector('#invitationCode')
        ?.focus()
    }, 150)
  })


/* =========================
   RSVP / INVITATION
========================= */

async function loadInvitation(code) {

  const errorElement = document.querySelector(
    '#invitationError'
  )

  const formContainer = document.querySelector(
    '#rsvp-form-container'
  )

  errorElement.hidden = true
  formContainer.hidden = true
  formContainer.innerHTML = ''

  try {

    const response = await fetch(
      `/api/invitation?code=${encodeURIComponent(code)}`
    )

    const data = await response.json()

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || 'Ongeldige uitnodiging'
      )
    }

    renderRsvpForm(code, data.guests)

  } catch (error) {

    errorElement.textContent =
      error.message ||
      'Er ging iets mis. Probeer opnieuw.'

    errorElement.hidden = false
  }
}


/* =========================
   RSVP FORM
========================= */

function renderRsvpForm(code, guests) {

  const formContainer = document.querySelector(
    '#rsvp-form-container'
  )

  formContainer.innerHTML = `
    <form id="rsvpForm">

      <input
        type="hidden"
        id="rsvpCode"
        value="${escapeHtml(code)}"
      />

      <h3>Jullie uitnodiging</h3>

      <p>
        Bevestig hieronder voor elk onderdeel afzonderlijk
        of je erbij bent.
      </p>

      ${guests.map((guest) => `

        <div
          class="rsvp-guest"
          data-guest-id="${guest.id}"
        >

          <h4>
            ${escapeHtml(guest.name)}
          </h4>


          ${guest.invitedToDinner ? `

            <div class="rsvp-event">

              <h5>Diner</h5>

              <label>

                <input
                  type="radio"
                  name="dinner-${guest.id}"
                  value="attending"
                  ${guest.dinnerRsvpStatus === 'attending'
                    ? 'checked'
                    : ''}
                  required
                />

                Ja, ik kom

              </label>


              <label>

                <input
                  type="radio"
                  name="dinner-${guest.id}"
                  value="declined"
                  ${guest.dinnerRsvpStatus === 'declined'
                    ? 'checked'
                    : ''}
                  required
                />

                Nee, ik kom niet

              </label>

            </div>

          ` : ''}


          ${guest.invitedToEvening ? `

            <div class="rsvp-event">

              <h5>Avondfeest</h5>

              <label>

                <input
                  type="radio"
                  name="evening-${guest.id}"
                  value="attending"
                  ${guest.eveningRsvpStatus === 'attending'
                    ? 'checked'
                    : ''}
                  required
                />

                Ja, ik kom

              </label>


              <label>

                <input
                  type="radio"
                  name="evening-${guest.id}"
                  value="declined"
                  ${guest.eveningRsvpStatus === 'declined'
                    ? 'checked'
                    : ''}
                  required
                />

                Nee, ik kom niet

              </label>

            </div>

          ` : ''}

        </div>

      `).join('')}


      <button
        type="submit"
        class="button button-primary"
      >
        RSVP bevestigen
      </button>

    </form>
  `

  formContainer.hidden = false

  document
    .querySelector('#rsvpForm')
    .addEventListener(
      'submit',
      handleRsvpSubmit
    )
}


/* =========================
   RSVP SUBMIT
========================= */

async function handleRsvpSubmit(event) {

  event.preventDefault()

  const form = event.currentTarget

  const code =
    document.querySelector('#rsvpCode').value

  const guestElements = [
    ...form.querySelectorAll('.rsvp-guest')
  ]

  const guests = guestElements.map(
    (guestElement) => {

      const guestId = Number(
        guestElement.dataset.guestId
      )

      const dinner = guestElement.querySelector(
        `input[name="dinner-${guestId}"]:checked`
      )

      const evening = guestElement.querySelector(
        `input[name="evening-${guestId}"]:checked`
      )

      const guest = {
        id: guestId
      }

      if (dinner) {
        guest.dinner = {
          status: dinner.value,
          dietaryRequirements: []
        }
      }

      if (evening) {
        guest.evening = {
          status: evening.value,
          dietaryRequirements: []
        }
      }

      return guest
    }
  )

  const payload = {
    code,
    guests
  }


  try {

    const response = await fetch(
      '/api/rsvp',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    const data = await response.json()

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error ||
        'RSVP kon niet worden opgeslagen'
      )
    }


    document
      .querySelector('#rsvp-form-container')
      .hidden = true


    const success =
      document.querySelector('#rsvp-success')

    success.textContent =
      'Bedankt! Jullie RSVP werd succesvol opgeslagen.'

    success.hidden = false

  } catch (error) {

    const errorElement =
      document.querySelector('#invitationError')

    errorElement.textContent =
      error.message ||
      'Er ging iets mis bij het opslaan.'

    errorElement.hidden = false
  }
}


/* =========================
   HTML ESCAPING
========================= */

function escapeHtml(value) {

  return String(value)

    .replaceAll(
      '&',
      '&amp;'
    )

    .replaceAll(
      '<',
      '&lt;'
    )

    .replaceAll(
      '>',
      '&gt;'
    )

    .replaceAll(
      '"',
      '&quot;'
    )

    .replaceAll(
      "'",
      '&#039;'
    )
}


/* =========================
   INVITATION CODE
========================= */

document
  .querySelector('#invitationForm')
  .addEventListener(
    'submit',
    (event) => {

      event.preventDefault()

      const input =
        document.querySelector(
          '#invitationCode'
        )

      const code =
        input.value
          .trim()
          .toUpperCase()

      loadInvitation(code)
    }
  )


/* =========================
   CALENDAR BUTTONS
========================= */

document
  .querySelector('#calendarButton')
  .addEventListener(
    'click',
    createCalendarFile
  )


document
  .querySelector('#calendarButton2')
  .addEventListener(
    'click',
    createCalendarFile
  )


document
  .querySelector('#googleCalendarButton')
  .addEventListener(
    'click',
    openGoogleCalendar
  )


document
  .querySelector('#outlookCalendarButton')
  .addEventListener(
    'click',
    openOutlookCalendar
  )


document
  .querySelector('#appleCalendarButton')
  .addEventListener(
    'click',
    createCalendarFile
  )


/* =========================
   COUNTDOWN
========================= */

function updateCountdown() {

  const countdown =
    document.querySelector('#countdown')

  if (countdown) {

    countdown.textContent =
      formatCountdown()
  }
}


updateCountdown()

setInterval(
  updateCountdown,
  60000
)