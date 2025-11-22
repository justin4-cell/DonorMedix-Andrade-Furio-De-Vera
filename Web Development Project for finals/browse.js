// browse.js
// DonorMedix · Browse donations + Likes + Header Profile & Notifications
// Final combined file matching the snippet behavior (profile + notifications) and keeping donations/likes.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  limit,
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
const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ---------------- Helpers ----------------
const $ = (sel) => document.querySelector(sel);
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

function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function getInitials(name){
  const n = (name||"").trim();
  if(!n) return "A";
  const parts = n.split(/\s+/).slice(0,2);
  return parts.map(p=>p[0]?.toUpperCase()||"").join("") || "A";
}
function firstTwo(str="U"){ return (str||"").trim().slice(0,2).toUpperCase(); }
function displayNameFrom(u, data){ return data?.name || u?.displayName || (u?.email ? u.email.split("@")[0] : "Profile"); }

// ---------------- Toast ----------------
const toast = document.getElementById("toast");
function showToast(msg){
  if (!toast) { alert(msg); return; }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(()=> toast.classList.remove("show"), 3000);
}

// ---------------- Donations + Likes ----------------
const browseList = document.getElementById("browseList");
const searchForm = document.getElementById("searchForm");
const qInput     = document.getElementById("q");

/* Flash toast from session/local storage */
(function pullFlashOnce(){
  let found = false;
  try {
    const msg = localStorage.getItem("browseFlash") || sessionStorage.getItem("browseFlash");
    if (msg) {
      showToast(msg);
      localStorage.removeItem("browseFlash");
      sessionStorage.removeItem("browseFlash");
      found = true;
    }
  } catch(e) {}
  if (!found) {
    try {
      const hash = (location.hash || '').toLowerCase();
      if (hash.includes('donation=success')) {
        showToast('Donation posted successfully!');
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch(e) {}
  }
})();

// user-lite cache
const __userCache = new Map(); // uid -> {name, photoURL, profession}
async function getUserLite(uid){
  if (!uid) return null;
  if (__userCache.has(uid)) return __userCache.get(uid);
  try {
    const s = await getDoc(doc(db,'users', uid));
    const d = s.exists() ? s.data() : {};
    const lite = { name: d.name || 'Anonymous', photoURL: d.photoURL || null, profession: d.profession || null };
    __userCache.set(uid, lite);
    return lite;
  } catch(e){ return null; }
}

// realtime donations
const donationsQ = query(collection(db, "donations"), orderBy("createdAt", "desc"));
let allDocs = [];

onSnapshot(donationsQ, (snap) => {
  allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!browseList) return;
  render(allDocs, qInput ? qInput.value.trim() : "");
}, (err) => {
  console.error("Error loading donations:", err);
  if (browseList) browseList.innerHTML = `<p class="muted">⚠️ Failed to load donations.</p>`;
});

// Render donation cards
function render(items, term="") {
  if (!browseList) return;

  const t = (term || "").toLowerCase();
  const filtered = !t ? items : items.filter(x => {
    return (x.medicineName||"").toLowerCase().includes(t) ||
           (x.category||"").toLowerCase().includes(t) ||
           (x.description||"").toLowerCase().includes(t) ||
           (x.pickupLocation||"").toLowerCase().includes(t) ||
           (x.donorName||"").toLowerCase().includes(t);
  });

  browseList.innerHTML = "";
  if (!filtered.length) {
    browseList.innerHTML = `<p class="muted">No donations found${t ? ` for “${escapeHtml(term)}”` : ""}.</p>`;
    return;
  }

  for (const donation of filtered) {
    const imageUrl = donation.imageUrl || "https://via.placeholder.com/600x450?text=No+Image";
    const donorName  = donation.donorName || "Anonymous";
    const donorUID   = donation.userId || "";
    const donorPhoto = donation.donorPhoto || null;
    const initials   = getInitials(donorName);

    const card = document.createElement("article");
    card.className = "card";

    const likeDomId   = `like-${donation.id}`;
    const likeCountId = `like-count-${donation.id}`;
    const likeBtnId   = `btn-like-${donation.id}`;
    const msgBtnHref  = `chat.html?to=${encodeURIComponent(donorUID)}&name=${encodeURIComponent(donorName)}&donation=${encodeURIComponent(donation.id)}`;
    const avaId = `av-${donation.id}`;

    card.innerHTML = `
      <div class="card__media">
        <img src="${imageUrl}" alt="${escapeHtml(donation.medicineName || 'Medicine')}" loading="lazy">
      </div>
      <div class="card__body">
        <h3 class="title">${escapeHtml(donation.medicineName || 'Unnamed Donation')}</h3>

        <div class="donor" title="Added by ${escapeHtml(donorName)}">
          <div class="avatar" id="${avaId}">
            ${donorPhoto ? `<img src="${escapeHtml(donorPhoto)}" alt="${escapeHtml(donorName)}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;">` : escapeHtml(initials)}
          </div>
          <div>
            <div class="name">Added by ${escapeHtml(donorName)}</div>
            <div class="sub">${escapeHtml(donation.category || 'Other')} • Qty: ${escapeHtml(String(donation.quantity || '1'))}</div>
          </div>
        </div>

        <div class="row">
          <span class="badge">${escapeHtml(donation.category || 'Other')}</span>
          <span class="muted">Condition: ${escapeHtml(donation.condition || '—')}</span>
        </div>

        <p class="desc">${escapeHtml(donation.description || '')}</p>
        <div class="kv"><strong>Pickup:</strong><span class="muted">${escapeHtml(donation.pickupLocation || 'TBD')}</span></div>
        <div class="kv"><strong>Contact:</strong><span class="muted">${escapeHtml(donation.contactMethod || 'app')}</span></div>

        <div class="actions" id="${likeDomId}">
          <a class="btn btn-message" href="${msgBtnHref}">💬 Message</a>
          <button class="btn btn-like" id="${likeBtnId}" type="button" title="Like this donation">Like <span id="${likeCountId}" class="like-count">0</span></button>
        </div>
      </div>
    `;
    browseList.appendChild(card);

    // Backfill donor info (old docs)
    if ((!donation.donorName || !donation.donorPhoto) && donorUID) {
      getUserLite(donorUID).then(info=>{
        if (!info) return;
        if (!donation.donorName) {
          const nameEl = card.querySelector('.donor .name');
          if (nameEl) nameEl.textContent = `Added by ${info.name}`;
        }
        if (!donation.donorPhoto && info.photoURL) {
          const av = card.querySelector(`#${avaId}`);
          if (av) av.innerHTML = `<img src="${escapeHtml(info.photoURL)}" alt="${escapeHtml(info.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;">`;
        }
      });
    }

    // hydrate donor from users/{uid}
    if (donorUID) {
      getUserLite(donorUID).then(info=>{
        if (!info) return;

        const avaEl = card.querySelector(`#${avaId}`);
        const nameEl = avaEl?.parentElement?.querySelector('.name');
        const subEl  = avaEl?.parentElement?.querySelector('.sub');

        const canonicalName = info.name || donorName;
        if (nameEl) nameEl.textContent = `Added by ${canonicalName}`;

        if (subEl) {
          const base = `${donation.category || 'Other'} • Qty: ${String(donation.quantity || '1')}`;
          subEl.textContent = info.profession ? `${base} • ${info.profession}` : base;
        }

        if (avaEl && info.photoURL && !avaEl.querySelector('img')) {
          avaEl.innerHTML = `<img src="${escapeHtml(info.photoURL)}" alt="${escapeHtml(canonicalName)}" style="width:100%;height:100%;object-fit:cover;border-radius:999px;">`;
        }
      });
    }

    // Like button (live)
    setupLikes(donation.id, donorUID, likeBtnId, likeCountId);
  }
}

if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    render(allDocs, qInput ? qInput.value.trim() : "");
  });
}

