// browse.js
// DonorMedix · Browse donations + Requests + Likes + Header Profile & Notifications

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  limit,
  addDoc,
  serverTimestamp,
  updateDoc,
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
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------- Helpers ----------------
const $ = (sel) => document.querySelector(sel);
function onReady(fn) {
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn)
    : fn();
}

const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
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
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}
function firstTwo(str = "U") {
  return (str || "").trim().slice(0, 2).toUpperCase();
}
function displayNameFrom(u, data) {
  return (
    data?.name ||
    u?.displayName ||
    (u?.email ? u.email.split("@")[0] : "Profile")
  );
}

// Format expiry date for cards (e.g., "Nov 2026")
function formatExpiry(exp) {
  if (!exp) return "Not set";
  let d = exp;
  // Firestore Timestamp
  if (exp && typeof exp === "object" && typeof exp.toDate === "function") {
    d = exp.toDate();
  } else if (!(d instanceof Date)) {
    const tmp = new Date(exp);
    if (!isNaN(tmp)) d = tmp;
  }
  if (!(d instanceof Date) || isNaN(d)) return String(exp);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// Clean aesthetic default images
const DEFAULT_DONATION_IMAGE =
  "https://images.unsplash.com/photo-1584362917165-526a968579e8?q=80&w=1200&auto=format&fit=crop";

const DEFAULT_REQUEST_IMAGE =
  "https://images.unsplash.com/photo-1584306670954-dbb2a7e4aa0f?q=80&w=1200&auto=format&fit=crop";

// For urgency pills
function urgencyBadgeClass(u) {
  if (u === "high") return "badge badge--urg-high";
  if (u === "low") return "badge badge--urg-low";
  return "badge badge--urg-medium";
}

// ---------------- Toast ----------------
const toast = document.getElementById("toast");
function showToast(msg) {
  if (!toast) {
    alert(msg);
    return;
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// ---------------- DOM refs ----------------
const browseList = document.getElementById("browseList");
const searchForm = document.getElementById("searchForm");
const qInput = document.getElementById("q");

// Category pills (Donation / Request)
let activeBrowseCategory = "donation"; // "donation" | "request"

// Data caches
let currentUser = null; // used in render + likes + owner logic
let allDonations = [];
let allRequests = [];

/* Flash toast from session/local storage */
(function pullFlashOnce() {
  let found = false;
  try {
    const msg =
      localStorage.getItem("browseFlash") ||
      sessionStorage.getItem("browseFlash");
    if (msg) {
      showToast(msg);
      localStorage.removeItem("browseFlash");
      sessionStorage.removeItem("browseFlash");
      found = true;
    }
  } catch (e) {}
  if (!found) {
    try {
      const hash = (location.hash || "").toLowerCase();
      if (hash.includes("donation=success")) {
        showToast("Donation posted successfully!");
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch (e) {}
  }
})();

// (optional) user-lite cache if you want to use later
const __userCache = new Map(); // uid -> {name, photoURL, profession}
async function getUserLite(uid) {
  if (!uid) return null;
  if (__userCache.has(uid)) return __userCache.get(uid);
  try {
    const s = await getDoc(doc(db, "users", uid));
    const d = s.exists() ? s.data() : {};
    const lite = {
      name: d.name || "Anonymous",
      photoURL: d.photoURL || null,
      profession: d.profession || null,
    };
    __userCache.set(uid, lite);
    return lite;
  } catch (e) {
    return null;
  }
}

/* ====== Shared browse styles (cards, pills, accents) ====== */
function ensureBrowseStyles() {
  if (document.getElementById("dmx_browse_card_styles")) return;
  const s = document.createElement("style");
  s.id = "dmx_browse_card_styles";
  s.textContent = [
    // Category pills (Donation / Request)
    ".browse-switcher{display:flex;gap:8px;margin-bottom:12px;}",
    ".browse-pill{border:none;border-radius:999px;padding:6px 14px;font-size:.85rem;font-weight:700;cursor:pointer;background:#e5e7eb;color:#0f172a;transition:background .12s ease,color .12s ease,box-shadow .12s ease,transform .12s ease;}",
    ".browse-pill:hover{background:#cbd5f5;box-shadow:0 6px 18px rgba(15,23,42,.16);transform:translateY(-1px);}",
    ".browse-pill.active{background:#0f172a;color:#f9fafb;box-shadow:0 12px 30px rgba(15,23,42,.45);}",

    // Donation card
    ".donation-card{display:flex;flex-direction:row;align-items:stretch;gap:16px;padding:14px 16px;border-radius:18px;background:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,.12);border:1px solid rgba(148,163,184,.35);}",
    ".donation-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}",
    ".donation-header-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}",
    ".donation-title{font-weight:700;color:#0f172a;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}",
    ".donation-donor{font-size:.85rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}",
    ".donation-open-btn{align-self:flex-start;margin-top:6px;padding:6px 16px;border-radius:999px;border:none;background:#0f172a;color:#ffffff;font-weight:600;font-size:.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 8px 24px rgba(15,23,42,.25);transition:transform .12s ease,box-shadow .12s ease,background .12s ease;}",
    ".donation-open-btn:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(15,23,42,.28);background:#020617;}",
    ".donation-open-btn:active{transform:translateY(0);box-shadow:0 6px 18px rgba(15,23,42,.24);}",
    ".donation-open-btn-icon{font-size:1rem;}",

    ".donation-image-wrap{width:160px;height:115px;flex-shrink:0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#f1f5f9 40%,#e2e8f0 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.25);}",
    ".donation-image-wrap img{width:100%;height:100%;object-fit:cover;display:block;}",

    // Request card (for Browse page)
    ".request-card{display:flex;flex-direction:row;align-items:stretch;gap:16px;padding:14px 16px;border-radius:18px;background:#ffffff;box-shadow:0 14px 40px rgba(15,23,42,.12);border:1px solid rgba(148,163,184,.35);}",
    ".request-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}",
    ".request-header-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;}",
    ".request-title{font-weight:700;color:#0f172a;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}",
    ".request-requester{font-size:.85rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}",
    ".request-open-btn{align-self:flex-start;margin-top:6px;padding:6px 16px;border-radius:999px;border:none;background:#0f172a;color:#ffffff;font-weight:600;font-size:.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 8px 24px rgba(15,23,42,.25);transition:transform .12s ease,box-shadow .12s ease,background .12s ease;}",
    ".request-open-btn:hover{transform:translateY(-1px);box-shadow:0 14px 34px rgba(15,23,42,.28);background:#020617;}",
    ".request-open-btn:active{transform:translateY(0);box-shadow:0 6px 18px rgba(15,23,42,.24);}",
    ".request-open-btn-icon{font-size:1rem;}",
    ".request-image-wrap{width:160px;height:115px;flex-shrink:0;border-radius:16px;overflow:hidden;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#f1f5f9 40%,#e2e8f0 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.25);}",
    ".request-image-wrap img{width:100%;height:100%;object-fit:cover;display:block;}",

    // Urgency + badges for request modal (accent colors)
    ".badge{display:inline-flex;align-items:center;padding:.35rem .7rem;border-radius:999px;font:800 .72rem/1 system-ui;}",
    ".badge--cat{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;}",
    ".badge--urg-high{background:#fee2e2;border:1px solid #fecaca;color:#b91c1c;}",
    ".badge--urg-medium{background:#fef3c7;border:1px solid #fde68a;color:#92400e;}",
    ".badge--urg-low{background:#ecfdf5;border:1px solid #bbf7d0;color:#166534;}",
    ".status-chip{font:800 .72rem/1 system-ui;padding:.35rem .7rem;border-radius:999px;background:#e5e7eb;color:#111827;}",

    // Like button accent
    ".btn-like.active{background:#fecaca;border-color:#fca5a5;}",

    // Donation modal specific tidy classes (used by openDonationModal)
    ".dm-don-modal{max-width:720px;width:100%;border-radius:18px;overflow:hidden;background:#f9fafb;border:1px solid #e2e8f0;}",
    ".dm-don-header{padding:18px;background:linear-gradient(135deg,#0f172a,#020617);color:#e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:12px;}",
    ".dm-don-main{display:flex;gap:18px;padding:16px;align-items:flex-start;}",
    ".dm-don-left{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;}",
    ".dm-don-right{width:180px;flex-shrink:0;display:flex;flex-direction:column;gap:12px;align-items:center;}",
    ".dm-don-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;background:#fff;padding:10px;border-radius:12px;border:1px solid #e5e7eb;}",
    ".dm-don-meta .label{font-size:.73rem;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.06em;}",
    ".dm-don-meta .value{font-weight:700;color:#0f172a;}",
    ".dm-don-desc{background:#fff;border:1px solid #e5e7eb;padding:12px;border-radius:12px;font-size:.95rem;color:#111827;line-height:1.5;}",
    ".dm-don-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap;}",
    "@media (max-width:640px){.dm-don-main{flex-direction:column}.dm-don-right{width:100%;flex-direction:row;justify-content:space-between}}",
    "@media (max-width:640px){.donation-card,.request-card{padding:12px 12px;}.donation-image-wrap,.request-image-wrap{width:120px;height:96px;}.donation-title,.request-title{max-width:180px;}.donation-donor,.request-requester{max-width:180px;}}"
  ].join("\n");
  document.head.appendChild(s);
}

// ---------------- Donations + Likes ----------------
// realtime donations
const donationsQ = query(
  collection(db, "donations"),
  orderBy("createdAt", "desc")
);

// realtime requests (for Browse Request category, using same data as request.js)
const requestsQ = query(
  collection(db, "requests"),
  orderBy("createdAt", "desc")
);

/* ----- Donations snapshot ----- */
onSnapshot(
  donationsQ,
  (snap) => {
    allDonations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!browseList) return;
    renderActiveCategory(qInput ? qInput.value.trim() : "");
  },
  (err) => {
    console.error("Error loading donations:", err);
    if (browseList && activeBrowseCategory === "donation")
      browseList.innerHTML = `<p class="muted">⚠️ Failed to load donations.</p>`;
  }
);

/* ----- Requests snapshot (same Firestore data as request.js) ----- */
onSnapshot(
  requestsQ,
  (snap) => {
    allRequests = snap.docs.map((s) => {
      const d = s.data();
      const ms =
        d.createdAt && d.createdAt.toMillis
          ? d.createdAt.toMillis()
          : d.createdAt && d.createdAt.seconds
          ? d.createdAt.seconds * 1000
          : Date.now();
      d._when = timeAgo(ms);
      return { id: s.id, ...d };
    });
    if (!browseList) return;
    renderActiveCategory(qInput ? qInput.value.trim() : "");
  },
  (err) => {
    console.error("Error loading requests:", err);
    if (browseList && activeBrowseCategory === "request")
      browseList.innerHTML = `<p class="muted">⚠️ Failed to load requests.</p>`;
  }
);

// ---------------- Details Modal for Donations / Requests ----------------
let detailsBackdrop = null;
let detailsPanel = null;

function ensureDetailsModal() {
  if (detailsBackdrop) return;

  detailsBackdrop = document.createElement("div");
  detailsBackdrop.id = "dm_details_backdrop";
  Object.assign(detailsBackdrop.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(15,23,42,.55)",
    display: "none",
    zIndex: "999",
    padding: "1.25rem",
  });

  detailsBackdrop.innerHTML = `
    <div style="
      min-height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:1.5rem;
    ">
      <div id="dm_details_panel" style="
        width:100%;
        max-width:720px;
      ">
      </div>
    </div>
  `;

  document.body.appendChild(detailsBackdrop);
  detailsPanel = detailsBackdrop.querySelector("#dm_details_panel");

  // close when click backdrop
  detailsBackdrop.addEventListener("click", (e) => {
    if (e.target === detailsBackdrop) hideDetailsModal();
  });
  // close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && detailsBackdrop.style.display !== "none") {
      hideDetailsModal();
    }
  });
}
function showDetailsModal() {
  ensureDetailsModal();
  detailsBackdrop.style.display = "block";
}
function hideDetailsModal() {
  if (detailsBackdrop) detailsBackdrop.style.display = "none";
}

