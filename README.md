# Rangbestie

Elo-Rangliste für wöchentliche Ringerl-Tischtennisrunden. Jede Runde ergibt eine
Platzierung (1., 2., 3. …), daraus wird die Elo-Änderung für jeden Mitspieler
berechnet: jeder Spieler wird virtuell gegen jeden anderen Teilnehmer der Runde
verglichen (besserer Platz = Sieg). Mehr Mitspieler in der Runde bedeuten mehr
virtuelle Duelle und damit mehr Punkte auf dem Spiel.

## Architektur

- **`server/`** – Node/Express-Backend, speichert Spieler & Runden in `server/data.json`.
- **`public/`** – Frontend-PWA (kein Build-Schritt, reines HTML/CSS/JS).

Beide können vom selben Server ausgeliefert werden (Express liefert `public/`
gleich mit aus), oder getrennt: Frontend z.B. auf GitHub Pages, Backend auf einem
eigenen Node-fähigen Server.

## Backend deployen (Docker, mit automatischem HTTPS)

Voraussetzung: Docker + Docker Compose auf dem Server, und die Domain
(`tischtennis.oxibuff.at`) zeigt per DNS-A-Record auf die Server-IP. Ports 80
und 443 müssen von außen erreichbar sein (für die Let's-Encrypt-Zertifikate).

```bash
git clone https://github.com/KarlFredenhagen/rangbestie.git
cd rangbestie
docker compose up -d --build
```

Das startet zwei Container:

- **`app`** – der Node-Server, speichert die Liste auf einem Docker-Volume (übersteht Neustarts/Updates).
- **`caddy`** – Reverse Proxy, der automatisch ein Let's-Encrypt-Zertifikat für die Domain aus [`deploy/Caddyfile`](deploy/Caddyfile) holt und erneuert. Kein manuelles Certbot/Cron nötig.

Domain oder CORS-Ursprung geändert? In [`docker-compose.yml`](docker-compose.yml)
(`CORS_ORIGIN`) und [`deploy/Caddyfile`](deploy/Caddyfile) anpassen, dann:

```bash
docker compose up -d --build
```

Updates einspielen (z.B. nach `git pull`):

```bash
git pull
docker compose up -d --build
```

### Ohne Docker

Geht auch klassisch mit `cd server && npm install && PORT=3000 npm start`,
dann selbst hinter einen Reverse Proxy mit HTTPS stellen (z.B. nginx + certbot)
und mit `pm2` oder einem systemd-Service am Laufen halten. `CORS_ORIGIN`
entsprechend setzen, falls das Frontend von einer anderen Adresse kommt.

## Frontend konfigurieren

In [`public/config.js`](public/config.js) steht die Adresse des Backends:

```js
window.RANGBESTIE_CONFIG = {
  apiBase: "https://tischtennis.oxibuff.at/api",
};
```

- Frontend & Backend auf demselben Server → `apiBase: ""` lassen (nutzt automatisch `/api` auf der aktuellen Adresse).
- Frontend separat gehostet (z.B. GitHub Pages) → volle Backend-Adresse eintragen.

## GitHub Pages

Der Workflow [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) published
den Inhalt von `public/` automatisch bei jedem Push auf `master`. Einmalig in
den Repo-Einstellungen unter **Settings → Pages → Source** auf **GitHub
Actions** umstellen.

## Elo-Details

Siehe [`server/elo.js`](server/elo.js). Startwert: 1000 Elo, K-Faktor 16 pro
virtuellem Duell (änderbar über `kFactor` im `POST /api/sessions`-Request).
