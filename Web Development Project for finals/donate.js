// donate.js — combined Firebase + UI + Firestore-only All Donations (module)
// Panels separated / registrable via registerDonationPanels()
// Required in donate.html:
//   <script src="https://widget.cloudinary.com/v2.0/global/all.js"></script>
//   <script type="module" src="donate.js"></script>

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
  limit,
  serverTimestamp,
  updateDoc,
  setDoc,
  increment,
  deleteDoc,
  getDocs,
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
const CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
const CLOUDINARY_UPLOAD_PRESET = "donormedix";
const PH_DATA_URL =
  "https://raw.githubusercontent.com/flores-jacob/philippine-regions-provinces-cities-municipalities-barangays/master/philippine_provinces_cities_municipalities_and_barangays_2019v2.json";
const STORAGE_KEY = "donor_medix_donations_v1";

/* ===== Inject user-requested styles for cards & modals ===== */
(function injectRequestStyles() {
  const css = [
    ".request-card{display:flex;flex-direction:row;align-items:stretch;gap:16px;padding:14px 16px;border-radius:18px;background:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,.12);border:1px solid rgba(148,163,184,.35);}",
    ".request-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}",
    ".request-header-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}",
    ".request-title{font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".request-requester{font-size:.85rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}",
    ".request-open-btn{align-self:flex-start;margin-top:6px;padding:6px 16px;border-radius:999px;border:none;background:#0f172a;color:#ffffff;font-weight:600;font-size:.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 8px 24px rgba(15,23,42,.25);transition:transform .12s ease,box-shadow .12s ease,background .12s ease;}",
    ".request-open-btn:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(15,23,42,.28);background:#020617;}",
    ".request-open-btn:active{transform:translateY(0);box-shadow:0 6px 18px rgba(15,23,42,.24);}",
    ".request-open-btn-icon{font-size:1rem;}",
    ".request-image-wrap{width:160px;height:115px;flex-shrink:0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#f1f5f9 40%,#e2e8f0 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.25);}",
    ".request-image-wrap img{width:100%;height:100%;object-fit:cover;display:block;}",
    "@media (max-width:640px){.request-card{padding:12px 12px;}.request-image-wrap{width:130px;height:100px;}.request-title{max-width:180px;}.request-requester{max-width:180px;}}",
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
    ".btn-like.active{background:#fecaca;border-color:#fca5a5;}"
  ].join("\n");
  const style = document.createElement("style");
  style.setAttribute("data-generated-by", "donate.js-request-styles");
  style.innerHTML = css;
  (document.head || document.documentElement).appendChild(style);
})();

/* ========== FIREBASE INIT ========== */
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let unsubUserDoc = null;
let unsubEvents = null;
let unsubMyDonations = null;
let unsubAllDonations = null;

/* ========== DOM HELPERS & LAZY PANEL REGISTRATION ========== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const pills = Array.from(document.querySelectorAll(".switcher .pill") || []);

// panels are now lazy (can be registered later)
let createPanel = document.getElementById("create-panel");
let myDonationsPanel = document.getElementById("my-donations-panel");
let allDonationsPanel = document.getElementById("all-donations-panel");
let sidebar = document.getElementById("pageSidebar");
let mainGrid = document.getElementById("mainGrid");

// rest of DOM refs (these typically exist on page)
const myDonationsList = document.getElementById("myDonationsList");
const myDonationsCount = document.getElementById("myDonationsCount");
const youDonations = document.getElementById("youDonations");
const youImpactPeople = document.getElementById("youImpactPeople");
const allDonations = document.getElementById("allDonations");
const peopleHelped = document.getElementById("peopleHelped");

const donationForm = document.getElementById("donationForm");
const cloudinaryUploadBtn = document.getElementById("cloudinaryUploadBtn");
const imagePreview = document.getElementById("imagePreview");
const imageUrlInput = document.getElementById("imageUrl");
const btnBack = document.getElementById("btnBack");

const medicineNameInput = document.getElementById("medicineName");
const medicinesList = document.getElementById("medicinesList");
const quantitySelect = document.getElementById("quantity");

const signInBtn = document.querySelector(".sign-in-btn");
const bellBtn = document.querySelector(".bell-btn");
const notifBadge = document.getElementById("notifBadge");

// Filters (All Donations)
const filterCategory = document.getElementById("filterCategory");
const filterUrgency = document.getElementById("filterUrgency");

/* ========== UTILS ========== */
function onReady(fn) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}
function showToast(msg) {
  const toastEl = document.getElementById("toast");
  if (toastEl) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 3000);
  } else {
    console.info("Toast:", msg);
  }
}
function escapeHtml(s = "") {
  return String(s).replace(/[&<"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function isoNow() { return new Date().toISOString(); }
function formatDate(iso) { try { return new Date(iso).toLocaleDateString(); } catch { return iso || ""; } }
const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  const units = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [name, sec] of units) {
    if (diffSec >= sec) return timeFmt.format(-Math.floor(diffSec / sec), name);
  }
  return "just now";
}

/* ========== LocalStorage helpers ========== */
function loadLocalDonations() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { console.warn("loadLocalDonations err", e); return []; }
}
function saveLocalDonations(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) { console.warn("saveLocalDonations err", e); }
}

/* ========== UI Populate ========== */
function populateQuantity() {
  if (!quantitySelect) return;
  quantitySelect.innerHTML = "";
  for (let i = 1; i <= 50; i++) {
    const o = document.createElement("option"); o.value = String(i); o.textContent = String(i); quantitySelect.appendChild(o);
  }
  quantitySelect.value = "1";
}
function populateMedicinesDatalist() {
  if (!medicinesList) return;
  const samples = ["Paracetamol 500 mg","Ibuprofen 200 mg","Amoxicillin 500 mg","Cetirizine 10 mg","Azithromycin 250 mg","Salbutamol Inhaler"];
  medicinesList.innerHTML = "";
  samples.forEach(n => { const o = document.createElement("option"); o.value = n; medicinesList.appendChild(o); });
}