/* ====== CHAT + DETAILS MODAL (shared for Donation + Request) ====== */

let chatModal = null;
let chatBodyEl = null;
let chatTitleEl = null;
let chatSubEl = null;
let chatInputEl = null;
let chatSendBtn = null;
let chatCloseBtn = null;
let chatPreviewEl = null;

let activeThread = { id: null, unsub: null, kind: null, itemId: null };

function ensureChatStyles() {
  if (document.getElementById("dmx_chat_styles")) return;
  const s = document.createElement("style");
  s.id = "dmx_chat_styles";
  s.textContent = [
    ".chat-modal-card{max-width:620px;width:100%;border-radius:22px;overflow:hidden;background:#0f172a;box-shadow:0 24px 60px rgba(15,23,42,.5);border:1px solid rgba(148,163,184,.3);}",
    ".chat-header{padding:12px 16px;background:linear-gradient(135deg,#0f172a,#020617);color:#e5e7eb;display:flex;align-items:center;justify-content:space-between;gap:10px;}",
    ".chat-header-main{display:flex;flex-direction:column;gap:2px;min-width:0;}",
    ".chat-title-label{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:#38bdf8;font-weight:800;}",
    ".chat-title{font-weight:700;font-size:1.05rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:#f9fafb;}",
    ".chat-sub{font-size:.8rem;color:#9ca3af;}",
    ".chat-close-btn{border:none;background:rgba(15,23,42,.9);color:#e5e7eb;border-radius:999px;padding:4px 10px;font-size:.8rem;cursor:pointer;font-weight:700;}",
    ".chat-preview{padding:10px 14px 6px;background:#020617;border-bottom:1px solid rgba(148,163,184,.35);} ",
    ".chat-preview-inner{display:flex;gap:12px;align-items:flex-start;}",
    ".chat-preview-img{width:80px;height:64px;border-radius:14px;overflow:hidden;flex-shrink:0;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#1f2937 40%,#020617 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.55);}",
    ".chat-preview-img img{width:100%;height:100%;object-fit:cover;display:block;}",
    ".chat-preview-main{flex:1;min-width:0;}",
    ".chat-preview-title{font-size:.9rem;font-weight:700;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".chat-preview-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}",
    ".chat-preview-pill{font:800 .7rem/1 system-ui;padding:.25rem .55rem;border-radius:999px;border:1px solid rgba(148,163,184,.7);color:#e5e7eb;background:rgba(15,23,42,.9);}",
    ".chat-preview-desc{margin-top:6px;font-size:.8rem;color:#9ca3af;line-height:1.4;max-height:3.4em;overflow:hidden;}",
    ".chat-body-wrap{padding:10px 12px 8px;background:radial-gradient(circle at 0 0,#1f2937 0,#020617 55%);}",
    ".chat-scroll{max-height:300px;min-height:160px;overflow-y:auto;padding:8px 4px;display:flex;flex-direction:column;gap:6px;scrollbar-width:thin;}",
    ".chat-scroll::-webkit-scrollbar{width:6px;}",
    ".chat-scroll::-webkit-scrollbar-track{background:transparent;}",
    ".chat-scroll::-webkit-scrollbar-thumb{background:#4b5563;border-radius:999px;}",
    ".chat-empty{font-size:.85rem;color:#9ca3af;text-align:center;padding:18px 4px;}",
    ".msg{max-width:80%;padding:7px 10px;border-radius:14px;border:1px solid rgba(148,163,184,.4);background:rgba(15,23,42,.85);color:#e5e7eb;font-size:.87rem;line-height:1.4;align-self:flex-start;box-shadow:0 8px 22px rgba(15,23,42,.4);}",
    ".msg.me{align-self:flex-end;background:#22c55e;color:#022c22;border-color:rgba(34,197,94,.7);box-shadow:0 10px 28px rgba(34,197,94,.45);}",
    ".chat-footer{Padding:10px 12px 12px;background:#020617;border-top:1px solid rgba(148,163,184,.35);display:flex;gap:8px;align-items:center;}",
    ".chat-input{flex:1;border-radius:999px;border:1px solid rgba(148,163,184,.7);background:#020617;color:#e5e7eb;font-size:.85rem;padding:8px 12px;outline:none;}",
    ".chat-input::placeholder{color:#6b7280;}",
    ".chat-input:focus{border-color:#38bdf8;box-shadow:0 0 0 1px rgba(56,189,248,.5);}",
    ".chat-send-btn{border:none;border-radius:999px;padding:8px 14px;font-size:.85rem;font-weight:700;background:linear-gradient(135deg,#22c55e,#16a34a);color:#ecfdf5;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 14px 34px rgba(34,197,94,.5);}",
    ".chat-send-btn:hover{transform:translateY(-1px);box-shadow:0 18px 40px rgba(34,197,94,.6);}",
    ".chat-send-btn:active{transform:translateY(0);box-shadow:0 8px 22px rgba(34,197,94,.5);}",
    ".chat-send-icon{font-size:1rem;}",
    "@media (max-width:640px){.chat-modal-card{max-width:100%;margin:0 10px;}}",
  ].join("\n");
  document.head.appendChild(s);
}

