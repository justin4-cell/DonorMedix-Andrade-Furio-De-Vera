import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

/* -----------------------------
   Firebase config
----------------------------- */
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
try { getAnalytics(app); } catch (_) {}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("✅ Firebase initialized:", app.name);

/* -----------------------------
   Redirect target after LOGIN
----------------------------- */
const REDIRECT_URL = "home.html"; // change to "profile.html" if you prefer

/* -----------------------------
   Utilities & DOM helpers
----------------------------- */
const $ = (id) => (typeof id === "string" ? document.getElementById(id) : id);
const byAny = (...ids) => ids.map($).find(Boolean) || null;

const isPermErr = (e) =>
  e?.code === "permission-denied" ||
  /insufficient permissions|missing or insufficient permissions/i.test(e?.message || "");

function showError(el, text) {
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
}
function hideError(el) {
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

/* NEW: use the Login button label for loading feedback */
function setLoading(btn, loadingEl, on){
  // Always hide any separate loading text if it exists
  if (loadingEl) loadingEl.style.display = 'none';

  if (btn) {
    // Remember original label once
    btn.dataset._label = btn.dataset._label || btn.textContent.trim();
    // Update label while loading
    btn.textContent = on ? 'Logging in…' : (btn.dataset._label || 'Login');
    btn.disabled = !!on;
  }
}

// Simple event bridge for profile.js (future integration)
function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/* -----------------------------
   Shared Elements
----------------------------- */
const els = {
  // login
  loginForm: byAny("loginForm"),
  loginBtn: byAny("loginBtn"),
  loginEmail: byAny("loginEmail", "email"),
  loginPassword: byAny("loginPassword", "password"),
  loginError: byAny("loginErr", "errorMsg"),
  loginLoading: byAny("loadingText"),

  // signup
  signupForm: byAny("signupForm"),
  signupBtn: byAny("signupBtn"),
  signupName: byAny("name", "signupName"),
  signupEmail: byAny("signupEmail"),
  signupPassword: byAny("signupPassword"),
  signupError: byAny("signupErr"),

  // admin (top-right tab-like)
  adminBtnTop: byAny("adminBtnTop"),

  // profile (may not exist on auth page)
  profilePic: byAny("profilePic"),
  uploadPic: byAny("uploadPic"),
  nameField: byAny("nameField", "name"),
  contactField: byAny("contact"),
  emailDisplay: byAny("displayEmail"),
  displayName: byAny("displayName"),
  addressField: byAny("address"),
  dobField: byAny("dob"),
  genderField: byAny("gender"),
  bloodTypeField: byAny("bloodType"),
  medicalInfoField: byAny("medicalInfo"),
  aboutField: byAny("about"),
  editBtn: byAny("editBtn"),
  saveBtn: byAny("saveBtn"),
  logoutBtn: byAny("logoutBtn"),

  // admin content hooks (optional)
  adminGate: byAny("adminGate"),
  adminContent: byAny("adminContent"),
  adminStats: byAny("adminStats"),
};

/* -----------------------------
   Auth: LOGIN
----------------------------- */
if (els.loginForm) {
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError(els.loginError);
    const email = els.loginEmail?.value.trim();
    const password = els.loginPassword?.value;
    if (!email || !password) return;

    try {
      setLoading(els.loginBtn, els.loginLoading, true);
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Logged in as:", user.email);

      // Upsert user doc (best-effort)
      try {
        await setDoc(
          doc(db, "users", user.uid),
          { uid: user.uid, email: user.email, lastLogin: serverTimestamp() },
          { merge: true }
        );
      } catch (e) {
        if (!isPermErr(e)) throw e;
        console.warn("⚠️ users/{uid} write blocked by rules.", e);
      }

      // Optional login history (best-effort)
      try {
        await addDoc(collection(db, "login_history"), {
          uid: user.uid,
          email: user.email,
          ts: serverTimestamp(),
        });
      } catch (e) {
        if (!isPermErr(e)) console.warn("login_history write error:", e);
      }

      emit("auth:login", { uid: user.uid });
      if (!document.body.dataset.stay) {
        window.location.href = REDIRECT_URL; // send to home page.html
      }
    } catch (err) {
      console.error("❌ Login failed:", err);
      const map = {
        "auth/invalid-credential": "Invalid email or password.",
        "auth/invalid-email": "Invalid email format.",
        "auth/user-disabled": "This account is disabled.",
        "auth/user-not-found": "No account found for that email.",
        "auth/wrong-password": "Wrong password.",
        "auth/too-many-requests": "Too many attempts. Try again later.",
        "auth/network-request-failed": "Network error. Check your connection.",
      };
      showError(els.loginError, map[err?.code] || "Login failed.");
    } finally {
      setLoading(els.loginBtn, els.loginLoading, false);
    }
  });
}

