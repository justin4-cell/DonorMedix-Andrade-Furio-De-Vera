// auth.js
// Final single-file auth + admin + profile + notifications helpers + UI wiring
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
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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
const auth = getAuth(app);
const db = getFirestore(app);

console.log("✅ Firebase initialized:", app.name);

/* -----------------------------
   Redirect targets
   ----------------------------- */
const REDIRECT_URL = "home.html";
const ADMIN_REDIRECT_URL = "admin.html";

/* -----------------------------
   Small DOM helpers
   ----------------------------- */
const $ = (id) => (typeof id === "string" ? document.getElementById(id) : id);
const byAny = (...ids) => ids.map($).find(Boolean) || null;

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
function showInfo(el, text) {
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
}
function setLoading(btn, loadingEl, on) {
  if (loadingEl) loadingEl.style.display = "none";
  if (!btn) return;
  btn.dataset._label = btn.dataset._label || btn.textContent.trim();
  btn.textContent = on ? "Logging in…" : (btn.dataset._label || "Login");
  btn.disabled = !!on;
}

/* Shared elements */
const els = {
  loginForm: byAny("loginForm"),
  loginBtn: byAny("loginBtn"),
  loginEmail: byAny("loginEmail"),
  loginPassword: byAny("loginPassword"),
  loginError: byAny("loginErr"),
  loginLoading: byAny("loadingText"),

  signupForm: byAny("signupForm"),
  signupBtn: byAny("signupBtn"),
  signupName: byAny("name", "signupName"),
  signupEmail: byAny("signupEmail"),
  signupPassword: byAny("signupPassword"),
  signupError: byAny("signupErr"),

  adminCreateForm: byAny("adminCreateForm"),
  adminCreateName: byAny("adminCreateName"),
  adminCreateEmail: byAny("adminCreateEmail"),
  adminCreatePassword: byAny("adminCreatePassword"),
  adminCreateError: byAny("adminCreateErr"),
  adminCreateSuccess: byAny("adminCreateOk"),

  // profile elements (used on other pages)
  displayName: byAny("displayName"),
  displayEmail: byAny("displayEmail"),
  profilePic: byAny("profilePic"),
  roleEl: byAny("role"),
  notifBadge: byAny("notifBadge"),
  notifList: byAny("notifList"),
};

const isPermErr = (e) =>
  e?.code === "permission-denied" ||
  /insufficient permissions|missing or insufficient permissions/i.test(e?.message || "");

/* -----------------------------
   Auth role helpers
   ----------------------------- */

async function isUserAdmin(user) {
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const role = snap.exists() ? (snap.data().role || "user") : "user";
    if (role === "admin") return true;
  } catch (e) {
    console.warn("role check (firestore) error:", e);
  }
  try {
    const token = await user.getIdTokenResult();
    if (token?.claims?.admin) return true;
  } catch (e) {}
  return false;
}

async function redirectAfterLogin(user) {
  if (!user) return;
  try {
    const admin = await isUserAdmin(user);
    if (admin) window.location.href = ADMIN_REDIRECT_URL;
    else window.location.href = REDIRECT_URL;
  } catch (e) {
    console.error("redirectAfterLogin error:", e);
    window.location.href = REDIRECT_URL;
  }
}

/* -----------------------------
   LOGIN
   ----------------------------- */
