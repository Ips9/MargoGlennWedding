import application from './admin-api-wrapper.js'

export function domainRedirect(request, env) {
  const host = env.PUBLIC_SITE_HOST
  if (!host) return null
  const url = new URL(request.url)
  if (url.hostname === host || url.hostname === `www.${host}`) {
    if (url.hostname !== host || url.protocol !== 'https:') {
      url.hostname = host
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 308)
    }
  }
  // Existing invitation links open the new site; legacy API/preview URLs remain valid.
  if (url.hostname === 'margo-glenn-wedding.margo-glenn-wedding.workers.dev' && url.pathname === '/' && ['GET', 'HEAD'].includes(request.method)) {
    url.hostname = host
    url.protocol = 'https:'
    return Response.redirect(url.toString(), 308)
  }
  return null
}

export default {
  fetch(request, env, ctx) {
    return domainRedirect(request, env) || application.fetch(request, env, ctx)
  },
}