/* -----------------------------
   Auth: SIGNUP (then sign out → show Login tab)
----------------------------- */
if (els.signupForm) {
  els.signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError(els.signupError);

    const name = els.signupName?.value.trim();
    const email = els.signupEmail?.value.trim();
    const password = els.signupPassword?.value;
    if (!name || !email || !password)
      return showError(els.signupError, "Please fill out all fields.");
    if (password.length < 8)
      return showError(els.signupError, "Password must be at least 8 characters.");

    try {
      if (els.signupBtn) els.signupBtn.disabled = true;
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: name });
      try { await sendEmailVerification(user); } catch (_) {}

      // Create user doc (best-effort)
      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            uid: user.uid,
            email: user.email,
            name,
            role: "user",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        if (!isPermErr(e)) throw e;
        console.warn("⚠️ users/{uid} create blocked by rules.", e);
      }

      emit("auth:signup", { uid: user.uid });

      // Force new users to log in manually
      await signOut(auth);

      // If tabs exist on the same page, flip to Login tab and show note
      const loginTab = document.getElementById("tab-login");
      const loginActions = document.querySelector("#panel-login .actions");
      if (loginTab) {
        if (loginActions) {
          const note = document.createElement("p");
          note.className = "note";
          note.textContent = "🎉 Account created! Please log in.";
          loginActions.insertAdjacentElement("beforebegin", note);
        }
        loginTab.click();
        els.signupForm?.reset();
      } else {
        // Fallback: separate login page
        window.location.href = "login.html?signup=success";
      }
    } catch (err) {
      console.error("❌ Signup failed:", err);
      const map = {
        "auth/email-already-in-use": "Email already in use.",
        "auth/invalid-email": "Invalid email format.",
        "auth/weak-password": "Password is too weak.",
        "auth/network-request-failed": "Network error. Check your connection.",
      };
      showError(els.signupError, map[err?.code] || "Signup failed.");
    } finally {
      if (els.signupBtn) els.signupBtn.disabled = false;
    }
  });
}

/* -----------------------------
   Auth State — profile & admin hooks
----------------------------- */
onAuthStateChanged(auth, async (user) => {
  emit("auth:ready", { user });
  const onProfileUI = !!(
    els.profilePic || els.displayName || els.emailDisplay || els.saveBtn
  );
  const onAdmin = !!(
    els.adminGate ||
    els.adminContent ||
    els.adminStats ||
    document.body.dataset.page === "admin"
  );

  if (onProfileUI && !user) {
    window.location.href = "login.html";
    return;
  }

  if (!user) return;

  if (onProfileUI) await loadProfile(user);

  if (onAdmin) {
    const isAdmin = await isUserAdmin(user);
    if (!isAdmin) {
      if (els.adminGate) els.adminGate.innerHTML = "<p>Admins only.</p>";
      console.warn("User is not admin");
    } else {
      initAdminArea(user).catch(console.error);
    }
  }
});

async function isUserAdmin(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? snap.data().role || "user" : "user";
    if (role === "admin") return true;
  } catch (e) {
    console.warn("role check error", e);
  }
  try {
    const token = await user.getIdTokenResult();
    if (token.claims?.admin) return true;
  } catch (e) {}
  return false;
}

