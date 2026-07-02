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

- **`?v=7.5`** baseline (grupos, index, init-db, simular-grupos, diagnostico, ranking-style-only — but ranking's own script is at 7.9).
- `reglas.html` + `js/reglas.js` → **`?v=7.6`** (fase final: marcador incluye prórroga; fix texto predicciones).
- `final.html` + `js/final.js` → **`?v=7.7`** (edit-after-save flow fix + per-user FF override; see §6).
- `admin.html` + `js/admin.js` → **`?v=7.12`** (PDF predicciones: equipos predichos + columna PENALES; see §11. v7.10: ids defensivos para users sin `cedula`/`alias`. v7.11: `permite_editar_final` override + admin UI toggle `window.togglePermiteEditarFinal`; see §6. v7.12: gateo de matchup en scoring F17+ — see §7).
- `ranking.html` + `js/ranking.js` → **`?v=7.10`** (Avance del Torneo + Prob% Monte Carlo; see §11. v7.10: MC scoring replica el gateo de matchup F17+ — see §7).
- Note: `final.js`'s own local imports (`firebase-config/auth/data`) are still at `?v=7.5` — only `final.html` and the `final.js` script tag moved to 7.7. Don't "fix" this unless editing those shared files.
- The footer of each `.html` prints the version string; keep it in sync with the `<script>` tags.
- Only bump the page you're editing — other pages stay at their own version. Don't globally bump unless changing shared code (`data.js`, `auth.js`, `firebase-config.js`).

## 4. Architecture that isn't obvious from filenames

| File | Role / gotchas |
|------|----------------|
| `js/firebase-config.js` | Single Firebase init, exports `db`. API key hardcoded (public, open rules). |
| `js/auth.js` | Custom client-side auth via `localStorage` key `polla_user`. Hardcoded admin: `ADMIN_USER="ADMIN"`, `ADMIN_PASS="Mirador12345"`. Admin session stores `alias:"Administrador"` (not `"ADMIN"`). |
| `js/data.js` | Source of truth: 48 teams in 12 groups, flag ISO codes, fixture generators, `calcularTablaGrupo`, `seleccionarMejoresTerceros`. |
| `js/admin.js` | ~2650 lines, biggest file. Owns result entry, phase generation, point recalc, user/institution management, ZIP/PDF export. Find the specific function before editing (`recalcularTodosLosPuntos` @445, `guardarRondaActual`, `btn-generar-fase-final`, `calcularEquiposPredichosUsuario` @1766, `window.togglePermiteEditarFinal` @174, etc.). |
| `js/final.js` | Participant bracket wizard + visual bracket modal. See §6 for the edit-after-save flow. |
| `js/grupos.js` | Group predictions page. |
| `js/ranking.js` | Real-time rankings + Avance del Torneo + Prob% Monte Carlo on Fase Final (see §11). Admin-specific tabs rely on `user.alias === 'ADMIN'` — see §9 inconsistency. |
| `init-db.html` | One-shot DB seeder: 72 group matches, 32 final matches (with placeholders), instituion `GDR`, `config/app_config`. Has a known bug (~line 142) referencing undefined `instituciones` in a success message. |
| `diagnostico.html` | Firebase connection test. **Duplicates Firebase config inline** — keep in sync with `js/firebase-config.js` on any migration. |
| `simular-grupos.html` | Creates 5 fake users (`SIM001`–`SIM005`) with random group predictions. |
| `GEMINI.md` | **STALE.** Documents obsolete scoring (bonus points per round, subcampeón, campeón). Ignore for scoring; trust `reglas.html` + `admin.js` (see §7). |
| `firestore_final*.json`, `reporte_verificacion.json` | Repo-root data snapshots, not part of runtime. |

## 5. Firestore collections

| Collection | Doc ID pattern | Notes |
|------|----------------|-------|
| `partidos_grupos` | `{grupo}{num}` (A1, A2, …) | 72 docs. Fields: `grupo, equipo1, equipo2, goles_equipo1, goles_equipo2, jugado, fecha`. |
| `partidos_final` | `F1` … `F32` | 32 docs. Fields: `ronda, numero, equipo1, equipo2, goles_equipo1, goles_equipo2, penales_equipo1, penales_equipo2, jugado, ganador, source_equipo1, source_equipo2, perdedor_source1, perdedor_source2`. **All 32 are created during `init-db`**, not by "Generar Fase Final" — that step only **updates** F1–F16 with real group finishers. F17–F32 keep placeholders like `Ganador F1`, `Perdedor F29`. |
| `predicciones_grupos` | `{cedula}_{alias}_{institucion}_{partidoId}` | Filter edits/deletes by `user_id + institucion + partido_id`; **doc ID always includes the active institution**. |
| `predicciones_final` | same pattern as grupos | Same ID convention. `prediccion_ganador` stores the team **name string** — renaming a team in admin breaks comparisons. |
| `users` | `{cedula}_{alias}` | Has `instituciones[]`, `institucion_activa`, `puntos_fase_grupos`, `puntos_fase_final`, `puntos_total`, and optional `permite_editar_final` (bool, default false) — per-user FF edit override granted by admin (see §6). |
| `instituciones` | UPPER ID (`GDR`) | Has `activo` flag; **`index.html` currently does NOT filter inactives** out of the login dropdown. |
| `config/app_config` | `app_config` | `fase_actual`, `fase_final_habilitada`, `predicciones_grupos_abiertas`, `predicciones_final_abiertas`. Missing flags default to `true`. |

**Batch writes:** keep Firestore batches ≤ 400 ops (admin uses 400). Use `writeBatch` and commit in chunks for any bulk operation.

## 6. Final-phase prediction flow (recently fixed — read before touching `js/final.js`)

- The bracket is a 6-step wizard (dieciseisavos → final + tercer lugar). Teams from octavos on are computed **from the participant's own predictions** via `recalcularTodosEquipos`.
- Two save buttons: **"Guardar Progreso"** (partial, always available) and **"Finalizar y Guardar Todo"** (requires all 32 valid). Neither locks editing — inputs stay editable while `predicciones_final_abiertas === true`.
- **Per-user override (`permite_editar_final`, v7.7/v7.11):** an admin can set `permite_editar_final: true` on a `users` doc via the admin UI toggle `window.togglePermiteEditarFinal` (admin.js ~@174). When set, `final.js:checkFaseFinal` sets `overrideUsuario = true` (final.js ~@82) and the participant can edit/enter Fase Final predictions **ignoring** `fase_final_habilitada`, `predicciones_final_abiertas`, and per-match `jugado` locks (intended for recovery from DB errors). After granting it, the admin must re-run `recalcularTodosLosPuntos()` from the panel.
- **Editing after save propagates:** `handleInputChange` marks the edited partido AND all its transitive dependents (via `mapaDependencias`, built from `source_equipo1/2`) as "dirty" (removed from `prediccionesGuardadasIds`, `.ganador` cleared), then `recalcularTodosEquipos` runs before refreshing card visuals so badges use fresh `equiposCalculados`. The next "Guardar Progreso" overwrites those docs in Firestore.
- "Guardar Progreso" is always available; the misleading "NO podrás editarlas nunca más" confirm on "Finalizar" has been removed.
- Don't unconditionally call `renderizarRondaActual()` on every keystroke — it loses input focus. Only re-render when the edited party's ronda index is `< rondaActualIndex`.
- The third-place match `F31` depends on the **losers** of F29/F30 via `perdedor_source1/2`. Any dependency-walking code must consult the source fields, not just `NEXT_MATCH_MAP` (which only tracks winner-side progression and is used by the bracket modal).

## 7. Scoring rules (the source of truth)

Implemented in `admin.js:recalcularTodosLosPuntos()` and documented in `reglas.html`. They are **simplified** since commit `466e902` — ignore any older doc that mentions per-round bonuses, subcampeón, or campeón bonuses.

**Fase de Grupos (`admin.js:504-506`):**
- Marcador exacto: **3 pts**.
- Acierta ganador o empate (no exacto): **1 pt**.

**Fase Final (`admin.js:619-627`):**
- Marcador exacto del partido (el admin ingresa el resultado final; en fase final eso incluye la prórroga si la hubo): **3 pts**.
- Acierta ganador/empate del partido (no exacto): **1 pt**.
- Acierta el equipo clasificado (`pred.prediccion_ganador === realGanador`): **1 pt**.
- **Cap 4 pts por partido.**
- Penales solo desempatan al clasificado; no suman.
- **Gateo por matchup (v7.12), solo F17+ (octavos → final + tercer lugar):** los dos primeros puntos (marcador exacto y acierto ganador/empate) **solo se otorgan si los equipos que realmente jugaron el partido coinciden con los que el usuario predijo** (resueltos via `calcularEquiposPredichosUsuario`, comparación posicional eq1/eq2). Si el matchup real ≠ matchup predicho, esos dos puntos se anulan y solo sobrevive el 1 pt por acertar el clasificado (nombre). F1–F16 (dieciseisavos) siempre tienen matchup coincidente (equipos reales del grupo), así que ahí aplica el scoring normal. El Monte Carlo de `ranking.js` (`scorePartidoFinalMC`) replica este gateo exactamente.
- **La regla es latente:** solo se evalúa sobre `partidos_final` con `jugado === true`. Mientras ningún F17+ esté jugado (p.ej. toda la fase de dieciseisavos), `recalcularTodosLosPuntos()` produce los mismos `puntos_fase_final` que antes. El gateo empieza a tener efecto cuando el admin marque jugados los primeros octavos y el recálculo se dispare.
- **v7.12:** `reglas.html`/`js/reglas.js` **NO** se actualizaron — el usuario prefirió comunicar la regla nueva por WhatsApp en vez de tocar la leyenda pública. La regla vive solo en el código (`admin.js`, `ranking.js`) y en este archivo. No "corrijas" la leyenda pública sin pedirlo.

If you change scoring, update `admin.js` (y `ranking.js` para mantener MC sincronizado) y este archivo — y bump el cache. `reglas.html` es la leyenda pública; edítala solo si el usuario lo pide (en v7.12 no se tocó).

## 8. Conventions

- **Language:** Spanish for variables, functions, comments, UI strings.
- **Indent:** 2 spaces (HTML, CSS, JS).
- **Filenames:** lowercase kebab-case.
- **ES modules** mandatory. Local imports use relative paths with `?v=N`; Firebase imports use full gstatic CDN URLs (`https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js`).
- Predicciones doc IDs: `{cedula}_{alias}_{institucion}_{partidoId}`. If you change ID generation, update edits/deletes in `admin.js`, `grupos.js`, `final.js`, `ranking.js`.
- Don't commit secrets; the Firebase API key is intentionally public (open rules project).
- `jsPDF` (used only in admin export) has no custom fonts — tildes/ñ may render wrong in PDF exports.

## 9. Known inconsistencies (verify before "fixing")

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

## 11. PDF export + Ranking Monte Carlo (recently added)

### PDF de Predicciones (`admin.js` "Exportar todo a PDF" → ZIP)
- The PDF Fase Final table can't read team names from `partidos_final.equipo1/2` for F17+ (those are placeholders like `"Ganador F1"`). Instead, `calcularEquiposPredichosUsuario(prediccionesArr, partidosFinalArr)` (admin.js ~line 1766) **recursively resolves each participant's predicted teams** from their own `predicciones_final` docs — same algorithm as `final.js:recalcularTodosEquipos` but read-only.
- **Gotcha:** when building `partidosFinalMap` for the PDF (admin.js ~line 1907), each entry **must** include the doc `id`: `partidosFinalMap[d.id] = { id: d.id, ...d.data() }`. The `id` is what the resolver indexes by; omitting it silently breaks F17+ resolution back to placeholders.
- PDF Fase Final table has 4 columns: `RONDA / PARTIDO | MARCADOR | PENALES | GANADOR`. Penales column shows `"-"` if the user didn't input penalty scores.
- This is **display-only** — it never writes to Firestore or affects scoring. The real `recalcularTodosLosPuntos` (admin.js:445) is untouched.

### Ranking Prob% (`ranking.html` + `js/ranking.js` at `?v=7.9`)
- New `<div id="avance-torneo">` above the rankings: `(jugados_grupos + jugados_final) / 104 × 100`, with a progress bar. Refreshes via `onSnapshot` on both `partidos_grupos` and `partidos_final`.
- New `Prob%` column in the **Fase Final** table only (not grupos). Computed by `calcularProbabilidadesMC()` — a Monte Carlo over 1000 iterations:
  - **Baseline fixed** = `user.puntos_fase_final || 0` (Fase Final only; **does not mix grupos** — confirmed split).
  - Each iteration: for each `partidos_final` with `jugado !== true`, sample goles 0-3 (independent) and penales 0-5 if tied. Resolves F17+ teams via `resolverEquipoRealMC`+`getGanadorRealMC`+`scorePartidoFinalMC` — **exact replicas of admin.js:535-627** (`resolverEquipoReal`/`getGanadorReal`/scoring inside `recalcularTodosLosPuntos`) operating on the sampled state.
  - User's simulated pts = `baseline + Σ_{no jugados} scorePartidoFinalMC(sampledMatch, predUser)`.
  - Whoever is max → +1 to `contadorGanador[uid]`. Ties broken uniform-random.
  - `prob[uid] = contadorGanador[uid] / 1000 × 100`. Sum across users ≈ 100%.
- **Execution chunked** (50 iter/frame via `setTimeout(0)`) so the spinner in the Prob% cell doesn't freeze the UI. Takes ~1-3s.
- **Real-time refresh**: `onSnapshot(collection(db,'partidos_final'))` marks `mcDirty` and re-runs MC automatically when the admin saves any result. Also a manual "🔄 Recalcular probabilidades" button.
- **Edge case — all 32 final matches already played** → MC short-circuits: 100% to the #1 (split evenly on puntos ties), 0% to the rest.
- **Edge case — user has no `predicciones_final` for a not-played match** → contributes 0 pts for that match in every iteration.
- Prob% cell color-codes: green ≥50%, accent ≥20%, yellow ≥5%, orange >0%, grey =0%.
- MC scoring was validated against admin.js scoring with a Node script (10 synthetic users × 100 iter): leader comfortable → ~100%, equal baselines + opposing preds → ~50/50, stragger → 0%, tournament complete → 100% to #1.
- **Don't** mix `puntos_fase_grupos` into the MC baseline — the user explicitly wants the two phases tracked separately.

---

Última actualización: 2026-07-01 (§3 v7.12 admin + v7.10 ranking; §7 gateo por matchup F17+ v7.12 — regla latente, `reglas.html` NO tocada por decisión del usuario; MC de `ranking.js` replica el gateo). Sección previa §6 v7.7/v7.11 `permite_editar_final` sigue vigente.