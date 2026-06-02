/* final.js - Fase Final: Sistema de pasos tipo cuestionario */

import { db } from './firebase-config.js';
import { collection, query, getDocs, doc, getDoc, setDoc, writeBatch, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, updateNav, logout, getCurrentUser, getInstitucionActiva } from './auth.js';
import { BANDERAS } from './data.js';

const user = requireAuth();
if (!user) throw new Error("No autenticado");

updateNav();
document.getElementById('nav-logout').addEventListener('click', logout);

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

// ===== CONFIGURACIÓN =====
const RONDAS = ['dieciseisavos', 'octavos', 'cuartos', 'semis', 'tercer_lugar', 'final'];
const NOMBRES_RONDAS = {
  dieciseisavos: 'Dieciseisavos de Final',
  octavos: 'Octavos de Final',
  cuartos: 'Cuartos de Final',
  semis: 'Semifinales',
  tercer_lugar: 'Tercer Lugar',
  final: 'La Gran Final'
};

let partidosFinal = [];
let prediccionesLocales = {};    // { partidoId: { g1, g2, p1, p2, ganador } }
let prediccionesGuardadasIds = new Set();
let equiposCalculados = {};      // { partidoId: { eq1, eq2 } }
let rondaActualIndex = 0;
let partidosPorRonda = {};
let isSaving = false;

// ===== UTILIDADES =====
function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  box.textContent = msg;
  box.className = `alert alert-${type} show`;
  setTimeout(() => box.className = 'alert', 4000);
}

function getFlagUrl(pais) {
  if (!pais || pais.startsWith('Ganador') || pais.startsWith('Perdedor') || pais.startsWith('1') || pais.startsWith('2') || pais.startsWith('3')) {
    return null; // No hay bandera para placeholders
  }
  const code = BANDERAS[pais] || 'xx';
  return `https://flagcdn.com/w40/${code}.png`;
}

function esPlaceholder(equipo) {
  return !equipo || equipo.startsWith('Ganador') || equipo.startsWith('Perdedor') || /^[123][A-L]$/.test(equipo);
}

// ===== VERIFICAR FASE FINAL HABILITADA =====
async function checkFaseFinal() {
  try {
    const configRef = doc(db, 'config', 'app_config');
    const configSnap = await getDoc(configRef);
    
    if (!configSnap.exists() || !configSnap.data().fase_final_habilitada) {
      document.getElementById('bloqueo-msg').style.display = 'block';
      return false;
    }
    
    document.getElementById('final-content').style.display = 'block';
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

// ===== CARGAR PARTIDOS =====
async function cargarPartidosFinal() {
  const habilitada = await checkFaseFinal();
  if (!habilitada) return;
  
  try {
    const q = query(collection(db, 'partidos_final'));
    const snapshot = await getDocs(q);
    partidosFinal = [];
    snapshot.forEach(d => partidosFinal.push({ id: d.id, ...d.data() }));
    partidosFinal.sort((a, b) => a.numero - b.numero);
    
    // Organizar por ronda
    partidosPorRonda = {};
    for (const r of RONDAS) partidosPorRonda[r] = [];
    for (const p of partidosFinal) {
      if (partidosPorRonda[p.ronda]) {
        partidosPorRonda[p.ronda].push(p);
      }
    }
    
    // Cargar predicciones previas del usuario
    await cargarPrediccionesUsuario();
    
    // Calcular equipos iniciales
    recalcularTodosEquipos();
    
    // Renderizar primera ronda
    renderizarRondaActual();
    actualizarUI();
    
  } catch (err) {
    console.error(err);
    document.getElementById('round-container').innerHTML = '<p style="color:var(--danger); text-align:center; padding:40px;">Error cargando partidos</p>';
  }
}

async function cargarPrediccionesUsuario() {
  try {
    const currentUser = getCurrentUser();
    const institucion = getInstitucionActiva();
    
    if (!institucion) {
      console.warn('No hay institución activa');
      return;
    }
    
    const q = query(
      collection(db, 'predicciones_final'),
      where('user_id', '==', `${currentUser.cedula}_${currentUser.alias}`),
      where('institucion', '==', institucion)
    );
    const snapshot = await getDocs(q);
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      prediccionesGuardadasIds.add(data.partido_id);
      prediccionesLocales[data.partido_id] = {
        g1: data.prediccion_equipo1 !== null ? String(data.prediccion_equipo1) : '',
        g2: data.prediccion_equipo2 !== null ? String(data.prediccion_equipo2) : '',
        p1: data.prediccion_penales_equipo1 !== null ? String(data.prediccion_penales_equipo1) : '',
        p2: data.prediccion_penales_equipo2 !== null ? String(data.prediccion_penales_equipo2) : '',
        ganador: data.prediccion_ganador || ''
      };
    });
  } catch (err) {
    console.error('Error cargando predicciones:', err);
  }
}

