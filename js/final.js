/* final.js - Fase Final: predicciones con marcadores y penales */

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

// Cargar partidos de fase final
async function cargarPartidosFinal() {
  const habilitada = await checkFaseFinal();
  if (!habilitada) return;
  
  const container = document.getElementById('final-matches');
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_final'));
    const snapshot = await getDocs(q);
    partidosFinal = [];
    snapshot.forEach(d => partidosFinal.push({ id: d.id, ...d.data() }));
    partidosFinal.sort((a, b) => a.numero - b.numero);
    
    await cargarPrediccionesUsuario();
    
    container.innerHTML = '';
    let tienePartidosEditables = false;
    
    for (const p of partidosFinal) {
      const card = document.createElement('div');
      card.className = 'match-card';
      card.style.flexDirection = 'column';
      card.style.gap = '10px';
      card.dataset.id = p.id;
      
      const jugado = p.jugado;
      const yaGuardado = prediccionesGuardadasIds.has(p.id);
      const bloqueado = jugado || yaGuardado;
      const disabled = bloqueado ? 'disabled' : '';
      
      if (!bloqueado) tienePartidosEditables = true;
      
      // Determinar qué equipos mostrar (si ya hay reales o placeholders)
      const eq1 = p.equipo1 || 'Por definir';
      const eq2 = p.equipo2 || 'Por definir';
      
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
      });
    });
    
    // Deshabilitar botón si no hay partidos editables
    const btnSave = document.getElementById('btn-save-final');
    if (!tienePartidosEditables) {
      btnSave.disabled = true;
      btnSave.textContent = '✓ Todas las predicciones guardadas';
      btnSave.style.opacity = '0.6';
      document.getElementById('save-status').textContent = 'Ya guardaste todas tus predicciones. Espera los resultados oficiales.';
    } else {
      btnSave.disabled = false;
      btnSave.textContent = '💾 Guardar Predicciones Fase Final';
      btnSave.style.opacity = '1';
      document.getElementById('save-status').textContent = '';
    }
    
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:var(--danger);">Error cargando partidos</p>';
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
      if (data.user_id === user.cedula) {
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
      
      if (g1 === null || g2 === null) continue;
      
      const docId = `${user.cedula}_${partidoId}`;
      const ref = doc(db, 'predicciones_final', docId);
      
      batch.set(ref, {
        user_id: user.cedula,
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
