// login.js (paste this file and include <script type="module" src="login.js"></script>)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// === Firebase config (your values) ===
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.firebaseapp.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:b1e7e681e2e1d5990d7ff2",
  measurementId: "G-YRJHW8Z976"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics ? getAnalytics(app) : null; // safe guard if analytics blocked
const auth = getAuth(app);

// Debugging logs
console.log("Firebase App initialized:", !!app);
console.log("Firebase Auth loaded:", !!auth);

// --- DOM elements (safe guards)
const loginButton = document.getElementById("loginBtn");
const emailField = document.getElementById("email");
const passwordField = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

// Helper to show errors
function showError(text) {
  if (errorMsg) {
    errorMsg.textContent = text;
    errorMsg.style.display = "block";
  } else {
    console.error("Error element not found:", text);
  }
}

// Login handler
if (loginButton) {
  loginButton.addEventListener("click", async () => {
    const email = emailField ? emailField.value.trim() : "";
    const password = passwordField ? passwordField.value.trim() : "";

    if (!email || !password) {
      showError("Please enter both email and password.");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("User signed in:", userCredential.user.uid);
      // Redirect to home
      window.location.href = "Home Page.html";
    } catch (err) {
      // show friendly message
      showError(err.message || "Login failed. Check console for details.");
      console.error("signIn error:", err);
    }
  });
} else {
  console.warn("loginBtn element not found on page.");
}

// Auto-redirect if already logged in
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("User is already logged in:", user.uid);
    // If you don't want to auto-redirect during development, comment the next line
    window.location.href = "Home Page.html";
  } else {
    console.log("No user signed in.");
  }
});
