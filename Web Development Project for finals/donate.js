// donate.js
// Connects donate.html UI (cards + modal) to Firebase Firestore.
// - All donations + My donations loaded from "donations" collection
// - Modal content & buttons wired to database
// - Form posts new donations (and can edit existing)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  limit,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

/* ========== CONFIG ========== */
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

const PH_DATA_URL =
  "https://raw.githubusercontent.com/flores-jacob/philippine-regions-provinces-cities-municipalities-barangays/master/philippine_provinces_cities_municipalities_and_barangays_2019v2.json";

const CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
const CLOUDINARY_UPLOAD_PRESET = "donormedix";

/* ========== FIREBASE INIT ========== */
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ========== SMALL HELPERS ========== */
const $ = (sel) => document.querySelector(sel);

/* ========== STATE ========== */
let currentUser = null;
let unsubAllDonations = null;
let unsubMyDonations = null;
let unsubUserDoc = null; // for profile modal "users" doc listener
let unsubEvents = null;  // for notifications

let allDonationsData = [];  // all documents from Firestore
let myDonationsData = [];   // current user’s documents

let editingDonationId = null; // when editing via modal "Edit" → form

// Notifications UI
let bellBtn = null;
let bellBadge = null;
let notifDropdown = null;

/* ========== DOM ========== */
const pills = Array.from(document.querySelectorAll(".pill"));
const createPanel = document.getElementById("create-panel");
const allDonationsPanel = document.getElementById("all-donations-panel");
const myDonationsPanel = document.getElementById("my-donations-panel");
const sidebar = document.getElementById("pageSidebar");
const mainGrid = document.getElementById("mainGrid");

// Lists
const allDonationsList = document.getElementById("allDonationsList");
const myDonationsList = document.getElementById("myDonationsList");

// Counts / stats
const allDonationsCount = document.getElementById("allDonationsCount");
const myDonationsCount = document.getElementById("myDonationsCount");
const youDonations = document.getElementById("youDonations");
const youImpactPeople = document.getElementById("youImpactPeople");
const allDonationsStat = document.getElementById("allDonations");
const peopleHelpedStat = document.getElementById("peopleHelped");

// Filters
const filterCategory = document.getElementById("filterCategory");
const filterUrgency = document.getElementById("filterUrgency");

// Form
const donationForm = document.getElementById("donationForm");
const quantitySelect = document.getElementById("quantity");
const medicinesList = document.getElementById("medicinesList");
const imagePreview = document.getElementById("imagePreview");
const imageUrlInput = document.getElementById("imageUrl");
const cloudinaryUploadBtn = document.getElementById("cloudinaryUploadBtn");
const btnBack = document.getElementById("btnBack");

// Header sign/profile button
const signInBtn = document.querySelector(".sign-in-btn");

/* ========== MODAL (donation details) ========== */
const modal = document.getElementById("dmModal");
const modalTypeLabel = document.getElementById("modalTypeLabel");
const modalName = document.getElementById("modalName");
const modalCategoryChip = document.getElementById("modalCategoryChip");
const modalDosage = document.getElementById("modalDosage");
const modalQuantity = document.getElementById("modalQuantity");
const modalExpiration = document.getElementById("modalExpiration");
const modalCondition = document.getElementById("modalCondition");
const modalUrgency = document.getElementById("modalUrgency");
const modalLocation = document.getElementById("modalLocation");
const modalDescription = document.getElementById("modalDescription");
const modalImage = document.getElementById("modalImage");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalEditBtn = document.getElementById("modalEditBtn");
const modalDeleteBtn = document.getElementById("modalDeleteBtn");
const modalMessageBtn = document.getElementById("modalMessageBtn");

// Availability buttons in modal
const modalStatusAvailable = document.getElementById("modalStatusAvailable");
const modalStatusUnavailable = document.getElementById("modalStatusUnavailable");

// Image viewer
let imageViewerEl = null;
let imageViewerImageEl = null;
let imageViewerCloseBtn = null;

let activeDonation = null;
let activeIsMine = false;

/* ========== UTILS ========== */
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  } else {
    console.info("Toast:", msg);
  }
}
function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
function capitalize(str = "") {
  if (!str) return "";
  return str[0].toUpperCase() + str.slice(1);
}

