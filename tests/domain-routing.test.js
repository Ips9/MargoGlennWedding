import assert from 'node:assert/strict'
import { test } from 'node:test'
import { domainRedirect } from '../worker/preview-wrapper.js'

const env = { PUBLIC_SITE_HOST: 'margoenglenn.com' }
test('canonical domain enforces HTTPS and preserves path/query without external redirects', () => {
  for (const origin of ['http://margoenglenn.com', 'http://www.margoenglenn.com', 'https://www.margoenglenn.com']) {
    const response = domainRedirect(new Request(origin + '/?next=https://example.org'), env)
    assert.equal(response.status, 308)
    assert.equal(response.headers.get('location'), 'https://margoenglenn.com/?next=https://example.org')
  }
  assert.equal(domainRedirect(new Request('https://margoenglenn.com/api/guest/session'), env), null)
  assert.equal(domainRedirect(new Request('http://localhost:8788/'), env), null)
})
test('admin redirects only to the existing protected host while its API keeps working', () => {
  for (const path of ['/admin','/admin/','/admin/api/dashboard']) {
    const response = domainRedirect(new Request('https://margoenglenn.com' + path), env)
    assert.equal(response.status, 307)
    assert.equal(response.headers.get('location'), 'https://margo-glenn-wedding.margo-glenn-wedding.workers.dev' + path)
    assert.equal(domainRedirect(new Request(response.headers.get('location')), env), null)
  }
  const redirect = domainRedirect(new Request('https://margo-glenn-wedding.margo-glenn-wedding.workers.dev/'), env)
  assert.equal(redirect.headers.get('location'), 'https://margoenglenn.com/')
  assert.equal(domainRedirect(new Request('https://margo-glenn-wedding.margo-glenn-wedding.workers.dev/api/guest/session'), env), null)
})
