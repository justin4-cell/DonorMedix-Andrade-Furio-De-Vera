// request.js
// DonorMedix · Medicine Requests – connects request.html UI to Firestore

/* ========= Utilities ========= */
var PSGC_BASE = "https://psgc.gitlab.io/api";

function nowStr() {
  var d = new Date();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Relative time (shared by requests + notifications)
const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const diff = (d.getTime() - Date.now()) / 1000; // past -> negative

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

function keyFor(uid, kind) {
  return "dmx_" + kind + "_" + uid;
}
function getArr(uid, kind) {
  try {
    return JSON.parse(localStorage.getItem(keyFor(uid, kind)) || "[]");
  } catch (e) {
    return [];
  }
}
function setArr(uid, kind, arr) {
  localStorage.setItem(keyFor(uid, kind), JSON.stringify(arr));
}

function fetchJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status + " for " + r.url);
    return r.json();
  });
}
function getRegions() {
  return fetchJson(PSGC_BASE + "/regions/");
}
function getProvincesByRegion(regionCode) {
  return fetchJson(PSGC_BASE + "/regions/" + regionCode + "/provinces/").catch(
    function () {
      return fetchJson(PSGC_BASE + "/provinces/").then(function (all) {
        return all.filter(function (p) {
          return p.regionCode === regionCode;
        });
      });
    }
  );
}
function getCitiesMunsByProvince(provCode) {
  return fetchJson(
    PSGC_BASE + "/provinces/" + provCode + "/cities-municipalities/"
  ).catch(function () {
    return fetchJson(PSGC_BASE + "/provinces/" + provCode + "/").then(function (
      prov
    ) {
      return fetchJson(
        PSGC_BASE + "/regions/" + prov.regionCode + "/cities-municipalities/"
      ).then(function (rc) {
        return rc.filter(function (x) {
          return x.provinceCode === provCode;
        });
      });
    });
  });
}
function getBarangaysByCityMun(cm) {
  var code = cm.code || cm.cityCode || cm.municipalityCode;
  return fetchJson(PSGC_BASE + "/cities/" + code + "/barangays/").catch(
    function () {
      return fetchJson(
        PSGC_BASE + "/municipalities/" + code + "/barangays/"
      ).catch(function () {
        return fetchJson(PSGC_BASE + "/barangays/").then(function (all) {
          return all.filter(function (b) {
            return b.cityCode === code || b.municipalityCode === code;
          });
        });
      });
    }
  );
}
function opt(text, value) {
  var o = document.createElement("option");
  o.textContent = text;
  o.value = value;
  return o;
}
function locationFromSelects(selRegion, selProvince, selCityMun, selBarangay) {
  var rn =
    selRegion && selRegion.selectedOptions[0]
      ? selRegion.selectedOptions[0].textContent
      : "";
  var pn =
    selProvince && selProvince.selectedOptions[0]
      ? selProvince.selectedOptions[0].textContent
      : "";
  var cn =
    selCityMun && selCityMun.selectedOptions[0]
      ? selCityMun.selectedOptions[0].textContent
      : "";
  var bn =
    selBarangay && selBarangay.selectedOptions[0]
      ? selBarangay.selectedOptions[0].textContent
      : "";
  var parts = [rn, pn, cn, bn].filter(function (x) {
    return !!x;
  });
  return parts.join(" · ");
}

// Turn any string into a "username-style" label (no full email)
function asUsername(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const at = s.indexOf("@");
  if (at > 0) return s.slice(0, at);
  return s;
}

/* ========= Simple stats state (for footer) ========= */

const statsState = {
  communityCount: 0,
  myCount: 0,
  lastCreatedAtMs: null,
};

function formatDateShort(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function updateStatsUI() {
  const elTotal = document.getElementById("stat-total-requests");
  const elMy = document.getElementById("stat-my-requests");
  const elLast = document.getElementById("stat-last-created");

  if (elTotal) {
    elTotal.textContent = String(statsState.communityCount || 0);
  }
  if (elMy) {
    elMy.textContent = String(statsState.myCount || 0);
  }
  if (elLast) {
    elLast.textContent = formatDateShort(statsState.lastCreatedAtMs);
  }
}

/* ========= Firebase ========= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  where,
  deleteDoc,
  getDoc,
  setDoc,
  limit,
  updateDoc, // ✅ for editing
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

var firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

var app = initializeApp(firebaseConfig);
var db = getFirestore(app);
var auth = getAuth(app);

let currentUser = null;

/* ========= Edit state (global) ========= */
let editingRequestId = null;
let editingRequestData = null;
let uploadedImageUrl = null; // shared between modal + create form

/* ========= Toast + profile helpers ========= */
const toastEl = document.getElementById("toast"); // optional
function showToast(msg) {
  if (!toastEl) {
    alert(msg);
    return;
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function displayNameFrom(u, userData) {
  return (userData && userData.name) || (u && u.displayName) || "Profile";
}
function firstTwo(str = "U") {
  return str.trim().slice(0, 2).toUpperCase();
}

async function getCanonicalUser(u) {
  if (!u) return { name: null, photoURL: null };

  let name = u.displayName || u.email || null;
  let photoURL = u.photoURL || null;

  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.username) {
        name = data.username;
      } else if (data.name) {
        name = data.name;
      } else if (data.displayName) {
        name = data.displayName;
      }
      if (data.photoURL) photoURL = data.photoURL;
    }
  } catch (e) {
    console.warn("getCanonicalUser error:", e?.message);
  }

  // Always store a username-style name (no full email)
  return { name: asUsername(name), photoURL };
}

// HTML escape (for notifications)
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&lt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

/* ========= Cloudinary ========= */
var CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
var CLOUDINARY_UPLOAD_PRESET = "donormedix";

