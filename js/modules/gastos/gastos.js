import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";
import { db } from "../../config/firebase.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// CARGAR GASTOS
// ==========================
export async function loadGastos() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso");
    return;
  }

  const today = new Date();
  const start = Timestamp.fromDate(
    new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const end = Timestamp.fromDate(
    new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
  );

  loadView(`
    <section class="module gastos-module">

      <header class="module-header">
        <button id="btn-volver" class="btn btn-back">Volver</button>
        <h2 class="module-title">Gastos del día</h2>
      </header>

      <main class="module-content">

        <form id="gasto-form" class="form-card">
          <input
            id="concepto"
            placeholder="Concepto *"
            required
          />

          <input
            id="monto"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Monto *"
            required
          />

          <input
            id="observacion"
            placeholder="Observación (opcional)"
          />

          <button type="submit" class="btn btn-primary">
            Guardar gasto
          </button>
        </form>

        <section class="list-section">
          <h3>Listado</h3>
          <ul id="gastos-list" class="simple-list"></ul>
        </section>

      </main>

    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);
  document
    .getElementById("gasto-form")
    .addEventListener("submit", e =>
      saveGasto(e, start, end)
    );

  loadGastosList(start, end);
}

// ==========================
// GUARDAR GASTO
// ==========================
async function saveGasto(e, start, end) {
  e.preventDefault();

  const user = getSessionUser();
  if (!user) return;

  const concepto = document.getElementById("concepto").value.trim();
  const monto = parseFloat(document.getElementById("monto").value);
  const observacion = document.getElementById("observacion").value.trim();

  if (!concepto || isNaN(monto) || monto <= 0) {
    alert("Datos inválidos");
    return;
  }

  await addDoc(collection(db, "gastos"), {
    concepto,
    monto,
    observacion,
    fecha: serverTimestamp(),
    reportedBy: user.name
  });

  e.target.reset();
  loadGastosList(start, end);
}

// ==========================
// LISTAR GASTOS DEL DÍA
// ==========================
async function loadGastosList(start, end) {
  const list = document.getElementById("gastos-list");
  list.innerHTML = "Cargando...";

  const q = query(
    collection(db, "gastos"),
    where("fecha", ">=", start),
    where("fecha", "<=", end),
    orderBy("fecha", "desc")
  );

  const snapshot = await getDocs(q);
  list.innerHTML = "";

  if (snapshot.empty) {
    list.innerHTML = "<li>No hay gastos registrados hoy</li>";
    return;
  }

  snapshot.forEach(docSnap => {
    const g = docSnap.data();
    const hora = g.fecha?.toDate().toLocaleTimeString() || "--";

    const li = document.createElement("li");
    li.className = "list-item";

    li.innerHTML = `
      <strong>${g.concepto}</strong>
      <span>$${g.monto.toFixed(2)}</span>
      <small>${hora}</small>
    `;

    list.appendChild(li);
  });
}
