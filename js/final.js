/* final.js - Fase Final: Bracket completo con cálculo dinámico de equipos */

import { db } from './firebase-config.js';
import { collection, query, getDocs, doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, updateNav, logout, getCurrentUser } from './auth.js';
import { BANDERAS } from './data.js';

const user = requireAuth();
if (!user) throw new Error("No autenticado");

updateNav();
document.getElementById('nav-logout').addEventListener('click', logout);

function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  box.textContent = msg;
  box.className = `alert alert-${type} show`;
  setTimeout(() => box.className = 'alert', 3000);
}

function getFlagUrl(pais) {
  const code = BANDERAS[pais] || 'xx';
  return `https://flagcdn.com/w40/${code}.png`;
}

let partidosFinal = [];
let prediccionesLocales = {};
let prediccionesGuardadasIds = new Set();

// Verificar si fase final está habilitada
async function checkFaseFinal() {
  try {
    const configRef = doc(db, 'config', 'app_config');
    const configSnap = await getDoc(configRef);
    
    if (!configSnap.exists() || !configSnap.data().fase_final_habilitada) {
      document.getElementById('bloqueo-msg').style.display = 'block';
      document.getElementById('final-content').style.display = 'none';
      return false;
    }
    
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

// Calcular qué equipo aparece en un partido basado en las predicciones del usuario
// Si es 16avos, devuelve el nombre real. Si es ronda posterior, revisa la predicción del partido source.
function calcularEquipo(partidoId, esEquipo1) {
  const partido = partidosFinal.find(p => p.id === partidoId);
  if (!partido) return 'Por definir';
  
  // Si es 16avos, el equipo ya está definido
  if (partido.ronda === 'dieciseisavos') {
    return esEquipo1 ? partido.equipo1 : partido.equipo2;
  }
  
  // Para rondas posteriores, revisar predicción del partido source
  const sourceId = esEquipo1 ? partido.source_equipo1 : partido.source_equipo2;
  if (!sourceId) return 'Por definir';
  
  // Si es tercer lugar, necesitamos el PERDEDOR del source
  const esPerdedor = partido.ronda === 'tercer_lugar';
  
  const predSource = prediccionesLocales[sourceId];
  if (!predSource || predSource.g1 === '' || predSource.g2 === '') {
    return `Ganador ${sourceId}`;
  }
  
  const g1 = parseInt(predSource.g1);
  const g2 = parseInt(predSource.g2);
  const p1 = predSource.p1 !== '' ? parseInt(predSource.p1) : null;
  const p2 = predSource.p2 !== '' ? parseInt(predSource.p2) : null;
  const ganador = predSource.ganador;
  
  const sourcePartido = partidosFinal.find(p => p.id === sourceId);
  if (!sourcePartido) return 'Por definir';
  
  // Determinar quién ganó según la predicción del usuario
  let ganadorEquipo = null;
  
  if (g1 > g2) {
    ganadorEquipo = sourcePartido.equipo1;
  } else if (g2 > g1) {
    ganadorEquipo = sourcePartido.equipo2;
  } else if (p1 !== null && p2 !== null) {
    if (p1 > p2) ganadorEquipo = sourcePartido.equipo1;
    else if (p2 > p1) ganadorEquipo = sourcePartido.equipo2;
  } else if (ganador) {
    // Si empataron en 90min pero no puso penales, usar el ganador que eligió
    if (ganador === sourcePartido.equipo1 || ganador === 'equipo1') ganadorEquipo = sourcePartido.equipo1;
    else if (ganador === sourcePartido.equipo2 || ganador === 'equipo2') ganadorEquipo = sourcePartido.equipo2;
  }
  
  if (!ganadorEquipo) return `Ganador ${sourceId}`;
  
  // Para tercer lugar, devolver el perdedor
  if (esPerdedor) {
    return ganadorEquipo === sourcePartido.equipo1 ? sourcePartido.equipo2 : sourcePartido.equipo1;
  }
  
  return ganadorEquipo;
}

// Cargar partidos de fase final
async function cargarPartidosFinal() {
  const habilitada = await checkFaseFinal();
  if (!habilitada) return;
  
  // Mostrar spinner en todos los contenedores
  document.getElementById('final-dieciseisavos').innerHTML = '<div class="spinner"></div>';
  document.getElementById('final-octavos').innerHTML = '<div class="spinner"></div>';
  document.getElementById('final-cuartos').innerHTML = '<div class="spinner"></div>';
  document.getElementById('final-semis').innerHTML = '<div class="spinner"></div>';
  document.getElementById('final-tercer').innerHTML = '<div class="spinner"></div>';
  document.getElementById('final-final').innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_final'));
    const snapshot = await getDocs(q);
    partidosFinal = [];
    snapshot.forEach(d => partidosFinal.push({ id: d.id, ...d.data() }));
    partidosFinal.sort((a, b) => a.numero - b.numero);
    
    await cargarPrediccionesUsuario();
    
    // Renderizar cada ronda
    renderizarRonda('dieciseisavos', 'final-dieciseisavos');
    renderizarRonda('octavos', 'final-octavos');
    renderizarRonda('cuartos', 'final-cuartos');
    renderizarRonda('semis', 'final-semis');
    renderizarRonda('tercer_lugar', 'final-tercer');
    renderizarRonda('final', 'final-final');
    
    // Validar si todo está lleno
    validarCompletitud();
    
  } catch (err) {
    console.error(err);
    document.getElementById('final-dieciseisavos').innerHTML = '<p style="color:var(--danger);">Error cargando partidos</p>';
  }
}

// Renderizar una ronda específica
function renderizarRonda(ronda, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  
  const partidosRonda = partidosFinal.filter(p => p.ronda === ronda).sort((a, b) => a.numero - b.numero);
  let tieneEditables = false;
  
  for (const p of partidosRonda) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.style.flexDirection = 'column';
    card.style.gap = '10px';
    card.dataset.id = p.id;
    
    const jugado = p.jugado;
    const yaGuardado = prediccionesGuardadasIds.has(p.id);
    const bloqueado = jugado || yaGuardado;
    const disabled = bloqueado ? 'disabled' : '';
    
    if (!bloqueado) tieneEditables = true;
    
    // Calcular equipos dinámicamente
    const eq1 = calcularEquipo(p.id, true);
    const eq2 = calcularEquipo(p.id, false);
    
    const localPred = prediccionesLocales[p.id] || {};
    
    card.innerHTML = `
      <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
        <div class="match-team" style="flex:1;">
          <img src="${getFlagUrl(eq1)}" alt="${eq1}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
          <span title="${eq1}">${eq1}</span>
        </div>
        <div class="match-score" style="flex-direction:column; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" min="0" max="20" placeholder="-" style="width:50px; height:40px;"
              data-field="g1" data-id="${p.id}" ${disabled} value="${localPred.g1 ?? ''}">
            <span class="match-separator">:</span>
            <input type="number" min="0" max="20" placeholder="-" style="width:50px; height:40px;"
              data-field="g2" data-id="${p.id}" ${disabled} value="${localPred.g2 ?? ''}">
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
            <input type="number" min="0" max="20" placeholder="Pen" style="width:50px; height:35px; font-size:0.9rem;"
              data-field="p1" data-id="${p.id}" ${disabled} value="${localPred.p1 ?? ''}">
            <span style="font-size:0.75rem; color:var(--text-muted);">Penales</span>
            <input type="number" min="0" max="20" placeholder="Pen" style="width:50px; height:35px; font-size:0.9rem;"
              data-field="p2" data-id="${p.id}" ${disabled} value="${localPred.p2 ?? ''}">
          </div>
        </div>
        <div class="match-team reverse" style="flex:1;">
          <span title="${eq2}">${eq2}</span>
          <img src="${getFlagUrl(eq2)}" alt="${eq2}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
        </div>
      </div>
      <div style="width:100%; text-align:center; margin-top:5px;">
        <label style="color:var(--text-muted); font-size:0.85rem; margin-right:10px;">¿Quién avanza?</label>
        <select data-field="ganador" data-id="${p.id}" ${disabled} style="padding:6px 12px; border-radius:8px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border);">
          <option value="">Seleccionar...</option>
          <option value="${eq1}" ${localPred.ganador === eq1 ? 'selected' : ''}>${eq1}</option>
          <option value="${eq2}" ${localPred.ganador === eq2 ? 'selected' : ''}>${eq2}</option>
        </select>
      </div>
    `;
    
    // Badge de estado
    if (yaGuardado && !jugado) {
      const guardadoBadge = document.createElement('div');
      guardadoBadge.style.cssText = 'position:absolute; top:8px; right:8px; font-size:0.7rem; color:#4caf50; background:rgba(0,0,0,0.6); padding:3px 8px; border-radius:6px; font-weight:bold;';
      guardadoBadge.textContent = '✓ Guardado';
      card.style.position = 'relative';
      card.appendChild(guardadoBadge);
    } else if (jugado) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute; top:8px; right:8px; font-size:0.7rem; color:var(--accent); background:rgba(0,0,0,0.6); padding:3px 8px; border-radius:6px;';
      overlay.textContent = `Resultado: ${p.goles_equipo1 ?? '-'} - ${p.goles_equipo2 ?? '-'}${p.penales_equipo1 !== null ? ` (Pen: ${p.penales_equipo1}-${p.penales_equipo2})` : ''}`;
      card.style.position = 'relative';
      card.appendChild(overlay);
    }
    
    container.appendChild(card);
  }
  
  // Listeners (solo inputs no bloqueados)
  container.querySelectorAll('input:not([disabled]), select:not([disabled])').forEach(el => {
    el.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const field = e.target.dataset.field;
      if (!prediccionesLocales[id]) prediccionesLocales[id] = {};
      prediccionesLocales[id][field] = e.target.value;
      
      // Si cambió un resultado de 16avos, recalcular rondas posteriores
      const partido = partidosFinal.find(p => p.id === id);
      if (partido && partido.ronda === 'dieciseisavos') {
        recalcularRondasPosteriores();
      }
      
      // Validar completitud
      validarCompletitud();
    });
  });
  
  return tieneEditables;
}

