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
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
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
function formatExpiryShort(iso) {
  if (!iso) return "";
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
function capitalize(str = "") {
  if (!str) return "";
  return str[0].toUpperCase() + str.slice(1);
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&lt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

/* ========== ICON HELPERS (Font Awesome classes) ========== */

function getDosageIconClass(dosageText = "") {
  const t = (dosageText || "").toLowerCase();
  if (t.includes("inhaler")) return "fa-solid fa-lungs";
  if (t.includes("syrup") || t.includes("liquid")) return "fa-solid fa-bottle-droplet";
  if (t.includes("cream") || t.includes("ointment")) return "fa-solid fa-pump-medical";
  if (t.includes("insulin") || t.includes("vial") || t.includes("pen")) return "fa-solid fa-syringe";
  if (t.includes("drop")) return "fa-solid fa-eye-dropper";
  if (t.includes("capsule")) return "fa-solid fa-capsules";
  if (t.includes("tablet") || t.includes("pill")) return "fa-solid fa-pills";
  return "fa-solid fa-prescription-bottle-medical";
}

// For modal detail rows
function setDetailWithIcon(el, iconClass, text) {
  if (!el) return;
  const safeText = text && String(text).trim() ? String(text).trim() : "—";
  el.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i><span>${safeText}</span>`;
}

function getUrgencyClass(level = "") {
  const l = level.toLowerCase();
  if (l === "low") return "urgency-low";
  if (l === "high") return "urgency-high";
  if (l === "urgent") return "urgency-urgent";
  return "urgency-medium";
}

/* ========== PROFILE MODAL ========== */
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

/* ========== STATE ========== */
let currentUser = null;
let unsubAllDonations = null;
let unsubMyDonations = null;
let unsubUserDoc = null;

let allDonationsData = [];
let myDonationsData = [];

let editingDonationId = null;

// DOM refs
let pills;
let createPanel;
let allDonationsPanel;
let myDonationsPanel;
let sidebar;
let mainGrid;

let allDonationsList;
let myDonationsList;

let allDonationsCount;
let myDonationsCount;
let youDonations;
let youImpactPeople;
let allDonationsStat;
let peopleHelpedStat;

let filterCategory;
let filterUrgency;

let donationForm;
let quantitySelect;
let medicinesList;
let imagePreview;
let imageUrlInput;
let cloudinaryUploadBtn;
let btnBack;

let signInBtn;

let modal;
let modalTypeLabel;
let modalName;
let modalCategoryChip;
let modalDosage;
let modalQuantity;
let modalExpiration;
let modalCondition;
let modalUrgency;
let modalLocation;
let modalDescription;
let modalImage;
let modalCloseBtn;
let modalEditBtn;
let modalDeleteBtn;
let modalMessageBtn;
let modalStatusAvailable;
let modalStatusUnavailable;

// Image viewer
let imageViewerEl = null;
let imageViewerImageEl = null;
let imageViewerCloseBtn = null;

let activeDonation = null;
let activeIsMine = false;

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
  if (!pills) return;
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
    donorPhoto: d.donorPhoto || d.donorAvatar || d.photoURL || null, // keep donor avatar for messaging
    createdAt: createdAt.toISOString(),
    status,
    cityMunicipality: d.cityMunicipality || d.city || "",
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

function getShortLocation(d) {
  if (!d) return "";
  if (d.cityMunicipality) return d.cityMunicipality;

  let loc = d.pickupLocation || "";
  if (!loc) return "";

  const [leftPart] = loc.split("—");
  const parts = leftPart.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return leftPart.trim();
  return parts[parts.length - 1];
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

  if (isMine) {
    small.textContent = "My donation";
  } else {
    const name = d.donorName || "Anonymous donor";
    small.textContent = `Donated by ${name}`;
  }

  body.appendChild(title);
  body.appendChild(small);

  const cardMeta = document.createElement("div");
  cardMeta.className = "card-meta";

  const dosageLabel = mapDosageLabel(d.dosageForm || "");
  if (dosageLabel && dosageLabel !== "—") {
    const span = document.createElement("span");
    span.className = "card-meta-item";
    span.innerHTML = `
      <i class="${getDosageIconClass(dosageLabel)}" aria-hidden="true"></i>
      <span>${dosageLabel}</span>
    `;
    cardMeta.appendChild(span);
  }

  if (d.expiryDate) {
    const expShort = formatExpiryShort(d.expiryDate);
    if (expShort) {
      const span = document.createElement("span");
      span.className = "card-meta-item";
      span.innerHTML = `
        <i class="fa-regular fa-calendar-check" aria-hidden="true"></i>
        <span>${expShort}</span>
      `;
      cardMeta.appendChild(span);
    }
  }

  const shortLoc = getShortLocation(d);
  if (shortLoc) {
    const span = document.createElement("span");
    span.className = "card-meta-item";
    span.innerHTML = `
      <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
      <span>${shortLoc}</span>
    `;
    cardMeta.appendChild(span);
  }

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
    modalCategoryChip.innerHTML = `
      <i class="fa-solid fa-prescription-bottle-medical" aria-hidden="true"></i>
      <span>${donation.category || "Category"}</span>
    `;
  }

  setDetailWithIcon(
    modalDosage,
    getDosageIconClass(donation.dosageForm || ""),
    mapDosageLabel(donation.dosageForm || "")
  );
  setDetailWithIcon(
    modalQuantity,
    "fa-solid fa-boxes-stacked",
    donation.quantity ? String(donation.quantity) : "—"
  );
  setDetailWithIcon(
    modalExpiration,
    "fa-regular fa-calendar-check",
    donation.expiryDate ? formatDate(donation.expiryDate) : "—"
  );
  setDetailWithIcon(
    modalCondition,
    "fa-solid fa-shield-heart",
    donation.condition || "—"
  );

  const level = (donation.urgency || "").toLowerCase();
  const urgencyClass = getUrgencyClass(level);
  const urgencyText = mapUrgencyLabel(donation.urgency);
  if (modalUrgency) {
    const safeText = urgencyText && urgencyText !== "—" ? urgencyText : "—";
    modalUrgency.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation ${urgencyClass}" aria-hidden="true"></i>
      <span>${safeText}</span>
    `;
  }

  setDetailWithIcon(
    modalLocation,
    "fa-solid fa-location-dot",
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

  // MESSAGE → opens message.html with chatWith + donationId + name + avatar
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

      // Prevent self-chat (extra guard; message.html also checks)
      if (currentUser.uid === activeDonation.userId) {
        showToast("You can't message yourself about your own donation.");
        return;
      }

      const params = new URLSearchParams();
      params.set("chatWith", activeDonation.userId);
      if (activeDonation.id) {
        params.set("donationId", activeDonation.id);
      }
      if (activeDonation.donorName) {
        params.set("name", activeDonation.donorName);
      }
      if (activeDonation.donorPhoto) {
        params.set("avatar", activeDonation.donorPhoto);
      }

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
  // Assign DOM elements AFTER the DOM is ready
  pills = Array.from(document.querySelectorAll(".pill"));
  createPanel = document.getElementById("create-panel");
  allDonationsPanel = document.getElementById("all-donations-panel");
  myDonationsPanel = document.getElementById("my-donations-panel");
  sidebar = document.getElementById("pageSidebar");
  mainGrid = document.getElementById("mainGrid");

  allDonationsList = document.getElementById("allDonationsList");
  myDonationsList = document.getElementById("myDonationsList");

  allDonationsCount = document.getElementById("allDonationsCount");
  myDonationsCount = document.getElementById("myDonationsCount");
  youDonations = document.getElementById("youDonations");
  youImpactPeople = document.getElementById("youImpactPeople");
  allDonationsStat = document.getElementById("allDonations");
  peopleHelpedStat = document.getElementById("peopleHelped");

  filterCategory = document.getElementById("filterCategory");
  filterUrgency = document.getElementById("filterUrgency");

  donationForm = document.getElementById("donationForm");
  quantitySelect = document.getElementById("quantity");
  medicinesList = document.getElementById("medicinesList");
  imagePreview = document.getElementById("imagePreview");
  imageUrlInput = document.getElementById("imageUrl");
  cloudinaryUploadBtn = document.getElementById("cloudinaryUploadBtn");
  btnBack = document.getElementById("btnBack");

  signInBtn = document.querySelector(".sign-in-btn");

  modal = document.getElementById("dmModal");
  modalTypeLabel = document.getElementById("modalTypeLabel");
  modalName = document.getElementById("modalName");
  modalCategoryChip = document.getElementById("modalCategoryChip");
  modalDosage = document.getElementById("modalDosage");
  modalQuantity = document.getElementById("modalQuantity");
  modalExpiration = document.getElementById("modalExpiration");
  modalCondition = document.getElementById("modalCondition");
  modalUrgency = document.getElementById("modalUrgency");
  modalLocation = document.getElementById("modalLocation");
  modalDescription = document.getElementById("modalDescription");
  modalImage = document.getElementById("modalImage");
  modalCloseBtn = document.getElementById("modalCloseBtn");
  modalEditBtn = document.getElementById("modalEditBtn");
  modalDeleteBtn = document.getElementById("modalDeleteBtn");
  modalMessageBtn = document.getElementById("modalMessageBtn");
  modalStatusAvailable = document.getElementById("modalStatusAvailable");
  modalStatusUnavailable = document.getElementById("modalStatusUnavailable");

  // Now that DOM refs exist, initialise features
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

  onAuthStateChanged(auth, (user) => {
    currentUser = user || null;

    if (!user) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      renderSignedOut();
      listenMyDonations(null);
    } else {
      listenToUserDoc(user);
      listenMyDonations(user.uid);
    }

    updateHeaderForUser(currentUser);
  });
});