async function loadProfile(user) {
  try {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (els.profilePic) els.profilePic.src = data.photoURL || "default-profile.png";
      if (els.displayName) els.displayName.textContent = data.name || user.displayName || "User";
      if (els.emailDisplay) els.emailDisplay.textContent = user.email || "";
      if (els.nameField && els.nameField.tagName === "INPUT") els.nameField.value = data.name || "";
      if (els.contactField) els.contactField.value = data.contact || "";
      if (els.addressField) els.addressField.value = data.address || "";
      if (els.dobField) els.dobField.value = data.dob || "";
      if (els.genderField) els.genderField.value = data.gender || "";
      if (els.bloodTypeField) els.bloodTypeField.value = data.bloodType || "";
      if (els.medicalInfoField) els.medicalInfoField.value = data.medicalInfo || "";
      if (els.aboutField) els.aboutField.value = data.about || "";
    } else {
      try {
        await setDoc(
          docRef,
          { uid: user.uid, email: user.email, createdAt: serverTimestamp() },
          { merge: true }
        );
      } catch (e) {
        if (!isPermErr(e)) throw e;
      }
    }
  } catch (err) {
    console.error("❌ Error loading profile:", err);
  }
}

/* Save profile (only if profile page provides saveBtn) */
if (els.saveBtn) {
  els.saveBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      let photoURL = els.profilePic?.src;
      if (els.uploadPic && els.uploadPic.files?.length) {
        const file = els.uploadPic.files[0];
        const storageRef = ref(storage, `profile_pics/${user.uid}`);
        try {
          await uploadBytes(storageRef, file);
          photoURL = await getDownloadURL(storageRef);
          await updateProfile(user, { photoURL });
        } catch (e) {
          if (!isPermErr(e)) throw e;
        }
      }
      const updated = {
        name: els.nameField?.value?.trim() || "",
        contact: els.contactField?.value?.trim() || "",
        address: els.addressField?.value || "",
        dob: els.dobField?.value || "",
        gender: els.genderField?.value || "",
        bloodType: els.bloodTypeField?.value || "",
        medicalInfo: els.medicalInfoField?.value?.trim() || "",
        about: els.aboutField?.value?.trim() || "",
        photoURL,
        updatedAt: serverTimestamp(),
      };
      try {
        await updateDoc(doc(db, "users", user.uid), updated);
        emit("profile:updated", { uid: user.uid });
      } catch (e) {
        if (!isPermErr(e)) throw e;
      }
    } catch (err) {
      console.error("❌ Error saving profile:", err);
    }
  });
}

if (els.logoutBtn) {
  els.logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
  });
}

/* -----------------------------
   Admin Area — basic example
----------------------------- */
if (els.adminBtnTop) {
  els.adminBtnTop.addEventListener("click", (e) => {
    if (!document.body.dataset.page || document.body.dataset.page !== "admin") {
      e.preventDefault();
      window.location.href = "admin.html";
    }
  });
}

async function initAdminArea(user) {
  if (els.adminStats) {
    try {
      els.adminStats.innerHTML = `<div class="stat">Welcome, ${user.email}</div>`;
    } catch (e) {
      els.adminStats.innerHTML = "<p>Unable to load stats.</p>";
    }
  }

  if (els.adminContent) {
    els.adminContent.innerHTML = `
      <section>
        <h3>Quick Actions</h3>
        <div class="admin-actions">
          <button id="admCreateAnnouncement">Create Announcement</button>
          <button id="admListUsers">List Users</button>
          <button id="admViewLogins">Login History</button>
        </div>
        <div id="adminResults" class="admin-results"></div>
      </section>`;
    const results = $("#adminResults");

    $("#admCreateAnnouncement")?.addEventListener("click", async () => {
      try {
        const refCol = collection(db, "announcements");
        const payload = {
          title: "Welcome to DonorMedix",
          body: "Be safe and keep donating ❤️",
          ts: serverTimestamp(),
          author: user.uid,
        };
        await addDoc(refCol, payload);
        results.innerHTML = "<p>✅ Announcement created.</p>";
      } catch (e) {
        results.innerHTML = "<p>⚠️ Unable to create announcement (check rules).</p>";
      }
    });

    $("#admListUsers")?.addEventListener("click", async () => {
      results.innerHTML = "<p>ℹ️ Implement a users list here (Firestore query + pagination).</p>";
    });

    $("#admViewLogins")?.addEventListener("click", async () => {
      results.innerHTML = "<p>ℹ️ Implement login history table here.</p>";
    });
  }
}