// Recalcular y re-renderizar rondas posteriores cuando cambian predicciones de 16avos
function recalcularRondasPosteriores() {
  // Solo recalcular nombres de equipos, no re-renderizar todo para evitar perder inputs actuales
  const rondas = ['octavos', 'cuartos', 'semis', 'tercer_lugar', 'final'];
  
  for (const ronda of rondas) {
    const containerId = `final-${ronda === 'tercer_lugar' ? 'tercer' : ronda}`;
    const container = document.getElementById(containerId);
    if (!container) continue;
    
    const cards = container.querySelectorAll('.match-card');
    cards.forEach(card => {
      const partidoId = card.dataset.id;
      const eq1 = calcularEquipo(partidoId, true);
      const eq2 = calcularEquipo(partidoId, false);
      
      // Actualizar nombres
      const spans = card.querySelectorAll('.match-team span');
      if (spans[0]) spans[0].textContent = eq1;
      if (spans[1]) spans[1].textContent = eq2;
      
      // Actualizar imágenes
      const imgs = card.querySelectorAll('.match-team img');
      if (imgs[0]) imgs[0].src = getFlagUrl(eq1);
      if (imgs[1]) imgs[1].src = getFlagUrl(eq2);
      
      // Actualizar opciones del select
      const select = card.querySelector('select[data-field="ganador"]');
      if (select && !select.disabled) {
        const currentValue = select.value;
        select.innerHTML = `
          <option value="">Seleccionar...</option>
          <option value="${eq1}">${eq1}</option>
          <option value="${eq2}">${eq2}</option>
        `;
        // Restaurar valor si sigue siendo válido
        if (currentValue === eq1 || currentValue === eq2) {
          select.value = currentValue;
        }
      }
    });
  }
}