// --- Extra helpers for notifications (from home.js) ---
const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
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
    ({ "&": "&amp;", "<": "&lt;", ">": "&lt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

/* ========== ICONS (simple + relevant) ========== */

// user
const ICON_USER_PATH =
  "M12 2a4 4 0 1 1-4 4 4 4 0 0 1 4-4Zm0 8c-3.31 0-6 1.79-6 4v2h12v-2c0-2.21-2.69-4-6-4Z";

// pills / category / dosage
const ICON_PILLS_PATH =
  "M7 3a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4Zm0 2A2 2 0 0 0 5 7v2h4V7a2 2 0 0 0-2-2Zm10-.5A3.5 3.5 0 0 1 20.5 8v4A3.5 3.5 0 0 1 17 15.5 3.5 3.5 0 0 1 13.5 12V8A3.5 3.5 0 0 1 17 4.5Zm0 2A1.5 1.5 0 0 0 15.5 8v1H18V8A1.5 1.5 0 0 0 17 6.5Z";

// box / quantity
const ICON_BOX_PATH =
  "M4 7.5 12 3l8 4.5V17l-8 4-8-4V7.5Zm2 .35V16l6 3 6-3V7.85L12 11 6 7.85Z";

// clock / time
const ICON_CLOCK_PATH =
  "M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm1 5h-2v6h5v-2h-3Z";

// shield / condition
const ICON_SHIELD_PATH =
  "M12 2 5 5v6a9 9 0 0 0 7 8.7A9 9 0 0 0 19 11V5Zm0 2.2 4 1.9v4.9a7 7 0 0 1-4 6.18A7 7 0 0 1 8 11V6.1ZM11 12.6l-1.5-1.5-1.4 1.4L11 15l4.9-4.9-1.4-1.4Z";

// location
const ICON_LOCATION_PATH =
  "M12 2a6 6 0 0 0-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 0 0-6-6Zm0 3a3 3 0 1 1-3 3 3 3 0 0 1 3-3Z";

// check-circle / availability ok
const ICON_CHECK_CIRCLE_PATH =
  "M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm-1 13.59-3.29-3.3 1.42-1.41L11 13.17l4.88-4.88 1.42 1.42Z";

// x-circle / availability not ok
const ICON_X_CIRCLE_PATH =
  "M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm3.3 13.3-1.4 1.4L12 13.41 10.1 15.7l-1.4-1.4L10.59 12 8.7 10.1l1.4-1.4L12 10.59l1.9-1.9 1.4 1.4L13.41 12Z";

function svgIcon(pathD, size = 16) {
  return `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">
      <path d="${pathD}"/>
    </svg>
  `;
}

const SVG_USER_16 = svgIcon(ICON_USER_PATH, 16);
const SVG_PILLS_14 = svgIcon(ICON_PILLS_PATH, 14);
const SVG_BOX_14 = svgIcon(ICON_BOX_PATH, 14);
const SVG_CLOCK_14 = svgIcon(ICON_CLOCK_PATH, 14);
const SVG_SHIELD_14 = svgIcon(ICON_SHIELD_PATH, 14);
const SVG_LOCATION_14 = svgIcon(ICON_LOCATION_PATH, 14);
const SVG_CHECK_14 = svgIcon(ICON_CHECK_CIRCLE_PATH, 14);
const SVG_X_14 = svgIcon(ICON_X_CIRCLE_PATH, 14);

// Create a badge span with small icon + text
function createBadge(text, type) {
  if (!text) return null;
  const span = document.createElement("span");
  let extraClass = "";
  if (type === "urgency-high") extraClass = " badge-urgency-high";
  else if (type === "urgency-medium") extraClass = " badge-urgency-medium";
  else if (type === "urgency-low") extraClass = " badge-urgency-low";
  else if (type === "availability-available") extraClass = " badge-availability-available";
  else if (type === "availability-unavailable") extraClass = " badge-availability-unavailable";

  span.className = "badge" + extraClass;

  const iconSpan = document.createElement("span");
  iconSpan.className = "badge-icon";

  if (type && type.startsWith("urgency")) {
    iconSpan.innerHTML = SVG_CLOCK_14;
  } else if (type === "availability-available") {
    iconSpan.innerHTML = SVG_CHECK_14;
  } else if (type === "availability-unavailable") {
    iconSpan.innerHTML = SVG_X_14;
  } else {
    iconSpan.innerHTML = SVG_PILLS_14;
  }

  const textNode = document.createTextNode(text);

  span.appendChild(iconSpan);
  span.appendChild(textNode);
  return span;
}

// Inline icon + text helper for modal fields
function setInlineIcon(el, svgHtml, text) {
  if (!el) return;
  const value = text && String(text).trim() ? String(text).trim() : "—";
  el.innerHTML = "";
  const iconSpan = document.createElement("span");
  iconSpan.className = "meta-icon";
  iconSpan.innerHTML = svgHtml;
  el.appendChild(iconSpan);
  el.appendChild(document.createTextNode(value));
}

/* ========== PROFILE MODAL (same design as home.js) ========== */
function displayNameFrom(u, data) {
  return (
    (data && data.name) ||
    (u && u.displayName) ||
    (u && u.email ? u.email.split("@")[0] : "Profile")
  );
}
function firstTwo(str = "U") {
  return str.trim().slice(0, 2).toUpperCase();
}

async function getCanonicalUser(u) {
  if (!u) return { name: null, photoURL: null };
  let name = u.displayName || null;
  let photoURL = u.photoURL || null;

  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.name) name = data.name;
      if (data.photoURL) photoURL = data.photoURL;
    }
  } catch (e) {
    console.warn("getCanonicalUser error:", e?.message);
  }
  return { name, photoURL };
}

let profileModal = null;

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
  if (!signInBtn) return;
  const name = displayNameFrom(u, userData);
  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  ensureProfileModal();
  const nm = document.querySelector("#dm_profile_name");
  const em = document.querySelector("#dm_profile_email");
  const av = document.querySelector("#dm_profile_avatar");
  if (nm) nm.textContent = name;
  if (em) em.textContent = u?.email || "";
  if (av) av.textContent = firstTwo(name);

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

/* ========== NOTIFICATIONS (same system as home.js/browse.js) ========== */

function ensureBellButton() {
  // Try to find existing bell button
  bellBtn = document.querySelector(".bell-btn");
  if (bellBtn) return bellBtn;

  const headerActions = document.querySelector(".header-actions");
  if (!headerActions) return null;

  bellBtn = document.createElement("button");
  bellBtn.type = "button";
  bellBtn.className = "bell-btn";
  bellBtn.setAttribute("aria-label", "Notifications");
  bellBtn.style.position = "relative";

  bellBtn.innerHTML = `
    <svg class="bell-icon" viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;display:block;">
      <path d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 1 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
    </svg>
    <span id="dm_notif_badge" style="
      position:absolute;
      top:-4px;
      right:-4px;
      background:#ef4444;
      color:#ffffff;
      border-radius:999px;
      padding:2px 6px;
      font-size:.72rem;
      font-weight:900;
      line-height:1;
      min-width:18px;
      text-align:center;
      border:2px solid #0f172a;
      display:none;
    ">0</span>
  `;

  if (signInBtn && headerActions.contains(signInBtn)) {
    headerActions.insertBefore(bellBtn, signInBtn);
  } else {
    headerActions.appendChild(bellBtn);
  }
  bellBadge = document.getElementById("dm_notif_badge");
  return bellBtn;
}

