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
  doc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// CARGAR MÓDULO
// ==========================
export async function loadPagos() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso para registrar pagos");
    loadDashboard();
    return;
  }

  const clientesSnap = await getDocs(collection(db, "clientes"));
  let clientesOptions = `<option value="">Todos los clientes</option>`;

  clientesSnap.forEach(docSnap => {
    clientesOptions += `<option value="${docSnap.id}">${docSnap.data().name}</option>`;
  });

  loadView(`
    <section class="pagos">
      <button id="btn-volver">⬅ Volver</button>
      <h2>Pagos</h2>

      <form id="pago-form" class="form-card">
        <select id="cliente" required>
          <option value="" disabled selected>Cliente</option>
          ${clientesOptions}
        </select>

        <input
          id="amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Monto pagado"
          required
        />

        <button type="submit">Registrar pago</button>
      </form>

      <h3>Historial de pagos</h3>

      <select id="filter-cliente">${clientesOptions}</select>

      <div id="pagos-list"></div>
    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);
  document.getElementById("pago-form").addEventListener("submit", savePago);
  document.getElementById("filter-cliente").addEventListener("change", loadPagosList);

  loadPagosList();
}

// ==========================
// REGISTRAR PAGO (FIFO REAL)
// ==========================
async function savePago(e) {
  e.preventDefault();

  const jornada = await getActiveJornada();
  if (!jornada) {
    alert("No hay jornada activa");
    return;
  }

  const user = getSessionUser();
  if (!user) return;

  const clienteId = document.getElementById("cliente").value;
  const amount = parseFloat(document.getElementById("amount").value);

  if (!clienteId || isNaN(amount) || amount <= 0) {
    alert("Datos inválidos");
    return;
  }

  const clienteSnap = await getDoc(doc(db, "clientes", clienteId));
  if (!clienteSnap.exists()) {
    alert("Cliente no válido");
    return;
  }

  const clientName = clienteSnap.data().name;
  let restante = amount;

  // ==========================
  // APLICAR A LAVADOS (FIFO + PARCIAL)
  // ==========================
  const lavadosSnap = await getDocs(
    query(
      collection(db, "lavados"),
      where("clientId", "==", clienteId),
      where("pagado", "==", false),
      orderBy("createdAt", "asc")
    )
  );

  for (const docSnap of lavadosSnap.docs) {
    if (restante <= 0) break;

    const l = docSnap.data();
    const price = l.price || 0;
    const paid = l.paidAmount || 0;
    const pendiente = price - paid;

    const aplicar = Math.min(pendiente, restante);

    const nuevoPagado = paid + aplicar;
    const totalmentePagado = nuevoPagado >= price;

    await updateDoc(doc(db, "lavados", docSnap.id), {
      paidAmount: nuevoPagado,
      pagado: totalmentePagado,
      locked: totalmentePagado
    });

    restante -= aplicar;
  }

  // ==========================
  // REGISTRAR PAGO REAL
  // ==========================
  await addDoc(collection(db, "pagos"), {
    clientId: clienteId,
    clientName,
    amount,
    origen: "cliente",
    lavadoId: null,
    jornadaId: jornada.id,
    createdAt: serverTimestamp(),
    reportedBy: user.name
  });

  e.target.reset();
  loadPagosList();
}

// ==========================
// LISTAR PAGOS
// ==========================
async function loadPagosList() {
  const container = document.getElementById("pagos-list");
  const filterCliente = document.getElementById("filter-cliente").value;

  container.innerHTML = "Cargando...";

  const q = filterCliente
    ? query(
        collection(db, "pagos"),
        where("clientId", "==", filterCliente),
        orderBy("createdAt", "desc")
      )
    : query(collection(db, "pagos"), orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);
  container.innerHTML = "";

  if (snapshot.empty) {
    container.innerHTML = "<p>No hay pagos registrados</p>";
    return;
  }

  snapshot.forEach(docSnap => {
    const p = docSnap.data();
    const fecha = p.createdAt?.toDate().toLocaleString() || "--";

    const div = document.createElement("div");
    div.className = "pago-item";

    div.innerHTML = `
      <div>
        <strong>${p.clientName}</strong>
        <small>${fecha}</small>
        <small>Origen: ${p.origen}</small>
      </div>
      <div>$${p.amount.toFixed(2)}</div>
    `;

    container.appendChild(div);
  });
}

// ==========================
// CALCULAR DEUDA REAL
// ==========================
async function calcularDeudaCliente(clientId) {
  let total = 0;

  const lavadosSnap = await getDocs(
    query(
      collection(db, "lavados"),
      where("clientId", "==", clientId),
      where("pagado", "==", false)
    )
  );

  lavadosSnap.forEach(d => {
    const l = d.data();
    total += (l.price || 0) - (l.paidAmount || 0);
  });

  return total > 0 ? total : 0;
}