/* ========= Usernames Cache & Batch preload ========= */
const userCache = {}; // uid -> name|string|null

async function preloadUsernames(uids) {
  if (!uids || !uids.length) return;
  const uniq = Array.from(new Set(uids.filter(Boolean)));
  const toFetch = uniq.filter((uid) => !userCache.hasOwnProperty(uid));
  if (!toFetch.length) return;
  try {
    await Promise.all(
      toFetch.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) {
            const data = snap.data() || {};
            const raw =
              (data.username && String(data.username).trim()) ||
              (data.name && String(data.name).trim()) ||
              (data.displayName && String(data.displayName).trim()) ||
              null;
            const cleaned = asUsername(raw);
            userCache[uid] = cleaned || null;
          } else {
            userCache[uid] = null;
          }
        } catch (e) {
          console.warn("preloadUsernames getDoc error for", uid, e);
          userCache[uid] = null;
        }
      })
    );
  } catch (e) {
    console.warn("preloadUsernames error:", e);
  }
}

async function getUsername(uid) {
  if (!uid) return null;
  if (userCache.hasOwnProperty(uid) && userCache[uid]) return userCache[uid];

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      userCache[uid] = null;
      return null;
    }
    const data = snap.data() || {};

    const raw =
      (data.username && String(data.username).trim()) ||
      (data.name && String(data.name).trim()) ||
      (data.displayName && String(data.displayName).trim()) ||
      null;

    const cleaned = asUsername(raw);
    userCache[uid] = cleaned || null;
    return cleaned || null;
  } catch (e) {
    console.error("getUsername error for", uid, e);
    userCache[uid] = null;
    return null;
  }
}

/* ========= Medicine Catalog ========= */
var medicineCatalog = {
  Paracetamol: "Pain Relief",
  Acetaminophen: "Pain Relief",
  Ibuprofen: "Pain Relief",
  Naproxen: "Pain Relief",
  "Mefenamic Acid": "Pain Relief",
  Diclofenac: "Pain Relief",
  Dextromethorphan: "Cough",
  Ambroxol: "Cough",
  Guaifenesin: "Cough",
  Carbocisteine: "Cough",
  Phenylephrine: "Cough",
  Pseudoephedrine: "Cough",
  Butamirate: "Cough",
  Amoxicillin: "Antibiotic",
  "Co-amoxiclav": "Antibiotic",
  "Amoxicillin + Clavulanate": "Antibiotic",
  Azithromycin: "Antibiotic",
  Cefalexin: "Antibiotic",
  Ciprofloxacin: "Antibiotic",
  Metronidazole: "Antibiotic",
  Cetirizine: "Other",
  Loratadine: "Other",
  Fexofenadine: "Other",
  Diphenhydramine: "Other",
  Chlorpheniramine: "Other",
  Omeprazole: "Other",
  Loperamide: "Other",
  ORS: "Other",
  Domperidone: "Other",
  Hyoscine: "Other",
  Buscopan: "Other",
  "Ascorbic Acid": "Other",
  "Vitamin C": "Other",
  Multivitamins: "Other",
  Zinc: "Other",
  Salbutamol: "Other",
  Budesonide: "Other",
  Metformin: "Other",
  Gliclazide: "Other",
  Amlodipine: "Other",
  Losartan: "Other",
};
var medicineListForDatalist = Object.keys(medicineCatalog).sort();

/* ========= Panels / Switcher (header already in HTML) ========= */
var signInBtn;
var bellBtn;
var bellBadge;
var profileModal;
var notifDropdown;
let unsubUserDoc = null;
let unsubEvents = null;

/* ===== PROFILE MODAL (same as other pages) ===== */

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

/* ===== NOTIFICATION BELL + DROPDOWN (same as donate.js) ===== */

