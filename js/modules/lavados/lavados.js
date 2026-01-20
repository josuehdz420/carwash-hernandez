import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";
import { getActiveJornada } from "../jornadas/jornadas.js";
import { db } from "../../config/firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// ESTADO
// ==========================
let editingLavadoId = null;

// ==========================
// CARGAR MÓDULO
// ==========================
export async function loadLavados() {
  const user = getSessionUser();
  if (!user) return;

  const jornada = await getActiveJornada();
  if (!jornada) {
    alert("No hay jornada activa");
    loadDashboard();
    return;
  }

  const clientesSnap = await getDocs(collection(db, "clientes"));
  let clientesOptions = `<option value="">Cliente anónimo</option>`;

  clientesSnap.forEach(d => {
    clientesOptions += `<option value="${d.id}">${d.data().name}</option>`;
  });

  loadView(`
    <section class="module lavados-module">

      <header class="module-header">
        <button id="btn-volver" class="btn btn-back">Volver</button>
        <h2 class="module-title">
          ${editingLavadoId ? "Editar lavado" : "Registrar lavado"}
        </h2>
      </header>

      <main class="module-content">
        <form id="lavadoForm" class="form-card">

          <select id="vehicleType" required>
            <option value="" disabled selected>Tipo de vehículo</option>
            <option>Carro</option>
            <option>Moto</option>
            <option>Camioneta</option>
            <option>Camión</option>
            <option>Tráiler</option>
            <option>Bicicleta</option>
            <option>Otro</option>
          </select>

          <textarea id="description" placeholder="Descripción (opcional)"></textarea>

          <input
            id="price"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Precio (0 = Gratis)"
          />

          <select id="cliente">${clientesOptions}</select>

          <label class="checkbox">
            <input type="checkbox" id="pendiente" />
            Pago pendiente
          </label>

          <button type="submit" class="btn btn-primary">
            ${editingLavadoId ? "Actualizar lavado" : "Guardar lavado"}
          </button>

        </form>

        <section class="list-section">
          <h3>Lavados del día</h3>
          <div id="lavados-list"></div>
        </section>
      </main>

    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);
  document.getElementById("lavadoForm").addEventListener("submit", saveLavado);

  loadLavadosDelDia();
}

// ==========================
// GUARDAR / EDITAR
// ==========================
async function saveLavado(e) {
  e.preventDefault();

  const user = getSessionUser();
  if (!user) return;

  const vehicleType = document.getElementById("vehicleType").value;
  const description = document.getElementById("description").value.trim();
  const price = parseFloat(document.getElementById("price").value);
  const clientId = document.getElementById("cliente").value || null;
  const pendiente = document.getElementById("pendiente").checked;

  if (!vehicleType || isNaN(price) || price < 0) {
    alert("Datos inválidos");
    return;
  }

  if (pendiente && !clientId) {
    alert("Un pago pendiente requiere un cliente");
    return;
  }

  let clientName = "Anónimo";
  if (clientId) {
    const snap = await getDoc(doc(db, "clientes", clientId));
    if (snap.exists()) clientName = snap.data().name;
  }

  const pagado = price === 0 ? false : !pendiente;
  const paidAmount = pagado ? price : 0;

  // ==========================
  // EDITAR
  // ==========================
  if (editingLavadoId) {
    const snap = await getDoc(doc(db, "lavados", editingLavadoId));
    if (!snap.exists()) return;

    const l = snap.data();

    if (l.pagoGenerado && pendiente) {
      alert("Este lavado ya fue pagado y no puede volver a pendiente");
      return;
    }

    await updateDoc(doc(db, "lavados", editingLavadoId), {
      vehicleType,
      description,
      price,
      clientId,
      clientName,
      pagado,
      paidAmount,
      pagoGenerado: pagado || l.pagoGenerado
    });

    if (pagado && !l.pagoGenerado && price > 0) {
      await addDoc(collection(db, "pagos"), {
        clientId,
        clientName,
        lavadoId: editingLavadoId,
        amount: price,
        origen: "lavado",
        anonimo: !clientId,
        createdAt: serverTimestamp(),
        reportedBy: user.name
      });
    }

    editingLavadoId = null;
  }

  // ==========================
  // NUEVO
  // ==========================
  else {
    const ref = await addDoc(collection(db, "lavados"), {
      vehicleType,
      description,
      price,
      clientId,
      clientName,
      paidAmount,
      pagado,
      pagoGenerado: pagado,
      createdAt: serverTimestamp(),
      reportedBy: user.name
    });

    if (pagado && price > 0) {
      await addDoc(collection(db, "pagos"), {
        clientId,
        clientName,
        lavadoId: ref.id,
        amount: price,
        origen: "lavado",
        anonimo: !clientId,
        createdAt: serverTimestamp(),
        reportedBy: user.name
      });
    }
  }

  e.target.reset();
  loadLavados();
}

// ==========================
// LISTADO DEL DÍA
// ==========================
async function loadLavadosDelDia() {
  const container = document.getElementById("lavados-list");
  const user = getSessionUser();

  const today = new Date();
  const start = Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const end = Timestamp.fromDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59));

  const q = query(
    collection(db, "lavados"),
    where("createdAt", ">=", start),
    where("createdAt", "<=", end),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);
  container.innerHTML = "";

  if (snap.empty) {
    container.innerHTML = "<p>No hay lavados hoy</p>";
    return;
  }

  snap.forEach(d => {
    const l = d.data();
    const hora = l.createdAt?.toDate().toLocaleTimeString() || "--";

    const pendienteMonto = l.price - (l.paidAmount || 0);
    const tieneDeuda = pendienteMonto > 0;

    const textoPrecio =
      l.price === 0
        ? `<span class="gratis">Gratis</span>`
        : `
          Precio: $${l.price.toFixed(2)} |
          Pagado: $${(l.paidAmount || 0).toFixed(2)} |
          Pendiente: $${pendienteMonto.toFixed(2)}
        `;

    const puedeEditar = !l.pagoGenerado;
    const puedeEliminar = !tieneDeuda;

    const div = document.createElement("div");
    div.className = "lavado-item";

    div.innerHTML = `
      <div class="lavado-info">
        <strong>${l.vehicleType}</strong> — ${l.clientName}
        ${l.description ? `<small>${l.description}</small>` : ""}
        <small>${hora}</small>
        <small>${textoPrecio}</small>
      </div>

      ${
        user.role !== "gestor"
          ? `
        <div class="lavado-actions">
          <button class="btn-icon edit" data-id="${d.id}" ${!puedeEditar ? "disabled" : ""}>✏️</button>
          ${
            puedeEliminar
              ? `<button class="btn-icon delete" data-id="${d.id}">🗑</button>`
              : ""
          }
        </div>`
          : ""
      }
    `;

    container.appendChild(div);
  });

  bindLavadoActions();
}

// ==========================
// ACCIONES
// ==========================
function bindLavadoActions() {
  document.querySelectorAll(".edit").forEach(btn => {
    btn.addEventListener("click", async () => {
      const snap = await getDoc(doc(db, "lavados", btn.dataset.id));
      if (!snap.exists()) return;

      const l = snap.data();
      editingLavadoId = btn.dataset.id;

      document.getElementById("vehicleType").value = l.vehicleType;
      document.getElementById("description").value = l.description || "";
      document.getElementById("price").value = l.price;
      document.getElementById("cliente").value = l.clientId || "";

      const chk = document.getElementById("pendiente");
      chk.checked = !l.pagado;
      chk.disabled = l.pagoGenerado === true;
    });
  });

  document.querySelectorAll(".delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const snap = await getDoc(doc(db, "lavados", btn.dataset.id));
      if (!snap.exists()) return;

      const l = snap.data();
      const pendiente = l.price - (l.paidAmount || 0);

      if (pendiente > 0) {
        alert("No se puede eliminar un lavado con pago pendiente");
        return;
      }

      if (!confirm("¿Eliminar lavado?")) return;

      const pagosSnap = await getDocs(
        query(collection(db, "pagos"), where("lavadoId", "==", btn.dataset.id))
      );

      for (const p of pagosSnap.docs) {
        await deleteDoc(doc(db, "pagos", p.id));
      }

      await deleteDoc(doc(db, "lavados", btn.dataset.id));
      loadLavados();
    });
  });
}
