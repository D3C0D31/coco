# AutoPot Grow – Server ohne Fremdpakete (nur Node 22)
# Für reproduzierbare Builds das Basis-Image auf einen Digest festschreiben, z. B. node:22-alpine@sha256:…
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
WORKDIR /app
# Nur die öffentlich ausgelieferten Dateien und den Server kopieren
COPY server ./server
COPY index.html app.html anleitung.html datenschutz.html impressum.html nutzungsbedingungen.html robots.txt \
     app.js app.css qr.js pow-worker.js anleitung.js theme-init.js site.css site.js sw.js manifest.webmanifest ./
COPY icons ./icons
COPY img ./img
COPY .well-known ./.well-known
RUN mkdir -p /data /backups && chown -R node:node /data /backups
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/server.js"]
