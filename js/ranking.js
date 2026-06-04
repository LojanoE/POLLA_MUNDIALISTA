/* ranking.js - Tabla de posiciones en tiempo real, filtrado por institución */

import { db } from './firebase-config.js?v=7.3';
import { collection, query, getDocs, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, updateNav, logout, getCurrentUser, getInstitucionActiva } from './auth.js?v=7.3';

const user = requireAuth();
if (!user) throw new Error("No autenticado");

updateNav();
document.getElementById('nav-logout').addEventListener('click', logout);

const isAdmin = user.alias === 'ADMIN';
let institucionFiltro = isAdmin ? 'TODAS' : (getInstitucionActiva() || 'TODAS');
let institucionesDisponibles = [];
let unsubscribeRanking = null;

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

// Cargar instituciones disponibles para tabs de admin
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
    
    // Renderizar tabs
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
      
      // Mostrar tabs
      document.getElementById('institucion-tabs').style.display = 'block';
      
      // Agregar listeners
      tabsContainer.querySelectorAll('.inst-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
          institucionFiltro = e.target.dataset.inst;
          cargarInstituciones(); // Re-renderizar tabs
          cargarRanking(); // Recargar ranking con filtro
        });
      });
    }
  } catch (err) {
    console.error('Error cargando instituciones:', err);
  }
}

// Función para renderizar ranking
function renderizarRanking(usuarios) {
  const tbody = document.getElementById('ranking-body');
  tbody.innerHTML = '';
  
  if (usuarios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 5}" style="text-align:center; padding:30px; color:var(--text-muted);">Aún no hay participantes registrados${!isAdmin && institucionFiltro !== 'TODAS' ? ' en esta institución' : ''}</td></tr>`;
    return;
  }
  
  // Ordenar por puntos totales descendente
  usuarios.sort((a, b) => (b.puntos_total || 0) - (a.puntos_total || 0));
  
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
      <td>${u.puntos_fase_grupos || 0}</td>
      <td>${u.puntos_fase_final || 0}</td>
      <td style="font-weight:bold; color:var(--accent); font-size:1.1rem;">${u.puntos_total || 0}</td>
    `;
    
    tbody.appendChild(tr);
  });
}

// Actualizar encabezados de tabla según rol
function actualizarEncabezados() {
  const thead = document.querySelector('.ranking-table thead tr');
  if (isAdmin && thead && !thead.querySelector('.inst-col')) {
    const th = document.createElement('th');
    th.className = 'inst-col';
    th.textContent = 'Institución';
    // Insertar después de Alias
    thead.insertBefore(th, thead.children[2]);
  }
}

// Determinar si un usuario pertenece a una institución (con fallback)
function usuarioPerteneceAInstitucion(u, institucion) {
  if (!institucion || institucion === 'TODAS') return true;
  if (u.institucion_activa === institucion) return true;
  if (u.instituciones && u.instituciones.includes(institucion)) return true;
  return false;
}

// Cargar ranking con listener en tiempo real
async function cargarRanking() {
  try {
    // Cancelar listener anterior si existe
    if (unsubscribeRanking) {
      unsubscribeRanking();
    }
    
    // Siempre cargar TODOS los usuarios y filtrar en JS (más robusto para datos antiguos)
    const q = query(collection(db, 'users'));
    
    // Usar onSnapshot para actualizaciones en tiempo real
    unsubscribeRanking = onSnapshot(q, (snapshot) => {
      const todosLosUsuarios = [];
      snapshot.forEach(d => {
        todosLosUsuarios.push({ id: d.id, ...d.data() });
      });
      
      // Filtrar por institución en memoria (maneja usuarios sin institucion_activa)
      const usuariosFiltrados = todosLosUsuarios.filter(u => {
        if (isAdmin && institucionFiltro === 'TODAS') return true;
        if (isAdmin) return usuarioPerteneceAInstitucion(u, institucionFiltro);
        // Usuario normal: solo ver su institución
        const userInst = getInstitucionActiva();
        return usuarioPerteneceAInstitucion(u, userInst);
      });
      
      renderizarRanking(usuariosFiltrados);
    }, (err) => {
      console.error(err);
      showAlert('Error cargando ranking', 'danger');
    });
    
  } catch (err) {
    console.error(err);
    showAlert('Error cargando ranking', 'danger');
  }
}

// Init
actualizarEncabezados();
cargarInstituciones();
cargarRanking();
