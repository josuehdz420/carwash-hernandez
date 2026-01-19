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
  orderBy,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// ESTADO
// ==========================
let editingClienteId = null;

// ==========================
// CARGAR MÓDULO
// ==========================
export async function loadClientes() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso");
    return;
  }

  loadView(`
    <section class="module clientes-module">

      <header class="module-header">
        <button id="btn-volver" class="btn btn-back">Volver</button>
        <h2 class="module-title">Clientes</h2>
      </header>

      <main class="module-content">

        <form id="cliente-form" class="form-card">
          <input id="nombre" placeholder="Nombre *" required />
          <input id="telefono" placeholder="Teléfono (opcional)" />
          <input id="nota" placeholder="Referencia (opcional)" />

          <button type="submit" id="submit-btn" class="btn btn-primary">
            Guardar cliente
          </button>
        </form>

        <section class="list-section">
          <h3>Listado de clientes</h3>

          <input
            id="search-clientes"
            placeholder="🔍 Buscar cliente..."
          />

          <div id="clientes-list"></div>
        </section>

      </main>

    </section>
  `);

  document.getElementById("btn-volver").addEventListener("click", loadDashboard);
  document
    .getElementById("cliente-form")
    .addEventListener("submit", saveCliente);

  document
    .getElementById("search-clientes")
    .addEventListener("input", loadClientesList);

  loadClientesList();
}

// ==========================
// GUARDAR / EDITAR CLIENTE
// ==========================
async function saveCliente(e) {
  e.preventDefault();

  const name = document.getElementById("nombre").value.trim();
  const phone = document.getElementById("telefono").value.trim();
  const note = document.getElementById("nota").value.trim();

  if (!name) {
    alert("Nombre obligatorio");
    return;
  }

  if (editingClienteId) {
    await updateDoc(doc(db, "clientes", editingClienteId), {
      name,
      phone,
      note
    });
  } else {
    await addDoc(collection(db, "clientes"), {
      name,
      phone,
      note,
      createdAt: serverTimestamp()
    });
  }

  editingClienteId = null;
  document.getElementById("submit-btn").textContent = "Guardar cliente";
  e.target.reset();
  loadClientesList();
}

// ==========================
// LISTADO + BUSCADOR
// ==========================
async function loadClientesList() {
  const container = document.getElementById("clientes-list");
  const filtro =
    document.getElementById("search-clientes").value.toLowerCase();

  container.innerHTML = "Cargando...";

  const q = query(collection(db, "clientes"), orderBy("name"));
  const snapshot = await getDocs(q);

  container.innerHTML = "";

  if (snapshot.empty) {
    container.innerHTML = "<p>No hay clientes registrados</p>";
    return;
  }

  for (const docSnap of snapshot.docs) {
    const c = docSnap.data();

    if (filtro && !c.name.toLowerCase().includes(filtro)) continue;

    const deuda = await calcularDeudaCliente(docSnap.id);

    const div = document.createElement("div");
    div.className = "cliente-item";

    div.innerHTML = `
      <div class="cliente-info">
        <strong>${c.name}</strong>
        <small>Tel: ${c.phone || "-"}</small>
        <small>Nota: ${c.note || "-"}</small>
        <small class="${deuda > 0 ? "deuda-activa" : ""}">
          Deuda: $${deuda.toFixed(2)}
        </small>
      </div>

      <div class="cliente-actions">
        <button class="btn-icon edit-btn" data-id="${docSnap.id}">✏️</button>
        ${
          deuda > 0
            ? `<button class="btn-icon pay-btn" data-id="${docSnap.id}">💰</button>`
            : ""
        }
        <button class="btn-icon delete-btn" data-id="${docSnap.id}">🗑</button>
      </div>
    `;

    container.appendChild(div);
  }

  bindClienteActions();
}

// ==========================
// ACCIONES
// ==========================
function bindClienteActions() {
  // EDITAR
  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const snap = await getDoc(doc(db, "clientes", btn.dataset.id));
      if (!snap.exists()) return;

      const c = snap.data();
      document.getElementById("nombre").value = c.name;
      document.getElementById("telefono").value = c.phone || "";
      document.getElementById("nota").value = c.note || "";

      editingClienteId = btn.dataset.id;
      document.getElementById("submit-btn").textContent =
        "Actualizar cliente";
    });
  });

  // REGISTRAR PAGO
  document.querySelectorAll(".pay-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const jornada = await getActiveJornada();
      if (!jornada) {
        alert("No hay jornada activa");
        return;
      }

      const clientId = btn.dataset.id;
      const clienteSnap = await getDoc(doc(db, "clientes", clientId));
      if (!clienteSnap.exists()) return;

      const deudaActual = await calcularDeudaCliente(clientId);

      const pago = parseFloat(
        prompt(`Deuda actual: $${deudaActual}\nMonto a pagar:`)
      );

      if (isNaN(pago) || pago <= 0 || pago > deudaActual) {
        alert("Monto inválido");
        return;
      }

      let restante = pago;

      const lavadosSnap = await getDocs(
        query(
          collection(db, "lavados"),
          where("clientId", "==", clientId),
          where("pagado", "==", false)
        )
      );

      const lavadosOrdenados = lavadosSnap.docs.sort(
        (a, b) =>
          a.data().createdAt?.seconds - b.data().createdAt?.seconds
      );

      for (const d of lavadosOrdenados) {
        if (restante <= 0) break;

        const l = d.data();
        const paid = l.paidAmount || 0;
        const price = l.price || 0;
        const pendiente = price - paid;
        const aplicar = Math.min(pendiente, restante);

        const nuevoPagado = paid + aplicar;

        await updateDoc(doc(db, "lavados", d.id), {
          paidAmount: nuevoPagado,
          pagado: nuevoPagado >= price,
          locked: nuevoPagado >= price
        });

        restante -= aplicar;
      }

      const user = getSessionUser();

      await addDoc(collection(db, "pagos"), {
        clientId,
        clientName: clienteSnap.data().name,
        amount: pago,
        origen: "cliente",
        jornadaId: jornada.id,
        createdAt: serverTimestamp(),
        reportedBy: user.name
      });

      loadClientesList();
    });
  });

  // ELIMINAR
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const deuda = await calcularDeudaCliente(btn.dataset.id);

      if (deuda > 0) {
        alert("No se puede eliminar un cliente con deuda");
        return;
      }

      if (!confirm("¿Eliminar cliente?")) return;

      await deleteDoc(doc(db, "clientes", btn.dataset.id));
      loadClientesList();
    });
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
