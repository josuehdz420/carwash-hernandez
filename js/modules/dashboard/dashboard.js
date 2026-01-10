import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";

import { loadLavados } from "../lavados/lavados.js";
import { loadGastos } from "../gastos/gastos.js";
import { loadUsuarios } from "../usuarios/usuarios.js";
import { loadHistorial } from "../historial/historial.js";
import { loadClientes } from "../clientes/clientes.js";

import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  serverTimestamp
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

  const jornadaSnap = await getDocs(
    query(collection(db, "jornadas"), where("date", "==", todayKey))
  );

  if (!jornadaSnap.empty) {
    const d = jornadaSnap.docs[0];
    jornada = { id: d.id, ...d.data() };
    jornadaActiva = jornada.activa === true;
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

      const pendiente = l.price - (l.paidAmount || 0);
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
  // RENDER
  // ==========================
  loadView(`
    <section class="dashboard">

      <header class="dashboard-header">
        <h2>Hola, ${user.name}</h2>
        <p class="dashboard-date">
          ${today.toLocaleDateString()}
        </p>
      </header>

      <section class="jornada-panel">
        ${
          !jornada
            ? `<button id="btn-iniciar-jornada" class="btn btn-success">
                Iniciar jornada
              </button>`
            : jornadaActiva
              ? `
                <p class="jornada-status active">🟢 Jornada activa</p>
                <button id="btn-cerrar-jornada" class="btn btn-danger">
                  Cerrar jornada
                </button>
              `
              : `
                <p class="jornada-status closed">🔴 Jornada cerrada</p>
                <button id="btn-reanudar-jornada" class="btn btn-warning">
                  Reanudar jornada
                </button>
              `
        }
      </section>

      ${
        jornadaActiva
          ? `
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

        ${
          isAdmin
            ? `
          <section class="dashboard-chart">
            <h3>Ingresos últimos 7 días</h3>
            <canvas id="grafico-semanal"></canvas>
          </section>
        `
            : ""
        }
      `
          : `<p class="warning">No hay jornada activa</p>`
      }

      <section class="dashboard-actions">
        ${
          jornadaActiva
            ? `<button id="btn-lavado" class="btn btn-primary">
                Registrar lavado
              </button>`
            : ""
        }

        ${
          isAdmin
            ? `
          <button id="btn-historial" class="btn btn-secondary">Historial</button>
          <button id="btn-clientes" class="btn btn-secondary">Clientes</button>
          <button id="btn-gastos" class="btn btn-secondary">Gastos</button>
        `
            : ""
        }

        ${
          user.role === "super_admin"
            ? `<button id="btn-usuarios" class="btn btn-secondary">
                Usuarios
              </button>`
            : ""
        }
      </section>

    </section>
  `);

  // ==========================
  // NAVEGACIÓN
  // ==========================
  document.getElementById("btn-lavado")?.addEventListener("click", loadLavados);
  document.getElementById("btn-gastos")?.addEventListener("click", loadGastos);
  document.getElementById("btn-clientes")?.addEventListener("click", loadClientes);
  document.getElementById("btn-historial")?.addEventListener("click", loadHistorial);
  document.getElementById("btn-usuarios")?.addEventListener("click", loadUsuarios);

  // ==========================
  // JORNADA
  // ==========================
  document.getElementById("btn-iniciar-jornada")?.addEventListener("click", async () => {
    if (jornada) {
      alert("Ya existe una jornada para hoy");
      return;
    }

    if (!confirm("¿Iniciar jornada del día?")) return;

    await addDoc(collection(db, "jornadas"), {
      date: todayKey,
      activa: true,
      inicio: serverTimestamp(),
      openedBy: user.name
    });

    loadDashboard();
  });

  document.getElementById("btn-cerrar-jornada")?.addEventListener("click", async () => {
    if (!confirm("¿Cerrar jornada del día?")) return;

    await updateDoc(doc(db, "jornadas", jornada.id), {
      activa: false,
      cierre: serverTimestamp(),
      closedBy: user.name
    });

    loadDashboard();
  });

  document.getElementById("btn-reanudar-jornada")?.addEventListener("click", async () => {
    if (!confirm("¿Reanudar jornada?")) return;

    await updateDoc(doc(db, "jornadas", jornada.id), {
      activa: true,
      reopenedAt: serverTimestamp(),
      reopenedBy: user.name
    });

    loadDashboard();
  });

  // ==========================
  // GRÁFICO
  // ==========================
  if (isAdmin && jornadaActiva) {
    cargarGraficoSemanal();
  }
}

// ==========================
// GRÁFICO SEMANAL
// ==========================
async function cargarGraficoSemanal() {
  if (grafico) {
    grafico.destroy();
    grafico = null;
  }

  const labels = [];
  const data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    const start = Timestamp.fromDate(
      new Date(d.getFullYear(), d.getMonth(), d.getDate())
    );
    const end = Timestamp.fromDate(
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
    );

    let total = 0;

    const snap = await getDocs(
      query(
        collection(db, "pagos"),
        where("createdAt", ">=", start),
        where("createdAt", "<=", end)
      )
    );

    snap.forEach(p => {
      total += p.data().amount || 0;
    });

    labels.push(d.toLocaleDateString("es-ES", { weekday: "short" }));
    data.push(total);
  }

  grafico = new Chart(document.getElementById("grafico-semanal"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Ingresos",
          data,
          backgroundColor: "#4CAF50"
        }
      ]
    }
  });
}
