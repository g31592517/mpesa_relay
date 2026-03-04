-- ─────────────────────────────────────────────────────────────────
-- Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ─────────────────────────────────────────────────────────────────

-- Table to store incoming M-Pesa STK Push callback results
CREATE TABLE IF NOT EXISTS mpesa_callbacks (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id  TEXT        NOT NULL UNIQUE,   -- ws_CO_... from Daraja
  result_code          INTEGER     NOT NULL,           -- 0 = success
  result_desc          TEXT,
  amount               NUMERIC(10, 2),
  mpesa_receipt        TEXT,                           -- e.g. NLJ7RT61SV
  phone_number         TEXT,                           -- e.g. 254712345678
  raw_payload          JSONB,                          -- full Daraja payload
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast polling by checkout_request_id
CREATE INDEX IF NOT EXISTS idx_mpesa_callbacks_checkout
  ON mpesa_callbacks (checkout_request_id);

-- Enable Row Level Security (service-role key bypasses it)
ALTER TABLE mpesa_callbacks ENABLE ROW LEVEL SECURITY;

-- No public read/write — only the service-role key (used by Vercel + backend) can access
-- (No explicit policy needed; service-role bypasses RLS by default)
