-- ============================================================
-- Plus-one invitations and wedding-day guestbook
-- ============================================================

ALTER TABLE guests
ADD COLUMN is_plus_one INTEGER NOT NULL DEFAULT 0
    CHECK (is_plus_one IN (0, 1));

-- A single-person invitation may have at most one guest-added partner.
CREATE UNIQUE INDEX idx_guests_one_plus_one_per_invitation
    ON guests(invitation_id)
    WHERE is_plus_one = 1;

CREATE TABLE guestbook_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL UNIQUE,
    author_names TEXT NOT NULL,
    message TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 1
        CHECK (approved IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invitation_id)
        REFERENCES invitations(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_guestbook_approved_created
    ON guestbook_entries(approved, created_at, id);
