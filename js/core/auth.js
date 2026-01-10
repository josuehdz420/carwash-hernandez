import { db } from "../config/firebase.js";
import { showApp, showLogin } from "./router.js";
import { loadDashboard } from "../modules/dashboard/dashboard.js";
import { getSessionUser, setSessionUser, logout } from "./session.js";

import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const SUPER_PIN = "70513690";

document.addEventListener("DOMContentLoaded", () => {
  const userSelect = document.getElementById("userSelect");
  const pinInput = document.getElementById("pinInput");
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // ==========================
  // CARGAR USUARIOS ACTIVOS
  // ==========================
  async function loadUsers() {
    try {
      const q = query(
        collection(db, "users"),
        where("active", "==", true)
      );

      const snap = await getDocs(q);

      userSelect.innerHTML =
        `<option value="">Selecciona tu nombre</option>`;

      snap.forEach(docSnap => {
        const user = docSnap.data();
        const option = document.createElement("option");
        option.value = docSnap.id;
        option.textContent = user.name;
        userSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    }
  }

  // ==========================
  // LOGIN OK
  // ==========================
  function onLoginSuccess() {
    showApp();
    loadDashboard();
  }

  // ==========================
  // LOGIN
  // ==========================
  loginBtn.addEventListener("click", async () => {
    const userId = userSelect.value;
    const pin = pinInput.value.trim();

    // ==========================
    // SUPER ADMIN
    // ==========================
    if (pin === SUPER_PIN) {
      setSessionUser({
        id: "super_admin",
        name: "Josué",
        role: "super_admin"
      });

      onLoginSuccess();
      return;
    }

    if (!userId || !pin) {
      alert("Selecciona tu nombre y escribe el PIN");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("__name__", "==", userId)
      );

      const snap = await getDocs(q);
      if (snap.empty) {
        alert("Usuario no válido");
        return;
      }

      const docSnap = snap.docs[0];
      const data = docSnap.data();

      if (!data.active || data.pin !== pin) {
        alert("PIN incorrecto");
        return;
      }

      setSessionUser({
        id: docSnap.id,
        name: data.name,
        role: data.role
      });

      onLoginSuccess();
    } catch (error) {
      console.error("Error en login:", error);
      alert("Error al iniciar sesión");
    }
  });

  // ==========================
  // LOGOUT
  // ==========================
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // ==========================
  // PERSISTENCIA
  // ==========================
  function initAuth() {
    const user = getSessionUser();

    if (user) {
      showApp();
      loadDashboard();
    } else {
      showLogin();
    }
  }

  loadUsers();
  initAuth();
});