function ensureBellBadge() {
  if (bellBadge) return bellBadge;
  if (!bellBtn) return null;
  bellBadge = document.getElementById("dm_notif_badge");
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

// Notification meta (type → colors, labels, titles)
function notifMetaFor(ev) {
  const rawType = (ev.type || "").toLowerCase();
  const rawLevel = (ev.level || ev.category || ev.severity || "").toLowerCase();
  const baseKey = rawLevel || rawType || "info";

  let tone = "info";
  if (/success|matched|match|fulfilled|completed|complete|thank/.test(baseKey)) {
    tone = "success";
  } else if (/warn|warning|expiry|expir|urgent|pickup|deadline|reminder/.test(baseKey)) {
    tone = "warning";
  } else if (/error|issue|problem|failed|fail|safety|alert|expired/.test(baseKey)) {
    tone = "error";
  } else {
    tone = "info";
  }

  const toneConfig = {
    success: {
      color: "#16a34a",
      softBg: "#dcfce7",
      label: "Success",
    },
    info: {
      color: "#0284c7",
      softBg: "#e0f2fe",
      label: "Info",
    },
    warning: {
      color: "#eab308",
      softBg: "#fef9c3",
      label: "Warning",
    },
    error: {
      color: "#dc2626",
      softBg: "#fee2e2",
      label: "Urgent",
    },
  }[tone];

  let title = ev.title || "";
  const t = rawType;

  if (!title) {
    if (/donation/.test(t) && /match/.test(t)) {
      title = "Donation Matched!";
    } else if (/request/.test(t) && /fulfill/.test(t)) {
      title = "Request Fulfilled!";
    } else if (/exchange/.test(t) && /complete/.test(t)) {
      title = "Exchange Completed!";
    } else if (/expiry|expir/.test(t)) {
      title = "Expiry Reminder";
    } else if (/message|chat/.test(t)) {
      title = "New Message";
    } else if (/pickup/.test(t)) {
      title = "Pickup Reminder";
    } else if (/alert|safety/.test(t)) {
      title = "Safety Alert";
    } else if (/account|verify/.test(t)) {
      title = "Account Update";
    } else if (/request/.test(t) && /new/.test(t)) {
      title = "New Request Available";
    } else {
      title = toneConfig.label + " Notification";
    }
  }

  return {
    tone,
    title,
    color: toneConfig.color,
    softBg: toneConfig.softBg,
    label: toneConfig.label,
  };
}

// Icon per event
function iconForEvent(ev, meta) {
  const baseSvg = `width:16px;height:16px;display:block;`;
  const t = (ev.type || "").toLowerCase();

  if (meta.tone === "info" || /message|chat|request/.test(t)) {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"/>
      </svg>
    `;
  }

  if (meta.tone === "success") {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 16.6 5.4 12.5l1.4-1.4 2.7 2.7 7.7-7.7 1.4 1.4-9.1 9.1Z"/>
      </svg>
    `;
  }

  if (meta.tone === "warning") {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 1 21h22L12 2Zm1 13h-2v-2h2Zm0-4h-2V9h2Z"/>
      </svg>
    `;
  }

  return `
    <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 11h-2V7h2Zm0 4h-2v-2h2Z"/>
    </svg>
  `;
}

function ensureNotifDropdown() {
  if (notifDropdown) return notifDropdown;

  notifDropdown = document.createElement("div");
  notifDropdown.id = "dm_notif_dropdown";
  Object.assign(notifDropdown.style, {
    position: "fixed",
    zIndex: "1000",
    right: "16px",
    top: "64px",
    width: "min(92vw, 320px)",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    boxShadow: "0 16px 44px rgba(15,23,42,.25)",
    display: "none",
    overflow: "hidden",
    maxHeight: "70vh",
  });

  notifDropdown.innerHTML = `
    <div style="
      padding:10px 14px;
      border-bottom:1px solid #e5e7eb;
      background:#f8fafc;
      display:flex;
      align-items:center;
      justify-content:space-between;
    ">
      <div style="font-size:.9rem;font-weight:700;color:#0f172a;">Notifications</div>
      <span id="dm_notif_count_pill" style="
        font-size:.8rem;
        color:#64748b;
      ">0</span>
    </div>

    <div id="dm_notif_list" style="padding:4px 0; overflow:auto; background:#ffffff;">
      <div style="padding:10px 14px; color:#64748b; font-size:.85rem;">
        No notifications yet. When your donations and requests get activity, they’ll appear here.
      </div>
    </div>

    <button id="dm_notif_footer" style="
      width:100%;
      border:none;
      border-top:1px solid #e5e7eb;
      background:#f9fafb;
      padding:8px 10px;
      font-size:.8rem;
      font-weight:600;
      color:#0284c7;
      cursor:pointer;
    ">
      View all notifications
    </button>
  `;
  document.body.appendChild(notifDropdown);

  document.getElementById("dm_notif_footer").addEventListener("click", () => {
    notifDropdown.style.display = "none";
  });

  document.addEventListener("click", (e) => {
    if (notifDropdown.style.display === "none") return;
    if (notifDropdown.contains(e.target)) return;
    if (bellBtn && (e.target === bellBtn || bellBtn.contains(e.target))) return;
    notifDropdown.style.display = "none";
  });

  document.addEventListener("keydown", (e) => {
    if (notifDropdown.style.display !== "none" && e.key === "Escape")
      notifDropdown.style.display = "none";
  });

  return notifDropdown;
}

function showNotifDropdown() {
  ensureNotifDropdown();
  notifDropdown.style.display = "block";
  setBellCount(0);
}
function hideNotifDropdown() {
  if (notifDropdown) notifDropdown.style.display = "none";
}

function renderEventsList(items) {
  ensureNotifDropdown();
  const list = document.getElementById("dm_notif_list");
  const pill = document.getElementById("dm_notif_count_pill");
  if (!list || !pill) return;

  if (!items || !items.length) {
    list.innerHTML = `
      <div style="padding:10px 10px; color:#64748b; font-size:.85rem;">
        No notifications yet. When your donations and requests get activity, they’ll appear here.
      </div>
    `;
    pill.textContent = "0 notifications";
    return;
  }

  const unreadCount = items.filter((i) => !i.read).length;
  pill.textContent = unreadCount
    ? `${unreadCount} new • ${items.length} total`
    : `${items.length} notifications`;

  list.innerHTML = items
    .map((ev) => {
      const meta = notifMetaFor(ev);
      const iconSvg = iconForEvent(ev, meta);
      const when = ev.createdAt
        ? timeAgo(ev.createdAt.toDate ? ev.createdAt.toDate() : ev.createdAt)
        : "";
      const msg = ev.message || "";
      const title = meta.title;
      const softCircleBg = meta.softBg;

      return `
      <div style="
        padding:12px 12px;
        margin: 6 36px;
        border-bottom:1px solid #f1f5f9;
        cursor:pointer;
        border-radius:8px;
      " data-id="${ev.id}">
        <div style="display:flex; gap:10px;">
          <div style="
            flex-shrink:0;
            width:32px;
            height:32px;
            border-radius:999px;
            background:${softCircleBg};
            display:grid;
            place-items:center;
            color:${meta.color};
          ">
            ${iconSvg}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="
              display:flex;
              justify-content:space-between;
              align-items:center;
              margin-bottom:2px;
            ">
              <div style="
                font-size:.85rem;
                font-weight:600;
                color:#0f172a;
                overflow:hidden;
                text-overflow:ellipsis;
                white-space:nowrap;
              ">${escapeHtml(title)}</div>
              <div style="
                font-size:.75rem;
                color:#94a3b8;
                flex-shrink:0;
                margin-left:8px;
              ">${when}</div>
            </div>
            ${
              msg
                ? `<div style="font-size:.8rem;color:#475569;line-height:1.35;">
                     ${escapeHtml(msg)}
                   </div>`
                : ""
            }
          </div>
        </div>
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
      } catch (e) {
        console.warn("single notif mark read error:", e?.message);
      }
      hideNotifDropdown();
    };
  });
}

function listenToEvents(u) {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }

  if (!u) {
    renderEventsList([]);
    setBellCount(0);
    return;
  }

  try {
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
            level: data.level || data.category || data.severity || null,
            title: data.title || null,
          });
        });
        renderEventsList(items);
        const unread = items.filter((i) => !i.read).length;
        setBellCount(unread);
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

/* ========== LOCATION DROPDOWNS (PH) ========== */
let PH_DATA = null;
let phDataPromise = null;

async function loadPhData() {
  if (PH_DATA) return PH_DATA;
  if (phDataPromise) return phDataPromise;

  phDataPromise = fetch(PH_DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error("Failed to fetch PH data");
      return r.json();
    })
    .then((json) => {
      PH_DATA = json;
      return PH_DATA;
    })
    .catch((err) => {
      console.warn("PH data error", err);
      PH_DATA = null;
      phDataPromise = null;
      return null;
    });

  return phDataPromise;
}

