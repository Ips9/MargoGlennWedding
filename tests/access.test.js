import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { getAccessIdentity } from '../worker/access.js'

const AUDIENCE = 'wedding-admin-test-audience'
const EMAIL = 'admin@example.test'
const fixtures = new Map()
const fetchCalls = []
let privateKey, otherPrivateKey, publicJwk, originalFetch
let nextFixture = 0

before(async () => {
  const keys = await generateKeyPair('RS256')
  privateKey = keys.privateKey
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey
  publicJwk = { ...await exportJWK(keys.publicKey), kid: 'test-signing-key', alg: 'RS256', use: 'sig' }
  originalFetch = globalThis.fetch
  // No test can make a real network call, including to a production Access team.
  globalThis.fetch = async input => {
    const url = String(input instanceof Request ? input.url : input)
    fetchCalls.push(url)
    const fixture = fixtures.get(url)
    assert.ok(fixture, `Unexpected certificate request: ${url}`)
    if (fixture.error) throw fixture.error
    return Response.json(fixture.body || { keys: [publicJwk] }, { status: fixture.status || 200 })
  }
})

after(() => { globalThis.fetch = originalFetch })

function environment(fixture = {}) {
  const issuer = `https://offline-test-${++nextFixture}.cloudflareaccess.com`
  fixtures.set(`${issuer}/cdn-cgi/access/certs`, fixture)
  return { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: AUDIENCE }
}

async function token(env, claims = {}, key = privateKey, header = {}) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    iss: env.CF_ACCESS_TEAM_DOMAIN, aud: [AUDIENCE], exp: now + 3600,
    nbf: now - 60, email: EMAIL, sub: 'test-user', ...claims,
  }).setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid, ...header }).sign(key)
}

function request(assertion, extraHeaders = {}) {
  return new Request('https://wedding.test/admin/api/health', {
    headers: { ...extraHeaders, ...(assertion ? { 'cf-access-jwt-assertion': assertion } : {}) },
  })
}

test('requires a signed assertion, ignoring forged authenticated-email headers', async () => {
  const env = environment()
  const beforeCalls = fetchCalls.length
  assert.equal(await getAccessIdentity(request(null), env, {}), null)
  assert.equal(await getAccessIdentity(request(null, { 'cf-access-authenticated-user-email': EMAIL }), env, {}), null)
  assert.equal(await getAccessIdentity(request('not.a.jwt'), env, {}), null)
  assert.equal(fetchCalls.length, beforeCalls)
})

test('validates a signed Access token and takes the email from its verified payload', async () => {
  const env = environment()
  const signed = await token(env)
  assert.deepEqual(await getAccessIdentity(request(signed, { 'cf-access-authenticated-user-email': 'forged@example.test' }), env, {}), {
    email: EMAIL, sub: 'test-user',
  })
})

test('rejects a modified payload and a signature from an untrusted key', async () => {
  const env = environment()
  const signed = await token(env)
  const parts = signed.split('.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  parts[1] = Buffer.from(JSON.stringify({ ...payload, email: 'forged@example.test' })).toString('base64url')
  assert.equal(await getAccessIdentity(request(parts.join('.')), env, {}), null)
  assert.equal(await getAccessIdentity(request(await token(env, {}, otherPrivateKey)), env, {}), null)
})

test('rejects wrong issuer, wrong audience, expired and not-yet-valid tokens', async () => {
  const env = environment()
  const now = Math.floor(Date.now() / 1000)
  for (const claims of [
    { iss: 'https://different-team.cloudflareaccess.com' },
    { aud: ['another-application'] },
    { exp: now - 1 },
    { nbf: now + 300 },
  ]) {
    assert.equal(await getAccessIdentity(request(await token(env, claims)), env, {}), null, JSON.stringify(claims))
  }
})

test('requires expiration and a valid human email, and checks claim types', async () => {
  const env = environment()
  for (const claims of [
    { exp: undefined }, { exp: '2099-01-01' }, { nbf: 'yesterday' },
    { email: undefined }, { email: '' }, { email: 'not-an-email' },
  ]) {
    assert.equal(await getAccessIdentity(request(await token(env, claims)), env, {}), null, JSON.stringify(claims))
  }
})

test('rejects unsigned tokens and algorithms other than RS256', async () => {
  const env = environment()
  const valid = await token(env)
  const [, payload] = valid.split('.')
  const unsignedHeader = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  assert.equal(await getAccessIdentity(request(`${unsignedHeader}.${payload}.`), env, {}), null)
  const secret = new TextEncoder().encode('test-only-shared-secret-with-32-bytes')
  const hmac = await token(env, {}, secret, { alg: 'HS256' })
  assert.equal(await getAccessIdentity(request(hmac), env, {}), null)
})

test('fails closed when configuration is missing or the certificate endpoint fails', async () => {
  const env = environment()
  const signed = await token(env)
  for (const invalidEnv of [
    {}, { ...env, CF_ACCESS_AUD: '' }, { ...env, CF_ACCESS_TEAM_DOMAIN: 'http://example.test' },
    { ...env, CF_ACCESS_TEAM_DOMAIN: 'https://example.test' },
    { ...env, CF_ACCESS_TEAM_DOMAIN: `${env.CF_ACCESS_TEAM_DOMAIN}/unexpected-path` },
  ]) assert.equal(await getAccessIdentity(request(signed), invalidEnv, {}), null)
  const failedEnv = environment({ status: 503 })
  assert.equal(await getAccessIdentity(request(await token(failedEnv)), failedEnv, {}), null)
  const unavailableEnv = environment({ error: new Error('Network unavailable') })
  assert.equal(await getAccessIdentity(request(await token(unavailableEnv)), unavailableEnv, {}), null)
})

test('reuses cached certificates and refreshes them after five minutes', async t => {
  const env = environment()
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const signed = await token(env)
  const count = () => fetchCalls.filter(url => url === `${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`).length
  assert.equal((await getAccessIdentity(request(signed), env, {})).email, EMAIL)
  assert.equal((await getAccessIdentity(request(signed), env, {})).email, EMAIL)
  assert.equal(count(), 1)
  t.mock.timers.tick(5 * 60 * 1000 + 1)
  assert.equal((await getAccessIdentity(request(signed), env, {})).email, EMAIL)
  assert.equal(count(), 2)
})

test('accepts trusted runtime identities with an email and falls back to signed tokens', async () => {
  const env = environment()
  assert.deepEqual(await getAccessIdentity(request(null), {}, { access: { getIdentity: async () => ({ email: EMAIL }) } }), { email: EMAIL })
  assert.equal(await getAccessIdentity(request(null), env, { access: { getIdentity: async () => ({}) } }), null)
  assert.equal(await getAccessIdentity(request(null, { 'cf-access-authenticated-user-email': EMAIL }), env, {
    access: { getIdentity: async () => { throw new Error('Unavailable') } },
  }), null)
  assert.equal((await getAccessIdentity(request(await token(env)), env, {
    access: { getIdentity: async () => { throw new Error('Unavailable') } },
  })).email, EMAIL)
})