function ensureChatModal() {
  if (chatModal) return;
  ensureChatStyles();

  chatModal = document.createElement("div");
  chatModal.id = "dm_chat_modal";
  chatModal.className = "modal chat-modal";
  chatModal.innerHTML = `
    <div class="modal-card chat-modal-card">
      <div class="chat-header">
        <div class="chat-header-main">
          <div class="chat-title-label">Private message</div>
          <div class="chat-title" id="chatTitle">Conversation</div>
          <div class="chat-sub" id="chatSub">Chat about this item</div>
        </div>
        <button class="chat-close-btn" id="chatClose">Close</button>
      </div>
      <div class="chat-preview">
        <div class="chat-preview-inner">
          <div class="chat-preview-img"><div style="font-size:1.4rem;color:#e5e7eb;">💊</div></div>
          <div class="chat-preview-main">
            <div class="chat-preview-title" id="chatPreviewTitle">Item</div>
            <div class="chat-preview-meta" id="chatPreviewMeta"></div>
            <div class="chat-preview-desc" id="chatPreviewDesc"></div>
          </div>
        </div>
      </div>
      <div class="chat-body-wrap">
        <div class="chat-scroll" id="chatBody">
          <div class="chat-empty">No messages yet. Be the first to say hello 👋</div>
        </div>
      </div>
      <div class="chat-footer">
        <input id="chatInput" class="chat-input" placeholder="Write a message…" />
        <button id="chatSend" class="chat-send-btn">
          <span class="chat-send-icon">➤</span>
          <span>Send</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(chatModal);

  chatBodyEl = chatModal.querySelector("#chatBody");
  chatTitleEl = chatModal.querySelector("#chatTitle");
  chatSubEl = chatModal.querySelector("#chatSub");
  chatInputEl = chatModal.querySelector("#chatInput");
  chatSendBtn = chatModal.querySelector("#chatSend");
  chatCloseBtn = chatModal.querySelector("#chatClose");
  chatPreviewEl = {
    title: chatModal.querySelector("#chatPreviewTitle"),
    meta: chatModal.querySelector("#chatPreviewMeta"),
    desc: chatModal.querySelector("#chatPreviewDesc"),
    imgWrap: chatModal.querySelector(".chat-preview-img"),
  };

  chatCloseBtn.addEventListener("click", closeChatModal);

  chatModal.addEventListener("click", (e) => {
    if (e.target === chatModal) closeChatModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatModal && chatModal.classList.contains("open")) {
      closeChatModal();
    }
  });
}

function renderChatPreview(kind, item) {
  if (!chatPreviewEl) return;
  const { title, meta, desc, imgWrap } = chatPreviewEl;

  const imgSrc =
    kind === "donation"
      ? item.imageUrl || DEFAULT_DONATION_IMAGE
      : item.imageUrl || DEFAULT_REQUEST_IMAGE;

  imgWrap.innerHTML = `<img src="${imgSrc}" alt="" />`;

  let t =
    kind === "donation"
      ? item.medicineName || "Donation"
      : item.title || "Request";
  title.textContent = t;

  meta.innerHTML = "";

  if (kind === "donation") {
    const cat = item.category || "Other";
    const qty = String(item.quantity ?? "1");
    const expiryRaw =
      item.expirationDate ||
      item.expiryDate ||
      item.expiry ||
      item.expiration ||
      null;
    const expires = formatExpiry(expiryRaw);
    const pills = [
      { label: cat },
      { label: "Qty: " + qty },
      { label: "Expires: " + expires },
    ];
    pills.forEach((p) => {
      const span = document.createElement("span");
      span.className = "chat-preview-pill";
      span.textContent = p.label;
      meta.appendChild(span);
    });

    const rawDesc =
      item.description && item.description.trim()
        ? item.description
        : "No additional details provided by the donor.";
    desc.textContent = rawDesc;
  } else {
    const cat = item.category || "Other";
    const urg = (item.urgency || "medium").toUpperCase();
    const status = (item.status || "open").toUpperCase();
    const pills = [
      { label: cat },
      { label: "Urgency: " + urg },
      { label: "Status: " + status },
    ];
    pills.forEach((p) => {
      const span = document.createElement("span");
      span.className = "chat-preview-pill";
      span.textContent = p.label;
      meta.appendChild(span);
    });

    const loc = item.location || "Location not specified";
    const baseDesc =
      item.description && item.description.trim()
        ? item.description
        : "No description provided.";
    desc.textContent = `Location: ${loc} · ${baseDesc}`;
  }
}

function closeChatModal() {
  if (activeThread.unsub) {
    try {
      activeThread.unsub();
    } catch (e) {}
    activeThread.unsub = null;
  }
  activeThread.id = null;
  if (chatModal) chatModal.classList.remove("open");
}

// kind: "donation" | "request"
// optional prefill: string - initial message to post to the created thread
async function openItemMessageModal(kind, item, prefill = "") {
  ensureChatModal();

  if (!auth.currentUser) {
    alert("Please sign in to send a message.");
    return;
  }

  // hide any details modal so UI is clean
  hideDetailsModal();
  hideRequestDetails();

  const me = auth.currentUser;
  let peerId = null;

  if (kind === "donation") {
    const ownerId = item.userId;
    if (!ownerId) {
      alert("Donor not found for this donation.");
      return;
    }
    peerId = ownerId;
  } else {
    const requesterId = item.requesterId;
    if (!requesterId) {
      alert("Requester not found for this request.");
      return;
    }
    peerId = requesterId;
  }

  if (!peerId || peerId === me.uid) {
    alert("Cannot start a conversation for this item.");
    return;
  }

  // Generate a new thread id
  const threadId = crypto.randomUUID();
  const participants = [me.uid, peerId];
  const participantsMap = {};
  participants.forEach((uid) => {
    participantsMap[uid] = true;
  });

  const itemTitle =
    kind === "donation" ? item.medicineName || "Donation" : item.title || "Request";

  try {
    await setDoc(doc(db, "threads", threadId), {
      participants,
      participantsMap,
      kind,
      donationId: kind === "donation" ? item.id : null,
      requestId: kind === "request" ? item.id : null,
      itemTitle,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: prefill || null,
      lastSenderId: prefill ? auth.currentUser.uid : null,
    });

    // If there's an initial message, add it now
    if (prefill) {
      await addDoc(collection(db, "threads", threadId, "messages"), {
        text: prefill,
        senderId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      // update thread metadata already done above, but keep updatedAt synced
      await updateDoc(doc(db, "threads", threadId), {
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("Failed to create thread:", e);
    alert("Failed to start conversation. Try again.");
    return;
  }

  openChatThread(threadId, kind, itemTitle, item);
}

function openChatThread(threadId, kind, itemTitle, item) {
  ensureChatModal();
  chatModal.classList.add("open");

  chatTitleEl.textContent = itemTitle || "Conversation";
  chatSubEl.textContent =
    kind === "donation" ? "Chat about this donation" : "Chat about this medicine request";

  renderChatPreview(kind, item);

  chatBodyEl.innerHTML =
    '<div class="chat-empty">Loading conversation…</div>';
  chatInputEl.value = "";

  if (activeThread.unsub) {
    try {
      activeThread.unsub();
    } catch (e) {}
  }
  activeThread.id = threadId;
  activeThread.kind = kind;
  activeThread.itemId = kind === "donation" ? item.id : item.id;

  const msgsRef = collection(db, "threads", threadId, "messages");
  activeThread.unsub = onSnapshot(
    query(msgsRef, orderBy("createdAt", "asc")),
    (ss) => {
      chatBodyEl.innerHTML = "";
      if (ss.empty) {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.textContent = "No messages yet. Start the conversation 👋";
        chatBodyEl.appendChild(empty);
        return;
      }
      ss.forEach((docSnap) => {
        const m = docSnap.data();
        const wrap = document.createElement("div");
        const isMe = auth.currentUser && m.senderId === auth.currentUser.uid;
        wrap.className = "msg" + (isMe ? " me" : "");
        wrap.textContent = m.text || "";
        chatBodyEl.appendChild(wrap);
      });
      chatBodyEl.parentElement.scrollTop =
        chatBodyEl.parentElement.scrollHeight;
    }
  );

  chatSendBtn.onclick = async () => {
    const text = (chatInputEl.value || "").trim();
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
      chatInputEl.value = "";
    } catch (e) {
      console.error(e);
      alert("Failed to send message.");
    }
  };
}

/* ---------------- Donation detail modal (uses Message modal) ---------------- */

/**
 * Replaced openDonationModal with a cleaner, non-duplicative aesthetic layout.
 * This function uses your existing helpers: escapeHtml, formatExpiry, timeAgo,
 * setupLikes, openMessageModal, ensureDetailsModal, showDetailsModal, hideDetailsModal.
 *
 * It keeps donor metadata in a single place, large image on the left,
 * metadata + description on the right, and a single action row at the footer.
 */

function openDonationModal(donation) {
  ensureDetailsModal();

  // core values
  const donorName = donation.donorName || "Anonymous";
  const donorUID = donation.userId || "";
  const category = donation.category || "Other";
  const quantity = String(donation.quantity ?? "1");
  const condition = donation.condition || "—";
  const pickup = donation.pickupLocation || "TBD";

  const expiryRaw =
    donation.expirationDate ||
    donation.expiryDate ||
    donation.expiry ||
    donation.expiration ||
    null;
  const expires = formatExpiry(expiryRaw);

  const title = donation.medicineName || "Unnamed Donation";

  let addedWhen = "";
  if (donation.createdAt) {
    const d = donation.createdAt.toDate
      ? donation.createdAt.toDate()
      : new Date(donation.createdAt);
    if (!isNaN(d)) addedWhen = timeAgo(d);
  }

  const isOwner = !!(currentUser && donorUID && currentUser.uid === donorUID);
  const donorLabel = isOwner ? "You" : donorName;

  const rawDesc =
    donation.description && donation.description.trim()
      ? donation.description
      : "No additional details provided by the donor.";
  const safeDesc = escapeHtml(rawDesc);

  const likeBtnId = `likeBtn-${donation.id}`;
  const likeCountId = `likeCount-${donation.id}`;

  const imgSrc = donation.imageUrl || DEFAULT_DONATION_IMAGE;

  // Build a clean, single-source-of-truth modal layout:
  // - Header: label + title + owner badge + close
  // - Body: left = image, right = concise metadata + description
  // - Actions: message / like (single row)
  detailsPanel.innerHTML = `
    <div class="dm-don-modal" role="dialog" aria-labelledby="dm_don_title_${escapeHtml(donation.id || "don")}" aria-modal="true">
      <div class="dm-don-header" style="align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-size:.75rem; text-transform:uppercase; letter-spacing:.08em; color:#93c5fd; font-weight:800;">
            Donation
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <h2 id="dm_don_title_${escapeHtml(donation.id || "don")}" style="margin:4px 0 0; font-size:1.15rem; font-weight:800; color:#f9fafb; max-width:44rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtml(title)}
            </h2>
            ${isOwner ? `<span style="background:#ecfdf5;color:#047857;padding:6px 8px;border-radius:999px;font-weight:800;font-size:.75rem;border:1px solid #a7f3d0;">OWNER</span>` : ""}
          </div>
          <div style="margin-top:6px; font-size:.85rem; color:#cbd5f5;">
            <span style="color:#38bdf8; font-weight:700;">${escapeHtml(donorLabel)}</span>${addedWhen ? ` · <span style="color:#9ca3af;">Added ${escapeHtml(addedWhen)}</span>` : ""}
          </div>
        </div>
        <button type="button" aria-label="Close donation details" style="border:none;background:transparent;color:#e5e7eb;font-size:1.2rem;cursor:pointer;">&times;</button>
      </div>

      <div class="dm-don-main" style="gap:18px;">
        <!-- left: image -->
        <div style="width:260px;flex-shrink:0;border-radius:12px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.12);background:linear-gradient(180deg,#f8fafc,#fff);">
          <img src="${imgSrc}" alt="${escapeHtml(title)}" style="width:100%;height:260px;object-fit:cover;display:block;">
        </div>

        <!-- right: concise meta + description -->
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <span class="badge badge--cat">${escapeHtml(category)}</span>
            <span style="font-weight:700;color:#0f172a;padding:.35rem .7rem;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;">Qty: ${escapeHtml(quantity)}</span>
            <span style="font-weight:700;color:#0f172a;padding:.35rem .7rem;border-radius:999px;background:#fef3c7;border:1px solid #fde68a;">Expires: ${escapeHtml(expires)}</span>
          </div>

          <div class="dm-don-meta" style="margin-top:0;">
            <div>
              <div class="label">Condition</div>
              <div class="value">${escapeHtml(condition)}</div>
            </div>
            <div>
              <div class="label">Pickup</div>
              <div class="value">${escapeHtml(pickup)}</div>
            </div>
            <div>
              <div class="label">Category</div>
              <div class="value">${escapeHtml(category)}</div>
            </div>
            <div>
              <div class="label">Added</div>
              <div class="value">${escapeHtml(addedWhen || "—")}</div>
            </div>
          </div>

          <div class="dm-don-desc" style="margin-top:4px;">
            <strong style="display:block;margin-bottom:6px;">About this donation</strong>
            ${safeDesc}
          </div>

          <div style="font-size:.82rem; color:#64748b; margin-top:4px;">
            <strong style="color:#0f172a; font-weight:700;">Note:</strong>
            <span> Please consult a healthcare professional before using donated medicines.</span>
          </div>
        </div>
      </div>

      <div style="padding:12px 16px;border-top:1px solid #e5e7eb;background:#f9fafb;display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div style="font-size:.85rem;color:#64748b;">${escapeHtml(category)} · Donor: <strong style="color:#0f172a">${escapeHtml(donorLabel)}</strong></div>

        <div style="display:flex;gap:8px;">
          ${
            !isOwner
              ? `<button class="btn btn-primary dm-message-btn" style="border:none;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#38bdf8,#0f172a);color:#fff;">💬 Message donor</button>`
              : `<button class="btn btn-ghost" disabled style="border-radius:10px;padding:10px 14px;font-weight:700;border:1px solid #e5e7eb;background:#fff;color:#94a3b8;cursor:not-allowed;">Own donation</button>`
          }
          <button id="${likeBtnId}" class="btn btn-like" style="border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer;border:1px solid #e5e7eb;background:#fff;display:inline-flex;align-items:center;gap:8px;">
            <span>❤</span>
            <span id="${likeCountId}" class="like-count">0</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Close button (X)
  const closeBtn = detailsPanel.querySelector('button[aria-label="Close donation details"]');
  if (closeBtn) closeBtn.addEventListener("click", () => hideDetailsModal());

  // Message button → shared message modal (only if not owner)
  if (!isOwner) {
    const msgBtn = detailsPanel.querySelector(".dm-message-btn");
    if (msgBtn) {
      msgBtn.addEventListener("click", (e) => {
        e.preventDefault();
        // open messaging modal which will create thread and send notification to original owner only
        openMessageModal(donation, "donation", donation.id);
      });
    }
  }

  // Setup likes inside modal
  setupLikes(donation.id, donorUID, likeBtnId, likeCountId);

  showDetailsModal();
}

