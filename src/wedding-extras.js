import './wedding-extras.css'

const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

function belgianDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function getWeddingMode() {
  const today = belgianDateKey()
  if (today < '2027-10-02') return 'before'
  if (today === '2027-10-02') return 'live'
  return 'after'
}

function setWeddingModeClass(mode) {
  document.documentElement.dataset.weddingMode = mode
  document.body.classList.remove('wedding-mode-before', 'wedding-mode-live', 'wedding-mode-after')
  document.body.classList.add(`wedding-mode-${mode}`)
}

function makeModeBanner(mode) {
  const existing = $('#weddingModeBanner')
  if (existing) existing.remove()
  if (mode === 'before') return

  const section = document.createElement('section')
  section.id = 'weddingModeBanner'
  section.className = 'wedding-mode-banner'
  section.innerHTML = mode === 'live'
    ? `<div class="wedding-mode-banner-inner">
        <p class="eyebrow">Vandaag is het zover</p>
        <h2>Margo &amp; Glenn zeggen ja ♡</h2>
        <p>Alles wat je vandaag nodig hebt staat hier bij elkaar. Open de route of meld je aan in de gastenhoek om foto's te delen en ons gastenboek te tekenen.</p>
        <div class="wedding-mode-actions">
          <a class="button button-secondary" href="https://www.google.com/maps/search/?api=1&query=Hottentot+Hoeve+Bonheiden" target="_blank" rel="noopener noreferrer">Route naar Hottentot Hoeve</a>
          <a class="button button-primary" href="#rsvp">Open gastenhoek</a>
        </div>
      </div>`
    : `<div class="wedding-mode-banner-inner">
        <p class="eyebrow">Bedankt ♡</p>
        <h2>Wat een dag. Wat een feest.</h2>
        <p>Dankjewel om dit samen met ons te vieren. Open je persoonlijke gastenhoek om foto's te bekijken, nieuwe foto's te delen en iets achter te laten in ons gastenboek.</p>
        <div class="wedding-mode-actions">
          <a class="button button-primary" href="#rsvp">Foto's &amp; gastenboek</a>
        </div>
      </div>`
  $('.hero')?.insertAdjacentElement('afterend', section)
}

function applyWeddingMode(mode) {
  setWeddingModeClass(mode)
  const eyebrow = $('.hero .eyebrow')
  const title = $('.hero h1')
  const intro = $('.hero .intro')
  const primaryHeroAction = $('.hero-actions a.button-primary')
  const countdownSection = $('.countdown-section')
  const rsvpEyebrow = $('#rsvp .section-heading .eyebrow')
  const rsvpTitle = $('#rsvp .section-heading h2')

  if (mode === 'before') {
    makeModeBanner(mode)
    return
  }

  if (mode === 'live') {
    if (eyebrow) eyebrow.textContent = 'Vandaag is het zover'
    if (title) title.innerHTML = 'Vandaag zeggen we<br/><em>ja.</em>'
    if (intro) intro.textContent = 'Na al het aftellen is onze dag eindelijk hier. We kijken er ontzettend naar uit om dit samen met jullie te vieren.'
    if (primaryHeroAction) { primaryHeroAction.textContent = 'Open gastenhoek'; primaryHeroAction.href = '#rsvp' }
    if (countdownSection) {
      const h2 = $('h2', countdownSection)
      const countdown = $('#countdown', countdownSection)
      if (h2) h2.textContent = 'Vandaag is onze dag'
      if (countdown) countdown.textContent = '02 · 10 · 2027 ♡'
    }
    if (rsvpEyebrow) rsvpEyebrow.textContent = 'Gastenhoek'
    if (rsvpTitle) rsvpTitle.textContent = "Foto's delen & iets achterlaten"
  }

  if (mode === 'after') {
    if (eyebrow) eyebrow.textContent = 'Dankjewel'
    if (title) title.innerHTML = 'Wat een dag.<br/><em>Wat een feest.</em>'
    if (intro) intro.textContent = "Bedankt om onze trouwdag samen met ons onvergetelijk te maken. We genieten graag nog even verder van alle foto's en lieve woorden."
    if (primaryHeroAction) { primaryHeroAction.textContent = "Foto's & gastenboek"; primaryHeroAction.href = '#rsvp' }
    if (countdownSection) countdownSection.hidden = true
    if (rsvpEyebrow) rsvpEyebrow.textContent = 'Gastenhoek'
    if (rsvpTitle) rsvpTitle.textContent = "Herbeleef onze dag met ons"
  }

  makeModeBanner(mode)
}

