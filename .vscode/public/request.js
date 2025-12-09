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

// Relative time (for requests)
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

/* ========= Simple stats state (for sidebar) ========= */

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
  // Match request.html IDs
  const elTotal = document.getElementById("allRequests");
  const elMy = document.getElementById("youRequests");
  const elLast = document.getElementById("stat-last-created"); // optional (not in HTML now)

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

// HTML escape (no longer used by notifications, but safe to keep)
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

/* ========= Panels / Switcher ========= */
var signInBtn;
var profileModal;
let unsubUserDoc = null;

/* ===== PROFILE MODAL ===== */

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
  signInBtn.onclick = () => (window.location.href = "index.html");
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

/* ========= Main Init ========= */

const DEFAULT_MEDICINE_IMAGE =
  "https://images.unsplash.com/photo-1584306670954-dbb2a7e4aa0f?q=80&w=800&auto=format&fit=crop";

/* ==== ICON HELPERS (cards + modal) ==== */

// Create a meta chip (using request.html .card-meta-item style)
function createChip(iconClass, text, extraClass) {
  if (!text) return null;
  const span = document.createElement("span");
  span.className = "card-meta-item" + (extraClass ? " " + extraClass : "");

  const icon = document.createElement("i");
  icon.className = iconClass;
  icon.setAttribute("aria-hidden", "true");

  span.appendChild(icon);
  span.appendChild(document.createTextNode(" " + text));
  return span;
}

// Modal detail rows: add small FA icon + text
function setModalFieldWithIcon(el, iconClass, text) {
  if (!el) return;
  el.innerHTML = "";
  if (!text) {
    el.textContent = "—";
    return;
  }
  const iconSpan = document.createElement("span");
  const i = document.createElement("i");
  i.className = iconClass;
  iconSpan.appendChild(i);
  iconSpan.style.marginRight = "6px";
  el.appendChild(iconSpan);
  el.appendChild(document.createTextNode(text));
}

/* ==== Modal DOM refs ==== */

let modalEl,
  modalTypeLabel,
  modalName,
  modalCategoryChip,
  modalUrgency,
  modalQuantity,
  modalNeedBy,
  modalLocation,
  modalDescription,
  modalImage,
  modalStatusOpenBtn,
  modalStatusClosedBtn,
  modalEditBtn,
  modalDeleteBtn,
  modalMessageBtn;

let modalCurrentRequestId = null;
let modalCurrentIsMine = false;
let modalCurrentData = null;

// Image viewer
let imageViewerEl, imageViewerImageEl, imageViewerCloseBtn;

/* ==== CHAT BRIDGE: from requests -> message.html ==== */

/**
 * Open the message page to chat about a specific request.
 * message.html will read:
 *   - chatWith  -> otherUid
 *   - requestId -> requestId
 *   - name      -> otherNameFromUrl
 *   - avatar    -> otherAvatarFromUrl
 */
function openChatForRequest({ targetUid, requestId, displayName, avatarUrl }) {
  if (!targetUid || !requestId) {
    console.warn("openChatForRequest missing targetUid or requestId", {
      targetUid,
      requestId,
    });
    alert("Unable to open chat for this request.");
    return;
  }

  const url = new URL("message.html", window.location.href);
  url.searchParams.set("chatWith", targetUid);
  url.searchParams.set("requestId", requestId);

  if (displayName) {
    url.searchParams.set("name", displayName);
  }
  if (avatarUrl) {
    url.searchParams.set("avatar", avatarUrl);
  }

  window.location.href = url.toString();
}

/* ==== Modal init & interactions ==== */

