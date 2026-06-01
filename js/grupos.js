/* grupos.js - Fase de Grupos: carga partidos y guarda predicciones */

import { db } from './firebase-config.js';
import { collection, query, getDocs, doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, updateNav, logout, getCurrentUser } from './auth.js';
import { GRUPOS, BANDERAS } from './data.js';

// Verificar sesión
const user = requireAuth();
if (!user) throw new Error("No autenticado");

updateNav();
document.getElementById('nav-logout').addEventListener('click', logout);

// Mostrar alertas
function showAlert(msg, type) {
  const box = document.getElementById('alert-box');
  box.textContent = msg;
  box.className = `alert alert-${type} show`;
  setTimeout(() => box.className = 'alert', 3000);
}

// Obtener URL de bandera
function getFlagUrl(pais) {
  const code = BANDERAS[pais] || 'xx';
  return `https://flagcdn.com/w40/${code}.png`;
}

// Estado local
let partidosData = [];
let prediccionesLocales = {};
let prediccionesGuardadasIds = new Set(); // IDs de partidos ya guardados en Firestore

// Cargar partidos desde Firestore
async function cargarPartidos() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_grupos'));
    const snapshot = await getDocs(q);
    partidosData = [];
    snapshot.forEach(doc => {
      partidosData.push({ id: doc.id, ...doc.data() });
    });
    
    // Ordenar: por grupo, luego por fecha
    const ordenGrupos = 'ABCDEFGHIJKL';
    partidosData.sort((a, b) => {
      const idxA = ordenGrupos.indexOf(a.grupo);
      const idxB = ordenGrupos.indexOf(b.grupo);
      if (idxA !== idxB) return idxA - idxB;
      return (a.fecha || 0) - (b.fecha || 0);
    });
    
    await cargarPrediccionesUsuario();
    renderizarGrupos();
    
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="text-align:center; color:var(--danger);">Error cargando partidos</p>';
  }
}

// Renderizar grupos y partidos
function renderizarGrupos() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';
  
  const gruposOrden = 'ABCDEFGHIJKL'.split('');
  let tienePartidosEditables = false;
  
  for (const grupo of gruposOrden) {
    const partidosGrupo = partidosData.filter(p => p.grupo === grupo);
    if (partidosGrupo.length === 0) continue;
    
    const section = document.createElement('div');
    section.className = 'group-section';
    
    const title = document.createElement('h3');
    title.className = 'group-title';
    title.textContent = `Grupo ${grupo}`;
    section.appendChild(title);
    
    const grid = document.createElement('div');
    grid.className = 'matches-grid';
    
    for (const partido of partidosGrupo) {
      const card = document.createElement('div');
      card.className = 'match-card';
      card.dataset.id = partido.id;
      
      const jugado = partido.jugado;
      const yaGuardado = prediccionesGuardadasIds.has(partido.id);
      const bloqueado = jugado || yaGuardado;
      const disabled = bloqueado ? 'disabled' : '';
      
      if (!bloqueado) tienePartidosEditables = true;
      
      card.innerHTML = `
        <div class="match-team">
          <img src="${getFlagUrl(partido.equipo1)}" alt="${partido.equipo1}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
          <span title="${partido.equipo1}">${partido.equipo1}</span>
        </div>
        <div class="match-score">
          <input type="number" min="0" max="20" placeholder="-" data-field="e1" data-id="${partido.id}" ${disabled} value="${prediccionesLocales[partido.id]?.e1 ?? ''}">
          <span class="match-separator">:</span>
          <input type="number" min="0" max="20" placeholder="-" data-field="e2" data-id="${partido.id}" ${disabled} value="${prediccionesLocales[partido.id]?.e2 ?? ''}">
        </div>
        <div class="match-team reverse">
          <span title="${partido.equipo2}">${partido.equipo2}</span>
          <img src="${getFlagUrl(partido.equipo2)}" alt="${partido.equipo2}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
        </div>
      `;
      
      // Badge de estado
      if (yaGuardado && !jugado) {
        const guardadoBadge = document.createElement('div');
        guardadoBadge.style.cssText = 'position:absolute; right:10px; top:5px; font-size:0.7rem; color:#4caf50; background:rgba(0,0,0,0.6); padding:2px 8px; border-radius:8px; font-weight:bold;';
        guardadoBadge.textContent = '✓ Guardado';
        card.style.position = 'relative';
        card.appendChild(guardadoBadge);
      } else if (jugado) {
        const resultOverlay = document.createElement('div');
        resultOverlay.style.cssText = 'position:absolute; right:10px; top:5px; font-size:0.75rem; color:var(--accent); background:rgba(0,0,0,0.5); padding:2px 8px; border-radius:8px;';
        resultOverlay.textContent = `Resultado: ${partido.goles_equipo1 ?? '-'} - ${partido.goles_equipo2 ?? '-'}`;
        card.style.position = 'relative';
        card.appendChild(resultOverlay);
      }
      
      grid.appendChild(card);
    }
    
    section.appendChild(grid);
    container.appendChild(section);
  }
  
  // Agregar listeners a inputs (solo si no están bloqueados)
  document.querySelectorAll('.match-score input:not([disabled])').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const field = e.target.dataset.field;
      if (!prediccionesLocales[id]) prediccionesLocales[id] = {};
      prediccionesLocales[id][field] = e.target.value;
    });
  });
  
  // Deshabilitar botón si no hay partidos editables
  const btnSave = document.getElementById('btn-save');
  if (!tienePartidosEditables) {
    btnSave.disabled = true;
    btnSave.textContent = '✓ Todas las predicciones guardadas';
    btnSave.style.opacity = '0.6';
    document.getElementById('save-status').textContent = 'Ya guardaste todas tus predicciones. Espera los resultados oficiales.';
  } else {
    btnSave.disabled = false;
    btnSave.textContent = '💾 Guardar Predicciones';
    btnSave.style.opacity = '1';
    document.getElementById('save-status').textContent = '';
  }
}

