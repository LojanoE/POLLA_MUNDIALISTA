/* reglas.js - Página de Reglas */

import { getCurrentUser, updateNav, logout } from './auth.js?v=7.5';

// No requerimos auth para ver reglas, pero si hay sesión mostramos el nav
const user = getCurrentUser();
if (user) {
  updateNav();
  const logoutBtn = document.getElementById('nav-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
} else {
  // Ocultar elementos de usuario si no está logueado
  const navUser = document.getElementById('nav-user');
  const navLogout = document.getElementById('nav-logout');
  if (navUser) navUser.style.display = 'none';
  if (navLogout) navLogout.style.display = 'none';
}