function initModalDom() {
  modalEl = document.getElementById("requestModal");
  if (!modalEl) return;

  modalTypeLabel = document.getElementById("modalTypeLabel");
  modalName = document.getElementById("modalName");
  modalCategoryChip = document.getElementById("modalCategoryChip");
  modalUrgency = document.getElementById("modalUrgency");
  modalQuantity = document.getElementById("modalQuantity");
  modalNeedBy = document.getElementById("modalNeedBy");
  modalLocation = document.getElementById("modalLocation");
  modalDescription = document.getElementById("modalDescription");
  modalImage = document.getElementById("modalImage");

  modalStatusOpenBtn = document.getElementById("modalStatusOpen");
  modalStatusClosedBtn = document.getElementById("modalStatusClosed");
  modalEditBtn = document.getElementById("modalEditBtn");
  modalDeleteBtn = document.getElementById("modalDeleteBtn");
  modalMessageBtn = document.getElementById("modalMessageBtn");

  const modalCloseBtn = document.getElementById("modalCloseBtn");

  imageViewerEl = document.getElementById("imageViewer");
  imageViewerImageEl = document.getElementById("imageViewerImg");
  imageViewerCloseBtn = document.getElementById("imageViewerClose");

  function updateStatusButtonsUI(status) {
    if (!modalStatusOpenBtn || !modalStatusClosedBtn) return;
    const s = (status || "open").toLowerCase();

    modalStatusOpenBtn.classList.remove(
      "modal-btn-status--active",
      "modal-btn-status--off"
    );
    modalStatusClosedBtn.classList.remove(
      "modal-btn-status--active",
      "modal-btn-status--off"
    );

    if (s === "closed") {
      modalStatusClosedBtn.classList.add("modal-btn-status--active");
      modalStatusOpenBtn.classList.add("modal-btn-status--off");
    } else {
      modalStatusOpenBtn.classList.add("modal-btn-status--active");
      modalStatusClosedBtn.classList.add("modal-btn-status--off");
    }
  }

  async function setStatus(status) {
    if (!modalCurrentIsMine || !modalCurrentRequestId) return;
    try {
      await updateDoc(doc(db, "requests", modalCurrentRequestId), {
        status: status,
      });
      if (modalCurrentData) modalCurrentData.status = status;
      updateStatusButtonsUI(status);
    } catch (e) {
      console.error("Status update failed:", e);
      alert("Failed to update status.");
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
    imageViewerImageEl.alt = modalImage.alt || "Medicine image";
    imageViewerEl.removeAttribute("hidden");
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.setAttribute("hidden", "hidden");
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

  if (modalImage) {
    modalImage.style.cursor = "zoom-in";
    modalImage.addEventListener("click", openImageViewer);
  }

  if (imageViewerCloseBtn) {
    imageViewerCloseBtn.addEventListener("click", closeImageViewer);
  }
  if (imageViewerEl) {
    imageViewerEl.addEventListener("click", function (e) {
      if (e.target === imageViewerEl) closeImageViewer();
    });
  }

  if (modalStatusOpenBtn) {
    modalStatusOpenBtn.onclick = function () {
      setStatus("open");
    };
  }
  if (modalStatusClosedBtn) {
    modalStatusClosedBtn.onclick = function () {
      setStatus("closed");
    };
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (imageViewerEl && !imageViewerEl.hasAttribute("hidden")) {
        closeImageViewer();
      } else if (modalEl && !modalEl.hasAttribute("hidden")) {
        closeModal();
      }
    }
  });

  window._dmx_closeRequestModal = closeModal;
}

/* ==== Open modal with data ==== */

