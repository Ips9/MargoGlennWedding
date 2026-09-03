-- ============================================================
-- Guest content for wedding preview
-- ============================================================

CREATE TABLE IF NOT EXISTS music_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  suggested_by TEXT,
  source_ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_music_suggestions_created
  ON music_suggestions(created_at DESC);

CREATE TABLE IF NOT EXISTS wedding_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invitation_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved INTEGER NOT NULL DEFAULT 1 CHECK (approved IN (0,1)),
  FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wedding_photos_invitation
  ON wedding_photos(invitation_id, approved, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS wedding_photo_quota (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  used_bytes INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO wedding_photo_quota (id, used_bytes) VALUES (1, 0);
