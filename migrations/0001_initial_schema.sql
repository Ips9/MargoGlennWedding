PRAGMA foreign_keys = ON;


-- ============================================================
-- Wedding settings
-- ============================================================

CREATE TABLE wedding_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),

    -- Date by which we would like guests to have responded.
    rsvp_deadline TEXT NOT NULL,

    -- Date until which guests may change their RSVP themselves.
    rsvp_change_deadline TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- Invitations
--
-- An invitation represents one login code.
--
-- One invitation can contain:
--   - one guest
--   - two guests
--   - potentially more guests in the future
--
-- This does NOT imply that the guests are a couple.
-- ============================================================

CREATE TABLE invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Unique login code.
    -- Codes will be generated in the format MG-XXXXXX.
    --
    -- The actual code will be treated as a bearer credential
    -- by the application.
    invitation_code TEXT NOT NULL UNIQUE,

    -- Whether this invitation is currently active.
    active INTEGER NOT NULL DEFAULT 1
        CHECK (active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- Guests
--
-- One guest is always an individual person.
-- Guests belong to an invitation.
-- ============================================================

CREATE TABLE guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    invitation_id INTEGER NOT NULL,

    -- Guest's displayed name.
    name TEXT NOT NULL,

    -- Optional email address for future communication.
    email TEXT,

    -- Whether this guest is invited to the dinner.
    invited_to_dinner INTEGER NOT NULL DEFAULT 0
        CHECK (invited_to_dinner IN (0, 1)),

    -- Whether this guest is invited to the evening party.
    invited_to_evening INTEGER NOT NULL DEFAULT 0
        CHECK (invited_to_evening IN (0, 1)),

    -- Current RSVP state.
    --
    -- pending   = no response yet
    -- attending = attending
    -- declined  = not attending
    rsvp_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (rsvp_status IN ('pending', 'attending', 'declined')),

    -- Dietary requirements / allergies.
    dietary_requirements TEXT,

    -- Optional private note.
    notes TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (invitation_id)
        REFERENCES invitations(id)
        ON DELETE CASCADE
);


-- ============================================================
-- RSVP responses
--
-- Keeps an audit trail of RSVP submissions/changes.
-- The current state remains on guests.rsvp_status.
-- ============================================================

CREATE TABLE rsvp_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    guest_id INTEGER NOT NULL,

    status TEXT NOT NULL
        CHECK (status IN ('attending', 'declined')),

    dietary_requirements TEXT,

    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (guest_id)
        REFERENCES guests(id)
        ON DELETE CASCADE
);


-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_invitations_code
    ON invitations(invitation_code);

CREATE INDEX idx_invitations_active
    ON invitations(active);

CREATE INDEX idx_guests_invitation
    ON guests(invitation_id);

CREATE INDEX idx_guests_rsvp_status
    ON guests(rsvp_status);

CREATE INDEX idx_guests_email
    ON guests(email);

CREATE INDEX idx_rsvp_responses_guest
    ON rsvp_responses(guest_id);