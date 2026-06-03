# AGENTS.md — Polla Mundialista 2026

## What this repo is
Vanilla HTML/CSS/JS frontend for a soccer-prediction pool (bracket pool). No build step, no package.json. Firebase Firestore is the only backend.

## Tech stack
- **Frontend:** Static HTML pages, vanilla JS ES modules, CSS custom properties
- **Backend:** Firebase Firestore via JS SDK v10.12.2 (CDN imports)
- **Auth:** Custom (not Firebase Auth). Stores session in `localStorage` as `polla_user`. Verifies cedula+alias+institucion against Firestore `users` collection.
- **Deployment:** Static hosting (Netlify / GitHub Pages). Just serve the repo root.

## Project structure
| File | Purpose |
|------|---------|
| `index.html` | Login (cedula + alias + institucion) and admin login toggle |
| `grupos.html` + `js/grupos.js` | Participants predict group-stage match scores (72 matches, 12 groups) |
| `final.html` + `js/final.js` | **Bracket pool:** Participants predict ALL 32 knockout matches (16avos → 8vos → 4tos → semis → 3er lugar → final). Dynamic team calculation based on user's own predictions. |
| `admin.html` + `js/admin.js` | Admin enters real results, **generates knockout bracket automatically from group results**, enables final phase, recalculates scores, manages users and institutions |
| `ranking.html` + `js/ranking.js` | Live leaderboard (onSnapshot listener), filterable by institution |
| `reglas.html` + `js/reglas.js` | Rules page visible to all users (no auth required) |
| `init-db.html` | One-time setup page that seeds Firestore with all matches, config, and default institution |
| `diagnostico.html` | Firebase connection diagnostic tool |
| `simular-grupos.html` | Dev/test tool: creates 5 simulated users with random group-stage predictions |
| `js/firebase-config.js` | Hardcoded Firebase config (public web API key) |
| `js/auth.js` | Session helpers. Admin creds: `ADMIN` / `Mirador12345` |
| `js/data.js` | 48 teams in 12 groups, ISO flag codes, fixture generators, table calculation, best 3rd-place selection |

## Critical workflow
1. **First time only:** Open `init-db.html` in a browser and click the init button. This writes:
   - `partidos_grupos` (72 matches)
   - `partidos_final` (**32 matches** full bracket: 16avos + 8vos + 4tos + semis + 3er lugar + final)
   - `config/app_config` (`fase_final_habilitada: false`)
   - `instituciones/GDR` (default institution)
2. Admin enters all real group-stage results in `admin.html` (section "⚽ Ingresar Resultados - Fase de Grupos").
3. Admin clicks **"⚙️ Generar Fase Final"**. The system automatically:
   - Calculates group tables (pts, goal diff, goals scored)
   - Identifies 1st, 2nd, 3rd place from each group
   - Selects **8 best third-placed teams** (FIFA criteria: pts → goal diff → goals scored)
   - Fills the 16 Round-of-32 matches with real team names
   - Creates the remaining 16 matches with dynamic placeholders ("Ganador F1", "Perdedor F29")
4. Admin reviews the generated bracket and then toggles **"Habilitar Fase Final"**.
5. Participants access `final.html` and predict **all 32 knockout matches** in one session.
6. Participants fill the entire bracket: 16avos → 8vos → 4tos → semis → 3er lugar → final.
   - Teams in later rounds are calculated dynamically based on the participant's own previous predictions.
   - **All 32 matches must be filled** before the "Save" button becomes enabled.
7. After each real knockout round, admin enters real results and clicks **"🔄 Recalcular Puntajes"**.

## Bracket structure (32 matches)
- **16avos (F1–F16):** 1A vs 3C, 2B vs 2F, etc. (equipos reales)
- **8vos (F17–F24):** F1-winner vs F2-winner, F3-winner vs F4-winner, etc.
- **4tos (F25–F28):** F17-winner vs F18-winner, etc.
- **Semis (F29–F30):** F25-winner vs F26-winner, F27-winner vs F28-winner
- **3er lugar (F31):** F29-loser vs F30-loser
- **Final (F32):** F29-winner vs F30-winner

