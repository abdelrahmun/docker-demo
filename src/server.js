// =============================================================
//  Demo App — تطبيق تجريبي لعرض فكرة الحاويات (Docker)
//  بلا أي مكتبات خارجية: Node.js فقط
//  كل الإعدادات من Environment Variables (لا قيم ثابتة داخل الكود)
// =============================================================
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");

const PORT = Number(process.env.PORT || 8080);
const APP_NAME = process.env.APP_NAME || "Demo App";
const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const APP_ENV = process.env.APP_ENV || "local";
const DEMO_MODE = process.env.DEMO_MODE === "true";
const REDIS_HOST = process.env.REDIS_HOST || "";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

// لون الواجهة يتغير حسب الإصدار الرئيسي → يوضّح التحديث والرجوع بصريًا
const PALETTE = { 1: "#1f4e8c", 2: "#1f7a4d", 3: "#6b3fa0" };
const MAJOR = parseInt(APP_VERSION, 10) || 1;
const APP_COLOR = process.env.APP_COLOR || PALETTE[MAJOR] || "#1f4e8c";

const startedAt = Date.now();
let servedHere = 0; // عدد الطلبات التي خدمتها هذه الحاوية تحديدًا
let localVisits = 0; // عدّاد احتياطي لو مفيش Redis

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, host: os.hostname(), version: APP_VERSION, ...extra }));

