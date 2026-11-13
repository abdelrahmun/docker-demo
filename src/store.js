// =============================================================
//  التخزين: PostgreSQL لو DATABASE_URL موجود، وإلا ذاكرة مؤقتة
//  الواجهة واحدة للاتنين، فباقي الكود ميعرفش الفرق
// =============================================================
"use strict";

const DEPARTMENTS = {
  it: "تكنولوجيا المعلومات",
  admin: "الشؤون الإدارية",
  hr: "الموارد البشرية",
  finance: "الحسابات",
};
const PRIORITIES = { normal: "عادي", urgent: "عاجل" };
const STATUSES = { open: "مفتوح", solved: "تم الحل" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- ذاكرة مؤقتة (للتشغيل بحاوية واحدة: docker run / Render) ----------
function memoryStore() {
  let seq = 0;
  const rows = [];
  const insert = (t, minutesAgo = 0) => {
    const row = {
      id: ++seq,
      title: t.title,
      department: t.department,
      priority: t.priority,
      status: "open",
      createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      solvedAt: null,
    };
    rows.push(row);
    return { ...row };
  };

  // بيانات تجريبية فقط
  insert({ title: "الطابعة في الدور الثاني لا تطبع", department: "admin", priority: "normal" }, 180);
  insert({ title: "طلب إنشاء بريد إلكتروني لموظف جديد", department: "hr", priority: "normal" }, 95);
  insert({ title: "تعذّر الدخول على منظومة الحسابات", department: "finance", priority: "urgent" }, 20);

  return {
    kind: "memory",
    async init() {},
    async ping() { return true; },
    async list() { return rows.slice().sort((a, b) => b.id - a.id).map((r) => ({ ...r })); },
    async create(t) { return insert(t); },
    async setStatus(id, status) {
      const r = rows.find((x) => x.id === id);
      if (!r) return null;
      r.status = status;
      r.solvedAt = status === "solved" ? new Date().toISOString() : null;
      return { ...r };
    },
    async close() {},
  };
}

// ---------- PostgreSQL ----------
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tickets (
    id          SERIAL PRIMARY KEY,
    title       TEXT        NOT NULL,
    department  TEXT        NOT NULL,
    priority    TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'open',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    solved_at   TIMESTAMPTZ
  )`;

function pgStore(connectionString, log) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000 });
  pool.on("error", (e) => log("warn", "database pool error", { error: e.message }));

  const toTicket = (r) => ({
    id: r.id,
    title: r.title,
    department: r.department,
    priority: r.priority,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    solvedAt: r.solved_at ? r.solved_at.toISOString() : null,
  });

  return {
    kind: "postgres",
    // نحاول الاتصال لحد 30 ثانية (قاعدة البيانات ممكن تكون لسه بتقوم)
    async init(timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      for (let attempt = 1; ; attempt++) {
        try {
          await pool.query(SCHEMA);
          log("info", "database ready", { attempt });
          return;
        } catch (e) {
          if (Date.now() + 2000 > deadline) throw e;
          log("warn", "database not ready, retrying", { attempt, error: e.message });
          await sleep(2000);
        }
      }
    },
    async ping() {
      try {
        await Promise.race([pool.query("SELECT 1"), sleep(1500).then(() => { throw new Error("timeout"); })]);
        return true;
      } catch {
        return false;
      }
    },
    async list() {
      const { rows } = await pool.query("SELECT * FROM tickets ORDER BY created_at DESC, id DESC LIMIT 500");
      return rows.map(toTicket);
    },
    async create(t) {
      const { rows } = await pool.query(
        "INSERT INTO tickets (title, department, priority) VALUES ($1, $2, $3) RETURNING *",
        [t.title, t.department, t.priority],
      );
      return toTicket(rows[0]);
    },
    async setStatus(id, status) {
      const { rows } = await pool.query(
        "UPDATE tickets SET status = $2, solved_at = CASE WHEN $2 = 'solved' THEN now() ELSE NULL END WHERE id = $1 RETURNING *",
        [id, status],
      );
      return rows[0] ? toTicket(rows[0]) : null;
    },
    async close() { await pool.end(); },
  };
}

function createStore(databaseUrl, log) {
  return databaseUrl ? pgStore(databaseUrl, log) : memoryStore();
}

module.exports = { createStore, DEPARTMENTS, PRIORITIES, STATUSES };
