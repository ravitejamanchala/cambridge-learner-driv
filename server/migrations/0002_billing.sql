CREATE TABLE billing_accounts (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 customer_id text UNIQUE NOT NULL,
 subscription_id text,
 status text NOT NULL DEFAULT 'none',
 paid_until timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_events (
 id text PRIMARY KEY,
 processed_at timestamptz NOT NULL DEFAULT now()
);
