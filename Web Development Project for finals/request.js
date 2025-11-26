// request.js
// DonorMedix · Requests page (Community + My Requests + Create)

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
  updateDoc,
  where,
  deleteDoc,
  getDocs,
  setDoc,
  limit,
  getDoc,
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

/* ========= Toast + profile helpers ========= */
const toastEl = document.getElementById("toast");
function showToast(msg) {
  if (!toastEl) {
    alert(msg);
    return;
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 3000);
}

function displayNameFrom(u, data) {
  return (
    (data && data.name) ||
    (u && u.displayName) ||
    "Profile"
  );
}
function firstTwo(str = "U") {
  return str.trim().slice(0, 2).toUpperCase();
}

async function getCanonicalUser(u) {
  // NOTE: changed to avoid deriving username from email.
  // We prefer users/{uid}.name or displayName, otherwise return {name: null}.
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

/* ========= Cloudinary ========= */
var CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
var CLOUDINARY_UPLOAD_PRESET = "donormedix";

/* ========= Usernames Cache & Batch preload ========= */
/*
  Behavior:
  - userCache stores uid -> username (string) or null when not found
  - preloadUsernames(uids) performs batch reads and fills cache
  - getUsername(uid) returns cached value if present, otherwise fetches single doc and caches it.
*/
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
            // prefer name, then displayName (do NOT fallback to email).
            const name =
              (data.name && String(data.name).trim()) ||
              (data.displayName && String(data.displayName).trim()) ||
              null;
            userCache[uid] = name || null;
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
  // if cached and non-empty string, return it
  if (userCache.hasOwnProperty(uid) && userCache[uid]) return userCache[uid];
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      userCache[uid] = null;
      // no users/{uid} doc
      return null;
    }
    const data = snap.data() || {};
    const name =
      (data.name && String(data.name).trim()) ||
      (data.displayName && String(data.displayName).trim()) ||
      null; // NOTE: intentionally do NOT use email local-part
    userCache[uid] = name || null;
    return name || null;
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

/* ========= Panels / Switcher ========= */
var panelCommunity = document.getElementById("panel-community");
var panelMine = document.getElementById("panel-mine");
var panelCreate = document.getElementById("panel-create");
var communityWrapper = document.getElementById("communityRequestsWrapper");
var myWrapper = document.getElementById("myRequestsWrapper");
var switcherBtns = document.querySelectorAll(".switcher .pill");

function showPanel(which) {
  if (!panelCommunity || !panelMine || !panelCreate) return;

  var isCommunity = which === "community";
  var isMine = which === "mine";

  // COMMUNITY: filters panel + community cards
  panelCommunity.classList.toggle("hidden", !isCommunity);
  if (communityWrapper) {
    communityWrapper.classList.toggle("hidden", !isCommunity);
  }

  // MY REQUESTS: panel + my cards
  panelMine.classList.toggle("hidden", !isMine);
  if (myWrapper) {
    myWrapper.classList.toggle("hidden", !isMine);
  }

  // CREATE
  panelCreate.classList.toggle("hidden", which !== "create");

  // Pills active state
  switcherBtns.forEach(function (b) {
    var active = b.getAttribute("data-view") === which;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
}

switcherBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    showPanel(btn.getAttribute("data-view"));
  });
});

