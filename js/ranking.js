/* ranking.js - Tabla de posiciones en tiempo real */

import { db } from './firebase-config.js';
import { collection, query, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth, updateNav, logout, getCurrentUser } from './auth.js';

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

// Función para renderizar ranking
function renderizarRanking(usuarios) {
  const tbody = document.getElementById('ranking-body');
  tbody.innerHTML = '';
  
  if (usuarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Aún no hay participantes registrados</td></tr>';
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
    
    tr.innerHTML = `
      <td class="${rankClass}">${pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}</td>
      <td style="text-align:left; font-weight:600;">${u.alias}</td>
      <td>${u.puntos_fase_grupos || 0}</td>
      <td>${u.puntos_fase_final || 0}</td>
      <td style="font-weight:bold; color:var(--accent); font-size:1.1rem;">${u.puntos_total || 0}</td>
    `;
    
    tbody.appendChild(tr);
  });
}

// Cargar ranking con listener en tiempo real
async function cargarRanking() {
  try {
    const q = query(collection(db, 'users'));
    
    // Usar onSnapshot para actualizaciones en tiempo real
    onSnapshot(q, (snapshot) => {
      const usuarios = [];
      snapshot.forEach(d => {
        usuarios.push({ id: d.id, ...d.data() });
      });
      renderizarRanking(usuarios);
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
cargarRanking();