function openRequestModal(data, id) {
  if (!modalEl) return;

  modalCurrentRequestId = id;
  modalCurrentData = data;
  modalCurrentIsMine =
    !!(auth.currentUser && data.requesterId === auth.currentUser.uid);

  const name = data.medicineName || data.title || "Medicine Request";
  const category = data.category || "Other";
  const urgencyRaw = (data.urgency || "").toString().toLowerCase();
  const urgencyLabel =
    urgencyRaw === "high"
      ? "High urgency"
      : urgencyRaw === "urgent"
      ? "Urgent"
      : urgencyRaw === "medium"
      ? "Medium urgency"
      : urgencyRaw === "low"
      ? "Low urgency"
      : data.urgency || "—";
  const quantityLabel = data.quantity || "Not specified";
  const needByLabel = data.needByDate || "Any time";
  const locationLabel = data.location || "Not specified";
  const description =
    (data.description && String(data.description).trim()) ||
    "No description provided.";
  const imgSrc = data.imageUrl || DEFAULT_MEDICINE_IMAGE;

  if (modalTypeLabel) modalTypeLabel.textContent = "Request";
  if (modalName) modalName.textContent = name;

  if (modalCategoryChip) {
    const textSpan = modalCategoryChip.querySelector("span:last-child");
    if (textSpan) textSpan.textContent = category;
  }

  setModalFieldWithIcon(modalUrgency, "fa-solid fa-clock", urgencyLabel);
  setModalFieldWithIcon(modalQuantity, "fa-solid fa-box", quantityLabel);
  setModalFieldWithIcon(
    modalNeedBy,
    "fa-regular fa-calendar-days",
    needByLabel
  );
  setModalFieldWithIcon(
    modalLocation,
    "fa-solid fa-location-dot",
    locationLabel
  );

  if (modalDescription) modalDescription.textContent = description;
  if (modalImage) {
    modalImage.src = imgSrc;
    modalImage.alt = name;
  }

  // Reset buttons visibility/handlers
  if (modalEditBtn) {
    modalEditBtn.style.display = modalCurrentIsMine ? "inline-flex" : "none";
    modalEditBtn.onclick = null;
  }
  if (modalDeleteBtn) {
    modalDeleteBtn.style.display = modalCurrentIsMine ? "inline-flex" : "none";
  }
  if (modalMessageBtn) {
    modalMessageBtn.style.display = modalCurrentIsMine ? "none" : "inline-flex";
    modalMessageBtn.onclick = null;
  }

  if (modalStatusOpenBtn && modalStatusClosedBtn) {
    const status = (data.status || "open").toLowerCase();
    const isOwner = modalCurrentIsMine;

    modalStatusOpenBtn.disabled = !isOwner;
    modalStatusClosedBtn.disabled = !isOwner;

    modalStatusOpenBtn.classList.remove(
      "modal-btn-status--active",
      "modal-btn-status--off"
    );
    modalStatusClosedBtn.classList.remove(
      "modal-btn-status--active",
      "modal-btn-status--off"
    );

    if (status === "closed") {
      modalStatusClosedBtn.classList.add("modal-btn-status--active");
      modalStatusOpenBtn.classList.add("modal-btn-status--off");
    } else {
      modalStatusOpenBtn.classList.add("modal-btn-status--active");
      modalStatusClosedBtn.classList.add("modal-btn-status--off");
    }
  }

  if (modalCurrentIsMine) {
    if (modalEditBtn) {
      modalEditBtn.onclick = function () {
        if (!editingRequestId && modalCurrentRequestId) {
          editingRequestId = modalCurrentRequestId;
          editingRequestData = modalCurrentData || null;

          const medicineNameEl = document.getElementById("medicineName");
          const descriptionEl = document.getElementById("description");
          const categoryEl = document.getElementById("category");
          const urgencyEl = document.getElementById("urgencyLevel");
          const quantityEl = document.getElementById("quantity");
          const needByEl = document.getElementById("needByDate");
          const locationTextEl = document.getElementById("locationText");

          if (medicineNameEl)
            medicineNameEl.value = data.medicineName || data.title || "";
          if (descriptionEl) descriptionEl.value = data.description || "";
          if (categoryEl) categoryEl.value = data.category || "Other";
          if (urgencyEl) urgencyEl.value = data.urgency || "medium";
          if (quantityEl) quantityEl.value = data.quantity || "";
          if (needByEl) needByEl.value = data.needByDate || "";
          if (locationTextEl) locationTextEl.value = data.location || "";

          // Image
          uploadedImageUrl = data.imageUrl || null;
          const imagePreview = document.getElementById("imagePreview");
          const imageUrlInput = document.getElementById("imageUrl");
          if (imagePreview) {
            if (uploadedImageUrl) {
              imagePreview.src = uploadedImageUrl;
              imagePreview.style.display = "block";
            } else {
              imagePreview.src = "";
              imagePreview.style.display = "none";
            }
          }
          if (imageUrlInput) {
            imageUrlInput.value = uploadedImageUrl || "";
          }

          // Switch to Create tab
          const createPill = document.querySelector('.pill[data-view="create"]');
          if (createPill) createPill.click();
          if (window._dmx_closeRequestModal) window._dmx_closeRequestModal();
        }
      };
    }

    if (modalDeleteBtn) {
      modalDeleteBtn.onclick = async function () {
        if (!modalCurrentRequestId) return;
        const ok = confirm(
          "Delete this request? This cannot be undone."
        );
        if (!ok) return;
        try {
          await deleteDoc(doc(db, "requests", modalCurrentRequestId));
          if (window._dmx_closeRequestModal) window._dmx_closeRequestModal();
        } catch (e) {
          console.error(e);
          alert("Failed to delete request: " + (e.message || e));
        }
      };
    }
  } else {
    // ========= MESSAGE BUTTON (modal only) =========
    if (modalMessageBtn) {
      modalMessageBtn.onclick = function (e) {
        e.preventDefault();

        if (!auth.currentUser) {
          alert("You must be signed in to send a message.");
          window.location.href = "index.html";
          return;
        }

        if (!data.requesterId) {
          alert("This request is not linked to a user account.");
          return;
        }

        if (auth.currentUser.uid === data.requesterId) {
          alert("You can't message yourself about your own request.");
          return;
        }

        openChatForRequest({
          targetUid: data.requesterId,
          requestId: id,
          displayName: data.requesterName || null,
          avatarUrl: null,
        });
      };
    }
  }

  modalEl.removeAttribute("hidden");
}

