/* admin.js - Panel de Administración */

import { db } from './firebase-config.js';
import { collection, query, getDocs, doc, getDoc, setDoc, writeBatch, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin, updateNav, logout, getCurrentUser } from './auth.js';
import { BANDERAS, generarPartidosGrupos, generarPartidosFinal } from './data.js';

// Verificar admin
const user = requireAdmin();
if (!user) throw new Error("No autorizado");

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

let resultadosGrupos = {};
let resultadosFinal = {};

// Cargar configuración
async function cargarConfig() {
  try {
    const configRef = doc(db, 'config', 'app_config');
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById('toggle-fase-final').checked = !!data.fase_final_habilitada;
      document.getElementById('status-fase-final').textContent = data.fase_final_habilitada ? 'Habilitada' : 'Deshabilitada';
    } else {
      // Crear config inicial
      await setDoc(configRef, { fase_actual: 'grupos', fase_final_habilitada: false });
    }
  } catch (err) {
    console.error(err);
  }
}

// Toggle fase final
document.getElementById('toggle-fase-final').addEventListener('change', async (e) => {
  try {
    const configRef = doc(db, 'config', 'app_config');
    await setDoc(configRef, { fase_final_habilitada: e.target.checked }, { merge: true });
    document.getElementById('status-fase-final').textContent = e.target.checked ? 'Habilitada' : 'Deshabilitada';
    showAlert(e.target.checked ? 'Fase Final habilitada' : 'Fase Final deshabilitada', 'success');
  } catch (err) {
    console.error(err);
    showAlert('Error actualizando configuración', 'danger');
  }
});

// Cargar y renderizar partidos de grupos para admin
async function cargarPartidosGrupos() {
  const container = document.getElementById('admin-grupos-container');
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_grupos'));
    const snapshot = await getDocs(q);
    const partidos = [];
    snapshot.forEach(d => partidos.push({ id: d.id, ...d.data() }));
    
    const orden = 'ABCDEFGHIJKL';
    partidos.sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo) || (a.fecha - b.fecha));
    
    container.innerHTML = '';
    let currentGrupo = '';
    
    for (const p of partidos) {
      if (p.grupo !== currentGrupo) {
        currentGrupo = p.grupo;
        const gTitle = document.createElement('h4');
        gTitle.style.cssText = 'color: var(--accent); margin: 20px 0 10px 0; font-size: 1.2rem;';
        gTitle.textContent = `Grupo ${p.grupo}`;
        container.appendChild(gTitle);
      }
      
      const div = document.createElement('div');
      div.className = 'admin-match';
      div.innerHTML = `
        <div class="match-info">
          <div style="display:flex; align-items:center; gap:8px;">
            <img src="${getFlagUrl(p.equipo1)}" style="width:24px; height:18px; border-radius:3px;">
            <strong>${p.equipo1}</strong>
          </div>
        </div>
        <div class="match-score">
          <input type="number" min="0" max="20" style="width:55px; height:36px;" 
            data-id="${p.id}" data-field="g1" value="${p.goles_equipo1 ?? ''}">
          <span class="match-separator">:</span>
          <input type="number" min="0" max="20" style="width:55px; height:36px;" 
            data-id="${p.id}" data-field="g2" value="${p.goles_equipo2 ?? ''}">
        </div>
        <div class="match-info" style="text-align:right;">
          <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end;">
            <strong>${p.equipo2}</strong>
            <img src="${getFlagUrl(p.equipo2)}" style="width:24px; height:18px; border-radius:3px;">
          </div>
        </div>
      `;
      
      container.appendChild(div);
      
      // Guardar en estado local
      resultadosGrupos[p.id] = { g1: p.goles_equipo1, g2: p.goles_equipo2 };
    }
    
    // Listeners
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
    container.innerHTML = '<p style="color:var(--danger);">Error cargando partidos</p>';
  }
}

