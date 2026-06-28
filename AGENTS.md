# AGENTS.md — Polla Mundialista 2026

Compact guide for code agents. Read this before touching anything.

---

## 1. What this project is

Static frontend (no build, no framework) for a World Cup 2026 prediction pool (48 teams, 12 groups, 32-team knockout bracket). Spanish UI. Vanilla HTML/CSS/JS (ES modules). Backend is Firebase Firestore, consumed directly from the client via CDN SDK v10.12.2.

**There is no `package.json`, no Node tooling, no build step, no tests, no linter.** Don't add bundlers, frameworks, or npm deps unless the user explicitly asks.

## 2. Commands / verification

- **Serve locally:** `python -m http.server 8080` from repo root (needs internet for Firebase/CDN).
- **No tests / lint / typecheck.** Verification is manual via three dev pages (`init-db.html`, `diagnostico.html`, `simular-grupos.html`). Read §7 before editing them.
- **Syntax sanity check for a JS module:** copy to a `.mjs` temp file and run `node --check path.mjs` (works because imports are URLs/relative that Node ignores on `--check`).

## 3. Cache busting (critical)

Every HTML `<link>`/`<script>` and every local JS `import` appends `?v=N`. Imports of remote Firebase/CDN URLs do **not** take a version. Bump the version in **all** `?v=` occurrences when making structural changes.

- Current version: **`?v=7.5`** baseline.
- `final.html` + `js/final.js` are at **`?v=7.6`** (bumped after the final-phase edit-flow fix; see §6).
- Bump everything together on the next structural change to stay consistent.
- The footer of each `.html` prints the version string; keep it in sync with the `<script>` tags.

## 4. Architecture that isn't obvious from filenames

| File | Role / gotchas |
|------|----------------|
| `js/firebase-config.js` | Single Firebase init, exports `db`. API key hardcoded (public, open rules). |
| `js/auth.js` | Custom client-side auth via `localStorage` key `polla_user`. Hardcoded admin: `ADMIN_USER="ADMIN"`, `ADMIN_PASS="Mirador12345"`. Admin session stores `alias:"Administrador"` (not `"ADMIN"`). |
| `js/data.js` | Source of truth: 48 teams in 12 groups, flag ISO codes, fixture generators, `calcularTablaGrupo`, `seleccionarMejoresTerceros`. |
| `js/admin.js` | ~2400 lines, biggest file. Owns result entry, phase generation, point recalc, user/institution management, ZIP/PDF export. Find the specific function before editing (`recalcularTodosLosPuntos`, `guardarRondaActual`, `btn-generar-fase-final`, etc.). |
| `js/final.js` | Participant bracket wizard + visual bracket modal. See §6 for the edit-after-save flow. |
| `js/grupos.js` | Group predictions page. |
| `js/ranking.js` | Real-time rankings; admin-specific tabs rely on `user.alias === 'ADMIN'` — see §9 inconsistency. |
| `init-db.html` | One-shot DB seeder: 72 group matches, 32 final matches (with placeholders), instituion `GDR`, `config/app_config`. Has a known bug (~line 142) referencing undefined `instituciones` in a success message. |
| `diagnostico.html` | Firebase connection test. **Duplicates Firebase config inline** — keep in sync with `js/firebase-config.js` on any migration. |
| `simular-grupos.html` | Creates 5 fake users (`SIM001`–`SIM005`) with random group predictions. |
| `GEMINI.md` | **STALE.** Documents obsolete scoring (bonus points per round, subcampeón, campeón). Ignore for scoring; trust `reglas.html` + `admin.js:561-590`. |
| `firestore_final*.json`, `reporte_verificacion.json` | Repo-root data snapshots, not part of runtime. |

## 5. Firestore collections

| Collection | Doc ID pattern | Notes |
|------|----------------|-------|
| `partidos_grupos` | `{grupo}{num}` (A1, A2, …) | 72 docs. Fields: `grupo, equipo1, equipo2, goles_equipo1, goles_equipo2, jugado, fecha`. |
| `partidos_final` | `F1` … `F32` | 32 docs. Fields: `ronda, numero, equipo1, equipo2, goles_equipo1, goles_equipo2, penales_equipo1, penales_equipo2, jugado, ganador, source_equipo1, source_equipo2, perdedor_source1, perdedor_source2`. **All 32 are created during `init-db`**, not by "Generar Fase Final" — that step only **updates** F1–F16 with real group finishers. F17–F32 keep placeholders like `Ganador F1`, `Perdedor F29`. |
| `predicciones_grupos` | `{cedula}_{alias}_{institucion}_{partidoId}` | Filter edits/deletes by `user_id + institucion + partido_id`; **doc ID always includes the active institution**. |
| `predicciones_final` | same pattern as grupos | Same ID convention. `prediccion_ganador` stores the team **name string** — renaming a team in admin breaks comparisons. |
| `users` | `{cedula}_{alias}` | Has `instituciones[]`, `institucion_activa`, `puntos_fase_grupos`, `puntos_fase_final`, `puntos_total`. |
| `instituciones` | UPPER ID (`GDR`) | Has `activo` flag; **`index.html` currently does NOT filter inactives** out of the login dropdown. |
| `config/app_config` | `app_config` | `fase_actual`, `fase_final_habilitada`, `predicciones_grupos_abiertas`, `predicciones_final_abiertas`. Missing flags default to `true`. |

