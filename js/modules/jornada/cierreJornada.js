import { loadView } from "../../core/router.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";
import { db } from "../../config/firebase.js";

import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// CIERRE DE JORNADA
// ==========================
export async function loadCierreJornada(jornadaId, dateKey) {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso para cerrar jornada");
    return;
  }

  if (!jornadaId || !dateKey) {
    alert("Jornada inválida");
    loadDashboard();
    return;
  }

  const date = new Date(dateKey);

  const start = Timestamp.fromDate(
    new Date(date.getFullYear(), date.getMonth(), date.getDate())
  );

  const end = Timestamp.fromDate(
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
  );

  let lavados = 0;
  let pendientes = 0;
  let ingresos = 0;
  let gastos = 0;

  // ==========================
  // LAVADOS
  // ==========================
  const lavadosSnap = await getDocs(
    query(
      collection(db, "lavados"),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end)
    )
  );

  lavadosSnap.forEach(d => {
    lavados++;
    if (d.data().pagado === false) pendientes++;
  });

  // ==========================
  // PAGOS
  // ==========================
  const pagosSnap = await getDocs(
    query(
      collection(db, "pagos"),
      where("createdAt", ">=", start),
      where("createdAt", "<=", end)
    )
  );

  pagosSnap.forEach(d => {
    ingresos += d.data().amount || 0;
  });

  // ==========================
  // GASTOS
  // ==========================
  const gastosSnap = await getDocs(
    query(
      collection(db, "gastos"),
      where("fecha", ">=", start),
      where("fecha", "<=", end)
    )
  );

  gastosSnap.forEach(d => {
    gastos += d.data().monto || 0;
  });

  const balance = ingresos - gastos;

  loadView(`
    <section class="cierre-jornada">
      <button id="btn-volver">⬅ Volver</button>

      <h2>Cierre de jornada</h2>
      <p>${date.toLocaleDateString()}</p>

      <div class="resumen-card">
        <p><strong>Lavados realizados:</strong> ${lavados}</p>
        <p><strong>Ingresos:</strong> $${ingresos.toFixed(2)}</p>
        <p><strong>Lavados pendientes:</strong> ${pendientes}</p>
        <p><strong>Gastos:</strong> $${gastos.toFixed(2)}</p>
        <hr />
        <p><strong>Balance final:</strong> $${balance.toFixed(2)}</p>
      </div>

      ${
        pendientes > 0
          ? `<p class="warning">⚠️ Existen lavados pendientes de pago</p>`
          : ""
      }

      <button id="btn-confirmar" class="danger">
        Confirmar cierre de jornada
      </button>
    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);

  document.getElementById("btn-confirmar").addEventListener("click", async () => {
    let mensaje =
      "¿Deseas cerrar la jornada?\n\nEsta acción no se puede deshacer.";

    if (pendientes > 0) {
      mensaje =
        "⚠️ Existen lavados pendientes.\n\n" +
        "¿Deseas cerrar la jornada de todos modos?\n\n" +
        "Esta acción no se puede deshacer.";
    }

    if (!confirm(mensaje)) return;

    await updateDoc(doc(db, "jornadas", jornadaId), {
      activa: false,
      cierre: Timestamp.now(),
      resumen: {
        lavados,
        ingresos,
        pendientes,
        gastos,
        balance
      }
    });

    alert("Jornada cerrada correctamente");
    loadDashboard();
  });
}