/* ====== Request Detail Modal (Browse page, also uses Message modal) ====== */

let requestDetailModal = null;
let requestDetailCard = null;

function hideRequestDetails() {
  if (requestDetailModal) requestDetailModal.classList.remove("open");
}

function ensureRequestDetailModal() {
  if (requestDetailModal) return;
  requestDetailModal = document.createElement("div");
  requestDetailModal.id = "dm_request_detail_modal";
  requestDetailModal.className = "modal";
  requestDetailModal.innerHTML =
    '<div class="modal-card detail-modal-card"></div>';
  requestDetailCard = requestDetailModal.querySelector(".detail-modal-card");
  document.body.appendChild(requestDetailModal);

  requestDetailModal.addEventListener("click", function (e) {
    if (e.target === requestDetailModal) hideRequestDetails();
  });
  document.addEventListener("keydown", function (e) {
    if (
      e.key === "Escape" &&
      requestDetailModal &&
      requestDetailModal.classList.contains("open")
    ) {
      hideRequestDetails();
    }
  });

  // basic styles for detail modal (accents)
  const sId = "dmx_request_detail_styles";
  if (!document.getElementById(sId)) {
    const s = document.createElement("style");
    s.id = sId;
    s.textContent = [
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
      ".btn.btn-ghost{border:1px solid #e5e7eb;border-radius:999px;background:#ffffff;padding:6px 12px;cursor:pointer;font-weight:600;}",
      ".btn.btn-primary{border:none;border-radius:999px;background:#0f172a;color:#f9fafb;padding:6px 14px;cursor:pointer;font-weight:700;}",
      ".btn.btn-danger{border:none;border-radius:999px;background:#fee2e2;color:#b91c1c;padding:6px 14px;cursor:pointer;font-weight:700;}"
    ].join("\n");
    document.head.appendChild(s);
  }
}

