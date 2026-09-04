export const LOGIN_LIMIT = 20
export const RATE_WINDOW_SECONDS = 15 * 60

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function normalizeInvitationCode(value, env) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  if (!/^MG-[A-Z0-9]{6}$/.test(code)) return null
  // These credentials are public repository fixtures, never production logins.
  if (env.ALLOW_TEST_INVITATIONS !== 'true' && /^MG-TEST0[123]$/.test(code)) return null
  return code
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function unixNow() { return Math.floor(Date.now() / 1000) }

export function loginKey(request) {
  return sha256(`login:${request.headers.get('CF-Connecting-IP') || 'unknown'}`)
}

export async function consumeRateLimit(db, scope, keyHash, limit) {
  return (await reserveRateLimit(db, scope, keyHash, limit)) !== null
}

export async function reserveRateLimit(db, scope, keyHash, limit) {
  const now = unixNow(), threshold = now - RATE_WINDOW_SECONDS
  // The conditional UPSERT is the limit check AND increment, with no race gap.
  const results = await db.batch([
    db.prepare('DELETE FROM guest_rate_limits WHERE window_start <= ?').bind(threshold),
    db.prepare(`INSERT INTO guest_rate_limits (scope,key_hash,window_start,attempts) VALUES (?,?,?,1)
      ON CONFLICT(scope,key_hash) DO UPDATE SET
        window_start=CASE WHEN guest_rate_limits.window_start <= ? THEN excluded.window_start ELSE guest_rate_limits.window_start END,
        attempts=CASE WHEN guest_rate_limits.window_start <= ? THEN 1 ELSE guest_rate_limits.attempts+1 END
      WHERE guest_rate_limits.window_start <= ? OR guest_rate_limits.attempts < ?
      RETURNING window_start`)
      .bind(scope, keyHash, now, threshold, threshold, threshold, limit),
  ])
  return results[1].meta.changes === 1 ? results[1].results[0].window_start : null
}

export async function refundRateLimit(db, scope, keyHash, windowStart) {
  // Match the reservation window so a slow request cannot refund a newer window.
  await db.prepare(`UPDATE guest_rate_limits SET attempts=MAX(0,attempts-1)
    WHERE scope=? AND key_hash=? AND window_start=?`).bind(scope, keyHash, windowStart).run()
}

export function limitedLoginResponse() {
  return Response.json({ ok: false, error: 'Te veel pogingen. Probeer over een kwartier opnieuw.' }, {
    status: 429,
    headers: { 'Retry-After': String(RATE_WINDOW_SECONDS), 'Cache-Control': 'private, no-store' },
  })
}

// Read a bounded stream, including chunked bodies that omit Content-Length.
export async function readLimitedBody(request, limit) {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) {
    throw new HttpError('De aanvraag is te groot.', 413)
  }
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new HttpError('De aanvraag is te groot.', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

export async function readLimitedJson(request, limit = 64 * 1024) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new HttpError('Ongeldige aanvraag.', 415)
  }
  const bytes = await readLimitedBody(request, limit)
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
    return body
  } catch {
    throw new HttpError('Ongeldige aanvraag.')
  }
}
