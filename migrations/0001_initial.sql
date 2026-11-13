CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('target_count', '20'),
  ('registration_open', '1'),
  ('registration_deadline', '21 November 2026'),
  ('booking_url', 'https://www.sunweb.nl/groups/totallysnow/bookingpage/extras?bookingNumber=6635550');

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  room_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  is_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (is_placeholder IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);

INSERT OR IGNORE INTO participants (id, name, status, is_placeholder) VALUES
  ('seed-01', 'Participant 01 — edit me', 'confirmed', 1),
  ('seed-02', 'Participant 02 — edit me', 'confirmed', 1),
  ('seed-03', 'Participant 03 — edit me', 'confirmed', 1),
  ('seed-04', 'Participant 04 — edit me', 'confirmed', 1),
  ('seed-05', 'Participant 05 — edit me', 'confirmed', 1),
  ('seed-06', 'Participant 06 — edit me', 'confirmed', 1),
  ('seed-07', 'Participant 07 — edit me', 'confirmed', 1),
  ('seed-08', 'Participant 08 — edit me', 'confirmed', 1),
  ('seed-09', 'Participant 09 — edit me', 'confirmed', 1),
  ('seed-10', 'Participant 10 — edit me', 'confirmed', 1),
  ('seed-11', 'Participant 11 — edit me', 'confirmed', 1);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, updated_at DESC);
