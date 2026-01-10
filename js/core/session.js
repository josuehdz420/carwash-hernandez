// ==========================
// SESIÓN DE USUARIO
// ==========================

export function getSessionUser() {
  try {
    const session = localStorage.getItem("sessionUser");
    return session ? JSON.parse(session) : null;
  } catch (error) {
    console.warn("Sesión corrupta, limpiando...");
    localStorage.removeItem("sessionUser");
    return null;
  }
}

export function setSessionUser(user) {
  if (!user || typeof user !== "object") {
    throw new Error("Usuario inválido para sesión");
  }
  localStorage.setItem("sessionUser", JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem("sessionUser");
  window.location.href = "/index.html";
}
