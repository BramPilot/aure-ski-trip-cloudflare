import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async all() {
    if (this.sql.includes("SELECT key, value FROM settings")) return { results: [...this.db.settings].map(([key, value]) => ({ key, value })) };
    if (this.sql.includes("SELECT * FROM participants")) return { results: this.db.participants };
    if (this.sql.includes("SELECT * FROM announcements")) return { results: this.db.announcements };
    throw new Error(`Unsupported all(): ${this.sql}`);
  }
  async first() {
    if (this.sql.includes("COUNT(*) AS total")) return { total: this.db.participants.filter((participant) => participant.status === "confirmed").length };
    if (this.sql.includes("SELECT id, title, body FROM announcements")) return this.db.announcements.find((announcement) => announcement.active === 1) || null;
    throw new Error(`Unsupported first(): ${this.sql}`);
  }
  async run() {
    if (this.sql.includes("INSERT INTO settings")) {
      this.db.settings.set(this.values[0], this.values[1]);
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unsupported run(): ${this.sql}`);
  }
}

class MockD1 {
  constructor() { this.settings = new Map(); this.participants = []; this.announcements = []; }
  async exec() {
    this.settings.set("target_count", "20");
    this.settings.set("registration_open", "1");
    this.settings.set("registration_deadline", "21 November 2026");
    this.settings.set("booking_url", "https://example.com/book");
    this.participants = Array.from({ length: 11 }, (_, index) => ({
      id: `seed-${String(index + 1).padStart(2, "0")}`,
      name: `Participant ${index + 1}`,
      email: "",
      phone: "",
      room_name: "",
      status: "confirmed",
      notes: "",
      is_placeholder: 1,
      created_at: "2026-11-13",
      updated_at: "2026-11-13"
    }));
    return { count: 1 };
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

const env = {
  DB: new MockD1(),
  ASSETS: { fetch: async () => new Response("asset") }
};

async function call(path, options = {}) {
  return worker.fetch(new Request(`https://ski.example${path}`, options), env);
}

test("first deployment initializes 11/20 and allows first-visit password setup", async () => {
  const publicResponse = await call("/api/public");
  assert.equal(publicResponse.status, 200);
  const publicData = await publicResponse.json();
  assert.equal(publicData.participantCount, 11);
  assert.equal(publicData.targetCount, 20);

  const statusBefore = await (await call("/api/admin/status")).json();
  assert.equal(statusBefore.passwordConfigured, false);

  const setupResponse = await call("/api/admin/setup", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ski.example" },
    body: JSON.stringify({ password: "a-strong-test-password" })
  });
  assert.equal(setupResponse.status, 201);
  const cookie = setupResponse.headers.get("set-cookie").split(";", 1)[0];

  const statusAfter = await (await call("/api/admin/status")).json();
  assert.equal(statusAfter.passwordConfigured, true);

  const bootstrapResponse = await call("/api/admin/bootstrap", { headers: { cookie } });
  assert.equal(bootstrapResponse.status, 200);
  const dashboard = await bootstrapResponse.json();
  assert.equal(dashboard.participants.length, 11);

  const loginResponse = await call("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://ski.example" },
    body: JSON.stringify({ password: "a-strong-test-password" })
  });
  assert.equal(loginResponse.status, 200);
  assert.match(loginResponse.headers.get("set-cookie"), /aure_ski_admin=/);
});