if (els.loginForm) {
  els.loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideError(els.loginError);

    const email = els.loginEmail?.value?.trim();
    const password = els.loginPassword?.value;

    if (!email || !password) {
      showError(els.loginError, "Please enter email and password.");
      return;
    }

    try {
      setLoading(els.loginBtn, els.loginLoading, true);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // Upsert basic user doc (non-fatal)
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          lastLogin: serverTimestamp(),
        }, { merge: true });
      } catch (e) {
        if (!isPermErr(e)) throw e;
        console.warn("could not write user doc (permission):", e);
      }

      // Optional login history
      try {
        await addDoc(collection(db, "login_history"), {
          uid: user.uid,
          email: user.email,
          ts: serverTimestamp(),
        });
      } catch (e) {
        if (!isPermErr(e)) console.warn("login_history write error:", e);
      }

      if (!window.__auth_wants_createdByAdmin) {
        await redirectAfterLogin(user);
      }
    } catch (err) {
      console.error("Login failed:", err);
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
   SIGNUP
   ----------------------------- */
if (els.signupForm) {
  els.signupForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideError(els.signupError);

    const name = els.signupName?.value?.trim();
    const email = els.signupEmail?.value?.trim();
    const password = els.signupPassword?.value;

    if (!name || !email || !password) {
      showError(els.signupError, "Please fill out all fields.");
      return;
    }
    if (password.length < 8) {
      showError(els.signupError, "Password must be at least 8 characters.");
      return;
    }

    try {
      if (els.signupBtn) els.signupBtn.disabled = true;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;
      await updateProfile(user, { displayName: name });
      try { await sendEmailVerification(user); } catch (_) {}

      // Create user doc in Firestore
      try {
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          name,
          role: "user",
          createdAt: serverTimestamp(),
        }, { merge: true });
      } catch (e) {
        if (!isPermErr(e)) throw e;
        console.warn("could not create user doc (permission):", e);
      }

      await signOut(auth);

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
        els.signupForm.reset();
      } else {
        window.location.href = "login.html?signup=success";
      }
    } catch (err) {
      console.error("Signup failed:", err);
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
   ADMIN: Create Admin Account (modal)
   Flow:
   - verify current user is admin
   - create new admin user
   - set Firestore role="admin"
   - signOut
   - close modal, switch to Login tab, prefill email
   - show banner
   ----------------------------- */
if (els.adminCreateForm) {
  els.adminCreateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError(els.adminCreateError);
    if (els.adminCreateSuccess) {
      els.adminCreateSuccess.style.display = "none";
      els.adminCreateSuccess.textContent = "";
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return showError(els.adminCreateError, "You must be logged in as admin to create accounts.");
    }

    const creatorIsAdmin = await isUserAdmin(currentUser);
    if (!creatorIsAdmin) {
      return showError(els.adminCreateError, "Admins only (creator not an admin).");
    }

    const name = els.adminCreateName?.value?.trim();
    const email = els.adminCreateEmail?.value?.trim();
    const password = els.adminCreatePassword?.value;
    const role = "admin"; // admin-only

    if (!name || !email || !password) {
      return showError(els.adminCreateError, "Please fill out all fields.");
    }
    if (password.length < 8) {
      return showError(els.adminCreateError, "Password must be at least 8 characters.");
    }

    // show "Processing..." line
    if (els.adminCreateSuccess) {
      els.adminCreateSuccess.style.display = "block";
      els.adminCreateSuccess.classList.add("processing");
      els.adminCreateSuccess.textContent = "Processing admin creation…";
    }

    try {
      const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(newUser, { displayName: name });

      try {
        await setDoc(doc(db, "users", newUser.uid), {
          uid: newUser.uid,
          email: newUser.email,
          name,
          role,
          createdAt: serverTimestamp(),
          createdBy: currentUser.uid,
        }, { merge: true });
      } catch (writeErr) {
        console.warn("Could not write user doc (permission?):", writeErr);
      }

      try { await sendEmailVerification(newUser); } catch (_) {}

      await signOut(auth);

      // reset form
      els.adminCreateForm.reset();

      // close modal
      const adminPanelEl = document.getElementById("adminPanel");
      if (adminPanelEl) {
        adminPanelEl.classList.remove("open");
        adminPanelEl.setAttribute("aria-hidden", "true");
      }

      // switch to login tab
      const tabLogin = document.getElementById("tab-login");
      if (tabLogin) tabLogin.click();

      // prefill login email
      const loginEmailEl = document.getElementById("loginEmail");
      if (loginEmailEl && email) loginEmailEl.value = email;

      // success message text
      if (els.adminCreateSuccess) {
        els.adminCreateSuccess.classList.remove("processing");
        els.adminCreateSuccess.style.display = "block";
        els.adminCreateSuccess.textContent =
          `✅ Admin account created for ${email}. Please log in with this account.`;
      }

      // banner
      const banner = document.createElement("div");
      banner.className = "banner";
      banner.textContent = `Admin account created for ${email}. Please log in.`;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 4000);

    } catch (err) {
      console.error("Admin create account failed:", err);
      const map = {
        "auth/email-already-in-use": "Email already in use.",
        "auth/invalid-email": "Invalid email format.",
        "auth/weak-password": "Password is too weak.",
        "auth/network-request-failed": "Network error. Check your connection.",
      };
      showError(els.adminCreateError, map[err?.code] || "Unable to create admin account.");

      if (els.adminCreateSuccess) {
        els.adminCreateSuccess.style.display = "none";
        els.adminCreateSuccess.textContent = "";
        els.adminCreateSuccess.classList.remove("processing");
      }
    }
  });
}