function clearSelect(sel, placeholder) {
  if (!sel) return;
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = placeholder;
  sel.appendChild(opt);
}

function initLocationDropdowns() {
  const selRegion = document.getElementById("selRegion");
  const selProvince = document.getElementById("selProvince");
  const selCityMun = document.getElementById("selCityMun");
  const selBarangay = document.getElementById("selBarangay");
  if (!selRegion || !selProvince || !selCityMun || !selBarangay) return;

  clearSelect(selRegion, "Select Region…");
  clearSelect(selProvince, "Select Province…");
  clearSelect(selCityMun, "Select City/Municipality…");
  clearSelect(selBarangay, "Select Barangay…");

  selRegion.disabled = false;
  selProvince.disabled = true;
  selCityMun.disabled = true;
  selBarangay.disabled = true;

  loadPhData().then((data) => {
    if (!data) return;
    Object.entries(data).forEach(([regionCode, regionObj]) => {
      if (!regionObj) return;
      const opt = document.createElement("option");
      opt.value = regionCode;
      opt.textContent = regionObj.region_name || regionCode;
      selRegion.appendChild(opt);
    });
  });

  selRegion.addEventListener("change", () => {
    const regionCode = selRegion.value;
    clearSelect(selProvince, "Select Province…");
    clearSelect(selCityMun, "Select City/Municipality…");
    clearSelect(selBarangay, "Select Barangay…");
    selProvince.disabled = true;
    selCityMun.disabled = true;
    selBarangay.disabled = true;

    if (!regionCode || !PH_DATA || !PH_DATA[regionCode]) return;
    const regionObj = PH_DATA[regionCode];
    const provinces = regionObj.province_list || {};
    Object.keys(provinces).forEach((pName) => {
      const o = document.createElement("option");
      o.value = pName;
      o.textContent = pName;
      selProvince.appendChild(o);
    });
    selProvince.disabled = false;
  });

  selProvince.addEventListener("change", () => {
    const regionCode = selRegion.value;
    const provName = selProvince.value;
    clearSelect(selCityMun, "Select City/Municipality…");
    clearSelect(selBarangay, "Select Barangay…");
    selCityMun.disabled = true;
    selBarangay.disabled = true;

    if (!regionCode || !provName || !PH_DATA) return;
    const regionObj = PH_DATA[regionCode];
    if (!regionObj || !regionObj.province_list || !regionObj.province_list[provName]) return;

    const municipalityList = regionObj.province_list[provName].municipality_list || {};
    Object.keys(municipalityList).forEach((mName) => {
      const o = document.createElement("option");
      o.value = mName;
      o.textContent = mName;
      selCityMun.appendChild(o);
    });
    selCityMun.disabled = false;
  });

  selCityMun.addEventListener("change", () => {
    const selRegion2 = document.getElementById("selRegion");
    const selProvince2 = document.getElementById("selProvince");
    const selCityMun2 = document.getElementById("selCityMun");
    const selBarangay2 = document.getElementById("selBarangay");

    const regionCode = selRegion2.value;
    const provName = selProvince2.value;
    const munName = selCityMun2.value;

    clearSelect(selBarangay2, "Select Barangay…");
    selBarangay2.disabled = true;

    if (!regionCode || !provName || !munName || !PH_DATA) return;
    const regionObj = PH_DATA[regionCode];
    const provinceObj = regionObj && regionObj.province_list && regionObj.province_list[provName];
    const municipalityObj = provinceObj && provinceObj.municipality_list && provinceObj.municipality_list[munName];
    const brgyList = (municipalityObj && municipalityObj.barangay_list) || [];

    brgyList.forEach((b) => {
      const o = document.createElement("option");
      o.value = b;
      o.textContent = b;
      selBarangay2.appendChild(o);
    });
    selBarangay2.disabled = brgyList.length === 0;
  });
}

/* ========== CLOUDINARY UPLOAD ========== */
function setupCloudinaryUpload() {
  if (!cloudinaryUploadBtn || !imageUrlInput) return;

  function initWidget() {
    if (!window.cloudinary || !window.cloudinary.createUploadWidget) {
      setupFileFallback();
      return;
    }
    const widget = window.cloudinary.createUploadWidget(
      {
        cloudName: CLOUDINARY_CLOUD_NAME,
        uploadPreset: CLOUDINARY_UPLOAD_PRESET,
        multiple: false,
        maxFiles: 1,
        folder: "donormedix_donations",
        sources: ["local", "camera", "url"],
      },
      (err, result) => {
        if (err) {
          console.warn("Cloudinary error", err);
          showToast("Image upload failed.");
          return;
        }
        if (result && result.event === "success") {
          const url = result.info.secure_url;
          imageUrlInput.value = url;
          if (imagePreview) {
            imagePreview.src = url;
            imagePreview.style.display = "block";
          }
        }
      }
    );

    cloudinaryUploadBtn.addEventListener("click", (e) => {
      e.preventDefault();
      widget.open();
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    initWidget();
  } else {
    window.addEventListener("load", initWidget);
  }
}

function setupFileFallback() {
  if (!cloudinaryUploadBtn || !imageUrlInput) return;
  cloudinaryUploadBtn.textContent = "Choose image";

  let fileInput = document.getElementById("_donor_file_input");
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    fileInput.id = "_donor_file_input";
    document.body.appendChild(fileInput);
  }

  cloudinaryUploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageUrlInput.value = reader.result;
      if (imagePreview) {
        imagePreview.src = reader.result;
        imagePreview.style.display = "block";
      }
    };
    reader.readAsDataURL(file);
  });
}

/* ========== FORM HELPERS ========== */
function populateQuantity() {
  if (!quantitySelect) return;
  quantitySelect.innerHTML = "";
  for (let i = 1; i <= 50; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    quantitySelect.appendChild(opt);
  }
  quantitySelect.value = "1";
}

function populateMedicinesDatalist() {
  if (!medicinesList) return;
  const samples = [
    "Paracetamol 500 mg",
    "Ibuprofen 200 mg",
    "Amoxicillin 500 mg",
    "Cetirizine 10 mg",
    "Azithromycin 250 mg",
    "Salbutamol Inhaler",
  ];
  medicinesList.innerHTML = "";
  samples.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    medicinesList.appendChild(opt);
  });
}

/* ========== SWITCHER (All / Mine / Create) ========== */
function showPanel(view) {
  if (!createPanel || !allDonationsPanel || !myDonationsPanel || !sidebar || !mainGrid) return;

  createPanel.style.display = "none";
  allDonationsPanel.style.display = "none";
  myDonationsPanel.style.display = "none";
  sidebar.style.display = "none";
  mainGrid.classList.remove("has-sidebar");

  if (view === "create") {
    createPanel.style.display = "block";
    sidebar.style.display = "block";
    mainGrid.classList.add("has-sidebar");
  } else if (view === "all") {
    allDonationsPanel.style.display = "block";
  } else if (view === "mine") {
    myDonationsPanel.style.display = "block";
  }
}

