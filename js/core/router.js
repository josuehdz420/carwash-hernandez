import { getSessionUser } from "./session.js";

// ==========================
// MOSTRAR LOGIN
// ==========================
export function showLogin() {
  const loginScreen = document.getElementById("login-screen");
  const appScreen = document.getElementById("app-screen");

  if (!loginScreen || !appScreen) return;

  appScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

// ==========================
// MOSTRAR APP
// ==========================
export function showApp() {
  const loginScreen = document.getElementById("login-screen");
  const appScreen = document.getElementById("app-screen");

  if (!loginScreen || !appScreen) return;

  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
}

// ==========================
// CARGAR VISTAS PROTEGIDAS
// ==========================
export function loadView(html) {
  const appContent = document.getElementById("app-content");
  const user = getSessionUser();

  if (!appContent) return;

  if (!user) {
    showLogin();
    return;
  }

  appContent.innerHTML = html || "";
}