// ===== CÁLCULO DE EQUIPOS =====
function recalcularTodosEquipos() {
  equiposCalculados = {};
  
  // Orden de procesamiento: dieciseisavos → octavos → cuartos → semis → tercer_lugar → final
  for (const ronda of RONDAS) {
    for (const p of partidosPorRonda[ronda]) {
      if (ronda === 'dieciseisavos') {
        // Equipos fijos de la base de datos
        equiposCalculados[p.id] = { eq1: p.equipo1, eq2: p.equipo2 };
      } else {
        // Calcular desde predicciones de partidos source
        const eq1 = calcularEquipoDinamico(p, true);
        const eq2 = calcularEquipoDinamico(p, false);
        equiposCalculados[p.id] = { eq1, eq2 };
      }
    }
  }
}

function extraerSourceDePlaceholder(equipoNombre) {
  // Fallback: si no hay source_equipo en la BD, extraer del nombre del placeholder
  // Ej: "Ganador F1" → "F1", "Perdedor F29" → "F29"
  if (!equipoNombre) return null;
  const match = equipoNombre.match(/(F\d+)/);
  return match ? match[1] : null;
}

function calcularEquipoDinamico(partido, esEquipo1) {
  let sourceId = esEquipo1 ? partido.source_equipo1 : partido.source_equipo2;
  
  // Fallback: extraer source del nombre del placeholder si no está en la BD
  if (!sourceId) {
    const equipoNombre = esEquipo1 ? partido.equipo1 : partido.equipo2;
    sourceId = extraerSourceDePlaceholder(equipoNombre);
  }
  
  if (!sourceId) return 'Por definir';
  
  let esPerdedor = esEquipo1 ? partido.perdedor_source1 : partido.perdedor_source2;
  // Fallback para tercer lugar
  if (partido.ronda === 'tercer_lugar' && !esPerdedor) {
    esPerdedor = true;
  }
  
  // Obtener predicción del partido source
  const predSource = prediccionesLocales[sourceId];
  if (!predSource || predSource.g1 === '' || predSource.g2 === '') {
    return esPerdedor ? `Perdedor ${sourceId}` : `Ganador ${sourceId}`;
  }
  
  const g1 = parseInt(predSource.g1);
  const g2 = parseInt(predSource.g2);
  const p1 = predSource.p1 !== '' ? parseInt(predSource.p1) : null;
  const p2 = predSource.p2 !== '' ? parseInt(predSource.p2) : null;
  
  const sourcePartido = partidosFinal.find(p => p.id === sourceId);
  if (!sourcePartido) return 'Por definir';
  
  // Determinar ganador
  let ganadorEquipo = null;
  
  if (g1 > g2) {
    ganadorEquipo = equiposCalculados[sourceId]?.eq1 || sourcePartido.equipo1;
  } else if (g2 > g1) {
    ganadorEquipo = equiposCalculados[sourceId]?.eq2 || sourcePartido.equipo2;
  } else if (p1 !== null && p2 !== null) {
    if (p1 > p2) ganadorEquipo = equiposCalculados[sourceId]?.eq1 || sourcePartido.equipo1;
    else if (p2 > p1) ganadorEquipo = equiposCalculados[sourceId]?.eq2 || sourcePartido.equipo2;
  }
  
  if (!ganadorEquipo) {
    return esPerdedor ? `Perdedor ${sourceId}` : `Ganador ${sourceId}`;
  }
  
  // Para tercer lugar, devolver el perdedor
  if (esPerdedor) {
    const eq1Source = equiposCalculados[sourceId]?.eq1 || sourcePartido.equipo1;
    return ganadorEquipo === eq1Source 
      ? (equiposCalculados[sourceId]?.eq2 || sourcePartido.equipo2)
      : (equiposCalculados[sourceId]?.eq1 || sourcePartido.equipo1);
  }
  
  return ganadorEquipo;
}