function ensureBellButton() {
  // Try existing .bell-btn
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

  const signBtn = document.querySelector(".sign-in-btn");
  if (signBtn && headerActions.contains(signBtn)) {
    headerActions.insertBefore(bellBtn, signBtn);
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

// Map event → tone + title
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

// Icon for notification
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

/* ========= Main Init ========= */

const DEFAULT_MEDICINE_IMAGE =
  "https://images.unsplash.com/photo-1584306670954-dbb2a7e4aa0f?q=80&w=800&auto=format&fit=crop";

/* ==== ICON HELPERS (cards + modal) ==== */

const ICON_USER_PATH =
  "M12 2a5 5 0 1 1-5 5 5 5 0 0 1 5-5Zm0 11c-4.33 0-8 2.17-8 5v1h16v-1c0-2.83-3.67-5-8-5Z";
const ICON_CATEGORY_PATH =
  "M7 3h10a2 2 0 0 1 2 2v6H5V5a2 2 0 0 1 2-2Zm-2 9h14v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5Z";
const ICON_CLOCK_PATH =
  "M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm1 11h4v-2h-3V7h-2v6Z";
const ICON_LOCATION_PATH =
  "M12 2a6 6 0 0 0-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 0 0-6-6Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z";

function svgIcon(pathD) {
  return (
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' +
    pathD +
    '"/></svg>'
  );
}

const SVG_USER = svgIcon(ICON_USER_PATH);
const SVG_CATEGORY = svgIcon(ICON_CATEGORY_PATH);
const SVG_CLOCK = svgIcon(ICON_CLOCK_PATH);
const SVG_LOCATION = svgIcon(ICON_LOCATION_PATH);

// Create a badge span with icon + text (used in cards)
function createBadge(text, type) {
  if (!text) return null;
  const span = document.createElement("span");
  let extraClass = "";
  if (type === "urgency-high") extraClass = " badge-urgency-high";
  else if (type === "urgency-medium") extraClass = " badge-urgency-medium";
  else if (type === "urgency-low") extraClass = " badge-urgency-low";

  span.className = "badge" + extraClass;

  const iconSpan = document.createElement("span");
  iconSpan.className = "badge-icon";

  if (type && type.startsWith("urgency")) {
    iconSpan.innerHTML = SVG_CLOCK;
  } else {
    iconSpan.innerHTML = SVG_CATEGORY;
  }

  const textNode = document.createTextNode(text);

  span.appendChild(iconSpan);
  span.appendChild(textNode);
  return span;
}

// For modal detail rows: add small icon + text
function setModalFieldWithIcon(el, svg, text) {
  if (!el) return;
  el.innerHTML = "";
  if (!text) {
    el.textContent = "—";
    return;
  }
  const iconSpan = document.createElement("span");
  iconSpan.className = "meta-icon";
  iconSpan.innerHTML = svg;

  el.appendChild(iconSpan);
  el.appendChild(document.createTextNode(text));
}

// Modal DOM refs (from your HTML)
let modalEl,
  modalName,
  modalCategory,
  modalUrgency,
  modalLocation,
  modalDescription,
  modalImage,
  modalActions,
  modalCloseBtn;
let modalCurrentRequestId = null;
let modalCurrentIsMine = false;
let modalCurrentData = null;

// Full-image viewer DOM refs
let imageViewerEl, imageViewerImageEl, imageViewerCloseBtn, imageViewerInner;

function initModalDom() {
  modalEl = document.getElementById("requestModal");
  if (!modalEl) return;
  modalName = document.getElementById("modalName");
  modalCategory = document.getElementById("modalCategory");
  modalUrgency = document.getElementById("modalUrgency");
  modalLocation = document.getElementById("modalLocation");
  modalDescription = document.getElementById("modalDescription");
  modalImage = document.getElementById("modalImage");
  modalActions = document.getElementById("modalActions");
  modalCloseBtn = document.getElementById("modalCloseBtn");

  // Full image viewer elements (must exist in HTML)
  imageViewerEl = document.getElementById("imageViewer");
  imageViewerImageEl = document.getElementById("imageViewerImage");
  imageViewerCloseBtn = document.getElementById("imageViewerClose");
  imageViewerInner = document.querySelector(".image-viewer-inner");

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

  function closeModal() {
    if (!modalEl) return;
    modalEl.setAttribute("hidden", "hidden");
    if (modalActions) modalActions.innerHTML = "";
    modalCurrentRequestId = null;
    modalCurrentIsMine = false;
    modalCurrentData = null;
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }
  if (modalEl) {
    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) closeModal();
    });
  }

  // Click on the image inside request modal → open fullscreen viewer
  if (modalImage) {
    modalImage.style.cursor = "zoom-in";
    modalImage.addEventListener("click", openImageViewer);
  }

  // Image viewer close button
  if (imageViewerCloseBtn) {
    imageViewerCloseBtn.addEventListener("click", closeImageViewer);
  }

  // Click outside (backdrop) of image viewer closes it
  if (imageViewerEl) {
    imageViewerEl.addEventListener("click", function (e) {
      if (e.target === imageViewerEl) {
        closeImageViewer();
      }
    });
  }

  // ESC key: close image viewer first, then main request modal
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (imageViewerEl && !imageViewerEl.hasAttribute("hidden")) {
        closeImageViewer();
      } else if (modalEl && !modalEl.hasAttribute("hidden")) {
        closeModal();
      }
    }
  });

  // expose for other functions (edit)
  window._dmx_closeRequestModal = closeModal;
}