/* Likes */
function setupLikes(donationId, donorUID, btnId, countId){
  const likesCol = collection(db, "donations", donationId, "likes");

  onSnapshot(likesCol, (snap)=>{
    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = String(snap.size);

    if(currentUser){
      const liked = snap.docs.some(d => d.id === currentUser.uid);
      toggleLikeActive(btnId, liked);
    } else {
      toggleLikeActive(btnId, false);
    }
  });

  const btn = document.getElementById(btnId);
  btn?.addEventListener("click", async ()=>{
    if(!currentUser){ alert("Please log in to like donations."); return; }
    if(currentUser.uid === donorUID){ alert("You can’t like your own donation."); return; }

    const likeRef = doc(db, "donations", donationId, "likes", currentUser.uid);
    try {
      const isActive = btn.classList.contains("active");
      if(isActive){
        await deleteDoc(likeRef);
      }else{
        await setDoc(likeRef, { userId: currentUser.uid, createdAt: new Date() });
      }
    } catch (e){ console.error("Like toggle failed:", e); }
  });
}
function toggleLikeActive(btnId, isActive){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  if(isActive) btn.classList.add("active");
  else btn.classList.remove("active");
}

// ---------------- Header profile + notifications (matches provided snippet) ----------------

let signInBtn;            // .sign-in-btn
let bellBtn;              // .bell-btn
let bellBadge;            // badge
let profileModal = null;  // profile modal (normal size)
let notifModal = null;    // notifications modal (smaller, lengthwise cards)
let unsubUserDoc = null;
let unsubEvents = null;
let currentUser = null;