// Validar que todos los 32 partidos tengan predicción
function validarCompletitud() {
  const btn = document.getElementById('btn-save-final');
  const status = document.getElementById('save-status');
  
  let incompletos = 0;
  for (const p of partidosFinal) {
    const pred = prediccionesLocales[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '' || !pred.ganador) {
      if (!prediccionesGuardadasIds.has(p.id)) {
        incompletos++;
      }
    }
  }
  
  if (incompletos > 0) {
    btn.disabled = true;
    btn.textContent = `⏳ Faltan ${incompletos} predicciones`;
    btn.style.opacity = '0.6';
    status.textContent = `Debes completar los ${incompletos} partidos pendientes para poder guardar.`;
  } else if (Object.keys(prediccionesLocales).length === 0) {
    btn.disabled = true;
    btn.textContent = '💾 Guardar Predicciones Fase Final';
    btn.style.opacity = '0.6';
    status.textContent = 'Completa todas las predicciones del bracket.';
  } else {
    btn.disabled = false;
    btn.textContent = '💾 Guardar Predicciones Fase Final';
    btn.style.opacity = '1';
    status.textContent = '✓ Todas las predicciones completas. Listo para guardar.';
  }
}

// Cargar predicciones del usuario desde Firestore
async function cargarPrediccionesUsuario() {
  try {
    const user = getCurrentUser();
    const q = query(collection(db, 'predicciones_final'));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.user_id === `${user.cedula}_${user.alias}`) {
        prediccionesGuardadasIds.add(data.partido_id);
        prediccionesLocales[data.partido_id] = {
          g1: data.prediccion_equipo1 ?? '',
          g2: data.prediccion_equipo2 ?? '',
          p1: data.prediccion_penales_equipo1 ?? '',
          p2: data.prediccion_penales_equipo2 ?? '',
          ganador: data.prediccion_ganador ?? ''
        };
      }
    });
    
  } catch (err) {
    console.error('Error cargando predicciones final:', err);
  }
}

