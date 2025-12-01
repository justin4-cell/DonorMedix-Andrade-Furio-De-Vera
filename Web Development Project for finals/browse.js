// browse.js
// DonorMedix · Browse donations (cards) with data from Firestore donations + users (profile)

// ---------- Firebase imports ----------
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  where,
  limit,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

// ---------- Firebase init ----------
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

// ---------- Helpers ----------
function onReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn);
  } else {
    fn();
  }
}

function asUsername(str) {
  if (!str) return "";
  const s = String(str).trim();
  if (!s) return "";
  if (s.includes("@")) return s.split("@")[0];
  return s;
}

function formatExpiry(exp) {
  if (!exp) return "—";
  let d = exp;
  if (exp && typeof exp.toDate === "function") d = exp.toDate();
  else if (!(exp instanceof Date)) {
    const tmp = new Date(exp);
    if (!isNaN(tmp)) d = tmp;
  }
  if (!(d instanceof Date) || isNaN(d)) return String(exp);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const DEFAULT_DONATION_IMAGE =
  "https://images.unsplash.com/photo-1584362917165-526a968579e8?q=80&w=1200&auto=format&fit=crop";

// Extra helpers from home.js for profile + notifications
const $ = (sel) => document.querySelector(sel);
function firstTwo(str = "U") {
  return str.trim().slice(0, 2).toUpperCase();
}
function displayNameFrom(u, data) {
  return (
    data?.name ||
    u?.displayName ||
    (u?.email ? u.email.split("@")[0] : "Profile")
  );
}

const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const diff = (d.getTime() - Date.now()) / 1000; // in seconds

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
    ({ "&": "&amp;", "<": "&lt;", ">": "&lt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

// ---------- Global state ----------
let currentUser = null;
let allDonations = [];

// ---------- Caches (user profiles from profile.js / users collection) ----------
const donorProfileCache = {}; // uid -> { name, verified, donorTier, location }

async function getDonorProfile(uid) {
  if (!uid) return null;
  if (donorProfileCache[uid]) return donorProfileCache[uid];

  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) {
      donorProfileCache[uid] = null;
      return null;
    }
    const data = snap.data() || {};

    const profile = {
      name:
        (data.name && String(data.name).trim()) ||
        (data.displayName && String(data.displayName).trim()) ||
        (data.email && asUsername(data.email)) ||
        "Anonymous",
      verified: !!data.verified,
      donorTier: data.donorTier || inferDonorTier(data),
      location: data.location || "",
    };

    donorProfileCache[uid] = profile;
    return profile;
  } catch (e) {
    console.warn("getDonorProfile error:", e);
    donorProfileCache[uid] = null;
    return null;
  }
}

// fallback if donorTier not set
function inferDonorTier(data) {
  const n = Number(data?.donations || 0);
  if (n >= 10) return "Gold donor";
  if (n >= 5) return "Silver donor";
  if (n >= 1) return "Bronze donor";
  return "New donor";
}

// ---------- DOM refs ----------
let cardsGrid;
let resultsCount;

let searchInput;
let searchBtn;
let filterCategory;
let filterUrgency;
let filterAvailable;
let filterVerified;

// ---------- Header / Profile / Notifications ----------
let signInBtn; // .sign-in-btn
let profileModal = null;
let unsubUserDoc = null;

// Notifications
let bellBtn = null; // .bell-btn
let bellBadge = null;
let notifDropdown = null;
let unsubEvents = null;

// ======================================================
//  PROFILE MODAL (copied from home.js)
// ======================================================
function ensureProfileModal() {
  if (profileModal) return profileModal;

  profileModal = document.createElement("div");
  profileModal.id = "dm_profile_modal";

  Object.assign(profileModal.style, {
    position: "fixed",
    zIndex: "1000",
    right: "16px",
    top: "64px",
    width: "min(92vw, 300px)", // normal size
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    boxShadow: "0 16px 44px rgba(0,0,0,.16)",
    display: "flex",
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
    if (profileModal.style.display !== "none" && e.key === "Escape") hideProfileModal();
  });

  document.addEventListener("click", (e) => {
    if (profileModal.style.display === "none") return;
    if (e.target === profileModal || profileModal.contains(e.target)) return;
    if (signInBtn && (e.target === signInBtn || signInBtn.contains(e.target))) return;
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
  const name = displayNameFrom(u, userData);

  // update header button
  if (!signInBtn) return;
  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  // update modal
  ensureProfileModal();
  const nm = $("#dm_profile_name");
  const em = $("#dm_profile_email");
  const av = $("#dm_profile_avatar");
  if (nm) nm.textContent = name;
  if (em) em.textContent = u?.email || "";
  if (av) av.textContent = firstTwo(name);

  // toggle modal on click
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

// Firestore listener for user doc
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

// ======================================================
//  NOTIFICATIONS (icon in nav + dropdown cards) – from home.js
// ======================================================

function ensureBellButton() {
  // Try to find existing bell button
  bellBtn = document.querySelector(".bell-btn");
  if (bellBtn) return bellBtn;

  // If not found, create it and insert next to profile button
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

  // Insert before sign-in button if possible
  if (signInBtn && headerActions.contains(signInBtn)) {
    headerActions.insertBefore(bellBtn, signInBtn);
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

// Notification meta (type → colors, labels, titles)
function notifMetaFor(ev) {
  const rawType = (ev.type || "").toLowerCase();
  const rawLevel = (ev.level || ev.category || ev.severity || "").toLowerCase();
  const baseKey = rawLevel || rawType || "info";

  let tone = "info";
  // Success / green
  if (/success|matched|match|fulfilled|completed|complete|thank/.test(baseKey)) {
    tone = "success";
  }
  // Warning / yellow
  else if (/warn|warning|expiry|expir|urgent|pickup|deadline|reminder/.test(baseKey)) {
    tone = "warning";
  }
  // Error / urgent / red
  else if (/error|issue|problem|failed|fail|safety|alert|expired/.test(baseKey)) {
    tone = "error";
  }
  // Info / blue (default)
  else {
    tone = "info";
  }

  const toneConfig = {
    success: {
      color: "#16a34a", // green
      softBg: "#dcfce7",
      label: "Success",
    },
    info: {
      color: "#0284c7", // blue
      softBg: "#e0f2fe",
      label: "Info",
    },
    warning: {
      color: "#eab308", // yellow
      softBg: "#fef9c3",
      label: "Warning",
    },
    error: {
      color: "#dc2626", // red
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
    } else if (/account|verify/.test(t)) {
      title = "Account Update";
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

// Icon per event
function iconForEvent(ev, meta) {
  const baseSvg = `width:16px;height:16px;display:block;`;
  const t = (ev.type || "").toLowerCase();

  // Info (i)
  if (meta.tone === "info" || /message|chat|request/.test(t)) {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"/>
      </svg>
    `;
  }

  // Success (check)
  if (meta.tone === "success") {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 16.6 5.4 12.5l1.4-1.4 2.7 2.7 7.7-7.7 1.4 1.4-9.1 9.1Z"/>
      </svg>
    `;
  }

  // Warning (triangle)
  if (meta.tone === "warning") {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 1 21h22L12 2Zm1 13h-2v-2h2Zm0-4h-2V9h2Z"/>
      </svg>
    `;
  }

  // Error (alert)
  return `
    <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 11h-2V7h2Zm0 4h-2v-2h2Z"/>
    </svg>
  `;
}

// Dropdown panel for notifications
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
    // window.location.href = "notifications.html";
    notifDropdown.style.display = "none";
  });

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (notifDropdown.style.display === "none") return;
    if (notifDropdown.contains(e.target)) return;
    if (bellBtn && (e.target === bellBtn || bellBtn.contains(e.target))) return;
    notifDropdown.style.display = "none";
  });

  // ESC to close
  document.addEventListener("keydown", (e) => {
    if (notifDropdown.style.display !== "none" && e.key === "Escape")
      notifDropdown.style.display = "none";
  });

  return notifDropdown;
}

function showNotifDropdown() {
  ensureNotifDropdown();
  notifDropdown.style.display = "block";
  setBellCount(0); // clear badge
}
function hideNotifDropdown() {
  if (notifDropdown) notifDropdown.style.display = "none";
}

// Render notifications as cards
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

  // Clicking a card marks that notification as read
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

// ---------- Card rendering (matches browse.html design) ----------
function donorTierClass(tierLabel) {
  if (!tierLabel) return "";
  const lower = tierLabel.toLowerCase();
  if (lower.includes("gold")) return "silver";
  if (lower.includes("silver")) return "silver";
  if (lower.includes("bronze")) return "bronze";
  return "silver";
}

function createDonationCard(donation) {
  const card = document.createElement("article");
  card.className = "card";

  // data-* for filters
  card.dataset.category = donation.category || "";
  card.dataset.urgency = donation.urgency || "";
  card.dataset.available = donation._isAvailable ? "true" : "false";
  card.dataset.verified = donation._donorProfile?.verified ? "true" : "false";
  card.dataset.id = donation.id || "";
  card.dataset.donorId = donation.userId || "";

  // ---------- Image ----------
  const imgDiv = document.createElement("div");
  imgDiv.className = "card-image";
  imgDiv.style.backgroundImage = `url('${donation.imageUrl || DEFAULT_DONATION_IMAGE}')`;

  // ---------- Body ----------
  const body = document.createElement("div");
  body.className = "card-body";

  // name row
  const nameRow = document.createElement("div");
  nameRow.className = "name-row";

  const h2 = document.createElement("h2");
  h2.className = "item-name";
  h2.textContent =
    donation.medicineName || donation.title || "Medicine / Medical Supply";

  const badge = document.createElement("span");
  badge.className = "badge-available";
  badge.textContent = donation._isAvailable ? "available" : "not available";

  nameRow.appendChild(h2);
  nameRow.appendChild(badge);

  // description
  const descP = document.createElement("p");
  descP.className = "item-desc";
  descP.textContent =
    (donation.description && String(donation.description).trim()) ||
    "No description provided.";

  // details list with icons
  const ul = document.createElement("ul");
  ul.className = "details-list";

  // quantity
  const liQty = document.createElement("li");
  const qtyIcon = document.createElement("span");
  qtyIcon.className = "detail-icon";
  qtyIcon.textContent = "💊";
  const quantityText =
    donation.quantityText ||
    (donation.quantity
      ? `${donation.quantity} ${donation.unit || ""}`.trim()
      : "Quantity: 1");
  liQty.appendChild(qtyIcon);
  liQty.append(" " + quantityText);

  // expiry
  const liExp = document.createElement("li");
  const expIcon = document.createElement("span");
  expIcon.className = "detail-icon";
  expIcon.textContent = "⏰";
  liExp.appendChild(expIcon);
  liExp.append(
    " Expires: " +
      formatExpiry(
        donation.expirationDate ||
          donation.expiryDate ||
          donation.expiry ||
          donation.expiration
      )
  );

  // location
  const liLoc = document.createElement("li");
  const locIcon = document.createElement("span");
  locIcon.className = "detail-icon";
  locIcon.textContent = "📍";
  liLoc.appendChild(locIcon);
  liLoc.append(
    " " +
      (
        donation.pickupLocation ||
        donation.location ||
        donation._donorProfile?.location ||
        "Pickup location not specified"
      )
  );

  ul.appendChild(liQty);
  ul.appendChild(liExp);
  ul.appendChild(liLoc);

  const divider = document.createElement("div");
  divider.className = "divider";

  // donor line with icon
  const donorP = document.createElement("p");
  donorP.className = "donor";

  const donorIcon = document.createElement("span");
  donorIcon.className = "donor-icon";
  donorIcon.textContent = "👤";

  const donorNameSpan = document.createElement("span");
  const donorName =
    donation._donorProfile?.name || donation.donorName || "Anonymous";
  donorNameSpan.className = "donor-name";
  donorNameSpan.textContent = donorName;

  donorP.appendChild(donorIcon);
  donorP.append(" Donated by ");
  donorP.appendChild(donorNameSpan);

  // donor meta (verified + tier)
  const donorMeta = document.createElement("div");
  donorMeta.className = "donor-meta";

  if (donation._donorProfile?.verified) {
    const verifiedSpan = document.createElement("span");
    verifiedSpan.className = "pill verified donor-verified";
    verifiedSpan.textContent = "Verified";
    donorMeta.appendChild(verifiedSpan);
  }

  if (donation._donorProfile?.donorTier) {
    const tierSpan = document.createElement("span");
    tierSpan.className =
      "pill donor-tier " + donorTierClass(donation._donorProfile.donorTier);
    tierSpan.textContent = donation._donorProfile.donorTier;
    donorMeta.appendChild(tierSpan);
  }

  // footer with request + message icon
  const footer = document.createElement("div");
  footer.className = "card-footer";

  const btnRequest = document.createElement("button");
  btnRequest.className = "btn-request";
  btnRequest.type = "button";
  btnRequest.textContent = "Request";

  const btnMessage = document.createElement("button");
  btnMessage.className = "btn-icon";
  btnMessage.type = "button";
  btnMessage.title = "Message donor";
  btnMessage.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H10.5L7 18.5V15H7a3 3 0 0 1-3-3V5Zm3-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2v1.8l2.8-1.8H17a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7Zm2 4.25a.75.75 0 0 1 0-1.5h6a.75.75 0 0 1 0 1.5H9Zm0 3a.75.75 0 0 1 0-1.5h3.5a.75.75 0 0 1 0 1.5H9Z"/>
    </svg>
  `;

  // Disable message button if this is your own donation
  if (currentUser && donation.userId && donation.userId === currentUser.uid) {
    btnMessage.disabled = true;
    btnMessage.classList.add("btn-icon-disabled");
    btnMessage.title = "You can't message yourself";
  }

  footer.appendChild(btnRequest);
  footer.appendChild(btnMessage);

  // assemble body
  body.appendChild(nameRow);
  body.appendChild(descP);
  body.appendChild(ul);
  body.appendChild(divider);
  body.appendChild(donorP);
  body.appendChild(donorMeta);
  body.appendChild(footer);

  card.appendChild(imgDiv);
  card.appendChild(body);

  return card;
}

// ---------- Filtering + rendering ----------
function applyFiltersAndRender() {
  if (!cardsGrid) return;

  const q = (searchInput?.value || "").trim().toLowerCase();
  const cat = filterCategory?.value || "";
  const urg = filterUrgency?.value || "";
  const avail = filterAvailable?.value || "";
  const ver = filterVerified?.value || "";

  const filtered = allDonations.filter((d) => {
    const text =
      (d.medicineName || "") +
      " " +
      (d.title || "") +
      " " +
      (d.description || "") +
      " " +
      (d.category || "") +
      " " +
      (d.pickupLocation || d.location || "") +
      " " +
      (d._donorProfile?.name || "");

    const matchesSearch = !q || text.toLowerCase().includes(q);
    const matchesCat = !cat || (d.category || "") === cat;
    const matchesUrg = !urg || (d.urgency || "") === urg;
    const matchesAvail =
      !avail || (avail === "yes" && d._isAvailable === true);
    const matchesVer =
      !ver || (ver === "yes" && d._donorProfile?.verified === true);

    return (
      matchesSearch && matchesCat && matchesUrg && matchesAvail && matchesVer
    );
  });

  cardsGrid.innerHTML = "";
  filtered.forEach((d) => {
    const card = createDonationCard(d);
    cardsGrid.appendChild(card);
  });

  if (resultsCount) {
    resultsCount.textContent = String(filtered.length);
  }
}

// ---------- Request + Message button handlers ----------
function handleRequestClick(cardEl) {
  const donationId = cardEl.dataset.id || "";
  if (!donationId) return;
  const url = new URL("request.html", window.location.origin);
  url.searchParams.set("donationId", donationId);
  window.location.href = url.toString();
}

function handleMessageClick(cardEl) {
  const donationId = cardEl.dataset.id || "";
  const donorId = cardEl.dataset.donorId || "";

  if (!donorId) return;

  if (!currentUser) {
    window.location.href = "profile.html";
    return;
  }

  if (currentUser.uid === donorId) {
    alert("You can't message yourself about your own donation.");
    return;
  }

  let url = "message.html";

  const params = new URLSearchParams();
  if (donationId) params.set("donationId", donationId);
  if (donorId) params.set("to", donorId);
  const qs = params.toString();
  if (qs) url += "?" + qs;

  window.location.href = url;
}

// ---------- Firestore listener for donations ----------
function startDonationsListener() {
  const donationsQ = query(
    collection(db, "donations"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(
    donationsQ,
    async (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const userIds = Array.from(
        new Set(docs.map((d) => d.userId).filter(Boolean))
      );

      const profileMap = {};
      await Promise.all(
        userIds.map(async (uid) => {
          const prof = await getDonorProfile(uid);
          profileMap[uid] = prof;
        })
      );

      allDonations = docs.map((d) => {
        const prof = d.userId ? profileMap[d.userId] : null;

        const status = (d.status || "available").toLowerCase();
        const isAvailable = status === "available" || status === "open";

        return {
          ...d,
          _donorProfile: prof,
          _isAvailable: isAvailable,
        };
      });

      applyFiltersAndRender();
    },
    (err) => {
      console.error("Error loading donations:", err);
      if (cardsGrid) {
        cardsGrid.innerHTML =
          '<p class="item-desc">⚠️ Failed to load donations.</p>';
      }
    }
  );
}

// ---------- Main init ----------
onReady(() => {
  cardsGrid = document.getElementById("cardsGrid");
  resultsCount = document.getElementById("resultsCount");

  searchInput = document.getElementById("searchInput");
  searchBtn = document.getElementById("searchBtn");
  filterCategory = document.getElementById("filterCategory");
  filterUrgency = document.getElementById("filterUrgency");
  filterAvailable = document.getElementById("filterAvailable");
  filterVerified = document.getElementById("filterVerified");

  signInBtn = document.querySelector(".sign-in-btn");

  if (cardsGrid) cardsGrid.innerHTML = "";

  // Set up search + filters
  if (searchBtn) {
    searchBtn.addEventListener("click", (e) => {
      e.preventDefault();
      applyFiltersAndRender();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyFiltersAndRender();
      }
    });
  }

  filterCategory?.addEventListener("change", applyFiltersAndRender);
  filterUrgency?.addEventListener("change", applyFiltersAndRender);
  filterAvailable?.addEventListener("change", applyFiltersAndRender);
  filterVerified?.addEventListener("change", applyFiltersAndRender);

  // Card click handlers
  if (cardsGrid) {
    cardsGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".card");
      if (!card) return;

      if (e.target.closest(".btn-request")) {
        handleRequestClick(card);
        return;
      }
      if (e.target.closest(".btn-icon")) {
        handleMessageClick(card);
        return;
      }
    });
  }

  // Nav active state
  try {
    const path = location.pathname.split("/").pop();
    document.querySelectorAll("nav a").forEach((a) => {
      if (a.getAttribute("href") === path) a.classList.add("active");
    });
  } catch (e) {}

  // Start donations listener
  startDonationsListener();

  // Profile + notif UI initial (signed out by default)
  if (signInBtn) {
    renderSignedOut();
  }
  ensureBellButton();
  ensureNotifDropdown();

  if (bellBtn) {
    bellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifDropdown || notifDropdown.style.display === "none")
        showNotifDropdown();
      else hideNotifDropdown();
    });
  }

  // Auth listener
  onAuthStateChanged(auth, (user) => {
    currentUser = user;

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

    // Re-render so message buttons update based on current user
    applyFiltersAndRender();
  });
});
