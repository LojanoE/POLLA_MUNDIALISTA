# Polla Mundialista 2026

## Project Overview
**Polla Mundialista 2026** is a production-grade web application built to manage a prediction pool for the FIFA World Cup 2026. It supports the expanded 48-team format, featuring 12 groups and complex classification logic (top 2 from each group plus the 8 best third-place teams).

### Core Technologies
- **Frontend:** HTML5, Vanilla CSS3, JavaScript (ESM).
- **Backend:** Firebase (Firestore for real-time data, Authentication for user management).
- **External APIs:** [FlagCDN](https://flagcdn.com/) for team flags.

---

## Tournament Structure & Logic
The application strictly follows the official FIFA 2026 format:
- **Group Stage:** 12 groups (A-L) of 4 teams each.
- **Round of 32 (Dieciseisavos):** 32 teams (12 winners, 12 runners-up, 8 best thirds).
- **Bracket Progression:** Fixed path from Dieciseisavos to the Final, including a Third-Place match.

### Key Logic Files
- `js/data.js`: Contains the source of truth for teams, groups, match generation, and bracket placeholders.
- `js/admin.js`: Handles the orchestration of phases, point recalculation, and manual bracket adjustments.
- `js/auth.js`: Manages user sessions and institutional filtering (e.g., GDR).

---

## Scoring Rules
The scoring system is designed to reward both precision and overall tournament knowledge:

### Etapa 1 (Fase de Grupos)
- **3 Puntos:** Marcador exacto.
- **1 Punto:** Acertar ganador o empate (resultado pero no marcador).
- **1 Punto:** Por cada equipo que clasifica a dieciseisavos.
- **1 Punto:** Por cada equipo en la posición exacta del grupo (1º o 2º).

### Etapa 2 (Fase Final)
- **3 Puntos:** Marcador exacto (90 min).
- **1 Punto:** Ganador o empate (90 min).
- **1 Punto:** Por cada avance de ronda (acertar equipo en Octavos, Cuartos, Semis o Final).
- **2 Puntos:** Por acertar al Subcampeón.
- **4 Puntos:** Por acertar al Campeón.

---

## Development & Operations

### Initialization
Before the tournament starts, the database must be seeded:
1. Open `init-db.html` or use the Admin Panel.
2. Click **"🚀 Cargar Partidos"** to populate Firestore with the 48-team fixture.

### Administrative Workflow
1. **Result Entry:** Admins enter real scores in the Admin Panel.
2. **Phase Transition:** After groups, click **"⚙️ Generar Fase Final"** to calculate classified teams.
3. **Manual Overrides:** The Round of 32 supports manual team selection via a visual picker with flags in case of specific seeding requirements.
4. **Point Recalculation:** Points are automatically recalculated whenever a result is saved.

### Styling Conventions
- **Theming:** Modern Dark Mode using CSS variables (`--bg-card`, `--accent`, etc.).
- **Responsiveness:** Grid and Flexbox layouts adapted for mobile predictions.

---

## TODOs & Future Enhancements
- [ ] Implement automated real-time score fetching via a Sports API.
- [ ] Add a "Global vs Institution" toggle for the ranking view.
- [ ] Implement push notifications for match results.
