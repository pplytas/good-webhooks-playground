-- Worker liveness. Each worker process upserts its row while it runs.
CREATE TABLE playground_worker (
  id text PRIMARY KEY,
  seen_at timestamptz NOT NULL
);

-- The canary's application-scope endpoint and its signing secret, encrypted with the auth secret.
CREATE TABLE playground_canary (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  endpoint_id text NOT NULL,
  encrypted_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Events the canary verified. The event ID makes receipt idempotent.
CREATE TABLE playground_canary_receipt (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX playground_canary_receipt_received_at ON playground_canary_receipt (received_at);

-- Ping requests, counted per user for the hourly limit.
CREATE TABLE playground_ping (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX playground_ping_user_created ON playground_ping (user_id, created_at);

-- GitHub accounts that may not sign in.
CREATE TABLE playground_blocked (
  github_id text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