/* ========= Header: Profile + Notifications ========= */
let signInBtn;
let bellBtn;
let bellBadge;
let profileModal;
let notifModal;
let unsubUserDoc = null;
let unsubEvents = null;

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
        <div id="dm_profile_email" style="color:#0f172a;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
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
    background: "#0f172a",
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
    <div id="dm_notif_list" style="padding:10px; overflow:auto; background:#f8faff;">
      <div style="padding:10px; color:#0f172a;">No notifications yet.</div>
    </div>
  `;
  document.body.appendChild(notifModal);

  document
    .querySelector("#dm_notif_close")
    .addEventListener("click", hideNotifModal);
  document.addEventListener("keydown", (e) => {
    if (notifModal.style.display !== "none" && e.key === "Escape")
      hideNotifModal();
  });
  document.addEventListener("click", (e) => {
    if (notifModal.style.display === "none") return;
    if (e.target === notifModal || notifModal.contains(e.target)) return;
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
  const list = document.querySelector("#dm_notif_list");
  const pill = document.querySelector("#dm_notif_count_pill");
  if (!list || !pill) return;

  if (!items || !items.length) {
    list.innerHTML = `<div style="padding:10px; color:#0f172a;">No notifications yet.</div>`;
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
        ? `<strong style="color:#0f172a">${ev.userName}</strong> — `
        : "";
      const msg = ev.message || "";
      return `
      <div style="
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:12px 14px;
        margin-bottom:10px;
        box-shadow:0 6px 18px rgba(0,0,0,.06);
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        gap:4px;
      ">
        ${icon}
        <div style="color:#0f172a; line-height:1.35;">${who}${msg}</div>
        <div style="color:#0f172a; font-size:.85rem;">${when}</div>
      </div>
    `;
    })
    .join("");
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
function listenToEvents() {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }
  try {
    const qy = query(collection(db, "events"), orderBy("createdAt", "desc"), limit(20));
    unsubEvents = onSnapshot(
      qy,
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
          });
        });
        renderEventsList(items);
        setBellCount(items.length);
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

// Aesthetic default medicine image for cards + modal
const DEFAULT_MEDICINE_IMAGE =
  "https://images.unsplash.com/photo-1584306670954-dbb2a7e4aa0f?q=80&w=1200&auto=format&fit=crop";

window.addEventListener("DOMContentLoaded", function () {
  // Auto-highlight current nav link by filename
  try {
    var path = location.pathname.split("/").pop();
    var links = document.querySelectorAll("nav a");
    links.forEach(function (a) {
      if (a.getAttribute("href") === path) a.classList.add("active");
    });
  } catch (e) {}

  // Header buttons
  signInBtn = document.querySelector(".sign-in-btn");
  bellBtn = document.querySelector(".bell-btn");

  if (bellBtn) {
    ensureBellBadge();
    bellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifModal || notifModal.style.display === "none") showNotifModal();
      else hideNotifModal();
    });
    listenToEvents();
  }
  if (signInBtn) {
    renderSignedOut();
  }

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
  var requestsList = document.getElementById("requestsList");
  var countEl = document.getElementById("count");
  var categoryFilter = document.getElementById("categoryFilter");
  var urgencyFilter = document.getElementById("urgencyFilter");
  var createForm = document.getElementById("createForm");

  var myList = document.getElementById("myRequestsList");
  var myCount = document.getElementById("myCount");
  var myHint = document.getElementById("myAuthHint");

  /* Cloudinary upload in Request page */
  var uploadedImageUrl = null;
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
      img.onload = function () {
        img.classList.add("flash");
      };
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

  function urgencyBadgeClass(u) {
    if (u === "high") return "badge badge--urg-high";
    if (u === "low") return "badge badge--urg-low";
    return "badge badge--urg-medium";
  }

  // ---- CHAT MODAL (User-to-user, aesthetic) ----
  var modal, modalBody, modalTitle, inputMsg, btnSend, btnClose;

  function ensureChatStyles() {
    if (document.getElementById("dmx_chat_styles")) return;
    var s = document.createElement("style");
    s.id = "dmx_chat_styles";
    s.textContent = [
      ".chat-modal-card{max-width:520px;width:100%;border-radius:20px;overflow:hidden;background:#0f172a;box-shadow:0 24px 60px rgba(15,23,42,.5);border:1px solid rgba(148,163,184,.3);}",
      ".chat-header{padding:12px 16px;background:linear-gradient(135deg,#0f172a,#020617);color:#e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:10px;}",
      ".chat-header-main{display:flex;flex-direction:column;gap:2px;min-width:0;}",
      ".chat-title-label{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;font-weight:800;}",
      ".chat-title{font-weight:700;font-size:1.05rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:#f9fafb;}",
      ".chat-sub{font-size:.8rem;color:#9ca3af;}",
      ".chat-close-btn{border:none;background:rgba(15,23,42,.9);color:#e5e7eb;border-radius:999px;padding:4px 10px;font-size:.8rem;cursor:pointer;font-weight:700;}",
      ".chat-body-wrap{padding:10px 12px 8px;background:radial-gradient(circle at 0 0,#1f2937 0,#020617 55%);}",
      ".chat-scroll{max-height:360px;min-height:180px;overflow-y:auto;padding:8px 4px;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin;}",
      ".chat-scroll::-webkit-scrollbar{width:6px;}",
      ".chat-scroll::-webkit-scrollbar-track{background:transparent;}",
      ".chat-scroll::-webkit-scrollbar-thumb{background:#4b5563;border-radius:999px;}",
      ".chat-empty{font-size:.85rem;color:#9ca3af;text-align:center;padding:18px 4px;}",
      ".msg{max-width:80%;padding:7px 10px;border-radius:14px;border:1px solid rgba(148,163,184,.4);background:rgba(15,23,42,.85);color:#e5e7eb;font-size:.87rem;line-height:1.4;align-self:flex-start;box-shadow:0 8px 22px rgba(15,23,42,.4);}",
      ".msg.me{align-self:flex-end;background:#22c55e;color:#022c22;border-color:rgba(73, 189, 210, 1);box-shadow:0 10px 28px rgba(34,197,94,.45);}",
      ".chat-footer{padding:10px 12px 12px;background:#020617;border-top:1px solid rgba(148,163,184,.35);display:flex;gap:8px;align-items:center;}",
      ".chat-input{flex:1;border-radius:999px;border:1px solid rgba(148,163,184,.7);background:#020617;color:#e5e7eb;font-size:.85rem;padding:8px 12px;outline:none;}",
      ".chat-input::placeholder{color:#6b7280;}",
      ".chat-input:focus{border-color:#38bdf8;box-shadow:0 0 0 1px rgba(56,189,248,.5);}",
      ".chat-send-btn{border:none;border-radius:999px;padding:8px 14px;font-size:.85rem;font-weight:700;background:linear-gradient(135deg,#22c55e,#16a34a);color:#ecfdf5;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 14px 34px rgba(34,197,94,.5);}",
      ".chat-send-btn:hover{transform:translateY(-1px);box-shadow:0 18px 40px rgba(73, 189, 210, 1);}",
      ".chat-send-btn:active{transform:translateY(0);box-shadow:0 8px 22px rgba(73, 189, 210, 1);}",
      ".chat-send-icon{font-size:1rem;}",
      "@media (max-width:640px){.chat-modal-card{max-width:100%;margin:0 10px;}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function ensureModal() {
    if (modal) return;
    ensureChatStyles();

    modal = document.createElement("div");
    modal.id = "dm_chat_modal";
    modal.className = "modal chat-modal";
    modal.innerHTML = `
      <div class="modal-card chat-modal-card">
        <div class="chat-header">
          <div class="chat-header-main">
            <div class="chat-title-label">Private message</div>
            <div class="chat-title" id="chatTitle">Conversation</div>
            <div class="chat-sub" id="chatSub">User-to-user conversation</div>
          </div>
          <button class="chat-close-btn" id="chatClose">Close</button>
        </div>
        <div class="chat-body-wrap">
          <div class="chat-scroll" id="chatBody">
            <div class="chat-empty">No messages yet. Be the first to say hello </div>
          </div>
        </div>
        <div class="chat-footer">
          <input id="chatInput" class="chat-input" placeholder="Write a message" />
          <button id="chatSend" class="chat-send-btn">
            <span>Send</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modalBody = modal.querySelector("#chatBody");
    modalTitle = modal.querySelector("#chatTitle");
    inputMsg = modal.querySelector("#chatInput");
    btnSend = modal.querySelector("#chatSend");
    btnClose = modal.querySelector("#chatClose");

    btnClose.addEventListener("click", function () {
      closeChat();
    });

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeChat();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && modal.classList.contains("open")) {
        closeChat();
      }
    });
  }

  var activeThread = { id: null, unsub: null, peerLabel: "", participants: [] };

  async function openOrCreateThreadForRequest(requestDoc) {
    ensureModal();
    if (!auth.currentUser) {
      alert("Please sign in to message.");
      return;
    }

    var me = auth.currentUser;
    var requesterId = requestDoc.requesterId;
    if (!requesterId) {
      alert("Requester not found.");
      return;
    }
    var peerId =
      me.uid === requesterId ? requestDoc.matchedBy || requesterId : requesterId;
    if (!peerId) {
      alert("No peer available to message.");
      return;
    }

    var newThreadId = crypto.randomUUID();
    var participants = [me.uid, peerId];
    var participantsMap = {};
    participants.forEach(function (uid) {
      participantsMap[uid] = true;
    });
    await setDoc(doc(db, "threads", newThreadId), {
      participants: participants,
      participantsMap: participantsMap,
      requestId: requestDoc._id || requestDoc.id || null,
      requestTitle: requestDoc.title || "Request",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
      lastSenderId: null,
    });

    openChat(newThreadId, requestDoc, participants);
  }

  function openChat(threadId, requestDoc, participants) {
    ensureModal();
    modal.classList.add("open");

    var subEl = modal.querySelector("#chatSub");
    modalTitle.textContent = requestDoc.title || "Request conversation";
    if (subEl) {
      subEl.textContent =
        "Chat about “" + (requestDoc.title || "this request") + "”";
    }

    modalBody.innerHTML =
      '<div class="chat-empty">Loading conversation…</div>';
    inputMsg.value = "";

    if (activeThread.unsub) {
      try {
        activeThread.unsub();
      } catch (e) {}
    }
    activeThread.id = threadId;
    activeThread.participants = participants || [];

    var msgsRef = collection(db, "threads", threadId, "messages");
    activeThread.unsub = onSnapshot(
      query(msgsRef, orderBy("createdAt", "asc")),
      function (ss) {
        modalBody.innerHTML = "";
        if (ss.empty) {
          var empty = document.createElement("div");
          empty.className = "chat-empty";
          empty.textContent = "No messages yet. Start the conversation 👋";
          modalBody.appendChild(empty);
          return;
        }
        ss.forEach(function (docSnap) {
          var m = docSnap.data();
          var wrap = document.createElement("div");
          var isMe = auth.currentUser && m.senderId === auth.currentUser.uid;
          wrap.className = "msg" + (isMe ? " me" : "");
          wrap.textContent = m.text || "";
          modalBody.appendChild(wrap);
        });
        modalBody.parentElement.scrollTop =
          modalBody.parentElement.scrollHeight;
      }
    );

    btnSend.onclick = async function () {
      var text = (inputMsg.value || "").trim();
      if (!text) return;
      try {
        await addDoc(collection(db, "threads", threadId, "messages"), {
          text,
          senderId: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "threads", threadId), {
          lastMessage: text,
          lastSenderId: auth.currentUser.uid,
          updatedAt: serverTimestamp(),
        });
        inputMsg.value = "";
      } catch (e) {
        console.error(e);
        alert("Failed to send message.");
      }
    };
  }

  function closeChat() {
    if (activeThread.unsub) {
      try {
        activeThread.unsub();
      } catch (e) {}
      activeThread.unsub = null;
    }
    activeThread.id = null;
    if (modal) modal.classList.remove("open");
  }

  /* ====== Request Card + Detail Modal Styles ====== */
  function ensureRequestStyles() {
    if (document.getElementById("dmx_request_styles")) return;
    var s = document.createElement("style");
    s.id = "dmx_request_styles";
    s.textContent = [
      // Card layout
      ".request-card{display:flex;flex-direction:row;align-items:stretch;gap:16px;padding:14px 16px;border-radius:18px;background:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,.12);border:1px solid rgba(148,163,184,.35);}",
      ".request-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}",
      ".request-header-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}",
      ".request-requester{font-size:.85rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}",
      ".request-open-btn{align-self:flex-start;margin-top:6px;padding:6px 16px;border-radius:999px;border:none;background:#0f172a;color:#ffffff;font-weight:600;font-size:.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 8px 24px rgba(15,23,42,.25);transition:transform .12s ease,box-shadow .12s ease,background .12s ease;}",
      ".request-open-btn:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(15,23,42,.28);background:#020617;}",
      ".request-open-btn:active{transform:translateY(0);box-shadow:0 6px 18px rgba(15,23,42,.24);}",
      ".request-open-btn-icon{font-size:1rem;}",
      // Right side image (larger & aesthetic)
      ".request-image-wrap{width:160px;height:115px;flex-shrink:0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#f1f5f9 40%,#e2e8f0 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.25);}",
      ".request-image-wrap img{width:100%;height:100%;object-fit:cover;display:block;}",
      "@media (max-width:640px){.request-card{padding:12px 12px;}.request-image-wrap{width:130px;height:100px;}.request-title{max-width:180px;}.request-requester{max-width:180px;}}",
      // Detail modal card
      ".detail-modal-card{max-width:560px;width:100%;border-radius:20px;overflow:hidden;background:#f9fafb;}",
      ".detail-header{padding:14px 18px;background:linear-gradient(135deg,#0f172a,#020617);color:#e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:10px;}",
      ".detail-header-main{display:flex;flex-direction:column;gap:2px;min-width:0;}",
      ".detail-title{font-weight:700;font-size:1.05rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;}",
      ".detail-sub{font-size:.8rem;color:#cbd5f5;}",
      ".detail-close-btn{border:none;background:rgba(15,23,42,.7);color:#e5e7eb;border-radius:999px;padding:4px 10px;font-size:.8rem;cursor:pointer;}",
      ".detail-body{padding:16px 18px 10px;display:flex;gap:16px;}",
      ".detail-body-main{flex:1;min-width:0;}",
      ".detail-pill-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;}",
      ".detail-img-wrap{width:140px;flex-shrink:0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#f1f5f9 40%,#e2e8f0 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.25);}",
      ".detail-img-wrap img{width:100%;height:100%;object-fit:cover;display:block;}",
      ".detail-meta{font-size:.85rem;color:#0f172a;margin-top:6px;}",
      ".detail-meta strong{color:#0f172a;}",
      ".detail-desc{margin-top:10px;font-size:.9rem;color:#111827;line-height:1.45;background:#ffffff;border-radius:12px;padding:10px 12px;border:1px solid #e5e7eb;}",
      ".detail-footer{padding:12px 18px 16px;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;border-top:1px solid #e5e7eb;background:#f9fafb;}",
      ".detail-footer .btn{font-size:.85rem;}",
      // Like button accent
      ".btn-like.active{background:#fecaca;border-color:#fca5a5;}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ====== Detail Modal Helpers ====== */
  var detailModal = null;
  var detailCardEl = null;

  function hideRequestDetails() {
    if (detailModal) detailModal.classList.remove("open");
  }

  function ensureDetailModal() {
    if (detailModal) return;
    detailModal = document.createElement("div");
    detailModal.id = "dm_request_detail_modal";
    detailModal.className = "modal";
    detailModal.innerHTML = '<div class="modal-card detail-modal-card"></div>';
    detailCardEl = detailModal.querySelector(".detail-modal-card");
    document.body.appendChild(detailModal);

    detailModal.addEventListener("click", function (e) {
      if (e.target === detailModal) hideRequestDetails();
    });
    document.addEventListener("keydown", function (e) {
      if (
        e.key === "Escape" &&
        detailModal &&
        detailModal.classList.contains("open")
      ) {
        hideRequestDetails();
      }
    });
  }

  function showRequestDetails(data, id) {
    ensureRequestStyles();
    ensureDetailModal();

    var title = data.title || "Medicine Request";

    // Start with a placeholder requester while we resolve the username
    var requesterDisplay = "Loading...";

    var cat = data.category || "Other";
    var urgText = (data.urgency || "medium").toUpperCase();
    var statusText = (data.status || "open").toUpperCase();
    var loc = data.location || "Not specified";
    var when = data._when || "";
    var imgSrc = data.imageUrl || DEFAULT_MEDICINE_IMAGE;

    var isMine =
      auth.currentUser && data.requesterId === auth.currentUser.uid;

    detailCardEl.innerHTML = "";

    // Header
    var header = document.createElement("div");
    header.className = "detail-header";

    var headerMain = document.createElement("div");
    headerMain.className = "detail-header-main";

    var titleEl = document.createElement("div");
    titleEl.className = "detail-title";
    titleEl.textContent = title;

    var subEl = document.createElement("div");
    subEl.className = "detail-sub";
    subEl.innerHTML = "Requested by <strong>" + requesterDisplay + "</strong>" + (when ? " · " + when : "");

    headerMain.appendChild(titleEl);
    headerMain.appendChild(subEl);

    var closeTop = document.createElement("button");
    closeTop.type = "button";
    closeTop.className = "detail-close-btn";
    closeTop.id = "detailCloseTop";
    closeTop.textContent = "Close";
    closeTop.onclick = hideRequestDetails;

    header.appendChild(headerMain);
    header.appendChild(closeTop);

    // Body
    var body = document.createElement("div");
    body.className = "detail-body";

    var bodyMain = document.createElement("div");
    bodyMain.className = "detail-body-main";

    var pillRow = document.createElement("div");
    pillRow.className = "detail-pill-row";

    var catSpan = document.createElement("span");
    catSpan.className = "badge badge--cat";
    catSpan.textContent = cat;

    var urgSpan = document.createElement("span");
    urgSpan.className = urgencyBadgeClass(data.urgency || "medium");
    urgSpan.textContent = urgText;

    var statusChip = document.createElement("span");
    statusChip.className = "status-chip";
    statusChip.textContent = statusText;
    if (data.status === "matched") {
      statusChip.style.background = "#16a34a";
      statusChip.style.color = "#ecfdf5";
    }

    pillRow.appendChild(catSpan);
    pillRow.appendChild(urgSpan);
    pillRow.appendChild(statusChip);

    var meta = document.createElement("div");
    meta.className = "detail-meta";
    meta.innerHTML =
      "<div><strong>Location:</strong> " +
      loc +
      "</div><div><strong>Requester:</strong> " +
      requesterDisplay +
      "</div>";

    var desc = document.createElement("div");
    desc.className = "detail-desc";
    if (data.description) {
      var safe = data.description
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      desc.innerHTML = safe;
    } else {
      desc.innerHTML = "<em>No description provided.</em>";
    }

    bodyMain.appendChild(pillRow);
    bodyMain.appendChild(meta);
    bodyMain.appendChild(desc);

    var imgWrap = document.createElement("div");
    imgWrap.className = "detail-img-wrap";
    var img = document.createElement("img");
    img.src = imgSrc;
    img.alt = "Medicine image";
    imgWrap.appendChild(img);

    body.appendChild(bodyMain);
    body.appendChild(imgWrap);

    // Footer
    var footer = document.createElement("div");
    footer.className = "detail-footer";

    // Message button (opens chat modal)
    var msgBtn = document.createElement("button");
    msgBtn.type = "button";
    msgBtn.className = "btn btn-ghost";
    msgBtn.id = "detailMsgBtn";
    msgBtn.textContent = "Message";
    if (isMine) {
      msgBtn.style.display = "none";
    } else {
      msgBtn.onclick = function () {
        openOrCreateThreadForRequest(data);
      };
    }

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-danger";
    delBtn.id = "detailDeleteBtn";
    delBtn.textContent = "Delete";
    if (!isMine) {
      delBtn.style.display = "none";
    } else {
      delBtn.onclick = async function () {
        var ok = confirm("Delete this request? This cannot be undone.");
        if (!ok) return;
        try {
          await deleteDoc(doc(db, "requests", id));
          hideRequestDetails();
        } catch (e) {
          console.error(e);
          alert("Failed to delete: " + (e.message || e));
        }
      };
    }

    // NOTE: per request, removed the lower-right "Close" button in the footer,
    // removed the "Share" button, and removed the "I can help" action and the Like button.
    // Only keep Message (for non-owners) and Delete (for owner).

    footer.appendChild(msgBtn);
    footer.appendChild(delBtn);

    detailCardEl.appendChild(header);
    detailCardEl.appendChild(body);
    detailCardEl.appendChild(footer);

    // Resolve username and update modal UI when ready (use consistent fallback)
    var legacyName = data.requesterName && String(data.requesterName).trim();
    if (data.requesterId) {
      getUsername(data.requesterId).then(function (name) {
        var resolved = name || legacyName || ("User " + (data.requesterId ? data.requesterId.slice(0, 6) : "??"));
        if (detailModal && detailModal.classList.contains("open")) {
          subEl.innerHTML = "Requested by <strong>" + resolved + "</strong>" + (when ? " · " + when : "");
          meta.innerHTML = "<div><strong>Location:</strong> " + loc + "</div><div><strong>Requester:</strong> " + resolved + "</div>";
        }
      }).catch(function(err){
        // fallback to legacy or uid short
        var fallback = legacyName || (data.requesterId ? "User " + data.requesterId.slice(0,6) : "Anonymous");
        subEl.innerHTML = "Requested by <strong>" + fallback + "</strong>" + (when ? " · " + when : "");
        meta.innerHTML = "<div><strong>Location:</strong> " + loc + "</div><div><strong>Requester:</strong> " + fallback + "</div>";
        console.warn("Error resolving username for modal:", err);
      });
    } else {
      var fallback = legacyName || "Anonymous";
      subEl.innerHTML = "Requested by <strong>" + fallback + "</strong>" + (when ? " · " + when : "");
      meta.innerHTML = "<div><strong>Location:</strong> " + loc + "</div><div><strong>Requester:</strong> " + fallback + "</div>";
    }

    detailModal.classList.add("open");
  }

  // Like button logic for requests (modal)
  // NOTE: kept function for potential reuse but not currently used by the modal,
  // because we removed the Like button from the detail footer as requested.
  function setupRequestLike(requestId, requesterId, likeBtn) {
    if (!likeBtn) return;
    const likesCol = collection(db, "requests", requestId, "likes");

    onSnapshot(likesCol, function (snap) {
      const countSpan = likeBtn.querySelector(".like-count");
      if (countSpan) countSpan.textContent = String(snap.size);

      if (currentUser) {
        const liked = snap.docs.some(function (d) {
          return d.id === currentUser.uid;
        });
        if (liked) likeBtn.classList.add("active");
        else likeBtn.classList.remove("active");
      } else {
        likeBtn.classList.remove("active");
      }
    });

    likeBtn.addEventListener("click", async function () {
      if (!auth.currentUser) {
        alert("Please sign in to like requests.");
        return;
      }
      if (auth.currentUser.uid === requesterId) {
        alert("You can't like your own request.");
        return;
      }

      const likeRef = doc(
        db,
        "requests",
        requestId,
        "likes",
        auth.currentUser.uid
      );
      const isActive = likeBtn.classList.contains("active");
      try {
        if (isActive) {
          await deleteDoc(likeRef);
        } else {
          await setDoc(likeRef, {
            userId: auth.currentUser.uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.error("Like toggle failed:", e);
      }
    });
  }

  /* CARD RENDERER */
  function renderRequestCard(data, id, authObj, dbObj) {
    ensureRequestStyles();

    var card = document.createElement("div");
    card.className = "browse-card request-card";

    data._id = id;

    // Right side: image (larger)
    var imgWrap = document.createElement("div");
    imgWrap.className = "request-image-wrap";
    var imgSrc = data.imageUrl || DEFAULT_MEDICINE_IMAGE;
    imgWrap.innerHTML = '<img src="' + imgSrc + '" alt="Medicine">';

    // Left side: name + requester + Open button (Open below text)
    var main = document.createElement("div");
    main.className = "request-main";

    var headerRow = document.createElement("div");
    headerRow.className = "request-header-row";

    var titleEl2 = document.createElement("div");
    titleEl2.className = "request-title";
    titleEl2.textContent = data.title || "Medicine Request";

    var requesterEl = document.createElement("div");
    requesterEl.className = "request-requester";

    // Robust username resolution:
    // 1) prefer users/{uid}.name or displayName (via getUsername)
    // 2) fallback to stored data.requesterName (legacy)
    // 3) fallback to short uid "User abc123"
    var legacyName = data.requesterName && String(data.requesterName).trim();
    var uidShort = data.requesterId ? "User " + data.requesterId.slice(0, 6) : "Anonymous";
    requesterEl.textContent = legacyName || uidShort;

    if (data.requesterId) {
      // If cache already has it and non-empty, show it immediately
      if (userCache.hasOwnProperty(data.requesterId) && userCache[data.requesterId]) {
        requesterEl.textContent = userCache[data.requesterId];
      }

      // Attempt to fetch canonical name and update the UI if it differs
      getUsername(data.requesterId).then(function (nameFromUsers) {
        var resolved = nameFromUsers || legacyName || uidShort;
        if (requesterEl && requesterEl.textContent !== resolved) {
          requesterEl.textContent = resolved;
        }
      }).catch(function(err){
        // If error, keep legacyName or uidShort already set
        console.warn("renderRequestCard getUsername error for", data.requesterId, err);
      });
    } else {
      // no requesterId: keep data.requesterName or anonymous
      requesterEl.textContent = legacyName || "Anonymous";
    }

    var openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "request-open-btn";
    openBtn.innerHTML =
      '<span class="request-open-btn-icon">↗</span><span>Open</span>';
    openBtn.addEventListener("click", function () {
      showRequestDetails(data, id);
    });

    headerRow.appendChild(titleEl2);
    headerRow.appendChild(requesterEl);
    main.appendChild(headerRow);
    main.appendChild(openBtn);

    card.appendChild(main);
    card.appendChild(imgWrap);

    return card;
  }

  function renderList(docs) {
    if (!requestsList || !countEl) return;
    var cat = categoryFilter ? categoryFilter.value : "";
    var urg = urgencyFilter ? urgencyFilter.value : "";
    requestsList.innerHTML = "";
    var filtered = docs.filter(function (d) {
      if (cat && d.data.category !== cat) return false;
      if (urg && d.data.urgency !== urg) return false;
      return true;
    });
    countEl.textContent =
      "Showing " +
      filtered.length +
      " active request" +
      (filtered.length !== 1 ? "s" : "");

    // Batch preload usernames for visible items to avoid per-card flashes
    var idsToPreload = filtered
      .map(function (f) {
        return f.data.requesterId;
      })
      .filter(Boolean);
    preloadUsernames(idsToPreload)
      .then(function () {
        filtered.forEach(function (item) {
          requestsList.appendChild(
            renderRequestCard(item.data, item.id, auth, db)
          );
        });
      })
      .catch(function () {
        // fallback if preload fails
        filtered.forEach(function (item) {
          requestsList.appendChild(
            renderRequestCard(item.data, item.id, auth, db)
          );
        });
      });
  }

  function renderMyList(docs) {
    if (!myList || !myCount) return;
    myList.innerHTML = "";
    myCount.textContent =
      "Showing " +
      docs.length +
      " of your request" +
      (docs.length !== 1 ? "s" : "");

    // Preload usernames for these docs too
    var idsToPreload = docs.map(function (d) {
      return d.data.requesterId;
    }).filter(Boolean);
    preloadUsernames(idsToPreload)
      .then(function () {
        docs.forEach(function (item) {
          myList.appendChild(renderRequestCard(item.data, item.id, auth, db));
        });
      })
      .catch(function () {
        docs.forEach(function (item) {
          myList.appendChild(renderRequestCard(item.data, item.id, auth, db));
        });
      });
  }

  var unsubscribeAll = null;
  var unsubscribeMine = null;

  function startAllListener() {
    if (unsubscribeAll) unsubscribeAll();
    var qy = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    unsubscribeAll = onSnapshot(
      qy,
      function (snapshot) {
        var docs = [];
        var ids = [];
        snapshot.forEach(function (s) {
          var d = s.data();
          var ms =
            d.createdAt && d.createdAt.toMillis
              ? d.createdAt.toMillis()
              : d.createdAt
              ? d.createdAt.seconds * 1000
              : Date.now();
          d._when = timeAgo(ms);
          docs.push({ id: s.id, data: d });
          if (d.requesterId) ids.push(d.requesterId);
        });
        // Preload usernames for visible list to reduce flashes / "User abc" fallback
        preloadUsernames(ids).finally(function () {
          renderList(docs);
        });
      },
      function (err) {
        console.error("Community listener error:", err);
        var msg = " Failed to load requests.";
        if (
          err &&
          (err.code === "permission-denied" ||
            /Missing or insufficient permissions/i.test(err.message || ""))
        ) {
          msg =
            " Missing or insufficient permissions. Update your Firestore rules to allow reading /requests.";
        }
        if (requestsList) requestsList.innerHTML = "<p>" + msg + "</p>";
      }
    );
  }

  function startMyListener(uid) {
    if (unsubscribeMine) unsubscribeMine();
    if (!uid) {
      if (myHint) myHint.classList.remove("hidden");
      if (myList) myList.innerHTML = "";
      if (myCount) myCount.textContent = "Showing 0 of your requests";
      return;
    }
    if (myHint) myHint.classList.add("hidden");

    var qy = query(
      collection(db, "requests"),
      where("requesterId", "==", uid)
    );
    unsubscribeMine = onSnapshot(
      qy,
      function (snapshot) {
        var docs = [];
        var ids = [];
        snapshot.forEach(function (s) {
          var d = s.data();
          var ms =
            d.createdAt && d.createdAt.toMillis
              ? d.createdAt.toMillis()
              : d.createdAt
              ? d.createdAt.seconds * 1000
              : Date.now();
          d._when = timeAgo(ms);
          docs.push({ id: s.id, data: d, _ms: ms });
          if (d.requesterId) ids.push(d.requesterId);
        });
        docs.sort(function (a, b) {
          return b._ms - a._ms;
        });
        preloadUsernames(ids).finally(function () {
          renderMyList(docs);
        });
      },
      function (err) {
        console.error("My listener error:", err);
        var msg = " Failed to load your requests.";
        if (myList) myList.innerHTML = "<p>" + msg + "</p>";
      }
    );
  }

  startAllListener();
  if (categoryFilter)
    categoryFilter.addEventListener("change", startAllListener);
  if (urgencyFilter) urgencyFilter.addEventListener("change", startAllListener);

  // Auth-aware: bind create form & my-requests listener once
  var submitBound = false;
  onAuthStateChanged(auth, function (user) {
    currentUser = user || null;

    // Header profile
    if (!user) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (signInBtn) renderSignedOut();
    } else {
      listenToUserDoc(user);
    }

    // My requests list
    startMyListener(user ? user.uid : null);

    // Create form
    if (!createForm || submitBound) return;
    submitBound = true;
    createForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!auth.currentUser) {
        alert("You must be signed in to create a request.");
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
      // fallback to profile.js saved location if form didn't provide one
      (async function () {
        try {
          if ((!finalLocation || finalLocation.trim() === "") && auth.currentUser) {
            // fetch users/{uid} doc and use its location if present
            const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
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

        getCanonicalUser(auth.currentUser)
          .then(function (canonical) {
            var requesterNameToSave = (canonical && canonical.name) ? canonical.name : null;

            return addDoc(collection(db, "requests"), {
              title: title,
              description: description,
              category: category,
              urgency: urgency,
              location: finalLocation || null,
              imageUrl: uploadedImageUrl || null,
              requesterId: auth.currentUser.uid,
              // store the resolved username from users/{uid} if available (avoid email fallback)
              requesterName: requesterNameToSave || null,
              status: "open",
              createdAt: serverTimestamp(),
            });
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
            showPanel("mine");
          })
          .catch(function (err) {
            console.error(err);
            alert("Failed to create request: " + (err.message || err));
          });
      })();
    });
  });

  const backBtnBottom = document.getElementById("backBtnBottom");
  if (backBtnBottom)
    backBtnBottom.addEventListener("click", function () {
      showPanel("community");
    });
});
