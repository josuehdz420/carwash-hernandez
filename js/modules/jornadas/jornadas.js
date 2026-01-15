import { db } from "../../config/firebase.js";
import { getSessionUser } from "../../core/session.js";
import { loadDashboard } from "../dashboard/dashboard.js";

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// ==========================
// UTIL
// ==========================
function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

// ==========================
// OBTENER JORNADA ACTIVA (HOY)
// ==========================
export async function getActiveJornada() {
  const todayKey = getTodayKey();

  const q = query(
    collection(db, "jornadas"),
    where("date", "==", todayKey),
    where("activa", "==", true)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ==========================
// OBTENER JORNADA DEL DÍA (ACTIVA O NO)
// ==========================
export async function getTodayJornada() {
  const todayKey = getTodayKey();

  const q = query(
    collection(db, "jornadas"),
    where("date", "==", todayKey)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ==========================
// INICIAR JORNADA
// (solo si NO existe ninguna hoy)
// ==========================
export async function startJornada() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso para iniciar jornada");
    return;
  }

  const todayKey = getTodayKey();

  const existingSnap = await getDocs(
    query(collection(db, "jornadas"), where("date", "==", todayKey))
  );

  if (!existingSnap.empty) {
    alert("Ya existe una jornada para hoy. Usa reanudar.");
    return;
  }

  await addDoc(collection(db, "jornadas"), {
    date: todayKey,
    activa: true,
    inicio: serverTimestamp(),
    openedBy: user.name
  });

  loadDashboard();
}

// ==========================
// REANUDAR JORNADA
// (sin límite de veces)
// ==========================
export async function resumeJornada(jornadaId) {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso para reanudar jornada");
    return;
  }

  if (!jornadaId) {
    alert("Jornada inválida");
    return;
  }

  await updateDoc(doc(db, "jornadas", jornadaId), {
    activa: true,
    reopenedAt: serverTimestamp(),
    reopenedBy: user.name
  });

  loadDashboard();
}