function eventQuestion(session, multiple) {
  const dinner = session.guests.some(guest => guest.invitedToDinner)
  const evening = session.guests.some(guest => guest.invitedToEvening)
  if (dinner && evening) return multiple
    ? 'Laat ons hieronder weten voor welke onderdelen jullie aanwezig zullen zijn.'
    : 'Laat ons hieronder weten voor welke onderdelen je aanwezig zult zijn.'
  if (evening) return `${multiple ? 'Kunnen jullie' : 'Kan je'} erbij zijn op ons avondfeest?`
  return `${multiple ? 'Kunnen jullie' : 'Kan je'} erbij zijn op ons diner?`
}

function renderPersonalWelcome(session, plusOne, mode) {
  const heading = $('#invitationHeading')
  const intro = $('#invitationIntro')
  if (!heading || !intro || !Array.isArray(session.guests) || !session.guests.length) return

  const names = session.guests.map(guest => guest.name)
  const multiple = names.length > 1
  heading.textContent = `Welkom, ${names.join(' & ')} ♡`

  if (mode === 'live') {
    intro.textContent = `Vandaag is het zover! Wat fijn dat ${multiple ? 'jullie onze gastenhoek openen' : 'je onze gastenhoek opent'}. Deel gerust foto's en laat iets liefs achter in ons gastenboek.`
    return
  }
  if (mode === 'after') {
    intro.textContent = `Welkom terug. Bedankt dat ${multiple ? 'jullie' : 'je'} deel uitmaakten van onze dag. Hier kunnen ${multiple ? 'jullie' : 'je'} foto's bekijken, nieuwe foto's delen en een bericht achterlaten.`
    return
  }

  const question = eventQuestion(session, multiple)
  if (plusOne?.allowed && !plusOne.partnerName && names.length === 1) {
    intro.textContent = `Wat fijn dat je onze uitnodiging opent. We hopen natuurlijk dat je erbij kunt zijn. Omdat onze trouw nog even op zich laat wachten, mag je gerust iemand meenemen. Voeg hieronder de naam van je partner toe zodra je weet wie met je meegaat. ${question}`
  } else {
    intro.textContent = `Wat fijn dat ${multiple ? 'jullie' : 'je'} onze uitnodiging ${multiple ? 'openen' : 'opent'}. We kijken ernaar uit om onze dag samen met ${multiple ? 'jullie' : 'jou'} te vieren. ${question}`
  }
}

function scopeText(plusOne) {
  if (plusOne.invitedToDinner && plusOne.invitedToEvening) return 'het diner én het avondfeest'
  if (plusOne.invitedToDinner) return 'het diner'
  return 'het avondfeest'
}

function ensurePlusOneBlock() {
  let block = $('#plusOneBlock')
  if (block) return block
  const anchor = $('.rsvp-email-block')
  if (!anchor) return null
  block = document.createElement('div')
  block.id = 'plusOneBlock'
  block.className = 'plus-one-block guest-form-block'
  anchor.insertAdjacentElement('beforebegin', block)
  return block
}