/* ========== PH Locations ========== */
let PH_DATA = null;
let phDataPromise = null;
async function loadPhData() {
  if (PH_DATA) return PH_DATA;
  if (phDataPromise) return phDataPromise;
  phDataPromise = fetch(PH_DATA_URL).then(r => { if (!r.ok) throw new Error("Failed to fetch PH data"); return r.json(); }).then(json => { PH_DATA = json; return PH_DATA; }).catch(err => { console.warn("loadPhData error", err); PH_DATA = null; phDataPromise = null; return null; });
  return phDataPromise;
}
function clearSelect(sel, placeholder) {
  if (!sel) return; sel.innerHTML = ""; const o = document.createElement("option"); o.value = ""; o.textContent = placeholder; sel.appendChild(o);
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
  selRegion.disabled = false; selProvince.disabled = true; selCityMun.disabled = true; selBarangay.disabled = true;

  loadPhData().then(data => {
    if (!data) return;
    Object.entries(data).forEach(([regionCode, regionObj]) => {
      if (!regionObj) return;
      const opt = document.createElement("option"); opt.value = regionCode; opt.textContent = regionObj.region_name || regionCode; selRegion.appendChild(opt);
    });
  });

  selRegion.addEventListener("change", () => {
    const regionCode = selRegion.value;
    clearSelect(selProvince, "Select Province…"); clearSelect(selCityMun, "Select City/Municipality…"); clearSelect(selBarangay, "Select Barangay…");
    selProvince.disabled = true; selCityMun.disabled = true; selBarangay.disabled = true;
    if (!regionCode || !PH_DATA || !PH_DATA[regionCode]) return;
    const regionObj = PH_DATA[regionCode]; const provinces = regionObj.province_list || {};
    Object.keys(provinces).forEach(pn => { const o = document.createElement("option"); o.value = pn; o.textContent = pn; selProvince.appendChild(o); });
    selProvince.disabled = false;
  });
  selProvince.addEventListener("change", () => {
    const regionCode = selRegion.value; const provName = selProvince.value;
    clearSelect(selCityMun, "Select City/Municipality…"); clearSelect(selBarangay, "Select Barangay…");
    selCityMun.disabled = true; selBarangay.disabled = true;
    if (!regionCode || !provName || !PH_DATA) return;
    const regionObj = PH_DATA[regionCode];
    if (!regionObj || !regionObj.province_list || !regionObj.province_list[provName]) return;
    const municipalityList = regionObj.province_list[provName].municipality_list || {};
    Object.keys(municipalityList).forEach(mn => { const o = document.createElement("option"); o.value = mn; o.textContent = mn; selCityMun.appendChild(o); });
    selCityMun.disabled = false;
  });
  selCityMun.addEventListener("change", () => {
    const regionCode = document.getElementById("selRegion").value;
    const provName = document.getElementById("selProvince").value;
    const munName = document.getElementById("selCityMun").value;
    const selBrgy = document.getElementById("selBarangay");
    clearSelect(selBrgy, "Select Barangay…"); selBrgy.disabled = true;
    if (!regionCode || !provName || !munName || !PH_DATA) return;
    const regionObj = PH_DATA[regionCode];
    const provinceObj = regionObj && regionObj.province_list && regionObj.province_list[provName];
    const municipalityObj = provinceObj && provinceObj.municipality_list && provinceObj.municipality_list[munName];
    const brgyList = (municipalityObj && municipalityObj.barangay_list) || [];
    brgyList.forEach(b => { const o = document.createElement("option"); o.value = b; o.textContent = b; selBrgy.appendChild(o); });
    selBrgy.disabled = brgyList.length === 0;
  });
}

/* ========== Cloudinary (with fallback) ========== */
function setupCloudinaryUpload() {
  const uploadBtn = cloudinaryUploadBtn, imageInput = imageUrlInput, previewImg = imagePreview;
  if (!uploadBtn || !imageInput) return;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) { setupFileFallback(); return; }
  function initWidget() {
    if (!window.cloudinary || !window.cloudinary.createUploadWidget) { setupFileFallback(); return; }
    const widget = window.cloudinary.createUploadWidget({
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      sources: ["local", "camera", "url"],
      multiple: false,
      maxFiles: 1,
      folder: "donormedix_donations",
    }, (err, result) => {
      if (err) { console.warn("cloudinary err", err); showToast("Image upload failed."); return; }
      if (result && result.event === "success") {
        const url = result.info.secure_url;
        imageInput.value = url; if (previewImg) { previewImg.src = url; previewImg.style.display = "block"; }
      }
    });
    uploadBtn.addEventListener("click", (e) => { e.preventDefault(); widget.open(); });
  }
  if (document.readyState === "complete" || document.readyState === "interactive") initWidget();
  else window.addEventListener("load", initWidget);
}
function setupFileFallback() {
  const uploadBtn = cloudinaryUploadBtn, imageInput = imageUrlInput, previewImg = imagePreview;
  if (!uploadBtn || !imageInput) return;
  uploadBtn.textContent = "Choose image";
  let fileInput = document.getElementById("_donor_file_input");
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.id = "_donor_file_input";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
  }
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      imageInput.value = reader.result; if (previewImg) { previewImg.src = reader.result; previewImg.style.display = "block"; }
    };
    reader.readAsDataURL(f);
  });
}

