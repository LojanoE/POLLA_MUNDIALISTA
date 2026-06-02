/* admin.js - Panel de Administración con Sistema de Pasos y Manejo de Errores Premium */

import { db } from './firebase-config.js';
import { collection, query, getDocs, doc, getDoc, setDoc, writeBatch, updateDoc, deleteDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin, updateNav, logout, getCurrentUser } from './auth.js';
import { BANDERAS, GRUPOS, generarPartidosGrupos, generarPartidosFinal, calcularTablaGrupo, seleccionarMejoresTerceros, placeholderToEquipo } from './data.js';

const user = requireAdmin();
if (!user) throw new Error("No autorizado");

updateNav();
document.getElementById('nav-logout').addEventListener('click', logout);

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

// Estado global
let partidosGruposData = {};
let partidosFinalData = {};
let resultadosGrupos = {};
let resultadosFinal = {};           // { partidoId: { g1, g2, p1, p2, eq1, eq2, jugador } }
let prediccionesLocales = {};       // Para validaciones
let rondaActualIndex = 0;
let partidosFinalPorRonda = {};
let isSaving = false;

// ===== TOAST NOTIFICATIONS =====
function showToast(title, message, type = 'info', duration = 5000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showAlert(msg, type) {
  showToast(type === 'danger' ? 'Error' : type === 'success' ? 'Éxito' : 'Aviso', msg, type === 'danger' ? 'error' : type);
}

// ===== MODAL SYSTEM =====
function showModal(options) {
  const overlay = document.getElementById('modal-overlay');
  const icon = document.getElementById('modal-icon');
  const title = document.getElementById('modal-title');
  const message = document.getElementById('modal-message');
  const btnPrimary = document.getElementById('modal-btn-primary');
  const btnSecondary = document.getElementById('modal-btn-secondary');
  
  icon.textContent = options.icon || '✅';
  title.textContent = options.title || '';
  message.innerHTML = options.message || '';
  
  btnPrimary.textContent = options.btnPrimaryText || 'Aceptar';
  btnPrimary.className = options.btnPrimaryClass || 'btn btn-primary';
  
  if (options.btnSecondaryText) {
    btnSecondary.textContent = options.btnSecondaryText;
    btnSecondary.style.display = 'inline-block';
    btnSecondary.className = options.btnSecondaryClass || 'btn btn-secondary';
  } else {
    btnSecondary.style.display = 'none';
  }
  
  btnPrimary.onclick = () => {
    overlay.classList.add('hidden');
    if (options.onPrimary) options.onPrimary();
  };
  
  btnSecondary.onclick = () => {
    overlay.classList.add('hidden');
    if (options.onSecondary) options.onSecondary();
  };
  
  overlay.classList.remove('hidden');
  btnPrimary.focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ===== VERIFICACIÓN Y CARGA =====
async function checkFaseFinalHabilitada() {
  const configRef = doc(db, 'config', 'app_config');
  const configSnap = await getDoc(configRef);
  if (configSnap.exists()) {
    const data = configSnap.data();
    document.getElementById('toggle-fase-final').checked = !!data.fase_final_habilitada;
    document.getElementById('status-fase-final').textContent = data.fase_final_habilitada ? 'Habilitada' : 'Deshabilitada';
  }
}

async function cargarPartidosGrupos() {
  const container = document.getElementById('admin-grupos-container');
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_grupos'));
    const snapshot = await getDocs(q);
    container.innerHTML = '';
    
    if (snapshot.empty) {
      container.innerHTML = '<p style="color: var(--text-muted);">No hay partidos de grupos. Carga los partidos primero.</p>';
      return;
    }
    
    // Guardar datos
    partidosGruposData = {};
    snapshot.forEach(d => partidosGruposData[d.id] = d.data());
    
    // Agrupar por grupo
    const grupos = {};
    for (const [id, data] of Object.entries(partidosGruposData)) {
      if (!grupos[data.grupo]) grupos[data.grupo] = [];
      grupos[data.grupo].push({ id, ...data });
    }
    
    const gruposOrden = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    
    for (const grupo of gruposOrden) {
      if (!grupos[grupo]) continue;
      
      const sorted = grupos[grupo].sort((a, b) => a.numero - b.numero);
      
      const title = document.createElement('h4');
      title.style.cssText = 'color: var(--accent); margin: 20px 0 10px; font-size: 1.1rem;';
      title.textContent = `Grupo ${grupo}`;
      container.appendChild(title);
      
      for (const p of sorted) {
        resultadosGrupos[p.id] = {
          g1: p.goles_equipo1 ?? '',
          g2: p.goles_equipo2 ?? '',
          eq1: p.equipo1,
          eq2: p.equipo2
        };
        
        const div = document.createElement('div');
        div.className = 'admin-match-input';
        div.dataset.id = p.id;
        div.style.flexWrap = 'wrap';
        div.style.gap = '15px';
        
        const eq1Flag = getFlagUrl(p.equipo1);
        const eq2Flag = getFlagUrl(p.equipo2);
        const yaJugado = p.jugado ? 'disabled' : '';
        
        div.innerHTML = `
          <div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <small style="color:var(--text-muted);">${p.id}</small>
            <span style="color:var(--accent); font-size:0.8rem;">${p.grupo}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:150px;">
            <img src="${eq1Flag}" style="width:28px; height:20px; border-radius:3px;" onerror="this.src='https://flagcdn.com/w40/xx.png'">
            <span style="font-weight:600; flex:1;">${p.equipo1}</span>
          </div>
          <div style="display:flex; align-items:center; gap:5px; flex:0 0 auto;">
            <input type="number" min="0" max="20" style="width:50px; height:36px; text-align:center;"
              data-id="${p.id}" data-field="g1" value="${p.goles_equipo1 ?? ''}" ${yaJugado} placeholder="0">
            <span>:</span>
            <input type="number" min="0" max="20" style="width:50px; height:36px; text-align:center;"
              data-id="${p.id}" data-field="g2" value="${p.goles_equipo2 ?? ''}" ${yaJugado} placeholder="0">
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:150px; justify-content:flex-end;">
            <span style="font-weight:600; text-align:right; flex:1;">${p.equipo2}</span>
            <img src="${eq2Flag}" style="width:28px; height:20px; border-radius:3px;" onerror="this.src='https://flagcdn.com/w40/xx.png'">
          </div>
        `;
        
        container.appendChild(div);
      }
    }
    
    // Attach listeners
    container.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const field = e.target.dataset.field;
        if (!resultadosGrupos[id]) resultadosGrupos[id] = {};
        resultadosGrupos[id][field] = e.target.value === '' ? null : parseInt(e.target.value);
      });
    });
    
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:var(--danger);">Error cargando partidos de grupos</p>';
    showToast('Error', 'No se pudieron cargar los partidos de grupos', 'error');
  }
}

