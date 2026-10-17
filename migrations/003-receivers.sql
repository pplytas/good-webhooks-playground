-- The canary and the chaos receivers: application-scope endpoints the Playground answers itself.
CREATE TABLE playground_receiver (
  name text PRIMARY KEY,
  endpoint_id text NOT NULL,
  encrypted_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO playground_receiver (name, endpoint_id, encrypted_secret, created_at)
SELECT 'canary', endpoint_id, encrypted_secret, created_at FROM playground_canary;

DROP TABLE playground_canary;
