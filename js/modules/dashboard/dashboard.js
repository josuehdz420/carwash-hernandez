import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";

import { loadLavados } from "../lavados/lavados.js";
import { loadGastos } from "../gastos/gastos.js";
import { loadUsuarios } from "../usuarios/usuarios.js";
import { loadHistorial } from "../historial/historial.js";
import { loadClientes } from "../clientes/clientes.js";
import { loadCierreJornada } from "../jornadas/cierreJornada.js";

import {
  collection,
  getDocs,
  query,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { db } from "../../config/firebase.js";

let grafico = null;

// ==========================
// DASHBOARD
// ==========================
export async function loadDashboard() {
  const user = getSessionUser();
  if (!user) return;

  const isAdmin = user.role === "admin" || user.role === "super_admin";

  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];

  // ==========================
  // JORNADA DEL DÍA
  // ==========================
  let jornada = null;
  let jornadaActiva = false;
  let resumen = null;
  let cuadre = null;

  const jornadaSnap = await getDocs(
    query(collection(db, "jornadas"), where("date", "==", todayKey))
  );

  if (!jornadaSnap.empty) {
    const d = jornadaSnap.docs[0];
    jornada = { id: d.id, ...d.data() };
    jornadaActiva = jornada.activa === true;
    resumen = jornada.resumen || null;
    cuadre = jornada.cuadre || null;
  }

  // ==========================
  // NORMALIZAR RESUMEN / CUADRE
  // ==========================
  if (resumen) {
    resumen.lavados = Number(resumen.lavados) || 0;
    resumen.ingresos = Number(resumen.ingresos) || 0;
    resumen.gastos = Number(resumen.gastos) || 0;
    resumen.balance = Number(resumen.balance) || 0;
  }

  if (cuadre) {
    cuadre.efectivoReal = Number(cuadre.efectivoReal) || 0;
    cuadre.diferencia = Number(cuadre.diferencia) || 0;
  }

  // ==========================
  // STATS DEL DÍA
  // ==========================
  let lavadosHoy = 0;
  let ingresosHoy = 0;
  let pendientes = 0;
  const clientesConDeuda = new Set();

  if (jornadaActiva) {
    const start = Timestamp.fromDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate())
    );
    const end = Timestamp.fromDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
    );

    const lavadosSnap = await getDocs(
      query(
        collection(db, "lavados"),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end)
      )
    );

    lavadosSnap.forEach(d => {
      const l = d.data();
      lavadosHoy++;

      const pendiente = (l.price || 0) - (l.paidAmount || 0);
      if (pendiente > 0) {
        pendientes++;
        if (l.clientId) clientesConDeuda.add(l.clientId);
      }
    });

    if (isAdmin) {
      const pagosSnap = await getDocs(
        query(
          collection(db, "pagos"),
          where("createdAt", ">=", start),
          where("createdAt", "<=", end)
        )
      );

      pagosSnap.forEach(p => {
        ingresosHoy += p.data().amount || 0;
      });
    }
  }

  // ==========================
  // BLOQUES HTML
  // ==========================
  let htmlJornada = "";
  let htmlStats = "";
  let htmlChart = "";
  let htmlActions = "";

  // ---- Jornada
  if (!jornada) {
    htmlJornada = `<button id="btn-iniciar-jornada" class="btn btn-success">Iniciar jornada</button>`;
  } else if (jornadaActiva) {
    htmlJornada = `
      <p class="jornada-status active">🟢 Jornada activa</p>
      <button id="btn-cerrar-jornada" class="btn btn-danger">Cerrar jornada</button>
    `;
  } else {
    htmlJornada = `
      <p class="jornada-status closed">🔴 Jornada cerrada</p>
      <button id="btn-reanudar-jornada" class="btn btn-warning">Reanudar jornada</button>
    `;
  }

  // ---- Stats
  if (jornadaActiva) {
    htmlStats = `
      <section class="dashboard-stats">
        <div class="stat-card">
          <h3>Lavados hoy</h3>
          <p>${lavadosHoy}</p>
        </div>

        ${
          isAdmin
            ? `
              <div class="stat-card">
                <h3>Ingresos hoy</h3>
                <p>$${ingresosHoy.toFixed(2)}</p>
              </div>
              <div class="stat-card">
                <h3>Lavados pendientes</h3>
                <p>${pendientes}</p>
              </div>
              <div class="stat-card">
                <h3>Clientes con deuda</h3>
                <p>${clientesConDeuda.size}</p>
              </div>
            `
            : ""
        }
      </section>
    `;

    if (isAdmin) {
      htmlChart = `
        <section class="dashboard-chart">
          <h3>Ingresos últimos 7 días</h3>
          <canvas id="grafico-semanal"></canvas>
        </section>
      `;
    }
  } else if (resumen) {
    htmlStats = `
      <section class="dashboard-stats">
        <div class="stat-card"><h3>Lavados</h3><p>${resumen.lavados}</p></div>
        <div class="stat-card"><h3>Ingresos</h3><p>$${resumen.ingresos.toFixed(2)}</p></div>
        <div class="stat-card"><h3>Gastos</h3><p>$${resumen.gastos.toFixed(2)}</p></div>
        <div class="stat-card"><h3>Balance</h3><p>$${resumen.balance.toFixed(2)}</p></div>
      </section>
    `;

    if (cuadre && cuadre.hizoCuadre) {
      htmlStats += `
        <section class="dashboard-stats">
          <div class="stat-card ${cuadre.diferencia === 0 ? "ok" : "error"}">
            <h3>Cuadre</h3>
            <p>${cuadre.diferencia === 0 ? "🟢 Cuadrado" : "🔴 Diferencia"}</p>
          </div>
          <div class="stat-card">
            <h3>Efectivo real</h3>
            <p>$${cuadre.efectivoReal.toFixed(2)}</p>
          </div>
          <div class="stat-card">
            <h3>Diferencia</h3>
            <p>$${cuadre.diferencia.toFixed(2)}</p>
          </div>
        </section>
      `;
    }
  } else {
    htmlStats = `<p class="warning">No hay jornada activa</p>`;
  }

  // ---- Acciones
  if (jornadaActiva) {
    htmlActions += `<button id="btn-lavado" class="btn btn-primary">Registrar lavado</button>`;
  }

  if (isAdmin) {
    htmlActions += `
      <button id="btn-historial" class="btn btn-secondary">Historial</button>
      <button id="btn-clientes" class="btn btn-secondary">Clientes</button>
      <button id="btn-gastos" class="btn btn-secondary">Gastos</button>
    `;
  }

  if (user.role === "super_admin") {
    htmlActions += `<button id="btn-usuarios" class="btn btn-secondary">Usuarios</button>`;
  }

  // ==========================
  // RENDER
  // ==========================
  loadView(`
    <section class="dashboard">
      <header class="dashboard-header">
        <h2>Hola, ${user.name}</h2>
        <p>${today.toLocaleDateString()}</p>
      </header>

      <section class="jornada-panel">${htmlJornada}</section>
      ${htmlStats}
      ${htmlChart}

      <section class="dashboard-actions">${htmlActions}</section>
    </section>
  `);

  // ==========================
  // EVENTOS
  // ==========================
  document.getElementById("btn-lavado")?.addEventListener("click", loadLavados);
  document.getElementById("btn-gastos")?.addEventListener("click", loadGastos);
  document.getElementById("btn-clientes")?.addEventListener("click", loadClientes);
  document.getElementById("btn-historial")?.addEventListener("click", loadHistorial);
  document.getElementById("btn-usuarios")?.addEventListener("click", loadUsuarios);

  document.getElementById("btn-iniciar-jornada")?.addEventListener("click", async () => {
    const { startJornada } = await import("../jornadas/jornadas.js");
    startJornada();
  });

  document.getElementById("btn-reanudar-jornada")?.addEventListener("click", async () => {
    const { resumeJornada } = await import("../jornadas/jornadas.js");
    resumeJornada(jornada.id);
  });

  document.getElementById("btn-cerrar-jornada")?.addEventListener("click", () => {
    loadCierreJornada(jornada.id, todayKey);
  });

  if (isAdmin && jornadaActiva && document.getElementById("grafico-semanal")) {
    cargarGraficoSemanal();
  }
}

// ==========================
// GRÁFICO SEMANAL
// ==========================
async function cargarGraficoSemanal() {
  if (grafico) grafico.destroy();

  const labels = [];
  const data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    const start = Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    const end = Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59));

    let total = 0;
    const snap = await getDocs(
      query(
        collection(db, "pagos"),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end)
      )
    );

    snap.forEach(p => total += p.data().amount || 0);

    labels.push(d.toLocaleDateString("es-ES", { weekday: "short" }));
    data.push(Number(total) || 0);
  }

  grafico = new Chart(document.getElementById("grafico-semanal"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Ingresos", data, backgroundColor: "#4CAF50" }]
    }
  });
}
