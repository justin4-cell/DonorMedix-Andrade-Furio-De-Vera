// =============================
// ✅ DONATE.JS (Linked with PROFILE + BROWSE)
// =============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  increment,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// Firebase Config (same as others)
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Helper
const $ = (s) => document.querySelector(s);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Please log in to add a donation.");
    window.location.href = "login.html";
    return;
  }

  const donationForm = $("#donationForm");
  if (!donationForm) {
    console.error("Donation form not found!");
    return;
  }

  donationForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const donation = {
      userId: user.uid,
      donorName: user.displayName || "Anonymous",
      medicineName: $("#medicineName")?.value || "Unnamed Donation",
      category: $("#category")?.value || "General",
      description: $("#description")?.value || "",
      quantity: $("#quantity")?.value || "1",
      condition: $("#condition")?.value || "New",
      pickupLocation: $("#pickupLocation")?.value || "Not specified",
      urgencyLevel: $("#urgencyLevel")?.value || "Normal",
      contactMethod: $("#contactMethod")?.value || user.email,
      createdAt: serverTimestamp(),
    };

    try {
      // Add donation document
      await addDoc(collection(db, "donations"), donation);
      console.log("✅ Donation added to Firestore!");

      // Increment user's donation count
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await updateDoc(userRef, { donations: increment(1) });
      } else {
        await setDoc(userRef, { donations: 1 }, { merge: true });
      }

      alert("🎉 Donation submitted successfully!");
      donationForm.reset();

      // Optional: redirect back to profile
      window.location.href = "profile.html";
    } catch (err) {
      console.error("❌ Error adding donation:", err);
      alert("Failed to add donation — check console for details.");
    }
  });
});
