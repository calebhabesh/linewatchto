FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
RUN mvn -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system linewatch \
    && useradd --system --gid linewatch --home-dir /app --shell /usr/sbin/nologin linewatch

COPY --from=build --chown=linewatch:linewatch /workspace/backend/target/linewatch-backend-0.0.1-SNAPSHOT.jar /app/app.jar

ENV SERVER_PORT=8080
EXPOSE 8080

USER linewatch
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