/* ========== PROFILE & NOTIFICATIONS UI ========== */
// (unchanged; same behaviour as original code)
let profileModal = null;
let notifModal = null;
function ensureProfileModal() {
  if (profileModal) return profileModal;
  profileModal = document.createElement("div"); profileModal.id = "dm_profile_modal";
  Object.assign(profileModal.style, { position: "fixed", zIndex: "1000", right: "16px", top: "64px", width: "min(92vw,300px)", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 16px 44px rgba(0,0,0,.12)", display: "none" });
  profileModal.innerHTML = `
    <div style="padding:12px;border-bottom:1px solid #eef2f6;display:flex;gap:10px;align-items:center">
      <div id="dm_profile_avatar" style="width:44px;height:44px;border-radius:10px;background:#f1f5f9;display:grid;place-items:center;font-weight:800"></div>
      <div style="min-width:0">
        <div id="dm_profile_name" style="font-weight:700;color:#0f172a">User</div>
        <div id="dm_profile_email" style="font-size:.9rem;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
      </div>
    </div>
    <div style="padding:12px;display:flex;gap:8px">
      <a href="profile.html" style="flex:1;text-align:center;text-decoration:none;padding:8px;border-radius:8px;background:#0f172a;color:#fff;font-weight:800">Go to Profile</a>
      <button id="dm_signout" style="flex:1;padding:8px;border-radius:8px;background:#fff;border:1px solid #e2e8f0;font-weight:800;cursor:pointer">Sign Out</button>
    </div>
  `;
  document.body.appendChild(profileModal);
  profileModal.querySelector("#dm_signout").addEventListener("click", async () => { try { await signOut(auth); } catch (e) { console.warn("signout err", e); } profileModal.style.display = "none"; });
  document.addEventListener("click", (e) => { if (!profileModal) return; if (profileModal.style.display === "none") return; if (e.target === profileModal || profileModal.contains(e.target)) return; if (signInBtn && (e.target === signInBtn || signInBtn.contains(e.target))) return; profileModal.style.display = "none"; });
  return profileModal;
}
function updateProfileUI(u, userData) {
  if (!signInBtn) return;
  const name = userData?.name || u?.displayName || (u?.email ? u.email.split("@")[0] : "Profile");
  signInBtn.textContent = name; signInBtn.title = name;
  ensureProfileModal();
  const nm = document.getElementById("dm_profile_name"), em = document.getElementById("dm_profile_email"), av = document.getElementById("dm_profile_avatar");
  if (nm) nm.textContent = name; if (em) em.textContent = u?.email || ""; if (av) av.textContent = name.slice(0,2).toUpperCase();
  signInBtn.onclick = (e) => { e.preventDefault(); profileModal.style.display = profileModal.style.display === "none" ? "block" : "none"; };
}
function renderSignedOutHeader() { if (!signInBtn) return; signInBtn.textContent = "Sign In"; signInBtn.onclick = () => (window.location.href = "auth.html"); if (profileModal) profileModal.style.display = "none"; }

function ensureNotifModal() {
  if (notifModal) return notifModal;
  notifModal = document.createElement("div"); notifModal.id = "dm_notif_modal";
  Object.assign(notifModal.style, { position: "fixed", zIndex: "1000", right: "220px", top: "64px", width: "min(92vw,240px)", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 16px 44px rgba(0,0,0,.12)", display: "none", maxHeight: "72vh", overflow: "auto" });
  notifModal.innerHTML = `
    <div style="padding:10px;border-bottom:1px solid #eef2f6;display:flex;justify-content:space-between;align-items:center">
      <strong style="font-weight:900;color:#0f172a">Notifications</strong>
      <button id="dm_notif_close" style="border:none;background:transparent;cursor:pointer;font-weight:900">×</button>
    </div>
    <div id="dm_notif_list" style="padding:10px;background:#f8fafc">
      <div style="color:#64748b">No notifications yet.</div>
    </div>
  `;
  document.body.appendChild(notifModal);
  document.getElementById("dm_notif_close").addEventListener("click", () => (notifModal.style.display = "none"));
  document.addEventListener("click", (e) => { if (!notifModal) return; if (notifModal.style.display === "none") return; if (e.target === notifModal || notifModal.contains(e.target)) return; if (bellBtn && (e.target === bellBtn || bellBtn.contains(e.target))) return; notifModal.style.display = "none"; });
  return notifModal;
}
function renderEventsList(items) {
  ensureNotifModal();
  const list = document.getElementById("dm_notif_list");
  if (!list) return;
  if (!items || !items.length) { list.innerHTML = `<div style="color:#64748b;padding:8px">No notifications yet.</div>`; if (notifBadge) notifBadge.style.display = "none"; return; }
  list.innerHTML = items.map(ev => {
    const when = ev.createdAt ? (ev.createdAt.toDate ? timeAgo(ev.createdAt.toDate()) : timeAgo(new Date(ev.createdAt))) : "";
    return `<div style="padding:10px;border:1px solid #eef2f6;border-radius:12px;margin-bottom:8px;background:#fff"><div style="font-weight:700;color:#0f172a">${escapeHtml(ev.userName || "Someone")}</div><div style="color:#0f172a;margin-top:6px">${escapeHtml(ev.message || "")}</div><div style="color:#64748b;font-size:.85rem;margin-top:6px">${when}</div></div>`;
  }).join("");
  if (notifBadge) { notifBadge.style.display = "inline-block"; notifBadge.textContent = String(items.length); }
}
function listenToEvents() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  try {
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"), limit(20));
    unsubEvents = onSnapshot(q, snap => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...(d.data() || {}) }));
      renderEventsList(items);
    }, err => { console.warn("events listen err", err); renderEventsList([]); });
  } catch (e) { console.warn("listenToEvents err", e); }
}

/* ========== RENDER / SUBSCRIPTIONS ========== */
function clearUnsubMyDonations() { if (unsubMyDonations) { unsubMyDonations(); unsubMyDonations = null; } }
function clearUnsubAllDonations() { if (unsubAllDonations) { unsubAllDonations(); unsubAllDonations = null; } }

/* Shared helper: build normalized donation object for UI */
function normalizeDonation(d) {
  const item = { id: d.id || d.localId || ("local_" + Date.now()), medicineName: d.medicineName || "", description: d.description || "", imageUrl: d.imageUrl || "", quantity: d.quantity || "", expiryDate: d.expiryDate ? (d.expiryDate.toDate ? d.expiryDate.toDate().toISOString() : d.expiryDate) : "", urgency: d.urgency || "", category: d.category || "", pickupLocation: d.pickupLocation || "", condition: d.condition || "", userId: d.userId || d.ownerId || null, createdAt: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (new Date(d.createdAt)).toISOString()) : (d.createdAtIso || d.createdAt || isoNow()), donorName: d.donorName || d.name || "" };
  return item;
}

/* ========== RENDER: All Donations (FIRESTORE ONLY) ========== */
function collectAllFilters() {
  return {
    category: filterCategory ? (filterCategory.value || "").trim() : "",
    urgency: filterUrgency ? (filterUrgency.value || "").trim() : "",
  };
}
function applyFilters(items, filters) {
  if (!filters) filters = collectAllFilters();
  return (items || []).filter(it => {
    if (filters.category && (it.category || "") !== filters.category) return false;
    if (filters.urgency && (it.urgency || "") !== filters.urgency) return false;
    return true;
  });
}

