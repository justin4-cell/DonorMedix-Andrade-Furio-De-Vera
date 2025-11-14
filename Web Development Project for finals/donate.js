// donate.js
// DonorMedix · Create Donation + Header Profile & Notifications + Cloudinary upload
// NOTE: In your HTML, include Cloudinary widget BEFORE this file:
// <script src="https://widget.cloudinary.com/v2.0/global/all.js"></script>
// <script type="module" src="donate.js"></script>

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// -------------------------------------------------------
// Firebase init
// -------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// shared auth state
let currentUser = null;

// -------------------------------------------------------
// Helpers (general)
// -------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function onReady(fn){
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

// Toast (id="toast")
const toastEl = document.getElementById("toast");
function showToast(msg){
  if (!toastEl) { alert(msg); return; }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), 3000);
}

// small helper
function displayNameFrom(u, data){
  return data?.name || u?.displayName || (u?.email ? u.email.split("@")[0] : "Profile");
}
function firstTwo(str="U"){ return str.trim().slice(0,2).toUpperCase(); }

const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diff = (d.getTime() - Date.now()) / 1000;
  const ranges = [
    ["year", 60*60*24*365],
    ["month", 60*60*24*30],
    ["week", 60*60*24*7],
    ["day", 60*60*24],
    ["hour", 60*60],
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

// -------------------------------------------------------
// Donation form logic
// -------------------------------------------------------
const donationForm   = document.getElementById("donationForm");
const imageUrlInput  = document.getElementById("imageUrl");
const imagePreviewEl = document.getElementById("imagePreview");

async function getCanonicalUser(u){
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

if (donationForm) {
  donationForm.addEventListener("submit", async (e)=>{
    e.preventDefault();

    if (!currentUser) {
      showToast("Please sign in first.");
      window.location.href = "auth.html";
      return;
    }

    const submitBtn = donationForm.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Posting...";
    }

    try {
      const fd = new FormData(donationForm);

      const quantityRaw = fd.get("quantity");
      const quantity = quantityRaw ? Number(quantityRaw) : 1;

      const { name: donorName, photoURL: donorPhoto } = await getCanonicalUser(currentUser);

      const docData = {
        medicineName: (fd.get("medicineName") || "").toString().trim(),
        category: (fd.get("category") || "Other").toString().trim() || "Other",
        urgency: (fd.get("urgency") || "normal").toString().trim() || "normal",
        condition: (fd.get("condition") || "Unspecified").toString().trim() || "Unspecified",
        quantity: isNaN(quantity) || quantity <= 0 ? 1 : quantity,
        expiryDate: (fd.get("expiryDate") || "").toString().trim() || null,
        pickupLocation: (fd.get("pickupLocation") || "").toString().trim(),
        description: (fd.get("description") || "").toString().trim(),
        contactMethod: (fd.get("contactMethod") || "app").toString().trim() || "app",
        imageUrl: (fd.get("imageUrl") || "").toString().trim() || "",
        createdAt: serverTimestamp(),

        // donor meta
        userId: currentUser.uid,
        donorName,
        donorPhoto,
      };

      if (!docData.medicineName) {
        throw new Error("Please enter a medicine name.");
      }

      await addDoc(collection(db, "donations"), docData);

      // optional: flash message for browse page
      try {
        sessionStorage.setItem("browseFlash", "Donation posted successfully!");
      } catch(e){}

      showToast("Donation posted successfully!");

      donationForm.reset();
      if (imagePreviewEl) {
        imagePreviewEl.src = "";
        imagePreviewEl.style.display = "none";
      }

      // optional redirect to browse page (adjust filename if needed)
      // window.location.href = "browse.html#donation=success";

    } catch (err) {
      console.error("Failed to post donation:", err);
      showToast(err?.message || "Failed to post donation. Please try again.");
    } finally {
      const submitBtn2 = donationForm.querySelector("button[type='submit']");
      if (submitBtn2) {
        submitBtn2.disabled = false;
        submitBtn2.textContent = "Post Donation";
      }
    }
  });
}

// -------------------------------------------------------
// Cloudinary Upload Widget
// -------------------------------------------------------
// Expected HTML:
// <button type="button" id="cloudinaryUploadBtn">Choose image</button>
// <input type="hidden" id="imageUrl" name="imageUrl">
// <img id="imagePreview" style="display:none;max-width:180px;border-radius:10px;margin-top:8px;">
// -------------------------------------------------------
(function setupCloudinaryUpload() {
  const uploadBtn  = document.getElementById("cloudinaryUploadBtn");
  const imageInput = imageUrlInput; // same hidden input
  const previewImg = imagePreviewEl;

  if (!uploadBtn || !imageInput) return;

  // 🔑 PUT YOUR REAL CLOUDINARY VALUES HERE
  const CLOUD_NAME     = "dsw0erpjx";       // e.g. "demo" (from Cloudinary dashboard)
  const UPLOAD_PRESET  = "donormedix";    // e.g. "unsigned_preset"

  // Guard: catch the common mistake "Unknown API key"
  if (
    !CLOUD_NAME ||
    CLOUD_NAME === "YOUR_CLOUD_NAME" ||
    CLOUD_NAME.startsWith("AIza") // you accidentally used Firebase apiKey
  ) {
    console.error(
      "Cloudinary config error: Replace CLOUD_NAME with your actual Cloudinary cloud name (NOT the Firebase apiKey)."
    );
    return;
  }

  if (!UPLOAD_PRESET || UPLOAD_PRESET === "YOUR_UPLOAD_PRESET") {
    console.error(
      "Cloudinary config error: Replace UPLOAD_PRESET with an unsigned upload preset from your Cloudinary dashboard."
    );
    return;
  }

  function initWidget() {
    if (!window.cloudinary || !window.cloudinary.createUploadWidget) {
      console.warn("Cloudinary widget not loaded. Check the <script src='https://widget.cloudinary.com/v2.0/global/all.js'> tag.");
      return;
    }

    const widget = window.cloudinary.createUploadWidget(
      {
        cloudName: CLOUD_NAME,
        uploadPreset: UPLOAD_PRESET,
        sources: ["local", "camera", "url"],
        multiple: false,
        maxFiles: 1,
        folder: "donormedix_donations",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary error:", error);
          showToast("Image upload failed. Please try again.");
          return;
        }
        if (!result || result.event !== "success") return;

        const url = result.info.secure_url;
        imageInput.value = url;

        if (previewImg) {
          previewImg.src = url;
          previewImg.style.display = "block";
        }
      }
    );

    uploadBtn.addEventListener("click", (e) => {
      e.preventDefault();
      widget.open();
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    initWidget();
  } else {
    window.addEventListener("load", initWidget);
  }
})();

// -------------------------------------------------------
// Header: Profile modal + Notifications bell
// -------------------------------------------------------
let signInBtn;            // .sign-in-btn
let bellBtn;              // .bell-btn
let bellBadge;            // badge
let profileModal;         // profile modal
let notifModal;           // notifications modal
let unsubUserDoc = null;
let unsubEvents  = null;

// Profile modal
function ensureProfileModal(){
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
      <button id="dm_signout" style="flex:1; background:#ffffff; color:#0f172a; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; font-weight:800; cursor:pointer;">Sign Out</button>
    </div>
  `;
  document.body.appendChild(profileModal);

  document.addEventListener("keydown", (e)=>{
    if (profileModal.style.display !== "none" && e.key === "Escape") hideProfileModal();
  });
  document.addEventListener("click", (e)=>{
    if (profileModal.style.display === "none") return;
    if (e.target === profileModal || profileModal.contains(e.target)) return;
    if (signInBtn && (e.target === signInBtn || signInBtn.contains(e.target))) return;
    hideProfileModal();
  });
  profileModal.querySelector("#dm_signout").addEventListener("click", async ()=>{
    try { await signOut(auth); } catch(e){ console.warn("signOut error", e); }
    hideProfileModal();
  });

  return profileModal;
}
function showProfileModal(){ ensureProfileModal(); profileModal.style.display = "block"; }
function hideProfileModal(){ if (profileModal) profileModal.style.display = "none"; }

function updateProfileUI(u, userData){
  if (!signInBtn) return;
  const name = displayNameFrom(u, userData);
  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  ensureProfileModal();
  const nm = $("#dm_profile_name");
  const em = $("#dm_profile_email");
  const av = $("#dm_profile_avatar");
  if (nm) nm.textContent = name;
  if (em) em.textContent = u?.email || "";
  if (av) av.textContent = firstTwo(name);

  signInBtn.onclick = (e)=>{ 
    e.preventDefault();
    if (profileModal.style.display === "none") showProfileModal(); else hideProfileModal();
  };
}
function renderSignedOut(){
  if (!signInBtn) return;
  signInBtn.textContent = "Sign In";
  signInBtn.title = "Sign In";
  signInBtn.setAttribute("aria-label","Sign In");
  signInBtn.onclick = ()=> (window.location.href = "auth.html");
  hideProfileModal();
}

// Notifications
function ensureBellBadge(){
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
    border: "2px solid #0f172a"
  });
  bellBadge.textContent = "0";
  bellBtn.appendChild(bellBadge);
  return bellBadge;
}
function setBellCount(n){
  ensureBellBadge();
  if (!bellBadge) return;
  if (!n || n <= 0) { bellBadge.style.display = "none"; }
  else { bellBadge.style.display = "inline-block"; bellBadge.textContent = String(n); }
}

function ensureNotifModal(){
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

  $("#dm_notif_close").addEventListener("click", hideNotifModal);
  document.addEventListener("keydown", (e)=>{
    if (notifModal.style.display !== "none" && e.key === "Escape") hideNotifModal();
  });
  document.addEventListener("click", (e)=>{
    if (notifModal.style.display === "none") return;
    if (e.target === notifModal || notifModal.contains(e.target)) return;
    if (bellBtn && (e.target === bellBtn || bellBtn.contains(e.target))) return;
    hideNotifModal();
  });

  return notifModal;
}
function showNotifModal(){ ensureNotifModal(); notifModal.style.display = "block"; setBellCount(0); }
function hideNotifModal(){ if (notifModal) notifModal.style.display = "none"; }

function iconForType(type){
  const base = 'width:26px;height:26px;display:block;color:#2563eb;margin-bottom:8px';
  if (type === "donation") {
    return `<svg style="${base}" viewBox="0 0 24 24" fill="currentColor"><path d="M12.1 21.7 3.4 13A7.1 7.1 0 0 1 13 3.4a7.1 7.1 0 0 1 9.6 9.6l-8.7 8.7a1.27 1.27 0 0 1-1.8 0Z"/></svg>`;
  }
  if (type === "request") {
    return `<svg style="${base};color:#0ea5e9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a10 10 0 1 1 10-10 10.01 10.01 0 0 1-10 10Zm1-15v5h4v2h-6V7h2Z"/></svg>`;
  }
  return `<svg style="${base};color:#475569" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"/></svg>`;
}

function renderEventsList(items){
  ensureNotifModal();
  const list = $("#dm_notif_list");
  const pill = $("#dm_notif_count_pill");
  if (!list || !pill) return;

  if (!items || !items.length) {
    list.innerHTML = `<div style="padding:10px; color:#64748b;">No notifications yet.</div>`;
    pill.textContent = "0";
    return;
  }
  pill.textContent = String(items.length);

  list.innerHTML = items.map(ev=>{
    const icon = iconForType(ev.type);
    const when = ev.createdAt ? timeAgo(ev.createdAt.toDate ? ev.createdAt.toDate() : ev.createdAt) : "";
    const who  = ev.userName ? `<strong style="color:#0f172a">${ev.userName}</strong> — ` : "";
    const msg  = ev.message || "";
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
        <div style="color:#64748b; font-size:.85rem;">${when}</div>
      </div>
    `;
  }).join("");
}

// Firestore listeners for header
function listenToUserDoc(u){
  if (unsubUserDoc){ unsubUserDoc(); unsubUserDoc = null; }
  if (!u) return;
  const ref = doc(db, "users", u.uid);
  unsubUserDoc = onSnapshot(ref, (snap)=>{
    const data = snap.exists() ? snap.data() : null;
    updateProfileUI(u, data);
  }, (err)=>{
    console.warn("users doc listener error:", err?.message);
    updateProfileUI(u, null);
  });
}
function listenToEvents(){
  if (unsubEvents){ unsubEvents(); unsubEvents = null; }
  try {
    const q = query(collection(db, "events"), orderBy("createdAt", "desc"), limit(20));
    unsubEvents = onSnapshot(q, (snap)=>{
      const items = [];
      snap.forEach(d=>{
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
    }, (err)=>{
      console.warn("events listener error:", err?.message);
      renderEventsList([]);
      setBellCount(0);
    });
  } catch (e) {
    console.warn("events query error:", e?.message);
  }
}

// -------------------------------------------------------
// Init header + auth
// -------------------------------------------------------
onReady(()=>{
  signInBtn = document.querySelector(".sign-in-btn");
  bellBtn   = document.querySelector(".bell-btn");

  if (bellBtn){
    ensureBellBadge();
    bellBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      if (!notifModal || notifModal.style.display === "none") showNotifModal(); else hideNotifModal();
    });
    listenToEvents();
  }

  if (signInBtn){
    renderSignedOut();
  }

  onAuthStateChanged(auth, (u)=>{
    currentUser = u || null;
    if (!signInBtn) return; // header might not exist

    if (!u){
      if (unsubUserDoc){ unsubUserDoc(); unsubUserDoc = null; }
      renderSignedOut();
    } else {
      listenToUserDoc(u);
    }
  });
});
