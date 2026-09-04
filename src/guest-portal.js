const CODE_PATTERN = /^MG-[A-Z0-9]{6}$/
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const PHOTO_FULL_MESSAGE = `Wat ontzettend leuk! ❤️\n\nWe hadden eerlijk gezegd niet verwacht dat er zóveel foto's gedeeld zouden worden — en daar zijn we natuurlijk alleen maar blij mee!\n\nWe hebben ondertussen het maximum aantal foto's bereikt dat we online kunnen bewaren. Nieuwe foto's uploaden kan daarom voorlopig niet meer.\n\nHeb je nog foto's van onze dag? Deel ze dan gerust op een andere manier met ons. We bekijken ze met heel veel plezier en genieten er graag samen met jullie nog eens van. 🥰`
const $ = (selector, root = document) => root.querySelector(selector)
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const countPhotos = count => `${count} foto${count === 1 ? '' : "'s"}`

export const guestPortalMarkup = `
<section id="rsvp" class="section rsvp-section">
  <div class="section-heading"><p class="eyebrow">RSVP</p><h2>Laat ons weten of je erbij bent</h2><div class="small-line"></div></div>
  <div class="rsvp-content"><div id="rsvp-app">
    <div class="invitation-card" id="invitationCard"><div class="invitation-card-inner">
      <div class="invitation-card-decoration">♡</div><p class="eyebrow">Onze persoonlijke uitnodiging</p><h3>Voor jullie</h3>
      <p class="invitation-card-intro">Open hieronder je persoonlijke uitnodiging met de code die je van ons kreeg.</p>
      <button type="button" id="openInvitationButton" class="button button-primary">Open mijn uitnodiging</button>
      <div id="invitation-code-panel" class="invitation-code-panel" hidden>
        <div class="invitation-card-divider"><span></span><span>♡</span><span></span></div>
        <label class="invitation-code-label" for="invitationCode">Persoonlijke uitnodigingscode</label>
        <form id="invitationForm"><div class="rsvp-code-row">
          <input id="invitationCode" name="invitationCode" type="text" placeholder="MG-XXXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" required>
          <button type="submit" class="button button-primary">Open uitnodiging</button>
        </div></form>
      </div>
      <div id="invitationLoading" class="invitation-loading" role="status" hidden>Uitnodiging laden…</div>
    </div></div>
    <div id="invitationError" class="rsvp-message rsvp-error" role="alert" hidden></div>
    <div id="guestSessionBar" class="guest-session-bar" hidden><span id="guestSessionNames"></span><button id="guestLogout" class="text-link" type="button">Uitloggen</button></div>
    <div id="rsvp-form-container" hidden>
      <div class="rsvp-invitation-heading"><p class="eyebrow">Welkom</p><h3 id="invitationHeading"></h3><p id="invitationIntro"></p></div>
      <form id="rsvpForm">
        <fieldset id="guestRsvpFields" class="guest-unframed">
          <div id="guestList"></div>
          <div class="rsvp-email-block guest-form-block">
            <label class="guest-field-label" for="rsvpEmail">E-mailadres (optioneel)</label>
            <p>Laat hier je e-mailadres achter als je na ons feest graag nog enkele foto's wilt ontvangen die we met jullie willen delen. <strong>Dit e-mailadres gaat uitsluitend naar Margo &amp; Glenn en wordt met niemand anders gedeeld.</strong></p>
            <input class="guest-field" id="rsvpEmail" name="rsvpEmail" type="email" autocomplete="email" maxlength="254" placeholder="jouw@email.be">
          </div>
          <div class="rsvp-song-block guest-form-block">
            <h4>Een nummer voor de dansvloer</h4>
            <p id="guestSongIntro"></p>
            <p id="guestSongAttribution"></p>
            <div class="guest-song-fields">
              <label class="guest-field-label" for="guestSongTitle">Titel<input class="guest-field" id="guestSongTitle" name="songTitle" maxlength="120" placeholder="Titel van het nummer"></label>
              <label class="guest-field-label" for="guestSongArtist">Artiest<input class="guest-field" id="guestSongArtist" name="songArtist" maxlength="120" placeholder="Naam van de artiest"></label>
            </div>
            <p class="guest-form-help">Je kunt je keuze later aanpassen. Maak beide velden leeg om je liedje te verwijderen.</p>
          </div>
        </fieldset>
        <div id="rsvpSaveStatus" class="rsvp-message" role="status" hidden></div>
        <div class="rsvp-submit-area"><button type="submit" class="button button-primary">Bewaar RSVP en liedje</button></div>
      </form>
    </div>
  </div></div>
</section>
<section id="guestPhotos" class="section guest-photos-section" hidden>
  <div class="section-heading"><p class="eyebrow">Jullie foto's</p><h2>Onze dag, door jullie ogen</h2><div class="small-line"></div><p class="guest-photos-intro">Deel jullie mooiste momenten met ons en bekijk de foto's van andere gasten. Deze fotohoek is alleen toegankelijk met een persoonlijke uitnodiging.</p></div>
  <div class="guest-photo-card">
    <div id="guestPhotoDrop" class="guest-photo-drop"><strong>Sleep je foto's hierheen</strong><p>Of kies foto's vanaf je toestel. JPG, PNG of WebP, tot 10 MB per foto.</p><button class="button button-primary" id="guestPhotoChoose" type="button">Foto's kiezen</button><input id="guestPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></div>
    <div class="guest-photo-actions"><button id="guestPhotoUpload" class="button button-primary" type="button">Foto's uploaden</button><button id="guestPhotoClear" class="button button-secondary" type="button">Selectie wissen</button><button id="guestPhotoRefresh" class="button button-secondary" type="button">Fotohoek vernieuwen</button></div>
    <p id="guestPhotoStatus" class="guest-photo-status" role="status"></p>
    <p id="guestPhotoEmpty" class="guest-photo-empty">Nog geen foto's gedeeld. Deel het eerste mooie moment.</p>
    <div id="guestPhotoGrid" class="guest-photo-grid"></div>
  </div>
</section>`

