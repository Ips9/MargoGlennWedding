-- ============================================================
-- Test invitations
-- ============================================================
--
-- Development/test records only.
--
-- MG-TEST01 = one guest, evening only
-- MG-TEST02 = two guests, dinner + evening
-- MG-TEST03 = one guest, dinner + evening
-- ============================================================


-- ------------------------------------------------------------
-- Invitation 1
-- ------------------------------------------------------------

INSERT INTO invitations (
    invitation_code,
    active
)
VALUES (
    'MG-TEST01',
    1
);

INSERT INTO guests (
    invitation_id,
    name,
    email,
    invited_to_dinner,
    invited_to_evening
)
VALUES (
    (SELECT id FROM invitations WHERE invitation_code = 'MG-TEST01'),
    'Test Guest One',
    NULL,
    0,
    1
);


-- ------------------------------------------------------------
-- Invitation 2
-- Two individual guests sharing one invitation.
-- They are deliberately NOT represented as a couple.
-- ------------------------------------------------------------

INSERT INTO invitations (
    invitation_code,
    active
)
VALUES (
    'MG-TEST02',
    1
);

INSERT INTO guests (
    invitation_id,
    name,
    email,
    invited_to_dinner,
    invited_to_evening
)
VALUES (
    (SELECT id FROM invitations WHERE invitation_code = 'MG-TEST02'),
    'Test Guest Two',
    NULL,
    1,
    1
);

INSERT INTO guests (
    invitation_id,
    name,
    email,
    invited_to_dinner,
    invited_to_evening
)
VALUES (
    (SELECT id FROM invitations WHERE invitation_code = 'MG-TEST02'),
    'Test Guest Three',
    NULL,
    1,
    1
);


-- ------------------------------------------------------------
-- Invitation 3
-- ------------------------------------------------------------

INSERT INTO invitations (
    invitation_code,
    active
)
VALUES (
    'MG-TEST03',
    1
);

INSERT INTO guests (
    invitation_id,
    name,
    email,
    invited_to_dinner,
    invited_to_evening
)
VALUES (
    (SELECT id FROM invitations WHERE invitation_code = 'MG-TEST03'),
    'Test Guest Four',
    NULL,
    1,
    1
);