/* ====== Replacement createDonationCard using request-card design ===== */
function createDonationCard(it, opts = {}) {
  const onClick = typeof opts.onClick === "function" ? opts.onClick : null;
  const compact = !!opts.compact;

  const card = document.createElement("div");
  card.className = "request-card";
  card.tabIndex = 0;

  // left/main
  const main = document.createElement("div");
  main.className = "request-main";

  // header row: title + donor
  const headerRow = document.createElement("div");
  headerRow.className = "request-header-row";

  const title = document.createElement("div");
  title.className = "request-title";
  title.textContent = it.medicineName || it.title || "Medicine";

  const requester = document.createElement("div");
  requester.className = "request-requester";
  requester.textContent = (it.donorName || it.userId || "Anonymous");

  headerRow.appendChild(title);
  headerRow.appendChild(requester);
  main.appendChild(headerRow);

  // description (single-line trimmed)
  if (!compact && it.description) {
    const desc = document.createElement("div");
    desc.style.color = "#64748b";
    desc.style.fontSize = ".92rem";
    desc.style.marginTop = "6px";
    desc.style.whiteSpace = "nowrap";
    desc.style.overflow = "hidden";
    desc.style.textOverflow = "ellipsis";
    desc.textContent = it.description;
    main.appendChild(desc);
  }

  // meta row (category/urgency/qty) as small pills if present
  const pillRow = document.createElement("div");
  pillRow.className = "tag-row";
  if (it.category) {
    const p = document.createElement("div"); p.className = "tag"; p.textContent = it.category; pillRow.appendChild(p);
  }
  if (it.urgency) {
    const p = document.createElement("div"); p.className = "tag"; p.textContent = it.urgency; pillRow.appendChild(p);
  }
  if (it.quantity) {
    const p = document.createElement("div"); p.className = "tag"; p.textContent = `Qty: ${it.quantity}`; pillRow.appendChild(p);
  }
  if (pillRow.children.length) main.appendChild(pillRow);

  // open button
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "request-open-btn";
  openBtn.innerHTML = `<span class="request-open-btn-icon">➡</span><span>Open</span>`;
  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) onClick(it, opts.context || {});
    else if (typeof window.onOpenDonation === "function") window.onOpenDonation(it);
    else if (typeof openDonationModal === "function") openDonationModal(it);
  });

  main.appendChild(openBtn);

  // right image wrap
  const imgWrap = document.createElement("div");
  imgWrap.className = "request-image-wrap";
  if (it.imageUrl) {
    const img = document.createElement("img");
    img.src = it.imageUrl;
    img.alt = it.medicineName || "image";
    img.loading = "lazy";
    imgWrap.appendChild(img);
  } else {
    // placeholder — you can replace with a path to your uploaded png if you want
    imgWrap.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#f1f5f9"/></svg>`;
  }

  card.appendChild(main);
  card.appendChild(imgWrap);

  // card click opens too
  card.addEventListener("click", (e) => {
    if (e.target && (e.target.closest && e.target.closest('.request-open-btn'))) return;
    if (onClick) onClick(it, opts.context || {});
    else if (typeof window.onOpenDonation === "function") window.onOpenDonation(it);
    else if (typeof openDonationModal === "function") openDonationModal(it);
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (onClick) onClick(it, opts.context || {}); else if (typeof openDonationModal === "function") openDonationModal(it); }
  });

  return card;
}

/* ====== UPDATED: renderAllList uses createDonationCard and duplicates into output area ====== */
function renderAllList(items) {
  const container = document.getElementById('allDonationsList');
  const emptyEl = document.getElementById('allEmpty');
  const countEl = document.getElementById('allDonationsCount');
  const outWrapper = document.getElementById('donationsOutput');
  if (!container) return;

  window.__lastDonationItems = Array.isArray(items) ? items.slice() : [];
  const filtered = applyFilters(items, collectAllFilters());

  // clear
  container.innerHTML = '';
  if (outWrapper) outWrapper.innerHTML = '';

  if (!filtered.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (countEl) countEl.textContent = 'No donations found';
    if (outWrapper) {
      const empty = document.getElementById('donationsOutputEmpty');
      if (empty) empty.style.display = 'block';
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (countEl) countEl.textContent = `Showing ${filtered.length} community donations`;
  if (outWrapper) {
    const empty = document.getElementById('donationsOutputEmpty');
    if (empty) empty.style.display = 'none';
  }

  filtered.forEach(it => {
    const card = createDonationCard(it, { onClick: (item) => {
      if (typeof window.onOpenDonation === 'function') window.onOpenDonation(item);
      else openDonationModal(item);
    }, compact: false, context: { source: 'firestore', docId: it.id } });

    container.appendChild(card);

    // also append to shared output if present (clone to avoid moving the element)
    if (outWrapper) {
      const clone = card.cloneNode(true);
      outWrapper.appendChild(clone);
      // attach click to clone (clone lost original event handlers)
      clone.addEventListener('click', () => {
        if (typeof window.onOpenDonation === 'function') window.onOpenDonation(it);
        else openDonationModal(it);
      });
      clone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (typeof window.onOpenDonation === 'function') window.onOpenDonation(it); else openDonationModal(it); }
      });
    }
  });
}

/* ===== New: robust Firestore listener with fallback when orderBy fails ===== */
function renderAllDonationsFromFirestore() {
  if (unsubAllDonations) { unsubAllDonations(); unsubAllDonations = null; }
  try {
    // try listening with orderBy createdAt (preferred)
    const qOrdered = query(collection(db, "donations"), orderBy("createdAt", "desc"));
    unsubAllDonations = onSnapshot(qOrdered, snap => {
      const arr = [];
      snap.forEach(d => { const data = d.data() || {}; arr.push(normalizeDonation({ id: d.id, ...data })); });
      window.__lastDonationItems = arr.slice();
      renderAllList(arr);
    }, async (err) => {
      console.warn("Ordered snapshot failed:", err);
      showToast("Could not load ordered donations; falling back. Check console for details.");
      // fallback: listen to collection without order and sort client-side
      try {
        if (unsubAllDonations) { unsubAllDonations(); unsubAllDonations = null; }
        unsubAllDonations = onSnapshot(collection(db, "donations"), snap2 => {
          const arr2 = [];
          snap2.forEach(d2 => { const data2 = d2.data() || {}; arr2.push(normalizeDonation({ id: d2.id, ...data2 })); });
          // try sort by createdAt if present
          arr2.sort((a,b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
          });
          window.__lastDonationItems = arr2.slice();
          renderAllList(arr2);
        }, err2 => {
          console.error("Fallback all donations snapshot err", err2);
          renderAllList([]);
        });
      } catch (fb) {
        console.error("Failed fallback listener for all donations:", fb);
        renderAllList([]);
      }
    });
  } catch (e) {
    console.warn("renderAllDonationsFromFirestore top-level err", e);
    showToast("Error loading donations. Check console.");
    // final fallback: one-time get and render
    try {
      getDocs(collection(db, "donations")).then(snap => {
        const arr = [];
        snap.forEach(d => { const data = d.data() || {}; arr.push(normalizeDonation({ id: d.id, ...data })); });
        arr.sort((a,b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        window.__lastDonationItems = arr.slice();
        renderAllList(arr);
      }).catch(err => { console.error("final fallback getDocs err", err); renderAllList([]); });
    } catch (finalErr) {
      console.error("renderAllDonationsFromFirestore final err", finalErr);
      renderAllList([]);
    }
  }
}

/* ========== RENDER: My Donations ========== */
function renderMyDonationsFromLocal() {
  const arr = loadLocalDonations();
  if (!myDonationsList) return;
  myDonationsList.innerHTML = "";
  const outWrapper = document.getElementById('donationsOutput');
  if (outWrapper) outWrapper.innerHTML = outWrapper.innerHTML || "";

  if (!arr.length) {
    myDonationsList.innerHTML = `<div class="requests-empty">You don't have any donations yet.</div>`;
    if (myDonationsCount) myDonationsCount.textContent = `Showing 0 of your donations`;
    if (outWrapper) {
      const outEmpty = document.getElementById('donationsOutputEmpty');
      if (outEmpty) outEmpty.style.display = 'block';
    }
  } else {
    if (outWrapper) {
      const outEmpty = document.getElementById('donationsOutputEmpty');
      if (outEmpty) outEmpty.style.display = 'none';
    }
    arr.slice().reverse().forEach(dRaw => {
      const d = normalizeDonation(dRaw);
      const card = createDonationCard(d, { onClick: (item) => openDonationModal(item), compact: false, context: { source: "local" } });
      myDonationsList.appendChild(card);

      if (outWrapper) {
        const cloned = card.cloneNode(true);
        outWrapper.appendChild(cloned);
        cloned.addEventListener('click', () => openDonationModal(d));
        cloned.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDonationModal(d); }});
      }
    });
    if (myDonationsCount) myDonationsCount.textContent = `Showing ${arr.length} of your donations`;
  }
  // stats
  if (youDonations) youDonations.textContent = arr.length;
  if (youImpactPeople) youImpactPeople.textContent = arr.length * 2;
  if (allDonations) allDonations.textContent = arr.length;
  if (peopleHelped) peopleHelped.textContent = Math.floor(arr.length * 2.5);
  if (notifBadge) { notifBadge.style.display = arr.length ? "inline-block" : "none"; notifBadge.textContent = arr.length || ""; }
}

