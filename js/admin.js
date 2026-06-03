/* admin.js - Panel de Administración con Sistema de Pasos y Manejo de Errores Premium */

import { db } from './firebase-config.js?v=6.0';
import { collection, query, getDocs, doc, getDoc, setDoc, writeBatch, updateDoc, deleteDoc, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin, updateNav, logout, getCurrentUser } from './auth.js?v=6.0';
import { BANDERAS, GRUPOS, generarPartidosGrupos, generarPartidosFinal, calcularTablaGrupo, seleccionarMejoresTerceros, placeholderToEquipo } from './data.js?v=6.0';

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

// ===== GESTIÓN DE INSTITUCIONES =====
async function cargarInstitucionesAdmin() {
  try {
    const snapshot = await getDocs(collection(db, 'instituciones'));
    const list = document.getElementById('instituciones-list');
    if (!list) return;
    
    if (snapshot.empty) {
      list.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No hay instituciones registradas</p>';
      return;
    }
    
    let html = '<table class="ranking-table" style="width:100%;"><thead><tr><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
    snapshot.forEach(d => {
      const data = d.data();
      const activo = data.activo !== false;
      html += `
        <tr>
          <td><strong>${d.id}</strong></td>
          <td>${data.descripcion || '-'}</td>
          <td><span style="color:${activo ? '#4caf50' : 'var(--danger)'};">${activo ? '✓ Activa' : '✗ Inactiva'}</span></td>
          <td>
            <button class="btn btn-danger" style="padding:4px 10px; font-size:0.75rem;" 
              onclick="window.toggleInstitucion('${d.id}', ${!activo})">${activo ? 'Desactivar' : 'Activar'}</button>
          </td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    list.innerHTML = html;
  } catch (err) {
    console.error('Error cargando instituciones:', err);
  }
}

window.toggleInstitucion = async (id, activar) => {
  try {
    await setDoc(doc(db, 'instituciones', id), { activo: activar }, { merge: true });
    showToast('Éxito', `Institución ${id} ${activar ? 'activada' : 'desactivada'}`, 'success');
    await cargarInstitucionesAdmin();
  } catch (err) {
    console.error(err);
    showToast('Error', 'No se pudo actualizar la institución', 'error');
  }
};

document.getElementById('btn-add-inst').addEventListener('click', async () => {
  const nombre = document.getElementById('inst-nombre').value.trim().toUpperCase();
  const descripcion = document.getElementById('inst-descripcion').value.trim();
  
  if (!nombre) {
    showToast('Aviso', 'Ingresa un nombre para la institución', 'warning');
    return;
  }
  
  try {
    await setDoc(doc(db, 'instituciones', nombre), {
      nombre: nombre,
      descripcion: descripcion || '',
      activo: true,
      creado: new Date().toISOString()
    });
    showToast('Éxito', `Institución ${nombre} agregada`, 'success');
    document.getElementById('inst-nombre').value = '';
    document.getElementById('inst-descripcion').value = '';
    await cargarInstitucionesAdmin();
  } catch (err) {
    console.error(err);
    showToast('Error', 'No se pudo agregar la institución', 'error');
  }
});

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
        
        const eq1Flag = getFlagUrl(p.equipo1);
        const eq2Flag = getFlagUrl(p.equipo2);
        const yaJugado = p.jugado;
        const jugadoClass = yaJugado ? 'match-played' : '';
        const jugadoBadge = yaJugado ? '<span class="match-badge played">✓ JUGADO (Editable)</span>' : '<span class="match-badge pending">PENDIENTE</span>';
        
        const div = document.createElement('div');
        div.className = `admin-match-card ${jugadoClass}`;
        div.dataset.id = p.id;
        
        div.innerHTML = `
          <div class="match-header">
            <span class="match-id">${p.id}</span>
            ${jugadoBadge}
          </div>
          <div class="match-body">
            <div class="match-team-left">
              <img src="${eq1Flag}" class="match-flag" alt="${p.equipo1}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
              <span class="match-team-name">${p.equipo1}</span>
            </div>
            <div class="match-score-center">
              <input type="number" min="0" max="20" class="match-score-input"
                data-id="${p.id}" data-field="g1" value="${p.goles_equipo1 ?? ''}" placeholder="0">
              <span class="match-separator">:</span>
              <input type="number" min="0" max="20" class="match-score-input"
                data-id="${p.id}" data-field="g2" value="${p.goles_equipo2 ?? ''}" placeholder="0">
            </div>
            <div class="match-team-right">
              <span class="match-team-name">${p.equipo2}</span>
              <img src="${eq2Flag}" class="match-flag" alt="${p.equipo2}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
            </div>
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
    
    // 3. Obtener predicciones de grupos (filtradas por institución activa del usuario)
    // Normalizar: asegurar que cada usuario tenga institucion_activa
    const batchUsers = writeBatch(db);
    let usersUpdated = 0;
    for (const u of usuarios) {
      if (!u.institucion_activa && u.instituciones && u.instituciones.length > 0) {
        u.institucion_activa = u.instituciones[0];
        batchUsers.update(doc(db, 'users', u.id), { institucion_activa: u.instituciones[0] });
        usersUpdated++;
      }
    }
    if (usersUpdated > 0) await batchUsers.commit();
    
    const predsGruposSnap = await getDocs(collection(db, 'predicciones_grupos'));
    const predsGrupos = {};
    predsGruposSnap.forEach(d => {
      const data = d.data();
      // Solo incluir si la institución de la predicción coincide con la institución activa del usuario
      const user = usuarios.find(u => u.id === data.user_id);
      const userInstitucion = user ? (user.institucion_activa || (user.instituciones && user.instituciones[0])) : null;
      if (user && data.institucion === userInstitucion) {
        if (!predsGrupos[data.user_id]) predsGrupos[data.user_id] = {};
        predsGrupos[data.user_id][data.partido_id] = data;
      }
    });
    
    // 4. Calcular puntos de fase de grupos
    const puntosPorUsuario = {};
    
    // Calcular posiciones reales de grupos
    const partidosPorGrupoReal = {};
    for (const p of Object.values(partidosGrupos)) {
      if (!partidosPorGrupoReal[p.grupo]) partidosPorGrupoReal[p.grupo] = [];
      partidosPorGrupoReal[p.grupo].push(p);
    }
    
    const posicionesReales = {};
    const mejoresTercerosReales = [];
    const todosTercerosReales = [];
    
    for (const [grupo, partidos] of Object.entries(partidosPorGrupoReal)) {
      const tabla = calcularTablaGrupo(partidos, GRUPOS[grupo]);
      posicionesReales[grupo] = tabla.map(t => t.equipo);
      
      // Guardar información del tercero para el cálculo global
      if (tabla[2]) {
        todosTercerosReales.push({
          equipo: tabla[2].equipo,
          grupo: grupo,
          pts: tabla[2].pts,
          dif: tabla[2].gf - tabla[2].gc,
          gf: tabla[2].gf
        });
      }
    }
    
    // Obtener los 8 mejores terceros reales que clasificaron
    const top8TercerosReales = seleccionarMejoresTerceros(todosTercerosReales).map(t => t.equipo);
    
    for (const u of usuarios) {
      let ptsGrupos = 0;
      const preds = predsGrupos[u.id] || {};
      
      // A. Puntos por marcador y resultado (1 y 3 pts)
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
      
      // B. Puntos por Clasificación y Posición Exacta
      // Simular tablas del usuario para cada grupo
      const clasificadosUser = [];
      
      for (const [grupo, equipos] of Object.entries(GRUPOS)) {
        const partidosGrupoUser = [];
        const partidosDeEsteGrupo = partidosPorGrupoReal[grupo] || [];
        
        for (const pReal of partidosDeEsteGrupo) {
          const pred = preds[pReal.id];
          partidosGrupoUser.push({
            id: pReal.id,
            equipo1: pReal.equipo1,
            equipo2: pReal.equipo2,
            goles_equipo1: pred ? pred.prediccion_equipo1 : 0,
            goles_equipo2: pred ? pred.prediccion_equipo2 : 0,
            jugado: true
          });
        }
        
        const tablaPred = calcularTablaGrupo(partidosGrupoUser, equipos);
        const posPred = tablaPred.map(t => t.equipo);
        const posReal = posicionesReales[grupo];
        
        if (posReal) {
          // 1 pt por cada equipo clasificado (los 2 primeros de cada grupo)
          const clasificadosGrupoReal = posReal.slice(0, 2);
          const clasificadosGrupoPred = posPred.slice(0, 2);
          
          for (const cp of clasificadosGrupoPred) {
            if (posReal.includes(cp)) { // El equipo clasifica si está en el top de la FIFA real
              // Nota: Verificamos contra posReal total para ver si pasó (2 primeros + mejores terceros)
              // Pero la regla dice "clasificado a dieciseisavos".
              // Calcularemos los 32 que el usuario predijo que pasarían.
            }
          }
          
          // Guardar información del tercero predicho para el cálculo global de mejores terceros
          // (Aunque para simplificar, usaremos los 2 primeros directos y los terceros según la lógica del mundial)
          clasificadosUser.push(...posPred.slice(0, 2));
          
          // 1 pt por posición exacta (Solo si el equipo clasifica en esa posición)
          if (posPred[0] === posReal[0]) ptsGrupos += 1;
          if (posPred[1] === posReal[1]) ptsGrupos += 1;
        }
      }
      
      // Puntos por equipos clasificados (1 pt c/u)
      // Los 32 equipos reales que clasificaron
      const todosClasificadosReales = [];
      for (const grupoPos of Object.values(posicionesReales)) {
        todosClasificadosReales.push(grupoPos[0], grupoPos[1]);
      }
      todosClasificadosReales.push(...top8TercerosReales);
      
      // Los equipos que el usuario "metió" en octavos según sus predicciones
      // (Buscamos coincidencias entre lo que el usuario predijo como clasificados y los reales)
      // Para no complicar con la tabla de mejores terceros del usuario, comparamos sus 2 primeros de cada grupo
      // y si sus terceros reales clasificaron.
      for (const [grupo, posReal] of Object.entries(posicionesReales)) {
          const posPred = []; // Tendríamos que recalcularla o guardarla arriba
          // Re-calculamos brevemente para este usuario
          const partidosGrupoUser = (partidosPorGrupoReal[grupo] || []).map(p => ({
              ...p,
              goles_equipo1: preds[p.id] ? preds[p.id].prediccion_equipo1 : 0,
              goles_equipo2: preds[p.id] ? preds[p.id].prediccion_equipo2 : 0,
              jugado: true
          }));
          const tablaPred = calcularTablaGrupo(partidosGrupoUser, GRUPOS[grupo]);
          const top2Pred = tablaPred.slice(0, 2).map(t => t.equipo);
          
          for (const eqP of top2Pred) {
              if (todosClasificadosReales.includes(eqP)) ptsGrupos += 1;
          }
          // Nota: La regla de mejores terceros es compleja de simular por usuario, 
          // pero si el usuario predijo que un equipo pasaba y ese equipo pasó (aunque sea como mejor tercero real), suma punto.
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
      // Solo inclir si la institución de la predicción coincide con la institución activa del usuario
      const user = usuarios.find(u => u.id === data.user_id);
      const userInstitucion = user ? (user.institucion_activa || (user.instituciones && user.instituciones[0])) : null;
      if (user && data.institucion === userInstitucion) {
        if (!predsFinal[data.user_id]) predsFinal[data.user_id] = {};
        predsFinal[data.user_id][data.partido_id] = data;
      }
    });
    
    // Resolver nombre real de equipo (reemplaza placeholders con equipos reales del bracket)
    const resolverEquipoReal = (partido, esEquipo1) => {
      let nombre = esEquipo1 ? partido.equipo1 : partido.equipo2;
      // Si no es placeholder, devolver directo
      if (!nombre || (!nombre.startsWith('Ganador') && !nombre.startsWith('Perdedor') && !/^[123][A-L]$/.test(nombre))) {
        return nombre;
      }
      // Para dieciseisavos, los equipos ya deben ser reales tras Generar Fase Final
      if (partido.ronda === 'dieciseisavos') return nombre;
      
      // Resolver desde partido source
      let sourceId = esEquipo1 ? partido.source_equipo1 : partido.source_equipo2;
      if (!sourceId) {
        const match = nombre.match(/(F\d+)/);
        if (match) sourceId = match[1];
      }
      if (!sourceId) return nombre;
      
      const sourcePartido = allPartidosFinal[sourceId];
      if (!sourcePartido || !sourcePartido.jugado) return nombre;
      
      const sg1 = sourcePartido.goles_equipo1;
      const sg2 = sourcePartido.goles_equipo2;
      const sp1 = sourcePartido.penales_equipo1;
      const sp2 = sourcePartido.penales_equipo2;
      let sGanador = null;
      if (sg1 > sg2) sGanador = resolverEquipoReal(sourcePartido, true);
      else if (sg2 > sg1) sGanador = resolverEquipoReal(sourcePartido, false);
      else if (sp1 !== null && sp2 !== null && sp1 !== sp2) {
        sGanador = sp1 > sp2 ? resolverEquipoReal(sourcePartido, true) : resolverEquipoReal(sourcePartido, false);
      }
      
      if (!sGanador) return nombre;
      
      const esPerdedor = (esEquipo1 ? partido.perdedor_source1 : partido.perdedor_source2) || partido.ronda === 'tercer_lugar';
      if (esPerdedor) {
        const eq1Real = resolverEquipoReal(sourcePartido, true);
        return sGanador === eq1Real ? resolverEquipoReal(sourcePartido, false) : eq1Real;
      }
      return sGanador;
    };

    const getGanadorReal = (partido) => {
      if (!partido.jugado) return null;
      const g1 = partido.goles_equipo1;
      const g2 = partido.goles_equipo2;
      if (g1 > g2) return resolverEquipoReal(partido, true);
      if (g2 > g1) return resolverEquipoReal(partido, false);
      const p1 = partido.penales_equipo1;
      const p2 = partido.penales_equipo2;
      if (p1 !== null && p2 !== null && p1 !== p2) {
        return p1 > p2 ? resolverEquipoReal(partido, true) : resolverEquipoReal(partido, false);
      }
      return null;
    };
    
    const getPerdedorReal = (partido) => {
      const ganador = getGanadorReal(partido);
      if (!ganador) return null;
      const eq1Real = resolverEquipoReal(partido, true);
      return ganador === eq1Real ? resolverEquipoReal(partido, false) : eq1Real;
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
        
        // Cap máximo de 4 puntos por partido
        if (ptsPartido > 4) ptsPartido = 4;
        
        ptsFinal += ptsPartido;
      }
      
      puntosPorUsuario[u.id].puntosFinal = ptsFinal;
    }
    
    // 6. Calcular bonos de progresión de ronda para cada usuario
    for (const u of usuarios) {
      const preds = predsFinal[u.id] || {};
      let ptsBonos = 0;
      
      // Simular bracket del usuario basado en sus predicciones
      const predEquiposPorRonda = {
        octavos: new Set(),
        cuartos: new Set(),
        semis: new Set(),
        finalistas: new Set(),
        subcampeon: null,
        campeon: null
      };
      
      // Procesar todas las predicciones del usuario
      for (const [partidoId, pred] of Object.entries(preds)) {
        const partido = allPartidosFinal[partidoId];
        if (!partido) continue;
        
        // Determinar ganador según predicción del usuario
        // Usar prediccion_ganador primero (ya tiene el nombre real del equipo, no placeholder)
        let predGanador = pred.prediccion_ganador || null;
        
        // Fallback: calcular desde marcador si no hay prediccion_ganador
        if (!predGanador) {
          const pg1 = pred.prediccion_equipo1;
          const pg2 = pred.prediccion_equipo2;
          const pp1 = pred.prediccion_penales_equipo1;
          const pp2 = pred.prediccion_penales_equipo2;
          
          if (pg1 > pg2) predGanador = partido.equipo1;
          else if (pg2 > pg1) predGanador = partido.equipo2;
          else if (pp1 !== null && pp2 !== null && pp1 !== pp2) {
            predGanador = pp1 > pp2 ? partido.equipo1 : partido.equipo2;
          }
        }
        
        if (!predGanador) continue;
        
        // Clasificar según ronda
        if (partido.ronda === 'dieciseisavos') {
          predEquiposPorRonda.octavos.add(predGanador);
        } else if (partido.ronda === 'octavos') {
          predEquiposPorRonda.cuartos.add(predGanador);
        } else if (partido.ronda === 'cuartos') {
          predEquiposPorRonda.semis.add(predGanador);
        } else if (partido.ronda === 'semis') {
          predEquiposPorRonda.finalistas.add(predGanador);
        } else if (partido.ronda === 'final') {
          // El ganador de la final es campeón
          predEquiposPorRonda.campeon = predGanador;
          // El perdedor es subcampeón (calcularlo desde scores si equipo1/equipo2 son placeholders)
          const pg1 = pred.prediccion_equipo1;
          const pg2 = pred.prediccion_equipo2;
          const pp1 = pred.prediccion_penales_equipo1;
          const pp2 = pred.prediccion_penales_equipo2;
          let predPerdedor = null;
          if (pg1 > pg2) {
            predPerdedor = predGanador === partido.equipo1 ? partido.equipo2 : partido.equipo1;
          } else if (pg2 > pg1) {
            predPerdedor = predGanador === partido.equipo2 ? partido.equipo1 : partido.equipo2;
          } else if (pp1 !== null && pp2 !== null && pp1 !== pp2) {
            predPerdedor = predGanador === partido.equipo1 ? partido.equipo2 : partido.equipo1;
          }
          // Solo guardar si no es un placeholder
          if (predPerdedor && !predPerdedor.startsWith('Ganador') && !predPerdedor.startsWith('Perdedor')) {
            predEquiposPorRonda.subcampeon = predPerdedor;
          }
        }
      }
      
      // Comparar con resultados reales y otorgar bonos
      const realEquiposPorRonda = {
        octavos: new Set(),
        cuartos: new Set(),
        semis: new Set(),
        finalistas: new Set(),
        subcampeon: null,
        campeon: null
      };
      
      for (const [id, p] of Object.entries(allPartidosFinal)) {
        if (!p.jugado) continue;
        const ganador = getGanadorReal(p);
        if (!ganador) continue;
        
        if (p.ronda === 'dieciseisavos') {
          realEquiposPorRonda.octavos.add(ganador);
        } else if (p.ronda === 'octavos') {
          realEquiposPorRonda.cuartos.add(ganador);
        } else if (p.ronda === 'cuartos') {
          realEquiposPorRonda.semis.add(ganador);
        } else if (p.ronda === 'semis') {
          realEquiposPorRonda.finalistas.add(ganador);
        } else if (p.ronda === 'final') {
          realEquiposPorRonda.campeon = ganador;
          realEquiposPorRonda.subcampeon = getPerdedorReal(p);
        }
      }
      
      // 1 pt por equipo en octavos
      for (const equipo of predEquiposPorRonda.octavos) {
        if (realEquiposPorRonda.octavos.has(equipo)) ptsBonos += 1;
      }
      
      // 1 pt por equipo en cuartos
      for (const equipo of predEquiposPorRonda.cuartos) {
        if (realEquiposPorRonda.cuartos.has(equipo)) ptsBonos += 1;
      }
      
      // 1 pt por equipo en semis
      for (const equipo of predEquiposPorRonda.semis) {
        if (realEquiposPorRonda.semis.has(equipo)) ptsBonos += 1;
      }
      
      // 1 pt por finalista
      for (const equipo of predEquiposPorRonda.finalistas) {
        if (realEquiposPorRonda.finalistas.has(equipo)) ptsBonos += 1;
      }
      
      // 2 pts por subcampeón
      if (predEquiposPorRonda.subcampeon && predEquiposPorRonda.subcampeon === realEquiposPorRonda.subcampeon) {
        ptsBonos += 2;
      }
      
      // 4 pts por campeón
      if (predEquiposPorRonda.campeon && predEquiposPorRonda.campeon === realEquiposPorRonda.campeon) {
        ptsBonos += 4;
      }
      
      puntosPorUsuario[u.id].puntosFinal += ptsBonos;
    }
    
    // 7. Guardar puntos en Firestore
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
  
  const g1 = parseInt(resultSource.g1);
  const g2 = parseInt(resultSource.g2);
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
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.85rem; color:var(--text-muted);">
            <input type="checkbox" data-field="jugado" data-id="${p.id}" ${yaJugado ? 'checked' : ''}>
            <span style="color:${yaJugado ? '#4caf50' : 'inherit'};">${yaJugado ? '✓ Jugado' : 'Marcar como jugado'}</span>
          </label>
        </div>
        <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
          <div style="flex:1; min-width:140px; display:flex; align-items:center; gap:8px;">
            <img src="${getFlagUrl(eq1Calculado)}" style="width:32px; height:24px; border-radius:4px; object-fit:cover;" onerror="this.style.display='none'">
            <div style="display:flex; flex-direction:column;">
              <span style="font-weight:600; font-size:0.95rem;">${eq1Calculado}</span>
              ${ronda === 'dieciseisavos' ? `<button class="edit-team-btn" onclick="window.abrirSeleccionEquipo('${p.id}', true)">✏️ Cambiar</button>` : ''}
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px; min-width:130px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <input type="number" min="0" max="20" style="width:55px; height:42px; text-align:center; font-size:1.1rem;"
                data-field="g1" data-id="${p.id}" value="${g1}" placeholder="0">
            <span style="font-size:1.2rem;">:</span>
            <input type="number" min="0" max="20" style="width:55px; height:42px; text-align:center; font-size:1.1rem;"
                data-field="g2" data-id="${p.id}" value="${g2}" placeholder="0">
            </div>
            <div class="penales-box ${penalesClass}" style="display:${mostrarPenales ? 'flex' : 'none'};">
              <input type="number" min="0" max="20" style="width:45px; height:35px; text-align:center; font-size:0.95rem;"
                data-field="p1" data-id="${p.id}" value="${p1}" placeholder="Pen">
              <span style="font-size:0.75rem; color:var(--text-muted);">Penales</span>
              <input type="number" min="0" max="20" style="width:45px; height:35px; text-align:center; font-size:0.95rem;"
                data-field="p2" data-id="${p.id}" value="${p2}" placeholder="Pen">
            </div>
          </div>
          <div style="flex:1; min-width:140px; display:flex; align-items:center; gap:8px; justify-content:flex-end;">
            <div style="display:flex; flex-direction:column; align-items:flex-end;">
              <span style="font-weight:600; font-size:0.95rem; text-align:right;">${eq2Calculado}</span>
              ${ronda === 'dieciseisavos' ? `<button class="edit-team-btn" onclick="window.abrirSeleccionEquipo('${p.id}', false)">✏️ Cambiar</button>` : ''}
            </div>
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

// ===== SELECCIÓN MANUAL DE EQUIPOS =====
let equipoEdicionActual = { partidoId: null, esEquipo1: true };

window.abrirSeleccionEquipo = (partidoId, esEquipo1) => {
  equipoEdicionActual = { partidoId, esEquipo1 };
  const overlay = document.getElementById('modal-team-selector');
  const grid = document.getElementById('team-grid');
  grid.innerHTML = '';
  
  // Obtener todos los equipos de GRUPOS
  const todosEquipos = [];
  for (const equipos of Object.values(GRUPOS)) {
    todosEquipos.push(...equipos);
  }
  todosEquipos.sort();
  
  for (const equipo of todosEquipos) {
    const item = document.createElement('div');
    item.className = 'team-select-item';
    item.innerHTML = `
      <img src="${getFlagUrl(equipo)}" onerror="this.src='https://flagcdn.com/w40/xx.png'">
      <span>${equipo}</span>
    `;
    item.onclick = () => seleccionarEquipoManual(equipo);
    grid.appendChild(item);
  }
  
  overlay.classList.remove('hidden');
};

async function seleccionarEquipoManual(equipo) {
  const { partidoId, esEquipo1 } = equipoEdicionActual;
  const overlay = document.getElementById('modal-team-selector');
  
  try {
    const ref = doc(db, 'partidos_final', partidoId);
    const updateData = {};
    if (esEquipo1) updateData.equipo1 = equipo;
    else updateData.equipo2 = equipo;
    
    await updateDoc(ref, updateData);
    
    // Actualizar localmente
    const partido = partidosFinalData.find(p => p.id === partidoId);
    if (partido) {
      if (esEquipo1) partido.equipo1 = equipo;
      else partido.equipo2 = equipo;
      
      if (!resultadosFinal[partidoId]) resultadosFinal[partidoId] = {};
      if (esEquipo1) resultadosFinal[partidoId].eq1 = equipo;
      else resultadosFinal[partidoId].eq2 = equipo;
    }
    
    overlay.classList.add('hidden');
    showToast('Éxito', `Equipo actualizado a ${equipo}`, 'success');
    
    // Re-renderizar ronda actual
    renderizarRondaActual();
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'No se pudo actualizar el equipo', 'error');
  }
}

document.getElementById('btn-close-team-selector').onclick = () => {
  document.getElementById('modal-team-selector').classList.add('hidden');
};

function handleInputChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  
  if (!resultadosFinal[id]) resultadosFinal[id] = {};
  
  if (field === 'jugado') {
    resultadosFinal[id].jugado = e.target.checked;
    // Actualizar visual del checkbox label
    const label = e.target.closest('label');
    if (label) {
      const span = label.querySelector('span');
      if (span) {
        span.textContent = e.target.checked ? '✓ Jugado' : 'Marcar como jugado';
        span.style.color = e.target.checked ? '#4caf50' : 'inherit';
      }
    }
    return;
  }
  
  const value = e.target.value;
  resultadosFinal[id][field] = value;
  
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
    status.textContent = `${partidos.length - incompletos}/${partidos.length} partidos de ${NOMBRES_RONDAS[ronda]} completados`;
    status.style.color = 'var(--text-muted)';
  } else {
    btn.disabled = false;
    status.textContent = `✓ ${partidos.length} partidos de ${NOMBRES_RONDAS[ronda]} listos para guardar (incluye ${jugados} ya guardados)`;
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
        ganador: ganador,
        jugado: resultadosFinal[p.id]?.jugado || false
      };
      
      if (p1 !== null) updateData.penales_equipo1 = p1;
      if (p2 !== null) updateData.penales_equipo2 = p2;
      
      batch.update(ref, updateData);
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

// ===== GENERAR FASE FINAL AUTOMÁTICAMENTE =====
document.getElementById('btn-generar-fase-final').addEventListener('click', async () => {
  const btn = document.getElementById('btn-generar-fase-final');
  const status = document.getElementById('generar-status');
  const previewTabla = document.getElementById('tabla-grupos-preview');
  const previewTerceros = document.getElementById('mejores-terceros-preview');
  
  btn.disabled = true;
  status.textContent = 'Calculando clasificación...';
  
  try {
    // 1. Obtener todos los partidos de grupos
    const partidosSnap = await getDocs(collection(db, 'partidos_grupos'));
    const partidosPorGrupo = {};
    partidosSnap.forEach(d => {
      const data = d.data();
      if (!partidosPorGrupo[data.grupo]) partidosPorGrupo[data.grupo] = [];
      partidosPorGrupo[data.grupo].push({ id: d.id, ...data });
    });
    
    // 2. Calcular tabla de cada grupo
    const posicionesGrupos = {};
    const terceros = [];
    let previewHtml = '<h4 style="color: var(--accent); margin-bottom: 15px;">📊 Tabla de Grupos</h4>';
    previewHtml += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">';
    
    for (const [grupo, partidos] of Object.entries(partidosPorGrupo)) {
      // Verificar que todos los partidos del grupo estén jugados
      const todosJugados = partidos.every(p => p.jugado && p.goles_equipo1 !== null && p.goles_equipo2 !== null);
      if (!todosJugados) {
        throw new Error(`El grupo ${grupo} no tiene todos los partidos jugados. Ingresa todos los resultados primero.`);
      }
      
      const equipos = GRUPOS[grupo];
      const tabla = calcularTablaGrupo(partidos, equipos);
      posicionesGrupos[grupo] = tabla.map(t => t.equipo);
      
      // Guardar tercero
      if (tabla[2]) {
        terceros.push({
          equipo: tabla[2].equipo,
          grupo: grupo,
          pts: tabla[2].pts,
          dif: tabla[2].gf - tabla[2].gc,
          gf: tabla[2].gf
        });
      }
      
      // Previsualización
      previewHtml += `
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px;">
          <h5 style="color: var(--accent); margin-bottom: 10px;">Grupo ${grupo}</h5>
          <table style="width:100%; font-size: 0.85rem;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
              <th style="text-align:left; padding: 4px;">Pos</th>
              <th style="text-align:left; padding: 4px;">Equipo</th>
              <th style="text-align:center; padding: 4px;">Pts</th>
              <th style="text-align:center; padding: 4px;">Dif</th>
            </tr>
      `;
      tabla.forEach((t, idx) => {
        const posColor = idx === 0 ? 'color: gold;' : idx === 1 ? 'color: silver;' : idx === 2 ? 'color: #cd7f32;' : '';
        previewHtml += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 4px; ${posColor} font-weight: bold;">${idx + 1}</td>
            <td style="padding: 4px;">${t.equipo}</td>
            <td style="text-align:center; padding: 4px;">${t.pts}</td>
            <td style="text-align:center; padding: 4px;">${t.gf - t.gc}</td>
          </tr>
        `;
      });
      previewHtml += '</table></div>';
    }
    previewHtml += '</div>';
    previewTabla.innerHTML = previewHtml;
    previewTabla.style.display = 'block';
    
    // 3. Seleccionar 8 mejores terceros
    const mejores8 = seleccionarMejoresTerceros(terceros);
    
    let tercerosHtml = '<h4 style="color: var(--accent); margin: 20px 0 15px;">🥉 8 Mejores Terceros (Clasificados)</h4>';
    tercerosHtml += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">';
    mejores8.forEach((t, idx) => {
      tercerosHtml += `
        <div style="background: rgba(76, 175, 80, 0.2); border: 1px solid #4caf50; padding: 10px; border-radius: 8px;">
          <strong style="color: #4caf50;">#${idx + 1}</strong> ${t.equipo} <span style="color: var(--text-muted); font-size: 0.8rem;">(Grupo ${t.grupo}, ${t.pts}pts, Dif ${t.dif})</span>
        </div>
      `;
    });
    // Mostrar los que NO clasificaron
    const noClasificados = terceros.filter(t => !mejores8.includes(t));
    if (noClasificados.length > 0) {
      tercerosHtml += '</div><h5 style="color: var(--text-muted); margin: 15px 0 10px;">❌ Terceros No Clasificados</h5>';
      tercerosHtml += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">';
      noClasificados.forEach(t => {
        tercerosHtml += `
          <div style="background: rgba(244, 67, 54, 0.2); border: 1px solid var(--danger); padding: 10px; border-radius: 8px;">
            <strong style="color: var(--danger);">✗</strong> ${t.equipo} <span style="color: var(--text-muted); font-size: 0.8rem;">(Grupo ${t.grupo}, ${t.pts}pts, Dif ${t.dif})</span>
          </div>
        `;
      });
    }
    tercerosHtml += '</div>';
    previewTerceros.innerHTML = tercerosHtml;
    previewTerceros.style.display = 'block';
    
    // 4. Actualizar partidos de 16avos en Firestore
    const batch = writeBatch(db);
    const partidosFinalSnap = await getDocs(collection(db, 'partidos_final'));
    const partidosFinal = [];
    partidosFinalSnap.forEach(d => partidosFinal.push({ id: d.id, ...d.data() }));
    
    // Solo actualizar los 16 primeros (dieciseisavos)
    const dieciseisavos = partidosFinal.filter(p => p.ronda === 'dieciseisavos').sort((a, b) => a.numero - b.numero);
    
    if (dieciseisavos.length !== 16) {
      throw new Error(`Se esperaban 16 partidos de dieciseisavos, pero hay ${dieciseisavos.length}. Reinicia la base de datos.`);
    }
    
    for (const p of dieciseisavos) {
      const eq1 = placeholderToEquipo(p.equipo1, posicionesGrupos, mejores8);
      const eq2 = placeholderToEquipo(p.equipo2, posicionesGrupos, mejores8);
      
      const ref = doc(db, 'partidos_final', p.id);
      batch.update(ref, {
        equipo1: eq1,
        equipo2: eq2
      });
    }
    
    await batch.commit();
    
    showModal({
      icon: '✅',
      title: '¡Fase Final Generada!',
      message: 'Se calcularon las tablas de posiciones y se actualizaron los 16 partidos de dieciseisavos con los equipos reales clasificados.',
      btnPrimaryText: 'Continuar',
      btnPrimaryClass: 'btn btn-success'
    });
    
    status.innerHTML = '<span style="color: #4caf50;">✅ 16 partidos de dieciseisavos actualizados con equipos reales. Ahora puedes habilitar la fase final.</span>';
    
    // Recargar la vista
    await cargarPartidosFinal();
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error generando fase final: ' + err.message, 'error');
    status.innerHTML = `<span style="color: var(--danger);">❌ Error: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});

// ===== EXPORTAR TODO A PDF (ZIP) =====
document.getElementById('btn-export-all-pdf').addEventListener('click', async () => {
  const btn = document.getElementById('btn-export-all-pdf');
  const status = document.getElementById('export-status');
  
  if (!confirm('¿Deseas generar el respaldo de todos los usuarios? Este proceso puede tardar unos segundos.')) return;
  
  btn.disabled = true;
  status.textContent = '🔄 Iniciando exportación...';
  
  try {
    const { jsPDF } = window.jspdf;
    const zip = new JSZip();
    
    // 1. Obtener datos necesarios
    status.textContent = '📥 Cargando datos de usuarios...';
    const usersSnap = await getDocs(collection(db, 'users'));
    const usuarios = [];
    usersSnap.forEach(d => usuarios.push({ id: d.id, ...d.data() }));
    
    if (usuarios.length === 0) {
      throw new Error('No hay usuarios registrados.');
    }
    
    status.textContent = '📥 Cargando todas las predicciones...';
    const [predsGruposSnap, predsFinalSnap] = await Promise.all([
      getDocs(collection(db, 'predicciones_grupos')),
      getDocs(collection(db, 'predicciones_final'))
    ]);
    
    const allPredsGrupos = {};
    predsGruposSnap.forEach(d => {
      const data = d.data();
      if (!allPredsGrupos[data.user_id]) allPredsGrupos[data.user_id] = [];
      allPredsGrupos[data.user_id].push(data);
    });
    
    const allPredsFinal = {};
    predsFinalSnap.forEach(d => {
      const data = d.data();
      if (!allPredsFinal[data.user_id]) allPredsFinal[data.user_id] = [];
      allPredsFinal[data.user_id].push(data);
    });
    
    status.textContent = '📄 Generando PDFs... (0/' + usuarios.length + ')';
    
    for (let i = 0; i < usuarios.length; i++) {
      const u = usuarios[i];
      status.textContent = `📄 Generando PDFs... (${i + 1}/${usuarios.length})`;
      
      const docPdf = new jsPDF();
      let y = 20;
      
      // Encabezado
      docPdf.setFontSize(18);
      docPdf.setTextColor(0, 102, 51);
      docPdf.text('POLLA MUNDIALISTA 2026', 105, y, { align: 'center' });
      y += 10;
      
      docPdf.setFontSize(14);
      docPdf.setTextColor(0, 0, 0);
      docPdf.text(`Respaldo de Predicciones`, 105, y, { align: 'center' });
      y += 15;
      
      // Datos Usuario
      docPdf.setFontSize(11);
      docPdf.setFont(undefined, 'bold');
      docPdf.text('DATOS DEL PARTICIPANTE:', 20, y);
      y += 7;
      docPdf.setFont(undefined, 'normal');
      docPdf.text(`Nombre / Alias: ${u.alias}`, 20, y);
      y += 6;
      docPdf.text(`Cédula: ${u.cedula}`, 20, y);
      y += 6;
      docPdf.text(`Institución: ${u.institucion_activa || 'No definida'}`, 20, y);
      y += 15;
      
      // FASE DE GRUPOS
      docPdf.setFontSize(12);
      docPdf.setFont(undefined, 'bold');
      docPdf.setTextColor(168, 213, 186);
      docPdf.rect(20, y - 5, 170, 7, 'F');
      docPdf.setTextColor(0, 0, 0);
      docPdf.text('ETAPA 1: FASE DE GRUPOS', 25, y);
      y += 10;
      
      const predsU = allPredsGrupos[u.id] || [];
      if (predsU.length === 0) {
        docPdf.setFont(undefined, 'italic');
        docPdf.text('No hay predicciones registradas para esta fase.', 25, y);
        y += 10;
      } else {
        docPdf.setFontSize(9);
        docPdf.setFont(undefined, 'bold');
        docPdf.text('PARTIDO', 25, y);
        docPdf.text('PREDICCIÓN', 120, y);
        y += 5;
        docPdf.line(25, y, 180, y);
        y += 7;
        
        docPdf.setFont(undefined, 'normal');
        predsU.sort((a,b) => a.partido_id.localeCompare(b.partido_id)).forEach(p => {
          if (y > 270) { docPdf.addPage(); y = 20; }
          docPdf.text(p.partido_id, 25, y);
          docPdf.text(`${p.prediccion_equipo1} - ${p.prediccion_equipo2}`, 120, y);
          y += 6;
        });
        y += 5;
      }
      
      // FASE FINAL
      if (y > 240) { docPdf.addPage(); y = 20; }
      y += 10;
      docPdf.setFontSize(12);
      docPdf.setFont(undefined, 'bold');
      docPdf.setTextColor(232, 197, 71);
      docPdf.rect(20, y - 5, 170, 7, 'F');
      docPdf.setTextColor(0, 0, 0);
      docPdf.text('ETAPA 2: FASE FINAL', 25, y);
      y += 10;
      
      const predsF = allPredsFinal[u.id] || [];
      if (predsF.length === 0) {
        docPdf.setFont(undefined, 'italic');
        docPdf.text('No hay predicciones registradas para esta fase.', 25, y);
        y += 10;
      } else {
        docPdf.setFontSize(9);
        docPdf.setFont(undefined, 'bold');
        docPdf.text('RONDA / PARTIDO', 25, y);
        docPdf.text('MARCADOR', 100, y);
        docPdf.text('GANADOR', 140, y);
        y += 5;
        docPdf.line(25, y, 180, y);
        y += 7;
        
        docPdf.setFont(undefined, 'normal');
        predsF.sort((a,b) => a.partido_id.localeCompare(b.partido_id)).forEach(p => {
          if (y > 270) { docPdf.addPage(); y = 20; }
          docPdf.text(p.partido_id, 25, y);
          docPdf.text(`${p.prediccion_equipo1} - ${p.prediccion_equipo2}`, 100, y);
          docPdf.text(p.prediccion_ganador || '-', 140, y);
          y += 6;
        });
      }
      
      const pdfBlob = docPdf.output('blob');
      const filename = `${u.cedula}_${u.alias.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      zip.file(filename, pdfBlob);
    }
    
    status.textContent = '📦 Empaquetando ZIP...';
    const content = await zip.generateAsync({ type: 'blob' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `Respaldo_Polla_2026_${new Date().toISOString().split('T')[0]}.zip`;
    link.click();
    
    status.textContent = '✅ ¡Exportación completada!';
    showToast('Éxito', 'Respaldo generado con éxito', 'success');
    
  } catch (err) {
    console.error(err);
    status.textContent = '❌ Error en la exportación';
    showToast('Error', 'No se pudo generar el respaldo: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ===== EVENT LISTENERS PARA BOTONES DE INICIALIZACIÓN =====
document.getElementById('btn-init-db').addEventListener('click', async () => {
  const btn = document.getElementById('btn-init-db');
  const status = document.getElementById('init-status');
  btn.disabled = true;
  status.textContent = 'Verificando...';
  
  try {
    const existing = await getDocs(collection(db, 'partidos_grupos'));
    if (!existing.empty) {
      showModal({
        icon: '⚠️',
        title: 'Ya existen datos',
        message: 'La base de datos ya tiene partidos cargados. Si quieres reiniciar, usa el botón rojo "Reiniciar Todo" primero.',
        btnPrimaryText: 'Entendido',
        btnPrimaryClass: 'btn btn-primary'
      });
      btn.disabled = false;
      status.textContent = '';
      return;
    }
    
    const batch = writeBatch(db);
    
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
    
    const partidosFinal = generarPartidosFinal();
    for (const p of partidosFinal) {
      const ref = doc(db, 'partidos_final', p.id);
      const data = {
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
      };
      if (p.source_equipo1 !== undefined) data.source_equipo1 = p.source_equipo1;
      if (p.source_equipo2 !== undefined) data.source_equipo2 = p.source_equipo2;
      if (p.perdedor_source1 !== undefined) data.perdedor_source1 = p.perdedor_source1;
      if (p.perdedor_source2 !== undefined) data.perdedor_source2 = p.perdedor_source2;
      batch.set(ref, data);
    }
    
    const configRef = doc(db, 'config', 'app_config');
    batch.set(configRef, {
      fase_actual: 'grupos',
      fase_final_habilitada: false,
      creado: new Date().toISOString()
    });
    
    // Seed default institutions
    batch.set(doc(db, 'instituciones', 'GDR'), {
      nombre: 'GDR',
      descripcion: 'Gerencia de Desarrollo y Recursos',
      activo: true,
      creado: new Date().toISOString()
    });
    
    await batch.commit();
    
    showModal({
      icon: '✅',
      title: '¡Base de Datos Inicializada!',
      message: `Se cargaron:<br><br>• <b>${partidosGrupos.length}</b> partidos de grupos<br>• <b>${partidosFinal.length}</b> partidos de fase final<br><br>Ahora puedes ingresar los resultados de los partidos.`,
      btnPrimaryText: 'Continuar',
      btnPrimaryClass: 'btn btn-success'
    });
    
    status.innerHTML = '<span style="color: #4caf50;">✅ Base de datos lista.</span>';
    await cargarPartidosGrupos();
    await cargarPartidosFinal();
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error al inicializar: ' + err.message, 'error');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-reset-db').addEventListener('click', async () => {
  showModal({
    icon: '⚠️',
    title: '¿Reiniciar Todo?',
    message: 'Se eliminarán permanentemente:<br><br>• Todos los partidos (grupos y final)<br>• Todas las predicciones de usuarios<br>• Todos los puntos<br><br>⚠️ Los usuarios NO se eliminarán.<br><br>Esta acción NO se puede deshacer.',
    btnPrimaryText: '🗑️ Sí, Reiniciar Todo',
    btnPrimaryClass: 'btn btn-danger',
    btnSecondaryText: 'Cancelar',
    btnSecondaryClass: 'btn btn-secondary',
    onPrimary: async () => {
      const btn = document.getElementById('btn-reset-db');
      btn.disabled = true;
      const status = document.getElementById('init-status');
      status.textContent = 'Eliminando datos...';
      
      try {
        const batch = writeBatch(db);
        
        const gruposSnap = await getDocs(collection(db, 'partidos_grupos'));
        for (const d of gruposSnap.docs) {
          batch.delete(doc(db, 'partidos_grupos', d.id));
        }
        
        const finalSnap = await getDocs(collection(db, 'partidos_final'));
        for (const d of finalSnap.docs) {
          batch.delete(doc(db, 'partidos_final', d.id));
        }
        
        const predsGruposSnap = await getDocs(collection(db, 'predicciones_grupos'));
        for (const d of predsGruposSnap.docs) {
          batch.delete(doc(db, 'predicciones_grupos', d.id));
        }
        
        const predsFinalSnap = await getDocs(collection(db, 'predicciones_final'));
        for (const d of predsFinalSnap.docs) {
          batch.delete(doc(db, 'predicciones_final', d.id));
        }
        
        await batch.commit();
        
        showModal({
          icon: '✅',
          title: '¡Reinicio Completado!',
          message: 'Todos los partidos, predicciones y resultados han sido eliminados.<br><br>Ahora puedes volver a cargar los partidos.',
          btnPrimaryText: 'Continuar',
          btnPrimaryClass: 'btn btn-success'
        });
        
        status.innerHTML = '<span style="color: var(--accent);">✅ Reinicio completado. Carga los partidos de nuevo.</span>';
        
      } catch (err) {
        console.error(err);
        showToast('Error', 'Error al reiniciar: ' + err.message, 'error');
        status.textContent = '';
      } finally {
        btn.disabled = false;
      }
    }
  });
});

// ===== GESTIÓN DE USUARIOS =====

let currentSearchUser = null;

// Buscar usuarios
document.getElementById('btn-search-user').addEventListener('click', async () => {
  const cedula = document.getElementById('search-cedula').value.trim();
  const alias = document.getElementById('search-alias').value.trim();
  const resultsDiv = document.getElementById('users-search-results');
  
  if (!cedula && !alias) {
    showToast('Aviso', 'Ingresa cédula o alias para buscar', 'warning');
    return;
  }
  
  resultsDiv.innerHTML = '<div class="spinner"></div>';
  
  try {
    let usuarios = [];
    
    if (cedula) {
      const q = query(collection(db, 'users'), where('cedula', '==', cedula));
      const snap = await getDocs(q);
      snap.forEach(d => usuarios.push({ id: d.id, ...d.data() }));
    } else if (alias) {
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
      resultsDiv.innerHTML = '<p style="color: var(--text-muted); text-align:center; padding:20px;">No se encontraron usuarios</p>';
      return;
    }
    
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
            <button class="btn btn-info" style="padding: 6px 12px; font-size: 0.8rem; margin-right: 5px;" 
              onclick="window.verPrediccionesUsuario('${u.cedula}', '${u.alias}')">📋 Ver</button>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" 
              onclick="window.eliminarUsuario('${u.cedula}', '${u.alias}')">🗑️ Eliminar</button>
          </td>
        </tr>
      `;
    }
    
    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error buscando usuarios', 'error');
    resultsDiv.innerHTML = '<p style="color: var(--danger);">Error en la búsqueda</p>';
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
              <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem;" 
                onclick="window.borrarPrediccion('${cedula}', '${alias}', '${p.partido_id}', 'grupos')">🗑️ Borrar</button>
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
              <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem;" 
                onclick="window.borrarPrediccion('${cedula}', '${alias}', '${p.partido_id}', 'final')">🗑️ Borrar</button>
            </td>
          </tr>
        `;
      }
      html += '</tbody></table>';
    }
    
    container.innerHTML = html;
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error cargando predicciones', 'error');
    container.innerHTML = '<p style="color: var(--danger);">Error cargando predicciones</p>';
  }
};

// Borrar predicción individual
window.borrarPrediccion = async (cedula, alias, partidoId, tipo) => {
  if (!confirm(`¿Eliminar predicción de ${alias} para el partido ${partidoId}?`)) return;
  
  try {
    const userId = `${cedula}_${alias}`;
    const coleccion = tipo === 'grupos' ? 'predicciones_grupos' : 'predicciones_final';
    
    // Buscar el documento por user_id y partido_id (el docId ahora incluye institución)
    const qPred = query(
      collection(db, coleccion),
      where('user_id', '==', userId),
      where('partido_id', '==', partidoId)
    );
    const snap = await getDocs(qPred);
    
    if (snap.empty) {
      showToast('Aviso', 'No se encontró la predicción', 'warning');
      return;
    }
    
    for (const d of snap.docs) {
      await deleteDoc(doc(db, coleccion, d.id));
    }
    
    showToast('Éxito', 'Predicción eliminada', 'success');
    window.verPrediccionesUsuario(cedula, alias);
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error eliminando predicción', 'error');
  }
};

// Eliminar usuario completo
window.eliminarUsuario = async (cedula, alias) => {
  if (!confirm(`¿ESTÁS SEGURO?\n\nSe eliminará permanentemente:\n- Usuario: ${alias}\n- Cédula: ${cedula}\n- TODAS sus predicciones\n- TODOS sus puntos\n\n¿Deseas continuar?`)) {
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
    
    showToast('Éxito', `Usuario ${alias} eliminado completamente`, 'success');
    document.getElementById('users-search-results').innerHTML = '';
    document.getElementById('user-predictions-section').style.display = 'none';
    
  } catch (err) {
    console.error(err);
    showToast('Error', 'Error eliminando usuario', 'error');
  }
};

init();