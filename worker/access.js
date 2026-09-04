import { createRemoteJWKSet, jwtVerify } from 'jose'

const keySets = new Map()

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function accessIssuer(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.pathname !== '/' || url.search || url.hash ||
        !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

// Cloudflare's Worker example validates the assertion against the team's JWKS:
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
// Cache certificates briefly, allowing jose to refresh them when Access rotates keys.
function signingKeys(issuer) {
  if (!keySets.has(issuer)) {
    keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      cacheMaxAge: 5 * 60 * 1000,
      cooldownDuration: 30 * 1000,
      timeoutDuration: 5 * 1000,
    }))
  }
  return keySets.get(issuer)
}

export async function getAccessIdentity(request, env, ctx) {
  // This identity comes from the runtime, never from a caller-controlled header.
  if (typeof ctx?.access?.getIdentity === 'function') {
    try {
      const identity = await ctx.access.getIdentity()
      if (validEmail(identity?.email)) return identity
    } catch {
      // Static Assets deployments can omit this runtime integration.
    }
  }

  const issuer = accessIssuer(env?.CF_ACCESS_TEAM_DOMAIN)
  const audience = typeof env?.CF_ACCESS_AUD === 'string' ? env.CF_ACCESS_AUD.trim() : ''
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!issuer || !audience || !token || token.length > 16_384) return null

  try {
    const { payload } = await jwtVerify(token, signingKeys(issuer), {
      issuer,
      audience,
      algorithms: ['RS256'],
      requiredClaims: ['iss', 'aud', 'exp', 'email'],
    })
    // jwtVerify checks the signature, expiration and nbf when present.
    // Service tokens without a human identity do not grant admin access.
    return validEmail(payload.email) ? { email: payload.email, sub: payload.sub } : null
  } catch {
    // Malformed, expired, wrong-audience tokens and certificate outages fail closed.
    return null
  }
}
