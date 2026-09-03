(() => {
  'use strict'

  // Older Worker versions also inject this script. Initialize each form once.
  if (window.mgWeddingPreviewInitialized) return
  window.mgWeddingPreviewInitialized = true

  const INVITE_KEY = 'mg-wedding-invite-code'
  const CODE_PATTERN = /^MG-[A-Z0-9]{6}$/
  const photoMessage = `Wat ontzettend leuk! ❤️\n\nWe hadden eerlijk gezegd niet verwacht dat er zóveel foto's gedeeld zouden worden — en daar zijn we natuurlijk alleen maar blij mee!\n\nWe hebben ondertussen het maximum aantal foto's bereikt dat we online kunnen bewaren. Nieuwe foto's uploaden kan daarom voorlopig niet meer.\n\nHeb je nog foto's van onze dag? Deel ze dan gerust op een andere manier met ons. We bekijken ze met heel veel plezier en genieten er graag samen met jullie nog eens van. 🥰`
  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;')

  function savedCode() {
    try { return sessionStorage.getItem(INVITE_KEY) || '' } catch { return '' }
  }

  function rememberCode(code) {
    try { sessionStorage.setItem(INVITE_KEY, code) } catch {}
  }

  function forgetCode(code) {
    try { if (savedCode() === code) sessionStorage.removeItem(INVITE_KEY) } catch {}
  }

  async function jsonFetch(url, options = {}, timeoutMs = 20_000) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        headers: { Accept: 'application/json', ...(options.headers || {}) },
        signal: controller.signal
      })
      const text = await response.text()
      let data
      try { data = JSON.parse(text) } catch {}
      if (!data || !response.ok || !data.ok) {
        const translations = {
          'Invalid invitation': 'Deze uitnodigingscode is ongeldig of niet meer actief.',
          'RSVP deadline has passed': 'De datum om je RSVP te wijzigen is verstreken. Neem gerust contact met ons op.',
          'Unable to process invitation': 'De uitnodiging kon niet worden geladen. Probeer het opnieuw.',
          'Unable to save RSVP': 'Je RSVP kon niet worden opgeslagen. Probeer het opnieuw.'
        }
        const error = new Error(translations[data?.error] || data?.error || 'De server gaf een ongeldig antwoord. Probeer het opnieuw.')
        error.status = response.status
        error.quotaReached = Boolean(data?.quotaReached)
        throw error
      }
      return data
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Het laden duurt te lang. Controleer je verbinding en probeer het opnieuw.')
      if (error instanceof TypeError) throw new Error('Geen verbinding met de server. Controleer je verbinding en probeer het opnieuw.')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  function setupMusic() {
    const form = $('#songForm')
    const list = $('#songList')
    const empty = $('#songEmpty')
    if (!form || !list || !empty) return
    const submit = $('button[type="submit"]', form)
    const status = document.createElement('div')
    status.className = 'note'
    status.id = 'songStatus'
    status.setAttribute('role', 'status')
    form.after(status)

    async function renderSongs() {
      const data = await jsonFetch('/api/music/suggestions')
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
      list.innerHTML = suggestions.map(song => `
        <div class="song">
          <div class="song-art">♪</div>
          <div class="song-meta">
            <strong>${escapeHtml(song.title)}</strong>
            <span>${escapeHtml(song.artist)}${song.suggested_by ? ` · ${escapeHtml(song.suggested_by)}` : ''}</span>
          </div>
          <a href="https://open.spotify.com/search/${encodeURIComponent(song.title + ' ' + song.artist)}" target="_blank" rel="noopener noreferrer">Spotify ↗</a>
        </div>
      `).join('')
      empty.style.display = suggestions.length ? 'none' : 'block'
    }

    form.addEventListener('submit', async event => {
      event.preventDefault()
      if (submit.disabled) return
      const title = $('#songTitle', form).value.trim()
      const artist = $('#songArtist', form).value.trim()
      const suggestedBy = $('#songSuggestedBy', form).value.trim()
      if (!title || !artist) {
        status.textContent = 'Vul de titel en artiest van je nummer in.'
        return
      }
      submit.disabled = true
      submit.textContent = 'Toevoegen…'
      status.textContent = ''
      try {
        const data = await jsonFetch('/api/music/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, artist, suggestedBy })
        })
        form.reset()
        status.textContent = data.duplicate ? 'Dit nummer stond al op de lijst. ♡' : 'Je nummer staat op de lijst. Dankjewel! ♡'
        try { await renderSongs() } catch {
          status.textContent += ' De lijst kon nog niet vernieuwd worden. Herlaad de pagina om je suggestie te bekijken.'
        }
      } catch (error) {
        status.textContent = error.message
      } finally {
        submit.disabled = false
        submit.textContent = 'Nummer toevoegen'
      }
    })

    renderSongs().catch(error => { status.textContent = error.message })
  }

  function setupPhotos() {
    const drop = $('#photoDrop')
    const input = $('#photoInput')
    const grid = $('#photoGrid')
    const clearButton = $('#clearPhotos')
    const uploadButton = $('#sharePhotos')
    const status = $('#photoStatus')
    if (!drop || !input || !grid || !clearButton || !uploadButton || !status) return

    const access = document.createElement('div')
    access.id = 'photoAccess'
    access.className = 'photo-access'
    access.innerHTML = `
      <strong>Foto's delen is voor genodigden</strong>
      <p>Gebruik de persoonlijke uitnodigingscode die je van ons kreeg. We onthouden hem tijdens je bezoek.</p>
      <div class="photo-access-form">
        <input class="field" id="photoInviteCode" maxlength="9" placeholder="MG-XXXXXX" aria-label="Uitnodigingscode voor foto's" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button class="button primary" type="button" id="photoUnlock">Fotohoek openen</button>
      </div>
      <div id="photoAccessStatus" class="note" role="status"></div>
    `
    drop.before(access)
    const accessInput = $('#photoInviteCode', access)
    const unlockButton = $('#photoUnlock', access)
    const accessStatus = $('#photoAccessStatus', access)
    let photoFiles = []
    let remotePhotos = []
    let unlockedCode = ''
    let authorized = false
    let unlocking = false
    let uploading = false
    let quotaBlocked = false
    let quota = { remainingBytes: 10_000_000_000, uploadAvailable: true }
    const objectUrls = new Map()

    function updateControls() {
      const disabled = !authorized || unlocking || uploading || quotaBlocked || !quota.uploadAvailable
      drop.style.opacity = disabled ? '.55' : '1'
      drop.style.pointerEvents = disabled ? 'none' : 'auto'
      input.disabled = disabled
      uploadButton.disabled = disabled
      clearButton.disabled = uploading || !photoFiles.length
      $$('[data-local-index]', grid).forEach(button => { button.disabled = uploading })
    }

    function renderPhotos() {
      for (const [file, url] of objectUrls) {
        if (!photoFiles.includes(file)) {
          URL.revokeObjectURL(url)
          objectUrls.delete(file)
        }
      }
      grid.innerHTML = remotePhotos.map(photo => `
        <div class="photo-item" data-remote-photo="true"><a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(photo.url)}" alt="Gedeelde foto" loading="lazy"></a></div>
      `).join('') + photoFiles.map((file, index) => {
        if (!objectUrls.has(file)) objectUrls.set(file, URL.createObjectURL(file))
        return `<div class="photo-item"><img src="${objectUrls.get(file)}" alt="Geselecteerde foto"><button class="photo-remove" type="button" data-local-index="${index}" aria-label="Geselecteerde foto verwijderen">×</button></div>`
      }).join('')
      updateControls()
    }

    function showQuotaReached() {
      quotaBlocked = true
      status.textContent = photoMessage
      updateControls()
    }

    function showGalleryStatus() {
      if (quotaBlocked || !quota.uploadAvailable) return showQuotaReached()
      status.textContent = photoFiles.length
        ? `${photoFiles.length} foto${photoFiles.length === 1 ? '' : "'s"} klaar om te uploaden.`
        : remotePhotos.length ? `${remotePhotos.length} foto${remotePhotos.length === 1 ? '' : "'s"} online.` : "Nog geen foto's gedeeld."
    }

    function lockInvalidCode(error, code) {
      if (![401, 403, 404].includes(error.status)) return
      forgetCode(code)
      authorized = false
      unlockedCode = ''
      remotePhotos = []
      access.hidden = false
      accessStatus.textContent = error.message
      renderPhotos()
    }

    async function refreshGallery(code) {
      const data = await jsonFetch(`/api/photos?code=${encodeURIComponent(code)}`)
      unlockedCode = code
      authorized = true
      rememberCode(code)
      quota = data.quota || quota
      remotePhotos = Array.isArray(data.photos) ? data.photos : []
      access.hidden = true
      renderPhotos()
    }

    async function unlock(code) {
      if (uploading || unlockButton.disabled) return
      accessInput.value = code
      if (!CODE_PATTERN.test(code)) {
        accessStatus.textContent = 'Vul een geldige uitnodigingscode in.'
        return
      }
      unlockButton.disabled = true
      unlocking = true
      unlockButton.textContent = 'Controleren…'
      accessStatus.textContent = ''
      updateControls()
      try {
        await refreshGallery(code)
        quotaBlocked = false
        showGalleryStatus()
      } catch (error) {
        lockInvalidCode(error, code)
        accessStatus.textContent = error.message
        access.hidden = false
      } finally {
        unlocking = false
        unlockButton.disabled = false
        unlockButton.textContent = 'Fotohoek openen'
        updateControls()
      }
    }

    unlockButton.addEventListener('click', () => unlock(accessInput.value.trim().toUpperCase()))
    accessInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); unlockButton.click() }
    })
    document.addEventListener('wedding:invitation', event => {
      if (event.detail.code !== unlockedCode) unlock(event.detail.code)
    })

    function addFiles(files) {
      if (!authorized || unlocking || uploading || quotaBlocked || !quota.uploadAvailable) return
      const selected = [...files]
      const valid = selected.filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024)
      photoFiles.push(...valid)
      input.value = ''
      renderPhotos()
      showGalleryStatus()
      if (valid.length !== selected.length) status.textContent += ' Alleen JPG, PNG en WebP tot 10 MB per foto zijn toegelaten. Andere bestanden zijn overgeslagen.'
    }

    input.addEventListener('change', event => addFiles(event.target.files))
    drop.addEventListener('dragover', event => { event.preventDefault(); if (!input.disabled) drop.classList.add('drag') })
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'))
    drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('drag'); addFiles(event.dataTransfer.files) })
    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-local-index]')
      if (!button || uploading) return
      photoFiles.splice(Number(button.dataset.localIndex), 1)
      renderPhotos()
      showGalleryStatus()
    })
    clearButton.addEventListener('click', () => {
      if (uploading) return
      photoFiles = []
      input.value = ''
      renderPhotos()
      showGalleryStatus()
    })

    uploadButton.addEventListener('click', async () => {
      if (!authorized || unlocking || uploading) return
      if (quotaBlocked || !quota.uploadAvailable) return showQuotaReached()
      if (!photoFiles.length) { status.textContent = 'Voeg eerst minstens één foto toe.'; return }
      uploading = true
      updateControls()
      const pending = [...photoFiles]
      const uploadCode = unlockedCode
      let uploaded = 0
      let failure = ''
      try {
        for (const file of pending) {
          const formData = new FormData()
          formData.append('code', uploadCode)
          formData.append('photo', file)
          status.textContent = `Foto ${uploaded + 1} van ${pending.length} uploaden…`
          const data = await jsonFetch('/api/photos', { method: 'POST', body: formData }, 120_000)
          uploaded++
          // Remove successes immediately, so retrying a partial failure never resends them.
          photoFiles.splice(photoFiles.indexOf(file), 1)
          if (data.photo) remotePhotos.unshift(data.photo)
          renderPhotos()
        }
      } catch (error) {
        if (error.quotaReached) quotaBlocked = true
        else { failure = error.message; lockInvalidCode(error, uploadCode) }
      } finally {
        if (authorized) {
          try { await refreshGallery(uploadCode) } catch (error) {
            lockInvalidCode(error, uploadCode)
            if (!failure) failure = `De fotolijst kon niet vernieuwd worden. ${error.message}`
          }
        }
        uploading = false
        renderPhotos()
        if (quotaBlocked || !quota.uploadAvailable) showQuotaReached()
        else if (failure) status.textContent = `${uploaded ? `${uploaded} foto${uploaded === 1 ? '' : "'s"} gedeeld. ` : ''}${failure}${photoFiles.length ? ' De overige foto’s staan nog klaar om opnieuw te proberen.' : ''}`
        else if (uploaded) status.textContent = `${uploaded} foto${uploaded === 1 ? '' : "'s"} gedeeld. Dankjewel! ♡`
      }
    })

    updateControls()
    const code = savedCode()
    if (CODE_PATTERN.test(code)) unlock(code)
  }

  function setupRsvp() {
    const inviteForm = $('#inviteForm')
    const result = $('#rsvpResult')
    const status = $('#inviteStatus')
    if (!inviteForm || !result || !status) return
    const inviteButton = $('button[type="submit"]', inviteForm)
    let currentCode = ''

    function renderEvent(guest, part, label) {
      const value = guest[`${part}RsvpStatus`]
      return `<fieldset class="preview-event"><legend>${label}</legend><div class="preview-choices">
        <label><input type="radio" name="${part}-${guest.id}" value="attending" ${value === 'attending' ? 'checked' : ''} required> Ja, ik kom</label>
        <label><input type="radio" name="${part}-${guest.id}" value="declined" ${value === 'declined' ? 'checked' : ''} required> Nee, ik kom niet</label>
      </div></fieldset>`
    }

    function renderGuest(guest) {
      const requirements = Array.isArray(guest.dietaryRequirements) ? guest.dietaryRequirements : []
      const other = requirements.find(item => item.category === 'other')
      return `<article class="preview-guest" data-guest-id="${guest.id}">
        <h4>${escapeHtml(guest.name)}</h4>
        ${guest.invitedToDinner ? renderEvent(guest, 'dinner', 'Diner') : ''}
        ${guest.invitedToEvening ? renderEvent(guest, 'evening', 'Avondfeest') : ''}
        <fieldset class="preview-diet" data-dietary hidden disabled>
          <legend>Allergieën &amp; dieetvoorkeuren</legend>
          <p>Geef hier je voorkeuren door. We houden er in de mate van het mogelijke rekening mee.</p>
          <div class="preview-choices">${[['vegetarian', 'Vegetarisch'], ['vegan', 'Vegan'], ['other', 'Andere']].map(([category, label]) => `<label><input type="checkbox" data-category="${category}" ${requirements.some(item => item.category === category) ? 'checked' : ''}> ${label}</label>`).join('')}</div>
          <label class="preview-other" data-other-label hidden>Welke allergie of dieetvoorkeur?<input class="field" data-other-text maxlength="250" value="${escapeHtml(other?.otherText || '')}" placeholder="Bijvoorbeeld: glutenallergie"></label>
        </fieldset>
      </article>`
    }

    function updateDietary(guest) {
      const attending = $$('input[type="radio"]:checked', guest).some(input => input.value === 'attending')
      const dietary = $('[data-dietary]', guest)
      dietary.hidden = !attending
      dietary.disabled = !attending
      const other = $('[data-category="other"]', guest).checked
      $('[data-other-label]', guest).hidden = !other
      const text = $('[data-other-text]', guest)
      text.disabled = !attending || !other
      text.required = attending && other
    }

    function renderInvitation(data) {
      const single = data.guests.length === 1
      result.innerHTML = `<h3>${single ? `Welkom ${escapeHtml(data.guests[0].name)}` : 'Welkom!'}</h3>
        <p>${single ? 'Laat ons weten voor welke onderdelen je aanwezig zult zijn.' : 'Laat ons weten voor welke onderdelen jullie aanwezig zullen zijn.'}</p>
        <form id="previewRsvpForm">
          <fieldset class="preview-rsvp-fields">${data.guests.map(renderGuest).join('')}
            <div class="preview-email"><label for="previewRsvpEmail">E-mailadres (optioneel)</label><p>Laat je e-mailadres achter als je na het feest graag enkele foto's ontvangt. <strong>Dit e-mailadres gaat uitsluitend naar Margo &amp; Glenn en wordt met niemand anders gedeeld.</strong></p><input class="field" type="email" id="previewRsvpEmail" autocomplete="email" maxlength="254" value="${escapeHtml(data.email || '')}" placeholder="jouw@email.be"></div>
          </fieldset>
          <div class="note" id="previewRsvpStatus" role="status"></div>
          <div class="button-row"><button class="button primary" type="submit">Bevestig RSVP</button></div>
        </form>`
      const form = $('#previewRsvpForm', result)
      $$('.preview-guest', form).forEach(updateDietary)
      form.addEventListener('change', event => {
        const guest = event.target.closest('.preview-guest')
        if (guest) updateDietary(guest)
      })
      form.addEventListener('submit', async event => {
        event.preventDefault()
        const button = $('button[type="submit"]', form)
        const message = $('#previewRsvpStatus', form)
        if (button.disabled) return
        const guests = $$('.preview-guest', form).map(element => {
          const id = Number(element.dataset.guestId)
          const guest = { id, dietaryRequirements: [] }
          for (const part of ['dinner', 'evening']) {
            const checked = $(`input[name="${part}-${id}"]:checked`, element)
            if (checked) guest[part] = { status: checked.value }
          }
          if (guest.dinner?.status === 'attending' || guest.evening?.status === 'attending') {
            guest.dietaryRequirements = $$('[data-category]:checked', element).map(input => input.dataset.category === 'other'
              ? { category: 'other', otherText: $('[data-other-text]', element).value.trim() }
              : { category: input.dataset.category })
          }
          return guest
        })
        const email = $('#previewRsvpEmail', form).value.trim()
        const fields = $('.preview-rsvp-fields', form)
        button.disabled = true
        fields.disabled = true
        inviteButton.disabled = true
        button.textContent = 'Opslaan…'
        message.textContent = ''
        try {
          await jsonFetch('/api/rsvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: currentCode, email, guests }) })
          const attending = guests.some(guest => guest.dinner?.status === 'attending' || guest.evening?.status === 'attending')
          message.textContent = `${single ? 'Je RSVP is ontvangen.' : 'Jullie RSVP is ontvangen.'} ${attending ? 'We kijken ernaar uit om samen onze dag te vieren.' : 'Bedankt om het ons te laten weten.'} ♡`
          status.textContent = 'Antwoord opgeslagen ♡'
        } catch (error) {
          message.textContent = error.message
        } finally {
          button.disabled = false
          fields.disabled = false
          inviteButton.disabled = false
          button.textContent = 'Bevestig RSVP'
        }
      })
      result.style.display = 'block'
    }

    inviteForm.addEventListener('submit', async event => {
      event.preventDefault()
      if (inviteButton.disabled) return
      const code = $('#inviteCode').value.trim().toUpperCase()
      result.style.display = 'none'
      if (!CODE_PATTERN.test(code)) { status.textContent = 'Vul een geldige uitnodigingscode in.'; return }
      inviteButton.disabled = true
      inviteButton.textContent = 'Laden…'
      status.textContent = 'Uitnodiging laden…'
      try {
        const data = await jsonFetch(`/api/invitation?code=${encodeURIComponent(code)}`)
        if (!Array.isArray(data.guests) || !data.guests.length) throw new Error('Deze uitnodiging bevat nog geen gasten.')
        currentCode = code
        rememberCode(code)
        renderInvitation(data)
        status.textContent = 'Uitnodiging gevonden ♡'
        document.dispatchEvent(new CustomEvent('wedding:invitation', { detail: { code } }))
      } catch (error) {
        status.textContent = error.message
      } finally {
        inviteButton.disabled = false
        inviteButton.textContent = 'Open uitnodiging'
      }
    })
  }

  setupMusic()
  setupPhotos()
  setupRsvp()
})()