export function initializeGuestPortal() {
  const invitationForm = $('#invitationForm')
  if (!invitationForm) return
  const rsvpForm = $('#rsvpForm')
  const loginButton = $('button[type="submit"]', invitationForm)
  const saveButton = $('button[type="submit"]', rsvpForm)
  const photoStatus = $('#guestPhotoStatus')
  const photoGrid = $('#guestPhotoGrid')
  const controllers = new Set()
  let session = null
  let operation = null
  let generation = 0
  let remotePhotos = []
  let selectedPhotos = []
  let nextSelectionId = 0
  let quota = { uploadAvailable: true }
  let quotaBlocked = false

  function isCurrent(ticket) { return operation === ticket && ticket.generation === generation }

  function updateControls() {
    const busy = Boolean(operation)
    $('#openInvitationButton').disabled = busy
    loginButton.disabled = busy
    $('#invitationCode').disabled = busy
    $('#guestLogout').disabled = busy || !session
    $('#guestRsvpFields').disabled = busy || !session
    saveButton.disabled = busy || !session
    const uploadsDisabled = busy || !session || quotaBlocked || !quota.uploadAvailable
    $('#guestPhotoInput').disabled = uploadsDisabled
    $('#guestPhotoChoose').disabled = uploadsDisabled
    $('#guestPhotoUpload').disabled = uploadsDisabled || !selectedPhotos.length
    $('#guestPhotoClear').disabled = busy || !session || !selectedPhotos.length
    $('#guestPhotoRefresh').disabled = busy || !session
    $('#guestPhotoDrop').classList.toggle('is-disabled', uploadsDisabled)
    $$('[data-remove-photo]', photoGrid).forEach(button => { button.disabled = busy })
  }

  function beginOperation(kind) {
    if (operation) return null
    operation = { kind, generation }
    updateControls()
    return operation
  }

  function finishOperation(ticket) {
    if (!isCurrent(ticket)) return
    operation = null
    updateControls()
  }

  async function request(path, options = {}, timeoutMs = 20_000) {
    const requestGeneration = generation
    const controller = new AbortController()
    controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(path, {
        ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...options.headers }
      })
      let data
      try { data = await response.json() } catch {}
      if (generation !== requestGeneration) throw Object.assign(new Error(), { stale: true })
      if (!response.ok || !data?.ok) {
        const translations = {
          'Invalid invitation': 'Deze uitnodigingscode is ongeldig of niet meer actief.',
          'RSVP deadline has passed': 'De datum om je RSVP te wijzigen is verstreken. Neem gerust contact met ons op.',
          'Unable to save RSVP': 'Je antwoord kon niet worden opgeslagen. Probeer het opnieuw.'
        }
        throw Object.assign(new Error(translations[data?.error] || data?.error || 'Er ging iets mis. Probeer het opnieuw.'), { status: response.status, quotaReached: Boolean(data?.quotaReached) })
      }
      return data
    } catch (error) {
      if (generation !== requestGeneration || error.stale) throw Object.assign(new Error(), { stale: true })
      if (error.name === 'AbortError') throw new Error('De server reageert niet op tijd. Controleer je verbinding en probeer het opnieuw.')
      if (error instanceof TypeError) throw new Error('Geen verbinding met de server. Controleer je verbinding en probeer het opnieuw.')
      throw error
    } finally {
      clearTimeout(timeout)
      controllers.delete(controller)
    }
  }

  function mutationHeaders(json = true) {
    return { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-CSRF-Token': session.csrfToken }
  }

  function clearSelection() {
    selectedPhotos.forEach(photo => URL.revokeObjectURL(photo.url))
    selectedPhotos = []
    $('#guestPhotoInput').value = ''
  }

  function showLoginPanel() {
    $('#invitation-code-panel').hidden = false
    $('#invitation-code-panel').classList.add('is-open')
    $('#openInvitationButton').hidden = true
  }

  function clearSession(message = '') {
    generation++
    controllers.forEach(controller => controller.abort())
    session = null
    operation = null
    clearSelection()
    remotePhotos = []
    quota = { uploadAvailable: true }
    quotaBlocked = false
    invitationForm.reset()
    rsvpForm.reset()
    $('#guestList').innerHTML = ''
    $('#invitationHeading').textContent = ''
    $('#invitationIntro').textContent = ''
    $('#guestSongAttribution').textContent = ''
    $('#guestSongIntro').textContent = ''
    $('#guestSessionNames').textContent = ''
    photoGrid.innerHTML = ''
    photoStatus.textContent = ''
    $('#guestSessionBar').hidden = true
    $('#rsvp-form-container').hidden = true
    $('#guestPhotos').hidden = true
    $('#rsvpSaveStatus').hidden = true
    $('#rsvpSaveStatus').textContent = ''
    $('#invitationLoading').hidden = true
    $('#invitationCard').hidden = false
    $('#invitationError').textContent = message
    $('#invitationError').hidden = !message
    loginButton.textContent = 'Open uitnodiging'
    saveButton.textContent = 'Bewaar RSVP en liedje'
    $('#guestLogout').textContent = 'Uitloggen'
    if (message) showLoginPanel()
    else { $('#invitation-code-panel').hidden = true; $('#openInvitationButton').hidden = false }
    updateControls()
  }

  function sessionExpired(error) {
    if (error.status !== 401 || !session) return false
    clearSession('Je sessie is verlopen. Vul je uitnodigingscode opnieuw in om verder te gaan.')
    $('#invitationCode').focus()
    return true
  }

  function renderEvent(guest, part, title) {
    const status = guest[`${part}RsvpStatus`]
    return `<div class="rsvp-event" role="group" aria-label="${title} voor ${escapeHtml(guest.name)}"><div class="rsvp-event-heading"><div><h5>${title}</h5><span>Zaterdag 2 oktober 2027</span></div></div><div class="rsvp-choice-group"><label class="rsvp-choice"><input type="radio" name="${part}-${guest.id}" value="attending" ${status === 'attending' ? 'checked' : ''} required><span>Ja, ik kom</span></label><label class="rsvp-choice"><input type="radio" name="${part}-${guest.id}" value="declined" ${status === 'declined' ? 'checked' : ''} required><span>Nee, ik kom niet</span></label></div></div>`
  }

  function renderGuest(guest) {
    const requirements = Array.isArray(guest.dietaryRequirements) ? guest.dietaryRequirements : []
    const other = requirements.find(item => item.category === 'other')
    return `<article class="rsvp-guest" data-guest-id="${guest.id}"><div class="rsvp-guest-heading"><h4>${escapeHtml(guest.name)}</h4></div>${guest.invitedToDinner ? renderEvent(guest, 'dinner', 'Diner') : ''}${guest.invitedToEvening ? renderEvent(guest, 'evening', 'Avondfeest') : ''}<fieldset class="rsvp-dietary-wrapper guest-unframed" data-dietary-wrapper hidden disabled><div class="rsvp-dietary"><h6>Allergieën &amp; dieetvoorkeuren</h6><p>Heb je een allergie, intolerantie of dieetvoorkeur? Duid hieronder aan wat voor jou van toepassing is. <strong>We zullen hier in de mate van het mogelijke rekening mee houden.</strong></p><div class="dietary-options">${[['vegetarian', 'Vegetarisch'], ['vegan', 'Vegan'], ['other', 'Andere']].map(([category, label]) => `<label class="dietary-option"><input type="checkbox" data-dietary-category="${category}" ${requirements.some(item => item.category === category) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><div class="dietary-other" data-dietary-other hidden><label for="guestDietaryOther-${guest.id}">Welke allergie of dieetvoorkeur?</label><input id="guestDietaryOther-${guest.id}" class="dietary-other-text" type="text" data-dietary-other-text value="${escapeHtml(other?.otherText || '')}" maxlength="250" placeholder="Bijvoorbeeld: glutenallergie"></div></div></fieldset></article>`
  }

  function updateDietary(guest) {
    const attending = $$('input[type="radio"]:checked', guest).some(input => input.value === 'attending')
    const wrapper = $('[data-dietary-wrapper]', guest)
    wrapper.hidden = !attending
    wrapper.disabled = !attending
    const otherChecked = $('[data-dietary-category="other"]', guest).checked
    $('[data-dietary-other]', guest).hidden = !otherChecked
    const text = $('[data-dietary-other-text]', guest)
    text.disabled = !attending || !otherChecked
    text.required = attending && otherChecked
    text.setCustomValidity(attending && otherChecked && !text.value.trim() ? 'Vul je allergie of dieetvoorkeur in.' : '')
  }

  function updateSongValidity() {
    const title = $('#guestSongTitle')
    const artist = $('#guestSongArtist')
    const hasSong = Boolean(title.value.trim() || artist.value.trim())
    title.required = hasSong
    artist.required = hasSong
    title.setCustomValidity(hasSong && !title.value.trim() ? 'Vul ook de titel van het nummer in.' : '')
    artist.setCustomValidity(hasSong && !artist.value.trim() ? 'Vul ook de artiest van het nummer in.' : '')
  }

  function applySession(data) {
    if (!Array.isArray(data.guests) || !data.guests.length || typeof data.csrfToken !== 'string' || !data.csrfToken) throw new Error('De uitnodiging kon niet worden gelezen. Probeer het opnieuw.')
    session = data
    const names = data.guests.map(guest => guest.name).join(' & ')
    const multiple = data.guests.length > 1
    const dinner = data.guests.some(guest => guest.invitedToDinner)
    const evening = data.guests.some(guest => guest.invitedToEvening)
    invitationForm.reset()
    rsvpForm.reset()
    $('#guestList').innerHTML = data.guests.map(renderGuest).join('')
    $$('.rsvp-guest', rsvpForm).forEach(updateDietary)
    $('#invitationHeading').textContent = names
    $('#invitationIntro').textContent = dinner && evening
      ? (multiple ? 'Laat ons weten voor welke onderdelen jullie aanwezig zullen zijn.' : 'Laat ons weten voor welke onderdelen je aanwezig zult zijn.')
      : `${multiple ? 'Kunnen jullie' : 'Kan je'} erbij zijn op ons ${evening ? 'avondfeest' : 'diner'}?`
    $('#rsvpEmail').value = data.email || ''
    $('#guestSongTitle').value = data.song?.title || ''
    $('#guestSongArtist').value = data.song?.artist || ''
    $('#guestSongIntro').textContent = `Welk nummer mag niet ontbreken? Geef hieronder één liedje door voor ${multiple ? 'jullie' : 'je'} uitnodiging. Dit is helemaal optioneel.`
    $('#guestSongAttribution').textContent = `${multiple ? 'Jullie' : 'Je'} liedje wordt gekoppeld aan ${multiple ? 'de namen' : 'de naam'} op deze uitnodiging: ${names}.`
    $('#guestSessionNames').textContent = `Uitnodiging voor ${names}`
    updateSongValidity()
    $('#invitationCard').hidden = true
    $('#invitationError').hidden = true
    $('#guestSessionBar').hidden = false
    $('#rsvp-form-container').hidden = false
    $('#guestPhotos').hidden = false
    $('#rsvpSaveStatus').hidden = true
    clearSelection()
    remotePhotos = []
    quotaBlocked = false
    renderPhotos()
  }

  function renderPhotos() {
    photoGrid.innerHTML = remotePhotos.map(photo => {
      // Image requests authenticate through the cookie; invitation codes never enter URLs.
      const url = `/api/guest/photo?id=${Number(photo.id)}`
      return `<div class="guest-photo-item" data-shared-photo="${Number(photo.id)}"><a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${escapeHtml(photo.filename || 'Gedeelde foto')}" loading="lazy"></a></div>`
    }).join('') + selectedPhotos.map(photo => `<div class="guest-photo-item is-selected" data-selected-photo="${photo.id}"><img src="${photo.url}" alt="Nog te delen: ${escapeHtml(photo.file.name)}"><span class="guest-photo-label">Nog te delen</span><button class="guest-photo-remove" type="button" data-remove-photo="${photo.id}" aria-label="Geselecteerde foto verwijderen">×</button></div>`).join('')
    $('#guestPhotoEmpty').hidden = Boolean(remotePhotos.length || selectedPhotos.length)
    updateControls()
  }

  function showPhotoStatus() {
    if (quotaBlocked || !quota.uploadAvailable) photoStatus.textContent = PHOTO_FULL_MESSAGE
    else photoStatus.textContent = selectedPhotos.length
      ? `${countPhotos(selectedPhotos.length)} klaar om te uploaden.`
      : remotePhotos.length ? `${countPhotos(remotePhotos.length)} gedeeld in onze fotohoek.` : ''
  }

  async function refreshPhotos(ticket) {
    const data = await request('/api/guest/photos')
    if (!isCurrent(ticket)) return
    remotePhotos = (Array.isArray(data.photos) ? data.photos : []).filter(photo => Number.isSafeInteger(Number(photo.id)) && Number(photo.id) > 0)
    quota = data.quota || { uploadAvailable: true }
    renderPhotos()
  }

  async function loadSession(code) {
    const restoring = code === undefined
    const ticket = beginOperation(restoring ? 'restore' : 'login')
    if (!ticket) return
    $('#invitationError').hidden = true
    $('#invitationLoading').hidden = false
    $('#invitationLoading').textContent = restoring ? 'Je uitnodiging controleren…' : 'Uitnodiging laden…'
    loginButton.textContent = 'Laden…'
    try {
      const data = await request('/api/guest/session', restoring ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      if (!isCurrent(ticket)) return
      applySession(data)
      photoStatus.textContent = 'Fotohoek laden…'
      try { await refreshPhotos(ticket); if (isCurrent(ticket)) showPhotoStatus() } catch (error) {
        if (error.stale || sessionExpired(error)) return
        photoStatus.textContent = error.message
      }
    } catch (error) {
      if (error.stale) return
      if (restoring && error.status === 401) { clearSession(); return }
      if (sessionExpired(error)) return
      $('#invitationError').textContent = error.message
      $('#invitationError').hidden = false
      showLoginPanel()
    } finally {
      if (isCurrent(ticket)) {
        $('#invitationLoading').hidden = true
        loginButton.textContent = 'Open uitnodiging'
        finishOperation(ticket)
      }
    }
  }

  $('#openInvitationButton').addEventListener('click', () => {
    if (operation) return
    showLoginPanel()
    $('#invitationCode').focus()
  })
  invitationForm.addEventListener('submit', event => {
    event.preventDefault()
    if (operation) return
    const code = $('#invitationCode').value.trim().toUpperCase()
    if (!CODE_PATTERN.test(code)) {
      $('#invitationError').textContent = 'Vul de uitnodigingscode in die je van ons kreeg, bijvoorbeeld MG-XXXXXX.'
      $('#invitationError').hidden = false
      return
    }
    loadSession(code)
  })

  $('#guestLogout').addEventListener('click', async () => {
    if (!session) return
    const ticket = beginOperation('logout')
    if (!ticket) return
    $('#guestLogout').textContent = 'Uitloggen…'
    try {
      await request('/api/guest/session', { method: 'DELETE', headers: mutationHeaders(false) })
      if (!isCurrent(ticket)) return
      clearSession()
      $('#openInvitationButton').focus()
    } catch (error) {
      if (error.stale || sessionExpired(error)) return
      $('#invitationError').textContent = `Uitloggen is niet gelukt. ${error.message}`
      $('#invitationError').hidden = false
    } finally {
      if (isCurrent(ticket)) { $('#guestLogout').textContent = 'Uitloggen'; finishOperation(ticket) }
    }
  })

  rsvpForm.addEventListener('input', event => {
    const guest = event.target.closest('.rsvp-guest')
    if (guest) updateDietary(guest)
    if (event.target.matches('#guestSongTitle, #guestSongArtist')) updateSongValidity()
    $('#rsvpSaveStatus').hidden = true
  })
  rsvpForm.addEventListener('change', event => {
    const guest = event.target.closest('.rsvp-guest')
    if (guest) updateDietary(guest)
    $('#rsvpSaveStatus').hidden = true
  })
  rsvpForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (!session || operation) return
    updateSongValidity()
    if (!rsvpForm.reportValidity()) return
    const guests = $$('.rsvp-guest', rsvpForm).map(element => {
      const id = Number(element.dataset.guestId)
      const guest = { id, dietaryRequirements: [] }
      for (const part of ['dinner', 'evening']) {
        const radio = $(`input[name="${part}-${id}"]:checked`, element)
        if (radio) guest[part] = { status: radio.value }
      }
      if (guest.dinner?.status === 'attending' || guest.evening?.status === 'attending') {
        guest.dietaryRequirements = $$('[data-dietary-category]:checked', element).map(input => input.dataset.dietaryCategory === 'other'
          ? { category: 'other', otherText: $('[data-dietary-other-text]', element).value.trim() }
          : { category: input.dataset.dietaryCategory })
      }
      return guest
    })
    const title = $('#guestSongTitle').value.trim()
    const artist = $('#guestSongArtist').value.trim()
    const body = { email: $('#rsvpEmail').value.trim(), guests, song: title && artist ? { title, artist } : null }
    const ticket = beginOperation('rsvp')
    if (!ticket) return
    const message = $('#rsvpSaveStatus')
    message.hidden = true
    saveButton.textContent = 'Opslaan…'
    try {
      await request('/api/guest/rsvp', { method: 'POST', headers: mutationHeaders(), body: JSON.stringify(body) })
      if (!isCurrent(ticket)) return
      const multiple = guests.length > 1
      const attending = guests.some(guest => guest.dinner?.status === 'attending' || guest.evening?.status === 'attending')
      message.className = 'rsvp-message rsvp-success'
      message.textContent = `${multiple ? 'Jullie antwoord is' : 'Je antwoord is'} opgeslagen. ${body.song ? `Ook ${multiple ? 'jullie' : 'je'} liedje staat op de lijst. ` : ''}${attending ? 'We kijken ernaar uit om samen onze dag te vieren.' : 'Bedankt om het ons te laten weten.'} ♡`
      message.hidden = false
    } catch (error) {
      if (error.stale || sessionExpired(error)) return
      message.className = 'rsvp-message rsvp-error'
      message.textContent = error.message
      message.hidden = false
    } finally {
      if (isCurrent(ticket)) { saveButton.textContent = 'Bewaar RSVP en liedje'; finishOperation(ticket) }
    }
  })

  function addPhotos(files) {
    if (!session || operation || quotaBlocked || !quota.uploadAvailable) return
    const entries = [...files]
    const valid = entries.filter(file => PHOTO_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_PHOTO_BYTES)
    selectedPhotos.push(...valid.map(file => ({ id: ++nextSelectionId, file, url: URL.createObjectURL(file) })))
    $('#guestPhotoInput').value = ''
    renderPhotos()
    showPhotoStatus()
    if (valid.length !== entries.length) photoStatus.textContent += ' Alleen JPG, PNG en WebP tot 10 MB per foto zijn toegelaten. Andere bestanden zijn overgeslagen.'
  }
  $('#guestPhotoChoose').addEventListener('click', () => { if (!$('#guestPhotoInput').disabled) $('#guestPhotoInput').click() })
  $('#guestPhotoInput').addEventListener('change', event => addPhotos(event.target.files))
  $('#guestPhotoDrop').addEventListener('dragover', event => { event.preventDefault(); if (!$('#guestPhotoInput').disabled) event.currentTarget.classList.add('is-dragging') })
  $('#guestPhotoDrop').addEventListener('dragleave', event => event.currentTarget.classList.remove('is-dragging'))
  $('#guestPhotoDrop').addEventListener('drop', event => { event.preventDefault(); event.currentTarget.classList.remove('is-dragging'); addPhotos(event.dataTransfer.files) })
  photoGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-photo]')
    if (!button || operation) return
    const index = selectedPhotos.findIndex(photo => photo.id === Number(button.dataset.removePhoto))
    if (index === -1) return
    URL.revokeObjectURL(selectedPhotos[index].url)
    selectedPhotos.splice(index, 1)
    renderPhotos()
    showPhotoStatus()
  })
  $('#guestPhotoClear').addEventListener('click', () => {
    if (operation) return
    clearSelection()
    renderPhotos()
    showPhotoStatus()
  })
  $('#guestPhotoRefresh').addEventListener('click', async () => {
    if (!session) return
    const ticket = beginOperation('gallery')
    if (!ticket) return
    photoStatus.textContent = 'Fotohoek vernieuwen…'
    try {
      await refreshPhotos(ticket)
      if (!isCurrent(ticket)) return
      quotaBlocked = false
      showPhotoStatus()
    } catch (error) {
      if (error.stale || sessionExpired(error)) return
      photoStatus.textContent = error.message
    } finally { finishOperation(ticket) }
  })
  $('#guestPhotoUpload').addEventListener('click', async () => {
    if (!session || !selectedPhotos.length || quotaBlocked || !quota.uploadAvailable) return
    const ticket = beginOperation('upload')
    if (!ticket) return
    const pending = [...selectedPhotos]
    const headers = mutationHeaders(false)
    let uploaded = 0
    let failure = ''
    let uncertain = false
    try {
      for (const photo of pending) {
        const body = new FormData()
        body.append('photo', photo.file)
        photoStatus.textContent = `Foto ${uploaded + 1} van ${pending.length} uploaden…`
        const data = await request('/api/guest/photos', { method: 'POST', headers, body }, 120_000)
        if (!isCurrent(ticket)) return
        uploaded++
        // Confirmed uploads leave the queue immediately, including when a later upload fails.
        selectedPhotos = selectedPhotos.filter(item => item.id !== photo.id)
        URL.revokeObjectURL(photo.url)
        if (data.photo && Number.isSafeInteger(Number(data.photo.id))) remotePhotos.unshift(data.photo)
        renderPhotos()
      }
    } catch (error) {
      if (error.stale || sessionExpired(error)) return
      if (error.quotaReached) quotaBlocked = true
      else { failure = error.message; uncertain = !error.status }
    } finally {
      if (isCurrent(ticket)) {
        try { await refreshPhotos(ticket) } catch (error) {
          if (!error.stale && !sessionExpired(error) && !failure) failure = `De fotohoek kon niet vernieuwd worden. ${error.message}`
        }
        if (isCurrent(ticket)) {
          if (quotaBlocked || !quota.uploadAvailable) photoStatus.textContent = PHOTO_FULL_MESSAGE
          else if (failure) photoStatus.textContent = `${uploaded ? `${countPhotos(uploaded)} gedeeld. ` : ''}${failure}${uncertain ? ' Mogelijk is de laatste foto toch opgeslagen. Bekijk eerst de fotohoek voordat je opnieuw uploadt.' : selectedPhotos.length ? ' De overige foto’s staan nog klaar om opnieuw te proberen.' : ''}`
          else photoStatus.textContent = `${countPhotos(uploaded)} gedeeld. Dankjewel! ♡`
          finishOperation(ticket)
        }
      }
    }
  })

  updateControls()
  loadSession()
}
