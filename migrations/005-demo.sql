-- Signed requests the demo receiver accepted, for events published in the demo scope.
-- The first verified request for an event wins; only the signature headers, content-type,
-- and user-agent are kept.
CREATE TABLE playground_demo_receipt (
  event_id uuid PRIMARY KEY,
  delivery_id text,
  headers jsonb NOT NULL,
  body text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX playground_demo_receipt_received_at ON playground_demo_receipt (received_at);

-- Demo event requests from signed-out visitors, counted per hashed IP and in total.
CREATE TABLE playground_demo_request (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX playground_demo_request_ip_created ON playground_demo_request (ip_hash, created_at);
CREATE INDEX playground_demo_request_created ON playground_demo_request (created_at);
