// data.js - Fixture completo del Mundial 2026

export const GRUPOS = {
  A: ["México", "Sudáfrica", "Corea del Sur", "República Checa"],
  B: ["Canadá", "Bosnia y Herzegovina", "Catar", "Suiza"],
  C: ["Brasil", "Marruecos", "Haití", "Escocia"],
  D: ["Estados Unidos", "Paraguay", "Australia", "Turquía"],
  E: ["Alemania", "Curazao", "Costa de Marfil", "Ecuador"],
  F: ["Países Bajos", "Japón", "Suecia", "Túnez"],
  G: ["Bélgica", "Egipto", "Irán", "Nueva Zelanda"],
  H: ["España", "Cabo Verde", "Arabia Saudí", "Uruguay"],
  I: ["Francia", "Senegal", "Irak", "Noruega"],
  J: ["Argentina", "Argelia", "Austria", "Jordania"],
  K: ["Portugal", "Jamaica", "Uzbekistán", "Colombia"],
  L: ["Inglaterra", "Croacia", "Ghana", "Panamá"]
};

// Códigos ISO para banderas (flagcdn.com)
export const BANDERAS = {
  "México": "mx",
  "Sudáfrica": "za",
  "Corea del Sur": "kr",
  "República Checa": "cz",
  "Canadá": "ca",
  "Bosnia y Herzegovina": "ba",
  "Catar": "qa",
  "Suiza": "ch",
  "Brasil": "br",
  "Marruecos": "ma",
  "Haití": "ht",
  "Escocia": "gb-sct",
  "Estados Unidos": "us",
  "Paraguay": "py",
  "Australia": "au",
  "Turquía": "tr",
  "Alemania": "de",
  "Curazao": "cw",
  "Costa de Marfil": "ci",
  "Ecuador": "ec",
  "Países Bajos": "nl",
  "Japón": "jp",
  "Suecia": "se",
  "Túnez": "tn",
  "Bélgica": "be",
  "Egipto": "eg",
  "Irán": "ir",
  "Nueva Zelanda": "nz",
  "España": "es",
  "Cabo Verde": "cv",
  "Arabia Saudí": "sa",
  "Uruguay": "uy",
  "Francia": "fr",
  "Senegal": "sn",
  "Irak": "iq",
  "Noruega": "no",
  "Argentina": "ar",
  "Argelia": "dz",
  "Austria": "at",
  "Jordania": "jo",
  "Portugal": "pt",
  "Jamaica": "jm",
  "Uzbekistán": "uz",
  "Colombia": "co",
  "Inglaterra": "gb-eng",
  "Croacia": "hr",
  "Ghana": "gh",
  "Panamá": "pa"
};

// Genera los 6 partidos de cada grupo
export function generarPartidosGrupos() {
  const partidos = [];
  let id = 1;
  
  for (const [grupo, equipos] of Object.entries(GRUPOS)) {
    // Fecha 1: 1vs2, 3vs4
    partidos.push({ id: `G${id++}`, grupo, equipo1: equipos[0], equipo2: equipos[1], goles_equipo1: null, goles_equipo2: null, jugado: false, fecha: 1 });
    partidos.push({ id: `G${id++}`, grupo, equipo1: equipos[2], equipo2: equipos[3], goles_equipo1: null, goles_equipo2: null, jugado: false, fecha: 1 });
    // Fecha 2: 1vs3, 2vs4
    partidos.push({ id: `G${id++}`, grupo, equipo1: equipos[0], equipo2: equipos[2], goles_equipo1: null, goles_equipo2: null, jugado: false, fecha: 2 });
    partidos.push({ id: `G${id++}`, grupo, equipo1: equipos[1], equipo2: equipos[3], goles_equipo1: null, goles_equipo2: null, jugado: false, fecha: 2 });
    // Fecha 3: 1vs4, 2vs3
    partidos.push({ id: `G${id++}`, grupo, equipo1: equipos[0], equipo2: equipos[3], goles_equipo1: null, goles_equipo2: null, jugado: false, fecha: 3 });
    partidos.push({ id: `G${id++}`, grupo, equipo1: equipos[1], equipo2: equipos[2], goles_equipo1: null, goles_equipo2: null, jugado: false, fecha: 3 });
  }
  
  return partidos;
}

// Estructura de la fase final (16 partidos - Round of 32)
// Placeholders genéricos según clasificación FIFA 2026 (12 grupos, 8 mejores terceros)
// El administrador puede editar los equipos reales desde el panel de admin.
export function generarPartidosFinal() {
  return [
    { id: "F1",  ronda: "dieciseisavos", numero: 1,  equipo1: "1A", equipo2: "3C", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F2",  ronda: "dieciseisavos", numero: 2,  equipo1: "1B", equipo2: "3A", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F3",  ronda: "dieciseisavos", numero: 3,  equipo1: "1C", equipo2: "3D", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F4",  ronda: "dieciseisavos", numero: 4,  equipo1: "1D", equipo2: "3B", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F5",  ronda: "dieciseisavos", numero: 5,  equipo1: "1E", equipo2: "3F", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F6",  ronda: "dieciseisavos", numero: 6,  equipo1: "1F", equipo2: "3E", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F7",  ronda: "dieciseisavos", numero: 7,  equipo1: "1G", equipo2: "3H", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F8",  ronda: "dieciseisavos", numero: 8,  equipo1: "1H", equipo2: "3G", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F9",  ronda: "dieciseisavos", numero: 9,  equipo1: "1I", equipo2: "3K", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F10", ronda: "dieciseisavos", numero: 10, equipo1: "1J", equipo2: "3I", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F11", ronda: "dieciseisavos", numero: 11, equipo1: "1K", equipo2: "3L", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F12", ronda: "dieciseisavos", numero: 12, equipo1: "1L", equipo2: "3J", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F13", ronda: "dieciseisavos", numero: 13, equipo1: "2A", equipo2: "2B", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F14", ronda: "dieciseisavos", numero: 14, equipo1: "2C", equipo2: "2D", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F15", ronda: "dieciseisavos", numero: 15, equipo1: "2E", equipo2: "2F", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
    { id: "F16", ronda: "dieciseisavos", numero: 16, equipo1: "2G", equipo2: "2H", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null },
  ];
}
