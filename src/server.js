// =============================================================
//  طلبات الدعم الفني — تطبيق تجريبي لعرض فكرة الحاويات (Docker)
//  Node.js فقط + مكتبة pg. كل الإعدادات من Environment Variables
//
//  الإصدار 1 (APP_VERSION=1.x): تسجيل طلب + عرض الطلبات
//  الإصدار 2 (APP_VERSION=2.x): + بحث + زر "تم الحل" + عدّادات
//  الترقية = تغيير رقم الإصدار فقط، بدون أي تعديل في الكود
// =============================================================
"use strict";

const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { createStore, DEPARTMENTS, PRIORITIES, STATUSES } = require("./store");
const { renderPage, renderError } = require("./views");

const config = {
  port: Number(process.env.PORT || 8080),
  appName: process.env.APP_NAME || "IT Help Desk",
  version: process.env.APP_VERSION || "1.0.0",
  env: process.env.APP_ENV || "local",
  demoMode: process.env.DEMO_MODE === "true",
  databaseUrl: process.env.DATABASE_URL || "",
  timeZone: process.env.DISPLAY_TIMEZONE || "Africa/Cairo",
};
const MAJOR = parseInt(config.version, 10) || 1;
const V2 = MAJOR >= 2;
const HOST = os.hostname();
const startedAt = Date.now();

// سجلات JSON على stdout — Docker بيجمعها: docker compose logs app
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, host: HOST, version: config.version, ...extra }));

const store = createStore(config.databaseUrl, log);

// ملفات الواجهة الثابتة (تتقري مرة واحدة عند التشغيل)
const STATIC = Object.fromEntries(
  [["app.css", "text/css; charset=utf-8"], ["app.js", "text/javascript; charset=utf-8"]].map(([name, type]) => [
    `/static/${name}`,
    { type, body: fs.readFileSync(path.join(__dirname, "public", name)) },
  ]),
);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

// ---------- أدوات صغيرة ----------
function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(body);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
const html = (res, status, body) => send(res, status, body, "text/html; charset=utf-8");

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// يقبل الكود (it) أو الاسم العربي (تكنولوجيا المعلومات)
function pick(value, map) {
  const v = String(value ?? "").trim();
  if (Object.hasOwn(map, v)) return v;
  return Object.keys(map).find((k) => map[k] === v) || null;
}

function parseTicket(input) {
  const title = String(input.title ?? "").replace(/\s+/g, " ").trim();
  const department = pick(input.department, DEPARTMENTS);
  const priority = pick(input.priority || "normal", PRIORITIES);
  const errors = [];
  if (!title || title.length > 120) errors.push("title is required (max 120 characters)");
  if (!department) errors.push(`department must be one of: ${Object.keys(DEPARTMENTS).join(", ")}`);
  if (!priority) errors.push(`priority must be one of: ${Object.keys(PRIORITIES).join(", ")}`);
  return errors.length ? { errors } : { ticket: { title, department, priority } };
}

// بحث بسيط يتجاهل اختلاف الهمزات والتاء المربوطة والألف المقصورة
const normalize = (s) =>
  String(s).toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();

