(() => {
  'use strict'

  const INVITE_KEY = 'mg-wedding-invite-code'
  const photoMessage = `Wat ontzettend leuk! ❤️\n\nWe hadden eerlijk gezegd niet verwacht dat er zóveel foto's gedeeld zouden worden — en daar zijn we natuurlijk alleen maar blij mee!\n\nWe hebben ondertussen het maximum aantal foto's bereikt dat we online kunnen bewaren. Nieuwe foto's uploaden kan daarom voorlopig niet meer.\n\nHeb je nog foto's van onze dag? Deel ze dan gerust op een andere manier met ons. We bekijken ze met heel veel plezier en genieten er graag samen met jullie nog eens van. 🥰`

  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options
    })

    const text = await response.text()
    let data = null
    try { data = JSON.parse(text) } catch {}
    if (!data) throw new Error('De server gaf een ongeldig antwoord.')
    return { response, data }
  }

  function rememberInviteCodeCapture() {
    const form = $('#inviteForm')
    if (!form) return
    form.addEventListener('submit', () => {
      const code = ($('#inviteCode')?.value || '').trim().toUpperCase()
      if (/^MG-[A-Z0-9]{6}$/.test(code)) sessionStorage.setItem(INVITE_KEY, code)
    }, true)
  }

  function setupMusic() {
    const originalForm = $('#songForm')
    const list = $('#songList')
    const empty = $('#songEmpty')
    const card = originalForm?.closest('.song-card')
    if (!originalForm || !list || !empty || !card) return

    const form = originalForm.cloneNode(true)
    originalForm.replaceWith(form)

    const oldNote = $('.note', card)
    if (oldNote) oldNote.textContent = 'Suggesties worden gedeeld met iedereen op deze trouwpagina. Om spam te voorkomen is het aantal inzendingen per internetverbinding beperkt.'

    const originalTitle = $('#songTitle', form)
    const originalArtist = $('#songArtist', form)
    const submit = $('button[type="submit"]', form)

    const name = document.createElement('input')
    name.className = 'field'
    name.id = 'songSuggestedBy'
    name.maxLength = 80
    name.placeholder = 'Jouw naam (optioneel)'
    name.style.gridColumn = '1 / -1'
    name.style.height = '42px'
    form.insertBefore(name, submit)

    async function renderSongs() {
      try {
        const { response, data } = await jsonFetch('/api/music/suggestions')
        if (!response.ok || !data.ok) throw new Error(data.error || 'Muzieksuggesties konden niet worden geladen.')
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : []
        list.innerHTML = suggestions.map(song => `
          <div class="song">
            <div class="song-art">♪</div>
            <div class="song-meta">
              <strong>${escapeHtml(song.title)}</strong>
              <span>${escapeHtml(song.artist)}${song.suggested_by ? ` · ${escapeHtml(song.suggested_by)}` : ''}</span>
            </div>
            <a href="https://open.spotify.com/search/${encodeURIComponent(song.title + ' ' + song.artist)}" target="_blank" rel="noopener">Spotify ↗</a>
          </div>
        `).join('')
        empty.style.display = suggestions.length ? 'none' : 'block'
      } catch (error) {
        list.innerHTML = ''
        empty.style.display = 'block'
        empty.textContent = error.message || 'Muzieksuggesties konden niet worden geladen.'
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const title = originalTitle.value.trim()
      const artist = originalArtist.value.trim()
      const suggestedBy = name.value.trim()
      if (!title || !artist) return

      submit.disabled = true
      const previousText = submit.textContent
      submit.textContent = 'Toevoegen…'
      try {
        const { response, data } = await jsonFetch('/api/music/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, artist, suggestedBy })
        })
        if (!response.ok || !data.ok) throw new Error(data.error || 'Je nummer kon niet worden toegevoegd.')
        form.reset()
        await renderSongs()
        empty.textContent = data.duplicate ? 'Dit nummer stond al op de lijst. ♡' : 'Nog geen suggesties — wees de eerste die de dansvloer programmeert.'
      } catch (error) {
        empty.style.display = 'block'
        empty.textContent = error.message || 'Je nummer kon niet worden toegevoegd.'
      } finally {
        submit.disabled = false
        submit.textContent = previousText
      }
    })

    renderSongs()
  }

  function setupPhotos() {
    const originalDrop = $('#photoDrop')
    const originalInput = $('#photoInput')
    const photoGrid = $('#photoGrid')
    const card = originalDrop?.closest('.photo-card')
    const clearButton = $('#clearPhotos')
    const uploadButton = $('#sharePhotos')
    const status = $('#photoStatus')
    if (!originalDrop || !originalInput || !photoGrid || !card || !clearButton || !uploadButton || !status) return

    const access = document.createElement('div')
    access.id = 'photoAccess'
    access.style.cssText = 'margin-bottom:18px;padding:22px;background:rgba(247,233,212,.42);border:1px solid rgba(79,84,48,.14);text-align:center'
    access.innerHTML = `
      <strong style="display:block;color:var(--olive-dark);font:500 1.55rem var(--serif);margin-bottom:8px">Foto's delen is voor genodigden</strong>
      <p style="margin:0 auto 14px;max-width:620px;color:#6f6d5e;font-size:.72rem;line-height:1.8">Gebruik één keer de persoonlijke uitnodigingscode die je van ons kreeg. Daarna onthouden we hem op dit toestel tijdens je bezoek.</p>
      <div style="display:flex;gap:10px;max-width:520px;margin:0 auto;flex-wrap:wrap;justify-content:center">
        <input class="field" id="photoInviteCode" maxlength="9" placeholder="MG-XXXXXX" autocomplete="off" style="flex:1;min-width:180px">
        <button class="button primary" type="button" id="photoUnlock">Fotohoek openen</button>
      </div>
      <div id="photoAccessStatus" class="note"></div>
    `
    card.insertBefore(access, originalDrop)

    const accessInput = $('#photoInviteCode')
    const unlockButton = $('#photoUnlock')
    const accessStatus = $('#photoAccessStatus')

    const newDrop = originalDrop.cloneNode(true)
    originalDrop.replaceWith(newDrop)
    const newInput = $('#photoInput', newDrop)

    uploadButton.textContent = 'Foto\'s uploaden'
    const note = $('.note', card)
    if (note && note !== status) note.textContent = 'Foto\'s worden veilig in gedeelde opslag bewaard. Je uitnodigingscode is nodig om ze te bekijken en te uploaden.'

    let photoFiles = []
    let unlockedCode = sessionStorage.getItem(INVITE_KEY) || ''
    let quota = { usedBytes: 0, limitBytes: 10_000_000_000, remainingBytes: 10_000_000_000, uploadAvailable: true }

    function setStatus(message) { status.textContent = message }

    function setLocked(locked, message = '') {
      newDrop.style.opacity = locked ? '.55' : '1'
      newDrop.style.pointerEvents = locked ? 'none' : 'auto'
      newInput.disabled = locked
      uploadButton.disabled = locked
      if (message) accessStatus.textContent = message
    }

    function formatBytes(bytes) {
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

    function showQuotaReached() {
      photoFiles = []
      newInput.value = ''
      renderLocalPhotos()
      setLocked(true, 'Nieuwe uploads zijn tijdelijk uitgeschakeld.')
      setStatus(photoMessage)
    }

    function renderLocalPhotos() {
      const localMarkup = photoFiles.map((file, index) => {
        const url = URL.createObjectURL(file)
        return `<div class="photo-item"><img src="${url}" alt="Geselecteerde foto"><button class="photo-remove" type="button" data-local-index="${index}" aria-label="Foto verwijderen">×</button></div>`
      }).join('')
      const remote = $$('.photo-item[data-remote-photo="true"]', photoGrid).map(el => el.outerHTML).join('')
      photoGrid.innerHTML = remote + localMarkup
      $$('[data-local-index]', photoGrid).forEach(button => button.addEventListener('click', () => {
        photoFiles.splice(Number(button.dataset.localIndex), 1)
        renderLocalPhotos()
      }))
    }

    async function loadGallery() {
      if (!unlockedCode) {
        setLocked(true)
        return
      }

      accessInput.value = unlockedCode
      try {
        const { response, data } = await jsonFetch(`/api/photos?code=${encodeURIComponent(unlockedCode)}`)
        if (!response.ok || !data.ok) throw new Error(data.error || 'De fotohoek kon niet worden geopend.')
        quota = data.quota || quota
        access.style.display = 'none'
        setLocked(false)
        const remote = Array.isArray(data.photos) ? data.photos : []
        photoGrid.innerHTML = remote.map(photo => `
          <div class="photo-item" data-remote-photo="true">
            <img src="${escapeHtml(photo.url)}" alt="Gedeelde foto" loading="lazy">
          </div>
        `).join('')
        renderLocalPhotos()
        if (!quota.uploadAvailable) {
          showQuotaReached()
        } else {
          setStatus(remote.length ? `${remote.length} foto${remote.length === 1 ? '' : '\'s'} online. Je hebt nog ongeveer ${formatBytes(quota.remainingBytes)} beschikbaar.` : 'Nog geen foto\'s gedeeld.')
        }
      } catch (error) {
        sessionStorage.removeItem(INVITE_KEY)
        unlockedCode = ''
        access.style.display = ''
        setLocked(true)
        accessStatus.textContent = error.message || 'De uitnodigingscode kon niet worden gecontroleerd.'
      }
    }

    unlockButton.addEventListener('click', async () => {
      const code = accessInput.value.trim().toUpperCase()
      if (!/^MG-[A-Z0-9]{6}$/.test(code)) {
        accessStatus.textContent = 'Vul een geldige uitnodigingscode in.'
        return
      }
      unlockButton.disabled = true
      unlockButton.textContent = 'Controleren…'
      try {
        const { response, data } = await jsonFetch(`/api/photos?code=${encodeURIComponent(code)}`)
        if (!response.ok || !data.ok) throw new Error(data.error || 'Deze uitnodigingscode is ongeldig.')
        sessionStorage.setItem(INVITE_KEY, code)
        unlockedCode = code
        quota = data.quota || quota
        access.style.display = 'none'
        setLocked(false)
        photoGrid.innerHTML = (data.photos || []).map(photo => `<div class="photo-item" data-remote-photo="true"><img src="${escapeHtml(photo.url)}" alt="Gedeelde foto" loading="lazy"></div>`).join('')
        renderLocalPhotos()
        if (!quota.uploadAvailable) showQuotaReached()
        else setStatus((data.photos || []).length ? `${data.photos.length} foto${data.photos.length === 1 ? '' : '\'s'} online.` : 'Nog geen foto\'s gedeeld.')
      } catch (error) {
        accessStatus.textContent = error.message || 'Deze uitnodigingscode is ongeldig.'
      } finally {
        unlockButton.disabled = false
        unlockButton.textContent = 'Fotohoek openen'
      }
    })

    accessInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') unlockButton.click()
    })

    function addFiles(files) {
      const valid = [...files].filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024)
      if (valid.length !== [...files].length) setStatus('Alleen JPG, PNG en WebP tot 10 MB per foto zijn toegelaten.')
      photoFiles.push(...valid)
      renderLocalPhotos()
      if (photoFiles.length) setStatus(`${photoFiles.length} foto${photoFiles.length === 1 ? '' : '\'s'} klaar om te uploaden.`)
    }

    newInput.addEventListener('change', event => addFiles(event.target.files))
    newDrop.addEventListener('dragover', event => { event.preventDefault(); newDrop.classList.add('drag') })
    newDrop.addEventListener('dragleave', () => newDrop.classList.remove('drag'))
    newDrop.addEventListener('drop', event => {
      event.preventDefault()
      newDrop.classList.remove('drag')
      addFiles(event.dataTransfer.files)
    })

    clearButton.addEventListener('click', () => {
      photoFiles = []
      newInput.value = ''
      renderLocalPhotos()
      setStatus(quota.uploadAvailable ? 'Nog geen foto\'s klaar om te uploaden.' : 'Nieuwe uploads zijn tijdelijk uitgeschakeld.')
    })

    uploadButton.addEventListener('click', async () => {
      if (!unlockedCode) {
        access.scrollIntoView({ behavior: 'smooth', block: 'center' })
        accessInput.focus()
        return
      }
      if (!photoFiles.length) {
        setStatus('Voeg eerst minstens één foto toe.')
        return
      }
      if (!quota.uploadAvailable) {
        showQuotaReached()
        return
      }

      uploadButton.disabled = true
      clearButton.disabled = true
      let uploaded = 0

      try {
        for (const file of [...photoFiles]) {
          const formData = new FormData()
          formData.append('code', unlockedCode)
          formData.append('photo', file)
          setStatus(`Foto ${uploaded + 1} van ${photoFiles.length} uploaden…`)

          const { response, data } = await jsonFetch('/api/photos', {
            method: 'POST',
            body: formData
          })

          if (!response.ok || !data.ok) {
            if (data?.quotaReached) {
              showQuotaReached()
              break
            }
            throw new Error(data.error || 'De foto kon niet worden opgeslagen.')
          }

          uploaded++
        }

        photoFiles = photoFiles.slice(uploaded)
        newInput.value = ''
        await loadGallery()
        if (uploaded) setStatus(`${uploaded} foto${uploaded === 1 ? '' : '\'s'} gedeeld. Dankjewel! ♡`)
      } catch (error) {
        setStatus(error.message || 'Er ging iets mis tijdens het uploaden.')
      } finally {
        uploadButton.disabled = false
        clearButton.disabled = false
        if (!quota.uploadAvailable) showQuotaReached()
      }
    })

    loadGallery()
  }

  rememberInviteCodeCapture()
  setupMusic()
  setupPhotos()
})()