/* ==== Card rendering helpers ==== */

function createRequestCard(data, id) {
  const isMine =
    !!(auth.currentUser && data.requesterId === auth.currentUser.uid);

  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("data-owner", isMine ? "me" : "other");

  const name = data.medicineName || data.title || "Medicine Request";

  // Legacy / username
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
  titleEl.textContent = name;

  const requesterEl = document.createElement("p");
  requesterEl.className = "muted";
  const baseLabel = isMine
    ? "Requested by You"
    : "Requested by " + (legacyName || uidShort);
  requesterEl.innerHTML =
    '<span class="meta-icon"><i class="fa-solid fa-user"></i></span>' +
    baseLabel;

  cardBody.appendChild(titleEl);
  cardBody.appendChild(requesterEl);

  const cardMeta = document.createElement("div");
  cardMeta.className = "card-meta";

  const category = data.category || "Other";
  const urgencyRaw = (data.urgency || "").toString().toLowerCase();
  const urgencyLabel =
    urgencyRaw === "high"
      ? "High urgency"
      : urgencyRaw === "urgent"
      ? "Urgent"
      : urgencyRaw === "medium"
      ? "Medium urgency"
      : urgencyRaw === "low"
      ? "Low urgency"
      : data.urgency || "";

  const locationLabel =
    (data.location && String(data.location).split("·")[2]) ||
    data.location ||
    "";

  // Category chip
  const catChip = createChip(
    "fa-solid fa-prescription-bottle-medical",
    category
  );
  if (catChip) cardMeta.appendChild(catChip);

  // Urgency chip
  let urgencyClass = "";
  if (urgencyRaw === "high") urgencyClass = "urgency-high";
  else if (urgencyRaw === "medium") urgencyClass = "urgency-medium";
  else if (urgencyRaw === "low") urgencyClass = "urgency-low";
  else if (urgencyRaw === "urgent") urgencyClass = "urgency-urgent";

  const urgChip = createChip("fa-solid fa-bolt", urgencyLabel, urgencyClass);
  if (urgChip) cardMeta.appendChild(urgChip);

  // Location chip
  if (locationLabel) {
    const locChip = createChip(
      "fa-solid fa-location-dot",
      locationLabel.trim()
    );
    if (locChip) cardMeta.appendChild(locChip);
  }

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

  // NOTE: No Message button here; messaging is only in the modal.

  card.appendChild(cardBody);
  card.appendChild(footer);

  // data-* attributes
  card.setAttribute("data-name", name);
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
            '<span class="meta-icon"><i class="fa-solid fa-user"></i></span>' +
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

/* ==== List renderers ==== */

function renderCommunityList(allDocs, categoryFilter, urgencyFilter) {
  const listEl = document.getElementById("allRequestsList");
  const countEl = document.getElementById("allRequestsCount");
  if (!listEl || !countEl) return;

  const cat = categoryFilter ? categoryFilter.value : "";
  const urg = urgencyFilter ? urgencyFilter.value : "";

  let filtered = allDocs.filter(function (d) {
    const data = d.data;
    if (cat && data.category !== cat) return false;
    if (urg && data.urgency !== urg) return false;
    return true;
  });

  listEl.innerHTML = "";

  if (!filtered.length) {
    countEl.textContent = "No matching requests found";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No matching requests found.";
    listEl.appendChild(p);
  } else {
    countEl.textContent =
      "Showing " +
      filtered.length +
      " request" +
      (filtered.length !== 1 ? "s" : "");
    const uids = filtered.map((f) => f.data.requesterId).filter(Boolean);
    preloadUsernames(uids)
      .catch(() => {})
      .finally(function () {
        filtered.forEach(function (item) {
          const card = createRequestCard(item.data, item.id);
          listEl.appendChild(card);
        });
      });
  }

  statsState.communityCount = allDocs.length;
  updateStatsUI();
}

function renderMyRequestsList(docs) {
  const myList = document.getElementById("myRequestsList");
  const myCount = document.getElementById("myRequestsCount");
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
      const listEl = document.getElementById("allRequestsList");
      if (listEl) {
        listEl.innerHTML = '<p class="muted">Failed to load requests.</p>';
      }
    }
  );
}

