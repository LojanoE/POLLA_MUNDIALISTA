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

// Instituciones por defecto
export function generarInstitucionesPorDefecto() {
  return [
    { codigo: 'GDR', nombre: 'GDR' },
    { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento' }
  ];
}

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

// Estructura completa del bracket de eliminatoria (32 partidos)
// FIFA 2026: 12 grupos, pasan 2 primeros + 8 mejores terceros = 32 equipos
// Bracket: 16avos (16) → 8vos (8) → 4tos (4) → semis (2) → 3erlugar (1) + final (1)
// Los equipos de 16avos son placeholders (1A, 2B, 3C) que el admin reemplaza con equipos reales.
// Los equipos de rondas posteriores se calculan dinámicamente según predicciones/resultados.
export function generarPartidosFinal() {
  const partidos = [];
  
  // ========== 16AVOS (16 partidos) ==========
  partidos.push({ id: "F1",  ronda: "dieciseisavos", numero: 1,  equipo1: "1A", equipo2: "3C", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F2",  ronda: "dieciseisavos", numero: 2,  equipo1: "1B", equipo2: "3A", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F3",  ronda: "dieciseisavos", numero: 3,  equipo1: "1C", equipo2: "3D", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F4",  ronda: "dieciseisavos", numero: 4,  equipo1: "1D", equipo2: "3B", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F5",  ronda: "dieciseisavos", numero: 5,  equipo1: "1E", equipo2: "3F", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F6",  ronda: "dieciseisavos", numero: 6,  equipo1: "1F", equipo2: "3E", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F7",  ronda: "dieciseisavos", numero: 7,  equipo1: "1G", equipo2: "3H", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F8",  ronda: "dieciseisavos", numero: 8,  equipo1: "1H", equipo2: "3G", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F9",  ronda: "dieciseisavos", numero: 9,  equipo1: "1I", equipo2: "3K", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F10", ronda: "dieciseisavos", numero: 10, equipo1: "1J", equipo2: "3I", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F11", ronda: "dieciseisavos", numero: 11, equipo1: "1K", equipo2: "3L", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F12", ronda: "dieciseisavos", numero: 12, equipo1: "1L", equipo2: "3J", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F13", ronda: "dieciseisavos", numero: 13, equipo1: "2A", equipo2: "2B", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F14", ronda: "dieciseisavos", numero: 14, equipo1: "2C", equipo2: "2D", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F15", ronda: "dieciseisavos", numero: 15, equipo1: "2E", equipo2: "2F", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F16", ronda: "dieciseisavos", numero: 16, equipo1: "2G", equipo2: "2H", source_equipo1: null, source_equipo2: null, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  
  // ========== OCTAVOS (8 partidos) ==========
  partidos.push({ id: "F17", ronda: "octavos", numero: 17, equipo1: "Ganador F1", equipo2: "Ganador F2", source_equipo1: "F1", source_equipo2: "F2", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F18", ronda: "octavos", numero: 18, equipo1: "Ganador F3", equipo2: "Ganador F4", source_equipo1: "F3", source_equipo2: "F4", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F19", ronda: "octavos", numero: 19, equipo1: "Ganador F5", equipo2: "Ganador F6", source_equipo1: "F5", source_equipo2: "F6", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F20", ronda: "octavos", numero: 20, equipo1: "Ganador F7", equipo2: "Ganador F8", source_equipo1: "F7", source_equipo2: "F8", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F21", ronda: "octavos", numero: 21, equipo1: "Ganador F9", equipo2: "Ganador F10", source_equipo1: "F9", source_equipo2: "F10", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F22", ronda: "octavos", numero: 22, equipo1: "Ganador F11", equipo2: "Ganador F12", source_equipo1: "F11", source_equipo2: "F12", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F23", ronda: "octavos", numero: 23, equipo1: "Ganador F13", equipo2: "Ganador F14", source_equipo1: "F13", source_equipo2: "F14", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F24", ronda: "octavos", numero: 24, equipo1: "Ganador F15", equipo2: "Ganador F16", source_equipo1: "F15", source_equipo2: "F16", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  
  // ========== CUARTOS (4 partidos) ==========
  partidos.push({ id: "F25", ronda: "cuartos", numero: 25, equipo1: "Ganador F17", equipo2: "Ganador F18", source_equipo1: "F17", source_equipo2: "F18", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F26", ronda: "cuartos", numero: 26, equipo1: "Ganador F19", equipo2: "Ganador F20", source_equipo1: "F19", source_equipo2: "F20", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F27", ronda: "cuartos", numero: 27, equipo1: "Ganador F21", equipo2: "Ganador F22", source_equipo1: "F21", source_equipo2: "F22", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F28", ronda: "cuartos", numero: 28, equipo1: "Ganador F23", equipo2: "Ganador F24", source_equipo1: "F23", source_equipo2: "F24", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  
  // ========== SEMIFINALES (2 partidos) ==========
  partidos.push({ id: "F29", ronda: "semis", numero: 29, equipo1: "Ganador F25", equipo2: "Ganador F26", source_equipo1: "F25", source_equipo2: "F26", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  partidos.push({ id: "F30", ronda: "semis", numero: 30, equipo1: "Ganador F27", equipo2: "Ganador F28", source_equipo1: "F27", source_equipo2: "F28", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  
  // ========== TERCER LUGAR (1 partido) ==========
  partidos.push({ id: "F31", ronda: "tercer_lugar", numero: 31, equipo1: "Perdedor F29", equipo2: "Perdedor F30", source_equipo1: "F29", source_equipo2: "F30", perdedor_source1: true, perdedor_source2: true, goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  
  // ========== FINAL (1 partido) ==========
  partidos.push({ id: "F32", ronda: "final", numero: 32, equipo1: "Ganador F29", equipo2: "Ganador F30", source_equipo1: "F29", source_equipo2: "F30", goles_equipo1: null, goles_equipo2: null, penales_equipo1: null, penales_equipo2: null, jugado: false, ganador: null });
  
  return partidos;
}

// Mapeo de posición en grupo a placeholder
// Ej: 1A = primer lugar del grupo A
export function placeholderToEquipo(placeholder, posicionesGrupos) {
  // placeholder formato: "1A" (posición 1, grupo A)
  const pos = parseInt(placeholder[0]);
  const grupo = placeholder.substring(1);
  if (posicionesGrupos && posicionesGrupos[grupo]) {
    return posicionesGrupos[grupo][pos - 1] || placeholder;
  }
  return placeholder;
}

// Calcula la tabla de posiciones de un grupo basado en resultados reales
// partidosGrupo: array de 6 partidos del grupo (deben tener goles_equipo1, goles_equipo2)
export function calcularTablaGrupo(partidosGrupo, equiposGrupo) {
  const tabla = {};
  
  // Inicializar
  for (const eq of equiposGrupo) {
    tabla[eq] = { equipo: eq, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 };
  }
  
  // Calcular estadísticas
  for (const p of partidosGrupo) {
    if (!p.jugado || p.goles_equipo1 === null || p.goles_equipo2 === null) continue;
    
    const eq1 = p.equipo1;
    const eq2 = p.equipo2;
    const g1 = p.goles_equipo1;
    const g2 = p.goles_equipo2;
    
    tabla[eq1].pj++;
    tabla[eq2].pj++;
    tabla[eq1].gf += g1;
    tabla[eq1].gc += g2;
    tabla[eq2].gf += g2;
    tabla[eq2].gc += g1;
    
    if (g1 > g2) {
      tabla[eq1].pg++;
      tabla[eq1].pts += 3;
      tabla[eq2].pp++;
    } else if (g2 > g1) {
      tabla[eq2].pg++;
      tabla[eq2].pts += 3;
      tabla[eq1].pp++;
    } else {
      tabla[eq1].pe++;
      tabla[eq1].pts += 1;
      tabla[eq2].pe++;
      tabla[eq2].pts += 1;
    }
  }
  
  // Ordenar: pts → dif gol → goles a favor
  const ordenados = Object.values(tabla).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const difA = a.gf - a.gc;
    const difB = b.gf - b.gc;
    if (difB !== difA) return difB - difA;
    return b.gf - a.gf;
  });
  
  return ordenados;
}

// Selecciona los 8 mejores terceros de 12 grupos
// terceros: array de { equipo, grupo, pts, dif, gf }
export function seleccionarMejoresTerceros(terceros) {
  // Ordenar por pts → dif → gf
  const ordenados = [...terceros].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dif !== a.dif) return b.dif - a.dif;
    return b.gf - a.gf;
  });
  
  return ordenados.slice(0, 8);
}