function calcularGanadorAutomatico(partidoId) {
  const pred = prediccionesLocales[partidoId];
  if (!pred || pred.g1 === '' || pred.g2 === '') return null;
  
  const partido = partidosFinal.find(p => p.id === partidoId);
  if (!partido) return null;
  
  const g1 = parseInt(pred.g1);
  const g2 = parseInt(pred.g2);
  const eq1 = equiposCalculados[partidoId]?.eq1 || partido.equipo1;
  const eq2 = equiposCalculados[partidoId]?.eq2 || partido.equipo2;
  
  if (g1 > g2) return eq1;
  if (g2 > g1) return eq2;
  
  // Empate - revisar penales
  const p1 = pred.p1 !== '' ? parseInt(pred.p1) : null;
  const p2 = pred.p2 !== '' ? parseInt(pred.p2) : null;
  
  if (p1 !== null && p2 !== null && p1 !== p2) {
    return p1 > p2 ? eq1 : eq2;
  }
  
  return null;
}

// ===== RENDERIZADO =====
function renderizarRondaActual() {
  const ronda = RONDAS[rondaActualIndex];
  const container = document.getElementById('round-container');
  const partidos = partidosPorRonda[ronda] || [];
  
  let html = `<h3 class="round-title" style="text-align:center; margin-bottom: 20px;">${NOMBRES_RONDAS[ronda]}</h3>`;
  html += '<div class="matches-grid">';
  
  for (const p of partidos) {
    const eq1 = equiposCalculados[p.id]?.eq1 || p.equipo1;
    const eq2 = equiposCalculados[p.id]?.eq2 || p.equipo2;
    const yaGuardado = prediccionesGuardadasIds.has(p.id);
    const jugado = p.jugado;
    // Solo bloquear si el partido YA SE JUGÓ (no si solo está guardado)
    const disabled = jugado ? 'disabled' : '';
    const pred = prediccionesLocales[p.id] || {};
    const g1 = pred.g1 ?? '';
    const g2 = pred.g2 ?? '';
    const p1 = pred.p1 ?? '';
    const p2 = pred.p2 ?? '';
    
    // Determinar si se muestran penales
    const g1Num = g1 !== '' ? parseInt(g1) : null;
    const g2Num = g2 !== '' ? parseInt(g2) : null;
    const mostrarPenales = g1Num !== null && g2Num !== null && g1Num === g2Num && !jugado;
    const penalesClass = mostrarPenales ? 'visible' : '';
    
    // Determinar estado del ganador
    let winnerHtml = '';
    if (jugado) {
      const ganador = pred.ganador || calcularGanadorAutomatico(p.id);
      winnerHtml = `<span class="winner-name">✅ Partido jugado - Avanza: ${ganador || '?'}</span>`;
    } else if (yaGuardado) {
      const ganador = pred.ganador || calcularGanadorAutomatico(p.id);
      winnerHtml = `<span class="winner-name">✓ Guardado - Avanza: ${ganador || '?'}</span>`;
    } else if (g1Num !== null && g2Num !== null) {
      const ganador = calcularGanadorAutomatico(p.id);
      if (ganador) {
        winnerHtml = `<span class="winner-name">🏆 Avanza: ${ganador}</span>`;
      } else if (g1Num === g2Num) {
        winnerHtml = `<span class="pending">⚠️ Define los penales</span>`;
      }
    } else {
      winnerHtml = `<span class="placeholder">Ingresa el marcador</span>`;
    }
    
    const savedClass = yaGuardado ? 'saved' : '';
    
    html += `
      <div class="match-card ${savedClass}" data-id="${p.id}">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 8px;">
          <div class="match-team" style="flex:1; min-width: 120px;">
            ${renderFlag(eq1)}
            <span title="${eq1}">${eq1}</span>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; gap:6px; min-width: 140px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="number" min="0" max="20" placeholder="-" style="width:50px; height:40px; text-align:center;"
                data-field="g1" data-id="${p.id}" ${disabled} value="${g1}">
              <span class="match-separator">:</span>
              <input type="number" min="0" max="20" placeholder="-" style="width:50px; height:40px; text-align:center;"
                data-field="g2" data-id="${p.id}" ${disabled} value="${g2}">
            </div>
            <div class="penales-box ${penalesClass}">
              <input type="number" min="0" max="20" placeholder="Pen" style="width:45px; height:32px; font-size:0.85rem; text-align:center;"
                data-field="p1" data-id="${p.id}" ${disabled} value="${p1}">
              <label>Penales</label>
              <input type="number" min="0" max="20" placeholder="Pen" style="width:45px; height:32px; font-size:0.85rem; text-align:center;"
                data-field="p2" data-id="${p.id}" ${disabled} value="${p2}">
            </div>
          </div>
          <div class="match-team reverse" style="flex:1; min-width: 120px;">
            <span title="${eq2}">${eq2}</span>
            ${renderFlag(eq2)}
          </div>
        </div>
        <div class="winner-badge">${winnerHtml}</div>
      </div>
    `;
  }
  
  html += '</div>';
  container.innerHTML = html;
  
  // Attach listeners
  attachInputListeners(container);
}