function getFlagUrl(pais) {
  if (!pais) return 'https://flagcdn.com/w40/xx.png';
  const code = BANDERAS[pais] || 'xx';
  return `https://flagcdn.com/w40/${code}.png`;
}

// Toggle fase final
document.getElementById('toggle-fase-final').addEventListener('change', async (e) => {
  try {
    const configRef = doc(db, 'config', 'app_config');
    await setDoc(configRef, { fase_final_habilitada: e.target.checked }, { merge: true });
    document.getElementById('status-fase-final').textContent = e.target.checked ? 'Habilitada' : 'Deshabilitada';
    showToast('Éxito', `Fase final ${e.target.checked ? 'habilitada' : 'deshabilitada'}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Error', 'No se pudo cambiar el estado', 'error');
  }
});

// Guardar resultados de grupos
document.getElementById('btn-save-grupos').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-grupos');
  btn.disabled = true;
  
  try {
    const batch = writeBatch(db);
    let count = 0;
    
    for (const [id, vals] of Object.entries(resultadosGrupos)) {
      const g1 = vals.g1 !== null && vals.g1 !== undefined ? parseInt(vals.g1) : null;
      const g2 = vals.g2 !== null && vals.g2 !== undefined ? parseInt(vals.g2) : null;
      
      if (g1 !== null && g2 !== null) {
        const ref = doc(db, 'partidos_grupos', id);
        batch.update(ref, {
          goles_equipo1: g1,
          goles_equipo2: g2,
          jugado: true
        });
        count++;
      }
    }
    
    if (count === 0) {
      showModal({
        icon: '⚠️',
        title: 'Sin cambios',
        message: 'No hay resultados nuevos para guardar.',
        btnPrimaryText: 'Entendido',
        btnPrimaryClass: 'btn btn-primary'
      });
      btn.disabled = false;
      return;
    }
    
    await batch.commit();
    
    // Recalcular puntos automáticamente
    showToast('Info', 'Recalculando puntos...', 'info', 2000);
    await recalcularTodosLosPuntos();
    
    showModal({
      icon: '✅',
      title: '¡Resultados Guardados!',
      message: `Se guardaron los resultados de <b>${count} partidos</b> de la fase de grupos.<br><br>Los puntos de todos los participantes han sido recalculados automáticamente.`,
      btnPrimaryText: 'Continuar',
      btnPrimaryClass: 'btn btn-success'
    });
    
    await cargarPartidosGrupos();
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// Recalcular TODOS los puntos (automático después de cada guardado)
async function recalcularTodosLosPuntos() {
  try {
    // 1. Obtener todos los usuarios
    const usersSnap = await getDocs(collection(db, 'users'));
    const usuarios = [];
    usersSnap.forEach(d => usuarios.push({ id: d.id, ...d.data() }));
    
    // 2. Obtener partidos de grupos jugados
    const partidosGruposSnap = await getDocs(collection(db, 'partidos_grupos'));
    const partidosGrupos = {};
    partidosGruposSnap.forEach(d => {
      const data = d.data();
      if (data.jugado) partidosGrupos[d.id] = data;
    });
    
    // 3. Obtener predicciones de grupos
    const predsGruposSnap = await getDocs(collection(db, 'predicciones_grupos'));
    const predsGrupos = {};
    predsGruposSnap.forEach(d => {
      const data = d.data();
      if (!predsGrupos[data.user_id]) predsGrupos[data.user_id] = {};
      predsGrupos[data.user_id][data.partido_id] = data;
    });
    
    // 4. Calcular puntos de fase de grupos
    const puntosPorUsuario = {};
    
    for (const u of usuarios) {
      let ptsGrupos = 0;
      const preds = predsGrupos[u.id] || {};
      
      for (const [partidoId, partido] of Object.entries(partidosGrupos)) {
        const pred = preds[partidoId];
        if (!pred) continue;
        
        const g1 = partido.goles_equipo1;
        const g2 = partido.goles_equipo2;
        const p1 = pred.prediccion_equipo1;
        const p2 = pred.prediccion_equipo2;
        
        if (p1 === g1 && p2 === g2) ptsGrupos += 3;
        else if ((g1 > g2 && p1 > p2) || (g2 > g1 && p2 > p1) || (g1 === g2 && p1 === p2)) ptsGrupos += 1;
      }
      
      puntosPorUsuario[u.id] = { puntosGrupos: ptsGrupos, puntosFinal: u.puntos_fase_final || 0 };
    }
    
    // 5. Calcular puntos de fase final
    const partidosFinalSnap = await getDocs(collection(db, 'partidos_final'));
    const allPartidosFinal = {};
    partidosFinalSnap.forEach(d => allPartidosFinal[d.id] = d.data());
    
    const partidosFinalJugados = {};
    for (const [id, p] of Object.entries(allPartidosFinal)) {
      if (p.jugado) partidosFinalJugados[id] = p;
    }
    
    const predsFinalSnap = await getDocs(collection(db, 'predicciones_final'));
    const predsFinal = {};
    predsFinalSnap.forEach(d => {
      const data = d.data();
      if (!predsFinal[data.user_id]) predsFinal[data.user_id] = {};
      predsFinal[data.user_id][data.partido_id] = data;
    });
    
    const getGanadorReal = (partido) => {
      if (!partido.jugado) return null;
      const g1 = partido.goles_equipo1;
      const g2 = partido.goles_equipo2;
      if (g1 > g2) return partido.equipo1;
      if (g2 > g1) return partido.equipo2;
      const p1 = partido.penales_equipo1;
      const p2 = partido.penales_equipo2;
      if (p1 !== null && p2 !== null && p1 !== p2) {
        return p1 > p2 ? partido.equipo1 : partido.equipo2;
      }
      return null;
    };
    
    const getPerdedorReal = (partido) => {
      const ganador = getGanadorReal(partido);
      if (!ganador) return null;
      return ganador === partido.equipo1 ? partido.equipo2 : partido.equipo1;
    };
    
    for (const u of usuarios) {
      let ptsFinal = 0;
      const preds = predsFinal[u.id] || {};
      
      for (const [partidoId, partido] of Object.entries(partidosFinalJugados)) {
        const pred = preds[partidoId];
        if (!pred) continue;
        
        const g1 = partido.goles_equipo1;
        const g2 = partido.goles_equipo2;
        const p1 = pred.prediccion_equipo1;
        const p2 = pred.prediccion_equipo2;
        const pg1 = pred.prediccion_penales_equipo1;
        const pg2 = pred.prediccion_penales_equipo2;
        
        let ptsPartido = 0;
        
        if (p1 === g1 && p2 === g2) ptsPartido += 3;
        else if (g1 === g2 && p1 === p2) ptsPartido += 1;
        else if ((g1 > g2 && p1 > p2) || (g2 > g1 && p2 > p1)) ptsPartido += 1;
        
        if (g1 === g2) {
          const rp1 = partido.penales_equipo1;
          const rp2 = partido.penales_equipo2;
          if (rp1 !== null && rp2 !== null && pg1 !== undefined && pg2 !== undefined) {
            if (pg1 === rp1 && pg2 === rp2) ptsPartido += 3;
            else {
              const realGan = rp1 > rp2 ? 'equipo1' : 'equipo2';
              const predGan = pg1 > pg2 ? 'equipo1' : 'equipo2';
              if (realGan === predGan) ptsPartido += 1;
            }
          }
        }
        
        const realGanador = getGanadorReal(partido);
        const predGanador = pred.prediccion_ganador;
        if (realGanador && predGanador && realGanador === predGanador) ptsPartido += 1;
        
        ptsFinal += ptsPartido;
      }
      
      puntosPorUsuario[u.id].puntosFinal = ptsFinal;
    }
    
    // 6. Guardar puntos en Firestore
    const batch = writeBatch(db);
    for (const [userId, pts] of Object.entries(puntosPorUsuario)) {
      const ref = doc(db, 'users', userId);
      batch.update(ref, {
        puntos_fase_grupos: pts.puntosGrupos,
        puntos_fase_final: pts.puntosFinal,
        puntos_total: pts.puntosGrupos + pts.puntosFinal
      });
    }
    await batch.commit();
    
    showToast('Puntos Recalculados', `Puntajes actualizados para ${usuarios.length} participantes`, 'success', 3000);
    
  } catch (err) {
    console.error('Error recalculando puntos:', err);
    showToast('Error', 'No se pudieron recalcular los puntos: ' + err.message, 'error');
  }
}

// ===== FASE FINAL: SISTEMA DE PASOS =====
async function cargarPartidosFinal() {
  const container = document.getElementById('round-container');
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_final'));
    const snapshot = await getDocs(q);
    partidosFinalData = [];
    
    snapshot.forEach(d => partidosFinalData.push({ id: d.id, ...d.data() }));
    partidosFinalData.sort((a, b) => a.numero - b.numero);
    
    // Organizar por ronda
    partidosFinalPorRonda = {};
    for (const r of RONDAS) partidosFinalPorRonda[r] = [];
    for (const p of partidosFinalData) {
      if (partidosFinalPorRonda[p.ronda]) {
        partidosFinalPorRonda[p.ronda].push(p);
      }
    }
    
    // Inicializar resultados
    resultadosFinal = {};
    for (const p of partidosFinalData) {
      resultadosFinal[p.id] = {
        g1: p.goles_equipo1 ?? '',
        g2: p.goles_equipo2 ?? '',
        p1: p.penales_equipo1 ?? '',
        p2: p.penales_equipo2 ?? '',
        eq1: p.equipo1,
        eq2: p.equipo2,
        jugado: p.jugado
      };
    }
    
    await cargarPrediccionesUsuario();
    renderizarRondaActual();
    actualizarUI();
    
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:var(--danger);">Error cargando partidos finales</p>';
    showToast('Error', 'No se pudieron cargar los partidos de fase final', 'error');
  }
}

async function cargarPrediccionesUsuario() {
  // Para validaraciones, necesitamos las predicciones de TODOS los usuarios
  const predsGruposSnap = await getDocs(collection(db, 'predicciones_grupos'));
  prediccionesLocales = {};
  predsGruposSnap.forEach(d => {
    const data = d.data();
    prediccionesLocales[data.partido_id] = data;
  });
}

function calcularEquipoDinamico(partidoId, esEquipo1) {
  const partido = partidosFinalData.find(p => p.id === partidoId);
  if (!partido) return 'Por definir';
  
  // Dieciseisavos: usar equipo real de la BD
  if (partido.ronda === 'dieciseisavos') {
    return esEquipo1 ? partido.equipo1 : partido.equipo2;
  }
  
  // Extraer source del placeholder
  let sourceId = null;
  if (partido.ronda === 'tercer_lugar') {
    sourceId = esEquipo1 ? partido.source_equipo1 : partido.source_equipo2;
  } else {
    sourceId = esEquipo1 ? partido.source_equipo1 : partido.source_equipo2;
  }
  
  if (!sourceId) {
    // Extraer del nombre del placeholder
    const equipoNombre = esEquipo1 ? partido.equipo1 : partido.equipo2;
    const match = equipoNombre.match(/(F\d+)/);
    if (match) sourceId = match[1];
  }
  
  if (!sourceId) return 'Por definir';
  
  // Obtener resultado del partido source
  const resultSource = resultadosFinal[sourceId];
  if (!resultSource || resultSource.g1 === '' || resultSource.g2 === '') {
    return esEquipo1 ? `Ganador ${sourceId}` : `Ganador ${sourceId}`;
  }
  
  const g1 = resultSource.g1;
  const g2 = resultSource.g2;
  const p1 = resultSource.p1 !== '' ? parseInt(resultSource.p1) : null;
  const p2 = resultSource.p2 !== '' ? parseInt(resultSource.p2) : null;
  
  const sourcePartido = partidosFinalData.find(p => p.id === sourceId);
  if (!sourcePartido) return 'Por definir';
  
  // Calcular ganador real
  let ganador = null;
  if (g1 > g2) {
    ganador = sourcePartido.equipo1;
  } else if (g2 > g1) {
    ganador = sourcePartido.equipo2;
  } else if (p1 !== null && p2 !== null && p1 !== p2) {
    ganador = p1 > p2 ? sourcePartido.equipo1 : sourcePartido.equipo2;
  }
  
  if (!ganador) return `Ganador ${sourceId}`;
  
  // Para tercer lugar, devolver el perdedor
  if (partido.ronda === 'tercer_lugar') {
    return ganador === sourcePartido.equipo1 ? sourcePartido.equipo2 : sourcePartido.equipo1;
  }
  
  return ganador;
}

function renderizarRondaActual() {
  const ronda = RONDAS[rondaActualIndex];
  const container = document.getElementById('round-container');
  const partidos = partidosFinalPorRonda[ronda] || [];
  
  let html = `<h3 style="text-align:center; margin-bottom: 20px; color: var(--accent);">${NOMBRES_RONDAS[ronda]}</h3>`;
  html += '<div style="display: grid; gap: 12px;">';
  
  for (const p of partidos) {
    const eq1Calculado = calcularEquipoDinamico(p.id, true);
    const eq2Calculado = calcularEquipoDinamico(p.id, false);
    const yaJugado = resultadosFinal[p.id]?.jugado;
    const pred = resultadosFinal[p.id] || {};
    const g1 = pred.g1 ?? '';
    const g2 = pred.g2 ?? '';
    const p1 = pred.p1 ?? '';
    const p2 = pred.p2 ?? '';
    
    // Verificar si mostrar penales
    const g1Num = g1 !== '' ? parseInt(g1) : null;
    const g2Num = g2 !== '' ? parseInt(g2) : null;
    const esEmpate = g1Num !== null && g2Num !== null && g1Num === g2Num;
    const mostrarPenales = esEmpate;
    const penalesClass = mostrarPenales ? 'visible' : '';
    
    // Validación
    let validationClass = '';
    if (yaJugado) {
      validationClass = 'validation-success';
    } else if (g1Num !== null && g2Num !== null) {
      if (g1Num === g2Num && (p1 === '' || p2 === '' || parseInt(p1) === parseInt(p2))) {
        validationClass = 'validation-error';
      }
    }
    
    html += `
      <div class="admin-match-input ${validationClass}" data-id="${p.id}" data-ronda="${ronda}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <small style="color:var(--text-muted);">${p.id} — Ronda #${p.numero}</small>
          ${yaJugado ? '<span style="color:#4caf50; font-size:0.8rem;">✓ Jugado</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">Pendiente</span>'}
        </div>
        <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
          <div style="flex:1; min-width:140px; display:flex; align-items:center; gap:8px;">
            <img src="${getFlagUrl(eq1Calculado)}" style="width:32px; height:24px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none'">
            <span style="font-weight:600; font-size:0.95rem;">${eq1Calculado}</span>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; min-width:130px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <input type="number" min="0" max="20" style="width:55px; height:42px; text-align:center; font-size:1.1rem;"
                data-field="g1" data-id="${p.id}" value="${g1}" ${yaJugado ? 'disabled' : ''} placeholder="0">
              <span style="font-size:1.2rem;">:</span>
              <input type="number" min="0" max="20" style="width:55px; height:42px; text-align:center; font-size:1.1rem;"
                data-field="g2" data-id="${p.id}" value="${g2}" ${yaJugado ? 'disabled' : ''} placeholder="0">
            </div>
            <div class="penales-box ${penalesClass}" style="display:${mostrarPenales ? 'flex' : 'none'};">
              <input type="number" min="0" max="20" style="width:45px; height:35px; text-align:center; font-size:0.95rem;"
                data-field="p1" data-id="${p.id}" value="${p1}" ${yaJugado ? 'disabled' : ''} placeholder="Pen">
              <span style="font-size:0.75rem; color:var(--text-muted);">Penales</span>
              <input type="number" min="0" max="20" style="width:45px; height:35px; text-align:center; font-size:0.95rem;"
                data-field="p2" data-id="${p.id}" value="${p2}" ${yaJugado ? 'disabled' : ''} placeholder="Pen">
            </div>
          </div>
          <div style="flex:1; min-width:140px; display:flex; align-items:center; gap:8px; justify-content:flex-end;">
            <span style="font-weight:600; font-size:0.95rem; text-align:right;">${eq2Calculado}</span>
            <img src="${getFlagUrl(eq2Calculado)}" style="width:32px; height:24px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none'">
          </div>
        </div>
        ${esEmpate && (p1 === '' || p2 === '' || parseInt(p1) === parseInt(p2)) ? `
          <div style="margin-top:8px; padding:6px 10px; background:rgba(231,76,60,0.2); border-radius:6px; font-size:0.8rem; color:#e74c3c;">
            ⚠️ Si hay empate, los penales son obligatorios y no pueden ser iguales
          </div>
        ` : ''}
      </div>
    `;
  }
  
  html += '</div>';
  container.innerHTML = html;
  
  // Attach listeners
  container.querySelectorAll('input:not([disabled])').forEach(inp => {
    inp.addEventListener('change', handleInputChange);
    inp.addEventListener('input', handleInputChange);
  });
}

function handleInputChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  const value = e.target.value;
  
  if (!resultadosFinal[id]) resultadosFinal[id] = {};
  resultadosFinal[id][field] = value;
  
  if (field === 'g1' || field === 'g2') {
    resultadosFinal[id].jugado = false;
  }
  
  // Actualizar visualización de la card
  actualizarCardVisual(id);
}

function actualizarCardVisual(partidoId) {
  const card = document.querySelector(`.admin-match-input[data-id="${partidoId}"]`);
  if (!card) return;
  
  const pred = resultadosFinal[partidoId];
  if (!pred) return;
  
  const g1 = pred.g1 !== '' ? parseInt(pred.g1) : null;
  const g2 = pred.g2 !== '' ? parseInt(pred.g2) : null;
  
  // Actualizar penales
  const penalesBox = card.querySelector('.penales-box');
  if (penalesBox) {
    if (g1 !== null && g2 !== null && g1 === g2) {
      penalesBox.classList.add('visible');
      penalesBox.style.display = 'flex';
    } else {
      penalesBox.classList.remove('visible');
      penalesBox.style.display = 'none';
      // Limpiar penales
      pred.p1 = '';
      pred.p2 = '';
      const p1Input = penalesBox.querySelector('[data-field="p1"]');
      const p2Input = penalesBox.querySelector('[data-field="p2"]');
      if (p1Input) p1Input.value = '';
      if (p2Input) p2Input.value = '';
    }
  }
  
  // Validación
  card.classList.remove('validation-error', 'validation-success');
  if (g1 !== null && g2 !== null) {
    if (g1 === g2 && (pred.p1 === '' || pred.p2 === '' || parseInt(pred.p1) === parseInt(pred.p2))) {
      card.classList.add('validation-error');
    }
  }
}

function actualizarUI() {
  // Tabs
  const tabs = document.querySelectorAll('.step-btn');
  tabs.forEach((tab, idx) => {
    tab.classList.remove('active', 'completed', 'has-errors');
    if (idx === rondaActualIndex) {
      tab.classList.add('active');
    } else if (rondaEstaCompleta(RONDAS[idx])) {
      tab.classList.add('completed');
    } else if (rondaTieneErrores(RONDAS[idx])) {
      tab.classList.add('has-errors');
    }
  });
  
  // Progreso
  const progreso = ((rondaActualIndex + 1) / RONDAS.length) * 100;
  document.getElementById('progress-fill').style.width = `${progreso}%`;
  document.getElementById('progress-text').textContent = `Paso ${rondaActualIndex + 1} de ${RONDAS.length}: ${NOMBRES_RONDAS[RONDAS[rondaActualIndex]]}`;
  
  // Botones navegación
  document.getElementById('btn-prev-round').disabled = rondaActualIndex === 0;
  document.getElementById('btn-next-round').textContent = rondaActualIndex === RONDAS.length - 1 ? 'Revisar Resumen →' : 'Siguiente →';
  
  actualizarEstadoBotonGuardar();
}

function rondaEstaCompleta(ronda) {
  const partidos = partidosFinalPorRonda[ronda] || [];
  for (const p of partidos) {
    if (resultadosFinal[p.id]?.jugado) continue;
    const pred = resultadosFinal[p.id];
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

function rondaTieneErrores(ronda) {
  const partidos = partidosFinalPorRonda[ronda] || [];
  for (const p of partidos) {
    const pred = resultadosFinal[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '') continue;
    const g1 = parseInt(pred.g1);
    const g2 = parseInt(pred.g2);
    if (g1 === g2) {
      if (pred.p1 === '' || pred.p2 === '') return true;
      if (parseInt(pred.p1) === parseInt(pred.p2)) return true;
    }
  }
  return false;
}

function actualizarEstadoBotonGuardar() {
  const btn = document.getElementById('btn-save-round');
  const status = document.getElementById('save-status');
  const ronda = RONDAS[rondaActualIndex];
  const partidos = partidosFinalPorRonda[ronda] || [];
  
  let incompletos = 0;
  let errores = 0;
  
  for (const p of partidos) {
    if (resultadosFinal[p.id]?.jugado) continue;
    const pred = resultadosFinal[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '') {
      incompletos++;
    } else {
      const g1 = parseInt(pred.g1);
      const g2 = parseInt(pred.g2);
      if (g1 === g2) {
        if (pred.p1 === '' || pred.p2 === '') errores++;
        else if (parseInt(pred.p1) === parseInt(pred.p2)) errores++;
      }
    }
  }
  
  const jugados = partidos.filter(p => resultadosFinal[p.id]?.jugado).length;
  
  if (errores > 0) {
    btn.disabled = true;
    status.textContent = `⚠️ ${errores} partido(s) con errores en penales`;
    status.style.color = 'var(--danger)';
  } else if (incompletos > 0) {
    btn.disabled = true;
    status.textContent = `${jugados}/${partidos.length} partidos de ${NOMBRES_RONDAS[ronda]} completados`;
    status.style.color = 'var(--text-muted)';
  } else {
    btn.disabled = false;
    status.textContent = `✓ ${partidos.length} partidos de ${NOMBRES_RONDAS[ronda]} listos para guardar`;
    status.style.color = '#4caf50';
  }
}

// Navegación
function irARonda(index) {
  if (index < 0 || index >= RONDAS.length) return;
  rondaActualIndex = index;
  renderizarRondaActual();
  actualizarUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('btn-prev-round').addEventListener('click', () => irARonda(rondaActualIndex - 1));
document.getElementById('btn-next-round').addEventListener('click', () => {
  if (rondaActualIndex === RONDAS.length - 1) {
    mostrarResumenFinal();
  } else {
    irARonda(rondaActualIndex + 1);
  }
});

document.getElementById('steps-bar').addEventListener('click', (e) => {
  const tab = e.target.closest('.step-btn');
  if (!tab) return;
  const ronda = tab.dataset.ronda;
  const idx = RONDAS.indexOf(ronda);
  if (idx >= 0) irARonda(idx);
});

// Guardar resultados de la ronda actual
document.getElementById('btn-save-round').addEventListener('click', async () => {
  if (isSaving) return;
  
  const ronda = RONDAS[rondaActualIndex];
  const partidos = partidosFinalPorRonda[ronda] || [];
  
  // Validar
  let errores = 0;
  for (const p of partidos) {
    const pred = resultadosFinal[p.id];
    if (!pred || pred.g1 === '' || pred.g2 === '') {
      errores++;
    } else {
      const g1 = parseInt(pred.g1);
      const g2 = parseInt(pred.g2);
      if (g1 === g2) {
        if (pred.p1 === '' || pred.p2 === '' || parseInt(pred.p1) === parseInt(pred.p2)) {
          errores++;
        }
      }
    }
  }
  
  if (errores > 0) {
    showModal({
      icon: '⚠️',
      title: 'No se puede guardar',
      message: `Hay ${errores} partido(s) con errores o incompletos. Corrige los errores antes de guardar.`,
      btnPrimaryText: 'Entendido',
      btnPrimaryClass: 'btn btn-warning'
    });
    return;
  }
  
  // Confirmación
  showModal({
    icon: '💾',
    title: `¿Guardar Resultados de ${NOMBRES_RONDAS[ronda]}?`,
    message: `Se guardarán los resultados de <b>${partidos.length} partidos</b>.<br><br>Los puntos de todos los participantes se recalcularán automáticamente.`,
    btnPrimaryText: '✅ Confirmar y Guardar',
    btnPrimaryClass: 'btn btn-success',
    btnSecondaryText: 'Cancelar',
    btnSecondaryClass: 'btn btn-secondary',
    onPrimary: async () => {
      await guardarRondaActual();
    }
  });
});

async function guardarRondaActual() {
  if (isSaving) return;
  isSaving = true;
  const btn = document.getElementById('btn-save-round');
  const status = document.getElementById('save-status');
  
  btn.disabled = true;
  status.textContent = 'Guardando...';
  
  try {
    const batch = writeBatch(db);
    const ronda = RONDAS[rondaActualIndex];
    const partidos = partidosFinalPorRonda[ronda] || [];
    let count = 0;
    
    for (const p of partidos) {
      const pred = resultadosFinal[p.id];
      if (!pred || pred.g1 === '' || pred.g2 === '') continue;
      
      const g1 = parseInt(pred.g1);
      const g2 = parseInt(pred.g2);
      const p1 = pred.p1 !== '' ? parseInt(pred.p1) : null;
      const p2 = pred.p2 !== '' ? parseInt(pred.p2) : null;
      
      // Determinar ganador
      let ganador = null;
      if (g1 > g2) {
        ganador = 'equipo1';
      } else if (g2 > g1) {
        ganador = 'equipo2';
      } else if (p1 !== null && p2 !== null && p1 !== p2) {
        ganador = p1 > p2 ? 'equipo1' : 'equipo2';
      }
      
      const ref = doc(db, 'partidos_final', p.id);
      const updateData = {
        goles_equipo1: g1,
        goles_equipo2: g2,
        jugado: true,
        ganador: ganador
      };
      
      if (p1 !== null) updateData.penales_equipo1 = p1;
      if (p2 !== null) updateData.penales_equipo2 = p2;
      
      batch.update(ref, updateData);
      
      // Marcar como jugado en local
      resultadosFinal[p.id].jugado = true;
      
      count++;
    }
    
    if (count === 0) {
      showModal({
        icon: '⚠️',
        title: 'Sin cambios',
        message: 'No hay resultados nuevos para guardar.',
        btnPrimaryText: 'Entendido',
        btnPrimaryClass: 'btn btn-primary'
      });
      isSaving = false;
      btn.disabled = false;
      return;
    }
    
    await batch.commit();
    
    // Recalcular puntos automáticamente
    showToast('Info', 'Recalculando puntos de todos los participantes...', 'info', 3000);
    await recalcularTodosLosPuntos();
    
    // Actualizar visualización
    renderizarRondaActual();
    actualizarUI();
    
    showModal({
      icon: '✅',
      title: '¡Guardado Exitoso!',
      message: `Se guardaron los resultados de <b>${count} partidos</b> de ${NOMBRES_RONDAS[ronda]}.<br><br>✅ Los puntos de todos los participantes han sido recalculados.`,
      btnPrimaryText: 'Continuar',
      btnPrimaryClass: 'btn btn-success'
    });
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error al guardar: ' + err.message, 'error');
  } finally {
    isSaving = false;
    btn.disabled = false;
    actualizarEstadoBotonGuardar();
  }
}

function mostrarResumenFinal() {
  let html = '<div style="text-align:center;">';
  html += '<h3 style="color: var(--accent); margin-bottom: 20px;">📊 Resumen de Fase Final</h3>';
  
  for (const ronda of RONDAS) {
    const partidos = partidosFinalPorRonda[ronda] || [];
    const jugados = partidos.filter(p => resultadosFinal[p.id]?.jugado).length;
    const total = partidos.length;
    const icono = jugados === total ? '✅' : jugados > 0 ? '⚠️' : '❌';
    html += `<div style="padding: 10px; margin: 8px 0; background: rgba(255,255,255,0.05); border-radius: 8px;">
      <span style="font-size:1.2rem; margin-right:10px;">${icono}</span>
      <b>${NOMBRES_RONDAS[ronda]}</b>: ${jugados}/${total} partidos jugados
    </div>`;
  }
  
  html += '</div>';
  
  showModal({
    icon: '🏆',
    title: 'Resumen de Fase Final',
    message: html,
    btnPrimaryText: 'Entendido',
    btnPrimaryClass: 'btn btn-primary',
    onPrimary: () => irARonda(RONDAS.length - 1)
  });
}

// ===== INICIALIZACIÓN =====
async function init() {
  await checkFaseFinalHabilitada();
  await cargarPartidosGrupos();
  await cargarPartidosFinal();
}

init();
