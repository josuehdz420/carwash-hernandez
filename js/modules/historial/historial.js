import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";
import { db } from "../../config/firebase.js";

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  orderBy,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// CARGAR HISTORIAL
// ==========================
export async function loadHistorial() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role === "gestor") {
    alert("No tienes permiso para ver el historial");
    return;
  }

  const isSuperAdmin = user.role === "super_admin";

  loadView(`
    <section class="module historial-module">

      <header class="module-header">
        <button id="btn-volver" class="btn btn-back">⬅ Volver</button>

        <h2 class="module-title">Historial</h2>

        <select id="filtro-historial" class="select-filter">
          <option value="day">Hoy</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
        </select>
      </header>

      ${
        isSuperAdmin
          ? `
        <section class="danger-zone">
          <button id="btn-borrar-historial" class="btn btn-danger">
            🗑 Eliminar TODO el historial
          </button>
          <p class="warning-text">
            Esta acción elimina lavados, pagos, gastos y jornadas.<br />
            No se puede deshacer.
          </p>
        </section>
      `
          : ""
      }

      <main class="module-content">

        <section class="table-section">
          <h3>Lavados</h3>
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vehículo</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Importe</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody id="tabla-lavados"></tbody>
            </table>
          </div>
        </section>

        <section class="table-section">
          <h3>Pagos (Ingresos reales)</h3>
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody id="tabla-pagos"></tbody>
            </table>
          </div>
        </section>

        <section class="table-section">
          <h3>Gastos</h3>
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody id="tabla-gastos"></tbody>
            </table>
          </div>
        </section>

        <section class="totals-card">
          <p>
            <strong>Ingresos:</strong>
            $ <span id="total-ingresos">0.00</span>
          </p>
          <p>
            <strong>Gastos:</strong>
            $ <span id="total-gastos">0.00</span>
          </p>
          <p class="balance">
            <strong>Balance:</strong>
            $ <span id="balance">0.00</span>
          </p>
        </section>

      </main>

    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);

  const filtro = document.getElementById("filtro-historial");
  filtro.addEventListener("change", () => cargarHistorial(filtro.value));

  if (isSuperAdmin) {
    document
      .getElementById("btn-borrar-historial")
      .addEventListener("click", borrarTodoElHistorial);
  }

  cargarHistorial("day");
}

// ==========================
// BORRAR TODO EL HISTORIAL
// ==========================
async function borrarTodoElHistorial() {
  if (
    !confirm(
      "⚠️ ATENCIÓN\n\nEsto eliminará TODO el historial.\n\n¿Deseas continuar?"
    )
  ) return;

  if (
    !confirm(
      "⚠️ ÚLTIMA CONFIRMACIÓN\n\nEsta acción NO se puede deshacer.\n\n¿Eliminar definitivamente?"
    )
  ) return;

  const colecciones = ["lavados", "pagos", "gastos", "jornadas"];

  for (const col of colecciones) {
    const snap = await getDocs(collection(db, col));
    for (const d of snap.docs) {
      await deleteDoc(doc(db, col, d.id));
    }
  }

  alert("Historial eliminado correctamente");
  loadDashboard();
}

// ==========================
// CARGAR HISTORIAL
// ==========================
async function cargarHistorial(tipo) {
  document.getElementById("balance").textContent = "0.00";

  const { start, end } = obtenerRangoFechas(tipo);

  const ingresos = await cargarPagos(start, end);
  const gastos = await cargarGastos(start, end);
  await cargarLavados(start, end);

  document.getElementById("balance").textContent =
    (ingresos - gastos).toFixed(2);
}

// ==========================
// RANGO FECHAS
// ==========================
function obtenerRangoFechas(tipo) {
  const now = new Date();
  let start, end;

  if (tipo === "day") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }

  if (tipo === "week") {
    const day = now.getDay() || 7;
    start = new Date(now);
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);

    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59);
  }

  if (tipo === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end)
  };
}

// ==========================
// LAVADOS
// ==========================
async function cargarLavados(start, end) {
  const tbody = document.getElementById("tabla-lavados");
  tbody.innerHTML = "";

  const q = query(
    collection(db, "lavados"),
    where("createdAt", ">=", start),
    where("createdAt", "<=", end),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="6">Sin lavados</td></tr>`;
    return;
  }

  snap.forEach(d => {
    const l = d.data();
    const fecha = l.createdAt?.toDate().toLocaleString() || "-";

    const paid = l.paidAmount || 0;
    const price = l.price || 0;

    let estado = "Pendiente";
    if (paid >= price) estado = "Pagado";
    else if (paid > 0) estado = "Parcial";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fecha}</td>
      <td>${l.vehicleType}</td>
      <td>${l.clientName || "Anónimo"}</td>
      <td>${estado}</td>
      <td>
        $${price.toFixed(2)}<br>
        <small>
          Pagado: $${paid.toFixed(2)}<br>
          Debe: $${(price - paid).toFixed(2)}
        </small>
      </td>
      <td>${l.reportedBy || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================
// PAGOS
// ==========================
async function cargarPagos(start, end) {
  const tbody = document.getElementById("tabla-pagos");
  const totalSpan = document.getElementById("total-ingresos");
  tbody.innerHTML = "";

  let total = 0;

  const q = query(
    collection(db, "pagos"),
    where("createdAt", ">=", start),
    where("createdAt", "<=", end),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="4">Sin pagos</td></tr>`;
    totalSpan.textContent = "0.00";
    return 0;
  }

  snap.forEach(d => {
    const p = d.data();
    total += p.amount || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.createdAt.toDate().toLocaleString()}</td>
      <td>${p.clientName || "Anónimo"}</td>
      <td>$${p.amount.toFixed(2)}</td>
      <td>${p.origen === "lavado" ? "Lavado" : p.origen}</td>
    `;
    tbody.appendChild(tr);
  });

  totalSpan.textContent = total.toFixed(2);
  return total;
}

// ==========================
// GASTOS
// ==========================
async function cargarGastos(start, end) {
  const tbody = document.getElementById("tabla-gastos");
  const totalSpan = document.getElementById("total-gastos");
  tbody.innerHTML = "";

  let total = 0;

  const q = query(
    collection(db, "gastos"),
    where("fecha", ">=", start),
    where("fecha", "<=", end),
    orderBy("fecha", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="4">Sin gastos</td></tr>`;
    totalSpan.textContent = "0.00";
    return 0;
  }

  snap.forEach(d => {
    const g = d.data();
    total += g.monto || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${g.fecha.toDate().toLocaleString()}</td>
      <td>${g.concepto}</td>
      <td>$${g.monto.toFixed(2)}</td>
      <td>${g.reportedBy || "-"}</td>
    `;
    tbody.appendChild(tr);
  });

  totalSpan.textContent = total.toFixed(2);
  return total;
}