// ---------- Redis client صغير جدًا (بروتوكول RESP) ----------
function redis(...args) {
  return new Promise((resolve, reject) => {
    if (!REDIS_HOST) return reject(new Error("no redis"));
    const sock = net.createConnection({ host: REDIS_HOST, port: REDIS_PORT });
    let buf = "";
    sock.setTimeout(800);
    sock.on("connect", () => {
      sock.write(`*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join(""));
    });
    sock.on("data", (chunk) => {
      buf += chunk;
      const type = buf[0];
      const line = buf.indexOf("\r\n");
      if (line < 0) return;
      const head = buf.slice(1, line);
      if (type === ":") done(Number(head));
      else if (type === "+") done(head);
      else if (type === "-") fail(new Error(head));
      else if (type === "$") {
        const len = Number(head);
        if (len < 0) return done(null);
        if (buf.length >= line + 2 + len) done(buf.slice(line + 2, line + 2 + len));
      }
    });
    const done = (v) => { sock.end(); resolve(v); };
    const fail = (e) => { sock.destroy(); reject(e); };
    sock.on("timeout", () => fail(new Error("redis timeout")));
    sock.on("error", fail);
  });
}

async function countVisit() {
  try { return { visits: await redis("INCR", "visits"), store: "redis" }; }
  catch { return { visits: ++localVisits, store: "memory" }; }
}
async function readVisits() {
  try { return { visits: Number((await redis("GET", "visits")) || 0), store: "redis" }; }
  catch { return { visits: localVisits, store: "memory" }; }
}

function info(extra) {
  return {
    app: APP_NAME,
    version: APP_VERSION,
    environment: APP_ENV,
    container: os.hostname(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    servedByThisContainer: servedHere,
    user: os.userInfo().username,
    demoMode: DEMO_MODE,
    color: APP_COLOR,
    ...extra,
  };
}

// ---------- الخادم ----------
const server = http.createServer(async (req, res) => {
  servedHere++;
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  if (url.pathname === "/api/info") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(info(await readVisits())));
  }

  if (url.pathname === "/crash" && req.method === "POST") {
    if (!DEMO_MODE) { res.writeHead(403); return res.end("demo mode is off"); }
    log("error", "simulated crash requested — exiting");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ crashed: os.hostname() }));
    return setTimeout(() => process.exit(1), 100);
  }

  if (url.pathname === "/") {
    const data = info(await countVisit());
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(page(data));
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => log("info", `listening on ${PORT}`, { env: APP_ENV, redis: REDIS_HOST || "none" }));

// إيقاف آمن: ننهي الطلبات الجارية قبل الخروج (مهم عند التحديث)
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log("info", `${sig} received — shutting down gracefully`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

// ---------- الواجهة (HTML واحد، بدون أي موارد من الإنترنت) ----------
function page(d) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.app)} · v${esc(d.version)}</title>
<style>
  :root { --brand: ${esc(d.color)}; --bg: #f4f6f9; --card: #fff; --ink: #14213d; --muted: #5b6475; --line: #e3e7ee; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Tahoma, "Noto Kufi Arabic", "Noto Sans Arabic", Arial, sans-serif; background: var(--bg); color: var(--ink); }
  header { background: var(--brand); color: #fff; padding: 28px 16px; transition: background .4s; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 0 16px; }
  header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 26px; }
  header p { margin: 6px 0 0; opacity: .85; }
  .badge { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 18px; direction: ltr; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin: 24px 0; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  .card small { color: var(--muted); display: block; margin-bottom: 6px; }
  .card b { font-size: 22px; direction: ltr; unicode-bidi: plaintext; display: block; word-break: break-all; }
  .card.hl { border-color: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 20%, transparent); }
  h2 { font-size: 18px; margin: 8px 0 12px; }
  #seen { display: flex; flex-wrap: wrap; gap: 8px; min-height: 40px; }
  .chip { direction: ltr; font-family: ui-monospace, Consolas, monospace; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 14px; }
  .chip.now { border-color: var(--brand); color: var(--brand); font-weight: 700; }
  .chip span { color: var(--muted); font-weight: 400; margin-inline-start: 6px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0; }
  button { font: inherit; border: 0; border-radius: 10px; padding: 12px 18px; cursor: pointer; font-weight: 700; }
  .primary { background: var(--brand); color: #fff; }
  .danger { background: #fff; color: #b42318; border: 1px solid #f1b8b2; }
  #msg { color: var(--muted); min-height: 24px; }
  footer { color: var(--muted); font-size: 13px; padding: 24px 0 40px; border-top: 1px solid var(--line); margin-top: 24px; }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div>
      <h1>تطبيق تجريبي يعمل داخل حاوية Docker</h1>
      <p>البيئة: <b id="env">${esc(d.environment)}</b></p>
    </div>
    <div class="badge" id="ver">v${esc(d.version)}</div>
  </div>
</header>
<main class="wrap">
  <div class="grid">
    <div class="card hl"><small>الحاوية التي ردّت الآن</small><b id="container">${esc(d.container)}</b></div>
    <div class="card"><small>مدة تشغيلها (ثانية)</small><b id="uptime">${d.uptimeSeconds}</b></div>
    <div class="card"><small>إجمالي الزيارات ${d.store === "redis" ? "— مشترك بين كل النسخ" : "— داخل هذه الحاوية"}</small><b id="visits">${d.visits}</b></div>
    <div class="card"><small>المستخدم داخل الحاوية</small><b id="user">${esc(d.user)}</b></div>
  </div>

  <h2>الحاويات التي خدمت الطلبات (تُحدَّث كل ثانيتين)</h2>
  <div id="seen"></div>

  <div class="actions">
    <button class="primary" onclick="location.reload()">تحديث الصفحة</button>
    ${d.demoMode ? `<button class="danger" onclick="crash()">محاكاة عطل في حاوية</button>` : ""}
  </div>
  <div id="msg"></div>

  <footer>صفحة مولّدة من داخل الحاوية دون أي اتصال بالإنترنت · /health لفحص الصحة · /api/info لبيانات الحاوية</footer>
</main>
<script>
  const seen = new Map();
  function render(cur) {
    const box = document.getElementById("seen");
    box.innerHTML = "";
    [...seen.entries()].forEach(([h, n]) => {
      const el = document.createElement("div");
      el.className = "chip" + (h === cur ? " now" : "");
      el.textContent = h;
      const c = document.createElement("span");
      c.textContent = "×" + n;
      el.appendChild(c);
      box.appendChild(el);
    });
  }
  async function poll() {
    try {
      const r = await fetch("/api/info", { cache: "no-store" });
      const d = await r.json();
      seen.set(d.container, (seen.get(d.container) || 0) + 1);
      for (const k of ["container", "visits", "user"]) document.getElementById(k).textContent = d[k];
      document.getElementById("uptime").textContent = d.uptimeSeconds;
      document.getElementById("ver").textContent = "v" + d.version;
      document.documentElement.style.setProperty("--brand", d.color);
      render(d.container);
      document.getElementById("msg").textContent = "";
    } catch (e) {
      document.getElementById("msg").textContent = "جارٍ الاتصال بالخدمة…";
    }
  }
  async function crash() {
    const r = await fetch("/crash", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    document.getElementById("msg").textContent = "تم إيقاف الحاوية " + (d.crashed || "") + " عمدًا — راقب كيف تعود تلقائيًا خلال ثوانٍ.";
  }
  poll(); setInterval(poll, 2000);
</script>
</body>
</html>`;
}
