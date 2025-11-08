// =============================
// ✅ LOGIN + PROFILE INTEGRATION
// =============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

// =============================
// 🔹 Firebase Config
// =============================
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

// =============================
// 🔹 Initialize Firebase
// =============================
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

console.log("✅ Firebase initialized:", app.name);

// =============================
// 🔹 DOM Elements for Login
// =============================
const loginBtn = document.getElementById("loginBtn");
const emailField = document.getElementById("email");
const passwordField = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

function showError(text) {
  if (errorMsg) {
    errorMsg.textContent = text;
    errorMsg.style.display = "block";
  } else {
    alert(text);
  }
}

// =============================
// 🔹 LOGIN FUNCTION
// =============================
loginBtn?.addEventListener("click", async (e) => {
  e.preventDefault();

  const email = emailField?.value.trim();
  const password = passwordField?.value.trim();

  if (!email || !password) {
    showError("Please enter both email and password.");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("✅ Logged in as:", user.email);

    // Save login info
    await setDoc(
      doc(db, "users", user.uid),
      {
        email: user.email,
        lastLogin: new Date().toISOString(),
      },
      { merge: true }
    );

    await addDoc(collection(db, "login_history"), {
      uid: user.uid,
      email: user.email,
      timestamp: new Date().toISOString(),
    });

    alert("✅ Login successful!");
    window.location.href = "Home Page.html"; // ✅ Redirect to Home Page
  } catch (err) {
    console.error("❌ Login failed:", err);
    if (err.code === "auth/invalid-credential") {
      showError("Invalid email or password. Please check your credentials.");
    } else {
      showError(err.message);
    }
  }
});

// =============================
// ✅ PROFILE MANAGEMENT (on Home Page or Profile Page)
// =============================
const profilePic = document.getElementById("profilePic");
const uploadPic = document.getElementById("uploadPic");
const nameField = document.getElementById("name");
const contactField = document.getElementById("contact");
const emailDisplay = document.getElementById("displayEmail");
const displayName = document.getElementById("displayName");
const addressField = document.getElementById("address");
const dobField = document.getElementById("dob");
const genderField = document.getElementById("gender");
const bloodTypeField = document.getElementById("bloodType");
const medicalInfoField = document.getElementById("medicalInfo");
const aboutField = document.getElementById("about");

const editBtn = document.getElementById("editBtn");
const saveBtn = document.getElementById("saveBtn");
const logoutBtn = document.getElementById("logoutBtn");

// Load user profile if logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadProfile(user);
  }
});

// Load user data from Firestore
async function loadProfile(user) {
  try {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();

      profilePic && (profilePic.src = data.photoURL || "default-profile.png");
      displayName && (displayName.textContent = data.name || "User Name");
      emailDisplay && (emailDisplay.textContent = user.email);
      if (nameField) nameField.value = data.name || "";
      if (contactField) contactField.value = data.contact || "";
      if (addressField) addressField.value = data.address || "";
      if (dobField) dobField.value = data.dob || "";
      if (genderField) genderField.value = data.gender || "";
      if (bloodTypeField) bloodTypeField.value = data.bloodType || "";
      if (medicalInfoField) medicalInfoField.value = data.medicalInfo || "";
      if (aboutField) aboutField.value = data.about || "";
    } else {
      await setDoc(docRef, { email: user.email, createdAt: new Date().toISOString() });
    }
  } catch (err) {
    console.error("❌ Error loading profile:", err);
  }
}

// Enable edit mode
editBtn?.addEventListener("click", () => toggleEdit(true));
function toggleEdit(editing) {
  [
    nameField,
    contactField,
    addressField,
    dobField,
    genderField,
    bloodTypeField,
    medicalInfoField,
    aboutField,
  ].forEach((input) => input && (input.disabled = !editing));

  if (uploadPic) uploadPic.style.display = editing ? "block" : "none";
  if (saveBtn) saveBtn.style.display = editing ? "inline-block" : "none";
  if (editBtn) editBtn.style.display = editing ? "none" : "inline-block";
}

// Save updated profile
saveBtn?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  try {
    let photoURL = profilePic?.src;

    if (uploadPic && uploadPic.files.length > 0) {
      const file = uploadPic.files[0];
      const storageRef = ref(storage, `profile_pics/${user.uid}`);
      await uploadBytes(storageRef, file);
      photoURL = await getDownloadURL(storageRef);
      await updateProfile(user, { photoURL });
    }

    const updatedData = {
      name: nameField?.value.trim() || "",
      contact: contactField?.value.trim() || "",
      address: addressField?.value.trim() || "",
      dob: dobField?.value || "",
      gender: genderField?.value || "",
      bloodType: bloodTypeField?.value || "",
      medicalInfo: medicalInfoField?.value.trim() || "",
      about: aboutField?.value.trim() || "",
      photoURL,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, "users", user.uid), updatedData);
    alert("✅ Profile updated successfully!");
    toggleEdit(false);
  } catch (err) {
    console.error("❌ Error saving profile:", err);
    alert("Failed to update profile. Please try again.");
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  alert("You have been logged out.");
  window.location.href = "login.html";
});