function initSwitcher() {
  showPanel("create");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const view = pill.getAttribute("data-view");
      showPanel(view);
      if (view === "all") {
        renderAllDonations();
      } else if (view === "mine") {
        renderMyDonations();
      }
    });
  });
}

/* ========== AVAILABILITY HELPERS ========== */
function isDonationAvailable(d) {
  if (!d) return true;

  const rawStatus = (d.status || "").toString().toLowerCase().trim();
  if (rawStatus === "unavailable" || rawStatus === "not available") return false;
  if (rawStatus === "available") return true;

  if (typeof d.available === "boolean") {
    return d.available;
  }

  if (typeof d.quantity === "number") {
    return d.quantity > 0;
  }

  return true;
}

/* ========== NORMALIZE FIRESTORE DONATION ========== */
function normalizeDonation(raw) {
  const d = raw || {};
  const createdAt = d.createdAt && d.createdAt.toDate
    ? d.createdAt.toDate()
    : (d.createdAt || d.createdAtIso ? new Date(d.createdAt || d.createdAtIso) : new Date());
  const expiry = d.expiryDate && d.expiryDate.toDate
    ? d.expiryDate.toDate()
    : (d.expiryDate ? new Date(d.expiryDate) : null);

  let status = (d.status || "").toString().toLowerCase().trim();
  if (!status) {
    if (typeof d.available === "boolean") {
      status = d.available ? "available" : "unavailable";
    } else if (typeof d.quantity === "number") {
      status = d.quantity > 0 ? "available" : "unavailable";
    } else {
      status = "available";
    }
  }

  return {
    id: d.id || d.docId || null,
    medicineName: d.medicineName || "",
    description: d.description || "",
    imageUrl: d.imageUrl || "",
    quantity: d.quantity || 0,
    expiryDate: expiry ? expiry.toISOString() : "",
    urgency: d.urgency || "",
    category: d.category || "",
    pickupLocation: d.pickupLocation || "",
    condition: d.condition || "",
    dosageForm: d.dosageForm || "",
    userId: d.userId || null,
    donorName: d.donorName || d.name || "",
    createdAt: createdAt.toISOString(),
    status,
  };
}

/* ========== CARD RENDERING ========== */
function mapDosageLabel(code) {
  if (!code) return "—";
  const map = {
    "tablets-capsules": "Tablets/Capsules",
    "oral-liquid": "Oral liquid (syrup)",
    "reconstituted-suspension": "Reconstituted antibiotic (suspension)",
    "cream-ointment-tube": "Cream/Ointment (tube)",
    "cream-ointment-tub": "Cream/Ointment (tub)",
    "eye-ear-nose-drops": "Eye/Ear/Nose drops",
    insulin: "Insulin (vial/pen)",
    inhaler: "Inhaler",
    ors: "Oral rehydration salts",
    other: "Other",
  };
  return map[code] || code;
}

function mapUrgencyLabel(u) {
  if (!u) return "—";
  return capitalize(u);
}

function createDonationCard(donation, isMine) {
  const d = donation;
  const available = isDonationAvailable(d);
  const normalizedStatus = d.status || (available ? "available" : "unavailable");

  const card = document.createElement("article");
  card.className = "card";

  card.dataset.owner = isMine ? "me" : "other";
  card.dataset.name = d.medicineName || "";
  card.dataset.category = d.category || "";
  card.dataset.dosage = mapDosageLabel(d.dosageForm || "");
  card.dataset.description = d.description || "";
  card.dataset.quantity = d.quantity ? `${d.quantity}` : "";
  card.dataset.expiration = d.expiryDate ? formatDate(d.expiryDate) : "";
  card.dataset.condition = d.condition || "";
  card.dataset.urgency = d.urgency || "";
  card.dataset.location = d.pickupLocation || "";
  card.dataset.image = d.imageUrl || "placeholder-medicine.jpg";
  card.dataset.donationId = d.id || "";
  card.dataset.status = normalizedStatus;

  const body = document.createElement("div");
  body.className = "card__body";

  const title = document.createElement("h3");
  title.className = "title";
  title.textContent = d.medicineName || "Medicine";

  const small = document.createElement("p");
  small.className = "muted";

  const metaSpan = document.createElement("span");
  metaSpan.className = "meta-icon";
  metaSpan.innerHTML = SVG_USER_16;
  small.appendChild(metaSpan);

  if (isMine) {
    small.appendChild(
      document.createTextNode(`My donation · Created ${formatDate(d.createdAt)}`)
    );
  } else {
    const name = d.donorName || "Anonymous donor";
    small.appendChild(document.createTextNode(`Donated by ${name}`));
  }

  body.appendChild(title);
  body.appendChild(small);

  const cardMeta = document.createElement("div");
  cardMeta.className = "card-meta";

  const catText = d.category || "Other";
  const urgencyRaw = (d.urgency || "").toString().toLowerCase();
  let urgencyLabel = "";
  let urgencyType = "";

  if (urgencyRaw === "high") {
    urgencyLabel = "High urgency";
    urgencyType = "urgency-high";
  } else if (urgencyRaw === "medium") {
    urgencyLabel = "Medium urgency";
    urgencyType = "urgency-medium";
  } else if (urgencyRaw === "low") {
    urgencyLabel = "Low urgency";
    urgencyType = "urgency-low";
  } else if (d.urgency) {
    urgencyLabel = d.urgency;
  }

  const catBadge = createBadge(catText, "category");
  const urgBadge = urgencyLabel
    ? createBadge(urgencyLabel, urgencyType || "category")
    : null;

  const availabilityLabel = available ? "Available" : "Not available";
  const availabilityType = available
    ? "availability-available"
    : "availability-unavailable";
  const availabilityBadge = createBadge(availabilityLabel, availabilityType);

  if (catBadge) cardMeta.appendChild(catBadge);
  if (urgBadge) cardMeta.appendChild(urgBadge);
  if (availabilityBadge) cardMeta.appendChild(availabilityBadge);

  if (cardMeta.childNodes.length > 0) {
    body.appendChild(cardMeta);
  }

  const footer = document.createElement("div");
  footer.className = "card__footer";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "card__btn-open";
  btn.textContent = "Open";
  btn.addEventListener("click", () => openDonationModalFromData(d, isMine));
  footer.appendChild(btn);

  card.appendChild(body);
  card.appendChild(footer);

  return card;
}

/* ========== FILTERING (ALL DONATIONS) ========== */
function getFilterValues() {
  return {
    category: filterCategory ? filterCategory.value : "",
    urgency: filterUrgency ? filterUrgency.value : "",
  };
}

function applyFiltersToAll() {
  const filters = getFilterValues();
  return allDonationsData.filter((d) => {
    if (filters.category && d.category !== filters.category) return false;
    if (filters.urgency && d.urgency !== filters.urgency) return false;
    return true;
  });
}