/**
 * Updated showRequestDetails to:
 * - prefer username fields for display
 * - surface file attachment (request.file / fileUrl / fileName)
 * - try to resolve username via getUserLite if missing
 */
async function showRequestDetails(requestData, id) {
  ensureBrowseStyles();
  ensureRequestDetailModal();

  const title = requestData.title || "Medicine Request";
  const requesterId = requestData.requesterId || "";
  // Prefer explicit username fields if available, otherwise fallback to requesterName or a user-lite lookup
  let requester =
    requestData.requesterUsername ||
    requestData.username ||
    requestData.requesterName ||
    (requesterId ? "User " + requesterId.slice(0, 6) : "Anonymous");

  const cat = requestData.category || "Other";
  const urgText = (requestData.urgency || "medium").toUpperCase();
  const statusText = (requestData.status || "open").toUpperCase();
  const loc = requestData.location || "Not specified";
  const when = requestData._when || "";
  const imgSrc = requestData.imageUrl || DEFAULT_REQUEST_IMAGE;

  const isMine =
    auth.currentUser && requestData.requesterId === auth.currentUser.uid;

  requestDetailCard.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "detail-header";

  const headerMain = document.createElement("div");
  headerMain.className = "detail-header-main";

  const titleEl = document.createElement("div");
  titleEl.className = "detail-title";
  titleEl.textContent = title;

  const subEl = document.createElement("div");
  subEl.className = "detail-sub";
  subEl.innerHTML =
    "Requested by <strong>" + escapeHtml(requester) + "</strong>" + (when ? " · " + escapeHtml(when) : "");

  headerMain.appendChild(titleEl);
  headerMain.appendChild(subEl);

  const closeTop = document.createElement("button");
  closeTop.type = "button";
  closeTop.className = "detail-close-btn";
  closeTop.textContent = "Close";
  closeTop.onclick = hideRequestDetails;

  header.appendChild(headerMain);
  header.appendChild(closeTop);

  // Body
  const body = document.createElement("div");
  body.className = "detail-body";

  const bodyMain = document.createElement("div");
  bodyMain.className = "detail-body-main";

  const pillRow = document.createElement("div");
  pillRow.className = "detail-pill-row";

  const catSpan = document.createElement("span");
  catSpan.className = "badge badge--cat";
  catSpan.textContent = cat;

  const urgSpan = document.createElement("span");
  urgSpan.className = urgencyBadgeClass(requestData.urgency || "medium");
  urgSpan.textContent = urgText;

  const statusChip = document.createElement("span");
  statusChip.className = "status-chip";
  statusChip.textContent = statusText;
  if (requestData.status === "matched") {
    statusChip.style.background = "#16a34a";
    statusChip.style.color = "#ecfdf5";
  }

  pillRow.appendChild(catSpan);
  pillRow.appendChild(urgSpan);
  pillRow.appendChild(statusChip);

  const meta = document.createElement("div");
  meta.className = "detail-meta";

  // Add requester username (attempt to show username instead of email)
  meta.innerHTML =
    "<div><strong>Location:</strong> " +
    escapeHtml(loc) +
    "</div><div><strong>Requester:</strong> " +
    escapeHtml(requester) +
    "</div>";

  // If there's a file attached in request.file (or fileUrl / fileName), surface it
  const fileUrl = requestData.fileUrl || requestData.file || null;
  const fileName = requestData.fileName || requestData.fileName || (fileUrl ? fileUrl.split("/").pop() : null);
  if (fileUrl || fileName) {
    const fileRow = document.createElement("div");
    fileRow.style.marginTop = "8px";
    fileRow.innerHTML = `<strong>Attachment:</strong> ${escapeHtml(fileName || "File")}`;
    if (fileUrl) {
      const a = document.createElement("a");
      a.href = fileUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = " Open";
      a.style.marginLeft = "8px";
      a.style.color = "#0f172a";
      a.style.fontWeight = "700";
      fileRow.appendChild(a);
    }
    meta.appendChild(fileRow);
  }

  const desc = document.createElement("div");
  desc.className = "detail-desc";
  if (requestData.description) {
    const safe = requestData.description.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    desc.innerHTML = safe;
  } else {
    desc.innerHTML = "<em>No description provided.</em>";
  }

  bodyMain.appendChild(pillRow);
  bodyMain.appendChild(meta);
  bodyMain.appendChild(desc);

  const imgWrap = document.createElement("div");
  imgWrap.className = "detail-img-wrap";
  const img = document.createElement("img");
  img.src = imgSrc;
  img.alt = "Medicine image";
  imgWrap.appendChild(img);

  body.appendChild(bodyMain);
  body.appendChild(imgWrap);

  // Footer
  const footer = document.createElement("div");
  footer.className = "detail-footer";

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "btn btn-ghost";
  shareBtn.textContent = "Share";
  shareBtn.onclick = function () {
    const text =
      "Need: " +
      (requestData.title || "Medicine") +
      " — " +
      (requestData.description || "") +
      " | " +
      (requestData.location || "");
    if (navigator.share) {
      navigator
        .share({ title: "DonorMedix Request", text: text, url: location.href })
        .catch(function () {});
    } else {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          alert("Copied!");
        })
        .catch(function () {});
    }
  };

  const msgBtn = document.createElement("button");
  msgBtn.type = "button";
  msgBtn.className = "btn btn-ghost";
  msgBtn.textContent = "Message";
  if (isMine) {
    msgBtn.style.display = "none";
  } else {
    msgBtn.onclick = function () {
      // open unified message modal, hide details for clean UI
      // pass the request object and ensure id is provided (for notification metadata)
      openMessageModal({ ...requestData, id }, "request", id);
    };
  }

  const helpBtn = document.createElement("button");
  helpBtn.type = "button";
  helpBtn.className = "btn btn-primary";
  if (isMine) {
    helpBtn.textContent = "I can help";
    helpBtn.title = "You can't help your own request";
    helpBtn.disabled = true;
  } else if (requestData.status === "matched") {
    helpBtn.textContent = "Already matched";
    helpBtn.disabled = true;
  } else {
    helpBtn.textContent = "I can help";
    helpBtn.onclick = function () {
      alert("Please go to the Requests page to mark this as matched.");
    };
  }

  const closeBottom = document.createElement("button");
  closeBottom.type = "button";
  closeBottom.className = "btn btn-ghost";
  closeBottom.textContent = "Close";
  closeBottom.onclick = hideRequestDetails;

  footer.appendChild(shareBtn);
  footer.appendChild(msgBtn);
  footer.appendChild(helpBtn);
  footer.appendChild(closeBottom);

  requestDetailCard.appendChild(header);
  requestDetailCard.appendChild(body);
  requestDetailCard.appendChild(footer);

  requestDetailModal.classList.add("open");

  // If we didn't have a username field, attempt to fetch lightweight user profile to show the username
  if (!requestData.requesterUsername && requesterId) {
    try {
      const lite = await getUserLite(requesterId);
      if (lite && lite.name) {
        // update displayed requester name in header meta
        const sub = requestDetailCard.querySelector(".detail-sub");
        if (sub) {
          sub.innerHTML = "Requested by <strong>" + escapeHtml(lite.name) + "</strong>" + (when ? " · " + escapeHtml(when) : "");
        }
        // update meta area
        const metaEl = requestDetailCard.querySelector(".detail-meta");
        if (metaEl) {
          // replace the Requester line
          metaEl.innerHTML = metaEl.innerHTML.replace(
            /<div><strong>Requester:<\/strong>.*?<\/div>/,
            "<div><strong>Requester:</strong> " + escapeHtml(lite.name) + "</div>"
          );
        }
      }
    } catch (e) {
      // silently ignore lookup failures
      console.warn("Could not fetch requester lite profile:", e);
    }
  }
}

