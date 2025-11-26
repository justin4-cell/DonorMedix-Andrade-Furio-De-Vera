// browse.js
// DonorMedix · Browse donations + Requests + Header Profile & Notifications (no modals/cards)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  limit,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// ---------------- Firebase ----------------
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------- Helpers ----------------
const $ = (sel) => document.querySelector(sel);
function onReady(fn) {
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn)
    : fn();
}

const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diff = (d.getTime() - Date.now()) / 1000; // seconds
  const ranges = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, sec] of ranges) {
    if (Math.abs(diff) >= sec || unit === "second") {
      return timeFmt.format(Math.round(diff / sec), unit);
    }
  }
  return "";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}
function firstTwo(str = "U") {
  return (str || "").trim().slice(0, 2).toUpperCase();
}
function displayNameFrom(u, data) {
  return (
    data?.name ||
    u?.displayName ||
    (u?.email ? u.email.split("@")[0] : "Profile")
  );
}

// Format expiry date (still useful if you want to show it as text)
function formatExpiry(exp) {
  if (!exp) return "Not set";
  let d = exp;
  if (exp && typeof exp === "object" && typeof exp.toDate === "function") {
    d = exp.toDate();
  } else if (!(d instanceof Date)) {
    const tmp = new Date(exp);
    if (!isNaN(tmp)) d = tmp;
  }
  if (!(d instanceof Date) || isNaN(d)) return String(exp);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Simple default images (not used for modals anymore, but kept if needed in HTML)
const DEFAULT_DONATION_IMAGE =
  "https://images.unsplash.com/photo-1584362917165-526a968579e8?q=80&w=1200&auto=format&fit=crop";
const DEFAULT_REQUEST_IMAGE =
  "https://images.unsplash.com/photo-1584306670954-dbb2a7e4aa0f?q=80&w=1200&auto=format&fit=crop";

// ---------------- Toast ----------------
const toast = document.getElementById("toast");
function showToast(msg) {
  if (!toast) {
    alert(msg);
    return;
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ---------------- DOM refs ----------------
const browseList = document.getElementById("browseList");
const searchForm = document.getElementById("searchForm");
const qInput = document.getElementById("q");

// Category pills (Donation / Request)
let activeBrowseCategory = "donation"; // "donation" | "request"

// Data caches
let currentUser = null;
let allDonations = [];
let allRequests = [];

/* Flash toast from storage */
(function pullFlashOnce() {
  let found = false;
  try {
    const msg =
      localStorage.getItem("browseFlash") ||
      sessionStorage.getItem("browseFlash");
    if (msg) {
      showToast(msg);
      localStorage.removeItem("browseFlash");
      sessionStorage.removeItem("browseFlash");
      found = true;
    }
  } catch (e) {}
  if (!found) {
    try {
      const hash = (location.hash || "").toLowerCase();
      if (hash.includes("donation=success")) {
        showToast("Donation posted successfully!");
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch (e) {}
  }
})();

// user-lite cache (used for header / future)
const __userCache = new Map(); // uid -> {name, photoURL, profession}
async function getUserLite(uid) {
  if (!uid) return null;
  if (__userCache.has(uid)) return __userCache.get(uid);
  try {
    const s = await getDoc(doc(db, "users", uid));
    const d = s.exists() ? s.data() : {};
    const lite = {
      name: d.name || "Anonymous",
      photoURL: d.photoURL || null,
      profession: d.profession || null,
    };
    __userCache.set(uid, lite);
    return lite;
  } catch (e) {
    return null;
  }
}

/* ====== Minimal browse styles (no cards/modals) ====== */
function ensureBrowseStyles() {
  if (document.getElementById("dmx_browse_card_styles")) return;
  const s = document.createElement("style");
  s.id = "dmx_browse_card_styles";
  s.textContent = [
    // Category pills (Donation / Request)
    ".browse-switcher{display:inline-flex;align-items:center;gap:8px;padding:6px 8px;border-radius:999px;background:rgba(15,23,42,.03);border:1px solid #e2e8f0;margin-bottom:12px;}",
    ".browse-pill{position:relative;border:none;border-radius:999px;padding:7px 16px;font-size:.78rem;font-weight:800;cursor:pointer;background:transparent;color:#64748b;letter-spacing:.08em;text-transform:uppercase;transition:background .12s ease,color .12s ease,box-shadow .12s ease,transform .12s ease,opacity .12s ease;}",
    ".browse-pill:hover{background:#e5f2ff;color:#0f172a;box-shadow:0 8px 20px rgba(255,255,255,.95);transform:translateY(-1px);}",
    ".browse-pill.active{background:linear-gradient(135deg,#0f172a,#020617);color:#f9fafb;box-shadow:0 14px 32px rgba(15,23,42,.55);}",
    ".browse-pill.active::after{content:'';position:absolute;inset:-2px;border-radius:999px;border:1px solid rgba(56,189,248,.5);pointer-events:none;}",
    // Simple list
    ".browse-list-simple{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;}",
    ".browse-list-simple li{padding:10px 12px;border-radius:10px;border:1px solid #e2e8f0;background:#ffffff;font-size:.9rem;display:flex;flex-direction:column;gap:2px;}",
    ".browse-list-simple li .title{font-weight:700;color:#0f172a;}",
    ".browse-list-simple li .meta{font-size:.8rem;color:#64748b;}",
    ".muted{color:#64748b;font-size:.9rem;}",
  ].join("\n");
  document.head.appendChild(s);
}

// ---------------- Donations + Requests (no modals/cards) ----------------

// realtime donations
const donationsQ = query(
  collection(db, "donations"),
  orderBy("createdAt", "desc")
);

// realtime requests
const requestsQ = query(
  collection(db, "requests"),
  orderBy("createdAt", "desc")
);

/* ----- Donations snapshot ----- */
onSnapshot(
  donationsQ,
  (snap) => {
    allDonations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!browseList) return;
    renderActiveCategory(qInput ? qInput.value.trim() : "");
  },
  (err) => {
    console.error("Error loading donations:", err);
    if (browseList && activeBrowseCategory === "donation")
      browseList.innerHTML = `<p class="muted">⚠️ Failed to load donations.</p>`;
  }
);

/* ----- Requests snapshot ----- */
onSnapshot(
  requestsQ,
  (snap) => {
    allRequests = snap.docs.map((s) => {
      const d = s.data();
      const ms =
        d.createdAt && d.createdAt.toMillis
          ? d.createdAt.toMillis()
          : d.createdAt && d.createdAt.seconds
          ? d.createdAt.seconds * 1000
          : Date.now();
      d._when = timeAgo(ms);
      return { id: s.id, ...d };
    });
    if (!browseList) return;
    renderActiveCategory(qInput ? qInput.value.trim() : "");
  },
  (err) => {
    console.error("Error loading requests:", err);
    if (browseList && activeBrowseCategory === "request")
      browseList.innerHTML = `<p class="muted">⚠️ Failed to load requests.</p>`;
  }
);

/* ====== Simple Donation + Request renderers (no cards, no modals) ====== */

// Donation list
function renderDonations(items, term = "") {
  if (!browseList) return;
  ensureBrowseStyles();

  const t = (term || "").toLowerCase();
  const filtered = !t
    ? items
    : items.filter((x) => {
        return (
          (x.medicineName || "").toLowerCase().includes(t) ||
          (x.category || "").toLowerCase().includes(t) ||
          (x.description || "").toLowerCase().includes(t) ||
          (x.pickupLocation || "").toLowerCase().includes(t) ||
          (x.donorName || "").toLowerCase().includes(t)
        );
      });

  browseList.innerHTML = "";
  if (!filtered.length) {
    browseList.innerHTML = `<p class="muted">No donations found${
      t ? ` for “${escapeHtml(term)}”` : ""
    }.</p>`;
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "browse-list-simple";

  filtered.forEach((donation) => {
    const donorName = donation.donorName || "Anonymous";
    const donorUID = donation.userId || "";
    const isOwner = !!(currentUser && donorUID && currentUser.uid === donorUID);
    const donorLabel = isOwner ? "You" : donorName;

    const title = donation.medicineName || "Unnamed Donation";
    const cat = donation.category || "Other";
    const expiryRaw =
      donation.expirationDate ||
      donation.expiryDate ||
      donation.expiry ||
      donation.expiration ||
      null;
    const expires = formatExpiry(expiryRaw);

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="title">${escapeHtml(title)}</div>
      <div class="meta">
        Donated by <strong>${escapeHtml(donorLabel)}</strong>
        · ${escapeHtml(cat)} 
        · Expires: ${escapeHtml(expires)}
      </div>
    `;
    ul.appendChild(li);
  });

  browseList.appendChild(ul);
}

// Request list
function renderRequests(items, term = "") {
  if (!browseList) return;
  ensureBrowseStyles();

  const t = (term || "").toLowerCase();
  const filtered = !t
    ? items
    : items.filter((x) => {
        return (
          (x.title || "").toLowerCase().includes(t) ||
          (x.category || "").toLowerCase().includes(t) ||
          (x.description || "").toLowerCase().includes(t) ||
          (x.location || "").toLowerCase().includes(t) ||
          (x.requesterName || "").toLowerCase().includes(t)
        );
      });

  browseList.innerHTML = "";
  if (!filtered.length) {
    browseList.innerHTML = `<p class="muted">No requests found${
      t ? ` for “${escapeHtml(term)}”` : ""
    }.</p>`;
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "browse-list-simple";

  filtered.forEach((req) => {
    const requester =
      req.requesterName ||
      (req.requesterId ? "User " + req.requesterId.slice(0, 6) : "Anonymous");
    const title = req.title || "Medicine Request";
    const cat = req.category || "Other";
    const when = req._when || "";

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="title">${escapeHtml(title)}</div>
      <div class="meta">
        Requested by <strong>${escapeHtml(requester)}</strong>
        · ${escapeHtml(cat)}
        ${when ? " · " + escapeHtml(when) : ""}
      </div>
    `;
    ul.appendChild(li);
  });

  browseList.appendChild(ul);
}

// Central renderer depending on activeBrowseCategory
function renderActiveCategory(term = "") {
  if (activeBrowseCategory === "request") {
    renderRequests(allRequests, term);
  } else {
    renderDonations(allDonations, term);
  }
}

if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    renderActiveCategory(qInput ? qInput.value.trim() : "");
  });
}

// ---------------- Header profile + notifications ----------------
let signInBtn; // .sign-in-btn
let bellBtn; // .bell-btn
let bellBadge; // badge
let profileModal = null; // profile modal
let notifModal = null; // notifications modal
let unsubUserDoc = null;
let unsubEvents = null;

// ---------- Profile Modal ----------
function ensureProfileModal() {
  if (profileModal) return profileModal;
  profileModal = document.createElement("div");
  profileModal.id = "dm_profile_modal";
  Object.assign(profileModal.style, {
    position: "fixed",
    zIndex: "1000",
    right: "16px",
    top: "64px",
    width: "min(92vw, 300px)",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    boxShadow: "0 16px 44px rgba(0,0,0,.16)",
    display: "none",
    overflow: "hidden",
  });

  profileModal.innerHTML = `
    <div style="padding:14px 16px; border-bottom:1px solid #e5e7eb; background:#f8fafc; display:flex; align-items:center; gap:12px;">
      <div id="dm_profile_avatar" style="width:40px;height:40px;border-radius:10px;background:#e2e8f0;display:grid;place-items:center;font-weight:900;color:#0f172a;"></div>
      <div style="min-width:0;">
        <div id="dm_profile_name" style="font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">User</div>
        <div id="dm_profile_email" style="color:#475569;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
      </div>
    </div>

    <div style="padding:12px; display:flex; gap:10px;">
      <a href="profile.html" style="flex:1; text-align:center; text-decoration:none; background:#0f172a; color:#fff; border-radius:10px; padding:10px 12px; font-weight:800;">Go to Profile</a>
      <button id="dm_signout" style="flex:1; background:#ffffff; color:#0f172a; border:1px solid #e2e8eb; border-radius:10px; padding:10px 12px; font-weight:800; cursor:pointer;">Sign Out</button>
    </div>
  `;
  document.body.appendChild(profileModal);

  document.addEventListener("keydown", (e) => {
    if (profileModal.style.display !== "none" && e.key === "Escape")
      hideProfileModal();
  });
  document.addEventListener("click", (e) => {
    if (profileModal.style.display === "none") return;
    if (e.target === profileModal || profileModal.contains(e.target)) return;
    if (signInBtn && (e.target === signInBtn || signInBtn.contains(e.target)))
      return;
    hideProfileModal();
  });
  profileModal
    .querySelector("#dm_signout")
    .addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (e) {
        console.warn("signOut error", e);
      }
      hideProfileModal();
    });

  return profileModal;
}
function showProfileModal() {
  ensureProfileModal();
  profileModal.style.display = "block";
}
function hideProfileModal() {
  if (profileModal) profileModal.style.display = "none";
}

