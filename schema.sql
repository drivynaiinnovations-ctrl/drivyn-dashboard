-- ============================================================
-- CALL REVENUE TRACKER — Supabase Schema
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── CUSTOMERS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       TEXT UNIQUE NOT NULL,
  name        TEXT,
  email       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);

-- ─── CALLS ──────────────────────────────────────────────────
-- Every inbound/outbound call gets a record here.
-- source: 'voice_ai' | 'google_ads' | 'facebook' | 'organic' | 'referral' | etc.
CREATE TABLE IF NOT EXISTS calls (
  id               TEXT PRIMARY KEY,          -- call_<hex> assigned by our API
  customer_id      UUID REFERENCES customers(id),
  phone            TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'unknown',
  campaign         TEXT,                       -- ad campaign name/id
  status           TEXT DEFAULT 'active',      -- active | completed | missed
  outcome          TEXT,                       -- booked | no_answer | callback | etc.
  converted        BOOLEAN DEFAULT FALSE,
  booking_id       UUID,                       -- filled after booking created
  duration_seconds INTEGER,
  metadata         JSONB,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  ended_at         TIMESTAMPTZ
);

CREATE INDEX idx_calls_customer_id  ON calls(customer_id);
CREATE INDEX idx_calls_source       ON calls(source);
CREATE INDEX idx_calls_started_at   ON calls(started_at DESC);
CREATE INDEX idx_calls_converted    ON calls(converted) WHERE converted = TRUE;

-- ─── BOOKINGS ───────────────────────────────────────────────
-- A booking ties a call to a scheduled appointment/service.
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id         TEXT REFERENCES calls(id),
  customer_id     UUID REFERENCES customers(id),
  external_id     TEXT UNIQUE,               -- Square/Calendly booking ID
  service         TEXT,
  amount_cents    INTEGER DEFAULT 0,         -- estimated or invoiced amount
  status          TEXT DEFAULT 'pending',    -- pending | confirmed | completed | canceled
  booking_source  TEXT,                      -- square | calendly | google_calendar | toast
  revenue_id      UUID,                      -- filled once payment confirmed
  scheduled_at    TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_call_id     ON bookings(call_id);
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_external_id ON bookings(external_id);
CREATE INDEX idx_bookings_status      ON bookings(status);

-- ─── REVENUE ────────────────────────────────────────────────
-- Actual payment records. Sourced from Square/Toast/Stripe webhooks.
CREATE TABLE IF NOT EXISTS revenue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID REFERENCES bookings(id),
  call_id         TEXT REFERENCES calls(id),
  customer_id     UUID REFERENCES customers(id),
  source          TEXT,                      -- original call source (voice_ai, google_ads...)
  campaign        TEXT,
  payment_source  TEXT,                      -- square | toast | stripe | manual
  external_id     TEXT UNIQUE,              -- payment ID from payment processor
  amount_cents    INTEGER NOT NULL,
  paid_at         TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_revenue_call_id    ON revenue(call_id);
CREATE INDEX idx_revenue_booking_id ON revenue(booking_id);
CREATE INDEX idx_revenue_source     ON revenue(source);
CREATE INDEX idx_revenue_paid_at    ON revenue(paid_at DESC);

-- ─── FOREIGN KEY: bookings.revenue_id ──────────────────────
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_revenue
  FOREIGN KEY (revenue_id) REFERENCES revenue(id) DEFERRABLE INITIALLY DEFERRED;

-- ─── CALLS.booking_id FK ────────────────────────────────────
ALTER TABLE calls ADD CONSTRAINT fk_calls_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id) DEFERRABLE INITIALLY DEFERRED;

-- ─── ANALYTICS VIEW ─────────────────────────────────────────
-- "This call generated $X" — pre-joined view for fast dashboard queries
CREATE OR REPLACE VIEW call_revenue_attribution AS
SELECT
  c.id                                          AS call_id,
  c.source,
  c.campaign,
  c.status,
  c.converted,
  c.duration_seconds,
  c.started_at,
  c.ended_at,
  cu.name                                       AS customer_name,
  cu.phone                                      AS customer_phone,
  b.id                                          AS booking_id,
  b.service,
  b.scheduled_at,
  b.status                                      AS booking_status,
  b.booking_source,
  COALESCE(r.amount_cents, 0)                   AS revenue_cents,
  COALESCE(r.amount_cents, 0) / 100.0           AS revenue_dollars,
  r.payment_source,
  r.paid_at,
  CASE
    WHEN r.amount_cents IS NOT NULL
    THEN 'This call generated $' || ROUND(r.amount_cents / 100.0, 2) || ' in revenue'
    WHEN b.id IS NOT NULL
    THEN 'Booking created — awaiting payment'
    ELSE 'No booking yet'
  END                                           AS attribution_message
FROM calls c
LEFT JOIN customers  cu ON cu.id = c.customer_id
LEFT JOIN bookings   b  ON b.call_id = c.id
LEFT JOIN revenue    r  ON r.booking_id = b.id;

-- ─── SUMMARY STATS VIEW ──────────────────────────────────────
CREATE OR REPLACE VIEW revenue_by_source AS
SELECT
  source,
  campaign,
  COUNT(DISTINCT call_id)            AS calls,
  COUNT(DISTINCT booking_id)         AS bookings,
  SUM(amount_cents) / 100.0          AS total_revenue,
  AVG(amount_cents) / 100.0          AS avg_revenue_per_payment,
  DATE_TRUNC('day', paid_at)         AS day
FROM revenue
GROUP BY source, campaign, DATE_TRUNC('day', paid_at)
ORDER BY day DESC, total_revenue DESC;

-- ─── ROW LEVEL SECURITY (optional, for multi-tenant later) ──
-- ALTER TABLE calls    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE revenue  ENABLE ROW LEVEL SECURITY;

-- ─── SAMPLE DATA (dev only — delete in prod) ────────────────
/*
INSERT INTO customers (phone, name) VALUES ('5551234567', 'Jane Smith');

INSERT INTO calls (id, customer_id, phone, source, campaign, status, converted, duration_seconds, started_at, ended_at)
VALUES (
  'call_abc123def456',
  (SELECT id FROM customers WHERE phone = '5551234567'),
  '5551234567', 'voice_ai', NULL, 'completed', TRUE, 240,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days' + INTERVAL '4 minutes'
);
*/
