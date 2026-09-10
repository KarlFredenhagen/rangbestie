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

## Backend deployen

```bash
cd server
npm install
PORT=3000 npm start
```

Läuft dauerhaft am besten hinter einem Reverse Proxy mit HTTPS (z.B. nginx +
certbot) und einem Prozess-Manager wie `pm2` oder einem systemd-Service, damit
der Server Neustarts übersteht. HTTPS ist nötig, damit die PWA auf Handys
installierbar ist.

Falls das Frontend von einer anderen Adresse ausgeliefert wird (z.B. GitHub
Pages), zusätzlich `CORS_ORIGIN` setzen, sonst blockt der Browser die Anfragen:

```bash
CORS_ORIGIN=https://<user>.github.io PORT=3000 npm start
```

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
den Inhalt von `public/` automatisch bei jedem Push auf `main`. Einmalig in den
Repo-Einstellungen unter **Settings → Pages → Source** auf **GitHub Actions**
umstellen.

## Elo-Details

Siehe [`server/elo.js`](server/elo.js). Startwert: 1000 Elo, K-Faktor 16 pro
virtuellem Duell (änderbar über `kFactor` im `POST /api/sessions`-Request).
