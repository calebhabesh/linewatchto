# schedule-assets (plan 16). Build context: the repository root.
FROM node:24-alpine

# The generators read GTFS tables with unzip; the service tests archives with it.
RUN apk add --no-cache unzip

WORKDIR /app

# The generators, unchanged, and the libraries they and the publish checks share.
COPY scripts/generate-surface-catalog.mjs scripts/generate-go-bus-catalog.mjs scripts/generate-search-index.mjs scripts/
COPY scripts/lib/*.mjs scripts/lib/
COPY services/schedule-assets/server.mjs services/schedule-assets/
COPY services/schedule-assets/lib/ services/schedule-assets/lib/

# The release's own files: the first generation on an empty volume, and the TTC search
# index's station inputs (ttc-catalog.json, ttc-station-bays.json).
COPY frontend/public/assets/linewatch/geographic/ baked/
COPY backend/src/main/resources/regional/go-bus-stops.csv baked/

ENV NODE_ENV=production \
    SCHEDULE_ASSETS_DIR=/srv/schedule \
    SCHEDULE_ASSETS_BAKED_DIR=/app/baked \
    SCHEDULE_ASSETS_SCRIPTS_DIR=/app/scripts \
    SCHEDULE_ASSETS_PORT=8095

# The volume is owned by the image's node user (uid 1000); see docs/production-vps.md.
RUN mkdir -p /srv/schedule && chown node:node /srv/schedule
USER node
VOLUME ["/srv/schedule"]
EXPOSE 8095

CMD ["node", "services/schedule-assets/server.mjs"]
