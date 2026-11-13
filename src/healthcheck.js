// فحص صحة الحاوية — يستخدمه HEALTHCHECK داخل الـ Dockerfile
// يرجع 0 لو التطبيق سليم، و1 لو فيه مشكلة
const port = process.env.PORT || 8080;
fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
  .then((r) => process.exit(r.ok ? 0 : 1))
  .catch(() => process.exit(1));