function renderMyDonationsFromFirestore(uid) {
  clearUnsubMyDonations();
  if (!uid) return renderMyDonationsFromLocal();
  try {
    // Preferred: where + orderBy (may need index)
    const qPreferred = query(collection(db, "donations"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    unsubMyDonations = onSnapshot(qPreferred, snap => {
      const arr = [];
      snap.forEach(d => { const data = d.data() || {}; arr.push(normalizeDonation({ id: d.id, ...data })); });
      if (!myDonationsList) return;
      myDonationsList.innerHTML = "";

      if (!arr.length) {
        myDonationsList.innerHTML = `<div class="requests-empty">You don't have any donations yet.</div>`;
        if (myDonationsCount) myDonationsCount.textContent = `Showing 0 of your donations`;
      } else {
        arr.forEach(dRaw => {
          const d = normalizeDonation(dRaw);
          const card = createDonationCard(d, { onClick: (item) => openDonationModal(item), compact: false, context: { source: 'firestore', docId: dRaw.id } });
          myDonationsList.appendChild(card);

          const outWrapper = document.getElementById('donationsOutput');
          if (outWrapper) {
            const cloned = card.cloneNode(true);
            outWrapper.appendChild(cloned);
            cloned.addEventListener('click', () => openDonationModal(d));
            cloned.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDonationModal(d); }});
          }
        });
        if (myDonationsCount) myDonationsCount.textContent = `Showing ${arr.length} of your donations`;
      }
      // stats
      if (youDonations) youDonations.textContent = arr.length;
      if (youImpactPeople) youImpactPeople.textContent = Math.max(0, arr.length * 2);
      if (allDonations) allDonations.textContent = arr.length;
      if (peopleHelped) peopleHelped.textContent = Math.max(0, Math.floor(arr.length * 2.5));
      if (notifBadge) { notifBadge.style.display = arr.length ? "inline-block" : "none"; notifBadge.textContent = arr.length || ""; }
    }, async (err) => {
      console.warn("My donations ordered snapshot failed:", err);
      showToast("Could not load your donations in ordered mode; falling back.");
      // fallback: listen to collection and filter client-side
      try {
        if (unsubMyDonations) { unsubMyDonations(); unsubMyDonations = null; }
        unsubMyDonations = onSnapshot(collection(db, "donations"), snap2 => {
          const arr2 = [];
          snap2.forEach(d2 => {
            const data2 = d2.data() || {};
            if (data2.userId === uid) arr2.push(normalizeDonation({ id: d2.id, ...data2 }));
          });
          arr2.sort((a,b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
          });
          if (!myDonationsList) return;
          myDonationsList.innerHTML = "";
          if (!arr2.length) {
            myDonationsList.innerHTML = `<div class="requests-empty">You don't have any donations yet.</div>`;
            if (myDonationsCount) myDonationsCount.textContent = `Showing 0 of your donations`;
          } else {
            arr2.forEach(dRaw => {
              const d = normalizeDonation(dRaw);
              const card = createDonationCard(d, { onClick: (item) => openDonationModal(item), compact: false, context: { source: 'firestore', docId: dRaw.id } });
              myDonationsList.appendChild(card);
            });
            if (myDonationsCount) myDonationsCount.textContent = `Showing ${arr2.length} of your donations`;
          }
        }, err2 => {
          console.error("Fallback my donations snapshot err", err2);
          renderMyDonationsFromLocal();
        });
      } catch (fb) {
        console.error("My donations fallback err", fb);
        renderMyDonationsFromLocal();
      }
    });
  } catch (e) {
    console.warn("renderMyDonationsFromFirestore top-level err", e);
    renderMyDonationsFromLocal();
  }
}

/* ========== DETAILS MODAL (view + delete + message) ========== */
let detailsModalSingleton = null;
function ensureDetailsModal() {
  if (detailsModalSingleton) return detailsModalSingleton;
  detailsModalSingleton = document.createElement("div");
  detailsModalSingleton.id = "dm_details_modal";
  Object.assign(detailsModalSingleton.style, { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 2000, display: "none", padding: 0 });
  detailsModalSingleton.innerHTML = `
    <div class="detail-modal-card" id="dm_detail_card">
      <div class="detail-header">
        <div class="detail-header-main">
          <div class="detail-title" id="dm_details_title">Donation</div>
          <div class="detail-sub" id="dm_details_sub">Details</div>
        </div>
        <button class="detail-close-btn" id="dm_details_close">Close</button>
      </div>
      <div class="detail-body">
        <div class="detail-img-wrap" id="dm_detail_img">
          <!-- image -->
        </div>
        <div class="detail-body-main" id="dm_details_body"></div>
      </div>
      <div class="detail-footer" id="dm_details_footer">
        <div id="dm_details_action_container"></div>
      </div>
    </div>
  `;
  document.body.appendChild(detailsModalSingleton);

  detailsModalSingleton.querySelector("#dm_details_close").addEventListener("click", () => (detailsModalSingleton.style.display = "none"));
  document.addEventListener("click", (e) => {
    if (!detailsModalSingleton) return;
    if (detailsModalSingleton.style.display === "none") return;
    if (detailsModalSingleton.contains(e.target)) return;
    detailsModalSingleton.style.display = "none";
  });

  return detailsModalSingleton;
}

