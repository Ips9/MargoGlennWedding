-- Sessions contain a SHA-256 hash of the opaque cookie, never the cookie itself.
CREATE TABLE IF NOT EXISTS guest_sessions (
  session_hash TEXT PRIMARY KEY,
  invitation_id INTEGER NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_expiry ON guest_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_invitation ON guest_sessions(invitation_id, created_at);

-- One bounded counter per scope and hashed IP/invitation, reset atomically.
CREATE TABLE IF NOT EXISTS guest_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_guest_rate_limits_window ON guest_rate_limits(window_start);

-- A household has at most one request, also during concurrent RSVP submissions.
CREATE TABLE IF NOT EXISTS invitation_song_requests (
  invitation_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  artist TEXT NOT NULL CHECK (length(artist) BETWEEN 1 AND 120),
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
);