function updateProfileUI(u, userData) {
  const name = displayNameFrom(u, userData);
  if (!signInBtn) return;

  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  ensureProfileModal();
  const nm = document.getElementById("dm_profile_name");
  const em = document.getElementById("dm_profile_email");
  const av = document.getElementById("dm_profile_avatar");

  const headerName = document.getElementById("profileName");
  const headerEmail = document.getElementById("profileEmail");
  const headerAvatar = document.getElementById("profileAvatar");

  if (nm) nm.textContent = name;
  if (em) em.textContent = u?.email || "";
  if (av) av.textContent = firstTwo(name);

  if (headerName) headerName.textContent = name;
  if (headerEmail) headerEmail.textContent = u?.email || "";
  if (headerAvatar && u?.photoURL) headerAvatar.src = u.photoURL;

  signInBtn.onclick = (e) => {
    e.preventDefault();
    if (profileModal.style.display === "none") showProfileModal();
    else hideProfileModal();
  };
}
function renderSignedOut() {
  if (!signInBtn) return;
  signInBtn.textContent = "Sign In";
  signInBtn.title = "Sign In";
  signInBtn.setAttribute("aria-label", "Sign In");
  signInBtn.onclick = () => (window.location.href = "auth.html");
  hideProfileModal();
}

// ---------- Notifications ----------
function ensureBellBadge() {
  if (!bellBtn) return null;
  if (bellBadge) return bellBadge;

  const computed = window.getComputedStyle(bellBtn);
  if (computed.position === "static") bellBtn.style.position = "relative";

  bellBadge = document.createElement("span");
  Object.assign(bellBadge.style, {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    background: "#ef4444",
    color: "#ffffff",
    borderRadius: "999px",
    padding: "2px 6px",
    fontSize: "12px",
    fontWeight: "700",
    minWidth: "20px",
    lineHeight: "16px",
    textAlign: "center",
    display: "none",
    border: "2px solid #0f172a",
  });
  bellBadge.textContent = "0";
  bellBtn.appendChild(bellBadge);
  return bellBadge;
}
function setBellCount(n) {
  ensureBellBadge();
  if (!bellBadge) return;
  if (!n || n <= 0) {
    bellBadge.style.display = "none";
  } else {
    bellBadge.style.display = "inline-block";
    bellBadge.textContent = String(n);
  }
}