function renderFlag(equipo) {
  const flagUrl = getFlagUrl(equipo);
  if (flagUrl) {
    return `<img src="${flagUrl}" alt="${equipo}" style="width:28px; height:20px; object-fit:cover; border-radius:2px;" onerror="this.style.display='none'">`;
  } else {
    return `<div class="placeholder-icon" style="width:28px; height:20px; background:rgba(255,255,255,0.1); border-radius:4px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.6rem;">?</div>`;
  }
}

function attachInputListeners(container) {
  container.querySelectorAll('input:not([disabled])').forEach(el => {
    el.addEventListener('change', handleInputChange);
    el.addEventListener('input', handleInputChange);
  });
}

function handleInputChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  const value = e.target.value;
  
  if (!prediccionesLocales[id]) prediccionesLocales[id] = {};
  prediccionesLocales[id][field] = value;
  
  // Si cambió goles, resetear ganador (se recalculará)
  if (field === 'g1' || field === 'g2') {
    prediccionesLocales[id].ganador = '';
  }
  
  // Actualizar penales y ganador visualmente
  actualizarCardVisual(id);
  
  // SIEMPRE recalcular equipos de rondas posteriores cuando cambia cualquier partido
  const partido = partidosFinal.find(p => p.id === id);
  if (partido) {
    // Recalcular TODOS los equipos (la cadena de dependencias puede ser larga)
    recalcularTodosEquipos();
    
    // Si estamos viendo una ronda posterior a la editada, re-renderizar para mostrar nuevos equipos
    const rondaEditadaIdx = RONDAS.indexOf(partido.ronda);
    if (rondaEditadaIdx < rondaActualIndex) {
      renderizarRondaActual();
    }
    
    // Actualizar tabs para mostrar rondas posteriores con datos
    actualizarTabsEstado();
  }
  
  actualizarBotonesGuardado();
}