/* ========== RENDER ALL & MY DONATIONS ========== */
function renderAllDonations() {
  if (!allDonationsList) return;
  allDonationsList.innerHTML = "";

  const filtered = applyFiltersToAll();

  if (allDonationsCount) {
    if (!filtered.length) {
      allDonationsCount.textContent = "No donations found";
    } else {
      allDonationsCount.textContent = `Showing ${filtered.length} community donations`;
    }
  }

  filtered.forEach((d) => {
    const isMine = currentUser && d.userId === currentUser.uid;
    const card = createDonationCard(d, isMine);
    allDonationsList.appendChild(card);
  });

  if (allDonationsStat) allDonationsStat.textContent = String(allDonationsData.length || 0);
  if (peopleHelpedStat) {
    const helped = Math.max(0, Math.floor((allDonationsData.length || 0) * 2.5));
    peopleHelpedStat.textContent = String(helped);
  }
}

function renderMyDonations() {
  if (!myDonationsList) return;
  // 🔧 FIX: clear as string, not object (removes [object Object])
  myDonationsList.innerHTML = "";

  if (!currentUser) {
    if (myDonationsCount) myDonationsCount.textContent = "Sign in to see your donations";
    const msg = document.createElement("p");
    msg.className = "muted";
    msg.textContent = "Please sign in to view and manage your donations.";
    myDonationsList.appendChild(msg);
    if (youDonations) youDonations.textContent = "0";
    if (youImpactPeople) youImpactPeople.textContent = "0";
    return;
  }

  if (!myDonationsData.length) {
    if (myDonationsCount) myDonationsCount.textContent = "You have no donations yet";
    const msg = document.createElement("p");
    msg.className = "muted";
    msg.textContent = "You haven't posted any donations yet.";
    myDonationsList.appendChild(msg);
    if (youDonations) youDonations.textContent = "0";
    if (youImpactPeople) youImpactPeople.textContent = "0";
    return;
  }

  if (myDonationsCount) {
    myDonationsCount.textContent = `Showing ${myDonationsData.length} of your donations`;
  }

  myDonationsData.forEach((d) => {
    const card = createDonationCard(d, true);
    myDonationsList.appendChild(card);
  });

  if (youDonations) youDonations.textContent = String(myDonationsData.length || 0);
  if (youImpactPeople) {
    const helped = Math.max(0, myDonationsData.length * 2);
    youImpactPeople.textContent = String(helped);
  }
}

/* ========== MODAL + IMAGE VIEWER LOGIC ========== */
function openDonationModalFromData(donation, isMine) {
  if (!modal) return;

  activeDonation = donation;
  activeIsMine = !!isMine;

  const available = isDonationAvailable(donation);
  const normalizedStatus = donation.status || (available ? "available" : "unavailable");

  modalTypeLabel.textContent = available
    ? "Donation · Available"
    : "Donation · Not available";

  modalName.textContent = donation.medicineName || "Medicine";

  if (modalCategoryChip) {
    modalCategoryChip.innerHTML = "";
    const iconSpan = document.createElement("span");
    iconSpan.className = "badge-icon";
    iconSpan.innerHTML = SVG_PILLS_14;
    modalCategoryChip.appendChild(iconSpan);
    modalCategoryChip.appendChild(
      document.createTextNode(donation.category || "Category")
    );
  }

  setInlineIcon(
    modalDosage,
    SVG_PILLS_14,
    mapDosageLabel(donation.dosageForm || "")
  );
  setInlineIcon(
    modalQuantity,
    SVG_BOX_14,
    donation.quantity ? String(donation.quantity) : "—"
  );
  setInlineIcon(
    modalExpiration,
    SVG_CLOCK_14,
    donation.expiryDate ? formatDate(donation.expiryDate) : "—"
  );
  setInlineIcon(
    modalCondition,
    SVG_SHIELD_14,
    donation.condition || "—"
  );
  setInlineIcon(
    modalUrgency,
    SVG_CLOCK_14,
    mapUrgencyLabel(donation.urgency)
  );
  setInlineIcon(
    modalLocation,
    SVG_LOCATION_14,
    donation.pickupLocation || "—"
  );

  modalDescription.textContent = donation.description || "No description provided.";

  modalImage.src = donation.imageUrl || "placeholder-medicine.jpg";
  modalImage.alt = donation.medicineName || "Medicine image";

  const isOwner = activeIsMine && currentUser && donation.userId === currentUser.uid;

  if (isOwner) {
    modalEditBtn.style.display = "inline-flex";
    modalDeleteBtn.style.display = "inline-flex";
    modalMessageBtn.style.display = "none";
  } else {
    modalEditBtn.style.display = "none";
    modalDeleteBtn.style.display = "none";
    modalMessageBtn.style.display = "inline-flex";

    if (!available) {
      modalMessageBtn.textContent = "Not available";
      modalMessageBtn.disabled = true;
    } else {
      modalMessageBtn.textContent = "Message";
      modalMessageBtn.disabled = false;
    }
  }

  if (modalStatusAvailable && modalStatusUnavailable) {
    modalStatusAvailable.classList.toggle(
      "modal-btn-status--active",
      normalizedStatus === "available"
    );
    modalStatusUnavailable.classList.toggle(
      "modal-btn-status--active",
      normalizedStatus === "unavailable"
    );

    modalStatusAvailable.disabled = !isOwner;
    modalStatusUnavailable.disabled = !isOwner;
  }

  modal.removeAttribute("hidden");
}

function closeModal() {
  if (!modal) return;
  if (!modal.hasAttribute("hidden")) {
    modal.setAttribute("hidden", "hidden");
  }
}

function closeImageViewer() {
  if (!imageViewerEl) return;
  if (!imageViewerEl.hasAttribute("hidden")) {
    imageViewerEl.setAttribute("hidden", "hidden");
    if (imageViewerImageEl) {
      imageViewerImageEl.src = "";
      imageViewerImageEl.alt = "";
    }
  }
}

function openImageViewer() {
  if (!modalImage || !imageViewerEl || !imageViewerImageEl) return;
  imageViewerImageEl.src = modalImage.src;
  imageViewerImageEl.alt = modalImage.alt || "Medicine full view";
  imageViewerEl.removeAttribute("hidden");
}