function ensureNotifModal() {
  if (notifModal) return notifModal;
  notifModal = document.createElement("div");
  notifModal.id = "dm_notif_modal";
  Object.assign(notifModal.style, {
    position: "fixed",
    zIndex: "1000",
    right: "220px",
    top: "64px",
    width: "min(92vw, 200px)",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    boxShadow: "0 16px 44px rgba(0,0,0,.16)",
    display: "none",
    overflow: "hidden",
    maxHeight: "72vh",
  });

  notifModal.innerHTML = `
    <div style="padding:12px 14px; border-bottom:1px solid #e5e7eb; background:#f8fafc; display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex;align-items:center; gap:10px;">
        <span style="font-weight:900; color:#0f172a;">Notifications</span>
        <span id="dm_notif_count_pill" style="background:#0f172a;color:#fff;border-radius:999px;padding:2px 8px;font-size:.8rem;font-weight:800;">0</span>
      </div>
      <button id="dm_notif_close" style="border:none;background:transparent;cursor:pointer;color:#0f172a;font-weight:900;">×</button>
    </div>
    <div id="dm_notif_list" style="padding:10px; overflow:auto; background:#f8fafc;">
      <div style="padding:10px; color:#64748b;">No notifications yet.</div>
    </div>
  `;
  document.body.appendChild(notifModal);

  document
    .getElementById("dm_notif_close")
    .addEventListener("click", hideNotifModal);
  document.addEventListener("keydown", (e) => {
    if (notifModal.style.display !== "none" && e.key === "Escape")
      hideNotifModal();
  });
  document.addEventListener("click", (e) => {
    if (notifModal.style.display === "none") return;
    if (notifModal.contains(e.target)) return;
    if (bellBtn && (e.target === bellBtn || bellBtn.contains(e.target))) return;
    hideNotifModal();
  });

  return notifModal;
}
function showNotifModal() {
  ensureNotifModal();
  notifModal.style.display = "block";
  setBellCount(0);
}
function hideNotifModal() {
  if (notifModal) notifModal.style.display = "none";
}

