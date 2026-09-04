# Wedding guest portal: validation and deployment

## Custom domain

The production configuration attaches `margoenglenn.com` and
`www.margoenglenn.com` to the existing `margo-glenn-wedding` Worker. Both use
the existing D1 database and private R2 bucket; no records or images are copied.
Cloudflare provisions the custom-domain DNS and HTTPS certificates.

The Worker redirects www and HTTP to `https://margoenglenn.com`, preserving
paths and query strings. The original workers.dev homepage also redirects there.
`/admin` and `/admin/*` on either custom hostname redirect to the original
workers.dev host, where the existing Cloudflare Access login remains in force.
Keep `workers_dev: true` for that protected admin origin and legacy preview URLs.
`run_worker_first: true` ensures static assets cannot skip these domain rules.
Guest sessions are host-specific: existing guests enter their same invitation
code once on the new domain. Their saved RSVP, song and photos remain available.

Validation for the domain change: all 40 tests, frontend build and Worker
deployment dry-run passed. This includes canonical URL and protected-admin
redirect checks as well as the previous session/RSVP/photo integration suite.

The main site opens a private guest area after a valid invitation code:

1. RSVP for every invited guest and event, with one set of dietary preferences
   and allergens per person and an optional email address.
2. One optional song (title and artist) per invitation. Re-submission updates the
   existing choice. D1 stores the invitation and the names of its guests so the
   admin dashboard identifies the requesting household.
3. A shared photo gallery for authenticated invitees. Uploads are attributed to
   the invitation; both the list and image files require an active session.

The code is exchanged for a short-lived HttpOnly cookie. The main site does not
put invitation codes or session credentials into image URLs or browser storage.
Guest writes require a matching CSRF token and same-origin request. Expired,
logged-out or deactivated invitations cannot access the guest area.

The separate preview loads `/wedding-preview-app.js` directly from its HTML. This works
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

Validation on 4 September 2026: all 38 tests passed. The production frontend
build and Worker deployment dry-run passed. A local browser check covered an
invalid code, couple and solo invitations, RSVP with and without a song,
allergen persistence after reload, a real multipart image upload, visibility
from another invitation, session restore, logout and a 390px mobile layout.
No browser console warnings or errors were observed. API integration tests
also verified that direct image access fails without a session or after logout.

## Production prerequisites

Read-only checks on 4 September 2026 found:

- R2 is not enabled on the Cloudflare account (`10042`). The account owner must
  complete R2 activation in the Cloudflare dashboard before the bucket can be
  created.
- D1 migration `0006_guest_content.sql` is pending. It adds music suggestions,
  photo metadata and the shared photo quota.
- The new `0007_guest_sessions.sql` adds guest sessions, login/upload counters
  and the single-song-per-invitation table. Apply migrations from this branch.
- The three publicly documented seed codes (`MG-TEST01`, `MG-TEST02`,
  `MG-TEST03`) are still active in the database. The updated application rejects
  them in production. `ALLOW_TEST_INVITATIONS=true` is for isolated local tests
  only and must never be added to production Wrangler variables.
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
Do not deploy the R2-bound Worker until its bucket exists. The main site's
invitation area and shared backend are updated; its existing hero, wedding
details, calendar and overall design are retained.

## Admin authentication

The Worker verifies signed Cloudflare Access JWTs, including issuer, audience
and expiry. A caller-supplied email header is not an authentication credential.
`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in `wrangler.jsonc` match the Access
login redirects observed on the existing production `/admin` and
`/admin/api/health` routes. If the Access application changes, update these values.

## Final live checks

Create a temporary invitation with a newly generated code through the admin
dashboard (not one of the public seed codes). Confirm login, RSVP save/reload,
an omitted song, a saved/changed song and its attribution in admin. Upload a
test photo and verify another authenticated invitation can see it. Verify the
same image URL is inaccessible without a session and after logout. Verify
deactivating the invitation revokes its sessions. Authenticated live admin and
production R2 uploads remain unverified until activation and deployment.

The 10 GB limit is an application storage limit. It is not an account-wide
Cloudflare billing cap. The main site's gallery is shared among authenticated
invitees; legacy preview routes retain their invitation-scoped view. The
preview's public music suggestions remain separate from the main site's one
song per household. Spotify links search for songs; the site does not
automatically edit a Spotify account's playlist.
