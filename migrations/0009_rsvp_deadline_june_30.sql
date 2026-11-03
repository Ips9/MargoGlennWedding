-- Guests may submit and change their RSVP until the end of 30 June 2027
-- in Europe/Brussels (CEST, UTC+02:00).
UPDATE wedding_settings
SET rsvp_deadline = '2027-06-30T21:59:59Z',
    rsvp_change_deadline = '2027-06-30T21:59:59Z',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