function openRequestModal(data, id) {
  if (!modalEl) return;
  modalCurrentRequestId = id;
  modalCurrentIsMine =
    !!(auth.currentUser && data.requesterId === auth.currentUser.uid);
  modalCurrentData = data;

  const title = data.title || "Medicine";
  const category = data.category || "—";
  const urgencyRaw = (data.urgency || "").toString().toLowerCase();
  const urgencyLabel =
    urgencyRaw === "high"
      ? "High urgency"
      : urgencyRaw === "medium"
      ? "Medium urgency"
      : urgencyRaw === "low"
      ? "Low urgency"
      : data.urgency || "—";
  const location = data.location || "Not specified";
  const description =
    (data.description && String(data.description).trim()) ||
    "No description provided.";
  const imgSrc = data.imageUrl || DEFAULT_MEDICINE_IMAGE;

  modalName.textContent = title;
  setModalFieldWithIcon(modalCategory, SVG_CATEGORY, category);
  setModalFieldWithIcon(modalUrgency, SVG_CLOCK, urgencyLabel);
  setModalFieldWithIcon(modalLocation, SVG_LOCATION, location);
  modalDescription.textContent = description;
  modalImage.src = imgSrc;
  modalImage.alt = title;

  // Actions inside modal image area
  modalActions.innerHTML = "";

  if (modalCurrentIsMine) {
    // ========= OWNER: Edit + Delete =========
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "modal-btn modal-btn-ghost";
    btnEdit.textContent = "Edit";

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "modal-btn modal-btn-danger";
    btnDelete.textContent = "Delete";

    btnEdit.addEventListener("click", () => {
      if (!auth.currentUser || !modalCurrentRequestId || !modalCurrentData)
        return;

      // set global editing state
      editingRequestId = modalCurrentRequestId;
      editingRequestData = modalCurrentData;

      // prefill form fields
      const titleEl = document.getElementById("title");
      const descriptionEl = document.getElementById("description");
      const categoryEl = document.getElementById("category");
      const urgencyEl = document.getElementById("urgency");
      const locationTextEl = document.getElementById("locationText");

      if (titleEl) titleEl.value = modalCurrentData.title || "";
      if (descriptionEl)
        descriptionEl.value = modalCurrentData.description || "";
      if (categoryEl) categoryEl.value = modalCurrentData.category || "Other";
      if (urgencyEl) urgencyEl.value = modalCurrentData.urgency || "medium";
      if (locationTextEl)
        locationTextEl.value = modalCurrentData.location || "";

      // image: show preview + remember existing URL
      uploadedImageUrl = modalCurrentData.imageUrl || null;
      const thumbEl = document.getElementById("thumb");
      if (thumbEl) {
        thumbEl.innerHTML = "";
        if (uploadedImageUrl) {
          const img = new Image();
          img.src = uploadedImageUrl;
          img.alt = "Upload preview";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          thumbEl.appendChild(img);
        } else {
          thumbEl.innerHTML = '<span class="muted">No image</span>';
        }
      }
      const btnRemove = document.getElementById("btnRemove");
      if (btnRemove) {
        btnRemove.style.display = uploadedImageUrl ? "" : "none";
      }

      // switch to "Create" tab
      const createPill = document.querySelector('.pill[data-view="create"]');
      if (createPill) createPill.click();

      if (window._dmx_closeRequestModal) window._dmx_closeRequestModal();
    });

    btnDelete.addEventListener("click", async function () {
      if (!modalCurrentRequestId) return;
      const ok = confirm("Delete this request? This cannot be undone.");
      if (!ok) return;
      try {
        await deleteDoc(doc(db, "requests", modalCurrentRequestId));
        if (window._dmx_closeRequestModal) window._dmx_closeRequestModal();
      } catch (e) {
        console.error(e);
        alert("Failed to delete request: " + (e.message || e));
      }
    });

    modalActions.appendChild(btnEdit);
    modalActions.appendChild(btnDelete);
  } else {
 
    const btnMessage = document.createElement("button");
    btnMessage.type = "button";
    btnMessage.className = "modal-btn modal-btn-primary";
    btnMessage.textContent = "Message";

    btnMessage.addEventListener("click", () => {
      if (!auth.currentUser) {
        alert("You must be signed in to send a message.");
        return;
      }
      if (!data.requesterId) {
        alert("This request is not linked to a user account.");
        return;
      }

      // Build URL: message.html?chatWith=<uid>&requestId=<requestDocId>&name=<requesterName>
      const params = new URLSearchParams();
      params.set("chatWith", data.requesterId);
      params.set("requestId", id);
      if (data.requesterName) {
        params.set("name", data.requesterName);
      }

      window.location.href = "message.html?" + params.toString();
    });

    modalActions.appendChild(btnMessage);

    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.className = "modal-btn modal-btn-ghost";
    helpBtn.textContent = "Help";

    helpBtn.addEventListener("click", () => {
      helpBtn.textContent = "Matched";
      helpBtn.classList.remove("modal-btn-ghost");
      helpBtn.classList.add("modal-btn-success");
      helpBtn.disabled = true;
      alert("This request has been marked as matched.");
    });

    modalActions.appendChild(helpBtn);
  }


  modalEl.removeAttribute("hidden");
}

/* ==== Card rendering helpers (use your HTML design) ==== */

function createRequestCard(data, id) {
  const isMine =
    !!(auth.currentUser && data.requesterId === auth.currentUser.uid);

  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("data-owner", isMine ? "me" : "other");

  // Build robust requester name (prefer username-style)
  const legacyNameRaw =
    data.requesterName && String(data.requesterName).trim
      ? String(data.requesterName).trim()
      : null;
  const legacyName = asUsername(legacyNameRaw);
  const uidShort = data.requesterId
    ? "User " + String(data.requesterId).slice(0, 6)
    : "Anonymous";

  const cardBody = document.createElement("div");
  cardBody.className = "card__body";

  const titleEl = document.createElement("h3");
  titleEl.className = "title";
  titleEl.textContent = data.title || "Medicine Request";

  const requesterEl = document.createElement("p");
  requesterEl.className = "muted";

  const baseLabel = isMine
    ? "Requested by You"
    : "Requested by " + (legacyName || uidShort);

  requesterEl.innerHTML =
    '<span class="meta-icon">' + SVG_USER + "</span>" + baseLabel;

  cardBody.appendChild(titleEl);
  cardBody.appendChild(requesterEl);

  // Card meta badges (category + urgency)
  const cardMeta = document.createElement("div");
  cardMeta.className = "card-meta";

  const cat = data.category || "Other";
  const urgencyRaw = (data.urgency || "").toString().toLowerCase();
  const urgLabelBase =
    urgencyRaw === "high"
      ? "High urgency"
      : urgencyRaw === "medium"
      ? "Medium urgency"
      : urgencyRaw === "low"
      ? "Low urgency"
      : data.urgency || "";

  const urgencyClass =
    urgencyRaw === "high"
      ? "urgency-high"
      : urgencyRaw === "medium"
      ? "urgency-medium"
      : urgencyRaw === "low"
      ? "urgency-low"
      : "";

  const catBadge = createBadge(cat, "category");
  const urgBadge = createBadge(
    urgLabelBase || "",
    urgencyClass ? "urgency-" + urgencyRaw : ""
  );

  if (catBadge) cardMeta.appendChild(catBadge);
  if (urgBadge) cardMeta.appendChild(urgBadge);

  if (cardMeta.childNodes.length > 0) {
    cardBody.appendChild(cardMeta);
  }

  const footer = document.createElement("div");
  footer.className = "card__footer";

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "card__btn-open";
  openBtn.textContent = "Open";
  openBtn.addEventListener("click", function () {
    openRequestModal(data, id);
  });

  footer.appendChild(openBtn);

  card.appendChild(cardBody);
  card.appendChild(footer);

  // data-* attributes
  card.setAttribute("data-name", data.title || "");
  card.setAttribute("data-description", data.description || "");
  card.setAttribute("data-category", data.category || "");
  card.setAttribute("data-urgency", data.urgency || "");
  card.setAttribute("data-location", data.location || "");
  card.setAttribute("data-image", data.imageUrl || DEFAULT_MEDICINE_IMAGE);

  // Upgrade requester name once username is resolved
  if (data.requesterId) {
    getUsername(data.requesterId)
      .then(function (nameFromUsers) {
        const resolved = asUsername(nameFromUsers || legacyName || uidShort);
        if (!isMine && requesterEl) {
          requesterEl.innerHTML =
            '<span class="meta-icon">' +
            SVG_USER +
            "</span>" +
            "Requested by " +
            resolved;
        }
      })
      .catch(function () {
        // ignore
      });
  }

  return card;
}

