// JavaScript بسيط جدًا — الصفحة تشتغل بدونه، وده بيضيف بس زر "تم الحل" (الإصدار 2)
"use strict";

// نشيل رسالة "تم التسجيل" من الرابط عشان متظهرش تاني عند التحديث
if (/[?&](created|error)=/.test(location.search)) {
  const params = new URLSearchParams(location.search);
  params.delete("created");
  params.delete("error");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-solve]");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ…";
  try {
    const r = await fetch("/api/tickets/" + encodeURIComponent(btn.dataset.solve), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "solved" }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    location.reload();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "تم الحل";
    alert("تعذّر تحديث الطلب، حاول مرة أخرى.");
  }
});