/* -----------------------------
   Password toggles
   ----------------------------- */
function makeEyeSVG(slash = false) {
  return slash
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.27 2 2 3.27 5.05 6.3A12.66 12.66 0 0 0 1 12c1.73 3.89 6 7 11 7a11 11 0 0 0 4.39-.9l2.34 2.35L21 19.73 3.27 2Zm6.46 6.46 1.15 1.15a3 3 0 0 0 3.21 3.21l1.15 1.15A5 5 0 0 1 9.73 8.46ZM12 7a5 5 0 0 1 5 5 5 5 0 0 1-.22 1.45l3.18 3.18A13.16 13.16 0 0 0 23 12c-1.73-3.89-6-7-11-7a10.9 10.9 0 0 0-3.77.67L9.4 7.84A5 5 0 0 1 12 7Z"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 5-5 5 5 0 0 1-5 5Z"/></svg>';
}

function bindPasswordToggles() {
  document.querySelectorAll(".toggle-pass").forEach((btn) => {
    const targetId = btn.dataset?.target;
    if (!targetId) return;
    const input = document.getElementById(targetId);
    if (!input) return;
    let show = false;
    function paint() {
      input.type = show ? "text" : "password";
      btn.innerHTML = makeEyeSVG(!show);
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.setAttribute("aria-pressed", String(show));
      btn.title = show ? "Hide password" : "Show password";
    }
    paint();
    btn.addEventListener("click", () => { show = !show; paint(); });
    btn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        show = !show;
        paint();
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindPasswordToggles);
} else {
  bindPasswordToggles();
}

/* -----------------------------
   Profile & Notifications helpers
   ----------------------------- */
export function onAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserDoc(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("getUserDoc error", e);
    return null;
  }
}

export async function updateUserDoc(uid, data) {
  if (!uid) throw new Error("uid required");
  return updateDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() });
}

/* Notifications helpers */
export async function fetchNotifications(uid, opts = { limit: 20 }) {
  if (!uid) return [];
  try {
    const q = query(
      collection(db, "notifications"),
      where("uid", "==", uid),
      orderBy("ts", "desc"),
      limit(opts.limit || 20)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("fetchNotifications error", e);
    return [];
  }
}

export function listenNotifications(uid, onChange) {
  if (!uid) return () => {};
  const q = query(
    collection(db, "notifications"),
    where("uid", "==", uid),
    orderBy("ts", "desc"),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onChange(arr);
    },
    (err) => {
      console.warn("listenNotifications error", err);
    }
  );
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true,
      readAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("markNotificationRead error", e);
  }
}

export async function createNotification({ uid, title, body, metadata = {} } = {}) {
  if (!uid) throw new Error("uid required");
  try {
    await addDoc(collection(db, "notifications"), {
      uid,
      title: title || "Notification",
      body: body || "",
      metadata,
      read: false,
      ts: serverTimestamp(),
    });
  } catch (e) {
    console.warn("createNotification error", e);
  }
}

/* UI helpers */
export async function populateProfileUI(user, opts = {}) {
  const { nameElId, emailElId, avatarElId, roleElId } = opts;
  if (!user) {
    [nameElId, emailElId, avatarElId, roleElId].forEach((id) => {
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        if (id === avatarElId && el.tagName === "IMG") el.src = el.dataset?.default || "";
        else el.textContent = "";
      }
    });
    return;
  }

  const nameEl = nameElId ? document.getElementById(nameElId) : null;
  const emailEl = emailElId ? document.getElementById(emailElId) : null;
  const avatarEl = avatarElId ? document.getElementById(avatarElId) : null;
  const roleEl = roleElId ? document.getElementById(roleElId) : null;

  if (nameEl) nameEl.textContent = user.displayName || user.email || "";
  if (emailEl) emailEl.textContent = user.email || "";
  if (avatarEl && user.photoURL && avatarEl.tagName === "IMG") avatarEl.src = user.photoURL;

  const userDoc = await getUserDoc(user.uid);
  if (userDoc) {
    if (nameEl && userDoc.name) nameEl.textContent = userDoc.name;
    if (avatarEl && userDoc.photoURL && avatarEl.tagName === "IMG") avatarEl.src = userDoc.photoURL;
    if (roleEl) roleEl.textContent = userDoc.role || "";
  }
}

