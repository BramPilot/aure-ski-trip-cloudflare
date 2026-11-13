const COOKIE_NAME = "aure_ski_admin";
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();
let databaseReady;

const DATABASE_SCHEMA = `
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
`;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      const response = await env.ASSETS.fetch(request);
      return withSecurityHeaders(response);
    } catch (error) {
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  }
};

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  await ensureDatabase(env.DB);

  if (url.pathname === "/api/public" && request.method === "GET") {
    const settings = await readSettings(env.DB);
    const participant = await env.DB.prepare("SELECT COUNT(*) AS total FROM participants WHERE status = 'confirmed'").first();
    const announcement = await env.DB.prepare("SELECT id, title, body FROM announcements WHERE active = 1 ORDER BY updated_at DESC LIMIT 1").first();
    return json({
      participantCount: Number(participant?.total || 0),
      targetCount: positiveInteger(settings.target_count, 20),
      registrationOpen: settings.registration_open === "1",
      registrationDeadline: settings.registration_deadline || "21 November 2026",
      bookingUrl: settings.booking_url || "",
      announcement: announcement || null
    });
  }

  if (url.pathname === "/api/admin/status" && request.method === "GET") {
    const settings = await readSettings(env.DB);
    return json({ passwordConfigured: Boolean(settings.admin_password_hash && settings.admin_password_salt) });
  }

  if (url.pathname === "/api/admin/setup" && request.method === "POST") {
    requireSameOrigin(request, url);
    const current = await readSettings(env.DB);
    if (current.admin_password_hash || current.admin_password_salt) return json({ error: "The admin password has already been configured." }, 409);
    const body = await readJson(request);
    const password = String(body.password || "");
    if (password.length < 12) return json({ error: "Use at least 12 characters." }, 400);
    if (password.length > 200) return json({ error: "The password is too long." }, 400);
    const salt = randomBase64Url(18);
    const passwordHash = await hashPassword(password, salt);
    const sessionSecret = randomBase64Url(48);
    await env.DB.batch([
      settingStatement(env.DB, "admin_password_salt", salt),
      settingStatement(env.DB, "admin_password_hash", passwordHash),
      settingStatement(env.DB, "session_secret", sessionSecret)
    ]);
    const token = await createSession(sessionSecret);
    return json({ ok: true }, 201, {
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly;${cookieSecure(url)} SameSite=Strict; Max-Age=${SESSION_SECONDS}`
    });
  }

  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    requireSameOrigin(request, url);
    const settings = await readSettings(env.DB);
    if (!settings.admin_password_hash || !settings.admin_password_salt || !settings.session_secret) return json({ error: "Create the admin password first." }, 409);
    const body = await readJson(request);
    const candidateHash = await hashPassword(String(body.password || ""), settings.admin_password_salt);
    if (!safeEqual(candidateHash, settings.admin_password_hash)) {
      await delay(450);
      return json({ error: "Incorrect password." }, 401);
    }
    const token = await createSession(settings.session_secret);
    return json({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly;${cookieSecure(url)} SameSite=Strict; Max-Age=${SESSION_SECONDS}`
    });
  }

  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    requireSameOrigin(request, url);
    return json({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly;${cookieSecure(url)} SameSite=Strict; Max-Age=0`
    });
  }

  const authenticationSettings = await readSettings(env.DB);
  if (!(await isAuthenticated(request, authenticationSettings.session_secret))) return json({ error: "Authentication required." }, 401);
  if (request.method !== "GET") requireSameOrigin(request, url);

  if (url.pathname === "/api/admin/bootstrap" && request.method === "GET") {
    const [settings, participants, announcements] = await Promise.all([
      readSettings(env.DB),
      env.DB.prepare("SELECT * FROM participants ORDER BY CASE status WHEN 'confirmed' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at ASC").all(),
      env.DB.prepare("SELECT * FROM announcements ORDER BY updated_at DESC").all()
    ]);
    return json({ settings: normalizeSettings(settings), participants: participants.results, announcements: announcements.results });
  }

  if (url.pathname === "/api/admin/settings" && request.method === "PUT") {
    const body = await readJson(request);
    const targetCount = positiveInteger(body.targetCount, 0);
    const bookingUrl = validateUrl(body.bookingUrl);
    const deadline = cleanText(body.registrationDeadline, 80);
    if (!targetCount || targetCount > 500) return json({ error: "Target count must be between 1 and 500." }, 400);
    if (!bookingUrl) return json({ error: "Enter a valid booking URL." }, 400);
    if (!deadline) return json({ error: "Enter a registration deadline." }, 400);
    await env.DB.batch([
      settingStatement(env.DB, "target_count", String(targetCount)),
      settingStatement(env.DB, "registration_open", body.registrationOpen ? "1" : "0"),
      settingStatement(env.DB, "registration_deadline", deadline),
      settingStatement(env.DB, "booking_url", bookingUrl)
    ]);
    return json({ ok: true, settings: normalizeSettings(await readSettings(env.DB)) });
  }

  if (url.pathname === "/api/admin/participants" && request.method === "POST") {
    const participant = validateParticipant(await readJson(request));
    if (participant.error) return json({ error: participant.error }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO participants (id, name, email, phone, room_name, status, notes, is_placeholder) VALUES (?, ?, ?, ?, ?, ?, ?, 0)")
      .bind(id, participant.name, participant.email, participant.phone, participant.roomName, participant.status, participant.notes).run();
    return json({ ok: true, id }, 201);
  }

  const participantMatch = url.pathname.match(/^\/api\/admin\/participants\/([a-zA-Z0-9-]+)$/);
  if (participantMatch && request.method === "PUT") {
    const participant = validateParticipant(await readJson(request));
    if (participant.error) return json({ error: participant.error }, 400);
    const result = await env.DB.prepare("UPDATE participants SET name = ?, email = ?, phone = ?, room_name = ?, status = ?, notes = ?, is_placeholder = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(participant.name, participant.email, participant.phone, participant.roomName, participant.status, participant.notes, participantMatch[1]).run();
    if (!result.meta.changes) return json({ error: "Participant not found." }, 404);
    return json({ ok: true });
  }
  if (participantMatch && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM participants WHERE id = ?").bind(participantMatch[1]).run();
    if (!result.meta.changes) return json({ error: "Participant not found." }, 404);
    return json({ ok: true });
  }

  if (url.pathname === "/api/admin/announcements" && request.method === "POST") {
    const announcement = validateAnnouncement(await readJson(request));
    if (announcement.error) return json({ error: announcement.error }, 400);
    const id = crypto.randomUUID();
    const statements = [];
    if (announcement.active) statements.push(env.DB.prepare("UPDATE announcements SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE active = 1"));
    statements.push(env.DB.prepare("INSERT INTO announcements (id, title, body, active) VALUES (?, ?, ?, ?)").bind(id, announcement.title, announcement.body, announcement.active ? 1 : 0));
    await env.DB.batch(statements);
    return json({ ok: true, id }, 201);
  }

  const announcementMatch = url.pathname.match(/^\/api\/admin\/announcements\/([a-zA-Z0-9-]+)$/);
  if (announcementMatch && request.method === "PUT") {
    const announcement = validateAnnouncement(await readJson(request));
    if (announcement.error) return json({ error: announcement.error }, 400);
    const statements = [];
    if (announcement.active) statements.push(env.DB.prepare("UPDATE announcements SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE active = 1 AND id != ?").bind(announcementMatch[1]));
    statements.push(env.DB.prepare("UPDATE announcements SET title = ?, body = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(announcement.title, announcement.body, announcement.active ? 1 : 0, announcementMatch[1]));
    const results = await env.DB.batch(statements);
    if (!results.at(-1).meta.changes) return json({ error: "Announcement not found." }, 404);
    return json({ ok: true });
  }
  if (announcementMatch && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(announcementMatch[1]).run();
    if (!result.meta.changes) return json({ error: "Announcement not found." }, 404);
    return json({ ok: true });
  }

  return json({ error: "Not found." }, 404);
}

async function ensureDatabase(db) {
  if (!databaseReady) {
    databaseReady = db.exec(DATABASE_SCHEMA).catch((error) => {
      databaseReady = undefined;
      throw error;
    });
  }
  return databaseReady;
}

async function readSettings(db) {
  const result = await db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(result.results.map((row) => [row.key, row.value]));
}

function normalizeSettings(settings) {
  return {
    targetCount: positiveInteger(settings.target_count, 20),
    registrationOpen: settings.registration_open === "1",
    registrationDeadline: settings.registration_deadline || "21 November 2026",
    bookingUrl: settings.booking_url || ""
  };
}

function settingStatement(db, key, value) {
  return db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP").bind(key, value);
}

function validateParticipant(body) {
  const name = cleanText(body.name, 120);
  const status = ["confirmed", "pending", "cancelled"].includes(body.status) ? body.status : "confirmed";
  if (!name) return { error: "Participant name is required." };
  const email = cleanText(body.email, 180);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  return {
    name,
    email,
    phone: cleanText(body.phone, 40),
    roomName: cleanText(body.roomName, 100),
    status,
    notes: cleanText(body.notes, 1200)
  };
}

function validateAnnouncement(body) {
  const title = cleanText(body.title, 120);
  const message = cleanText(body.body, 1200);
  if (!title) return { error: "Announcement title is required." };
  if (!message) return { error: "Announcement text is required." };
  return { title, body: message, active: Boolean(body.active) };
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32_000) throw new Error("Request body too large");
  return request.json();
}

function requireSameOrigin(request, url) {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new Error("Cross-origin request rejected");
}

async function createSession(secret) {
  const payload = base64Url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() }));
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

async function isAuthenticated(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get("cookie") || "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, await sign(payload, secret))) return false;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: encoder.encode(salt),
    iterations: 120_000
  }, material, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

function randomBase64Url(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function safeEqual(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) difference |= (a[index % a.length] || 0) ^ (b[index % b.length] || 0);
  return difference === 0;
}

function base64Url(value) {
  return bytesToBase64Url(encoder.encode(value));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)));
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function validateUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function cookieSecure(url) {
  return url.protocol === "https:" ? " Secure;" : "";
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
