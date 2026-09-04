import { HttpError, consumeRateLimit, readLimitedBody, sha256 } from './guest-security.js'

export const PHOTO_QUOTA_BYTES = 10_000_000_000
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const PHOTO_UPLOAD_LIMIT = 30
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function photoUploadAllowed(env, invitationId) {
  return consumeRateLimit(env.margo_glenn_wedding_db, 'upload', await sha256(`upload:${invitationId}`), PHOTO_UPLOAD_LIMIT)
}

export async function readPhotoForm(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data;')) {
    throw new HttpError('Ongeldige upload.')
  }
  // Allow only modest multipart metadata overhead above the actual file limit.
  const bytes = await readLimitedBody(request, MAX_PHOTO_BYTES + 128 * 1024)
  try {
    return await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') } }).formData()
  } catch {
    throw new HttpError('Ongeldige upload.')
  }
}

export async function validatePhoto(file) {
  if (!(file instanceof File)) throw new HttpError('Kies eerst een foto.')
  if (!PHOTO_MIME_TYPES.has(file.type)) throw new HttpError('Gebruik een JPG-, PNG- of WebP-foto.')
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new HttpError('Een foto mag maximaal 10 MB groot zijn.')
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!((file.type === 'image/png' && png) || (file.type === 'image/jpeg' && jpeg) || (file.type === 'image/webp' && webp))) {
    throw new HttpError('Dit bestand is geen geldige JPG-, PNG- of WebP-foto.')
  }
}

export function photoQuota(usedBytes) {
  return {
    usedBytes,
    limitBytes: PHOTO_QUOTA_BYTES,
    remainingBytes: Math.max(0, PHOTO_QUOTA_BYTES - usedBytes),
    uploadAvailable: usedBytes < PHOTO_QUOTA_BYTES,
  }
}

export async function storeWeddingPhoto(file, invitation, env) {
  const db = env.margo_glenn_wedding_db
  let reserved = false, key
  try {
    const reserve = await db.prepare(`UPDATE wedding_photo_quota SET used_bytes=used_bytes+?
      WHERE id=1 AND used_bytes+? <= ?`).bind(file.size, file.size, PHOTO_QUOTA_BYTES).run()
    if (reserve.meta.changes !== 1) {
      const error = new HttpError('De online fotoplaats is vol.', 507)
      error.quotaReached = true
      throw error
    }
    reserved = true
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
    key = `photos/${invitation.id}/${crypto.randomUUID()}.${extension}`
    const filename = String(file.name || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || `foto.${extension}`
    const object = await env.WEDDING_PHOTOS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: 'private, no-store' },
    })
    if (!object) throw new Error('Photo object was not stored')
    const inserted = await db.prepare(`INSERT INTO wedding_photos
      (invitation_id,storage_key,original_filename,mime_type,size_bytes,approved) VALUES (?,?,?,?,?,1)`)
      .bind(invitation.id, key, filename, file.type, file.size).run()
    return { id: inserted.meta.last_row_id, filename, sizeBytes: file.size }
  } catch (error) {
    if (reserved) {
      // Delete even after an uncertain put. Never refund storage still in R2.
      try {
        if (key) await env.WEDDING_PHOTOS.delete(key)
        await db.prepare('UPDATE wedding_photo_quota SET used_bytes=MAX(0,used_bytes-?) WHERE id=1').bind(file.size).run()
      } catch (cleanupError) {
        console.error('Photo cleanup failed; quota reservation retained:', cleanupError)
      }
    }
    throw error
  }
}