export function bindNotificationBadge(user, opts = {}) {
  const { badgeElId, listElId, onItemClick } = opts;
  const badgeEl = badgeElId ? document.getElementById(badgeElId) : null;
  const listEl = listElId ? document.getElementById(listElId) : null;

  if (!user) {
    if (badgeEl) badgeEl.style.display = "none";
    if (listEl) listEl.innerHTML = "";
    return () => {};
  }

  const unsub = listenNotifications(user.uid, (notifications) => {
    const unreadCount = notifications.filter((n) => !n.read).length;
    if (badgeEl) {
      badgeEl.textContent = unreadCount > 0 ? String(unreadCount) : "";
      badgeEl.style.display = unreadCount > 0 ? "inline-block" : "none";
    }
    if (listEl) {
      listEl.innerHTML = notifications
        .map((n) => {
          const cls = n.read ? "notif read" : "notif unread";
          const time = n.ts?.toDate ? new Date(n.ts.toDate()).toLocaleString() : "";
          return `<li class="${cls}" data-id="${escapeHtml(n.id)}" role="button" tabindex="0">
                  <strong>${escapeHtml(n.title || "Notification")}</strong>
                  <div class="meta">${escapeHtml(time)}</div>
                  <div class="body">${escapeHtml(n.body || "")}</div>
                </li>`;
        })
        .join("");

      listEl.querySelectorAll("li[data-id]").forEach((li) => {
        li.onclick = async () => {
          const id = li.dataset.id;
          const notif = notifications.find((x) => x.id === id);
          if (notif && !notif.read) await markNotificationRead(id);
          if (onItemClick) onItemClick(notif);
        };
        li.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            li.click();
          }
        });
      });
    }
  });

  return unsub;
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* =============================
   Extra helpers / guards
   ============================= */
