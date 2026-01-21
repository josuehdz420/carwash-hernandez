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
        <button id="btn-volver" class="btn btn-back">Volver</button>
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
          <h3>Jornadas cerradas</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Lavados</th>
                <th>Ingresos</th>
                <th>Gastos</th>
                <th>Balance</th>
                <th>Cuadre</th>
              </tr>
            </thead>
            <tbody id="tabla-jornadas"></tbody>
          </table>
        </section>

        <section class="table-section">
          <h3>Lavados</h3>
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
        </section>

        <section class="table-section">
          <h3>Pagos</h3>
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
        </section>

        <section class="table-section">
          <h3>Gastos</h3>
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
        </section>

        <section class="totals-card">
          <p><strong>Ingresos:</strong> $ <span id="total-ingresos">0.00</span></p>
          <p><strong>Gastos:</strong> $ <span id="total-gastos">0.00</span></p>
          <p class="balance">
            <strong>Balance:</strong> $ <span id="balance">0.00</span>
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
// BORRAR TODO
// ==========================
async function borrarTodoElHistorial() {
  if (!confirm("⚠️ Esto eliminará TODO el historial.\n\n¿Continuar?")) return;
  if (!confirm("⚠️ ÚLTIMA CONFIRMACIÓN.\n\n¿Eliminar definitivamente?")) return;

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

  await cargarJornadas(start, end);
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
// JORNADAS
// ==========================
async function cargarJornadas(start, end) {
  const tbody = document.getElementById("tabla-jornadas");
  tbody.innerHTML = "";

  const snap = await getDocs(
    query(collection(db, "jornadas"), where("activa", "==", false))
  );

  const filas = snap.docs
    .map(d => d.data())
    .filter(j => {
      if (!j.cierre || !j.resumen) return false;
      const cierre = j.cierre.toDate();
      return cierre >= start.toDate() && cierre <= end.toDate();
    })
    .sort((a, b) => b.cierre.toDate() - a.cierre.toDate());

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Sin jornadas cerradas</td></tr>`;
    return;
  }

  filas.forEach(j => {
    const cuadre =
      j.cuadre?.hizoCuadre
        ? j.cuadre.diferencia === 0
          ? "🟢 Cuadrado"
          : `🔴 Dif: $${j.cuadre.diferencia.toFixed(2)}`
        : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${j.date}</td>
      <td>${j.resumen.lavados}</td>
      <td>$${j.resumen.ingresos.toFixed(2)}</td>
      <td>$${j.resumen.gastos.toFixed(2)}</td>
      <td>$${j.resumen.balanceTeorico.toFixed(2)}</td>
      <td>${cuadre}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================
// LAVADOS
// ==========================
async function cargarLavados(start, end) {
  const tbody = document.getElementById("tabla-lavados");
  tbody.innerHTML = "";

  const snap = await getDocs(
    query(
      collection(db, "lavados"),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end)
    )
  );

  const docs = snap.docs.sort(
    (a, b) => b.data().createdAt.toDate() - a.data().createdAt.toDate()
  );

  if (docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Sin lavados</td></tr>`;
    return;
  }

  docs.forEach(d => {
    const l = d.data();
    const fecha = l.createdAt?.toDate().toLocaleString() || "-";

    const price = l.price || 0;
    const paid = l.paidAmount || 0;

    let estado = "Pendiente";
    if (price === 0) estado = "Gratis";
    else if (paid >= price) estado = "Pagado";
    else if (paid > 0) estado = "Parcial";

    const importe =
      price === 0
        ? `<span class="gratis">Gratis</span>`
        : `
          $${price.toFixed(2)}<br>
          <small>
            Pagado: $${paid.toFixed(2)}<br>
            Debe: $${(price - paid).toFixed(2)}
          </small>
        `;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fecha}</td>
      <td>${l.vehicleType}</td>
      <td>${l.clientName || "Anónimo"}</td>
      <td>${estado}</td>
      <td>${importe}</td>
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

  const snap = await getDocs(
    query(
      collection(db, "pagos"),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end)
    )
  );

  const docs = snap.docs.sort(
    (a, b) => b.data().createdAt.toDate() - a.data().createdAt.toDate()
  );

  if (docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Sin pagos</td></tr>`;
    totalSpan.textContent = "0.00";
    return 0;
  }

  docs.forEach(d => {
    const p = d.data();
    const monto = p.amount || 0;
    total += monto;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.createdAt.toDate().toLocaleString()}</td>
      <td>${p.clientName || "Anónimo"}</td>
      <td>${monto === 0 ? "Gratis" : `$${monto.toFixed(2)}`}</td>
      <td>${p.origen || "-"}</td>
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

  const snap = await getDocs(
    query(
      collection(db, "gastos"),
      where("fecha", ">=", start),
      where("fecha", "<=", end)
    )
  );

  const docs = snap.docs.sort(
    (a, b) => b.data().fecha.toDate() - a.data().fecha.toDate()
  );

  if (docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Sin gastos</td></tr>`;
    totalSpan.textContent = "0.00";
    return 0;
  }

  docs.forEach(d => {
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