// Guardar resultados de grupos
document.getElementById('btn-save-grupos').addEventListener('click', async () => {
  try {
    const batch = writeBatch(db);
    
    for (const [id, vals] of Object.entries(resultadosGrupos)) {
      const g1 = vals.g1 !== null && vals.g1 !== undefined ? parseInt(vals.g1) : null;
      const g2 = vals.g2 !== null && vals.g2 !== undefined ? parseInt(vals.g2) : null;
      
      if (g1 === null || g2 === null) continue;
      
      const ref = doc(db, 'partidos_grupos', id);
      batch.update(ref, {
        goles_equipo1: g1,
        goles_equipo2: g2,
        jugado: true
      });
    }
    
    await batch.commit();
    showAlert('Resultados de grupos guardados', 'success');
    
  } catch (err) {
    console.error(err);
    showAlert('Error guardando resultados', 'danger');
  }
});

// Cargar partidos de fase final para admin
async function cargarPartidosFinal() {
  const container = document.getElementById('admin-final-container');
  container.innerHTML = '<div class="spinner"></div>';
  
  try {
    const q = query(collection(db, 'partidos_final'));
    const snapshot = await getDocs(q);
    const partidos = [];
    snapshot.forEach(d => partidos.push({ id: d.id, ...d.data() }));
    partidos.sort((a, b) => a.numero - b.numero);
    
    container.innerHTML = '';
    const title = document.createElement('h4');
    title.style.cssText = 'color: var(--accent); margin-bottom: 15px;';
    title.textContent = 'Dieciseisavos de Final';
    container.appendChild(title);
    
    for (const p of partidos) {
      const div = document.createElement('div');
      div.className = 'admin-match';
      div.style.flexWrap = 'wrap';
      div.style.gap = '15px';
      
      const eq1Flag = getFlagUrl(p.equipo1);
      const eq2Flag = getFlagUrl(p.equipo2);
      
      div.innerHTML = `
        <div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <small style="color:var(--text-muted);">Partido #${p.numero} — ${p.id}</small>
        </div>
        <div class="match-info" style="flex:2; min-width:200px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
            <img src="${eq1Flag}" style="width:24px; height:18px; border-radius:3px;">
            <input type="text" data-id="${p.id}" data-field="eq1" value="${p.equipo1}" 
              style="width:120px; padding:6px; background:var(--bg-input); border:1px solid var(--border); border-radius:6px; color:var(--text-primary); font-weight:600;">
          </div>
        </div>
        <div class="match-score" style="flex-direction:column; gap:5px; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" min="0" max="20" style="width:55px; height:36px;" 
              data-id="${p.id}" data-field="g1" value="${p.goles_equipo1 ?? ''}" placeholder="90min">
            <span>:</span>
            <input type="number" min="0" max="20" style="width:55px; height:36px;" 
              data-id="${p.id}" data-field="g2" value="${p.goles_equipo2 ?? ''}" placeholder="90min">
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" min="0" max="20" style="width:55px; height:36px; font-size:0.85rem;" 
              data-id="${p.id}" data-field="p1" value="${p.penales_equipo1 ?? ''}" placeholder="Pen">
            <span style="font-size:0.8rem; color:var(--text-muted);">Pen</span>
            <input type="number" min="0" max="20" style="width:55px; height:36px; font-size:0.85rem;" 
              data-id="${p.id}" data-field="p2" value="${p.penales_equipo2 ?? ''}" placeholder="Pen">
          </div>
        </div>
        <div class="match-info" style="flex:2; text-align:right; min-width:200px;">
          <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end; margin-bottom:5px;">
            <input type="text" data-id="${p.id}" data-field="eq2" value="${p.equipo2}" 
              style="width:120px; padding:6px; background:var(--bg-input); border:1px solid var(--border); border-radius:6px; color:var(--text-primary); font-weight:600; text-align:right;">
            <img src="${eq2Flag}" style="width:24px; height:18px; border-radius:3px;">
          </div>
        </div>
      `;
      
      container.appendChild(div);
      resultadosFinal[p.id] = {
        eq1: p.equipo1, eq2: p.equipo2,
        g1: p.goles_equipo1, g2: p.goles_equipo2,
        p1: p.penales_equipo1, p2: p.penales_equipo2
      };
    }
    
    container.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const field = e.target.dataset.field;
        if (!resultadosFinal[id]) resultadosFinal[id] = {};
        if (field === 'eq1' || field === 'eq2') {
          resultadosFinal[id][field] = e.target.value;
        } else {
          resultadosFinal[id][field] = e.target.value === '' ? null : parseInt(e.target.value);
        }
      });
    });
    
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:var(--danger);">Error cargando partidos final</p>';
  }
}