/* ======= Unified Message Modal (for Donations & Requests) ======= */

let messageModal = null;
let messagePanel = null;

function ensureMessageModal() {
  if (messageModal) return;
  messageModal = document.createElement("div");
  messageModal.id = "dm_message_modal";
  Object.assign(messageModal.style, {
    position: "fixed",
    inset: "0",
    zIndex: "1001",
    display: "none",
    background: "rgba(15,23,42,.55)",
    padding: "1.5rem",
    overflow: "auto",
  });

  messageModal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100%;">
      <div id="dm_message_panel" style="
        width:100%;
        max-width:640px;
        background:#f9fafb;
        border-radius:16px;
        box-shadow:0 24px 60px rgba(15,23,42,.4);
        border:1px solid #e2e8f0;
        overflow:hidden;
      ">
        <!-- content populated dynamically -->
      </div>
    </div>
  `;
  document.body.appendChild(messageModal);
  messagePanel = messageModal.querySelector("#dm_message_panel");

  // close when clicking backdrop
  messageModal.addEventListener("click", (e) => {
    if (e.target === messageModal) hideMessageModal();
  });
  // close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && messageModal && messageModal.style.display !== "none") {
      hideMessageModal();
    }
  });
}
function hideMessageModal() {
  if (messageModal) messageModal.style.display = "none";
}

/**
 * Open the unified message modal.
 * item: object (donation or request)
 * type: "donation" | "request"
 * id: item id
 *
 * Updated so:
 * - prefers username fields for display
 * - creates targeted notification to recipient user when sending message
 */
function openMessageModal(item = {}, type = "donation", id = "") {
  ensureMessageModal();
  // close other detail modals so only one modal is visible
  if (detailsBackdrop) detailsBackdrop.style.display = "none";
  if (requestDetailModal) requestDetailModal.classList.remove("open");

  const title = item.medicineName || item.title || "Message";
  // Prefer username if available
  const who =
    type === "donation"
      ? (item.donorUsername || item.donorName || "Anonymous")
      : (item.requesterUsername || item.requesterName || "Anonymous");
  const imgSrc = item.imageUrl || (type === "donation" ? DEFAULT_DONATION_IMAGE : DEFAULT_REQUEST_IMAGE);
  const category = item.category || "Other";
  const when = item.createdAt
    ? (item.createdAt.toDate ? timeAgo(item.createdAt.toDate()) : timeAgo(item.createdAt))
    : (item._when || "");
  const description =
    item.description && item.description.trim()
      ? escapeHtml(item.description)
      : "<em>No description provided.</em>";

  // recipient id (for linking to chat/thread and targeted notification)
  // Try both common fields (donation uses userId, request uses requesterId)
  const recipientId = type === "donation" ? (item.userId || item.donorId || "") : (item.requesterId || item.userId || "");

  // Build modal (concise, non-duplicative; DonorMedix brand accents already present in styles)
  messagePanel.innerHTML = `
    <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:.75rem; background:linear-gradient(135deg,#0f172a,#020617); color:#e5e7eb;">
      <div style="min-width:0;">
        <div style="font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:#93c5fd;font-weight:800;">Message · ${escapeHtml(type)}</div>
        <h3 style="margin:.15rem 0 0; font-size:1.05rem; font-weight:800; color:#f9fafb; max-width:36rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(title)}</h3>
        <div style="font-size:.85rem;color:#cbd5f5;margin-top:.2rem;">${escapeHtml(who)}${when ? " · "+escapeHtml(when) : ""}</div>
      </div>
      <button type="button" aria-label="Close" style="border:none;background:transparent;color:#e5e7eb;cursor:pointer;font-size:1.2rem;line-height:1;">&times;</button>
    </div>

    <div style="display:flex; gap:16px; padding:16px;">
      <div style="flex:1; min-width:0;">
        <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
          <span style="font:800 .72rem/1 system-ui; padding:.35rem .7rem; border-radius:999px; background:#ecfdf5; border:1px solid #bbf7d0; color:#166534;">${escapeHtml(category)}</span>
          <span style="font:800 .72rem/1 system-ui; padding:.35rem .7rem; border-radius:999px; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8;">${escapeHtml(when || "")}</span>
        </div>

        <div style="font-size:.9rem;color:#111827;line-height:1.5;background:#ffffff;border-radius:12px;padding:10px 12px;border:1px solid #e5e7eb;margin-bottom:12px;">
          <strong style="font-size:.85rem;">Details:</strong><br>
          ${description}
        </div>

        <div style="display:flex;gap:8px;align-items:flex-start;flex-direction:column;">
          <label style="font-weight:700;">Your message</label>
          <textarea id="dm_message_input" rows="4" placeholder="Write a short message to ${escapeHtml(who)}..." style="width:100%;border-radius:10px;padding:10px;border:1px solid #e5e7eb;font-size:.95rem;"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;width:100%;">
            <button id="dm_message_send" class="btn btn-primary" style="border:none;border-radius:12px;padding:8px 14px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#38bdf8,#0f172a);color:#fff;">Send</button>
            <button id="dm_message_chat" class="btn btn-ghost" style="border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;font-weight:700;cursor:pointer;">Open Chat</button>
            <button id="dm_message_copy" class="btn btn-ghost" style="border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;font-weight:700;cursor:pointer;">Copy Details</button>
          </div>
        </div>
      </div>

      <div style="width:160px;flex-shrink:0;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 10% 20%,#e0f2fe 0,#f1f5f9 40%,#e2e8f0 100%);display:grid;place-items:center;box-shadow:0 10px 28px rgba(15,23,42,.25);">
        <img src="${imgSrc}" alt="${escapeHtml(title)}" style="width:100%;height:100%;object-fit:cover;display:block;">
      </div>
    </div>

    <div style="padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb;">
      <button id="dm_message_cancel" class="btn btn-ghost" style="border:1px solid #e5e7eb;border-radius:12px;padding:8px 12px;font-weight:700;">Close</button>
    </div>
  `;

  // show and wire up
  messageModal.style.display = "block";
  const closeTop = messagePanel.querySelector('button[aria-label="Close"]');
  if (closeTop) closeTop.addEventListener("click", hideMessageModal);
  const cancelBtn = messagePanel.querySelector("#dm_message_cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", hideMessageModal);

  const sendBtn = messagePanel.querySelector("#dm_message_send");
  const chatBtn = messagePanel.querySelector("#dm_message_chat");
  const copyBtn = messagePanel.querySelector("#dm_message_copy");

  sendBtn.addEventListener("click", async () => {
    const text = document.getElementById("dm_message_input").value.trim();
    if (!text) {
      alert("Please type a message first.");
      return;
    }
    // close UI
    hideMessageModal();

    // 1) Create thread + initial message (existing function)
    try {
      await openItemMessageModal(type, item, text);
    } catch (e) {
      console.error("openItemMessageModal error:", e);
    }

    // 2) Create a targeted notification for the original item owner (user-to-user notification)
    try {
      if (recipientId) {
        const senderName =
          (auth.currentUser && (auth.currentUser.displayName || (auth.currentUser.email || "").split("@")[0])) ||
          "Someone";
        await addDoc(collection(db, "events"), {
          type: type,
          message: `${senderName} messaged about "${title}"`,
          userName: senderName,
          createdAt: serverTimestamp(),
          read: false,
          targetUserId: recipientId, // IMPORTANT: targeted recipient
          metadata: {
            itemId: id || item.id || null,
            kind: type,
          },
        });
      }
    } catch (e) {
      console.warn("Failed to create targeted notification:", e);
    }
  });

  chatBtn.addEventListener("click", () => {
    hideMessageModal();
    openItemMessageModal(type, item, "");
  });

  copyBtn.addEventListener("click", () => {
    const details = `${title}\nBy: ${who}\nCategory: ${category}\n${item.location ? "Location: " + item.location + "\n" : ""}\n${item.description || ""}`;
    navigator.clipboard.writeText(details).then(() => {
      showToast("Details copied to clipboard");
    }).catch(()=>{ showToast("Copy failed"); });
  });
}

/* ====== Donation + Request card renderers (Browse) ====== */

// Donation cards
function renderDonations(items, term = "") {
  if (!browseList) return;
  ensureBrowseStyles();

  const t = (term || "").toLowerCase();
  const filtered = !t
    ? items
    : items.filter((x) => {
        return (
          (x.medicineName || "").toLowerCase().includes(t) ||
          (x.category || "").toLowerCase().includes(t) ||
          (x.description || "").toLowerCase().includes(t) ||
          (x.pickupLocation || "").toLowerCase().includes(t) ||
          (x.donorName || "").toLowerCase().includes(t)
        );
      });

  browseList.innerHTML = "";
  if (!filtered.length) {
    browseList.innerHTML = `<p class="muted">No donations found${t ? ` for “${escapeHtml(term)}”` : ""}.</p>`;
    return;
  }

  filtered.forEach((donation) => {
    const imageUrl = donation.imageUrl || DEFAULT_DONATION_IMAGE;
    const donorName = donation.donorName || "Anonymous";
    const donorUID = donation.userId || "";
    const title = donation.medicineName || "Unnamed Donation";

    const isOwner = !!(currentUser && donorUID && currentUser.uid === donorUID);
    const donorLabel = isOwner ? "You" : donorName;

    const card = document.createElement("article");
    card.className = "donation-card";

    card.innerHTML = `
      <div class="donation-main">
        <div class="donation-header-row">
          <div class="donation-title">${escapeHtml(title)}</div>
          <div class="donation-donor">
            Donated by <strong>${escapeHtml(donorLabel)}</strong>
          </div>
        </div>
        <button type="button" class="donation-open-btn">
          <span class="donation-open-btn-icon">↗</span>
          <span>Open</span>
        </button>
      </div>
      <div class="donation-image-wrap">
        <img src="${imageUrl}" alt="${escapeHtml(title)}" loading="lazy">
      </div>
    `;

    const openBtn = card.querySelector(".donation-open-btn");
    if (openBtn) {
      openBtn.addEventListener("click", () => openDonationModal(donation));
    }

    browseList.appendChild(card);
  });
}

// Request cards (same data as request.js, but browse layout)
// Updated to show a paperclip/file badge when attachments exist
function renderRequests(items, term = "") {
  if (!browseList) return;
  ensureBrowseStyles();

  const t = (term || "").toLowerCase();
  const filtered = !t
    ? items
    : items.filter((x) => {
        return (
          (x.title || "").toLowerCase().includes(t) ||
          (x.category || "").toLowerCase().includes(t) ||
          (x.description || "").toLowerCase().includes(t) ||
          (x.location || "").toLowerCase().includes(t) ||
          (x.requesterName || "").toLowerCase().includes(t)
        );
      });

  browseList.innerHTML = "";
  if (!filtered.length) {
    browseList.innerHTML = `<p class="muted">No requests found${t ? ` for “${escapeHtml(term)}”` : ""}.</p>`;
    return;
  }

  filtered.forEach((req) => {
    const card = document.createElement("article");
    card.className = "request-card";
    // allow absolute-positioned badge
    card.style.position = "relative";

    const imgSrc = req.imageUrl || DEFAULT_REQUEST_IMAGE;
    const requester =
      req.requesterName ||
      (req.requesterId ? "User " + req.requesterId.slice(0, 6) : "Anonymous");
    const title = req.title || "Medicine Request";

    // detect attachment (common field names)
    const hasFile =
      !!(req.file || req.fileUrl || req.fileName || req.attachment || req.attachmentUrl);

    card.innerHTML = `
      <div class="request-main">
        <div class="request-header-row">
          <div class="request-title">${escapeHtml(title)}</div>
          <div class="request-requester">
            Requested by <strong>${escapeHtml(requester)}</strong>
          </div>
        </div>
        <button type="button" class="request-open-btn">
          <span class="request-open-btn-icon">↗</span>
          <span>Open</span>
        </button>
      </div>
      <div class="request-image-wrap">
        <img src="${imgSrc}" alt="${escapeHtml(title)}" loading="lazy">
      </div>
    `;

    // If there is an attachment, render a small paperclip badge in the top-right of the card
    if (hasFile) {
      const badge = document.createElement("div");
      badge.className = "request-file-badge";
      // inline styles chosen so you don't need to modify global CSS
      badge.setAttribute(
        "style",
        "position:absolute;top:10px;right:12px;background:rgba(15,23,42,0.92);color:#fff;padding:6px 8px;border-radius:999px;font-weight:800;font-size:0.9rem;display:flex;align-items:center;gap:6px;box-shadow:0 8px 20px rgba(2,6,23,.28);z-index:3;"
      );
      const fileName = req.fileName || (req.fileUrl ? (req.fileUrl.split("/").pop() || "Attachment") : "Attachment");
      badge.title = fileName;
      badge.innerHTML = `<span style="font-size:0.95rem;">📎</span><span style="font-size:.8rem;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(fileName)}</span>`;
      card.appendChild(badge);
    }

    const openBtn = card.querySelector(".request-open-btn");
    if (openBtn) {
      openBtn.addEventListener("click", () =>
        showRequestDetails(req, req.id)
      );
    }

    browseList.appendChild(card);
  });
}

