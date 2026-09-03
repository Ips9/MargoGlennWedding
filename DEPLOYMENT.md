# Wedding preview validation and deployment

The preview loads `/wedding-preview-app.js` directly from its HTML. This works
both at `/wedding-preview.html` and Cloudflare's canonical `/wedding-preview` URL;
it does not depend on the Worker rewriting a static asset response.

## Local verification

```sh
npm ci
npm test
npm run build
npx wrangler deploy --dry-run
```

The integration tests bundle the active Worker and run it in local workerd with
temporary D1 and R2 bindings. They do not load the production Wrangler bindings.
Test-only RSVP dates are inserted by the test harness; production dates are not
changed. The existing production configuration uses a remote D1 binding, so do
not use plain `wrangler dev` for destructive test submissions.

## Production prerequisites

Read-only checks on 3 September 2026 found:

- R2 is not enabled on the Cloudflare account (`10042`). The account owner must
  complete R2 activation in the Cloudflare dashboard before the bucket can be
  created.
- D1 migration `0006_guest_content.sql` is pending. It adds music suggestions,
  photo metadata and the shared photo quota.
- Production RSVP settings exist: initial deadline 1 May 2027 at 23:59:59 +02:00;
  changes until 1 June 2027 at 23:59:59 +02:00. The current API enforces the change
  deadline. A fresh database must have its settings configured separately.

After R2 activation, run from the current repository checkout:

```sh
npx wrangler r2 bucket list
# Create only if it is absent from the list:
npx wrangler r2 bucket create margo-glenn-wedding-photos
npx wrangler d1 migrations list margo-glenn-wedding-db --remote
npx wrangler d1 migrations apply margo-glenn-wedding-db --remote
```

Then merge/deploy through the existing GitHub-to-Cloudflare build integration.
Do not deploy the R2-bound Worker until its bucket exists. The code changes do
not alter the main site's HTML, JavaScript or styling, but its shared backend is
updated and should receive a regression check after deployment.

## Admin authentication

The Worker verifies signed Cloudflare Access JWTs, including issuer, audience
and expiry. A caller-supplied email header is not an authentication credential.
`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in `wrangler.jsonc` match the Access
login redirects observed on the existing production `/admin` and
`/admin/api/health` routes. If the Access application changes, update these values.

## Final live checks

Use an explicit test invitation to confirm code lookup, RSVP save/reload and the
authenticated admin dashboard. Check music sharing in a second browser and
upload/reload a test image through the protected gallery. Live authenticated
admin and R2 uploads remain unverified until activation and deployment.

The 10 GB limit is an application storage limit. It is not an account-wide
Cloudflare billing cap. Photos remain scoped to the invitation that uploaded
them. Spotify links search for songs; the site does not automatically edit a
Spotify account's playlist.