// ---------- Profile Modal (normal size) ----------
function ensureProfileModal(){
  if (profileModal) return profileModal;
  profileModal = document.createElement("div");
  profileModal.id = "dm_profile_modal";
  Object.assign(profileModal.style,{
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
  if (!signInBtn) return;

  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  ensureProfileModal();
  const nm = document.getElementById("dm_profile_name");
  const em = document.getElementById("dm_profile_email");
  const av = document.getElementById("dm_profile_avatar");

  // header elements (expected in HTML)
  const headerName = document.getElementById("profileName");
  const headerEmail = document.getElementById("profileEmail");
  const headerAvatar = document.getElementById("profileAvatar"); // expected <img>

  if (nm) nm.textContent = name;
  if (em) em.textContent = u?.email || "";
  if (av) av.textContent = firstTwo(name);

  if (headerName) headerName.textContent = name;
  if (headerEmail) headerEmail.textContent = u?.email || "";
  if (headerAvatar && u?.photoURL) headerAvatar.src = u.photoURL;
  // if no photoURL, keep headerAvatar src as default image (provided in HTML)

  signInBtn.onclick = (e)=>{ e.preventDefault();
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
  Object.assign(notifModal.style,{
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

  // Close logic
  document.getElementById("dm_notif_close").addEventListener("click", hideNotifModal);
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
  const list = document.getElementById("dm_notif_list");
  const pill = document.getElementById("dm_notif_count_pill");

  if (!items || !items.length) {
    list.innerHTML = `<div style="padding:10px; color:#64748b;">No notifications yet.</div>`;
    pill.textContent = "0";
    return;
  }
  pill.textContent = String(items.length);

  list.innerHTML = items.map(ev=>{
    const icon = iconForType(ev.type);
    const when = ev.createdAt? timeAgo(ev.createdAt.toDate ? ev.createdAt.toDate() : ev.createdAt) : "";
    const who  = ev.userName ? `<strong style="color:#0f172a">${escapeHtml(ev.userName)}</strong> — ` : "";
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
      " data-id="${ev.id}">
        ${icon}
        <div style="color:#0f172a; line-height:1.35;">${who}${escapeHtml(msg)}</div>
        <div style="color:#64748b; font-size:.85rem;">${when}</div>
      </div>
    `;
  }).join("");

  // click behavior for cards (mark as read or navigate if metadata present)
  list.querySelectorAll('[data-id]').forEach(card => {
    card.onclick = async () => {
      const id = card.getAttribute('data-id');
      // try to mark as read (best-effort)
      try {
        // update directly (may require security rules); ignore failures
        const nRef = doc(db, "events", id);
        // updateDoc isn't imported; try dynamic import to avoid extra top-level import
        const mod = await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js");
        await mod.updateDoc(nRef, { read: true }).catch(()=>{});
      } catch(e){}
      // close modal
      hideNotifModal();
    };
  });
}

// ---------- Firestore listeners for header ----------
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
          metadata: data.metadata || {},
          read: data.read || false,
        });
      });
      renderEventsList(items);
      // show count of unread as badge (or total items)
      const unread = items.filter(i => !i.read).length;
      setBellCount(unread || items.length);
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

      // clear header placeholders if present
      const headerName = document.getElementById("profileName");
      const headerEmail = document.getElementById("profileEmail");
      const headerAvatar = document.getElementById("profileAvatar");
      if (headerName) headerName.textContent = "Guest";
      if (headerEmail) headerEmail.textContent = "";
      if (headerAvatar && headerAvatar.dataset?.default) headerAvatar.src = headerAvatar.dataset.default;
      // clear small notif panel
      const nl = document.getElementById("notifList");
      if (nl) nl.innerHTML = "";
      return;
    }
    // signed in
    listenToUserDoc(u);

    // also set header immediately from auth object (best-effort)
    try {
      const headerName = document.getElementById("profileName");
      const headerEmail = document.getElementById("profileEmail");
      const headerAvatar = document.getElementById("profileAvatar");
      if (headerName) headerName.textContent = u.displayName || (u.email ? u.email.split("@")[0] : "User");
      if (headerEmail) headerEmail.textContent = u.email || "";
      if (headerAvatar && u.photoURL) headerAvatar.src = u.photoURL;
    } catch(e){}

  });
});

// ---------------- Nav highlight (small) ----------------
(function(){
  try{
    const path=location.pathname.split('/').pop();
    document.querySelectorAll('nav a').forEach(a=>{
      if(a.getAttribute('href')===path) a.classList.add('active');
    });
  }catch(e){}
})();