function initModal() {
  if (!modal) return;

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  imageViewerEl = document.getElementById("imageViewer");
  imageViewerImageEl = document.getElementById("imageViewerImg");
  imageViewerCloseBtn = document.getElementById("imageViewerClose");

  if (modalImage && imageViewerEl && imageViewerImageEl) {
    modalImage.style.cursor = "zoom-in";
    modalImage.addEventListener("click", openImageViewer);
  }

  if (imageViewerCloseBtn) {
    imageViewerCloseBtn.addEventListener("click", closeImageViewer);
  }

  if (imageViewerEl) {
    imageViewerEl.addEventListener("click", (e) => {
      if (e.target === imageViewerEl) {
        closeImageViewer();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (imageViewerEl && !imageViewerEl.hasAttribute("hidden")) {
        closeImageViewer();
      } else if (modal && !modal.hasAttribute("hidden")) {
        closeModal();
      }
    }
  });

  // EDIT
  modalEditBtn.addEventListener("click", () => {
    if (!activeDonation || !activeIsMine || !currentUser) return;
    if (activeDonation.userId !== currentUser.uid) {
      showToast("You can only edit your own donations.");
      return;
    }
    if (!donationForm) return;

    editingDonationId = activeDonation.id || null;

    document.getElementById("medicineName").value = activeDonation.medicineName || "";
    document.getElementById("category").value = activeDonation.category || "Other";
    document.getElementById("dosageForm").value = activeDonation.dosageForm || "";
    document.getElementById("description").value = activeDonation.description || "";
    document.getElementById("quantity").value = String(activeDonation.quantity || "1");
    document.getElementById("expiryDate").value = activeDonation.expiryDate
      ? activeDonation.expiryDate.slice(0, 10)
      : "";
    document.getElementById("condition").value = activeDonation.condition || "sealed";
    document.getElementById("urgencyLevel").value = activeDonation.urgency || "medium";

    document.getElementById("locationText").value = "";

    if (imageUrlInput) imageUrlInput.value = activeDonation.imageUrl || "";
    if (imagePreview) {
      if (activeDonation.imageUrl) {
        imagePreview.src = activeDonation.imageUrl;
        imagePreview.style.display = "block";
      } else {
        imagePreview.src = "";
        imagePreview.style.display = "none";
      }
    }

    const submitBtn = donationForm.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Save Changes";

    const pillCreate = document.querySelector(".pill[data-view='create']");
    if (pillCreate) pillCreate.click();

    closeModal();
    setTimeout(() => {
      createPanel.scrollIntoView({ behavior: "smooth" });
    }, 50);
  });

  // DELETE
  modalDeleteBtn.addEventListener("click", async () => {
    if (!activeDonation || !activeIsMine || !currentUser) return;
    if (activeDonation.userId !== currentUser.uid) {
      showToast("You can only delete your own donations.");
      return;
    }
    if (!activeDonation.id) {
      showToast("Missing donation id.");
      return;
    }
    if (!confirm("Delete this donation? This cannot be undone.")) return;

    try {
      await deleteDoc(doc(db, "donations", activeDonation.id));
      showToast("Donation deleted.");
      closeModal();
    } catch (e) {
      console.error("delete donation error", e);
      showToast("Failed to delete donation.");
    }
  });

  // STATUS → AVAILABLE
  if (modalStatusAvailable) {
    modalStatusAvailable.addEventListener("click", async () => {
      if (!activeDonation || !activeIsMine || !currentUser) return;
      if (activeDonation.userId !== currentUser.uid) return;
      if (!activeDonation.id) return;

      try {
        await updateDoc(doc(db, "donations", activeDonation.id), {
          status: "available",
        });

        activeDonation.status = "available";
        allDonationsData = allDonationsData.map((d) =>
          d.id === activeDonation.id ? { ...d, status: "available" } : d
        );
        myDonationsData = myDonationsData.map((d) =>
          d.id === activeDonation.id ? { ...d, status: "available" } : d
        );

        renderAllDonations();
        renderMyDonations();
        openDonationModalFromData(activeDonation, activeIsMine);
        showToast("Marked as available.");
      } catch (e) {
        console.error("update status available error", e);
        showToast("Failed to update status.");
      }
    });
  }

  // STATUS → UNAVAILABLE
  if (modalStatusUnavailable) {
    modalStatusUnavailable.addEventListener("click", async () => {
      if (!activeDonation || !activeIsMine || !currentUser) return;
      if (activeDonation.userId !== currentUser.uid) return;
      if (!activeDonation.id) return;

      try {
        await updateDoc(doc(db, "donations", activeDonation.id), {
          status: "unavailable",
        });

        activeDonation.status = "unavailable";
        allDonationsData = allDonationsData.map((d) =>
          d.id === activeDonation.id ? { ...d, status: "unavailable" } : d
        );
        myDonationsData = myDonationsData.map((d) =>
          d.id === activeDonation.id ? { ...d, status: "unavailable" } : d
        );

        renderAllDonations();
        renderMyDonations();
        openDonationModalFromData(activeDonation, activeIsMine);
        showToast("Marked as not available.");
      } catch (e) {
        console.error("update status unavailable error", e);
        showToast("Failed to update status.");
      }
    });
  }

// MESSAGE
if (modalMessageBtn) {
  modalMessageBtn.addEventListener("click", (e) => {
    e.preventDefault();

    if (!activeDonation || !activeDonation.userId) {
      showToast("Cannot message this donor.");
      return;
    }

    if (!currentUser) {
      showToast("Please sign in to message donors.");
      window.location.href = "auth.html";
      return;
    }

    if (modalMessageBtn.disabled) {
      return;
    }

    // ✅ Build query string manually (no new URL, works on file:// and http)
    const params = new URLSearchParams();
    params.set("chatWith", activeDonation.userId);    // receiver uid
    if (activeDonation.id) {
      params.set("donationId", activeDonation.id);
    }
    if (activeDonation.donorName) {
      params.set("name", activeDonation.donorName);
    }
    if (activeDonation.donorPhoto) {
      params.set("avatar", activeDonation.donorPhoto);
    }

    // ✅ Simple redirect – laging gumagana kahit local file
    window.location.href = "message.html?" + params.toString();
  });
}

}

/* ========== FORM SUBMIT (CREATE / EDIT) ========== */
function setupDonationForm() {
  if (!donationForm) return;

  donationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast("Please sign in to post a donation.");
      window.location.href = "auth.html";
      return;
    }

    const submitBtn = donationForm.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = editingDonationId ? "Saving..." : "Posting...";
    }

    try {
      const medicineName = (document.getElementById("medicineName").value || "").trim();
      const category = (document.getElementById("category").value || "Other").trim();
      const dosageForm = (document.getElementById("dosageForm").value || "").trim();
      const description = (document.getElementById("description").value || "").trim();
      let quantity = parseInt(document.getElementById("quantity").value || "1", 10) || 1;
      const expiryDate = (document.getElementById("expiryDate").value || "").trim();
      const condition = (document.getElementById("condition").value || "").trim();
      const urgency = (document.getElementById("urgencyLevel").value || "medium").trim();
      const imageUrl = (document.getElementById("imageUrl").value || "").trim();

      if (!medicineName) throw new Error("Please enter medicine/item name.");
      if (!description) throw new Error("Please provide a description.");
      if (!expiryDate) throw new Error("Please select expiry date.");
      if (!imageUrl) throw new Error("Please upload an image.");

      const selRegion = document.getElementById("selRegion");
      const selProvince = document.getElementById("selProvince");
      const selCityMun = document.getElementById("selCityMun");
      const selBarangay = document.getElementById("selBarangay");
      const locationText = (document.getElementById("locationText").value || "").trim();

      const regionText = selRegion && selRegion.value ? selRegion.options[selRegion.selectedIndex].text : "";
      const provinceText = selProvince && selProvince.value ? selProvince.options[selProvince.selectedIndex].text : "";
      const cityText = selCityMun && selCityMun.value ? selCityMun.options[selCityMun.selectedIndex].text : "";
      const brgyText = selBarangay && selBarangay.value ? selBarangay.options[selBarangay.selectedIndex].text : "";

      let pickupLocation = [brgyText, cityText, provinceText, regionText].filter(Boolean).join(", ");
      if (locationText) {
        pickupLocation = pickupLocation
          ? `${pickupLocation} — ${locationText}`
          : locationText;
      }

      const baseData = {
        medicineName,
        category,
        dosageForm,
        description,
        quantity,
        expiryDate,
        condition,
        urgency,
        imageUrl,
        pickupLocation,
        region: regionText,
        province: provinceText,
        cityMunicipality: cityText,
        barangay: brgyText,
        status: quantity > 0 ? "available" : "unavailable",
      };

      if (editingDonationId) {
        await updateDoc(doc(db, "donations", editingDonationId), baseData);
        showToast("Donation updated.");
      } else {
        const docData = {
          ...baseData,
          createdAt: serverTimestamp(),
          userId: currentUser.uid,
          donorName:
            currentUser.displayName ||
            (currentUser.email ? currentUser.email.split("@")[0] : "Anonymous"),
          donorPhoto: currentUser.photoURL || null,
        };
        await addDoc(collection(db, "donations"), docData);
        showToast("Donation posted successfully!");
      }

      editingDonationId = null;
      if (submitBtn) submitBtn.textContent = "Submit Donation";
      donationForm.reset();
      populateQuantity();
      if (imagePreview) {
        imagePreview.src = "";
        imagePreview.style.display = "none";
      }
      if (imageUrlInput) imageUrlInput.value = "";

      const pillMine = document.querySelector(".pill[data-view='mine']");
      if (pillMine) pillMine.click();
    } catch (err) {
      console.error("post donation error", err);
      showToast(err.message || "Failed to save donation.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        if (!editingDonationId) submitBtn.textContent = "Submit Donation";
      }
    }
  });

  if (btnBack) {
    btnBack.addEventListener("click", () => {
      if (document.referrer) window.history.back();
      else window.location.href = "browse.html";
    });
  }
}

