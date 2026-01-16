// ==========================
// FIREBASE + AUTH
// ==========================
import "./config/firebase.js";
import "./core/auth.js";

// ==========================
// BACKGROUND ALEATORIO GLOBAL
// ==========================
const backgrounds = [
  "assets/img/bg-1.jpeg",
  "assets/img/bg-2.jpeg",
  "assets/img/bg-3.jpeg",
  "assets/img/bg-4.jpeg",
  "assets/img/bg-5.jpeg"
];

const randomBg =
  backgrounds[Math.floor(Math.random() * backgrounds.length)];

document.body.style.backgroundImage = `
  linear-gradient(
    rgba(18, 10, 40, 0.68),
    rgba(18, 10, 40, 0.68)
  ),
  url("${randomBg}")
`;

document.body.style.backgroundSize = "cover";
document.body.style.backgroundPosition = "center";
document.body.style.backgroundRepeat = "no-repeat";
document.body.style.minHeight = "100vh";

// ==========================
// REFERENCIAS PRINCIPALES
// ==========================
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");

// ==========================
// ESTADO INICIAL
// ==========================
if (loginScreen && appScreen) {
  loginScreen.style.display = "flex";
  appScreen.style.display = "none";
}

// ==========================
// DEBUG
// ==========================
console.log("Carwash Hernández iniciado correctamente");
