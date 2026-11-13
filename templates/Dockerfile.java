# syntax=docker/dockerfile:1
# ==================================================================
#  قالب Java (Spring Boot + Maven) — نفس قواعد القالب الموحّد
#  لا تغيّر إلا الأسطر المعلَّمة بـ [CHANGE]
# ==================================================================

# [CHANGE] إصدار Java (21 LTS)
ARG JAVA_VERSION=21

# ---------- المرحلة 1: البناء بـ Maven ----------
FROM maven:3.9-eclipse-temurin-${JAVA_VERSION} AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---------- المرحلة 2: صورة التشغيل (JRE فقط) ----------
FROM eclipse-temurin:${JAVA_VERSION}-jre-alpine AS runtime
ARG APP_VERSION=1.0.0
LABEL org.opencontainers.image.version="${APP_VERSION}"
ENV APP_VERSION="${APP_VERSION}" \
    JAVA_OPTS="-XX:MaxRAMPercentage=75"

RUN addgroup -S app && adduser -S -G app -u 1000 app
WORKDIR /app
COPY --from=build --chown=app:app /src/target/*.jar app.jar
USER app

EXPOSE 8080
# [CHANGE] مسار فحص الصحة (Spring Boot Actuator)
HEALTHCHECK --interval=20s --timeout=3s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