Each `partidos_final` doc includes `source_equipo1` and `source_equipo2` fields pointing to the previous match ID (e.g., F17's source_equipo1 = "F1"). The 3rd-place match additionally uses `perdedor_source1` / `perdedor_source2` flags to indicate it takes the **loser** of the source semifinal.

## Dynamic team calculation (js/final.js)
When rendering the bracket for a participant:
- **16avos:** Show real team names from the database.
- **8vos and beyond:** Look up the participant's prediction for the source match. If they predicted Team X won F1, then Team X appears as the opponent in F17. If they haven't predicted the source match yet, show placeholder "Ganador F1".
- For the **3rd-place match**, show the **loser** of the source semifinal.
- When a participant changes a 16avos prediction, all downstream matches update in real time.

## Scoring rules (lives in `js/admin.js`)

### Groups
- Exact score: 3 pts
- Correct winner or draw (not exact): 1 pt

### Knockout (per match)
- Exact 90-min score: 3 pts
- Correct draw in 90 min (any score): 1 pt
- Correct winner in 90 min (not exact): 1 pt
- Exact penalty shootout score: 3 pts
- Correct penalty winner (not exact): 1 pt
- Correct advancing team: 1 pt
- Max per match: 4 pts (exact 90-min + advancing)

### Round-progression bonus (based on REAL results)
These are calculated during "Recalcular Puntajes" by simulating the user's bracket and comparing with actual outcomes:
- 1 pt for each team correctly predicted to reach **Round of 16** (octavos)
- 1 pt for each team correctly predicted to reach **Quarterfinals** (cuartos)
- 1 pt for each team correctly predicted to reach **Semifinals** (semis)
- 1 pt for each correctly predicted **Finalist**
- 2 pts for correctly predicted **Runner-up** (subcampeón)
- 4 pts for correctly predicted **Champion** (campeón)

## User management
- **2 aliases per cedula:** A person can register twice with the same cedula but different aliases (max 2). Each alias is a separate ranking entry.
- User ID format: `{cedula}_{alias}` (e.g., "1234567890_Luis")
- Prediction IDs: `{cedula}_{alias}_{partido_id}`
- **Institution required:** Every user must select an `institucion` on login. Users can belong to multiple institutions over time; `institucion_activa` is stored on the user doc and in localStorage.
- Admin can search users by cedula or alias, view all their predictions, delete individual predictions, or delete a user entirely (including all their predictions).

## Admin panel features
- **🗃️ Inicializar Base de Datos:** Load all 72 group + 32 knockout matches, default institution, and config into Firestore.
- **⚠️ Reiniciar Todo:** Delete all matches, predictions, config, and institutions (keep users).
- **⚙️ Generar Fase Final:** Auto-calculate group tables, select best 3rd-placed teams, fill Round-of-32 with real teams.
- **🎮 Control de Fases:** Toggle "Habilitar Fase Final" switch.
- **👥 Gestión de Usuarios:** Search users, view their predictions, edit/delete individual predictions, delete entire users.
- **🏛️ Gestión de Instituciones:** Add/remove/activate institutions. Only active institutions appear in the login dropdown.
- **⚽ Ingresar Resultados - Fase de Grupos:** Enter real scores for all 72 group matches.
- **🏆 Ingresar Resultados - Fase Final:** Enter real scores + penalties for all 32 knockout matches. Admin can also edit team names if needed.
- **🔄 Recalcular Puntajes:** Recalculate all user scores based on real results entered.

## Firebase rules note
Firestore security rules are not enforced here. The app relies on custom auth logic in JS and open read/write rules for simplicity. If you tighten rules, ensure `partidos_grupos`, `partidos_final`, `predicciones_grupos`, `predicciones_final`, `users`, `instituciones`, and `config` are all accessible to authenticated client logic.

## Module loading quirks
All JS files are ES modules using `import` with:
- Relative paths for local modules (`./firebase-config.js`, `./auth.js`, `./data.js`)
- Full CDN URLs for Firebase SDK (`https://www.gstatic.com/firebasejs/10.12.2/...`)

Pages reference scripts with `<script type="module" src="...">`.

## Cache busting / versioning
All CSS and JS references use `?v=7.0` query parameters to force browser refresh during testing. Bump this version (e.g., `?v=7.0` → `?v=7.0`) when making major structural changes to ensure users get the latest files without hard-refreshing.

## What not to add
- Do NOT add a build tool, bundler, or framework unless explicitly requested.
- Do NOT change the auth model to Firebase Auth; the custom cedula/alias/institucion system is intentional.
- Do NOT modify `firebase-config.js` unless migrating to a different Firebase project.
- Do NOT reduce the bracket below 32 matches; the full knockout structure is a core requirement.
