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
// OBTENER JORNADA ACTIVA
// ==========================
export async function getActiveJornada() {
  const todayKey = new Date().toISOString().split("T")[0];

  const q = query(
    collection(db, "jornadas"),
    where("date", "==", todayKey),
    where("activa", "==", true)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

// ==========================
// OBTENER JORNADA DEL DÍA
// ==========================
export async function getTodayJornada() {
  const todayKey = new Date().toISOString().split("T")[0];

  const q = query(
    collection(db, "jornadas"),
    where("date", "==", todayKey)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
}

// ==========================
// INICIAR JORNADA
// ==========================
export async function startJornada() {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso para iniciar jornada");
    return;
  }

  const active = await getActiveJornada();
  if (active) {
    alert("Ya hay una jornada activa hoy");
    return;
  }

  const todayKey = new Date().toISOString().split("T")[0];

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
// ==========================
export async function resumeJornada(jornadaId) {
  const user = getSessionUser();
  if (!user) return;

  if (user.role !== "admin" && user.role !== "super_admin") {
    alert("No tienes permiso");
    return;
  }

  await updateDoc(doc(db, "jornadas", jornadaId), {
    activa: true
  });

  loadDashboard();
}
