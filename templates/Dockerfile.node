# syntax=docker/dockerfile:1
# ==================================================================
#  Dockerfile Template — القالب الموحّد لتهيئة بيئة تشغيل التطبيقات
#  مثال: تطبيق Node.js  |  قوالب لغات أخرى داخل مجلد templates/
#
#  القاعدة: لا تغيّر إلا الأسطر المعلَّمة بـ [CHANGE]
#  البناء:  docker build -t <app-name>:<version> .
#  التشغيل: docker run -d -p 8080:8080 <app-name>:<version>
# ==================================================================

# [CHANGE] إصدار الـ runtime — ثبّت الإصدار دائمًا ولا تستخدم latest
ARG NODE_VERSION=22

# ------------------------------------------------------------------
#  المرحلة 1 (deps): تثبيت الاعتماديات فقط
#  نسخ ملفات الاعتماديات أولًا = إعادة استخدام الـ cache وبناء أسرع
# ------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir -p node_modules

# ------------------------------------------------------------------
#  المرحلة 2 (runtime): الصورة النهائية الصغيرة التي تعمل في الإنتاج
#  لا تحتوي أدوات البناء ولا ملفات المصدر غير اللازمة
# ------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime

# [CHANGE] بيانات التطبيق — تُمرَّر وقت البناء: --build-arg APP_VERSION=2.0.0
ARG APP_NAME="Demo App"
ARG APP_VERSION=1.0.0

# بيانات وصفية قياسية (OCI) تظهر في السجل وأدوات الفحص
LABEL org.opencontainers.image.title="${APP_NAME}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.description="Standard container template"

# الإعدادات كمتغيرات بيئة — تتغير وقت التشغيل دون إعادة البناء
ENV NODE_ENV=production \
    PORT=8080 \
    APP_NAME="${APP_NAME}" \
    APP_VERSION="${APP_VERSION}"

WORKDIR /app

# نسخ الاعتماديات الجاهزة + كود التطبيق بملكية مستخدم غير إداري
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
# [CHANGE] مجلد الكود الخاص بتطبيقك
COPY --chown=node:node src ./src

# الأمان: التشغيل بمستخدم عادي (UID 1000) وليس root
USER node

# [CHANGE] المنفذ الذي يستمع عليه التطبيق
EXPOSE 8080

# فحص الصحة: Docker يعرف تلقائيًا إن كان التطبيق سليمًا أم لا
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

# [CHANGE] أمر تشغيل التطبيق (صيغة exec ليصل إشعار الإيقاف للتطبيق مباشرة)
CMD ["node", "src/server.js"]