function search(tickets, q) {
  const needle = normalize(q).replace(/^#/, "");
  if (!needle) return tickets;
  return tickets.filter(
    (t) => String(t.id) === needle || normalize(t.title).includes(needle) || normalize(DEPARTMENTS[t.department]).includes(needle),
  );
}

const counts = (tickets) => ({
  open: tickets.filter((t) => t.status !== "solved").length,
  solved: tickets.filter((t) => t.status === "solved").length,
});

const withLabels = (t) => ({
  ...t,
  departmentLabel: DEPARTMENTS[t.department] || t.department,
  priorityLabel: PRIORITIES[t.priority] || t.priority,
  ...(V2 ? { statusLabel: STATUSES[t.status] || t.status } : {}),
});

// ---------- المسارات ----------
async function handle(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (method === "GET" && pathname === "/health") {
    const ok = await store.ping();
    return json(res, ok ? 200 : 503, {
      status: ok ? "ok" : "degraded",
      version: config.version,
      container: HOST,
      storage: store.kind,
      database: store.kind === "postgres" ? (ok ? "connected" : "unreachable") : "not configured",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  }

  if (method === "GET" && STATIC[pathname]) {
    const f = STATIC[pathname];
    return send(res, 200, f.body, f.type, { "Cache-Control": "no-cache" });
  }

  if (method === "GET" && pathname === "/") {
    const all = await store.list();
    const q = V2 ? (url.searchParams.get("q") || "").slice(0, 100) : "";
    return html(res, 200, renderPage({
      v2: V2,
      version: config.version,
      host: HOST,
      storage: store.kind,
      tickets: V2 ? search(all, q) : all,
      counts: counts(all),
      q,
      created: Number(url.searchParams.get("created")) || null,
      error: url.searchParams.get("error") === "invalid",
      timeZone: config.timeZone,
    }));
  }

  if (method === "GET" && pathname === "/api/tickets") {
    const all = await store.list();
    const q = V2 ? url.searchParams.get("q") || "" : "";
    const tickets = (V2 ? search(all, q) : all).map(withLabels);
    return json(res, 200, { version: config.version, storage: store.kind, ...(V2 ? { counts: counts(all) } : {}), tickets });
  }

  if (method === "POST" && pathname === "/api/tickets") {
    const raw = await readBody(req);
    const isForm = (req.headers["content-type"] || "").startsWith("application/x-www-form-urlencoded");
    let input;
    try {
      input = isForm ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw || "{}");
    } catch {
      return json(res, 400, { error: "invalid JSON body" });
    }
    const { ticket, errors } = parseTicket(input || {});
    if (errors) {
      if (isForm) return send(res, 303, "", "text/plain", { Location: "/?error=invalid" });
      return json(res, 400, { error: "validation failed", details: errors });
    }
    const created = await store.create(ticket);
    log("info", "ticket created", { id: created.id, department: created.department, priority: created.priority });
    // النموذج في الصفحة يشتغل حتى بدون JavaScript: نرجّع المستخدم للصفحة الرئيسية
    if (isForm) return send(res, 303, "", "text/plain", { Location: `/?created=${created.id}` });
    return json(res, 201, withLabels(created));
  }

  const m = pathname.match(/^\/api\/tickets\/(\d+)$/);
  if (m && method === "PATCH") {
    if (!V2) return json(res, 404, { error: "not available in this version", version: config.version });
    let input = {};
    try { input = JSON.parse((await readBody(req)) || "{}"); } catch { return json(res, 400, { error: "invalid JSON body" }); }
    const status = input.status ?? "solved";
    if (!Object.hasOwn(STATUSES, status)) return json(res, 400, { error: `status must be one of: ${Object.keys(STATUSES).join(", ")}` });
    const updated = await store.setStatus(Number(m[1]), status);
    if (!updated) return json(res, 404, { error: "ticket not found" });
    log("info", "ticket updated", { id: updated.id, status });
    return json(res, 200, withLabels(updated));
  }

  // محاكاة عطل للعرض فقط: الحاوية تقف، و Docker يرجّعها تلقائيًا (restart policy)
  if (method === "POST" && pathname === "/crash" && config.demoMode) {
    log("error", "simulated crash requested — exiting");
    json(res, 200, { crashed: HOST });
    setTimeout(() => process.exit(1), 100);
    return;
  }

  if (pathname === "/favicon.ico") return send(res, 204, "", "text/plain");

  if (pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });
  return html(res, 404, renderError("الصفحة غير موجودة", 404));
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const url = new URL(req.url, "http://localhost");
  // سجل لكل طلب (ما عدا فحص الصحة والملفات الثابتة عشان السجلات تفضل مقروءة)
  if (url.pathname !== "/health" && !url.pathname.startsWith("/static/")) {
    res.on("finish", () => log("info", "request", { method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - t0 }));
  }
  try {
    await handle(req, res, url);
  } catch (e) {
    log("error", "request failed", { path: url.pathname, error: e.message });
    if (!res.headersSent) {
      const status = e.status || 503;
      if (url.pathname.startsWith("/api/")) json(res, status, { error: "service temporarily unavailable" });
      else html(res, status, renderError("الخدمة غير متاحة مؤقتًا، حاول بعد لحظات", status));
    }
  }
});
server.keepAliveTimeout = 5000;

// ---------- التشغيل ----------
async function main() {
  log("info", "starting", { app: config.appName, env: config.env, storage: store.kind, features: V2 ? "v2" : "v1", demoMode: config.demoMode });
  try {
    await store.init();
  } catch (e) {
    log("error", "database unavailable after 30s — exiting", { error: e.message });
    process.exit(1);
  }
  server.listen(config.port, "0.0.0.0", () => log("info", `listening on ${config.port}`));
}

// إيقاف آمن: Docker يبعت SIGTERM عند التحديث أو الإيقاف — نخلّص الطلبات الجارية ونقفل الاتصالات
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    log("info", `${sig} received — shutting down gracefully`);
    setTimeout(() => process.exit(0), 8000).unref();
    server.close(async () => {
      await store.close().catch(() => {});
      log("info", "stopped");
      process.exit(0);
    });
    server.closeIdleConnections();
  });
}

main();