// Cargar predicciones del usuario desde Firestore
async function cargarPrediccionesUsuario() {
  try {
    const user = getCurrentUser();
    const q = query(collection(db, 'predicciones_grupos'));
    const snapshot = await getDocs(q);
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.user_id === user.cedula) {
        prediccionesGuardadasIds.add(data.partido_id);
        prediccionesLocales[data.partido_id] = {
          e1: data.prediccion_equipo1 ?? '',
          e2: data.prediccion_equipo2 ?? ''
        };
      }
    });
    
  } catch (err) {
    console.error('Error cargando predicciones:', err);
  }
}

// Guardar predicciones
async function guardarPredicciones() {
  const btn = document.getElementById('btn-save');
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
      
      const e1 = preds.e1 !== '' ? parseInt(preds.e1) : null;
      const e2 = preds.e2 !== '' ? parseInt(preds.e2) : null;
      
      if (e1 === null || e2 === null) continue;
      
      const docId = `${user.cedula}_${partidoId}`;
      const ref = doc(db, 'predicciones_grupos', docId);
      
      batch.set(ref, {
        user_id: user.cedula,
        partido_id: partidoId,
        prediccion_equipo1: e1,
        prediccion_equipo2: e2,
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
    showAlert(`¡${countGuardados} predicciones guardadas correctamente!`, 'success');
    status.textContent = 'Guardado el ' + new Date().toLocaleString();
    
    // Re-renderizar para bloquear inputs
    renderizarGrupos();
    
  } catch (err) {
    console.error(err);
    showAlert('Error al guardar. Intenta de nuevo.', 'danger');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

// Verificar si fase final está habilitada
async function checkFaseFinal() {
  try {
    const configRef = doc(db, 'config', 'app_config');
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
      const data = configSnap.data();
      const tabFinal = document.getElementById('tab-final');
      if (!data.fase_final_habilitada) {
        tabFinal.classList.add('disabled');
        tabFinal.href = '#';
        tabFinal.title = 'La fase final aún no está habilitada';
      }
    }
  } catch (e) {
    console.error(e);
  }
}

// Init
cargarPartidos();
checkFaseFinal();

document.getElementById('btn-save').addEventListener('click', guardarPredicciones);