/* ========== FIRESTORE LISTENERS ========== */
function listenAllDonations() {
  if (unsubAllDonations) {
    unsubAllDonations();
    unsubAllDonations = null;
  }
  try {
    const qAll = query(collection(db, "donations"), orderBy("createdAt", "desc"));
    unsubAllDonations = onSnapshot(
      qAll,
      (snap) => {
        allDonationsData = [];
        snap.forEach((docSnap) => {
          const raw = docSnap.data() || {};
          allDonationsData.push(
            normalizeDonation({
              id: docSnap.id,
              ...raw,
            })
          );
        });
        renderAllDonations();
      },
      (err) => {
        console.error("All donations snapshot error", err);
        allDonationsData = [];
        renderAllDonations();
      }
    );
  } catch (e) {
    console.error("listenAllDonations error", e);
  }
}

function listenMyDonations(uid) {
  if (unsubMyDonations) {
    unsubMyDonations();
    unsubMyDonations = null;
  }

  if (!uid) {
    myDonationsData = [];
    renderMyDonations();
    return;
  }

  try {
    const qMine = query(
      collection(db, "donations"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );

    unsubMyDonations = onSnapshot(
      qMine,
      (snap) => {
        myDonationsData = [];
        snap.forEach((docSnap) => {
          const raw = docSnap.data() || {};
          myDonationsData.push(
            normalizeDonation({
              id: docSnap.id,
              ...raw,
            })
          );
        });
        renderMyDonations();
      },
      async (err) => {
        console.warn("My donations ordered snapshot error, using fallback:", err);

        try {
          if (unsubMyDonations) {
            unsubMyDonations();
            unsubMyDonations = null;
          }

          unsubMyDonations = onSnapshot(
            collection(db, "donations"),
            (snap2) => {
              const arr = [];
              snap2.forEach((docSnap2) => {
                const raw2 = docSnap2.data() || {};
                if (raw2.userId === uid) {
                  arr.push(
                    normalizeDonation({
                      id: docSnap2.id,
                      ...raw2,
                    })
                  );
                }
              });

              arr.sort((a, b) => {
                const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return tb - ta;
              });

              myDonationsData = arr;
              renderMyDonations();
            },
            (err2) => {
              console.error("My donations fallback snapshot error:", err2);
              myDonationsData = [];
              renderMyDonations();
            }
          );
        } catch (fallbackErr) {
          console.error("listenMyDonations fallback setup error:", fallbackErr);
          myDonationsData = [];
          renderMyDonations();
        }
      }
    );
  } catch (e) {
    console.error("listenMyDonations top-level error", e);
    myDonationsData = [];
    renderMyDonations();
  }
}

/* ========== FILTER HOOKS ========== */
function debounce(fn, wait = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function initFilters() {
  const handler = debounce(() => {
    renderAllDonations();
  }, 150);
  if (filterCategory) {
    filterCategory.addEventListener("change", handler);
    filterCategory.addEventListener("input", handler);
  }
  if (filterUrgency) {
    filterUrgency.addEventListener("change", handler);
    filterUrgency.addEventListener("input", handler);
  }
}

/* ========== AUTH HEADER UI ========== */
function updateHeaderForUser(user) {
  if (!signInBtn) return;
  if (!user) {
    renderSignedOut();
  } else {
    updateProfileUI(user, null);
  }
}

/* ========== INIT ========== */
document.addEventListener("DOMContentLoaded", () => {
  initSwitcher();
  initModal();
  initFilters();
  populateQuantity();
  populateMedicinesDatalist();
  initLocationDropdowns();
  setupCloudinaryUpload();
  setupDonationForm();
  listenAllDonations();

  if (signInBtn && !auth.currentUser) {
    renderSignedOut();
  }

  // Notifications bell + dropdown
  ensureBellButton();
  ensureNotifDropdown();
  if (bellBtn) {
    bellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifDropdown || notifDropdown.style.display === "none")
        showNotifDropdown();
      else hideNotifDropdown();
    });
  }

  onAuthStateChanged(auth, (user) => {
    currentUser = user || null;

    if (!user) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      renderSignedOut();
      listenMyDonations(null);
      listenToEvents(null);
    } else {
      listenToUserDoc(user);
      listenMyDonations(user.uid);
      listenToEvents(user);
    }

    updateHeaderForUser(currentUser);
  });
});