async function deleteDonationHandler(context) {
  if (!context) return;
  ensureDetailsModal();
  const confirmMsg = context.source === "firestore" ? "Delete this donation from the server? This action cannot be undone." : "Remove this local donation?";
  if (!confirm(confirmMsg)) return;
  try {
    if (context.source === "firestore" && context.docId) {
      if (!currentUser) { showToast("You must be signed in to delete server donations."); return; }
      if (context.ownerId && context.ownerId !== currentUser.uid) { showToast("You can only delete your own donations."); return; }
      await deleteDoc(doc(db, "donations", context.docId));
      showToast("Donation deleted.");
      detailsModalSingleton.style.display = "none";
      if (currentUser) renderMyDonationsFromFirestore(currentUser.uid); else renderMyDonationsFromLocal();
    } else if (context.source === "local") {
      const arr = loadLocalDonations();
      const raw = context.localRaw;
      const idx = arr.findIndex(x => (x.id && raw.id && x.id === raw.id) || (x.createdAt === raw.createdAt && x.medicineName === raw.medicineName));
      if (idx >= 0) {
        arr.splice(idx, 1);
        saveLocalDonations(arr);
        showToast("Local donation removed.");
        detailsModalSingleton.style.display = "none";
        renderMyDonationsFromLocal();
      } else {
        showToast("Could not find local donation.");
      }
    }
  } catch (e) {
    console.error("deleteDonation err", e);
    showToast("Failed to delete donation.");
  }
}

function showDonationDetailsModal(donation, context) {
  const detailsModal = ensureDetailsModal();
  const title = detailsModal.querySelector("#dm_details_title");
  const body = detailsModal.querySelector("#dm_details_body");
  const imgWrap = detailsModal.querySelector("#dm_detail_img");
  const actionContainer = detailsModal.querySelector("#dm_details_action_container");

  title.textContent = donation.medicineName || "Donation details";
  imgWrap.innerHTML = donation.imageUrl ? `<img src="${escapeHtml(donation.imageUrl)}" alt="img">` : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#f1f5f9"/></svg>`;

  body.innerHTML = `
    <div class="detail-meta"><strong>Donor:</strong> ${escapeHtml(donation.donorName || donation.userId || "Anonymous")}</div>
    <div class="detail-meta"><strong>Qty:</strong> ${escapeHtml(String(donation.quantity || "—"))}</div>
    <div class="detail-meta"><strong>Expiry:</strong> ${escapeHtml(formatDate(donation.expiryDate) || "—")}</div>
    <div class="detail-desc">${escapeHtml(donation.description || "No description provided.")}</div>
  `;

  // reset action container
  actionContainer.innerHTML = "";

  const isOwner = currentUser && donation.userId === currentUser.uid;
  if (isOwner) {
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-delete";
    delBtn.textContent = "Delete";
    Object.assign(delBtn.style, { background: "#ef4444", color: "#fff", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: 800 });
    delBtn.onclick = () => deleteDonationHandler({ source: (context && context.source) || "firestore", docId: donation.id, ownerId: donation.userId, localRaw: context && context.localRaw });
    actionContainer.appendChild(delBtn);
  } else {
    const msgBtn = document.createElement("button");
    msgBtn.className = "btn btn-message";
    msgBtn.textContent = "Message Donor";
    Object.assign(msgBtn.style, { background: "#0ea5e9", color: "#fff", border: "none", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: 800 });
    msgBtn.onclick = async () => {
      if (!currentUser) { showToast("Please sign in to message donors."); window.location.href = "auth.html"; return; }
      try {
        const convId = await createOrGetConversation(currentUser.uid, donation.userId, donation.donorName || donation.userId);
        window.location.href = `chat.html?conv=${encodeURIComponent(convId)}`;
      } catch (e) {
        console.error("open chat err", e);
        showToast("Could not open chat.");
      }
    };
    actionContainer.appendChild(msgBtn);
  }

  detailsModal.style.display = "block";
}

/* ========== SWITCHER & UI (merged) ========== */
function setActivePill(pill) {
  pills.forEach(p => {
    const isActive = p === pill;
    p.classList.toggle('active', isActive);
    p.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}
function hideAllPanels() {
  [createPanel, myDonationsPanel, allDonationsPanel].forEach(el => { if (!el) return; el.style.display = 'none'; });
}
function showSidebar(shouldShow) {
  if (!sidebar || !mainGrid) return;
  if (shouldShow) { sidebar.style.display = 'flex'; mainGrid.classList.add('has-sidebar'); }
  else { sidebar.style.display = 'none'; mainGrid.classList.remove('has-sidebar'); }
}
function activateView(viewName) {
  hideAllPanels();
  const panelsMap = { create: createPanel, mine: myDonationsPanel, all: allDonationsPanel };
  const el = panelsMap[viewName] || createPanel;
  if (el) el.style.display = 'block';
  // sidebar visible only on create
  showSidebar(viewName === 'create');

  // try refresh relevant data
  if (viewName === 'mine') {
    if (currentUser) renderMyDonationsFromFirestore(currentUser.uid);
    else renderMyDonationsFromLocal();
  }
  if (viewName === 'all') {
    renderAllDonationsFromFirestore();
  }

  const targetPill = pills.find(p => (p.getAttribute('data-view') || 'create') === viewName);
  if (targetPill) setActivePill(targetPill);
}

pills.forEach(pill => {
  pill.tabIndex = 0;
  pill.addEventListener('click', () => {
    const view = pill.getAttribute('data-view') || 'create';
    activateView(view);
  });
  pill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pill.click(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = pills.indexOf(pill);
      const next = pills[(idx + 1) % pills.length];
      next.focus();
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = pills.indexOf(pill);
      const prev = pills[(idx - 1 + pills.length) % pills.length];
      prev.focus();
    }
  });
});