function actualizarCardVisual(partidoId) {
  const card = document.querySelector(`.match-card[data-id="${partidoId}"]`);
  if (!card) return;
  
  const pred = prediccionesLocales[partidoId];
  if (!pred) return;
  
  const g1 = pred.g1 !== '' ? parseInt(pred.g1) : null;
  const g2 = pred.g2 !== '' ? parseInt(pred.g2) : null;
  
  // Actualizar visibilidad de penales
  const penalesBox = card.querySelector('.penales-box');
  if (penalesBox) {
    if (g1 !== null && g2 !== null && g1 === g2) {
      penalesBox.classList.add('visible');
    } else {
      penalesBox.classList.remove('visible');
      // Limpiar valores de penales si se ocultan
      if (g1 !== null && g2 !== null && g1 !== g2) {
        pred.p1 = '';
        pred.p2 = '';
        const p1Input = penalesBox.querySelector('[data-field="p1"]');
        const p2Input = penalesBox.querySelector('[data-field="p2"]');
        if (p1Input) p1Input.value = '';
        if (p2Input) p2Input.value = '';
      }
    }
  }
  
  // Actualizar indicador de ganador
  const winnerBadge = card.querySelector('.winner-badge');
  if (winnerBadge) {
    const ganador = calcularGanadorAutomatico(partidoId);
    if (ganador) {
      winnerBadge.innerHTML = `<span class="winner-name">🏆 Avanza: ${ganador}</span>`;
      pred.ganador = ganador;
    } else if (g1 !== null && g2 !== null && g1 === g2) {
      winnerBadge.innerHTML = `<span class="pending">⚠️ Ingresa los penales</span>`;
    } else {
      winnerBadge.innerHTML = `<span class="placeholder">Ingresa el marcador</span>`;
    }
  }
}

// ===== UI Y NAVEGACIÓN =====
function actualizarUI() {
  // Actualizar tabs
  actualizarTabsEstado();
  
  // Actualizar barra de progreso
  const progreso = ((rondaActualIndex + 1) / RONDAS.length) * 100;
  document.getElementById('progress-fill').style.width = `${progreso}%`;
  document.getElementById('progress-text').textContent = `Paso ${rondaActualIndex + 1} de ${RONDAS.length}: ${NOMBRES_RONDAS[RONDAS[rondaActualIndex]]}`;
  
  // Botones de navegación
  document.getElementById('btn-prev').disabled = rondaActualIndex === 0;
  document.getElementById('btn-next').textContent = rondaActualIndex === RONDAS.length - 1 ? 'Revisar Todo →' : 'Siguiente →';
  
  actualizarBotonesGuardado();
}

function actualizarTabsEstado() {
  const tabs = document.querySelectorAll('.step-btn');
  tabs.forEach((tab, idx) => {
    tab.classList.remove('active', 'completed');
    if (idx === rondaActualIndex) {
      tab.classList.add('active');
    } else if (rondaEstaCompleta(RONDAS[idx])) {
      tab.classList.add('completed');
    }
  });
}

function rondaEstaCompleta(ronda) {
  const partidos = partidosPorRonda[ronda] || [];
  for (const p of partidos) {
    if (prediccionesGuardadasIds.has(p.id)) continue; // Ya guardado cuenta como completo
    const pred = prediccionesLocales[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '') return false;
    const g1 = parseInt(pred.g1);
    const g2 = parseInt(pred.g2);
    if (g1 === g2) {
      if (pred.p1 === '' || pred.p2 === '') return false;
      if (parseInt(pred.p1) === parseInt(pred.p2)) return false;
    }
  }
  return partidos.length > 0;
}

function actualizarBotonesGuardado() {
  const btnFinal = document.getElementById('btn-save-final');
  const btnProgress = document.getElementById('btn-save-progress');
  const status = document.getElementById('save-status');
  
  // Contar completados
  let completados = 0;
  let guardados = 0;
  let total = partidosFinal.length;
  let faltanPenales = 0;
  let penalesIguales = 0;
  
  for (const p of partidosFinal) {
    if (prediccionesGuardadasIds.has(p.id)) {
      guardados++;
      completados++;
      continue;
    }
    const pred = prediccionesLocales[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '') continue;
    const g1 = parseInt(pred.g1);
    const g2 = parseInt(pred.g2);
    if (g1 === g2) {
      if (pred.p1 === '' || pred.p2 === '') {
        faltanPenales++;
        continue;
      }
      if (parseInt(pred.p1) === parseInt(pred.p2)) {
        penalesIguales++;
        continue;
      }
    }
    completados++;
  }
  
  const todoCompleto = completados === total;
  const todoGuardado = guardados === total;
  
  if (todoGuardado) {
    btnFinal.disabled = true;
    btnFinal.textContent = '✅ Todo Guardado';
    btnProgress.style.display = 'none';
    status.textContent = 'Todas tus predicciones están guardadas. ¡Suerte!';
  } else if (todoCompleto) {
    btnFinal.disabled = false;
    btnFinal.textContent = '✅ Finalizar y Guardar Todo';
    btnProgress.style.display = 'inline-block';
    status.textContent = `✓ ${completados}/${total} partidos completos. Listo para guardar definitivamente.`;
  } else {
    btnFinal.disabled = true;
    btnFinal.textContent = '✅ Finalizar y Guardar Todo';
    btnProgress.style.display = 'inline-block';
    let msg = `${completados}/${total} partidos completos.`;
    if (faltanPenales > 0) msg += ` Faltan penales en ${faltanPenales} partido(s).`;
    if (penalesIguales > 0) msg += ` ${penalesIguales} partido(s) con penales iguales.`;
    status.textContent = msg;
  }
}

