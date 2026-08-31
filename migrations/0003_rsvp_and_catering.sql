-- ============================================================
-- RSVP and catering
-- ============================================================
--
-- Adds separate RSVP status for:
--   - dinner
--   - evening party
--
-- Catering requirements are stored once per guest and apply
-- to all attended parts of the wedding.
-- ============================================================


-- ------------------------------------------------------------
-- RSVP status per wedding part
-- ------------------------------------------------------------

ALTER TABLE guests
ADD COLUMN dinner_rsvp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dinner_rsvp_status IN ('pending', 'attending', 'declined'));

ALTER TABLE guests
ADD COLUMN evening_rsvp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (evening_rsvp_status IN ('pending', 'attending', 'declined'));


-- ------------------------------------------------------------
-- Catering requirements
-- One guest can have multiple requirements.
-- ------------------------------------------------------------

CREATE TABLE guest_dietary_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    guest_id INTEGER NOT NULL,

    -- Fixed categories:
    -- vegetarian
    -- vegan
    -- gluten
    -- lactose
    -- nuts
    -- shellfish
    -- fish
    -- other
    category TEXT NOT NULL
        CHECK (
            category IN (
                'vegetarian',
                'vegan',
                'gluten',
                'lactose',
                'nuts',
                'shellfish',
                'fish',
                'other'
            )
        ),

    -- Only used for category = 'other'.
    -- Describes whether the other requirement is a preference
    -- or an allergy.
    other_type TEXT
        CHECK (
            other_type IS NULL
            OR other_type IN ('preference', 'allergy')
        ),

    -- Only used for category = 'other'.
    other_text TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (guest_id)
        REFERENCES guests(id)
        ON DELETE CASCADE,

    -- 'other' requires a type and description.
    -- All fixed categories must leave these fields empty.
    CHECK (
        (
            category = 'other'
            AND other_type IS NOT NULL
            AND other_text IS NOT NULL
            AND length(trim(other_text)) > 0
        )
        OR
        (
            category != 'other'
            AND other_type IS NULL
            AND other_text IS NULL
        )
    ),

    -- Prevent duplicate selections for the same guest.
    UNIQUE (guest_id, category)
);


-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------

CREATE INDEX idx_guest_dietary_guest
    ON guest_dietary_requirements(guest_id);

CREATE INDEX idx_guest_dietary_category
    ON guest_dietary_requirements(category);

CREATE INDEX idx_guests_dinner_rsvp
    ON guests(dinner_rsvp_status);

CREATE INDEX idx_guests_evening_rsvp
    ON guests(evening_rsvp_status);