/* ========== SUBMIT FORM ========== */
function setupDonationForm() {
  if (!donationForm) return;
  donationForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!currentUser) { showToast("Please sign in to post a donation."); window.location.href = "auth.html"; return; }
    const submitBtn = donationForm.querySelector("button[type='submit']");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Posting..."; }
    try {
      const medicineName = (document.getElementById("medicineName")?.value || "").trim();
      const category = (document.getElementById("category")?.value || "Other").trim();
      const dosageForm = (document.getElementById("dosageForm")?.value || "").trim();
      const description = (document.getElementById("description")?.value || "").trim();
      let quantity = parseInt(document.getElementById("quantity")?.value || "1", 10); if (isNaN(quantity) || quantity <= 0) quantity = 1;
      const expiryDate = (document.getElementById("expiryDate")?.value || "").trim();
      const condition = (document.getElementById("condition")?.value || "").trim();
      const urgency = (document.getElementById("urgencyLevel")?.value || "medium").trim();
      const imageUrl = (document.getElementById("imageUrl")?.value || "").trim();

      if (!medicineName) throw new Error("Please enter medicine/item name.");
      if (!description) throw new Error("Please provide a description.");
      if (!expiryDate) throw new Error("Please select expiry date.");

      const selRegion = document.getElementById("selRegion");
      const selProvince = document.getElementById("selProvince");
      const selCityMun = document.getElementById("selCityMun");
      const selBarangay = document.getElementById("selBarangay");
      const locationText = (document.getElementById("locationText")?.value || "").trim();
      const regionText = selRegion && selRegion.value ? selRegion.options[selRegion.selectedIndex].text : "";
      const provinceText = selProvince && selProvince.value ? selProvince.options[selProvince.selectedIndex].text : "";
      const cityText = selCityMun && selCityMun.value ? selCityMun.options[selCityMun.selectedIndex].text : "";
      const brgyText = selBarangay && selBarangay.value ? selBarangay.options[selBarangay.selectedIndex].text : "";
      let pickupLocation = [brgyText, cityText, provinceText, regionText].filter(Boolean).join(", ");
      if (locationText) pickupLocation = pickupLocation ? `${pickupLocation} — ${locationText}` : locationText;

      const canonical = await getCanonicalUser(currentUser);
      const donorName = canonical.name || (currentUser.email ? currentUser.email.split("@")[0] : "Anonymous");
      const donorPhoto = canonical.photoURL || currentUser.photoURL || null;

      const docData = {
        medicineName, category, dosageForm, description, quantity, expiryDate, condition, urgency, imageUrl,
        pickupLocation, region: regionText, province: provinceText, cityMunicipality: cityText, barangay: brgyText,
        createdAt: serverTimestamp(), userId: currentUser.uid, donorName, donorPhoto,
      };

      // attempt Firestore write
      let donationRef = null;
      try { donationRef = await addDoc(collection(db, "donations"), docData); }
      catch (e) { console.warn("addDoc failed", e); donationRef = null; }

      // increment user's donations
      try {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { donations: increment(1) }).catch(async (err) => { try { await setDoc(userRef, { donations: 1 }, { merge: true }); } catch (se) { console.warn("setDoc fallback failed", se); } });
      } catch (e) { console.warn("increment user donations err", e); }

      // events doc (non-blocking)
      try {
        const eventMsg = `${donorName} posted "${medicineName}"`;
        await addDoc(collection(db, "events"), { type: "donation", message: eventMsg, userName: donorName, createdAt: serverTimestamp(), metadata: { donationId: donationRef?.id || null, userId: currentUser.uid }, read: false });
      } catch (e) { console.warn("writing events doc failed", e); }

      // always add to local fallback so user's view updates immediately when offline or before server timestamp writes
      try {
        const localArr = loadLocalDonations();
        localArr.push({
          id: donationRef?.id || ("local_" + Date.now()),
          medicineName, description, quantity, expiryDate,
          pickupLocation, imageUrl, urgency, condition, createdAtIso: isoNow(), userId: currentUser.uid, donorName
        });
        saveLocalDonations(localArr);
      } catch (e) { console.warn("local fallback save err", e); }

      showToast("Donation posted successfully!");
      donationForm.reset();
      populateQuantity();
      if (imagePreview) { imagePreview.src = ""; imagePreview.style.display = "none"; }
      if (imageUrlInput) imageUrlInput.value = "";

      // show my donations after posting
      activateView("mine");
      if (currentUser) renderMyDonationsFromFirestore(currentUser.uid); else renderMyDonationsFromLocal();
    } catch (err) {
      console.error("post donation err", err);
      showToast(err?.message || "Failed to post donation.");
    } finally {
      const submitBtn = donationForm.querySelector("button[type='submit']");
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Donation"; }
    }
  });
}

/* ========== getCanonicalUser & listenToUserDoc ========== */
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
  } catch (e) { console.warn("getCanonicalUser err", e); }
  return { name, photoURL };
}
function listenToUserDoc(u) {
  if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
  if (!u) return;
  const ref = doc(db, "users", u.uid);
  unsubUserDoc = onSnapshot(ref, snap => {
    const data = snap.exists() ? snap.data() : null;
    updateProfileUI(u, data);
  }, err => { console.warn("user doc listen err", err); updateProfileUI(u, null); });
}

