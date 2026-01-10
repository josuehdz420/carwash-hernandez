// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJ1Jmh8IpoVJBp2tPSV-hMR2WaHwCKTPU",
  authDomain: "carwash-hernandez.firebaseapp.com",
  projectId: "carwash-hernandez",
  storageBucket: "carwash-hernandez.firebasestorage.app",
  messagingSenderId: "474701713964",
  appId: "1:474701713964:web:69f056dd93c72d4e95b789"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };