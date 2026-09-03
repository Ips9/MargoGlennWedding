(() => {
  'use strict'

  // The original preview demo had a browser-native share handler on this button.
  // The real implementation now uploads to R2, so prevent the old share dialog
  // from competing with the upload flow.
  try {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => false
    })
  } catch {
    // Ignore browsers that expose canShare as a non-configurable property.
  }

  const inviteKey = 'mg-wedding-invite-code'
  const photoMessage = `Wat ontzettend leuk! ❤️\n\nWe hadden eerlijk gezegd niet verwacht dat er zóveel foto's gedeeld zouden worden — en daar zijn we natuurlijk alleen maar blij mee!\n\nWe hebben ondertussen het maximum aantal foto's bereikt dat we online kunnen bewaren. Nieuwe foto's uploaden kan daarom voorlopig niet meer.\n\nHeb je nog foto's van onze dag? Deel ze dan gerust op een andere manier met ons. We bekijken ze met heel veel plezier en genieten er graag samen met jullie nog eens van. 🥰`

  const clearButton = document.getElementById('clearPhotos')
  const grid = document.getElementById('photoGrid')
  const status = document.getElementById('photoStatus')

  async function refreshGallery() {
    const code = sessionStorage.getItem(inviteKey)
    if (!code || !grid) return

    try {
      const response = await fetch(`/api/photos?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.ok) return

      grid.innerHTML = (data.photos || []).map(photo => `
        <div class="photo-item" data-remote-photo="true">
          <img src="${String(photo.url).replaceAll('"', '&quot;')}" alt="Gedeelde foto" loading="lazy">
        </div>
      `).join('')

      if (!data.quota?.uploadAvailable) {
        status.textContent = photoMessage
      } else {
        const count = (data.photos || []).length
        status.textContent = count
          ? `${count} foto${count === 1 ? '' : '\'s'} online.`
          : 'Nog geen foto\'s gedeeld.'
      }
    } catch {
      // The primary preview app already reports upload/network errors.
    }
  }

  // The legacy clear handler runs first and redraws its local demo state.
  // Reload the real R2 gallery afterwards so shared photos remain visible.
  clearButton?.addEventListener('click', () => {
    setTimeout(refreshGallery, 0)
  })
})()