/* -----------------------------
   Site UI helpers (dialogs, menu)
----------------------------- */
function toggleMobileMenu() {
  const mobileMenu = $("#mobileMenu");
  const menuIcon = document.querySelector(".menu-icon");
  const closeIcon = document.querySelector(".close-icon");
  if (!mobileMenu) return;

  if (mobileMenu.classList.contains("active")) {
    mobileMenu.classList.remove("active");
    if (menuIcon) menuIcon.style.display = "block";
    if (closeIcon) closeIcon.style.display = "none";
  } else {
    mobileMenu.classList.add("active");
    if (menuIcon) menuIcon.style.display = "none";
    if (closeIcon) closeIcon.style.display = "block";
  }
}
window.toggleMobileMenu = toggleMobileMenu;

function openDonateDialog() { const d = $("donateDialog"); if (!d) return; d.classList.add("active"); document.body.style.overflow = "hidden"; }
function closeDonateDialog() { const d = $("donateDialog"); if (!d) return; d.classList.remove("active"); document.body.style.overflow = "auto"; }
function openRequestDialog(){ const d = $("requestDialog"); if (!d) return; d.classList.add("active"); document.body.style.overflow = "hidden"; }
function closeRequestDialog(){ const d = $("requestDialog"); if (!d) return; d.classList.remove("active"); document.body.style.overflow = "auto"; }

window.openDonateDialog = openDonateDialog;
window.closeDonateDialog = closeDonateDialog;
window.openRequestDialog = openRequestDialog;
window.closeRequestDialog = closeRequestDialog;

document.addEventListener("click", (event) => {
  const donateDialog = $("donateDialog");
  const requestDialog = $("requestDialog");
  if (event.target === donateDialog) closeDonateDialog();
  if (event.target === requestDialog) closeRequestDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closeDonateDialog(); closeRequestDialog(); }
});

Array.from(document.querySelectorAll('a[href^="#"]')).forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    const href = this.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const mobileMenu = $("#mobileMenu");
    if (mobileMenu?.classList.contains("active")) toggleMobileMenu();
  });
});

Array.from(document.querySelectorAll("form[data-demo]")).forEach((form) => {
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    closeDonateDialog();
    closeRequestDialog();
    form.reset();
  });
});

/* -----------------------------
   Password eye toggles
   (hidden ⇒ slashed, shown ⇒ normal)
----------------------------- */
function makeEyeSVG(slash = false) {
  return slash
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.27 2 2 3.27 5.05 6.3A12.66 12.66 0 0 0 1 12c1.73 3.89 6 7 11 7a11 11 0 0 0 4.39-.9l2.34 2.35L21 19.73 3.27 2Zm6.46 6.46 1.15 1.15a3 3 0 0 0 3.21 3.21l1.15 1.15A5 5 0 0 1 9.73 8.46ZM12 7a5 5 0 0 1 5 5 5 5 0 0 1-.22 1.45l3.18 3.18A13.16 13.16 0 0 0 23 12c-1.73-3.89-6-7-11-7a10.9 10.9 0 0 0-3.77.67L9.4 7.84A5 5 0 0 1 12 7Z"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 5-5 5 5 0 0 1-5 5Z"/></svg>';
}

function bindPasswordToggles() {
  document.querySelectorAll(".toggle-pass").forEach((btn) => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    let show = false; // default hidden
    function paint() {
      input.type = show ? "text" : "password";
      btn.innerHTML = makeEyeSVG(!show); // hidden => slash, shown => no slash
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.setAttribute("aria-pressed", String(show));
      btn.title = show ? "Hide password" : "Show password";
    }
    paint();
    btn.addEventListener("click", () => { show = !show; paint(); });
    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); show = !show; paint(); }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindPasswordToggles);
} else {
  bindPasswordToggles();
}

/* -----------------------------
   Export bridge for profile.js
----------------------------- */
export const AppBridge = { auth, db, storage, emit };