**Batch writes:** keep Firestore batches ≤ 400 ops (admin uses 400). Use `writeBatch` and commit in chunks for any bulk operation.

## 6. Final-phase prediction flow (recently fixed — read before touching `js/final.js`)

- The bracket is a 6-step wizard (dieciseisavos → final + tercer lugar). Teams from octavos on are computed **from the participant's own predictions** via `recalcularTodosEquipos`.
- Two save buttons: **"Guardar Progreso"** (partial, always available) and **"Finalizar y Guardar Todo"** (requires all 32 valid). Neither locks editing — inputs stay editable while `predicciones_final_abiertas === true`.
- **Editing after save propagates:** `handleInputChange` marks the edited partido AND all its transitive dependents (via `mapaDependencias`, built from `source_equipo1/2`) as "dirty" (removed from `prediccionesGuardadasIds`, `.ganador` cleared), then `recalcularTodosEquipos` runs before refreshing card visuals so badges use fresh `equiposCalculados`. The next "Guardar Progreso" overwrites those docs in Firestore.
- "Guardar Progreso" is always available; the misleading "NO podrás editarlas nunca más" confirm on "Finalizar" has been removed.
- Don't unconditionally call `renderizarRondaActual()` on every keystroke — it loses input focus. Only re-render when the edited party's ronda index is `< rondaActualIndex`.
- The third-place match `F31` depends on the **losers** of F29/F30 via `perdedor_source1/2`. Any dependency-walking code must consult the source fields, not just `NEXT_MATCH_MAP` (which only tracks winner-side progression and is used by the bracket modal).

## 7. Scoring rules (the source of truth)

Implemented in `admin.js:recalcularTodosLosPuntos()` and documented in `reglas.html`. They are **simplified** since commit `466e902` — ignore any older doc that mentions per-round bonuses, subcampeón, or campeón bonuses.

**Fase de Grupos (`admin.js:461-463`):**
- Marcador exacto: **3 pts**.
- Acierta ganador o empate (no exacto): **1 pt**.

**Fase Final (`admin.js:574-587`):**
- Marcador exacto a 90 min: **3 pts**.
- Acierta ganador/empate a 90 min (no exacto): **1 pt**.
- Acierta el equipo clasificado (`pred.prediccion_ganador === realGanador`): **1 pt**.
- **Cap 4 pts por partido.**
- Penales solo desempatan al clasificado; no suman.

If you change scoring, update `reglas.html`, `admin.js`, and this file together — and bump the cache version.

## 8. Conventions

- **Language:** Spanish for variables, functions, comments, UI strings.
- **Indent:** 2 spaces (HTML, CSS, JS).
- **Filenames:** lowercase kebab-case.
- **ES modules** mandatory. Local imports use relative paths with `?v=N`; Firebase imports use full gstatic CDN URLs (`https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js`).
- Predicciones doc IDs: `{cedula}_{alias}_{institucion}_{partidoId}`. If you change ID generation, update edits/deletes in `admin.js`, `grupos.js`, `final.js`, `ranking.js`.
- Don't commit secrets; the Firebase API key is intentionally public (open rules project).
- `jsPDF` (used only in admin export) has no custom fonts — tildes/ñ may render wrong in PDF exports.

## 9. Known inconsistencies (verify before "fixing")

- `reglas.html` says "Las predicciones se cierran al guardar" — **false**: code never locks predictions after save; only `predicciones_*_abiertas` (admin toggles) or `jugado` per match disables inputs.
- `ranking.js` gates admin tabs by `user.alias === 'ADMIN'`, but admin session stores `alias: 'Administrador'` — admin-specific ranking UI never shows. Intentional or not is unclear.
- `index.html` loads **all** institutions without filtering `activo !== false`.
- `init-db.html` imports `./js/firebase-config.js` **without `?v=N`** — cache-bust inconsistency.
- `GEMINI.md` scoring section is stale (see §4). Don't trust it.

## 10. Manual test flow

1. `init-db.html` → seed DB.
2. `index.html` → login as participant (or `ADMIN` / `Mirador12345` for admin).
3. `grupos.html` → fill 72 group predictions.
4. `admin.html` → enter real group results, then **Generar Fase Final** (updates F1–F16), then enable `fase_final_habilitada`.
5. `final.html` → complete the 6-step bracket; "Guardar Progreso" repeatedly; edit freely until the phase closes.
6. `admin.html` → enter final results; `recalcularTodosLosPuntos()` runs automatically.
7. `ranking.html` → verify points.

When making JS changes to a page, bump that page's `?v=` (and any inline imports it owns) rather than asking users to hard-refresh.

---

Última actualización: 2026-06-28.