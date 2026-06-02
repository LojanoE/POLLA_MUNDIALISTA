/* auth.js - Manejo de sesión de usuarios y admin */

export const ADMIN_USER = "ADMIN";
export const ADMIN_PASS = "Mirador12345";

export function getCurrentUser() {
  try {
    const user = localStorage.getItem("polla_user");
    return user ? JSON.parse(user) : null;
  } catch {
    localStorage.removeItem("polla_user");
    return null;
  }
}

export function setCurrentUser(cedula, alias, isAdmin = false, institucion = null) {
  const user = { cedula, alias, isAdmin };
  if (institucion) {
    user.institucion = institucion;
  }
  localStorage.setItem("polla_user", JSON.stringify(user));
  return user;
}

export function setInstitucionActiva(institucion) {
  const user = getCurrentUser();
  if (user) {
    user.institucion = institucion;
    localStorage.setItem("polla_user", JSON.stringify(user));
  }
}

export function getInstitucionActiva() {
  const user = getCurrentUser();
  return user ? user.institucion : null;
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
  const navInstitucion = document.getElementById("nav-institucion");
  
  if (navUser && user) {
    let displayText = user.isAdmin ? `Admin` : user.alias;
    if (user.institucion && !user.isAdmin) {
      displayText += ` (${user.institucion})`;
    }
    navUser.textContent = displayText;
  }
  if (navAdmin) {
    navAdmin.style.display = user && user.isAdmin ? "inline-block" : "none";
  }
  if (navLogout) {
    navLogout.style.display = user ? "inline-block" : "none";
  }
}
