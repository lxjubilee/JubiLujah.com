-- ============================================================================
-- Seed: a second demo user (content_editor) so multi-user editorial flows can be
-- demonstrated. The admin user (Gabriel) is seeded by the base schema (§9a).
-- Demo ratings/comments keyed to catalog UUIDs are inserted by import-catalog.js
-- (which knows the deterministic UUIDv5 mapping from the manifest).
-- ============================================================================
INSERT INTO identity.users (id, external_subject, email, display_name, is_active)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'jubileeinspire|editor.demo',
    'editor.demo@jubileeinspire.com',
    'Demo Editor',
    TRUE
)
ON CONFLICT (external_subject) DO NOTHING;

INSERT INTO identity.user_roles (user_id, role, granted_by)
VALUES
    ('22222222-2222-2222-2222-222222222222', 'content_editor', '11111111-1111-1111-1111-111111111111'),
    ('22222222-2222-2222-2222-222222222222', 'radio_producer', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (user_id, role) DO NOTHING;