function startMyListener(uid) {
  const myList = document.getElementById("myRequestsList");
  const myCount = document.getElementById("myRequestsCount");
  const myHint = document.getElementById("myAuthHint"); // optional hint element

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

  if (signInBtn) {
    renderSignedOut();
  }

  // Modal DOM
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

  /* Firebase DOM refs matching request.html */
  const categoryFilter = document.getElementById("filterCategory");
  const urgencyFilter = document.getElementById("filterUrgency");
  const createForm = document.getElementById("requestForm");

  /* Cloudinary upload controls – match request.html */
  const imagePreview = document.getElementById("imagePreview");
  const cloudinaryBtn = document.getElementById("cloudinaryUploadBtn");
  const imageUrlInput = document.getElementById("imageUrl");
  let cloudinaryWidget = null;

  function setPreview(url) {
    uploadedImageUrl = url || null;
    if (imagePreview) {
      if (url) {
        imagePreview.src = url;
        imagePreview.style.display = "block";
      } else {
        imagePreview.src = "";
        imagePreview.style.display = "none";
      }
    }
    if (imageUrlInput) {
      imageUrlInput.value = url || "";
    }
  }

  function hasCloudinaryConfig() {
    return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
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
              setPreview(result.info.secure_url);
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

  if (cloudinaryBtn) {
    cloudinaryBtn.addEventListener("click", function () {
      openCloudinaryWidget();
    });
  }

  /* Medicine -> Category auto-map (medicineName input) */
  var titleInput = document.getElementById("medicineName");
  var categorySelect = document.getElementById("category");
  function applyAutoCategory() {
    var name = (titleInput && titleInput.value) ? titleInput.value.trim() : "";
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

  // Switcher: All / My / Create
  const pills = document.querySelectorAll(".pill");
  const createPanel = document.getElementById("create-panel");
  const allPanel = document.getElementById("all-requests-panel");
  const myPanel = document.getElementById("my-requests-panel");
  const sidebar = document.getElementById("pageSidebar");
  const mainGrid = document.getElementById("mainGrid");
  const btnBack = document.getElementById("btnBack");

  function setView(view) {
    pills.forEach(function (p) {
      const v = p.getAttribute("data-view");
      const isActive = v === view;
      p.classList.toggle("active", isActive);
      p.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    if (createPanel) createPanel.style.display = view === "create" ? "block" : "none";
    if (allPanel) allPanel.style.display = view === "all" ? "block" : "none";
    if (myPanel) myPanel.style.display = view === "mine" ? "block" : "none";

    if (sidebar) sidebar.style.display = view === "create" ? "flex" : "none";
    if (mainGrid) {
      if (view === "create") mainGrid.classList.add("has-sidebar");
      else mainGrid.classList.remove("has-sidebar");
    }
  }

  pills.forEach(function (p) {
    p.addEventListener("click", function () {
      const view = p.getAttribute("data-view");
      setView(view);
    });
  });

  if (btnBack) {
    btnBack.addEventListener("click", function () {
      setView("all");
    });
  }

  // Default view = Create
  setView("create");

  // Firestore listeners for community requests
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
    } else {
      listenToUserDoc(user);
    }

    // My requests
    startMyListener(user ? user.uid : null);

    // Create / Edit submit
    if (!createForm || submitBound) return;
    submitBound = true;

    createForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!auth.currentUser) {
        alert("You must be signed in to create or edit a request.");
        return;
      }

      const medicineNameEl = document.getElementById("medicineName");
      const descriptionEl = document.getElementById("description");
      const categoryEl = document.getElementById("category");
      const urgencyEl = document.getElementById("urgencyLevel");
      const quantityEl = document.getElementById("quantity");
      const needByEl = document.getElementById("needByDate");

      const title = medicineNameEl ? (medicineNameEl.value || "").trim() : "";
      const description = descriptionEl
        ? (descriptionEl.value || "").trim()
        : "";
      const category = categoryEl ? categoryEl.value : "Other";
      const urgency = urgencyEl ? urgencyEl.value : "medium";
      const quantity = quantityEl ? (quantityEl.value || "").trim() : "";
      const needByDate = needByEl ? needByEl.value || "" : "";

      if (!title || !description) {
        alert("Please complete the required fields.");
        return;
      }

      const casc = locationFromSelects(
        selRegion,
        selProvince,
        selCityMun,
        selBarangay
      );
      let finalLocation =
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

        const imageToSave =
          uploadedImageUrl !== null
            ? uploadedImageUrl
            : (editingRequestData && editingRequestData.imageUrl) || null;

        if (editingRequestId) {
          // UPDATE
          updateDoc(doc(db, "requests", editingRequestId), {
            title: title,
            medicineName: title,
            description: description,
            category: category,
            urgency: urgency,
            quantity: quantity || null,
            needByDate: needByDate || null,
            location: finalLocation || null,
            imageUrl: imageToSave || null,
            requesterId: auth.currentUser.uid,
            requesterName: requesterNameToSave || null,
          })
            .then(function () {
              uploadedImageUrl = null;
              editingRequestId = null;
              editingRequestData = null;
              setPreview(null);

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
          // CREATE
          addDoc(collection(db, "requests"), {
            title: title,
            medicineName: title,
            description: description,
            category: category,
            urgency: urgency,
            quantity: quantity || null,
            needByDate: needByDate || null,
            location: finalLocation || null,
            imageUrl: imageToSave || null,
            requesterId: auth.currentUser.uid,
            requesterName: requesterNameToSave || null,
            status: "open",
            createdAt: serverTimestamp(),
          })
            .then(function () {
              uploadedImageUrl = null;
              setPreview(null);

              const arr = getArr(auth.currentUser.uid, "requests");
              arr.unshift({
                id: String(Date.now()),
                title: title,
                subtitle: description,
                date: nowStr(),
                status: "pending",
                statusClass: "status--reserved",
              });
              setArr(auth.currentUser.uid, "requests", arr);

              statsState.myCount = (statsState.myCount || 0) + 1;
              statsState.communityCount =
                (statsState.communityCount || 0) + 1;
              statsState.lastCreatedAtMs = Date.now();
              updateStatsUI();

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

  // Initial stats
  updateStatsUI();
});