export async function createAdminAccount({ email, password, name } = {}) {
  if (!email || !password || password.length < 8) {
    throw new Error("email and password(>=8) required");
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  if (name) await updateProfile(user, { displayName: name });
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email,
      name: name || "",
      role: "admin",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  try {
    await sendEmailVerification(user);
  } catch (_) {}
  return user.uid;
}

export async function setUserRole(uid, role = "user") {
  if (!uid) throw new Error("uid required");
  return updateDoc(doc(db, "users", uid), { role, updatedAt: serverTimestamp() });
}

export function requireAuth(options = {}) {
  const redirectTo = options.redirectTo || "login.html";
  return onAuthState(async (user) => {
    if (!user) {
      window.location.href = redirectTo;
      return;
    }
  });
}

export function requireAdmin(options = {}) {
  const redirectTo = options.redirectTo || "login.html";
  return onAuthState(async (user) => {
    if (!user) {
      window.location.href = redirectTo;
      return;
    }
    const docu = await getUserDoc(user.uid);
    const role = docu?.role || "";
    if (role !== "admin") {
      window.location.href = redirectTo;
    }
  });
}

export function wirePageAuth(opts = {}) {
  const {
    profile = {},
    badge = {},
    requireAdmin: rAdmin = false,
    requireLogin: rLogin = false,
    redirectTo = "login.html",
  } = opts;
  return onAuthState(async (user) => {
    if (!user) {
      if (rLogin || rAdmin) window.location.href = redirectTo;
      else {
        await populateProfileUI(null, profile);
        bindNotificationBadge(null, badge);
      }
      return;
    }
    await populateProfileUI(user, profile);
    bindNotificationBadge(user, badge);
    if (rAdmin) {
      const docu = await getUserDoc(user.uid);
      if ((docu?.role || "") !== "admin") {
        window.location.href = redirectTo;
      }
    }
  });
}

/* =============================
   UI wiring (tabs + admin modal)
   ============================= */
(function uiWireUp() {
  const onLoginPage = !!document.getElementById("loginForm");

  // createdByAdmin banner (kept, optional)
  try {
    const params = new URLSearchParams(window.location.search);
    const createdByAdminFlag = params.get("createdByAdmin") === "1";
    if (createdByAdminFlag && onLoginPage) {
      const banner = document.createElement("div");
      banner.className = "auth-created-by-admin-banner";
      banner.style.cssText =
        "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#f0fdf4;color:#064e3b;padding:10px 14px;border-radius:10px;box-shadow:0 8px 20px rgba(2,6,23,.08);z-index:10000;font-weight:700";
      banner.textContent = "Admin account created — please log in.";
      document.body.appendChild(banner);
      setTimeout(() => {
        banner.style.transition = "opacity .3s";
        banner.style.opacity = "0";
        setTimeout(() => banner.remove(), 350);
      }, 3500);

      window.__auth_wants_createdByAdmin = true;
      const unsub = onAuthState(async (user) => {
        if (!user) return;
        try {
          window.__auth_wants_createdByAdmin = false;
          unsub();
          window.location.href = REDIRECT_URL;
        } catch (err) {
          console.error("createdByAdmin auth handler error:", err);
          window.__auth_wants_createdByAdmin = false;
          unsub();
          await redirectAfterLogin(user);
        }
      });
    }
  } catch (e) {
    console.warn("createdByAdmin banner logic failed:", e);
  }

  // tabs
  try {
    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");
    const panelLogin = document.getElementById("panel-login");
    const panelSignup = document.getElementById("panel-signup");
    if (tabLogin && tabSignup && panelLogin && panelSignup) {
      function selectTab(which) {
        const isLogin = which === "login";
        tabLogin.setAttribute("aria-selected", String(isLogin));
        tabSignup.setAttribute("aria-selected", String(!isLogin));
        panelLogin.classList.toggle("hidden", !isLogin);
        panelSignup.classList.toggle("hidden", isLogin);
      }
      tabLogin.addEventListener("click", () => selectTab("login"));
      tabSignup.addEventListener("click", () => selectTab("signup"));
      document
        .getElementById("toLogin")
        ?.addEventListener("click", (e) => {
          e.preventDefault();
          selectTab("login");
        });
    }
  } catch (e) {
    console.warn("tab wiring error:", e);
  }

  // admin modal wiring
  try {
    const adminBtn = document.getElementById("adminBtnTop");
    const adminPanel = document.getElementById("adminPanel");
    const closeAdmin = document.getElementById("closeAdmin");
    const adminOk = document.getElementById("adminCreateOk");
    const adminErr = document.getElementById("adminCreateErr");

    if (adminBtn && adminPanel) {
      adminBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        adminPanel.classList.add("open");
        adminPanel.setAttribute("aria-hidden", "false");
        if (adminErr) {
          adminErr.style.display = "none";
          adminErr.textContent = "";
        }
        if (adminOk) {
          adminOk.style.display = "none";
          adminOk.textContent = "";
          adminOk.classList.remove("processing");
        }
        setTimeout(() => document.getElementById("adminCreateEmail")?.focus(), 120);
      });
    }
    if (closeAdmin && adminPanel) {
      closeAdmin.addEventListener("click", () => {
        adminPanel.classList.remove("open");
        adminPanel.setAttribute("aria-hidden", "true");
      });
    }
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && adminPanel) {
        adminPanel.classList.remove("open");
        adminPanel.setAttribute("aria-hidden", "true");
      }
    });
  } catch (e) {
    console.warn("admin panel wiring error:", e);
  }

  // profile UI on other pages
  try {
    const hasProfileEls =
      !!(els.displayName || els.displayEmail || els.profilePic || els.roleEl);
    if (hasProfileEls) {
      onAuthState(async (user) => {
        if (!user) {
          populateProfileUI(null, {
            nameElId: "displayName",
            emailElId: "displayEmail",
            avatarElId: "profilePic",
            roleElId: "role",
          }).catch(() => {});
          bindNotificationBadge(null, {
            badgeElId: "notifBadge",
            listElId: "notifList",
          });
          return;
        }
        populateProfileUI(user, {
          nameElId: "displayName",
          emailElId: "displayEmail",
          avatarElId: "profilePic",
          roleElId: "role",
        }).catch(() => {});
        bindNotificationBadge(user, {
          badgeElId: "notifBadge",
          listElId: "notifList",
        });
      });
    }
  } catch (e) {
    console.warn("profile UI wiring error:", e);
  }
})();

/* =============================
   Export AppBridge and helpers
   ============================= */
export const AppBridge = {
  auth,
  db,
  onAuthState,
  getUserDoc,
  updateUserDoc,
  fetchNotifications,
  listenNotifications,
  markNotificationRead,
  createNotification,
  populateProfileUI,
  bindNotificationBadge,
  createAdminAccount,
  setUserRole,
  requireAuth,
  requireAdmin,
  wirePageAuth,
};
