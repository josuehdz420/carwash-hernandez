import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";
import { db } from "../../config/firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// ESTADO
// ==========================
let editingUserId = null;

// ==========================
// CARGAR USUARIOS
// ==========================
export async function loadUsuarios() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "super_admin") {
    alert("No tienes permiso para gestionar usuarios");
    return;
  }

  loadView(`
    <section class="module usuarios-module">

      <header class="module-header">
        <button id="btn-volver" class="btn btn-back">Volver</button>
        <h2 class="module-title">Usuarios</h2>
      </header>

      <main class="module-content">

        <form id="usuario-form" class="form-card">
          <input
            type="text"
            id="name"
            placeholder="Nombre *"
            required
          />

          <input
            type="number"
            id="pin"
            placeholder="PIN (mín. 4 dígitos)"
            ${editingUserId ? "" : "required"}
          />

          <small class="hint">
            ${editingUserId ? "Deja el PIN vacío para no cambiarlo" : ""}
          </small>

          <select id="role" required>
            <option value="">Rol</option>
            <option value="admin">Admin</option>
            <option value="gestor">Gestor</option>
          </select>

          <select id="active" required>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>

          <button type="submit" id="submit-btn" class="btn btn-success">
            ${editingUserId ? "Actualizar usuario" : "Guardar usuario"}
          </button>
        </form>

        <section class="list-section">
          <h3>Lista de usuarios</h3>
          <ul id="usuarios-list" class="list"></ul>
        </section>

      </main>

    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);
  document
    .getElementById("usuario-form")
    .addEventListener("submit", saveUser);

  await loadUsuariosList();
}

// ==========================
// GUARDAR / EDITAR
// ==========================
async function saveUser(e) {
  e.preventDefault();

  const sessionUser = getSessionUser();

  const name = document.getElementById("name").value.trim();
  const pin = document.getElementById("pin").value.trim();
  const role = document.getElementById("role").value;
  const active = document.getElementById("active").value === "true";
  const btn = document.getElementById("submit-btn");

  if (!name || !role) {
    alert("Completa todos los campos obligatorios");
    return;
  }

  if (pin && !/^\d{4,}$/.test(pin)) {
    alert("El PIN debe tener al menos 4 números");
    return;
  }

  // Validar PIN duplicado
  if (pin) {
    const q = query(collection(db, "users"), where("pin", "==", pin));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const exists = snap.docs.some(d => d.id !== editingUserId);
      if (exists) {
        alert("Ese PIN ya está en uso");
        return;
      }
    }
  }

  // Evitar desactivar último admin
  if (editingUserId && role === "admin" && !active) {
    const admins = await getAdmins();
    if (admins.length <= 1) {
      alert("Debe existir al menos un admin activo");
      return;
    }
  }

  try {
    const data = { name, role, active };
    if (pin) data.pin = pin;

    if (editingUserId) {
      await updateDoc(doc(db, "users", editingUserId), data);
    } else {
      if (!pin) {
        alert("El PIN es obligatorio");
        return;
      }

      await addDoc(collection(db, "users"), {
        ...data,
        pin
      });
    }

    editingUserId = null;
    btn.textContent = "Guardar usuario";
    e.target.reset();

    loadUsuarios();
  } catch (error) {
    console.error("Error guardando usuario:", error);
    alert("Error al guardar usuario");
  }
}

// ==========================
// LISTAR USUARIOS
// ==========================
async function loadUsuariosList() {
  const list = document.getElementById("usuarios-list");
  list.innerHTML = "<li>Cargando...</li>";

  const sessionUser = getSessionUser();

  try {
    const q = query(collection(db, "users"), orderBy("name"));
    const snapshot = await getDocs(q);
    list.innerHTML = "";

    if (snapshot.empty) {
      list.innerHTML = "<li>No hay usuarios registrados</li>";
      return;
    }

    snapshot.forEach(docSnap => {
      const u = docSnap.data();
      const li = document.createElement("li");
      li.className = `usuario-item ${u.active ? "" : "inactivo"}`;

      li.innerHTML = `
        <div class="item-info">
          <strong>${u.name}</strong>
          <small>Rol: ${u.role}</small>
          <small>${u.active ? "Activo" : "Inactivo"}</small>
        </div>

        <div class="item-actions">
          <button class="btn-icon edit-btn" data-id="${docSnap.id}">✏️</button>
          ${
            docSnap.id !== sessionUser.id
              ? `<button class="btn-icon delete-btn" data-id="${docSnap.id}">🗑</button>`
              : ""
          }
        </div>
      `;

      list.appendChild(li);
    });

    // EDITAR
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const docSnap = snapshot.docs.find(d => d.id === id);
        if (!docSnap) return;

        const u = docSnap.data();

        document.getElementById("name").value = u.name;
        document.getElementById("pin").value = "";
        document.getElementById("role").value = u.role;
        document.getElementById("active").value = u.active ? "true" : "false";

        editingUserId = id;
        document.getElementById("submit-btn").textContent =
          "Actualizar usuario";
      });
    });

    // ELIMINAR
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;

        const admins = await getAdmins();
        const userDoc = snapshot.docs.find(d => d.id === id);
        const userData = userDoc?.data();

        if (userData?.role === "admin" && admins.length <= 1) {
          alert("No puedes eliminar el último admin");
          return;
        }

        if (!confirm("¿Eliminar usuario?")) return;
        await deleteDoc(doc(db, "users", id));
        loadUsuarios();
      });
    });
  } catch (error) {
    console.error("Error cargando usuarios:", error);
    list.innerHTML = "<li>Error al cargar usuarios</li>";
  }
}

// ==========================
// HELPERS
// ==========================
async function getAdmins() {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs.filter(
    d => d.data().role === "admin" && d.data().active
  );
}