// Guardar resultados de fase final
document.getElementById('btn-save-final').addEventListener('click', async () => {
  try {
    const batch = writeBatch(db);
    
    for (const [id, vals] of Object.entries(resultadosFinal)) {
      const g1 = vals.g1 !== null && vals.g1 !== undefined ? parseInt(vals.g1) : null;
      const g2 = vals.g2 !== null && vals.g2 !== undefined ? parseInt(vals.g2) : null;
      const p1 = vals.p1 !== null && vals.p1 !== undefined ? parseInt(vals.p1) : null;
      const p2 = vals.p2 !== null && vals.p2 !== undefined ? parseInt(vals.p2) : null;
      const eq1 = vals.eq1 || null;
      const eq2 = vals.eq2 || null;
      
      const ref = doc(db, 'partidos_final', id);
      const updateData = {};
      
      if (eq1 !== null) updateData.equipo1 = eq1;
      if (eq2 !== null) updateData.equipo2 = eq2;
      
      if (g1 !== null && g2 !== null) {
        updateData.goles_equipo1 = g1;
        updateData.goles_equipo2 = g2;
        updateData.jugado = true;
        
        // Determinar ganador
        let ganador = null;
        if (g1 > g2) ganador = 'equipo1';
        else if (g2 > g1) ganador = 'equipo2';
        else if (p1 !== null && p2 !== null) {
          if (p1 > p2) ganador = 'equipo1';
          else if (p2 > p1) ganador = 'equipo2';
        }
        updateData.ganador = ganador;
        
        if (p1 !== null) updateData.penales_equipo1 = p1;
        if (p2 !== null) updateData.penales_equipo2 = p2;
      }
      
      if (Object.keys(updateData).length > 0) {
        batch.update(ref, updateData);
      }
    }
    
    await batch.commit();
    showAlert('Resultados de fase final guardados', 'success');
    
  } catch (err) {
    console.error(err);
    showAlert('Error guardando resultados final', 'danger');
  }
});

