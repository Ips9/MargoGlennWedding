-- ============================================================
-- RSVP response event part
-- ============================================================
--
-- rsvp_responses is used as an RSVP history/audit trail.
-- Each response belongs to one wedding part:
--   - dinner
--   - evening
-- ============================================================

ALTER TABLE rsvp_responses
ADD COLUMN event_part TEXT NOT NULL DEFAULT 'dinner'
    CHECK (event_part IN ('dinner', 'evening'));


-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------

CREATE INDEX idx_rsvp_responses_guest_event
    ON rsvp_responses(guest_id, event_part);

CREATE INDEX idx_rsvp_responses_submitted
    ON rsvp_responses(submitted_at);