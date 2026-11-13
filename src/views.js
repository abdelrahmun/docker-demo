// =============================================================
//  الواجهة: HTML بيتولّد من السيرفر — بدون أي خطوط أو صور أو CDN
//  (تشتغل على شبكة مغلقة بالكامل)
// =============================================================
"use strict";

const { DEPARTMENTS, PRIORITIES } = require("./store");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const num = new Intl.NumberFormat("ar-EG");
const rel = new Intl.RelativeTimeFormat("ar-EG", { numeric: "auto" });

function when(iso, timeZone) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return rel.format(-Math.floor(diff / 60), "minute");
  if (diff < 86400) return rel.format(-Math.floor(diff / 3600), "hour");
  return new Intl.DateTimeFormat("ar-EG", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function layout({ title, version, v2, body }) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/app.css">
</head>
<body class="${v2 ? "v2" : "v1"}" data-version="${esc(version)}">
${body}
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

function header({ version, host, storage }) {
  const db = storage === "postgres";
  return `<header class="top">
  <div class="wrap top-row">
    <div class="brand">
      <h1>طلبات الدعم الفني</h1>
      <p>منظومة داخلية لتسجيل ومتابعة طلبات الدعم — بيانات تجريبية</p>
    </div>
    <div class="meta">
      <span class="chip badge" title="إصدار التطبيق">v${esc(version)}</span>
      <span class="chip" title="اسم الحاوية التي ردّت على الطلب">الحاوية <bdi class="mono">${esc(host)}</bdi></span>
      <span class="chip"><i class="dot ${db ? "ok" : "temp"}"></i>${db ? "متصل بقاعدة البيانات" : "تخزين مؤقت"}</span>
    </div>
  </div>
</header>`;
}

function newTicketForm() {
  const options = Object.entries(DEPARTMENTS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  const radios = Object.entries(PRIORITIES)
    .map(([k, v], i) => `<label class="radio"><input type="radio" name="priority" value="${k}"${i === 0 ? " checked" : ""}> ${esc(v)}</label>`)
    .join("");
  return `<section class="card" aria-labelledby="new-title">
  <h2 id="new-title">طلب جديد</h2>
  <form method="post" action="/api/tickets" id="new-ticket">
    <div class="field">
      <label for="title">عنوان الطلب</label>
      <input type="text" id="title" name="title" required maxlength="120" autocomplete="off" placeholder="مثال: الطابعة لا تعمل">
    </div>
    <div class="field">
      <label for="department">الإدارة</label>
      <select id="department" name="department" required>${options}</select>
    </div>
    <fieldset class="field">
      <legend>الأولوية</legend>
      <div class="radios">${radios}</div>
    </fieldset>
    <button type="submit" class="btn block">تسجيل الطلب</button>
  </form>
</section>`;
}

function ticketItem(t, { v2, timeZone }) {
  const solved = t.status === "solved";
  const urgent = t.priority === "urgent";
  const status = v2
    ? solved
      ? `<span class="tag solved">تم الحل</span>`
      : `<button type="button" class="btn solve" data-solve="${t.id}">تم الحل</button>`
    : "";
  return `<li class="ticket${v2 && solved ? " is-solved" : ""}">
    <div class="t-body">
      <div class="t-title"><span class="t-no">#${num.format(t.id)}</span> ${esc(t.title)}</div>
      <div class="t-meta">
        <span>${esc(DEPARTMENTS[t.department] || t.department)}</span>
        <span class="tag${urgent ? " urgent" : ""}">${esc(PRIORITIES[t.priority] || t.priority)}</span>
        ${v2 && !solved ? `<span class="tag open">مفتوح</span>` : ""}
        <time datetime="${esc(t.createdAt)}">${esc(when(t.createdAt, timeZone))}</time>
      </div>
    </div>
    ${status}
  </li>`;
}

function renderPage(d) {
  const notice = d.created
    ? `<div class="notice ok" role="status">تم تسجيل الطلب رقم ${num.format(d.created)} بنجاح.</div>`
    : d.error
      ? `<div class="notice err" role="alert">برجاء كتابة عنوان الطلب واختيار الإدارة.</div>`
      : "";

  // v2: عدّادات أعلى الصفحة
  const stats = d.v2
    ? `<div class="stats">
    <div class="stat"><span>مفتوح</span><b id="count-open">${num.format(d.counts.open)}</b></div>
    <div class="stat done"><span>تم الحل</span><b id="count-solved">${num.format(d.counts.solved)}</b></div>
  </div>`
    : "";

  // v2: مربع البحث
  const searchBox = d.v2
    ? `<form method="get" action="/" role="search" class="search">
      <label for="search" class="sr-only">بحث في الطلبات</label>
      <input type="search" id="search" name="q" value="${esc(d.q)}" placeholder="بحث بالعنوان أو الإدارة أو رقم الطلب" maxlength="100">
      <button type="submit" class="btn">بحث</button>
    </form>`
    : "";

  const empty = d.q ? `لا توجد نتائج لـ «${esc(d.q)}»` : "لا توجد طلبات بعد — سجّل أول طلب من النموذج.";
  const list = d.tickets.length
    ? `<ul class="tickets">${d.tickets.map((t) => ticketItem(t, d)).join("")}</ul>`
    : `<p class="empty">${empty}</p>`;

  const body = `${header(d)}
<main class="wrap">
  ${notice}
  ${stats}
  <div class="layout">
    ${newTicketForm()}
    <section class="card" aria-labelledby="list-title">
      <div class="list-head">
        <h2 id="list-title">الطلبات <small>(${num.format(d.tickets.length)})</small></h2>
        ${searchBox}
      </div>
      ${list}
    </section>
  </div>
</main>
<footer class="wrap">نسخة تجريبية للعرض — لا تحتوي أي بيانات حقيقية · فحص الصحة: <bdi class="mono">/health</bdi></footer>`;

  return layout({ title: `طلبات الدعم الفني · v${d.version}`, version: d.version, v2: d.v2, body });
}

function renderError(message, status) {
  return layout({
    title: "طلبات الدعم الفني",
    version: "",
    v2: false,
    body: `<main class="wrap"><section class="card error-page"><h1>${status}</h1><p>${esc(message)}</p><a href="/">العودة للصفحة الرئيسية</a></section></main>`,
  });
}

module.exports = { renderPage, renderError };
