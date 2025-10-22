// =============================
// ✅ SIGNUP.JS — Firebase Signup with Firestore
// =============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// =============================
// 🔹 Firebase Configuration
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7"
};

// =============================
// 🔹 Initialize Firebase
// =============================
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// =============================
// 🔹 DOM Elements
// =============================
const signupBtn = document.getElementById("signupBtn");
const nameField = document.getElementById("name");
const emailField = document.getElementById("email");
const passwordField = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.style.display = "block";
}

// =============================
// 🔹 Signup Handler
// =============================
signupBtn?.addEventListener("click", async (e) => {
  e.preventDefault(); // prevent form reload

  const name = nameField.value.trim();
  const email = emailField.value.trim();
  const password = passwordField.value.trim();

  if (!name || !email || !password) {
    showError("Please fill in all fields.");
    return;
  }

  try {
    // 🔹 Create User in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("✅ Account created:", user.email);

    // 🔹 Save user info to Firestore
    await setDoc(doc(db, "users", user.uid), {
      name: name,
      email: user.email,
      createdAt: new Date().toISOString(),
    });

    alert("✅ Account created successfully!");
    
    // 🔹 Redirect to Home Page
    window.location.replace("Login.html"); 
    // ✅ replace() prevents user from going back to signup page with back button

  } catch (err) {
    console.error("Signup failed:", err);
    showError(err.message);
  }
});