// ===== NAVEGACIÓN =====
function irARonda(index) {
  if (index < 0 || index >= RONDAS.length) return;
  rondaActualIndex = index;
  recalcularTodosEquipos();
  renderizarRondaActual();
  actualizarUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('btn-prev').addEventListener('click', () => {
  irARonda(rondaActualIndex - 1);
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (rondaActualIndex === RONDAS.length - 1) {
    // Última ronda - mostrar resumen
    mostrarResumenFinal();
  } else {
    irARonda(rondaActualIndex + 1);
  }
});

// Tabs de pasos
document.getElementById('steps-bar').addEventListener('click', (e) => {
  const tab = e.target.closest('.step-btn');
  if (!tab) return;
  const ronda = tab.dataset.ronda;
  const idx = RONDAS.indexOf(ronda);
  if (idx >= 0) irARonda(idx);
});

// ===== GUARDADO =====
// Guardar progreso (sin bloquear)
document.getElementById('btn-save-progress').addEventListener('click', async () => {
  if (isSaving) return;
  await guardarPredicciones(false);
});

// Guardar definitivo (bloquea todo)
document.getElementById('btn-save-final').addEventListener('click', async () => {
  if (isSaving) return;
  
  // Validar que todo esté completo
  let incompletos = 0;
  for (const p of partidosFinal) {
    if (prediccionesGuardadasIds.has(p.id)) continue;
    const pred = prediccionesLocales[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '') {
      incompletos++;
      continue;
    }
    const g1 = parseInt(pred.g1);
    const g2 = parseInt(pred.g2);
    if (g1 === g2) {
      if (pred.p1 === '' || pred.p2 === '') incompletos++;
      else if (parseInt(pred.p1) === parseInt(pred.p2)) incompletos++;
    }
  }
  
  if (incompletos > 0) {
    showAlert(`Faltan ${incompletos} partidos por completar`, 'danger');
    return;
  }
  
  // Confirmación
  const confirmar = confirm(
    `🏆 ¿ESTÁS SEGURO DE GUARDAR DEFINITIVAMENTE?\n\n` +
    `Estás a punto de guardar TODAS tus predicciones de la fase final.\n` +
    `Total: ${partidosFinal.length} partidos\n\n` +
    `⚠️ Una vez guardadas, NO podrás editarlas nunca más.\n\n` +
    `¿Deseas continuar?`
  );
  
  if (!confirmar) return;
  
  await guardarPredicciones(true);
});

async function guardarPredicciones(bloquear = false) {
  isSaving = true;
  const btnProgress = document.getElementById('btn-save-progress');
  const btnFinal = document.getElementById('btn-save-final');
  const status = document.getElementById('save-status');
  const user = getCurrentUser();
  const institucion = getInstitucionActiva();
  
  if (!institucion) {
    showAlert('Error: No hay institución seleccionada', 'danger');
    isSaving = false;
    return;
  }
  
  btnProgress.disabled = true;
  if (!bloquear) btnFinal.disabled = true;
  status.textContent = 'Guardando...';
  
  try {
    const batch = writeBatch(db);
    let count = 0;
    
    for (const [partidoId, preds] of Object.entries(prediccionesLocales)) {
      if (prediccionesGuardadasIds.has(partidoId)) continue;
      
      const g1 = preds.g1 !== '' ? parseInt(preds.g1) : null;
      const g2 = preds.g2 !== '' ? parseInt(preds.g2) : null;
      if (g1 === null || g2 === null) continue;
      
      const p1 = preds.p1 !== '' ? parseInt(preds.p1) : null;
      const p2 = preds.p2 !== '' ? parseInt(preds.p2) : null;
      
      // Validar que no sea empate sin resolver
      if (g1 === g2) {
        if (p1 === null || p2 === null) continue;
        if (p1 === p2) continue;
      }
      
      const ganador = calcularGanadorAutomatico(partidoId);
      if (!ganador) continue;
      
      // DocID incluye institución: cedula_alias_institucion_partidoId
      const docId = `${user.cedula}_${user.alias}_${institucion}_${partidoId}`;
      batch.set(doc(db, 'predicciones_final', docId), {
        user_id: `${user.cedula}_${user.alias}`,
        institucion: institucion,
        partido_id: partidoId,
        prediccion_equipo1: g1,
        prediccion_equipo2: g2,
        prediccion_penales_equipo1: p1,
        prediccion_penales_equipo2: p2,
        prediccion_ganador: ganador,
        actualizado: new Date().toISOString()
      });
      
      prediccionesGuardadasIds.add(partidoId);
      count++;
    }
    
    if (count === 0) {
      showAlert('No hay nuevas predicciones para guardar', 'info');
      status.textContent = '';
      return;
    }
    
    await batch.commit();
    
    if (bloquear) {
      showAlert(`¡${count} predicciones guardadas definitivamente!`, 'success');
      status.textContent = '✅ Predicciones guardadas. No se pueden editar.';
    } else {
      showAlert(`¡${count} predicciones guardadas!`, 'success');
      status.textContent = `✓ Progreso guardado (${count} partidos). Puedes seguir editando.`;
    }
    
    // Re-renderizar para mostrar estado guardado
    renderizarRondaActual();
    actualizarUI();
    
  } catch (err) {
    console.error(err);
    showAlert('Error al guardar: ' + err.message, 'danger');
    status.textContent = 'Error al guardar. Intenta de nuevo.';
  } finally {
    isSaving = false;
    actualizarBotonesGuardado();
  }
}

function mostrarResumenFinal() {
  let completados = 0;
  let faltan = 0;
  const detalle = [];
  
  for (const ronda of RONDAS) {
    const partidos = partidosPorRonda[ronda] || [];
    let rondaCompletos = 0;
    for (const p of partidos) {
      if (prediccionesGuardadasIds.has(p.id)) {
        rondaCompletos++;
        completados++;
      } else {
        const pred = prediccionesLocales[p.id];
        if (pred && pred.g1 !== '' && pred.g2 !== '') {
          const g1 = parseInt(pred.g1);
          const g2 = parseInt(pred.g2);
          if (g1 === g2) {
            if (pred.p1 !== '' && pred.p2 !== '' && parseInt(pred.p1) !== parseInt(pred.p2)) {
              rondaCompletos++;
              completados++;
            } else {
              faltan++;
            }
          } else {
            rondaCompletos++;
            completados++;
          }
        } else {
          faltan++;
        }
      }
    }
    detalle.push(`${NOMBRES_RONDAS[ronda]}: ${rondaCompletos}/${partidos.length}`);
  }
  
  const total = partidosFinal.length;
  
  if (faltan > 0) {
    alert(
      `⚠️ FALTAN PREDICCIONES\n\n` +
      `Completados: ${completados}/${total}\n` +
      `Faltan: ${faltan} partidos\n\n` +
      `Por ronda:\n${detalle.join('\n')}\n\n` +
      `Regresa y completa los partidos pendientes antes de guardar.`
    );
  } else {
    alert(
      `✅ TODO COMPLETO\n\n` +
      `${completados}/${total} partidos listos\n\n` +
      `Por ronda:\n${detalle.join('\n')}\n\n` +
      `Presiona "Finalizar y Guardar Todo" para confirmar.`
    );
  }
}

// ===== INIT =====
cargarPartidosFinal();
