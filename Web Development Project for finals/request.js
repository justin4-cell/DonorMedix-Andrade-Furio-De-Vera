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
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

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
    (u && u.email ? u.email.split("@")[0] : "Profile")
  );
}
function firstTwo(str = "U") {
  return str.trim().slice(0, 2).toUpperCase();
}

async function getCanonicalUser(u) {
  if (!u) return { name: "Anonymous", photoURL: null };
  let name = u.displayName || (u.email ? u.email.split("@")[0] : "Anonymous");
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
      <button id="dm_signout" style="flex:1; background:#ffffff; color:#0f172a; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; font-weight:800; cursor:pointer;">Sign Out</button>
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
  profileModal.querySelector("#dm_signout").addEventListener("click", async () => {
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
    <div id="dm_notif_list" style="padding:10px; overflow:auto; background:#f8fafc;">
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
        ? timeAgo(
            ev.createdAt.toDate ? ev.createdAt.toDate() : ev.createdAt
          )
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
    const qy = query(
      collection(db, "events"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
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
      if (!notifModal || notifModal.style.display === "none")
        showNotifModal();
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
      alert("Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in the code.");
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
      alert("Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in the code.");
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

  // ---- CHAT MODAL ----
  var modal, modalBody, modalTitle, inputMsg, btnSend, btnClose;
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title" id="chatTitle">Conversation</div>
          <button class="btn btn-ghost" id="chatClose">Close</button>
        </div>
        <div class="modal-body"><div class="chat" id="chatBody"></div></div>
        <div class="modal-footer">
          <input id="chatInput" class="input" placeholder="Write a message…"/>
          <button id="chatSend" class="btn btn-primary">Send</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modalBody = modal.querySelector("#chatBody");
    modalTitle = modal.querySelector("#chatTitle");
    inputMsg = modal.querySelector("#chatInput");
    btnSend = modal.querySelector("#chatSend");
    btnClose = modal.querySelector("#chatClose");
    btnClose.addEventListener("click", function () {
      closeChat();
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

    // Simple: always create a new thread (can be optimized later)
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
    modalTitle.textContent =
      "Conversation — " + (requestDoc.title || "Request");
    modalBody.innerHTML = "Loading…";
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
        ss.forEach(function (docSnap) {
          var m = docSnap.data();
          var div = document.createElement("div");
          div.className =
            "msg" +
            (auth.currentUser && m.senderId === auth.currentUser.uid
              ? " me"
              : "");
          div.textContent = m.text || "";
          modalBody.appendChild(div);
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

  /* CARD RENDERER */
  function renderRequestCard(data, id, authObj, dbObj) {
    var card = document.createElement("div");
    card.className = "browse-card";

    data._id = id;

    var imgWrap = document.createElement("div");
    imgWrap.className = "browse-card-image";
    var imgSrc =
      data.imageUrl ||
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=1200&auto=format&fit=crop";
    imgWrap.innerHTML = '<img src="' + imgSrc + '" alt="Medicine">';

    var badgebar = document.createElement("div");
    badgebar.className = "badgebar";
    var b1 = document.createElement("span");
    b1.className = "badge badge--cat";
    b1.textContent = data.category || "Other";
    var b2 = document.createElement("span");
    b2.className = urgencyBadgeClass(data.urgency || "medium");
    b2.textContent = (data.urgency || "medium").toUpperCase();
    badgebar.appendChild(b1);
    badgebar.appendChild(b2);
    imgWrap.appendChild(badgebar);

    var status = document.createElement("div");
    status.className = "status-chip";
    status.textContent = (data.status || "open").toUpperCase();
    if (data.status === "matched") {
      status.style.background = "#16a34a";
    }
    imgWrap.appendChild(status);

    var body = document.createElement("div");
    body.className = "browse-card-content";

    var h = document.createElement("h3");
    h.textContent = data.title || "Request";
    body.appendChild(h);

    var p1 = document.createElement("p");
    p1.textContent = data.description || "";
    body.appendChild(p1);

    var meta = document.createElement("div");
    meta.className = "meta";
    var m1 = document.createElement("span");
    m1.innerHTML = "📍 <strong>" + (data.location || "—") + "</strong>";
    var m2 = document.createElement("span");
    m2.innerHTML = "⏱ " + (data._when || "");
    var m3 = document.createElement("span");
    m3.innerHTML =
      "👤 Requested by <strong>" + (data.requesterName || "Anonymous") + "</strong>";
    meta.appendChild(m1);
    meta.appendChild(m2);
    meta.appendChild(m3);
    body.appendChild(meta);

    var actions = document.createElement("div");
    actions.className = "card-actions";

    var isMine =
      authObj.currentUser && data.requesterId === authObj.currentUser.uid;

    var helpBtn = document.createElement("button");
    helpBtn.className = "btn btn-primary";
    helpBtn.textContent = data.status === "matched" ? "Matched" : "Help";
    helpBtn.disabled = data.status === "matched" || isMine;
    if (isMine) helpBtn.title = "You can't help your own request";
    helpBtn.addEventListener("click", function () {
      if (helpBtn.disabled) return;
      if (!authObj.currentUser) {
        alert("Please sign in to help with a request.");
        return;
      }
      updateDoc(doc(dbObj, "requests", id), {
        status: "matched",
        matchedBy: authObj.currentUser.uid,
        matchedAt: serverTimestamp(),
      }).catch(function (e) {
        console.error(e);
        alert("Failed to mark matched.");
      });
    });

    var share = document.createElement("button");
    share.className = "btn btn-ghost";
    share.textContent = "Share";
    share.addEventListener("click", function () {
      var text =
        "Need: " +
        (data.title || "Medicine") +
        " — " +
        (data.description || "") +
        " | " +
        (data.location || "");
      if (navigator.share) {
        navigator
          .share({ title: "DonorMedix Request", text, url: location.href })
          .catch(function () {});
      } else {
        navigator.clipboard
          .writeText(text)
          .then(function () {
            alert("Copied!");
          })
          .catch(function () {});
      }
    });

    if (!isMine) {
      var messageBtn = document.createElement("button");
      messageBtn.className = "btn btn-ghost";
      messageBtn.textContent = "Message";
      messageBtn.addEventListener("click", function () {
        openOrCreateThreadForRequest(data);
      });
      actions.appendChild(messageBtn);
    }

    var del = document.createElement("button");
    del.className = "btn btn-danger";
    del.textContent = "Delete";
    del.style.marginLeft = "auto";
    if (!isMine) del.style.display = "none";
    del.addEventListener("click", async function () {
      var ok = confirm("Delete this request? This cannot be undone.");
      if (!ok) return;
      try {
        await deleteDoc(doc(dbObj, "requests", id));
      } catch (e) {
        console.error(e);
        alert("Failed to delete: " + (e.message || e));
      }
    });

    actions.appendChild(helpBtn);
    actions.appendChild(share);
    actions.appendChild(del);
    body.appendChild(actions);

    card.appendChild(imgWrap);
    card.appendChild(body);
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
    filtered.forEach(function (item) {
      requestsList.appendChild(
        renderRequestCard(item.data, item.id, auth, db)
      );
    });
  }

  function renderMyList(docs) {
    if (!myList || !myCount) return;
    myList.innerHTML = "";
    myCount.textContent =
      "Showing " + docs.length + " of your request" + (docs.length !== 1 ? "s" : "");
    docs.forEach(function (item) {
      myList.appendChild(renderRequestCard(item.data, item.id, auth, db));
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
        snapshot.forEach(function (s) {
          var d = s.data();
          var ms = d.createdAt && d.createdAt.toMillis
            ? d.createdAt.toMillis()
            : d.createdAt
            ? d.createdAt.seconds * 1000
            : Date.now();
          d._when = timeAgo(ms);
          docs.push({ id: s.id, data: d });
        });
        renderList(docs);
      },
      function (err) {
        console.error("Community listener error:", err);
        var msg = "⚠️ Failed to load requests.";
        if (
          err &&
          (err.code === "permission-denied" ||
            /Missing or insufficient permissions/i.test(err.message || ""))
        ) {
          msg =
            "🔒 Missing or insufficient permissions. Update your Firestore rules to allow reading /requests.";
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
        snapshot.forEach(function (s) {
          var d = s.data();
          var ms = d.createdAt && d.createdAt.toMillis
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
        renderMyList(docs);
      },
      function (err) {
        console.error("My listener error:", err);
        var msg = "⚠️ Failed to load your requests.";
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

      var titleEl = document.getElementById("title");
      var descriptionEl = document.getElementById("description");
      var categoryEl = document.getElementById("category");
      var urgencyEl = document.getElementById("urgency");

      var title = titleEl ? (titleEl.value || "").trim() : "";
      var description = descriptionEl ? (descriptionEl.value || "").trim() : "";
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
      var profileSavedLocation2 = (function () {
        try {
          var c = JSON.parse(localStorage.getItem("userProfile") || "{}");
          return c.location || "";
        } catch (e) {
          return "";
        }
      })();
      if (!finalLocation && profileSavedLocation2)
        finalLocation = profileSavedLocation2;

      addDoc(collection(db, "requests"), {
        title: title,
        description: description,
        category: category,
        urgency: urgency,
        location: finalLocation || null,
        imageUrl: uploadedImageUrl || null,
        requesterId: auth.currentUser.uid,
        requesterName: auth.currentUser.email || null,
        status: "open",
        createdAt: serverTimestamp(),
      })
        .then(function () {
          uploadedImageUrl = null;
          setThumb(null);
          var arr = getArr(auth.currentUser.uid, "requests");
          arr.unshift({
            id: String(Date.now()),
            title,
            subtitle: description,
            date: nowStr(),
            status: "pending",
            statusClass: "status--reserved",
            emoji: "📝",
          });
          setArr(auth.currentUser.uid, "requests", arr);
          showPanel("mine");
        })
        .catch(function (err) {
          console.error(err);
          alert("Failed to create request: " + (err.message || err));
        });
    });
  });

  // “Back” button returns to Community panel
  const backBtnBottom = document.getElementById("backBtnBottom");
  if (backBtnBottom)
    backBtnBottom.addEventListener("click", function () {
      showPanel("community");
    });
});
