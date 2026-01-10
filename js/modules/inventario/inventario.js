import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";
import { db } from "../../config/firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// ESTADO DE EDICIÓN
// ==========================
let editingInsumoId = null;

// ==========================
// CARGAR INVENTARIO
// ==========================
export async function loadInventario() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso para ver inventario");
    return;
  }

  loadView(`
    <section class="inventario">
      <h2>Inventario</h2>

      <form id="inventario-form" class="form-card">
        <input
          type="text"
          id="nombre"
          placeholder="Nombre del insumo"
          required
        />

        <input
          type="text"
          id="cantidad"
          placeholder="Cantidad (ej: 2 botellas, 1 galón)"
        />

        <select id="estado" required>
          <option value="">Estado</option>
          <option value="hay">Hay</option>
          <option value="poco">Poco</option>
          <option value="agotado">Se acabó</option>
        </select>

        <div class="form-actions">
          <button type="submit" id="submit-btn">Guardar</button>
          <button type="button" id="btn-volver">Volver</button>
        </div>
      </form>

      <h3>Insumos</h3>
      <ul id="inventario-list" class="list"></ul>
    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);
  document
    .getElementById("inventario-form")
    .addEventListener("submit", saveInsumo);

  await loadInventarioList();
}

// ==========================
// GUARDAR / ACTUALIZAR
// ==========================
async function saveInsumo(e) {
  e.preventDefault();

  const nombre = document.getElementById("nombre").value.trim();
  const cantidad = document.getElementById("cantidad").value.trim();
  const estado = document.getElementById("estado").value;
  const submitBtn = document.getElementById("submit-btn");

  if (!nombre || !estado) {
    alert("Completa los datos obligatorios");
    return;
  }

  try {
    if (editingInsumoId) {
      // ✏️ EDITAR
      await updateDoc(doc(db, "inventario", editingInsumoId), {
        nombre,
        cantidad,
        estado
      });
    } else {
      // ➕ NUEVO
      await addDoc(collection(db, "inventario"), {
        nombre,
        cantidad,
        estado,
        fecha: serverTimestamp()
      });
    }

    // Reset estado
    editingInsumoId = null;
    submitBtn.textContent = "Guardar";
    e.target.reset();

    loadInventario();

  } catch (error) {
    console.error("Error guardando insumo:", error);
    alert("Error al guardar");
  }
}

// ==========================
// LISTAR + EDITAR + ELIMINAR
// ==========================
async function loadInventarioList() {
  const list = document.getElementById("inventario-list");
  list.innerHTML = "<li>Cargando...</li>";

  try {
    const q = query(
      collection(db, "inventario"),
      orderBy("fecha", "desc")
    );

    const snapshot = await getDocs(q);
    list.innerHTML = "";

    if (snapshot.empty) {
      list.innerHTML = "<li>No hay insumos registrados</li>";
      return;
    }

    snapshot.forEach(docSnap => {
      const i = docSnap.data();

      const li = document.createElement("li");
      li.className = "inventario-item";

      li.innerHTML = `
        <div>
          <strong>${i.nombre}</strong>
          <br />
          ${i.cantidad ? `<small>Cantidad: ${i.cantidad}</small><br />` : ""}
          <span class="estado ${i.estado}">
            ${labelEstado(i.estado)}
          </span>
        </div>

        <div class="item-actions">
          <button class="edit-btn" data-id="${docSnap.id}">✏️</button>
          <button class="delete-btn" data-id="${docSnap.id}">🗑</button>
        </div>
      `;

      list.appendChild(li);
    });

    // ==========================
    // EDITAR
    // ==========================
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;

        snapshot.forEach(docSnap => {
          if (docSnap.id === id) {
            const d = docSnap.data();

            document.getElementById("nombre").value = d.nombre;
            document.getElementById("cantidad").value = d.cantidad || "";
            document.getElementById("estado").value = d.estado;

            editingInsumoId = id;
            document.getElementById("submit-btn").textContent =
              "Actualizar";
          }
        });
      });
    });

    // ==========================
    // ELIMINAR
    // ==========================
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este insumo?")) return;
        await deleteDoc(doc(db, "inventario", btn.dataset.id));
        loadInventario();
      });
    });

  } catch (error) {
    console.error("Error cargando inventario:", error);
    list.innerHTML = "<li>Error al cargar inventario</li>";
  }
}

// ==========================
// LABELS
// ==========================
function labelEstado(estado) {
  if (estado === "hay") return "Hay";
  if (estado === "poco") return "Poco";
  return "Se acabó";
}