/* ==== List renderers (Community + My Requests) ==== */

function renderCommunityList(allDocs, categoryFilter, urgencyFilter) {
  const requestsList = document.getElementById("requestsList");
  const countEl = document.getElementById("count");
  if (!requestsList || !countEl) return;

  const cat = categoryFilter ? categoryFilter.value : "";
  const urg = urgencyFilter ? urgencyFilter.value : "";

  // Filter
  let filtered = allDocs.filter(function (d) {
    const data = d.data;
    if (cat && data.category !== cat) return false;
    if (urg && data.urgency !== urg) return false;
    return true;
  });

  // Clear existing cards (remove sample HTML)
  requestsList.innerHTML = "";

  countEl.textContent =
    "Showing " +
    filtered.length +
    " request" +
    (filtered.length !== 1 ? "s" : "");

  if (!filtered.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No matching requests found.";
    requestsList.appendChild(p);
  } else {
    // Preload usernames to reduce flicker
    const uids = filtered
      .map((f) => f.data.requesterId)
      .filter(Boolean);
    preloadUsernames(uids)
      .catch(() => {})
      .finally(function () {
        filtered.forEach(function (item) {
          const card = createRequestCard(item.data, item.id);
          requestsList.appendChild(card);
        });
      });
  }

  // Update stats: total community requests from snapshot
  statsState.communityCount = allDocs.length;
  updateStatsUI();
}

function renderMyRequestsList(docs) {
  const myList = document.getElementById("myRequestsList");
  const myCount = document.getElementById("myCount");
  if (!myList || !myCount) return;

  myList.innerHTML = "";

  myCount.textContent =
    "Showing " +
    docs.length +
    " of your request" +
    (docs.length !== 1 ? "s" : "");

  if (!docs.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "You have no requests yet.";
    myList.appendChild(p);
  } else {
    const uids = docs.map((d) => d.data.requesterId).filter(Boolean);
    preloadUsernames(uids)
      .catch(() => {})
      .finally(function () {
        docs.forEach(function (item) {
          const card = createRequestCard(item.data, item.id);
          myList.appendChild(card);
        });
      });
  }

  // Update stats: my requests count and last created date
  statsState.myCount = docs.length;
  if (docs.length) {
    statsState.lastCreatedAtMs = docs[0]._ms || statsState.lastCreatedAtMs;
  }
  updateStatsUI();
}

/* ==== Firestore listeners ==== */
let unsubscribeAll = null;
let unsubscribeMine = null;

function startAllListener(categoryFilter, urgencyFilter) {
  if (unsubscribeAll) unsubscribeAll();
  const qy = query(collection(db, "requests"), orderBy("createdAt", "desc"));
  unsubscribeAll = onSnapshot(
    qy,
    function (snapshot) {
      const docs = [];
      snapshot.forEach(function (s) {
        const d = s.data();
        const ms =
          d.createdAt && d.createdAt.toMillis
            ? d.createdAt.toMillis()
            : d.createdAt
            ? d.createdAt.seconds * 1000
            : Date.now();
        d._when = timeAgo(ms);
        docs.push({ id: s.id, data: d, _ms: ms });
      });
      renderCommunityList(docs, categoryFilter, urgencyFilter);
    },
    function (err) {
      console.error("Community listener error:", err);
      const requestsList = document.getElementById("requestsList");
      if (requestsList) {
        requestsList.innerHTML =
          '<p class="muted">Failed to load requests.</p>';
      }
    }
  );
}

function startMyListener(uid) {
  const myHint = document.getElementById("myAuthHint");
  const myList = document.getElementById("myRequestsList");
  const myCount = document.getElementById("myCount");

  if (unsubscribeMine) unsubscribeMine();
  if (!uid) {
    if (myHint) myHint.classList.remove("hidden");
    if (myList) myList.innerHTML = "";
    if (myCount) myCount.textContent = "Showing 0 of your requests";

    statsState.myCount = 0;
    updateStatsUI();
    return;
  }

  if (myHint) myHint.classList.add("hidden");

  const qy = query(
    collection(db, "requests"),
    where("requesterId", "==", uid)
  );
  unsubscribeMine = onSnapshot(
    qy,
    function (snapshot) {
      const docs = [];
      snapshot.forEach(function (s) {
        const d = s.data();
        const ms =
          d.createdAt && d.createdAt.toMillis
            ? d.createdAt.toMillis()
            : d.createdAt
            ? d.createdAt.seconds * 1000
            : Date.now();
        d._when = timeAgo(ms);
        docs.push({ id: s.id, data: d, _ms: ms });
      });
      docs.sort(function (a, b) {
        return b._ms - a._ms;
      });
      renderMyRequestsList(docs);
    },
    function (err) {
      console.error("My listener error:", err);
      if (myList)
        myList.innerHTML =
          '<p class="muted">Failed to load your requests.</p>';
    }
  );
}

