-- ============================================================
-- Catering requirements per wedding part
-- ============================================================
--
-- Catering requirements must be stored separately for:
--   - dinner
--   - evening
--
-- A guest attending both parts can therefore have different
-- requirements for each part.
--
-- Existing requirements from the previous schema are copied
-- to every wedding part the guest is invited to.
-- ============================================================


-- ------------------------------------------------------------
-- Create replacement table
-- ------------------------------------------------------------

CREATE TABLE guest_dietary_requirements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    guest_id INTEGER NOT NULL,

    -- Wedding part this requirement applies to.
    event_part TEXT NOT NULL
        CHECK (event_part IN ('dinner', 'evening')),

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

    -- A guest can select each category once per wedding part.
    UNIQUE (guest_id, event_part, category)
);


-- ------------------------------------------------------------
-- Migrate existing requirements
--
-- Previous requirements applied generally to the guest.
-- Copy them to every part for which the guest is invited.
-- ------------------------------------------------------------

INSERT INTO guest_dietary_requirements_new (
    guest_id,
    event_part,
    category,
    other_type,
    other_text,
    created_at,
    updated_at
)
SELECT
    gdr.guest_id,
    parts.event_part,
    gdr.category,
    gdr.other_type,
    gdr.other_text,
    gdr.created_at,
    gdr.updated_at
FROM guest_dietary_requirements gdr
JOIN guests g
    ON g.id = gdr.guest_id
JOIN (
    SELECT
        id AS guest_id,
        'dinner' AS event_part
    FROM guests
    WHERE invited_to_dinner = 1

    UNION ALL

    SELECT
        id AS guest_id,
        'evening' AS event_part
    FROM guests
    WHERE invited_to_evening = 1
) parts
    ON parts.guest_id = gdr.guest_id;


-- ------------------------------------------------------------
-- Replace old table
-- ------------------------------------------------------------

DROP TABLE guest_dietary_requirements;

ALTER TABLE guest_dietary_requirements_new
RENAME TO guest_dietary_requirements;


-- ------------------------------------------------------------
-- Recreate indexes
-- ------------------------------------------------------------

CREATE INDEX idx_guest_dietary_guest
    ON guest_dietary_requirements(guest_id);

CREATE INDEX idx_guest_dietary_event_part
    ON guest_dietary_requirements(event_part);

CREATE INDEX idx_guest_dietary_category
    ON guest_dietary_requirements(category);