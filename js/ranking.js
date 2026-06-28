/* ranking.js - Tablas de posiciones en tiempo real + Probabilidad Monte Carlo Fase Final */

import { db } from './firebase-config.js?v=7.9';
import { collection, query, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, updateNav, logout, getCurrentUser, getInstitucionActiva } from './auth.js?v=7.9';

const user = requireAuth();
if (!user) throw new Error("No autenticado");

updateNav();
document.getElementById('nav-logout').addEventListener('click', logout);

const isAdmin = user.alias === 'ADMIN';
let institucionFiltro = isAdmin ? 'TODAS' : (getInstitucionActiva() || 'TODAS');
let institucionesDisponibles = [];
let unsubscribeRanking = null;
let unsubscribePartidosFinal = null;
let unsubscribePartidosGrupos = null;

// Estado para MC y avance
let partidosFinalArr = [];          // 32 docs de partidos_final
let partidosGruposArr = [];         // 72 docs de partidos_grupos
let prediccionesPorUser = {};      // { user_id: { partidoId: { ...pred } } }
let probabilidades = {};            // { user_id: prob (0-100) }
let calculandoMC = false;
let mcDirty = true;                // ¿hay que recalcular MC?
let ultimoSnapshotUsers = [];      // cache del último snapshot de usuarios

// Mostrar institución activa
function mostrarInstitucion() {
  const institucion = getInstitucionActiva();
  if (institucion) {
    const badge = document.getElementById('institucion-badge');
    const nombre = document.getElementById('institucion-nombre');
    if (badge && nombre) {
      nombre.textContent = institucion;
      badge.style.display = 'inline-block';
    }
  }
}
mostrarInstitucion();

function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  box.textContent = msg;
  box.className = `alert alert-${type} show`;
  setTimeout(() => box.className = 'alert', 3000);
}

// ===== Cargar instituciones disponibles para tabs de admin =====
async function cargarInstituciones() {
  if (!isAdmin) return;

  try {
    const snapshot = await getDocs(collection(db, 'instituciones'));
    institucionesDisponibles = [];
    snapshot.forEach(d => {
      const data = d.data();
      if (data.activo !== false) {
        institucionesDisponibles.push({ id: d.id, nombre: data.nombre || d.id });
      }
    });

    const tabsContainer = document.querySelector('#institucion-tabs div');
    if (tabsContainer) {
      tabsContainer.innerHTML = `
        <button class="inst-tab ${institucionFiltro === 'TODAS' ? 'active' : ''}" data-inst="TODAS"
          style="padding:8px 16px; border-radius:8px; border:2px solid ${institucionFiltro === 'TODAS' ? 'var(--accent)' : 'rgba(255,255,255,0.2)'};
          background:${institucionFiltro === 'TODAS' ? 'rgba(168,213,186,0.2)' : 'rgba(255,255,255,0.05)'};
          color:${institucionFiltro === 'TODAS' ? 'var(--accent)' : 'var(--text-muted)'}; cursor:pointer; font-weight:bold;">Todas</button>
      `;

      for (const inst of institucionesDisponibles) {
        const isActive = institucionFiltro === inst.id;
        tabsContainer.innerHTML += `
          <button class="inst-tab ${isActive ? 'active' : ''}" data-inst="${inst.id}"
            style="padding:8px 16px; border-radius:8px; border:2px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.2)'};
            background:${isActive ? 'rgba(168,213,186,0.2)' : 'rgba(255,255,255,0.05)'};
            color:${isActive ? 'var(--accent)' : 'var(--text-muted)'}; cursor:pointer; font-weight:bold;">${inst.nombre}</button>
        `;
      }

      document.getElementById('institucion-tabs').style.display = 'block';

      tabsContainer.querySelectorAll('.inst-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
          institucionFiltro = e.target.dataset.inst;
          cargarInstituciones();
          dispararRecalcMC();
          renderizarRankingFinal(ultimoSnapshotUsers);
        });
      });
    }
  } catch (err) {
    console.error('Error cargando instituciones:', err);
  }
}