/* ========== All Donations Filter hooks (selects) ========== */
function debounce(fn, wait = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function attachFilterHooks() {
  [filterCategory, filterUrgency].forEach(el => {
    if (!el) return;
    const handler = debounce(() => {
      try {
        if (Array.isArray(window.__lastDonationItems) && typeof renderAllList === 'function') {
          renderAllList(window.__lastDonationItems);
        } else {
          renderAllDonationsFromFirestore();
        }
      } catch (err) { console.warn('filtering error', err); }
    }, 150);
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
}

/* ========== PANEL REGISTRATION API ========== */
function resolveElement(elOrId) {
  if (!elOrId) return null;
  if (typeof elOrId === "string") return document.getElementById(elOrId) || document.querySelector(elOrId) || null;
  if (elOrId instanceof HTMLElement) return elOrId;
  return null;
}
function registerDonationPanels({ createPanel: c, myDonationsPanel: m, allDonationsPanel: a, pageSidebar: s, mainGrid: mg } = {}) {
  createPanel = resolveElement(c) || createPanel || null;
  myDonationsPanel = resolveElement(m) || myDonationsPanel || null;
  allDonationsPanel = resolveElement(a) || allDonationsPanel || null;
  sidebar = resolveElement(s) || sidebar || null;
  mainGrid = resolveElement(mg) || mainGrid || null;
  // if panels registered and pills exist, adjust UI
  // make sure switcher displays active pill if any
  const activeFromMarkup = pills.find(p => p.classList.contains('active')) || pills.find(p => p.getAttribute('data-view') === 'create');
  if (activeFromMarkup) activateView(activeFromMarkup.getAttribute('data-view'));
}
window.registerDonationPanels = registerDonationPanels;

/* ========== MESSAGING / CONVERSATION HELPERS ========== */
/**
 * Conversation model (Firestore)
 * /conversations/{convId} => { participants: [uid1, uid2], participantsMeta: {uid:{name,photoURL}}, lastMessage, updatedAt, createdAt }
 * /conversations/{convId}/messages/{msgId} => { from, to, text, createdAt, read }
 */

/**
 * createOrGetConversation(currentUid, otherUid, otherName) -> convId
 * - Tries to find an existing conversation with exactly these two participants (unordered).
 * - If not found, creates a new conversation doc and returns its id.
 */
async function createOrGetConversation(currentUid, otherUid, otherName = "") {
  if (!currentUid || !otherUid) throw new Error("Missing user ids for conversation.");
  try {
    const q = query(collection(db, "conversations"), where("participants", "array-contains", currentUid), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    let found = null;
    snap.forEach(d => {
      const data = d.data() || {};
      const participants = data.participants || [];
      if (participants.length === 2 && participants.includes(currentUid) && participants.includes(otherUid)) {
        found = { id: d.id, data };
      }
    });
    if (found) return found.id;
    // create new
    const convRef = await addDoc(collection(db, "conversations"), {
      participants: [currentUid, otherUid],
      participantsMeta: {
        [currentUid]: { uid: currentUid },
        [otherUid]: { name: otherName || otherUid, uid: otherUid }
      },
      lastMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return convRef.id;
  } catch (e) {
    console.error("createOrGetConversation err", e);
    throw e;
  }
}

/* ========== DETAILS MODAL: openDonationModal convenience (same modal) ========== */
function openDonationModal(item) {
  showDonationDetailsModal(item, { source: 'firestore', docId: item.id });
}

/* ========== INIT ========== */
onReady(() => {
  // safe default for onOpenDonation — external scripts can override window.onOpenDonation
  window.onOpenDonation = window.onOpenDonation || function (donation, context) {
    if (typeof openDonationModal === 'function') openDonationModal(donation);
  };

  populateQuantity(); populateMedicinesDatalist(); initLocationDropdowns(); setupCloudinaryUpload();

  // header notifications
  if (bellBtn) { ensureNotifModal(); bellBtn.addEventListener("click", (e) => { e.preventDefault(); notifModal.style.display = notifModal.style.display === "none" ? "block" : "none"; }); listenToEvents(); }

  if (signInBtn) renderSignedOutHeader();
  if (btnBack) btnBack.addEventListener("click", () => (document.referrer ? window.history.back() : (window.location.href = "browse.html")));

  // initial renders (local)
  renderMyDonationsFromLocal();
  // attach firestore listener for all donations (or you can call renderAllDonationsFromFirestore later)
  renderAllDonationsFromFirestore();

  // attach UI hooks
  attachFilterHooks();
  setupDonationForm();

  // Switcher initial activation: prefer .active in markup else create
  const activeFromMarkup = pills.find(p => p.classList.contains('active')) || pills.find(p => p.getAttribute('data-view') === 'create');
  if (activeFromMarkup) activateView(activeFromMarkup.getAttribute('data-view'));
  else activateView('create');

  // Auth state
  onAuthStateChanged(auth, (u) => {
    currentUser = u || null;
    if (!u) {
      clearUnsubMyDonations();
      if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
      renderSignedOutHeader();
      renderMyDonationsFromLocal();
    } else {
      listenToUserDoc(u);
      renderMyDonationsFromFirestore(u.uid);
    }
  });

  // cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (unsubUserDoc) unsubUserDoc();
    if (unsubEvents) unsubEvents();
    if (unsubMyDonations) unsubMyDonations();
    if (unsubAllDonations) unsubAllDonations();
  });

  // warn when filter elements missing
  if (!filterCategory) console.warn('filterCategory element not found - All Donations filtering disabled');
  if (!filterUrgency) console.warn('filterUrgency element not found - All Donations filtering disabled');

  // Ensure All Donations container exists and show it on load (safe fallback)
  (function ensureAndShowAllDonations() {
    // Create panel if missing
    let panel = document.getElementById('all-donations-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'all-donations-panel';
      panel.style.display = 'none';
      panel.style.padding = '16px';
      panel.innerHTML = `
        <h2 style="margin:0 0 12px 0;font-size:1.1rem">Community Donations</h2>
        <div id="allDonationsCount" style="color:#64748b;margin-bottom:10px">Loading…</div>
        <div id="allDonationsList" style="display:flex;flex-direction:column;gap:12px"></div>
        <div id="donationsOutput" style="margin-top:18px"></div>
        <div id="allEmpty" style="display:none;color:#64748b;margin-top:10px">No donations found.</div>
      `;
      const insertTarget = document.getElementById('mainGrid') || document.body;
      insertTarget.appendChild(panel);
      allDonationsPanel = panel;
    }

    // Create list if missing
    if (!document.getElementById('allDonationsList')) {
      const list = document.createElement('div');
      list.id = 'allDonationsList';
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '12px';
      panel.appendChild(list);
    }

    // Show this view using your existing UI system
    try {
      if (typeof activateView === 'function') {
        activateView('all');
      } else if (typeof window.activateDonationView === 'function') {
        window.activateDonationView('all');
      } else {
        // Fallback
        panel.style.display = 'block';
        if (typeof renderAllDonationsFromFirestore === 'function') {
          renderAllDonationsFromFirestore();
        }
      }
      console.info('All Donations panel active — fetching donations...');
    } catch (err) {
      console.error('Could not activate All Donations panel:', err);
    }
  })();
});

/* ========== Expose helpers for other scripts ========== */
window.renderAllDonationsFromFirestore = renderAllDonationsFromFirestore;
window.renderMyDonationsFromFirestore = renderMyDonationsFromFirestore;
window.renderMyDonationsFromLocal = renderMyDonationsFromLocal;
window.__applyDonationFilters = applyFilters;
window.activateDonationView = activateView;
window.registerDonationPanels = registerDonationPanels;
window.createOrGetConversation = createOrGetConversation;