function renderPlusOne(plusOne, sessionState, mode, onSaved) {
  const block = ensurePlusOneBlock()
  if (!block) return
  if (mode !== 'before' || !plusOne?.allowed) {
    block.hidden = true
    return
  }
  block.hidden = false
  const hasPartner = Boolean(plusOne.partnerName)
  block.innerHTML = `
    <p class="eyebrow">Samen komen?</p>
    <h4>${hasPartner ? 'Je partner staat op de uitnodiging' : 'Wil je iemand meenemen?'}</h4>
    <p>${hasPartner
      ? `Je partner krijgt dezelfde uitnodiging als jij voor ${scopeText(plusOne)}. Je kunt de naam hieronder nog aanpassen zolang de RSVP open is.`
      : `Je mag één partner meenemen. Je partner krijgt automatisch dezelfde uitnodiging als jij voor ${scopeText(plusOne)}.`}</p>
    <label class="guest-field-label" for="plusOneName">Naam van je partner</label>
    <input id="plusOneName" class="guest-field" type="text" maxlength="100" autocomplete="name" value="${escapeHtml(plusOne.partnerName || '')}" placeholder="Voor- en achternaam">
    <div class="plus-one-actions">
      <button id="savePlusOne" type="button" class="button button-secondary">${hasPartner ? 'Naam bewaren' : 'Partner toevoegen'}</button>
      ${hasPartner ? '<button id="removePlusOne" type="button" class="text-link plus-one-remove">Partner verwijderen</button>' : ''}
    </div>
    <p id="plusOneStatus" class="guest-form-help" role="status"></p>`

  const nameInput = $('#plusOneName', block)
  const status = $('#plusOneStatus', block)
  const save = $('#savePlusOne', block)
  const remove = $('#removePlusOne', block)

  async function mutate(name) {
    if (!sessionState.csrfToken) return
    save.disabled = true
    if (remove) remove.disabled = true
    status.textContent = name === null ? 'Partner verwijderen…' : 'Partner bewaren…'
    try {
      const response = await fetch('/api/guest/plus-one', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionState.csrfToken, Accept: 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Dat is niet gelukt. Probeer opnieuw.')
      status.textContent = name === null ? 'Partner verwijderd. Uitnodiging vernieuwen…' : 'Partner opgeslagen. Uitnodiging vernieuwen…'
      onSaved()
    } catch (error) {
      status.textContent = error.message
      save.disabled = false
      if (remove) remove.disabled = false
    }
  }

  save.addEventListener('click', () => {
    const name = nameInput.value.trim().replace(/\s+/g, ' ')
    if (!name) {
      status.textContent = 'Vul eerst de naam van je partner in.'
      nameInput.focus()
      return
    }
    mutate(name)
  })
  remove?.addEventListener('click', () => mutate(null))
}

function ensureGuestbookSection() {
  let section = $('#guestbook')
  if (section) return section
  section = document.createElement('section')
  section.id = 'guestbook'
  section.className = 'section guestbook-section'
  section.hidden = true
  section.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">Gastenboek</p>
      <h2>Laat iets liefs achter ♡</h2>
      <div class="small-line"></div>
      <p class="guestbook-intro">Een wens, herinnering of gewoon iets dat je ons nog wilt zeggen. Eén bericht per uitnodiging, en je kunt het later altijd nog aanpassen.</p>
    </div>
    <div class="guestbook-layout">
      <div class="guestbook-write-card">
        <label class="guest-field-label" for="guestbookMessage">Jullie bericht</label>
        <textarea id="guestbookMessage" class="guestbook-textarea" maxlength="1000" rows="6" placeholder="Schrijf hier iets voor Margo & Glenn…"></textarea>
        <div class="guestbook-write-footer"><span id="guestbookCounter">0 / 1000</span><button id="guestbookSave" class="button button-primary" type="button">Bericht bewaren</button></div>
        <p id="guestbookStatus" class="guest-form-help" role="status"></p>
      </div>
      <div><div id="guestbookEntries" class="guestbook-entries"></div><p id="guestbookEmpty" class="guestbook-empty">Nog geen berichten. Misschien schrijf jij wel de eerste. ♡</p></div>
    </div>`
  $('#guestPhotos')?.insertAdjacentElement('afterend', section)
  return section
}

function formatGuestbookDate(value) {
  const date = new Date(`${String(value).replace(' ', 'T')}Z`)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Brussels' }).format(date)
}

async function loadGuestbook(sessionState) {
  const section = ensureGuestbookSection()
  if (!section || !sessionState.csrfToken) return
  section.hidden = false
  const entriesEl = $('#guestbookEntries', section)
  const empty = $('#guestbookEmpty', section)
  const textarea = $('#guestbookMessage', section)
  const counter = $('#guestbookCounter', section)
  const status = $('#guestbookStatus', section)
  const save = $('#guestbookSave', section)

  const updateCounter = () => { counter.textContent = `${textarea.value.length} / 1000` }
  textarea.oninput = updateCounter
  status.textContent = 'Gastenboek laden…'
  try {
    const response = await fetch('/api/guest/guestbook', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.ok) throw new Error(data.error || 'Gastenboek kon niet worden geladen.')
    textarea.value = data.ownMessage || ''
    updateCounter()
    const entries = Array.isArray(data.entries) ? data.entries : []
    entriesEl.innerHTML = entries.map(entry => `<article class="guestbook-entry"><p class="guestbook-message">${escapeHtml(entry.message)}</p><div class="guestbook-signature"><strong>${escapeHtml(entry.authorNames)}</strong><span>${escapeHtml(formatGuestbookDate(entry.createdAt))}</span></div></article>`).join('')
    empty.hidden = Boolean(entries.length)
    status.textContent = ''
  } catch (error) {
    status.textContent = error.message
  }

  save.onclick = async () => {
    const message = textarea.value.trim()
    if (!message) {
      status.textContent = 'Schrijf eerst een berichtje.'
      textarea.focus()
      return
    }
    save.disabled = true
    status.textContent = 'Bericht bewaren…'
    try {
      const response = await fetch('/api/guest/guestbook', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': sessionState.csrfToken, Accept: 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.error || 'Je bericht kon niet worden opgeslagen.')
      status.textContent = 'Dankjewel. Jullie bericht staat in ons gastenboek. ♡'
      await loadGuestbook(sessionState)
      $('#guestbookStatus', section).textContent = 'Dankjewel. Jullie bericht staat in ons gastenboek. ♡'
    } catch (error) {
      status.textContent = error.message
    } finally {
      save.disabled = false
    }
  }
}

function hideGuestbook() {
  const section = $('#guestbook')
  if (section) section.hidden = true
}

function installEasterEgg() {
  const heart = $('.footer .heart')
  if (!heart) return
  let count = 0
  let timer
  heart.addEventListener('click', () => {
    clearTimeout(timer)
    count += 1
    timer = setTimeout(() => { count = 0 }, 2500)
    if (count < 5) return
    count = 0
    const toast = document.createElement('div')
    toast.className = 'cat-easter-egg'
    toast.textContent = 'Pipje & Nacho geven hun pootje van goedkeuring. 🐾'
    document.body.appendChild(toast)
    for (let i = 0; i < 9; i++) {
      const paw = document.createElement('span')
      paw.className = 'easter-paw'
      paw.textContent = '🐾'
      paw.style.setProperty('--paw-index', String(i))
      document.body.appendChild(paw)
      setTimeout(() => paw.remove(), 4000)
    }
    setTimeout(() => toast.remove(), 4200)
  })
}

async function fetchJson(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || 'Dat is niet gelukt.'), { status: response.status })
  return data
}

export function initializeWeddingExtras() {
  let mode = getWeddingMode()
  applyWeddingMode(mode)
  installEasterEgg()
  ensureGuestbookSection()

  const sessionBar = $('#guestSessionBar')
  if (!sessionBar) return
  const state = { csrfToken: '', loading: false }

  async function syncSessionExtras() {
    if (sessionBar.hidden || state.loading) {
      if (sessionBar.hidden) hideGuestbook()
      return
    }
    state.loading = true
    try {
      const [session, plusOne] = await Promise.all([
        fetchJson('/api/guest/session'),
        fetchJson('/api/guest/plus-one'),
      ])
      if (sessionBar.hidden) return
      state.csrfToken = session.csrfToken
      mode = getWeddingMode()
      applyWeddingMode(mode)
      renderPersonalWelcome(session, plusOne, mode)
      renderPlusOne(plusOne, state, mode, () => setTimeout(() => window.location.reload(), 500))
      if (mode === 'live' || mode === 'after') {
        const form = $('#rsvpForm')
        if (form) form.hidden = true
        await loadGuestbook(state)
      } else {
        const form = $('#rsvpForm')
        if (form) form.hidden = false
        hideGuestbook()
      }
    } catch (error) {
      if (error.status !== 401) console.error('Wedding extras failed:', error)
    } finally {
      state.loading = false
    }
  }

  const observer = new MutationObserver(() => {
    if (sessionBar.hidden) {
      state.csrfToken = ''
      hideGuestbook()
      const plusOne = $('#plusOneBlock')
      if (plusOne) plusOne.hidden = true
    } else {
      syncSessionExtras()
    }
  })
  observer.observe(sessionBar, { attributes: true, attributeFilter: ['hidden'] })
  setTimeout(syncSessionExtras, 0)

  setInterval(() => {
    const nextMode = getWeddingMode()
    if (nextMode !== mode) {
      mode = nextMode
      applyWeddingMode(mode)
      if (!sessionBar.hidden) syncSessionExtras()
    }
  }, 60_000)
}
