-- v0 schema: the shared contract. Change via migrations only.
-- Owner: Person 1 (Orchestration & State)

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Output of the voice onboarding agent. loss_cap_cents is the hard ceiling.
CREATE TABLE profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  loss_cap_cents    INTEGER NOT NULL CHECK (loss_cap_cents > 0),
  interests         TEXT[] NOT NULL DEFAULT '{}',
  risk_tolerance    TEXT NOT NULL CHECK (risk_tolerance IN ('low','medium','high')),
  transcript        TEXT
);

CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  shopify_domain TEXT,
  status        TEXT NOT NULL DEFAULT 'building'
                CHECK (status IN ('building','live','paused','closed'))
);

CREATE TABLE niches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  name          TEXT NOT NULL,
  score         NUMERIC(5,2),
  evidence      JSONB NOT NULL DEFAULT '[]'
);

-- One sub-team (set of agents + budget) per chosen niche.
CREATE TABLE sub_teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id),
  niche_id        UUID NOT NULL REFERENCES niches(id),
  budget_cents    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'testing'
                  CHECK (status IN ('testing','scaling','killed'))
);

CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_team_id   UUID NOT NULL REFERENCES sub_teams(id),
  title         TEXT NOT NULL,
  pod_provider  TEXT CHECK (pod_provider IN ('printful','printify')),
  external_id   TEXT
);

CREATE TABLE variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id),
  sku           TEXT NOT NULL,
  price_cents   INTEGER NOT NULL,
  cost_cents    INTEGER NOT NULL
);

CREATE TABLE creatives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id),
  kind          TEXT NOT NULL CHECK (kind IN ('design','mockup','ad_image')),
  url           TEXT NOT NULL,
  score         NUMERIC(5,2),
  screening     TEXT NOT NULL DEFAULT 'pending'
                CHECK (screening IN ('pending','passed','flagged'))
);

CREATE TABLE campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_team_id       UUID NOT NULL REFERENCES sub_teams(id),
  platform          TEXT NOT NULL DEFAULT 'meta',
  external_id       TEXT,
  daily_budget_cents INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  email         TEXT NOT NULL
);

CREATE TABLE orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  customer_id   UUID REFERENCES customers(id),
  total_cents   INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'paid',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES orders(id),
  customer_id   UUID REFERENCES customers(id),
  subject       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
);

-- Every cent in or out. Reservations let the spend governor hold budget before spending.
CREATE TABLE ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  sub_team_id   UUID REFERENCES sub_teams(id),
  kind          TEXT NOT NULL CHECK (kind IN
                ('revenue','ad_spend','pod_cost','refund','fee','reservation','release')),
  amount_cents  INTEGER NOT NULL,     -- positive = money in, negative = money out
  action_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every proposed action, with the agent's reasoning and evidence (agent tracing).
CREATE TABLE actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_team_id   UUID REFERENCES sub_teams(id),
  agent         TEXT NOT NULL,
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  cost_cents    INTEGER NOT NULL DEFAULT 0,
  risk_tier     TEXT NOT NULL CHECK (risk_tier IN ('low','medium','high')),
  verdict       TEXT CHECK (verdict IN ('PROCEED','ASK_HUMAN','ABORT')),
  reasoning     TEXT NOT NULL,
  evidence      JSONB NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'proposed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id     UUID NOT NULL REFERENCES actions(id),
  decision      TEXT CHECK (decision IN ('approved','denied')),
  decided_by    UUID REFERENCES users(id),
  decided_at    TIMESTAMPTZ
);

-- Append-only event log. The frontend subscribes to these.
CREATE TABLE events (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