function iconForType(type) {
  const base =
    "width:26px;height:26px;display:block;color:#2563eb;margin-bottom:8px";
  if (type === "donation") {
    return `<svg style="${base}" viewBox="0 0 24 24" fill="currentColor"><path d="M12.1 21.7 3.4 13A7.1 7.1 0 0 1 13 3.4a7.1 7.1 0 0 1 9.6 9.6l-8.7 8.7a1.27 1.27 0 0 1-1.8 0Z"/></svg>`;
  }
  if (type === "request") {
    return `<svg style="${base};color:#0ea5e9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a10 10 0 1 1 10-10 10.01 10.01 0 0 1-10 10Zm1-15v5h4v2h-6V7h2Z"/></svg>`;
  }
  return `<svg style="${base};color:#475569" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"/></svg>`;
}

function renderEventsList(items) {
  ensureNotifModal();
  const list = document.getElementById("dm_notif_list");
  const pill = document.getElementById("dm_notif_count_pill");

  if (!items || !items.length) {
    list.innerHTML = `<div style="padding:10px; color:#64748b;">No notifications yet.</div>`;
    pill.textContent = "0";
    return;
  }
  pill.textContent = String(items.length);

  list.innerHTML = items
    .map((ev) => {
      const icon = iconForType(ev.type);
      const when = ev.createdAt
        ? timeAgo(ev.createdAt.toDate ? ev.createdAt.toDate() : ev.createdAt)
        : "";
      const who = ev.userName
        ? `<strong style="color:#0f172a">${escapeHtml(
            ev.userName
          )}</strong> — `
        : "";
      const msg = ev.message || "";
      return `
      <div style="
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:12px 14px;
        margin-bottom:10px;
        box-shadow:0 6px 18px rgba(255, 250, 250, 0.06);
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        gap:4px;
      " data-id="${ev.id}">
        ${icon}
        <div style="color:#0f172a; line-height:1.35;">${who}${escapeHtml(
        msg
      )}</div>
        <div style="color:#64748b; font-size:.85rem;">${when}</div>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll("[data-id]").forEach((card) => {
    card.onclick = async () => {
      const id = card.getAttribute("data-id");
      try {
        const nRef = doc(db, "events", id);
        await updateDoc(nRef, { read: true }).catch(() => {});
      } catch (e) {}
      hideNotifModal();
    };
  });
}

// ---------- Firestore listeners for header ----------
function listenToUserDoc(u) {
  if (unsubUserDoc) {
    unsubUserDoc();
    unsubUserDoc = null;
  }
  if (!u) return;
  const ref = doc(db, "users", u.uid);
  unsubUserDoc = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      updateProfileUI(u, data);
    },
    (err) => {
      console.warn("users doc listener error:", err?.message);
      updateProfileUI(u, null);
    }
  );
}

// events targeted to signed-in user
function listenToEvents(u) {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }
  try {
    if (!u) {
      renderEventsList([]);
      setBellCount(0);
      return;
    }

    const eventsQ = query(
      collection(db, "events"),
      where("targetUserId", "==", u.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    unsubEvents = onSnapshot(
      eventsQ,
      (snap) => {
        const items = [];
        snap.forEach((d) => {
          const data = d.data() || {};
          items.push({
            id: d.id,
            type: data.type || "info",
            message: data.message || "",
            userName: data.userName || "",
            createdAt: data.createdAt || null,
            metadata: data.metadata || {},
            read: data.read || false,
          });
        });
        renderEventsList(items);
        const unread = items.filter((i) => !i.read).length;
        setBellCount(unread || items.length);
      },
      (err) => {
        console.warn("events listener error:", err?.message);
        renderEventsList([]);
        setBellCount(0);
      }
    );
  } catch (e) {
    console.warn("events query error:", e?.message);
  }
}

// ---------- Init ----------
onReady(() => {
  ensureBrowseStyles();

  signInBtn = document.querySelector(".sign-in-btn");
  bellBtn = document.querySelector(".bell-btn");

  // Category pills
  const pills = document.querySelectorAll("[data-browse-category]");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const cat = (pill.dataset.browseCategory || "donation").toLowerCase();
      activeBrowseCategory = cat === "request" ? "request" : "donation";
      pills.forEach((p) => p.classList.toggle("active", p === pill));
      renderActiveCategory(qInput ? qInput.value.trim() : "");
    });
  });

  if (bellBtn) {
    ensureBellBadge();
    bellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifModal || notifModal.style.display === "none")
        showNotifModal();
      else hideNotifModal();
    });
  }

  if (!signInBtn) return;
  renderSignedOut();

  onAuthStateChanged(auth, (u) => {
    currentUser = u;

    // Re-render list so "You" label updates
    try {
      renderActiveCategory(qInput ? qInput.value.trim() : "");
    } catch (e) {}

    if (!u) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      renderSignedOut();

      const headerName = document.getElementById("profileName");
      const headerEmail = document.getElementById("profileEmail");
      const headerAvatar = document.getElementById("profileAvatar");
      if (headerName) headerName.textContent = "Guest";
      if (headerEmail) headerEmail.textContent = "";
      if (headerAvatar && headerAvatar.dataset?.default)
        headerAvatar.src = headerAvatar.dataset.default;
      const nl = document.getElementById("notifList");
      if (nl) nl.innerHTML = "";

      listenToEvents(null);
      return;
    }

    listenToUserDoc(u);
    listenToEvents(u);

    try {
      const headerName = document.getElementById("profileName");
      const headerEmail = document.getElementById("profileEmail");
      const headerAvatar = document.getElementById("profileAvatar");
      if (headerName)
        headerName.textContent =
          u.displayName || (u.email ? u.email.split("@")[0] : "User");
      if (headerEmail) headerEmail.textContent = u.email || "";
      if (headerAvatar && u.photoURL) headerAvatar.src = u.photoURL;
    } catch (e) {}
  });
});

// ---------------- Nav highlight ----------------
(function () {
  try {
    const path = location.pathname.split("/").pop();
    document.querySelectorAll("nav a").forEach((a) => {
      if (a.getAttribute("href") === path) a.classList.add("active");
    });
  } catch (e) {}
})();