// Recalcular puntajes
document.getElementById('btn-recalcular').addEventListener('click', async () => {
  const btn = document.getElementById('btn-recalcular');
  btn.disabled = true;
  btn.textContent = '⏳ Recalculando...';
  
  try {
    // 1. Obtener todos los usuarios
    const usersSnap = await getDocs(collection(db, 'users'));
    const usuarios = [];
    usersSnap.forEach(d => usuarios.push({ id: d.id, ...d.data() }));
    
    // 2. Obtener todos los partidos de grupos jugados
    const partidosGruposSnap = await getDocs(collection(db, 'partidos_grupos'));
    const partidosGrupos = {};
    partidosGruposSnap.forEach(d => {
      const data = d.data();
      if (data.jugado) partidosGrupos[d.id] = data;
    });
    
    // 3. Obtener todas las predicciones de grupos
    const predsGruposSnap = await getDocs(collection(db, 'predicciones_grupos'));
    const predsGrupos = {};
    predsGruposSnap.forEach(d => {
      const data = d.data();
      if (!predsGrupos[data.user_id]) predsGrupos[data.user_id] = {};
      predsGrupos[data.user_id][data.partido_id] = data;
    });
    
    // 4. Calcular puntos fase de grupos por partido
    const puntosPorUsuario = {};
    
    for (const user of usuarios) {
      let puntosGrupos = 0;
      const preds = predsGrupos[user.id] || {};
      
      for (const [partidoId, partido] of Object.entries(partidosGrupos)) {
        const pred = preds[partidoId];
        if (!pred) continue;
        
        const g1 = partido.goles_equipo1;
        const g2 = partido.goles_equipo2;
        const p1 = pred.prediccion_equipo1;
        const p2 = pred.prediccion_equipo2;
        
        // Marcador exacto
        if (p1 === g1 && p2 === g2) {
          puntosGrupos += 3;
        } 
        // Ganador o empate
        else if ((g1 > g2 && p1 > p2) || (g2 > g1 && p2 > p1) || (g1 === g2 && p1 === p2)) {
          puntosGrupos += 1;
        }
      }
      
      // TODO: Calcular puntos extra por clasificados (1 por equipo clasificado, 1 extra por posición exacta)
      // Esto requiere calcular la tabla de posiciones real vs predicha
      
      puntosPorUsuario[user.id] = { puntosGrupos, puntosFinal: user.puntos_fase_final || 0 };
    }
    
    // 5. Calcular puntos fase final
    const partidosFinalSnap = await getDocs(collection(db, 'partidos_final'));
    const partidosFinal = {};
    partidosFinalSnap.forEach(d => {
      const data = d.data();
      if (data.jugado) partidosFinal[d.id] = data;
    });
    
    const predsFinalSnap = await getDocs(collection(db, 'predicciones_final'));
    const predsFinal = {};
    predsFinalSnap.forEach(d => {
      const data = d.data();
      if (!predsFinal[data.user_id]) predsFinal[data.user_id] = {};
      predsFinal[data.user_id][data.partido_id] = data;
    });
    
    for (const user of usuarios) {
      let puntosFinal = 0;
      const preds = predsFinal[user.id] || {};
      
      for (const [partidoId, partido] of Object.entries(partidosFinal)) {
        const pred = preds[partidoId];
        if (!pred) continue;
        
        const g1 = partido.goles_equipo1;
        const g2 = partido.goles_equipo2;
        const p1 = pred.prediccion_equipo1;
        const p2 = pred.prediccion_equipo2;
        const pg1 = pred.prediccion_penales_equipo1;
        const pg2 = pred.prediccion_penales_equipo2;
        
        let ptsPartido = 0;
        
        // Marcador exacto 90 min
        if (p1 === g1 && p2 === g2) {
          ptsPartido += 3;
        } 
        // Empate en 90 min (independiente del marcador exacto del empate)
        else if (g1 === g2 && p1 === p2) {
          ptsPartido += 1;
        }
        // Ganador de 90 min (sin exacto)
        else if ((g1 > g2 && p1 > p2) || (g2 > g1 && p2 > p1)) {
          ptsPartido += 1;
        }
        
        // Penales exactos
        if (g1 === g2) {
          const rp1 = partido.penales_equipo1;
          const rp2 = partido.penales_equipo2;
          if (rp1 !== null && rp2 !== null && pg1 !== undefined && pg2 !== undefined) {
            if (pg1 === rp1 && pg2 === rp2) {
              ptsPartido += 3;
            } else {
              // Ganador de penales
              const realGanadorPenales = rp1 > rp2 ? 'equipo1' : 'equipo2';
              const predGanadorPenales = pg1 > pg2 ? 'equipo1' : 'equipo2';
              if (realGanadorPenales === predGanadorPenales) {
                ptsPartido += 1;
              }
            }
          }
        }
        
        // Clasificado (ganador del partido)
        const realGanador = partido.ganador; // 'equipo1' o 'equipo2'
        const predGanador = pred.prediccion_ganador; // nombre del equipo o 'equipo1'/'equipo2'
        // Para simplificar, si el usuario acertó el ganador del partido (quien avanza)
        // Necesitamos mapear prediccion_ganador al campo correspondiente
        if (predGanador && realGanador) {
          // Si predijo el nombre del equipo ganador
          const nombreEquipoGanador = realGanador === 'equipo1' ? partido.equipo1 : partido.equipo2;
          if (predGanador === nombreEquipoGanador || predGanador === realGanador) {
            ptsPartido += 1;
          }
        }
        
        puntosFinal += ptsPartido;
      }
      
      if (!puntosPorUsuario[user.id]) puntosPorUsuario[user.id] = { puntosGrupos: 0, puntosFinal: 0 };
      puntosPorUsuario[user.id].puntosFinal = puntosFinal;
    }
    
    // 6. Actualizar puntos en Firestore
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
    
    showAlert(`Puntajes recalculados para ${Object.keys(puntosPorUsuario).length} participantes`, 'success');
    
  } catch (err) {
    console.error(err);
    showAlert('Error recalculando puntajes: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Recalcular Puntajes';
  }
});

// Inicializar Base de Datos
document.getElementById('btn-init-db').addEventListener('click', async () => {
  const btn = document.getElementById('btn-init-db');
  const status = document.getElementById('init-status');
  btn.disabled = true;
  status.textContent = 'Verificando...';
  
  try {
    // Verificar si ya existen partidos
    const existing = await getDocs(collection(db, 'partidos_grupos'));
    if (!existing.empty) {
      status.innerHTML = '<span style="color: var(--accent);">⚠️ Ya existen partidos. Si quieres reiniciar, usa el botón rojo "Reiniciar Todo".</span>';
      btn.disabled = false;
      return;
    }
    
    const batch = writeBatch(db);
    
    // 1. Crear partidos de grupos
    const partidosGrupos = generarPartidosGrupos();
    for (const p of partidosGrupos) {
      const ref = doc(db, 'partidos_grupos', p.id);
      batch.set(ref, {
        grupo: p.grupo,
        equipo1: p.equipo1,
        equipo2: p.equipo2,
        goles_equipo1: null,
        goles_equipo2: null,
        jugado: false,
        fecha: p.fecha
      });
    }
    
    // 2. Crear partidos de fase final
    const partidosFinal = generarPartidosFinal();
    for (const p of partidosFinal) {
      const ref = doc(db, 'partidos_final', p.id);
      batch.set(ref, {
        ronda: p.ronda,
        numero: p.numero,
        equipo1: p.equipo1,
        equipo2: p.equipo2,
        goles_equipo1: null,
        goles_equipo2: null,
        penales_equipo1: null,
        penales_equipo2: null,
        jugado: false,
        ganador: null
      });
    }
    
    // 3. Crear documento de config
    const configRef = doc(db, 'config', 'app_config');
    batch.set(configRef, {
      fase_actual: 'grupos',
      fase_final_habilitada: false,
      creado: new Date().toISOString()
    });
    
    await batch.commit();
    
    showAlert(`✅ Base de datos inicializada: ${partidosGrupos.length} partidos de grupos + ${partidosFinal.length} partidos de final`, 'success');
    status.innerHTML = `<span style="color: #4caf50;">✅ ${partidosGrupos.length} partidos de grupos y ${partidosFinal.length} de final cargados.</span>`;
    
    // Recargar las listas
    cargarPartidosGrupos();
    cargarPartidosFinal();
    
  } catch (err) {
    console.error(err);
    showAlert('Error inicializando base de datos: ' + err.message, 'danger');
    status.innerHTML = `<span style="color: var(--danger);">❌ Error: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});

// Resetear Base de Datos (borrar todo)
document.getElementById('btn-reset-db').addEventListener('click', async () => {
  if (!confirm('⚠️ ¿ESTÁS SEGURO?\n\nEsto borrará TODOS los partidos, resultados, predicciones y configuraciones.\n\nLos usuarios registrados NO se borrarán.\n\n¿Deseas continuar?')) {
    return;
  }
  
  const btn = document.getElementById('btn-reset-db');
  const status = document.getElementById('init-status');
  btn.disabled = true;
  status.textContent = 'Borrando datos...';
  
  try {
    // Borrar partidos de grupos
    const gruposSnap = await getDocs(collection(db, 'partidos_grupos'));
    for (const d of gruposSnap.docs) {
      await deleteDoc(doc(db, 'partidos_grupos', d.id));
    }
    
    // Borrar partidos de final
    const finalSnap = await getDocs(collection(db, 'partidos_final'));
    for (const d of finalSnap.docs) {
      await deleteDoc(doc(db, 'partidos_final', d.id));
    }
    
    // Borrar predicciones de grupos
    const predsGruposSnap = await getDocs(collection(db, 'predicciones_grupos'));
    for (const d of predsGruposSnap.docs) {
      await deleteDoc(doc(db, 'predicciones_grupos', d.id));
    }
    
    // Borrar predicciones de final
    const predsFinalSnap = await getDocs(collection(db, 'predicciones_final'));
    for (const d of predsFinalSnap.docs) {
      await deleteDoc(doc(db, 'predicciones_final', d.id));
    }
    
    // Borrar config
    await deleteDoc(doc(db, 'config', 'app_config'));
    
    showAlert('✅ Base de datos reiniciada. Ahora puedes cargar los partidos de nuevo.', 'success');
    status.innerHTML = '<span style="color: #4caf50;">✅ Todo reiniciado. Presiona "🚀 Cargar Partidos" para empezar de nuevo.</span>';
    
    // Limpiar vistas
    document.getElementById('admin-grupos-container').innerHTML = '';
    document.getElementById('admin-final-container').innerHTML = '';
    
  } catch (err) {
    console.error(err);
    showAlert('Error reiniciando: ' + err.message, 'danger');
    status.innerHTML = `<span style="color: var(--danger);">❌ Error: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});

// ========== GESTIÓN DE USUARIOS ==========

let currentSearchUser = null;

// Buscar usuarios
document.getElementById('btn-search-user').addEventListener('click', async () => {
  const cedula = document.getElementById('search-cedula').value.trim();
  const alias = document.getElementById('search-alias').value.trim();
  const resultsDiv = document.getElementById('users-search-results');
  
  if (!cedula && !alias) {
    showAlert('Ingresa cédula o alias para buscar', 'danger');
    return;
  }
  
  resultsDiv.innerHTML = '<div class="spinner"></div>';
  
  try {
    let usuarios = [];
    
    if (cedula) {
      // Buscar por cédula exacta
      const q = query(collection(db, 'users'), where('cedula', '==', cedula));
      const snap = await getDocs(q);
      snap.forEach(d => usuarios.push({ id: d.id, ...d.data() }));
    } else if (alias) {
      // Buscar por alias (case-insensitive aproximado)
      const q = query(collection(db, 'users'));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        if (data.alias.toLowerCase().includes(alias.toLowerCase())) {
          usuarios.push({ id: d.id, ...data });
        }
      });
    }
    
    if (usuarios.length === 0) {
      resultsDiv.innerHTML = '<p style="color: var(--text-muted);">No se encontraron usuarios</p>';
      return;
    }
    
    // Mostrar tabla
    let html = `
      <table class="ranking-table" style="width:100%; margin-top: 15px;">
        <thead>
          <tr>
            <th>Cédula</th>
            <th>Alias</th>
            <th>Pts Grupos</th>
            <th>Pts Final</th>
            <th>Pts Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const u of usuarios) {
      html += `
        <tr>
          <td>${u.cedula}</td>
          <td>${u.alias}</td>
          <td>${u.puntos_fase_grupos || 0}</td>
          <td>${u.puntos_fase_final || 0}</td>
          <td style="font-weight:bold; color:var(--accent);">${u.puntos_total || 0}</td>
          <td>
            <button class="btn btn-info" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 5px;" onclick="window.verPrediccionesUsuario('${u.cedula}', '${u.alias}')">📋 Ver Predicciones</button>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.eliminarUsuario('${u.cedula}', '${u.alias}')">🗑️ Eliminar</button>
          </td>
        </tr>
      `;
    }
    
    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
    
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = '<p style="color: var(--danger);">Error buscando usuarios</p>';
  }
});

// Ver predicciones de un usuario
window.verPrediccionesUsuario = async (cedula, alias) => {
  currentSearchUser = { cedula, alias };
  const container = document.getElementById('user-predictions-container');
  const section = document.getElementById('user-predictions-section');
  
  container.innerHTML = '<div class="spinner"></div>';
  section.style.display = 'block';
  
  try {
    const userId = `${cedula}_${alias}`;
    
    // Obtener predicciones de grupos
    const predsGruposQ = query(collection(db, 'predicciones_grupos'), where('user_id', '==', userId));
    const predsGruposSnap = await getDocs(predsGruposQ);
    const predsGrupos = [];
    predsGruposSnap.forEach(d => predsGrupos.push(d.data()));
    
    // Obtener predicciones de final
    const predsFinalQ = query(collection(db, 'predicciones_final'), where('user_id', '==', userId));
    const predsFinalSnap = await getDocs(predsFinalQ);
    const predsFinal = [];
    predsFinalSnap.forEach(d => predsFinal.push(d.data()));
    
    if (predsGrupos.length === 0 && predsFinal.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted);">Este usuario no tiene predicciones registradas</p>';
      return;
    }
    
    let html = `<h5 style="color: var(--accent); margin: 20px 0 10px;">Usuario: ${alias} (${cedula})</h5>`;
    
    // Fase de Grupos
    if (predsGrupos.length > 0) {
      html += '<h6 style="color: var(--text-secondary); margin: 15px 0 10px;">⚽ Fase de Grupos</h6>';
      html += '<table class="ranking-table" style="width:100%;"><thead><tr><th>Partido</th><th>Predicción</th><th>Acciones</th></tr></thead><tbody>';
      
      for (const p of predsGrupos) {
        html += `
          <tr>
            <td>${p.partido_id}</td>
            <td style="font-weight:bold;">${p.prediccion_equipo1} - ${p.prediccion_equipo2}</td>
            <td>
              <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem;" onclick="window.borrarPrediccion('${cedula}', '${alias}', '${p.partido_id}', 'grupos')">🗑️ Borrar</button>
            </td>
          </tr>
        `;
      }
      html += '</tbody></table>';
    }
    
    // Fase Final
    if (predsFinal.length > 0) {
      html += '<h6 style="color: var(--text-secondary); margin: 15px 0 10px;">🏆 Fase Final</h6>';
      html += '<table class="ranking-table" style="width:100%;"><thead><tr><th>Partido</th><th>Predicción</th><th>Penales</th><th>Ganador</th><th>Acciones</th></tr></thead><tbody>';
      
      for (const p of predsFinal) {
        html += `
          <tr>
            <td>${p.partido_id}</td>
            <td style="font-weight:bold;">${p.prediccion_equipo1} - ${p.prediccion_equipo2}</td>
            <td>${p.prediccion_penales_equipo1 ?? '-'} - ${p.prediccion_penales_equipo2 ?? '-'}</td>
            <td>${p.prediccion_ganador ?? '-'}</td>
            <td>
              <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem;" onclick="window.borrarPrediccion('${cedula}', '${alias}', '${p.partido_id}', 'final')">🗑️ Borrar</button>
            </td>
          </tr>
        `;
      }
      html += '</tbody></table>';
    }
    
    container.innerHTML = html;
    
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color: var(--danger);">Error cargando predicciones</p>';
  }
};

// Borrar predicción individual
window.borrarPrediccion = async (cedula, alias, partidoId, tipo) => {
  if (!confirm(`¿Eliminar predicción de ${alias} para el partido ${partidoId}?`)) return;
  
  try {
    const docId = `${cedula}_${alias}_${partidoId}`;
    const coleccion = tipo === 'grupos' ? 'predicciones_grupos' : 'predicciones_final';
    await deleteDoc(doc(db, coleccion, docId));
    
    showAlert('Predicción eliminada', 'success');
    // Recargar vista
    window.verPrediccionesUsuario(cedula, alias);
    
  } catch (err) {
    console.error(err);
    showAlert('Error eliminando predicción', 'danger');
  }
};

// Eliminar usuario completo
window.eliminarUsuario = async (cedula, alias) => {
  if (!confirm(`⚠️ ¿ESTÁS SEGURO?\n\nSe eliminará permanentemente:\n- Usuario: ${alias}\n- Cédula: ${cedula}\n- TODAS sus predicciones\n- TODOS sus puntos\n\nEsta acción NO se puede deshacer.\n\n¿Deseas continuar?`)) {
    return;
  }
  
  try {
    const userId = `${cedula}_${alias}`;
    
    // 1. Borrar predicciones de grupos
    const predsGruposQ = query(collection(db, 'predicciones_grupos'), where('user_id', '==', userId));
    const predsGruposSnap = await getDocs(predsGruposQ);
    for (const d of predsGruposSnap.docs) {
      await deleteDoc(doc(db, 'predicciones_grupos', d.id));
    }
    
    // 2. Borrar predicciones de final
    const predsFinalQ = query(collection(db, 'predicciones_final'), where('user_id', '==', userId));
    const predsFinalSnap = await getDocs(predsFinalQ);
    for (const d of predsFinalSnap.docs) {
      await deleteDoc(doc(db, 'predicciones_final', d.id));
    }
    
    // 3. Borrar usuario
    await deleteDoc(doc(db, 'users', userId));
    
    showAlert(`✅ Usuario ${alias} eliminado completamente`, 'success');
    
    // Limpiar resultados
    document.getElementById('users-search-results').innerHTML = '';
    document.getElementById('user-predictions-section').style.display = 'none';
    
  } catch (err) {
    console.error(err);
    showAlert('Error eliminando usuario: ' + err.message, 'danger');
  }
};

// Init
cargarConfig();
cargarPartidosGrupos();
cargarPartidosFinal();
