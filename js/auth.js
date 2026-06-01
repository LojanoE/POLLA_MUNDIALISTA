/* auth.js - Manejo de sesión de usuarios y admin */

export const ADMIN_USER = "ADMIN";
export const ADMIN_PASS = "Mirador12345";

export function getCurrentUser() {
  const user = localStorage.getItem("polla_user");
  return user ? JSON.parse(user) : null;
}

export function setCurrentUser(cedula, alias, isAdmin = false) {
  const user = { cedula, alias, isAdmin };
  localStorage.setItem("polla_user", JSON.stringify(user));
  return user;
}

export function logout() {
  localStorage.removeItem("polla_user");
  window.location.href = "index.html";
}

export function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

export function requireAdmin() {
  const user = getCurrentUser();
  if (!user || !user.isAdmin) {
    window.location.href = "index.html";
    return null;
  }
  return user;
}

export function updateNav() {
  const user = getCurrentUser();
  const navUser = document.getElementById("nav-user");
  const navAdmin = document.getElementById("nav-admin");
  const navLogout = document.getElementById("nav-logout");
  
  if (navUser && user) {
    navUser.textContent = user.isAdmin ? `Admin` : user.alias;
  }
  if (navAdmin) {
    navAdmin.style.display = user && user.isAdmin ? "inline-block" : "none";
  }
  if (navLogout) {
    navLogout.style.display = user ? "inline-block" : "none";
  }
}
