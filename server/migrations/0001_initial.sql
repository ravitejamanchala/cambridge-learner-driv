CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clerk_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE learner_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 data jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lesson_progress (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 lesson_id text NOT NULL, data jsonb NOT NULL, UNIQUE(user_id, lesson_id)
);
CREATE TABLE driving_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL, duration double precision NOT NULL CHECK(duration >= 0),
 kind text NOT NULL CHECK(kind IN ('lesson','mock')), data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_time ON driving_sessions(user_id, started_at DESC, id);
CREATE TABLE driving_faults (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES driving_sessions(id) ON DELETE CASCADE,
 position integer NOT NULL, data jsonb NOT NULL, UNIQUE(session_id, position)
);
CREATE TABLE ai_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL UNIQUE REFERENCES driving_sessions(id) ON DELETE CASCADE,
 data jsonb NOT NULL
);