// Guardar predicciones fase final
document.getElementById('btn-save-final').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-final');
  const status = document.getElementById('save-status');
  const user = getCurrentUser();
  
  btn.disabled = true;
  status.textContent = 'Guardando...';
  
  try {
    // Validar que todo esté completo
    let incompletos = 0;
    for (const p of partidosFinal) {
      const pred = prediccionesLocales[p.id];
      if (!pred || pred.g1 === '' || pred.g2 === '' || !pred.ganador) {
        if (!prediccionesGuardadasIds.has(p.id)) {
          incompletos++;
        }
      }
    }
    
    if (incompletos > 0) {
      showAlert(`Faltan ${incompletos} predicciones por completar`, 'danger');
      status.textContent = '';
      btn.disabled = false;
      return;
    }
    
    const batch = writeBatch(db);
    let countGuardados = 0;
    
    for (const [partidoId, preds] of Object.entries(prediccionesLocales)) {
      // Saltar si ya estaba guardado
      if (prediccionesGuardadasIds.has(partidoId)) continue;
      
      const g1 = preds.g1 !== '' ? parseInt(preds.g1) : null;
      const g2 = preds.g2 !== '' ? parseInt(preds.g2) : null;
      const p1 = preds.p1 !== '' ? parseInt(preds.p1) : null;
      const p2 = preds.p2 !== '' ? parseInt(preds.p2) : null;
      const ganador = preds.ganador || null;
      
      if (g1 === null || g2 === null || !ganador) continue;
      
      const docId = `${user.cedula}_${user.alias}_${partidoId}`;
      const ref = doc(db, 'predicciones_final', docId);
      
      batch.set(ref, {
        user_id: `${user.cedula}_${user.alias}`,
        partido_id: partidoId,
        prediccion_equipo1: g1,
        prediccion_equipo2: g2,
        prediccion_penales_equipo1: p1,
        prediccion_penales_equipo2: p2,
        prediccion_ganador: ganador,
        actualizado: new Date().toISOString()
      });
      
      prediccionesGuardadasIds.add(partidoId);
      countGuardados++;
    }
    
    if (countGuardados === 0) {
      showAlert('No hay nuevas predicciones para guardar', 'info');
      status.textContent = '';
      btn.disabled = false;
      return;
    }
    
    await batch.commit();
    showAlert(`¡${countGuardados} predicciones de fase final guardadas!`, 'success');
    status.textContent = 'Guardado el ' + new Date().toLocaleString();
    
    // Re-renderizar para bloquear inputs
    cargarPartidosFinal();
    
  } catch (err) {
    console.error(err);
    showAlert('Error al guardar', 'danger');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
});

// Init
cargarPartidosFinal();