// Central renderer depending on activeBrowseCategory
function renderActiveCategory(term = "") {
  if (activeBrowseCategory === "request") {
    renderRequests(allRequests, term);
  } else {
    renderDonations(allDonations, term);
  }
}

if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    renderActiveCategory(qInput ? qInput.value.trim() : "");
  });
}

/* Likes – used now INSIDE the donation modal only */
function setupLikes(donationId, donorUID, btnId, countId) {
  const likesCol = collection(db, "donations", donationId, "likes");

  onSnapshot(likesCol, (snap) => {
    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = String(snap.size);

    if (currentUser) {
      const liked = snap.docs.some((d) => d.id === currentUser.uid);
      toggleLikeActive(btnId, liked);
    } else {
      toggleLikeActive(btnId, false);
    }
  });

  const btn = document.getElementById(btnId);
  if (btn && !btn.__likeHandlerAttached) {
    btn.__likeHandlerAttached = true;
    btn.addEventListener("click", async () => {
      if (!currentUser) {
        alert("Please log in to like donations.");
        return;
      }
      if (currentUser.uid === donorUID) {
        alert("You can’t like your own donation.");
        return;
      }

      const likeRef = doc(
        db,
        "donations",
        donationId,
        "likes",
        currentUser.uid
      );
      try {
        const isActive = btn.classList.contains("active");
        if (isActive) {
          await deleteDoc(likeRef);
        } else {
          await setDoc(likeRef, {
            userId: currentUser.uid,
            createdAt: new Date(),
          });
        }
      } catch (e) {
        console.error("Like toggle failed:", e);
      }
    });
  }
}
function toggleLikeActive(btnId, isActive) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isActive) btn.classList.add("active");
  else btn.classList.remove("active");
}

