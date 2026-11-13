# القوالب الجاهزة (Dockerfile Templates)

اختر القالب المناسب للغة تطبيقك، انسخه إلى جذر مشروعك باسم `Dockerfile`، وغيّر الأسطر المعلَّمة بـ `[CHANGE]` فقط.

| نوع التطبيق | القالب | حالة الاختبار |
|---|---|---|
| Node.js (Express / NestJS) | `Dockerfile.node` | تم البناء والتشغيل ✓ |
| Python (Flask / FastAPI / Django) | `Dockerfile.python` | تم البناء والتشغيل ✓ |
| واجهات (Angular / React / Vue / Flutter Web) | `Dockerfile.frontend` | تم البناء والتشغيل ✓ |
| .NET (ASP.NET Core) | `Dockerfile.dotnet` | فحص صياغة فقط — يُختبر على أول تطبيق .NET |
| Java (Spring Boot + Maven) | `Dockerfile.java` | فحص صياغة فقط — يُختبر على أول تطبيق Java |

## القواعد العشر الموحّدة (تلتزم بها كل القوالب)

1. صورة أساس رسمية بإصدار مثبّت — لا `latest` أبدًا.
2. بناء على مرحلتين (Multi-stage): أدوات البناء لا تدخل صورة الإنتاج.
3. نسخ ملفات الاعتماديات قبل الكود لتسريع البناء.
4. التشغيل بمستخدم غير إداري (non-root).
5. لا كلمات مرور ولا مفاتيح داخل الصورة — الأسرار تُمرَّر وقت التشغيل.
6. ملف `.dockerignore` في كل مشروع.
7. كل الإعدادات من متغيرات البيئة (ENV).
8. فحص صحة (`/health` + `HEALTHCHECK`).
9. السجلات تُكتب على الشاشة (stdout) لا في ملفات داخل الحاوية.
10. عملية واحدة لكل حاوية، وبيانات وصفية (LABEL) تحمل رقم الإصدار.

## خطوات استخدام القالب

```bash
cp templates/Dockerfile.python ./Dockerfile      # 1. انسخ القالب
# 2. عدّل أسطر [CHANGE]
docker build -t my-app:1.0.0 .                    # 3. ابنِ الصورة
docker run -d -p 8080:8080 my-app:1.0.0           # 4. شغّل
curl http://localhost:8080/health                 # 5. تأكد
```