// ===== Avance del torneo =====
function calcularAvance() {
  const jugadosGrupos = partidosGruposArr.filter(p => p.jugado === true).length;
  const jugadosFinal = partidosFinalArr.filter(p => p.jugado === true).length;
  const jugados = jugadosGrupos + jugadosFinal;
  const total = 72 + 32; // 104
  const pct = total > 0 ? Math.round((jugados / total) * 100) : 0;

  const txt = document.getElementById('avance-texto');
  const barra = document.getElementById('avance-barra');
  if (txt) txt.textContent = `${pct}%  (${jugados} de ${total} partidos jugados)`;
  if (barra) barra.style.width = `${pct}%`;
}

// ===== Renderizar ranking de Fase de Grupos =====
function renderizarRankingGrupos(usuarios) {
  const tbody = document.getElementById('ranking-grupos-body');
  tbody.innerHTML = '';

  if (usuarios.length === 0) {
    const colSpan = isAdmin ? 4 : 3;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:30px; color:var(--text-muted);">Aún no hay participantes registrados${!isAdmin && institucionFiltro !== 'TODAS' ? ' en esta institución' : ''}</td></tr>`;
    return;
  }

  usuarios.sort((a, b) => (b.puntos_fase_grupos || 0) - (a.puntos_fase_grupos || 0));

  usuarios.forEach((u, index) => {
    const pos = index + 1;
    const tr = document.createElement('tr');

    let rankClass = '';
    if (pos === 1) rankClass = 'rank-1';
    else if (pos === 2) rankClass = 'rank-2';
    else if (pos === 3) rankClass = 'rank-3';

    let instCol = '';
    if (isAdmin) {
      instCol = `<td style="font-size:0.85rem; color:var(--text-muted);">${u.institucion_activa || 'N/A'}</td>`;
    }

    tr.innerHTML = `
      <td class="${rankClass}">${pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</td>
      <td style="text-align:left; font-weight:600;">${u.alias}</td>
      ${instCol}
      <td style="font-weight:bold; color:var(--accent);">${u.puntos_fase_grupos || 0}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ===== Renderizar ranking de Fase Final =====
function renderizarRankingFinal(usuarios) {
  const tbody = document.getElementById('ranking-final-body');
  tbody.innerHTML = '';

  if (usuarios.length === 0) {
    const colSpan = isAdmin ? 5 : 4;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center; padding:30px; color:var(--text-muted);">Aún no hay participantes registrados${!isAdmin && institucionFiltro !== 'TODAS' ? ' en esta institución' : ''}</td></tr>`;
    return;
  }

  // Ordenar por puntos fase final descendente
  const ordenados = [...usuarios].sort((a, b) => (b.puntos_fase_final || 0) - (a.puntos_fase_final || 0));

  ordenados.forEach((u, index) => {
    const pos = index + 1;
    const tr = document.createElement('tr');

    let rankClass = '';
    if (pos === 1) rankClass = 'rank-1';
    else if (pos === 2) rankClass = 'rank-2';
    else if (pos === 3) rankClass = 'rank-3';

    let instCol = '';
    if (isAdmin) {
      instCol = `<td style="font-size:0.85rem; color:var(--text-muted);">${u.institucion_activa || 'N/A'}</td>`;
    }

    // Probabilidad
    let probCelda;
    if (calculandoMC) {
      probCelda = `<td style="text-align:center;"><span class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;"></span></td>`;
    } else {
      const prob = probabilidades[u.id];
      if (prob === undefined) {
        probCelda = `<td style="text-align:center; color:var(--text-muted);">-</td>`;
      } else {
        // Color según probabilidad
        let color = 'var(--text-muted)';
        if (prob >= 50) color = '#4caf50';
        else if (prob >= 20) color = 'var(--accent)';
        else if (prob >= 5) color = '#e8c547';
        else if (prob > 0) color = '#ff9800';
        else color = 'var(--text-muted)';
        probCelda = `<td style="text-align:center; font-weight:bold; color:${color};">${prob.toFixed(1)}%</td>`;
      }
    }

    tr.innerHTML = `
      <td class="${rankClass}">${pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</td>
      <td style="text-align:left; font-weight:600;">${u.alias}</td>
      ${instCol}
      <td style="font-weight:bold; color:var(--accent);">${u.puntos_fase_final || 0}</td>
      ${probCelda}
    `;

    tbody.appendChild(tr);
  });
}

// ===== Actualizar encabezados =====
function actualizarEncabezados() {
  const headers = document.querySelectorAll('.inst-col-header');
  headers.forEach(th => {
    th.style.display = isAdmin ? 'table-cell' : 'none';
  });
}

// ===== Pertenece a institución =====
function usuarioPerteneceAInstitucion(u, institucion) {
  if (!institucion || institucion === 'TODAS') return true;
  if (u.institucion_activa === institucion) return true;
  if (u.instituciones && u.instituciones.includes(institucion)) return true;
  return false;
}

function filtrarUsuarios(todos) {
  return todos.filter(u => {
    if (isAdmin && institucionFiltro === 'TODAS') return true;
    if (isAdmin) return usuarioPerteneceAInstitucion(u, institucionFiltro);
    const userInst = getInstitucionActiva();
    return usuarioPerteneceAInstitucion(u, userInst);
  });
}

// ===== HELPERS DE MC (réplica de admin.js:491-552) =====

// Resolver nombre real de equipo recursivamente (sobre un estado sampled de partidos_final)
function resolverEquipoRealMC(partidoId, esEquipo1, estadoPartidos, visited = new Set()) {
  const key = `${partidoId}_${esEquipo1}`;
  if (visited.has(key)) return null;
  visited.add(key);

  const partido = estadoPartidos[partidoId];
  if (!partido) return null;

  const nombre = esEquipo1 ? partido.equipo1 : partido.equipo2;
  if (!nombre) return null;
  // Si no es placeholder, devolver directo
  if (!nombre.startsWith('Ganador') && !nombre.startsWith('Perdedor') && !/^[123][A-L]$/.test(nombre) && !/^T[1-8]$/.test(nombre)) {
    return nombre;
  }
  if (partido.ronda === 'dieciseisavos') return nombre;

  let sourceId = esEquipo1 ? partido.source_equipo1 : partido.source_equipo2;
  if (!sourceId) {
    const m = nombre.match(/(F\d+)/);
    if (m) sourceId = m[1];
  }
  if (!sourceId) return null;

  const sourcePartido = estadoPartidos[sourceId];
  if (!sourcePartido) return null;

  const sg1 = sourcePartido.goles_equipo1;
  const sg2 = sourcePartido.goles_equipo2;
  if (sg1 === null || sg1 === undefined || sg2 === null || sg2 === undefined) return null;

  const sp1 = sourcePartido.penales_equipo1;
  const sp2 = sourcePartido.penales_equipo2;
  let sGanador = null;
  if (sg1 > sg2) sGanador = resolverEquipoRealMC(sourceId, true, estadoPartidos, visited);
  else if (sg2 > sg1) sGanador = resolverEquipoRealMC(sourceId, false, estadoPartidos, visited);
  else if (sp1 !== null && sp1 !== undefined && sp2 !== null && sp2 !== undefined && sp1 !== sp2) {
    sGanador = sp1 > sp2 ? resolverEquipoRealMC(sourceId, true, estadoPartidos, visited) : resolverEquipoRealMC(sourceId, false, estadoPartidos, visited);
  }
  if (!sGanador) return null;

  const esPerdedor = (esEquipo1 ? partido.perdedor_source1 : partido.perdedor_source2) || partido.ronda === 'tercer_lugar';
  if (esPerdedor) {
    const eq1Real = resolverEquipoRealMC(sourceId, true, estadoPartidos, visited);
    return sGanador === eq1Real ? resolverEquipoRealMC(sourceId, false, estadoPartidos, visited) : eq1Real;
  }
  return sGanador;
}

// Ganador real de un partido en el estado dado
function getGanadorRealMC(partidoId, estadoPartidos) {
  const partido = estadoPartidos[partidoId];
  if (!partido) return null;
  const g1 = partido.goles_equipo1;
  const g2 = partido.goles_equipo2;
  if (g1 === null || g1 === undefined || g2 === null || g2 === undefined) return null;
  if (g1 > g2) return resolverEquipoRealMC(partidoId, true, estadoPartidos);
  if (g2 > g1) return resolverEquipoRealMC(partidoId, false, estadoPartidos);
  const p1 = partido.penales_equipo1;
  const p2 = partido.penales_equipo2;
  if (p1 !== null && p1 !== undefined && p2 !== null && p2 !== undefined && p1 !== p2) {
    return p1 > p2 ? resolverEquipoRealMC(partidoId, true, estadoPartidos) : resolverEquipoRealMC(partidoId, false, estadoPartidos);
  }
  return null;
}

// Scoring por partido (réplica admin.js:574-584)
function scorePartidoFinalMC(partidoId, pred, estadoPartidos) {
  if (!pred) return 0;
  const partido = estadoPartidos[partidoId];
  if (!partido) return 0;

  const g1 = partido.goles_equipo1;
  const g2 = partido.goles_equipo2;
  if (g1 === null || g1 === undefined || g2 === null || g2 === undefined) return 0;

  const p1 = pred.prediccion_equipo1;
  const p2 = pred.prediccion_equipo2;
  if (p1 === null || p1 === undefined || p2 === null || p2 === undefined) return 0;

  let pts = 0;
  if (p1 === g1 && p2 === g2) pts += 3;
  else if ((g1 > g2 && p1 > p2) || (g2 > g1 && p2 > p1) || (g1 === g2 && p1 === p2)) pts += 1;

  const realGanador = getGanadorRealMC(partidoId, estadoPartidos);
  const predGanador = pred.prediccion_ganador;
  if (realGanador && predGanador && realGanador === predGanador) pts += 1;

  if (pts > 4) pts = 4;
  return pts;
}

// Samplear un marcador aleatorio para un partido no jugado
function samplearPartido() {
  const g1 = Math.floor(Math.random() * 4); // 0-3
  const g2 = Math.floor(Math.random() * 4); // 0-3
  let pen1 = null, pen2 = null;
  if (g1 === g2) {
    // Empate -> penales
    do {
      pen1 = Math.floor(Math.random() * 6); // 0-5
      pen2 = Math.floor(Math.random() * 6);
    } while (pen1 === pen2);
  }
  return { goles_equipo1: g1, goles_equipo2: g2, penales_equipo1: pen1, penales_equipo2: pen2 };
}

// ===== Calcular probabilidades Monte Carlo (chunked) =====
async function calcularProbabilidadesMC() {
  // Solo sobre los usuarios visibles actuales
  const todos = ultimoSnapshotUsers;
  const usuariosVisibles = filtrarUsuarios(todos);
  if (usuariosVisibles.length === 0) {
    probabilidades = {};
    mcDirty = false;
    renderizarRankingFinal(ultimoSnapshotUsers);
    return;
  }

  const partidosFinalDict = {};
  for (const p of partidosFinalArr) {
    partidosFinalDict[p.id] = {
      id: p.id,
      ronda: p.ronda,
      equipo1: p.equipo1,
      equipo2: p.equipo2,
      source_equipo1: p.source_equipo1,
      source_equipo2: p.source_equipo2,
      perdedor_source1: p.perdedor_source1,
      perdedor_source2: p.perdedor_source2,
      jugado: p.jugado === true,
      goles_equipo1: p.goles_equipo1 ?? null,
      goles_equipo2: p.goles_equipo2 ?? null,
      penales_equipo1: p.penales_equipo1 ?? null,
      penales_equipo2: p.penales_equipo2 ?? null
    };
  }

  // Identificar partidos no jugados (ordena por numero asc para mejor resolver)
  const noJugados = partidosFinalArr
    .filter(p => p.jugado !== true)
    .sort((a, b) => (a.numero || 0) - (b.numero || 0))
    .map(p => p.id);

  // Caso: torneo final completo (no hay no-jugados) -> 100% al #1, 0% al resto
  if (noJugados.length === 0) {
    probabilidades = {};
    const ordenados = [...usuariosVisibles].sort((a, b) => (b.puntos_fase_final || 0) - (a.puntos_fase_final || 0));
    if (ordenados.length > 0) {
      // Empate por el primer lugar: repartir 100% entre los empatados
      const topPts = ordenados[0].puntos_fase_final || 0;
      const empatados = ordenados.filter(u => (u.puntos_fase_final || 0) === topPts);
      const probCada = 100 / empatados.length;
      for (const u of empatados) probabilidades[u.id] = probCada;
      for (const u of ordenados) if (!empatados.includes(u)) probabilidades[u.id] = 0;
    }
    mcDirty = false;
    calculandoMC = false;
    renderizarRankingFinal(ultimoSnapshotUsers);
    return;
  }

  // Precomputar baseline por usuario
  const baselines = {};
  for (const u of usuariosVisibles) {
    baselines[u.id] = u.puntos_fase_final || 0;
  }

  // Pre-fetch predicciones por user_id
  const predsPorUser = {};
  for (const u of usuariosVisibles) {
    predsPorUser[u.id] = prediccionesPorUser[u.id] || {};
  }

  // Contador de victorias
  const contadorGanador = {};
  for (const u of usuariosVisibles) contadorGanador[u.id] = 0;

  calculandoMC = true;
  renderizarRankingFinal(ultimoSnapshotUsers);

  const ITER_TOTALES = 1000;
  const CHUNK = 50;
  let iterActual = 0;

  return new Promise((resolve) => {
    function procesarChunk() {
      const fin = Math.min(iterActual + CHUNK, ITER_TOTALES);
      for (; iterActual < fin; iterActual++) {
        // 1. Crear estado sampled para esta iter
        const estado = {};
        for (const id in partidosFinalDict) {
          const p = partidosFinalDict[id];
          if (p.jugado) {
            estado[id] = { ...p };
          } else {
            const s = samplearPartido();
            estado[id] = { ...p, goles_equipo1: s.goles_equipo1, goles_equipo2: s.goles_equipo2,
              penales_equipo1: s.penales_equipo1, penales_equipo2: s.penales_equipo2, jugado: true };
          }
        }

        // 2. Calcular pts hip por usuario
        let maxPts = -Infinity;
        let ganadores = [];
        for (const u of usuariosVisibles) {
          let pts = baselines[u.id];
          const preds = predsPorUser[u.id];
          for (const pid of noJugados) {
            const pred = preds[pid];
            if (!pred) continue;
            pts += scorePartidoFinalMC(pid, pred, estado);
          }
          if (pts > maxPts) {
            maxPts = pts;
            ganadores = [u.id];
          } else if (pts === maxPts) {
            ganadores.push(u.id);
          }
        }

        // 3. Repartir 1 victoria entre ganadores empatados (aleatorio equitativo)
        if (ganadores.length === 1) {
          contadorGanador[ganadores[0]]++;
        } else {
          const g = ganadores[Math.floor(Math.random() * ganadores.length)];
          contadorGanador[g]++;
        }
      }

      if (iterActual < ITER_TOTALES) {
        // Siguiente chunk en próxima iter del event loop
        setTimeout(procesarChunk, 0);
      } else {
        // Finalizar
        probabilidades = {};
        for (const u of usuariosVisibles) {
          probabilidades[u.id] = (contadorGanador[u.id] / ITER_TOTALES) * 100;
        }
        calculandoMC = false;
        mcDirty = false;
        renderizarRankingFinal(ultimoSnapshotUsers);
        resolve();
      }
    }
    procesarChunk();
  });
}

// Disparar recálculo MC (con debounce simple)
let mcTimer = null;
function dispararRecalcMC() {
  if (mcTimer) clearTimeout(mcTimer);
  mcTimer = setTimeout(() => {
    calcularProbabilidadesMC();
  }, 200);
}

// ===== Cargar predicciones_final (una vez al iniciar) =====
async function cargarPrediccionesFinal() {
  try {
    const snap = await getDocs(collection(db, 'predicciones_final'));
    prediccionesPorUser = {};
    snap.forEach(d => {
      const data = d.data();
      const uid = data.user_id;
      if (!prediccionesPorUser[uid]) prediccionesPorUser[uid] = {};
      prediccionesPorUser[uid][data.partido_id] = data;
    });
  } catch (err) {
    console.error('Error cargando predicciones_final:', err);
    prediccionesPorUser = {};
  }
}

// ===== Listeners en tiempo real de partidos =====
async function suscribirPartidos() {
  // partidos_grupos (avance) - una sola vez
  try {
    const snapGrupos = await getDocs(collection(db, 'partidos_grupos'));
    partidosGruposArr = [];
    snapGrupos.forEach(d => partidosGruposArr.push({ id: d.id, ...d.data() }));
    calcularAvance();
    // Listener en tiempo real
    unsubscribePartidosGrupos = onSnapshot(collection(db, 'partidos_grupos'), (snap) => {
      partidosGruposArr = [];
      snap.forEach(d => partidosGruposArr.push({ id: d.id, ...d.data() }));
      calcularAvance();
    });
  } catch (err) {
    console.error('Error cargando partidos_grupos:', err);
  }

  // partidos_final - tiempo real, dispara MC
  try {
    const snapFinal = await getDocs(collection(db, 'partidos_final'));
    partidosFinalArr = [];
    snapFinal.forEach(d => partidosFinalArr.push({ id: d.id, ...d.data() }));
    calcularAvance();
    dispararRecalcMC();
    // Listener tiempo real
    unsubscribePartidosFinal = onSnapshot(collection(db, 'partidos_final'), (snap) => {
      partidosFinalArr = [];
      snap.forEach(d => partidosFinalArr.push({ id: d.id, ...d.data() }));
      calcularAvance();
      dispararRecalcMC();
    });
  } catch (err) {
    console.error('Error cargando partidos_final:', err);
  }
}

// ===== Ranking (usuarios) en tiempo real =====
async function cargarRanking() {
  try {
    if (unsubscribeRanking) unsubscribeRanking();

    const q = query(collection(db, 'users'));
    unsubscribeRanking = onSnapshot(q, (snapshot) => {
      const todosLosUsuarios = [];
      snapshot.forEach(d => {
        todosLosUsuarios.push({ id: d.id, ...d.data() });
      });
      ultimoSnapshotUsers = todosLosUsuarios;

      const usuariosFiltrados = filtrarUsuarios(todosLosUsuarios);
      renderizarRankingGrupos(usuariosFiltrados);
      renderizarRankingFinal(usuariosFiltrados);
    }, (err) => {
      console.error(err);
      showAlert('Error cargando ranking', 'danger');
    });
  } catch (err) {
    console.error(err);
    showAlert('Error cargando ranking', 'danger');
  }
}

// ===== Botón Recalcular =====
const btnRecalc = document.getElementById('btn-recalc-prob');
if (btnRecalc) {
  btnRecalc.addEventListener('click', async () => {
    btnRecalc.disabled = true;
    btnRecalc.textContent = '⏳ Calculando...';
    try {
      // Recargar predicciones (por si hubo cambios)
      await cargarPrediccionesFinal();
      await calcularProbabilidadesMC();
    } finally {
      btnRecalc.disabled = false;
      btnRecalc.textContent = '🔄 Recalcular probabilidades';
    }
  });
}

// ===== Init =====
actualizarEncabezados();
cargarInstituciones();
cargarRanking();
(async () => {
  await cargarPrediccionesFinal();
  await suscribirPartidos();
})();