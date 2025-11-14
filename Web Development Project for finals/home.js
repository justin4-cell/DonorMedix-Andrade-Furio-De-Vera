// -------------------------------------------------------
// DonorMedix Header: Auth (Profile) + Notifications (Firebase v12.4.0)
// - Sign-in button becomes user's NAME (live from Firestore)
// - Profile modal with name/email + "Go to Profile" + "Sign Out" (normal size)
// - Notification bell with smaller modal + lengthwise cards (icon -> message -> time)
// -------------------------------------------------------
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ---------- Firebase ----------
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
const auth = getAuth(app);
const db   = getFirestore(app);

// ---------- Helpers ----------
const $  = (sel) => document.querySelector(sel);
function onReady(fn){ document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn(); }

const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diff = (d.getTime() - Date.now()) / 1000; // seconds
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

function firstTwo(str="U"){ return str.trim().slice(0,2).toUpperCase(); }
function displayNameFrom(u, data){
  return data?.name || u?.displayName || (u?.email ? u.email.split("@")[0] : "Profile");
}

// ---------- State ----------
let signInBtn;            // .sign-in-btn
let bellBtn;              // .bell-btn
let bellBadge;            // badge
let profileModal;         // profile modal (normal size)
let notifModal;           // notifications modal (smaller, lengthwise cards)
let unsubUserDoc = null;
let unsubEvents  = null;
let currentUser  = null;

// ---------- Profile Modal (normal size) ----------
function ensureProfileModal(){
  if (profileModal) return profileModal;
  profileModal = document.createElement("div");
  profileModal.id = "dm_profile_modal";
  // Profile modal (normal, smaller)
Object.assign(profileModal.style, {
  position: "fixed",
  zIndex: "1000",
  right: "16px",
  top: "64px",
  width: "min(92vw, 300px)",   // ↓ was 360px
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

  // close logic
  document.addEventListener("keydown", (e)=>{ if (profileModal.style.display !== "none" && e.key === "Escape") hideProfileModal(); });
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

  signInBtn.onclick = (e)=>{ e.preventDefault();
    if (profileModal.style.display === "none") showProfileModal(); else hideProfileModal();
  };
}
function renderSignedOut(){
  signInBtn.textContent = "Sign In";
  signInBtn.title = "Sign In";
  signInBtn.setAttribute("aria-label","Sign In");
  signInBtn.onclick = ()=> (window.location.href = "auth.html");
  hideProfileModal();
}

// ---------- Notifications (smaller modal, lengthwise cards) ----------
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
  // Notifications modal (smaller, lengthwise cards)
Object.assign(notifModal.style, {
  position: "fixed",
  zIndex: "1000",
  right: "220px",
  top: "64px",
  width: "min(92vw, 200px)",   // ↓ was 340px
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

  // Close logic
  $("#dm_notif_close").addEventListener("click", hideNotifModal);
  document.addEventListener("keydown", (e)=>{ if (notifModal.style.display !== "none" && e.key === "Escape") hideNotifModal(); });
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

// LENGTHWISE cards: icon on top, then message, then time
function renderEventsList(items){
  ensureNotifModal();
  const list = $("#dm_notif_list");
  const pill = $("#dm_notif_count_pill");

  if (!items || !items.length) {
    list.innerHTML = `<div style="padding:10px; color:#64748b;">No notifications yet.</div>`;
    pill.textContent = "0";
    return;
  }
  pill.textContent = String(items.length);

  list.innerHTML = items.map(ev=>{
    const icon = iconForType(ev.type);
    const when = ev.createdAt? timeAgo(ev.createdAt.toDate ? ev.createdAt.toDate() : ev.createdAt) : "";
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
        flex-direction:column;     /* vertical stack */
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

// ---------- Firestore listeners ----------
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

// Site-wide events (e.g., donations/requests)
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
      setBellCount(items.length); // show count until user opens modal
    }, (err)=>{
      console.warn("events listener error:", err?.message);
      renderEventsList([]);
      setBellCount(0);
    });
  } catch (e) {
    console.warn("events query error:", e?.message);
  }
}

// ---------- Init ----------
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

  if (!signInBtn) return;
  renderSignedOut();

  onAuthStateChanged(auth, (u)=>{
    currentUser = u;
    if (!u){
      if (unsubUserDoc){ unsubUserDoc(); unsubUserDoc = null; }
      renderSignedOut();
    } else {
      listenToUserDoc(u);
    }
  });
});
