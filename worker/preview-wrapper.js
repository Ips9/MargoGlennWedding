import baseWorker from './admin-api-wrapper.js'

export default {
  async fetch(request, env, ctx) {
    const response = await baseWorker.fetch(request, env, ctx)
    const url = new URL(request.url)

    if (
      request.method === 'GET' &&
      url.pathname === '/wedding-preview.html' &&
      response.ok &&
      (response.headers.get('content-type') || '').includes('text/html')
    ) {
      return new HTMLRewriter()
        .on('body', {
          element(element) {
            element.append('<script src="/wedding-preview-compat.js"></script>', { html: true })
          }
        })
        .transform(response)
    }

    return response
  }
}
