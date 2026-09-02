(() => {
  function updateRsvpIntro() {
    const intro = document.querySelector('#invitationIntro')
    const guestList = document.querySelector('#guestList')
    const formContainer = document.querySelector('#rsvp-form-container')
    if (!intro || !guestList || !formContainer || formContainer.hidden) return

    const guests = guestList.querySelectorAll('.rsvp-guest')
    const guestCount = guests.length
    const eventTitles = new Set()

    guests.forEach((guest) => {
      guest.querySelectorAll('.rsvp-event h5').forEach((title) => {
        const text = title.textContent.trim()
        if (text) eventTitles.add(text)
      })
    })

    const multipleParts = eventTitles.size > 1
    const multipleGuests = guestCount > 1

    if (multipleParts) {
      intro.textContent = multipleGuests
        ? 'Laat ons weten voor welke onderdelen jullie aanwezig zullen zijn.'
        : 'Laat ons weten voor welke onderdelen je aanwezig zult zijn.'
      return
    }

    const eventTitle = [...eventTitles][0] || ''
    const isEvening = eventTitle.toLowerCase().includes('avond')
    const part = isEvening ? 'avondfeest' : 'diner'

    intro.textContent = multipleGuests
      ? `Kunnen jullie erbij zijn op ons ${part}?`
      : `Kan je erbij zijn op ons ${part}?`
  }

  function keepInvitationCodePanelOpen() {
    const button = document.querySelector('#openInvitationButton')
    const panel = document.querySelector('#invitation-code-panel')
    const input = document.querySelector('#invitationCode')
    if (!button || !panel || button.dataset.codePanelFixAttached === 'true') return

    button.dataset.codePanelFixAttached = 'true'
    button.addEventListener('click', () => {
      // The original handler toggles the panel. Run after it and make sure
      // the code field remains visible and ready for input.
      setTimeout(() => {
        panel.hidden = false
        if (input) input.focus()
      }, 0)
    })
  }

  const observer = new MutationObserver(() => {
    keepInvitationCodePanelOpen()
    updateRsvpIntro()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
  keepInvitationCodePanelOpen()
  updateRsvpIntro()
})()
