-- Seed data — password for both users is: password123
-- bcrypt hash (cost 12) of "password123"
INSERT INTO users (id, name, email, password_hash, created_at)
VALUES
    (
        'a1b2c3d4-0000-0000-0000-000000000001',
        'Test User',
        'test@example.com',
        '$2a$12$bN.jq8fIIgfrCv6We7Rfc.iP4xJYpGqO1LbKZjpmuZvLggINIrbWa',
        NOW()
    ),
    (
        'a1b2c3d4-0000-0000-0000-000000000002',
        'Jane Smith',
        'jane@example.com',
        '$2a$12$bN.jq8fIIgfrCv6We7Rfc.iP4xJYpGqO1LbKZjpmuZvLggINIrbWa',
        NOW()
    )
ON CONFLICT (email) DO NOTHING;

INSERT INTO projects (id, name, description, owner_id, created_at)
VALUES (
    'b1b2c3d4-0000-0000-0000-000000000001',
    'Website Redesign',
    'Q2 overhaul of the marketing site — new design system, faster load times.',
    'a1b2c3d4-0000-0000-0000-000000000001',
    NOW()
)
ON CONFLICT DO NOTHING;

INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at)
VALUES
    (
        'c1b2c3d4-0000-0000-0000-000000000001',
        'Design homepage mockup',
        'Create Figma wireframes for desktop and mobile.',
        'done',
        'high',
        'b1b2c3d4-0000-0000-0000-000000000001',
        'a1b2c3d4-0000-0000-0000-000000000002',
        '2026-04-05',
        NOW() - INTERVAL '5 days',
        NOW() - INTERVAL '1 day'
    ),
    (
        'c1b2c3d4-0000-0000-0000-000000000002',
        'Implement React component library',
        'Set up shadcn/ui, configure Tailwind, build base components.',
        'in_progress',
        'high',
        'b1b2c3d4-0000-0000-0000-000000000001',
        'a1b2c3d4-0000-0000-0000-000000000001',
        '2026-04-20',
        NOW() - INTERVAL '3 days',
        NOW()
    ),
    (
        'c1b2c3d4-0000-0000-0000-000000000003',
        'Write API integration tests',
        'Cover auth, projects, and tasks endpoints.',
        'todo',
        'medium',
        'b1b2c3d4-0000-0000-0000-000000000001',
        NULL,
        '2026-04-30',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT DO NOTHING;