// ---------------- Header profile + notifications ----------------
let signInBtn; // .sign-in-btn
let bellBtn; // .bell-btn
let bellBadge; // badge
let profileModal = null; // profile modal (normal size)
let notifModal = null; // notifications modal (smaller, lengthwise cards)
let unsubUserDoc = null;
let unsubEvents = null;

// ---------- Profile Modal (normal size) ----------
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

  // close logic
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

// ---------- Notifications (smaller modal, lengthwise cards) ----------
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
      <div style="padding:10px; color:#64748b;">No notifications yet.</div>
    </div>
  `;
  document.body.appendChild(notifModal);

  // Close logic
  document
    .getElementById("dm_notif_close")
    .addEventListener("click", hideNotifModal);
  document.addEventListener("keydown", (e) => {
    if (notifModal.style.display !== "none" && e.key === "Escape")
      hideNotifModal();
  });
  document.addEventListener("click", (e) => {
    if (notifModal.style.display === "none") return;
    if (notifModal.contains(e.target)) return;
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

// LENGTHWISE cards: icon on top, then message, then time
function renderEventsList(items) {
  ensureNotifModal();
  const list = document.getElementById("dm_notif_list");
  const pill = document.getElementById("dm_notif_count_pill");

  if (!items || !items.length) {
    list.innerHTML = `<div style="padding:10px; color:#64748b;">No notifications yet.</div>`;
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
        ? `<strong style="color:#0f172a">${escapeHtml(
            ev.userName
          )}</strong> — `
        : "";
      const msg = ev.message || "";
      return `
      <div style="
        background:#ffffff;
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:12px 14px;
        margin-bottom:10px;
        box-shadow:0 6px 18px rgba(255, 250, 250, 0.06);
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        gap:4px;
      " data-id="${ev.id}">
        ${icon}
        <div style="color:#0f172a; line-height:1.35;">${who}${escapeHtml(
        msg
      )}</div>
        <div style="color:#64748b; font-size:.85rem;">${when}</div>
      </div>
    `;
    })
    .join("");

  // click behavior for cards (mark as read)
  list.querySelectorAll("[data-id]").forEach((card) => {
    card.onclick = async () => {
      const id = card.getAttribute("data-id");
      try {
        const nRef = doc(db, "events", id);
        await updateDoc(nRef, { read: true }).catch(() => {});
      } catch (e) {}
      hideNotifModal();
    };
  });
}

// ---------- Firestore listeners for header ----------
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

// Site-wide events (e.g., donations/requests)
// Now listens ONLY to events targeted for the signed-in user (targetUserId)
function listenToEvents(u) {
  if (unsubEvents) {
    unsubEvents();
    unsubEvents = null;
  }
  try {
    if (!u) {
      // no user: clear UI
      renderEventsList([]);
      setBellCount(0);
      return;
    }

    // query events targeted to this user (most recent first)
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
          });
        });
        renderEventsList(items);
        const unread = items.filter((i) => !i.read).length;
        setBellCount(unread || items.length);
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

// ---------- Init ----------
onReady(() => {
  ensureBrowseStyles();

  signInBtn = document.querySelector(".sign-in-btn");
  bellBtn = document.querySelector(".bell-btn");

  // Category pills
  const pills = document.querySelectorAll("[data-browse-category]");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const cat = (pill.dataset.browseCategory || "donation").toLowerCase();
      activeBrowseCategory = cat === "request" ? "request" : "donation";
      pills.forEach((p) => p.classList.toggle("active", p === pill));
      renderActiveCategory(qInput ? qInput.value.trim() : "");
    });
  });

  if (bellBtn) {
    ensureBellBadge();
    bellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifModal || notifModal.style.display === "none")
        showNotifModal();
      else hideNotifModal();
    });
    // Do not start listening until we have an auth user; listenToEvents(u) will be called in onAuthStateChanged.
  }

  if (!signInBtn) return;
  renderSignedOut();

  onAuthStateChanged(auth, (u) => {
    currentUser = u;

    // Re-render cards so "You" label updates
    try {
      renderActiveCategory(qInput ? qInput.value.trim() : "");
    } catch (e) {}

    if (!u) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      renderSignedOut();

      const headerName = document.getElementById("profileName");
      const headerEmail = document.getElementById("profileEmail");
      const headerAvatar = document.getElementById("profileAvatar");
      if (headerName) headerName.textContent = "Guest";
      if (headerEmail) headerEmail.textContent = "";
      if (headerAvatar && headerAvatar.dataset?.default)
        headerAvatar.src = headerAvatar.dataset.default;
      const nl = document.getElementById("notifList");
      if (nl) nl.innerHTML = "";

      // stop listening to events
      listenToEvents(null);
      return;
    }
    // signed in
    listenToUserDoc(u);

    // listen to events targeted to this user
    listenToEvents(u);

    // also set header immediately from auth object (best-effort)
    try {
      const headerName = document.getElementById("profileName");
      const headerEmail = document.getElementById("profileEmail");
      const headerAvatar = document.getElementById("profileAvatar");
      if (headerName)
        headerName.textContent =
          u.displayName || (u.email ? u.email.split("@")[0] : "User");
      if (headerEmail) headerEmail.textContent = u.email || "";
      if (headerAvatar && u.photoURL) headerAvatar.src = u.photoURL;
    } catch (e) {}
  });
});

// ---------------- Nav highlight (small) ----------------
(function () {
  try {
    const path = location.pathname.split("/").pop();
    document.querySelectorAll("nav a").forEach((a) => {
      if (a.getAttribute("href") === path) a.classList.add("active");
    });
  } catch (e) {}
})();
