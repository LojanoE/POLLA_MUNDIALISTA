# AGENTS.md — Polla Mundialista 2026

## What this repo is
Vanilla HTML/CSS/JS frontend for a soccer-prediction pool. No build step, no package.json. Firebase Firestore is the only backend.

## Tech stack
- **Frontend:** Static HTML pages, vanilla JS ES modules, CSS custom properties
- **Backend:** Firebase Firestore via JS SDK v10.12.2 (CDN imports)
- **Auth:** Custom (not Firebase Auth). Stores session in `localStorage` as `polla_user`. Verifies cedula+alias against Firestore `users` collection.
- **Deployment:** Static hosting (Netlify / GitHub Pages). Just serve the repo root.

## Project structure
| File | Purpose |
|------|---------|
| `index.html` | Login (cedula + alias) and admin login toggle |
| `grupos.html` + `js/grupos.js` | Participants predict group-stage match scores |
| `final.html` + `js/final.js` | Participants predict knockout-stage scores + penalties + winner |
| `admin.html` + `js/admin.js` | Admin enters real results, edits knockout teams, enables final phase, recalculates scores |
| `ranking.html` + `js/ranking.js` | Live leaderboard (onSnapshot listener) |
| `init-db.html` | One-time setup page that seeds Firestore with all matches and config |
| `js/firebase-config.js` | Hardcoded Firebase config (public web API key) |
| `js/auth.js` | Session helpers. Admin creds: `ADMIN` / `Mirador12345` |
| `js/data.js` | 48 teams in 12 groups, ISO flag codes, fixture generators |

## Critical workflow
1. **First time only:** Open `init-db.html` in a browser and click the init button. This writes:
   - `partidos_grupos` (72 matches)
   - `partidos_final` (16 matches with placeholder names like `1A`, `3C`)
   - `config/app_config` (`fase_final_habilitada: false`)
2. Admin must later **edit the placeholder team names** in `partidos_final` from the admin panel before the knockout phase starts.
3. Admin toggles **"Habilitar Fase Final"** in `admin.html` to let participants access `final.html`.
4. After entering real results, admin clicks **"Recalcular Puntajes"** to update all user scores.

## Firebase rules note
Firestore security rules are not enforced here. The app relies on custom auth logic in JS and open read/write rules for simplicity. If you tighten rules, ensure `partidos_grupos`, `partidos_final`, `predicciones_grupos`, `predicciones_final`, `users`, and `config` are all accessible to authenticated client logic.

## Scoring rules (lives in `js/admin.js`)
**Groups**
- Exact score: 3 pts
- Correct winner or draw (not exact): 1 pt

**Knockout**
- Exact 90-min score: 3 pts
- Correct draw in 90 min (any score): 1 pt
- Correct winner in 90 min (not exact): 1 pt
- Exact penalty shootout score: 3 pts
- Correct penalty winner (not exact): 1 pt
- Correct advancing team: 1 pt
- Max per match: 4 pts (exact 90-min + advancing)

## Module loading quirks
All JS files are ES modules using `import` with:
- Relative paths for local modules (`./firebase-config.js`, `./auth.js`, `./data.js`)
- Full CDN URLs for Firebase SDK (`https://www.gstatic.com/firebasejs/10.12.2/...`)

Pages reference scripts with `<script type="module" src="...">`.

## What not to add
- Do NOT add a build tool, bundler, or framework unless explicitly requested.
- Do NOT change the auth model to Firebase Auth; the custom cedula/alias system is intentional.
- Do NOT modify `firebase-config.js` unless migrating to a different Firebase project.