/* ========= DOMContentLoaded ========= */

window.addEventListener("DOMContentLoaded", function () {
  // Highlight current nav
  try {
    var path = location.pathname.split("/").pop();
    var links = document.querySelectorAll("nav a");
    links.forEach(function (a) {
      if (a.getAttribute("href") === path) a.classList.add("active");
    });
  } catch (e) {}

  // Header buttons
  signInBtn = document.querySelector(".sign-in-btn");

  // Notifications: ensure bell + dropdown
  ensureBellButton();
  ensureNotifDropdown();
  if (bellBtn) {
    ensureBellBadge();
    bellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifDropdown || notifDropdown.style.display === "none")
        showNotifDropdown();
      else hideNotifDropdown();
    });
  }

  if (signInBtn) {
    renderSignedOut();
  }

  // Modal DOM from HTML
  initModalDom();

  // Build medicine datalist
  var dl = document.getElementById("medicinesList");
  if (dl) {
    dl.innerHTML = "";
    medicineListForDatalist.forEach(function (name) {
      var o = document.createElement("option");
      o.value = name;
      dl.appendChild(o);
    });
  }

  // PSGC selects
  var selRegion = document.getElementById("selRegion");
  var selProvince = document.getElementById("selProvince");
  var selCityMun = document.getElementById("selCityMun");
  var selBarangay = document.getElementById("selBarangay");
  var locationText = document.getElementById("locationText");

  var profileSavedLocation = (function () {
    try {
      var c = JSON.parse(localStorage.getItem("userProfile") || "{}");
      return c.location || "";
    } catch (e) {
      return "";
    }
  })();

  function onRegionChange(clearLower) {
    if (clearLower === undefined) clearLower = true;
    if (!selRegion || !selProvince || !selCityMun || !selBarangay)
      return Promise.resolve();
    var regionCode = selRegion.value;
    if (!regionCode) {
      if (clearLower) {
        selProvince.innerHTML = "";
        selProvince.appendChild(opt("Select Province…", ""));
        selProvince.disabled = true;
        selCityMun.innerHTML = "";
        selCityMun.appendChild(opt("Select City/Municipality…", ""));
        selCityMun.disabled = true;
        selBarangay.innerHTML = "";
        selBarangay.appendChild(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      }
      return Promise.resolve();
    }
    selProvince.disabled = false;
    selProvince.innerHTML = "";
    selProvince.appendChild(opt("Loading provinces…", ""));
    return getProvincesByRegion(regionCode)
      .then(function (provs) {
        selProvince.innerHTML = "";
        selProvince.appendChild(opt("Select Province…", ""));
        provs
          .sort(function (a, b) {
            return a.name.localeCompare(b.name);
          })
          .forEach(function (p) {
            selProvince.appendChild(opt(p.name, p.code));
          });
        selCityMun.innerHTML = "";
        selCityMun.appendChild(opt("Select City/Municipality…", ""));
        selCityMun.disabled = true;
        selBarangay.innerHTML = "";
        selBarangay.appendChild(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      })
      .catch(function (e) {
        console.warn("Provinces load error:", e);
      });
  }
  function onProvinceChange(clearLower) {
    if (clearLower === undefined) clearLower = true;
    if (!selProvince || !selCityMun || !selBarangay)
      return Promise.resolve();
    var code = selProvince.value;
    if (!code) {
      if (clearLower) {
        selCityMun.innerHTML = "";
        selCityMun.appendChild(opt("Select City/Municipality…", ""));
        selCityMun.disabled = true;
        selBarangay.innerHTML = "";
        selBarangay.appendChild(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      }
      return Promise.resolve();
    }
    selCityMun.disabled = false;
    selCityMun.innerHTML = "";
    selCityMun.appendChild(opt("Loading…", ""));
    return getCitiesMunsByProvince(code)
      .then(function (cms) {
        selCityMun.innerHTML = "";
        selCityMun.appendChild(opt("Select City/Municipality…", ""));
        cms
          .sort(function (a, b) {
            return a.name.localeCompare(b.name);
          })
          .forEach(function (c) {
            selCityMun.appendChild(opt(c.name, c.code));
          });
        selBarangay.innerHTML = "";
        selBarangay.appendChild(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      })
      .catch(function (e) {
        console.warn("Cities load error:", e);
      });
  }
  function onCityMunChange(clearLower) {
    if (clearLower === undefined) clearLower = true;
    if (!selCityMun || !selBarangay) return Promise.resolve();
    var code = selCityMun.value;
    if (!code) {
      if (clearLower) {
        selBarangay.innerHTML = "";
        selBarangay.appendChild(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      }
      return Promise.resolve();
    }
    selBarangay.disabled = false;
    selBarangay.innerHTML = "";
    selBarangay.appendChild(opt("Loading barangays…", ""));
    var cm = { code: code };
    return getBarangaysByCityMun(cm)
      .then(function (brgys) {
        selBarangay.innerHTML = "";
        selBarangay.appendChild(opt("Select Barangay…", ""));
        brgys
          .sort(function (a, b) {
            return a.name.localeCompare(b.name);
          })
          .forEach(function (b) {
            selBarangay.appendChild(opt(b.name, b.code));
          });
      })
      .catch(function (e) {
        console.warn("Barangays load error:", e);
      });
  }

  if (selRegion)
    selRegion.addEventListener("change", function () {
      onRegionChange(true);
    });
  if (selProvince)
    selProvince.addEventListener("change", function () {
      onProvinceChange(true);
    });
  if (selCityMun)
    selCityMun.addEventListener("change", function () {
      onCityMunChange(true);
    });

  function initPSGC(savedText) {
    if (!selRegion || !selProvince || !selCityMun || !selBarangay) return;
    selRegion.innerHTML = "";
    selRegion.appendChild(opt("Select Region…", ""));
    selProvince.innerHTML = "";
    selProvince.appendChild(opt("Select Province…", ""));
    selProvince.disabled = true;
    selCityMun.innerHTML = "";
    selCityMun.appendChild(opt("Select City/Municipality…", ""));
    selCityMun.disabled = true;
    selBarangay.innerHTML = "";
    selBarangay.appendChild(opt("Select Barangay…", ""));
    selBarangay.disabled = true;

    getRegions()
      .then(function (regions) {
        regions
          .sort(function (a, b) {
            var an = a.regionName || a.name,
              bn = b.regionName || b.name;
            return an.localeCompare(bn);
          })
          .forEach(function (r) {
            var name = r.regionName ? r.regionName : r.name;
            selRegion.appendChild(opt(name, r.code));
          });

        if (savedText) {
          var parts = savedText
            .split(" · ")
            .map(function (s) {
              return (s || "").trim();
            })
            .filter(function (s) {
              return !!s;
            });
          var r = parts[0],
            p = parts[1],
            c = parts[2],
            b = parts[3];
          if (r) {
            var ro = Array.prototype.find.call(selRegion.options, function (o) {
              return o.textContent === r;
            });
            if (ro) {
              selRegion.value = ro.value;
              onRegionChange(false).then(function () {
                if (p) {
                  var po = Array.prototype.find.call(
                    selProvince.options,
                    function (o) {
                      return o.textContent === p;
                    }
                  );
                  if (po) {
                    selProvince.value = po.value;
                    onProvinceChange(false).then(function () {
                      if (c) {
                        var co = Array.prototype.find.call(
                          selCityMun.options,
                          function (o) {
                            return o.textContent === c;
                          }
                        );
                        if (co) {
                          selCityMun.value = co.value;
                          onCityMunChange(false).then(function () {
                            if (b) {
                              var bo = Array.prototype.find.call(
                                selBarangay.options,
                                function (o) {
                                  return o.textContent === b;
                                }
                              );
                              if (bo) {
                                selBarangay.value = bo.value;
                              }
                            }
                          });
                        }
                      }
                    });
                  }
                }
              });
            }
          }
        }
      })
      .catch(function (e) {
        console.warn("PSGC init failed:", e);
      });
  }

  initPSGC(profileSavedLocation);

  /* Firebase DOM refs */
  const categoryFilter = document.getElementById("categoryFilter");
  const urgencyFilter = document.getElementById("urgencyFilter");
  const createForm = document.getElementById("createForm");

  /* Cloudinary upload controls */
  var thumb = document.getElementById("thumb");
  var btnUpload = document.getElementById("btnUpload");
  var btnRemove = document.getElementById("btnRemove");
  var fileInput = document.getElementById("fileInput");
  var cloudinaryWidget = null;

  function setThumb(url) {
    if (!thumb) return;
    thumb.innerHTML = "";
    if (url) {
      var img = new Image();
      img.src = url;
      img.alt = "Upload preview";
      thumb.appendChild(img);
      if (btnRemove) btnRemove.style.display = "";
    } else {
      thumb.innerHTML = '<span class="muted">No image</span>';
      if (btnRemove) btnRemove.style.display = "none";
    }
  }
  function hasCloudinaryConfig() {
    return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
  }
  function uploadFileToCloudinary(file) {
    if (!hasCloudinaryConfig()) {
      alert(
        "Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in the code."
      );
    }
    var form = new FormData();
    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    return fetch(
      "https://api.cloudinary.com/v1_1/" +
        CLOUDINARY_CLOUD_NAME +
        "/image/upload",
      {
        method: "POST",
        body: form,
      }
    )
      .then(function (r) {
        if (!r.ok) throw new Error("Upload failed");
        return r.json();
      })
      .then(function (json) {
        return json.secure_url;
      });
  }
  function openCloudinaryWidget() {
    if (!window.cloudinary) {
      return false;
    }
    if (!hasCloudinaryConfig()) {
      alert(
        "Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in the code."
      );
      return false;
    }
    if (!cloudinaryWidget) {
      try {
        cloudinaryWidget = window.cloudinary.createUploadWidget(
          {
            cloudName: CLOUDINARY_CLOUD_NAME,
            uploadPreset: CLOUDINARY_UPLOAD_PRESET,
            multiple: false,
            cropping: false,
            sources: ["local", "camera", "url"],
            maxFileSize: 5_000_000,
            clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
          },
          function (error, result) {
            if (error) {
              console.error("Cloudinary error:", error);
              return;
            }
            if (result && result.event === "success") {
              uploadedImageUrl = result.info.secure_url;
              setThumb(uploadedImageUrl);
            }
          }
        );
      } catch (e) {
        console.error("Cloudinary widget init failed", e);
        return false;
      }
    }
    try {
      cloudinaryWidget.open();
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  if (btnUpload) {
    btnUpload.addEventListener("click", function () {
      var opened = openCloudinaryWidget();
      if (!opened && fileInput) {
        fileInput.click();
      }
    });
  }
  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      uploadFileToCloudinary(f)
        .then(function (url) {
          uploadedImageUrl = url;
          setThumb(url);
        })
        .catch(function (err) {
          console.error(err);
          alert("Upload failed.");
        });
    });
  }
  if (btnRemove) {
    btnRemove.addEventListener("click", function () {
      uploadedImageUrl = null;
      setThumb(null);
    });
  }

  /* Medicine -> Category auto-map */
  var titleInput = document.getElementById("title");
  var categorySelect = document.getElementById("category");
  function applyAutoCategory() {
    var name = (titleInput.value || "").trim();
    if (!name) return;
    var foundCat = medicineCatalog[name] || null;
    if (!foundCat) {
      var key = Object.keys(medicineCatalog).find(function (k) {
        return k.toLowerCase() === name.toLowerCase();
      });
      if (key) foundCat = medicineCatalog[key];
    }
    if (foundCat && categorySelect) {
      categorySelect.value = foundCat;
    }
  }
  if (titleInput) {
    titleInput.addEventListener("change", applyAutoCategory);
    titleInput.addEventListener("blur", applyAutoCategory);
    titleInput.addEventListener("input", function (e) {
      if (medicineCatalog[e.target.value]) applyAutoCategory();
    });
  }

  // Firestore listeners for Community requests
  startAllListener(categoryFilter, urgencyFilter);

  if (categoryFilter)
    categoryFilter.addEventListener("change", function () {
      startAllListener(categoryFilter, urgencyFilter);
    });
  if (urgencyFilter)
    urgencyFilter.addEventListener("change", function () {
      startAllListener(categoryFilter, urgencyFilter);
    });

  // Auth-aware: bind create form & my-requests listener once
  let submitBound = false;
  onAuthStateChanged(auth, function (user) {
    currentUser = user || null;

    // Header profile
    if (!user) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      renderSignedOut();
      listenToEvents(null);
    } else {
      listenToUserDoc(user);
      listenToEvents(user);
    }

    // My requests
    startMyListener(user ? user.uid : null);

    // Create / Edit form submit
    if (!createForm || submitBound) return;
    submitBound = true;

    createForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!auth.currentUser) {
        alert("You must be signed in to create or edit a request.");
        return;
      }

      var titleEl3 = document.getElementById("title");
      var descriptionEl = document.getElementById("description");
      var categoryEl = document.getElementById("category");
      var urgencyEl = document.getElementById("urgency");

      var title = titleEl3 ? (titleEl3.value || "").trim() : "";
      var description = descriptionEl
        ? (descriptionEl.value || "").trim()
        : "";
      var category = categoryEl ? categoryEl.value : "Other";
      var urgency = urgencyEl ? urgencyEl.value : "medium";
      if (!title || !description) {
        alert("Please complete the form.");
        return;
      }

      var casc = locationFromSelects(
        selRegion,
        selProvince,
        selCityMun,
        selBarangay
      );
      var finalLocation =
        casc ||
        (locationText && locationText.value
          ? locationText.value.trim()
          : "");

      (async function () {
        try {
          if (
            (!finalLocation || finalLocation.trim() === "") &&
            auth.currentUser
          ) {
            const userSnap = await getDoc(
              doc(db, "users", auth.currentUser.uid)
            );
            if (userSnap && userSnap.exists()) {
              const ud = userSnap.data() || {};
              if (ud.location && String(ud.location).trim()) {
                finalLocation = String(ud.location).trim();
              }
            }
          }
        } catch (err) {
          console.warn("Could not fetch profile location:", err);
        }

        const canonical = await getCanonicalUser(auth.currentUser);
        const requesterNameToSave =
          canonical && canonical.name ? canonical.name : null;

        // Decide image URL: keep existing if editing and no new upload
        const imageToSave =
          uploadedImageUrl !== null
            ? uploadedImageUrl
            : (editingRequestData && editingRequestData.imageUrl) || null;

        if (editingRequestId) {
          // ========= UPDATE EXISTING REQUEST =========
          updateDoc(doc(db, "requests", editingRequestId), {
            title: title,
            description: description,
            category: category,
            urgency: urgency,
            location: finalLocation || null,
            imageUrl: imageToSave || null,
            requesterId: auth.currentUser.uid,
            requesterName: requesterNameToSave || null,
          })
            .then(function () {
              uploadedImageUrl = null;
              editingRequestId = null;
              editingRequestData = null;
              setThumb(null);

              // Switch to "My Requests" tab
              const minePill = document.querySelector(
                '.pill[data-view="mine"]'
              );
              if (minePill) minePill.click();
            })
            .catch(function (err) {
              console.error(err);
              alert("Failed to update request: " + (err.message || err));
            });
        } else {
          // ========= CREATE NEW REQUEST =========
          addDoc(collection(db, "requests"), {
            title: title,
            description: description,
            category: category,
            urgency: urgency,
            location: finalLocation || null,
            imageUrl: imageToSave || null,
            requesterId: auth.currentUser.uid,
            requesterName: requesterNameToSave || null,
            status: "open",
            createdAt: serverTimestamp(),
          })
            .then(function () {
              uploadedImageUrl = null;
              setThumb(null);
              var arr = getArr(auth.currentUser.uid, "requests");
              arr.unshift({
                id: String(Date.now()),
                title: title,
                subtitle: description,
                date: nowStr(),
                status: "pending",
                statusClass: "status--reserved",
              });
              setArr(auth.currentUser.uid, "requests", arr);

              // Update stats immediately on create
              statsState.myCount = (statsState.myCount || 0) + 1;
              statsState.communityCount =
                (statsState.communityCount || 0) + 1;
              statsState.lastCreatedAtMs = Date.now();
              updateStatsUI();

              // Switch to "My Requests" tab after creating
              const minePill = document.querySelector(
                '.pill[data-view="mine"]'
              );
              if (minePill) minePill.click();
            })
            .catch(function (err) {
              console.error(err);
              alert("Failed to create request: " + (err.message || err));
            });
        }
      })();
    });
  });

  // Back button on create form → go back to Community tab
  const backBtnBottom = document.getElementById("backBtnBottom");
  if (backBtnBottom)
    backBtnBottom.addEventListener("click", function () {
      const communityPill = document.querySelector(
        '.pill[data-view="community"]'
      );
      if (communityPill) communityPill.click();
    });

  // Initial stats UI render
  updateStatsUI();
});
