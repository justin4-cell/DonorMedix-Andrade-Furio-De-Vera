// profile.js (ESM) — import with <script type="module" src="profile.js"></script>

/* ---------- Firebase imports ---------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
  updateDoc, // ✅ for notifications "mark as read"
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  updateProfile,
  signOut, // ✅ for header profile dropdown
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

/* ---------- Firebase config & init ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};
const appFB = initializeApp(firebaseConfig);
const db = getFirestore(appFB);
const auth = getAuth(appFB);

/* ---------- Small helpers ---------- */
const nowStr = () =>
  new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replace(/[&<>"']/g, (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      }[m] || m)
    );
}

// Relative time (for notifications)
const timeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function timeAgo(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const diff = (d.getTime() - Date.now()) / 1000;

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

// Trim full email → username-style
function asUsername(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const at = s.indexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

/* ---------- Bridge: profile → message.html (chat) ---------- */
/**
 * Open the message page to chat directly with a specific user.
 *
 * message.js expects:
 *   - chatWith  -> other user's UID
 *   - name      -> other user's display name (optional)
 *   - avatar    -> other user's photo URL (optional)
 *   - requestId / donationId (optional, when chat is about a specific item)
 */
function openChatFromProfile({
  targetUid,
  displayName,
  avatarUrl,
  requestId = null,
  donationId = null,
}) {
  if (!targetUid) {
    console.warn("openChatFromProfile: missing targetUid");
    alert("Unable to open chat for this user.");
    return;
  }

  const url = new URL("message.html", window.location.href);

  // Direct chat target — this is what message.js reads
  url.searchParams.set("chatWith", targetUid);

  if (displayName) {
    url.searchParams.set("name", displayName);
  }
  if (avatarUrl) {
    url.searchParams.set("avatar", avatarUrl);
  }
  if (requestId) {
    url.searchParams.set("requestId", requestId);
  }
  if (donationId) {
    url.searchParams.set("donationId", donationId);
  }

  window.location.href = url.toString();
}

/* ---------- HEADER PROFILE + NOTIFICATION DROPDOWNS ---------- */

// header globals
let signInBtn = null;
let headerProfileModal = null;
let headerBellBtn = null;
let headerBellBadge = null;
let notifDropdown = null;
let unsubEventsHeader = null;

// small helpers for header name/avatar
function headerDisplayName(user, userData) {
  return (
    (userData && userData.name) ||
    user?.displayName ||
    user?.email ||
    "Profile"
  );
}
function firstTwo(str = "U") {
  return String(str).trim().slice(0, 2).toUpperCase();
}

// ===== header profile dropdown =====
function ensureHeaderProfileModal() {
  if (headerProfileModal) return headerProfileModal;

  headerProfileModal = document.createElement("div");
  headerProfileModal.id = "dm_profile_modal";
  Object.assign(headerProfileModal.style, {
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

  headerProfileModal.innerHTML = `
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
  document.body.appendChild(headerProfileModal);

  // close on click outside / ESC
  document.addEventListener("click", (e) => {
    if (headerProfileModal.style.display === "none") return;
    if (
      headerProfileModal.contains(e.target) ||
      (signInBtn && (e.target === signInBtn || signInBtn.contains(e.target)))
    )
      return;
    headerProfileModal.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && headerProfileModal.style.display !== "none") {
      headerProfileModal.style.display = "none";
    }
  });

  headerProfileModal
    .querySelector("#dm_signout")
    .addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (e) {
        console.warn("signOut error", e);
      }
      headerProfileModal.style.display = "none";
    });

  return headerProfileModal;
}

function renderSignedOutHeader() {
  if (!signInBtn) return;
  signInBtn.textContent = "Sign In";
  signInBtn.title = "Sign In";
  signInBtn.setAttribute("aria-label", "Sign In");
  signInBtn.onclick = () => (window.location.href = "index.html");
  if (headerProfileModal) headerProfileModal.style.display = "none";
}

function updateHeaderProfile(user, userData) {
  if (!signInBtn) return;
  const name = headerDisplayName(user, userData);
  const email = user?.email || userData?.email || "";

  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  ensureHeaderProfileModal();
  const nm = document.getElementById("dm_profile_name");
  const em = document.getElementById("dm_profile_email");
  const av = document.getElementById("dm_profile_avatar");
  if (nm) nm.textContent = name;
  if (em) em.textContent = email;
  if (av) av.textContent = firstTwo(name);

  signInBtn.onclick = (e) => {
    e.preventDefault();
    ensureHeaderProfileModal();
    headerProfileModal.style.display =
      headerProfileModal.style.display === "none" ? "block" : "none";
  };
}

// ===== header bell + notification dropdown (events collection) =====

function ensureBellButton() {
  if (headerBellBtn) return headerBellBtn;

  // existing .bell-btn if present
  headerBellBtn = document.querySelector(".bell-btn");
  if (!headerBellBtn) {
    const headerActions = document.querySelector(".header-actions");
    if (!headerActions) return null;

    headerBellBtn = document.createElement("button");
    headerBellBtn.type = "button";
    headerBellBtn.className = "bell-btn";
    headerBellBtn.setAttribute("aria-label", "Notifications");
    headerBellBtn.style.position = "relative";

    headerBellBtn.innerHTML = `
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

    const signBtn = document.querySelector(".sign-in-btn");
    const headerActionsHasSignBtn =
      signBtn && headerActions.contains(signBtn);

    if (headerActionsHasSignBtn) {
      headerActions.insertBefore(headerBellBtn, signBtn);
    } else {
      headerActions.appendChild(headerBellBtn);
    }
  }

  headerBellBadge = document.getElementById("dm_notif_badge");
  return headerBellBtn;
}

function ensureBellBadge() {
  if (headerBellBadge) return headerBellBadge;
  headerBellBadge = document.getElementById("dm_notif_badge");
  return headerBellBadge;
}

function setBellCount(n) {
  ensureBellBadge();
  if (!headerBellBadge) return;
  if (!n || n <= 0) {
    headerBellBadge.style.display = "none";
  } else {
    headerBellBadge.style.display = "inline-block";
    headerBellBadge.textContent = String(n);
  }
}

// figure out tone + title for a notification
function notifMetaFor(ev) {
  const rawType = (ev.type || "").toLowerCase();
  const rawLevel = (ev.level || ev.category || ev.severity || "").toLowerCase();
  const baseKey = rawLevel || rawType || "info";

  let tone = "info";
  if (/success|matched|match|fulfilled|completed|complete|thank/.test(baseKey)) {
    tone = "success";
  } else if (/warn|warning|expiry|expir|urgent|pickup|deadline|reminder/.test(baseKey)) {
    tone = "warning";
  } else if (/error|issue|problem|failed|fail|safety|alert|expired/.test(baseKey)) {
    tone = "error";
  } else {
    tone = "info";
  }

  const toneConfig = {
    success: { color: "#16a34a", softBg: "#dcfce7", label: "Success" },
    info: { color: "#0284c7", softBg: "#e0f2fe", label: "Info" },
    warning: { color: "#eab308", softBg: "#fef9c3", label: "Warning" },
    error: { color: "#dc2626", softBg: "#fee2e2", label: "Urgent" },
  }[tone];

  let title = ev.title || "";
  const t = rawType;

  if (!title) {
    if (/donation/.test(t) && /match/.test(t)) title = "Donation Matched!";
    else if (/request/.test(t) && /fulfill/.test(t)) title = "Request Fulfilled!";
    else if (/exchange/.test(t) && /complete/.test(t)) title = "Exchange Completed!";
    else if (/expiry|expir/.test(t)) title = "Expiry Reminder";
    else if (/message|chat/.test(t)) title = "New Message";
    else if (/pickup/.test(t)) title = "Pickup Reminder";
    else if (/alert|safety/.test(t)) title = "Safety Alert";
    else if (/request/.test(t) && /new/.test(t)) title = "New Request Available";
    else title = toneConfig.label + " Notification";
  }

  return {
    tone,
    title,
    color: toneConfig.color,
    softBg: toneConfig.softBg,
    label: toneConfig.label,
  };
}

// SVG icon
function iconForEvent(ev, meta) {
  const baseSvg = `width:16px;height:16px;display:block;`;
  const t = (ev.type || "").toLowerCase();

  if (meta.tone === "info" || /message|chat|request/.test(t)) {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"/>
      </svg>
    `;
  }

  if (meta.tone === "success") {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 16.6 5.4 12.5l1.4-1.4 2.7 2.7 7.7-7.7 1.4 1.4-9.1 9.1Z"/>
      </svg>
    `;
  }

  if (meta.tone === "warning") {
    return `
      <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2 1 21h22L12 2Zm1 13h-2v-2h2Zm0-4h-2V9h2Z"/>
      </svg>
    `;
  }

  return `
    <svg style="${baseSvg}" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 11h-2V7h2Zm0 4h-2v-2h2Z"/>
    </svg>
  `;
}

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
      <span id="dm_notif_count_pill" style="font-size:.8rem;color:#64748b;">0 notifications</span>
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

  document
    .getElementById("dm_notif_footer")
    .addEventListener("click", () => (notifDropdown.style.display = "none"));

  // close on outside click / ESC
  document.addEventListener("click", (e) => {
    if (notifDropdown.style.display === "none") return;
    if (
      notifDropdown.contains(e.target) ||
      (headerBellBtn &&
        (e.target === headerBellBtn || headerBellBtn.contains(e.target)))
    )
      return;
    notifDropdown.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && notifDropdown.style.display !== "none") {
      notifDropdown.style.display = "none";
    }
  });

  return notifDropdown;
}

function showNotifDropdown() {
  ensureNotifDropdown();
  notifDropdown.style.display = "block";
  setBellCount(0);
}
function hideNotifDropdown() {
  if (notifDropdown) notifDropdown.style.display = "none";
}

function renderEventsListHeader(items) {
  ensureNotifDropdown();
  const list = document.getElementById("dm_notif_list");
  const pill = document.getElementById("dm_notif_count_pill");
  if (!list || !pill) return;

  if (!items || !items.length) {
    list.innerHTML = `
      <div style="padding:10px 14px; color:#64748b; font-size:.85rem;">
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
        margin:6px 10px;
        border-radius:8px;
        cursor:pointer;
        border-bottom:1px solid #f1f5f9;
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

  list.querySelectorAll("[data-id]").forEach((card) => {
    card.onclick = async () => {
      const id = card.getAttribute("data-id");
      try {
        const nRef = doc(db, "events", id);
        await updateDoc(nRef, { read: true }).catch(() => {});
      } catch (e) {
        console.warn("events mark read error:", e?.message);
      }
      hideNotifDropdown();
    };
  });
}

function listenToEventsHeader(user) {
  if (unsubEventsHeader) {
    unsubEventsHeader();
    unsubEventsHeader = null;
  }

  if (!user) {
    renderEventsListHeader([]);
    setBellCount(0);
    return;
  }

  try {
    const eventsQ = query(
      collection(db, "events"),
      where("targetUserId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    unsubEventsHeader = onSnapshot(
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
        renderEventsListHeader(items);
        const unread = items.filter((i) => !i.read).length;
        setBellCount(unread);
      },
      (err) => {
        console.warn("events listener error:", err?.message);
        renderEventsListHeader([]);
        setBellCount(0);
      }
    );
  } catch (e) {
    console.warn("events query error:", e?.message);
  }
}

/* ---------- MAIN ---------- */
document.addEventListener("DOMContentLoaded", () => {
  /* ===== Which profile is being viewed (for messaging) ===== */
  const urlParams = new URLSearchParams(window.location.search);
  const viewedUserIdFromUrl = urlParams.get("uid") || null;
  let viewedUserId = null;
  let viewedUserDisplayName = null;
  let viewedUserAvatar = null;

  /* ===== Tabs ===== */
  try {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const panels = Array.from(document.querySelectorAll(".tab-panel"));
    function showTab(id) {
      panels.forEach((p) => {
        p.style.display = p.id === id ? "block" : "none";
      });
      tabs.forEach((t) => {
        const active = t.dataset.target === id;
        t.classList.toggle("tab--active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
    tabs.forEach((t) =>
      t.addEventListener("click", () => showTab(t.dataset.target))
    );
    if (panels.length) showTab("section-overview");
  } catch (e) {
    console.warn("Tabs init error", e);
  }

  /* ===== Active nav highlight ===== */
  (function () {
    try {
      const path = (location.pathname || "").split("/").pop();
      document.querySelectorAll("nav a").forEach((a) => {
        if (a.getAttribute("href") === path) a.classList.add("active");
      });
    } catch (e) {
      /* ignore */
    }
  })();

  /* ===== HEADER buttons (sign in + bell) ===== */
  signInBtn = document.querySelector(".sign-in-btn");
  if (signInBtn) renderSignedOutHeader();

  ensureBellButton();
  ensureNotifDropdown();
  if (headerBellBtn) {
    ensureBellBadge();
    headerBellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!notifDropdown || notifDropdown.style.display === "none")
        showNotifDropdown();
      else hideNotifDropdown();
    });
  }

  /* ===== Announcement bar ===== */
  const announce = document.getElementById("announce");
  const announceText = document.getElementById("announceText");
  document
    .getElementById("announceClose")
    ?.addEventListener("click", () => announce?.classList.remove("show"));
  function toastAnnounce(msg) {
    if (!announce || !announceText) return;
    announceText.textContent = msg;
    announce.classList.add("show");
    setTimeout(() => announce.classList.remove("show"), 6000);
  }

  // ✅ NEW: alias used across file; prevents ReferenceError
  function toastTop(msg) {
    toastAnnounce(msg);
  }

  /* ===== Cloudinary avatar ===== */
  const CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
  const CLOUDINARY_UNSIGNED_PRESET = "donormedix";
  document.getElementById("avatarClick")?.addEventListener("click", () => {
    if (!window.cloudinary?.createUploadWidget) {
      alert("Cloudinary widget not loaded.");
      return;
    }
    const w = window.cloudinary.createUploadWidget(
      {
        cloudName: CLOUDINARY_CLOUD_NAME,
        uploadPreset: CLOUDINARY_UNSIGNED_PRESET,
        multiple: false,
        cropping: true,
        croppingAspectRatio: 1,
        maxImageFileSize: 5_000_000,
      },
      (err, res) => {
        if (err) {
          console.error(err);
          return;
        }
        if (res?.event === "success") {
          const url = res.info.secure_url;
          const img = document.getElementById("profilePic");
          if (img) img.src = url;
          document
            .getElementById("saveProfileBtn")
            ?.classList.remove("hidden");
          document.getElementById("editProfileBtn")?.classList.add("hidden");
        }
      }
    );
    w.open();
  });

  /* ===== Common DOM refs ===== */
  const donationsList = document.getElementById("donationsList");
  const requestsList = document.getElementById("requestsList");
  const activityFeed = document.getElementById("activityFeed");

  const nameDisplay = document.getElementById("nameDisplay");
  const profLine = document.getElementById("professionLine");
  const bioPreview = document.getElementById("bioPreview");

  // metrics
  const mDon =
    document.getElementById("mDon") ||
    document.getElementById("donationsDisplay");
  const mReq =
    document.getElementById("mRequests") || document.getElementById("mReq");
  const mRat =
    document.getElementById("mRating") || document.getElementById("mRat");
  const ratingDisp = document.getElementById("ratingDisplay");
  const sinceDisp = document.getElementById("sinceDisplay");
  const donsDisp = document.getElementById("donationsDisplay");

  // badges (verified + donor tier)
  const verifyBadge = document.getElementById("verifyBadge");
  const verifyText = document.getElementById("verifyText");
  const tierBadge = document.getElementById("tierBadge");
  const tierText = document.getElementById("tierText");

  /* ===== Activity feed + Activity tab ===== */
  const ddAct = document.getElementById("dd-act");

  function pushActivity(text, sub) {
    // main activity card in Overview
    if (activityFeed) {
      const d = document.createElement("div");
      d.className = "act";
      d.innerHTML = `
        <div class="icon"><i class="fa-solid fa-message"></i></div>
        <div>
          <div style="font-weight:800">${escapeHtml(text)}</div>
          <div class="muted">${escapeHtml(sub || "")}</div>
        </div>`;
      activityFeed.prepend(d);
    }
    // optional dropdown activity list (if present)
    if (ddAct) {
      const existing = ddAct.innerHTML;
      const item = `<div class="dd-item">
        <strong>${escapeHtml(text)}</strong><br>
        <small>${escapeHtml(sub || nowStr())}</small>
      </div>`;
      ddAct.innerHTML = item + (existing || "");
    }
  }

  /* ===== Metrics + badges UI ===== */

  // Compute donor tier from total donations
  function computeDonorTier(count) {
    const n = Number(count || 0);
    if (n >= 10) return "Gold donor";
    if (n >= 5) return "Silver donor";
    if (n >= 1) return "Bronze donor";
    return "New donor";
  }

  // Update the verified + donor tier badges (Font Awesome icons)
  function updateBadges(data) {
    if (!verifyBadge || !verifyText || !tierBadge || !tierText) return;

    const isVerified = !!data.verified;

    // ========== VERIFIED BADGE ==========
    const vIconWrap = verifyBadge.querySelector(".icon");
    const vIconEl = vIconWrap ? vIconWrap.querySelector("i") : null;

    if (isVerified) {
      verifyBadge.classList.remove("badge-not-verified");
      verifyBadge.classList.add("badge-verified");
      verifyText.textContent = "Verified donor";

      if (vIconEl) {
        // green circle-check icon
        vIconEl.className = "fa-solid fa-circle-check";
      } else if (vIconWrap) {
        vIconWrap.textContent = "✔";
      }
    } else {
      verifyBadge.classList.remove("badge-verified");
      verifyBadge.classList.add("badge-not-verified");
      verifyText.textContent = "Not verified";

      if (vIconEl) {
        // red exclamation icon
        vIconEl.className = "fa-solid fa-circle-exclamation";
      } else if (vIconWrap) {
        vIconWrap.textContent = "!";
      }
    }

    // ========== DONOR TIER BADGE ==========
    const currentDonations =
      typeof data.donations !== "undefined"
        ? data.donations
        : (donsDisp?.textContent || 0);

    const tierLabel = data.donorTier || computeDonorTier(currentDonations);
    tierText.textContent = tierLabel;

    const tIconWrap = tierBadge.querySelector(".icon");
    const tIconEl = tIconWrap ? tIconWrap.querySelector("i") : null;
    const lower = tierLabel.toLowerCase();

    if (tIconEl) {
      if (lower.includes("gold")) {
        tIconEl.className = "fa-solid fa-trophy";
      } else if (lower.includes("silver")) {
        tIconEl.className = "fa-solid fa-medal";
      } else if (lower.includes("bronze")) {
        tIconEl.className = "fa-solid fa-medal";
      } else {
        tIconEl.className = "fa-solid fa-award";
      }
    } else if (tIconWrap) {
      if (lower.includes("gold")) tIconWrap.textContent = "🥇";
      else if (lower.includes("silver")) tIconWrap.textContent = "🥈";
      else if (lower.includes("bronze")) tIconWrap.textContent = "🥉";
      else tIconWrap.textContent = "🏅";
    }
  }

  function updateMetricsUI(data) {
    if (!data) return;
    if (mDon) mDon.textContent = String(data.donations ?? mDon.textContent ?? 0);
    if (mReq) mReq.textContent = String(data.requests ?? mReq.textContent ?? 0);
    if (mRat) mRat.textContent = Number(data.rating ?? 0).toFixed(1);
    if (ratingDisp)
      ratingDisp.textContent = `(${Number(data.rating ?? 0).toFixed(1)})`;
    if (sinceDisp) sinceDisp.textContent = data.since || "—";
    if (donsDisp) donsDisp.textContent = String(data.donations ?? 0);

    if (
      typeof data.verified !== "undefined" ||
      typeof data.donorTier !== "undefined" ||
      typeof data.donations !== "undefined"
    ) {
      updateBadges(data);
    }
  }

  function setTotalDonationsCount(n) {
    const el1 = document.getElementById("totalDonations");
    const el2 = document.getElementById("donationsDisplay");
    if (el1) el1.textContent = String(n);
    if (el2) el2.textContent = String(n);
  }

  /* ===== Donations (Firestore realtime) ===== */
  const donationsCol = collection(db, "donations");
  let unsubMyDon = null;

  function donationItemTemplateFS(d) {
    return `
      <article class="donation-card" data-id="${escapeHtml(d._id)}">
        <div class="thumb">
          ${
            d.imageUrl
              ? `<img src="${escapeHtml(
                  d.imageUrl
                )}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`
              : d.emoji || "🎁"
          }
        </div>

        <div>
          <div class="item-title">${escapeHtml(
            d.medicineName || "Donation"
          )}</div>
          <div class="item-sub">${escapeHtml(
            d.category || "Other"
          )} · Quantity: ${escapeHtml(String(d.quantity || "1"))}</div>
          <div class="item-date">Posted ${
            d._ms ? new Date(d._ms).toLocaleString() : ""
          }</div>
        </div>

        <!-- right column: status + button column (matches CSS flex layout) -->
        <div>
          <span class="status ${escapeHtml(
            d.statusClass || "status--available"
          )}">${escapeHtml(d.status || "available")}</span>
          <button class="btn-del" data-type="donation" data-id="${escapeHtml(
            d._id
          )}" type="button">Delete</button>
        </div>
      </article>`;
  }

  function bindDonationDeletesFS() {
    if (!donationsList) return;
    if (donationsList.__delBound) return;
    donationsList.__delBound = true;

    donationsList.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-del");
      if (!btn) return;
      const id = btn.dataset.id;
      if (!confirm("Delete this donation?")) return;
      try {
        await deleteDoc(doc(db, "donations", id));
        pushActivity("Donation removed", `ID ${id}`);
        toastTop("Donation removed");
      } catch (err) {
        console.error(err);
        alert("Failed to delete donation.");
      }
    });
  }

  function startMyDonationsRealtime(uid) {
    if (unsubMyDon) unsubMyDon();

    let lastCount = 0;
    let lastTier = computeDonorTier(0);

    unsubMyDon = onSnapshot(
      query(donationsCol, where("userId", "==", uid)),
      async (ss) => {
        const items = [];
        ss.forEach((s) => {
          const d = s.data();
          const ms =
            d.createdAt?.toMillis?.() ||
            (d.createdAt?.seconds ? d.createdAt.seconds * 1000 : Date.now());
          items.push({ ...d, _id: s.id, _ms: ms });
        });
        items.sort((a, b) => b._ms - a._ms);

        if (donationsList) {
          donationsList.innerHTML = items.length
            ? items.map(donationItemTemplateFS).join("")
            : '<div class="muted">No donations yet.</div>';
        }

        const donationsCount = items.length;

        updateMetricsUI({
          donations: donationsCount,
          requests: Number(mReq?.textContent || 0),
          rating: Number(mRat?.textContent || 0),
        });
        setTotalDonationsCount(donationsCount);

        try {
          const prevTier = lastTier;
          const newTier = computeDonorTier(donationsCount);

          if (donationsCount !== lastCount) {
            await setDoc(
              doc(db, "users", uid),
              { donations: donationsCount, donorTier: newTier },
              { merge: true }
            );

            const diff = donationsCount - lastCount;
            if (diff > 0) {
              const msg =
                diff === 1
                  ? "You posted a new donation"
                  : `You posted ${diff} new donations`;
              pushActivity(msg, nowStr());
              toastTop(msg);
            } else {
              const removed = lastCount - donationsCount;
              const msg =
                removed === 1
                  ? "A donation was removed"
                  : `${removed} donations were removed`;
              pushActivity(msg, nowStr());
              toastTop(msg);
            }

            lastCount = donationsCount;
            lastTier = newTier;
          }
        } catch (e) {
          console.warn("Failed syncing donation count/tier", e);
        }

        bindDonationDeletesFS(uid);
      },
      (err) => console.error("My donations listener error:", err)
    );
  }

  /* ===== Requests (Firestore realtime) ===== */
  let unsubReq = null;

  function requestItemTemplate(r) {
    return `
      <article class="request-card" data-id="${escapeHtml(
        r._id || r.id || ""
      )}">
        <div class="thumb">
          ${
            r.imageUrl
              ? `<img src="${escapeHtml(
                  r.imageUrl
                )}" alt="request image" style="width:100%;height:100%;object-fit:cover">`
              : r._photo
              ? `<img src="${escapeHtml(
                  r._photo
                )}" alt="avatar" style="width:100%;height:100%;object-fit:cover">`
              : "📝"
          }
        </div>

        <div>
          <div class="item-title">${escapeHtml(
            r.title || "Request"
          )}</div>
          <div class="item-sub">${escapeHtml(
            r.description || r.subtitle || ""
          )}</div>
          <div class="item-date">${escapeHtml(r._when || "")}</div>
        </div>

        <!-- right column: just the buttons, stacked/row via CSS -->
        <div>
          <button class="btn-open" data-id="${escapeHtml(
            r._id || ""
          )}" type="button">Open</button>
          <button class="btn-del" data-type="request" data-id="${escapeHtml(
            r._id || ""
          )}" type="button">Delete</button>
        </div>
      </article>`;
  }

  function startMyRequestsRealtime(uid) {
    if (unsubReq) unsubReq();
    unsubReq = onSnapshot(
      query(collection(db, "requests"), where("requesterId", "==", uid)),
      (ss) => {
        const items = [];
        const changesText = [];

        ss.docChanges().forEach((ch) => {
          const d = ch.doc.data();
          if (ch.type === "added")
            changesText.push(`Created request: ${d.title || "Untitled"}`);
          if (ch.type === "modified")
            changesText.push(
              `Updated request: ${d.title || "Untitled"} (${d.status || "open"})`
            );
          if (ch.type === "removed")
            changesText.push(`Deleted request: ${d.title || "Untitled"}`);
        });

        ss.forEach((s) => {
          const d = s.data();
          const ms =
            d.createdAt?.toMillis?.() ||
            (d.createdAt?.seconds ? d.createdAt.seconds * 1000 : Date.now());
          d._when = "Requested " + new Date(ms).toLocaleString();
          d._ms = ms;
          d._id = s.id;

          try {
            const local = JSON.parse(localStorage.getItem("userProfile") || "{}");
            d._photo =
              (local && local.photoURL) ||
              auth.currentUser?.photoURL ||
              "default-profile.png";
          } catch {
            d._photo = auth.currentUser?.photoURL || "default-profile.png";
          }

          d.imageUrl = d.imageUrl || d.image || null;
          items.push(d);
        });

        items.sort((a, b) => b._ms - a._ms);

        if (requestsList) {
          requestsList.innerHTML = items.length
            ? items.map(requestItemTemplate).join("")
            : '<div class="muted">No requests yet.</div>';
        }

        if (requestsList && !requestsList.__bound) {
          requestsList.__bound = true;

          requestsList.addEventListener("click", async (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;

            // DELETE
            if (btn.classList.contains("btn-del")) {
              const id = btn.dataset.id;
              if (!id) return;
              if (!confirm("Delete this request?")) return;

              try {
                await deleteDoc(doc(db, "requests", id));
                pushActivity("Request removed", `ID ${id}`);
              } catch (err) {
                console.error(err);
                alert("Failed to delete request.");
              }
              return;
            }

            // OPEN  -> direct to that request page
            if (btn.classList.contains("btn-open")) {
              const id = btn.dataset.id;
              if (!id) return;
              window.location.href = `request.html?rid=${encodeURIComponent(
                id
              )}&view=mine`;
            }
          });
        }

        const userReqCount = items.length;
        const currDon = Number(mDon?.textContent || 0);
        const currRat = Number(mRat?.textContent || 0);
        updateMetricsUI({
          donations: currDon,
          requests: userReqCount,
          rating: currRat,
        });

        if (changesText.length) {
          changesText.forEach((t) => pushActivity(t, nowStr()));
          toastTop(changesText[0]);
        }
      },
      (err) => console.error("My requests listener error:", err)
    );
  }

  /* ===== PSGC Location Cascader ===== */
  const PSGC_BASE = "https://psgc.gitlab.io/api";
  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  }
  async function getRegions() {
    return fetchJson(`${PSGC_BASE}/regions/`);
  }
  async function getProvincesByRegion(regionCode) {
    try {
      return await fetchJson(`${PSGC_BASE}/regions/${regionCode}/provinces/`);
    } catch {
      const all = await fetchJson(`${PSGC_BASE}/provinces/`);
      return all.filter((p) => p.regionCode === regionCode);
    }
  }
  async function getCitiesMunsByProvince(provCode) {
    try {
      return await fetchJson(
        `${PSGC_BASE}/provinces/${provCode}/cities-municipalities/`
      );
    } catch {
      const prov = await fetchJson(`${PSGC_BASE}/provinces/${provCode}/`);
      const regionCities = await fetchJson(
        `${PSGC_BASE}/regions/${prov.regionCode}/cities-municipalities/`
      );
      return regionCities.filter((x) => x.provinceCode === provCode);
    }
  }
  async function getBarangaysByCityMun(cmCode) {
    try {
      return await fetchJson(`${PSGC_BASE}/cities/${cmCode}/barangays/`);
    } catch {
      try {
        return await fetchJson(
          `${PSGC_BASE}/municipalities/${cmCode}/barangays/`
        );
      } catch {
        const all = await fetchJson(`${PSGC_BASE}/barangays/`);
        return all.filter(
          (b) => b.cityCode === cmCode || b.municipalityCode === cmCode
        );
      }
    }
  }
  function opt(text, value) {
    const o = document.createElement("option");
    o.textContent = text;
    o.value = value;
    return o;
  }

  const selRegion = document.getElementById("selRegion");
  const selProvince = document.getElementById("selProvince");
  const selCityMun = document.getElementById("selCityMun");
  const selBarangay = document.getElementById("selBarangay");
  const hiddenLocation = document.getElementById("location");

  function updateLocationString() {
    if (!hiddenLocation) return;
    const rn = selRegion?.selectedOptions?.[0]?.textContent || "";
    const pn = selProvince?.selectedOptions?.[0]?.textContent || "";
    const cn = selCityMun?.selectedOptions?.[0]?.textContent || "";
    const bn = selBarangay?.selectedOptions?.[0]?.textContent || "";
    hiddenLocation.value = [rn, pn, cn, bn].filter(Boolean).join(" · ");
  }

  async function initPSGCCascader(savedText) {
    if (!selRegion || !selProvince || !selCityMun || !selBarangay) return;
    selRegion.innerHTML = "";
    selRegion.append(opt("Select Region…", ""));
    selProvince.innerHTML = "";
    selProvince.append(opt("Select Province…", ""));
    selProvince.disabled = true;
    selCityMun.innerHTML = "";
    selCityMun.append(opt("Select City/Municipality…", ""));
    selCityMun.disabled = true;
    selBarangay.innerHTML = "";
    selBarangay.append(opt("Select Barangay…", ""));
    selBarangay.disabled = true;
    try {
      const regions = await getRegions();
      regions
        .sort((a, b) =>
          (a.regionName || a.name).localeCompare(b.regionName || b.name)
        )
        .forEach((r) =>
          selRegion.append(opt(r.regionName || r.name, r.code))
        );

      if (savedText) {
        const parts = savedText
          .split(" · ")
          .map((s) => s.trim())
          .filter(Boolean);
        const [savedRegion, savedProv, savedCity, savedBrgy] = parts;
        if (savedRegion) {
          const rOpt = Array.from(selRegion.options).find(
            (o) => o.textContent === savedRegion
          );
          if (rOpt) {
            selRegion.value = rOpt.value;
            await onRegionChange(false);
          }
        }
        if (savedProv) {
          const pOpt = Array.from(selProvince.options).find(
            (o) => o.textContent === savedProv
          );
          if (pOpt) {
            selProvince.value = pOpt.value;
            await onProvinceChange(false);
          }
        }
        if (savedCity) {
          const cOpt = Array.from(selCityMun.options).find(
            (o) => o.textContent === savedCity
          );
          if (cOpt) {
            selCityMun.value = cOpt.value;
            await onCityMunChange(false);
          }
        }
        if (savedBrgy) {
          const bOpt = Array.from(selBarangay.options).find(
            (o) => o.textContent === savedBrgy
          );
          if (bOpt) {
            selBarangay.value = bOpt.value;
          }
        }
        updateLocationString();
      }
    } catch (e) {
      console.warn("PSGC init failed:", e);
    }
  }

  async function onRegionChange(clearLower = true) {
    if (!selRegion || !selProvince || !selCityMun || !selBarangay) return;
    const regionCode = selRegion.value;
    if (!regionCode) {
      if (clearLower) {
        selProvince.innerHTML = "";
        selProvince.append(opt("Select Province…", ""));
        selProvince.disabled = true;
        selCityMun.innerHTML = "";
        selCityMun.append(opt("Select City/Municipality…", ""));
        selCityMun.disabled = true;
        selBarangay.innerHTML = "";
        selBarangay.append(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      }
      updateLocationString();
      return;
    }
    selProvince.disabled = false;
    selProvince.innerHTML = "";
    selProvince.append(opt("Loading provinces…", ""));
    try {
      const provs = await getProvincesByRegion(regionCode);
      selProvince.innerHTML = "";
      selProvince.append(opt("Select Province…", ""));
      provs
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((p) => selProvince.append(opt(p.name, p.code)));
      selCityMun.innerHTML = "";
      selCityMun.append(opt("Select City/Municipality…", ""));
      selCityMun.disabled = true;
      selBarangay.innerHTML = "";
      selBarangay.append(opt("Select Barangay…", ""));
      selBarangay.disabled = true;
    } catch (e) {
      console.warn("Provinces error:", e);
    }
    updateLocationString();
  }

  async function onProvinceChange(clearLower = true) {
    if (!selProvince || !selCityMun || !selBarangay) return;
    const code = selProvince.value;
    if (!code) {
      if (clearLower) {
        selCityMun.innerHTML = "";
        selCityMun.append(opt("Select City/Municipality…", ""));
        selCityMun.disabled = true;
        selBarangay.innerHTML = "";
        selBarangay.append(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      }
      updateLocationString();
      return;
    }
    selCityMun.disabled = false;
    selCityMun.innerHTML = "";
    selCityMun.append(opt("Loading…", ""));
    try {
      const cms = await getCitiesMunsByProvince(code);
      selCityMun.innerHTML = "";
      selCityMun.append(opt("Select City/Municipality…", ""));
      cms
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((c) => selCityMun.append(opt(c.name, c.code)));
      selBarangay.innerHTML = "";
      selBarangay.append(opt("Select Barangay…", ""));
      selBarangay.disabled = true;
    } catch (e) {
      console.warn("Cities error:", e);
    }
    updateLocationString();
  }

  async function onCityMunChange(clearLower = true) {
    if (!selCityMun || !selBarangay) return;
    const code = selCityMun.value;
    if (!code) {
      if (clearLower) {
        selBarangay.innerHTML = "";
        selBarangay.append(opt("Select Barangay…", ""));
        selBarangay.disabled = true;
      }
      updateLocationString();
      return;
    }
    selBarangay.disabled = false;
    selBarangay.innerHTML = "";
    selBarangay.append(opt("Loading barangays…", ""));
    try {
      const brgys = await getBarangaysByCityMun(code);
      selBarangay.innerHTML = "";
      selBarangay.append(opt("Select Barangay…", ""));
      brgys
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((b) => selBarangay.append(opt(b.name, b.code)));
    } catch (e) {
      console.warn("Barangays error:", e);
    }
    updateLocationString();
  }

  selRegion?.addEventListener("change", () =>
    onRegionChange(true).then(updateLocationString)
  );
  selProvince?.addEventListener("change", () =>
    onProvinceChange(true).then(updateLocationString)
  );
  selCityMun?.addEventListener("change", () =>
    onCityMunChange(true).then(updateLocationString)
  );
  selBarangay?.addEventListener("change", updateLocationString);

  /* ===== Profession selector (category + role + custom) ===== */
  const selProfCat = document.getElementById("selProfCat");
  const selProfRole = document.getElementById("selProfRole");
  const profCustomWrap = document.getElementById("profCustomWrap");
  const inputProfession = document.getElementById("profession");

  const PROF_MAP = {
    Business: [
      "Entrepreneur",
      "Operations",
      "Sales",
      "Finance/Accounting",
      "HR",
      "Admin Assistant",
      "Other (Custom)",
    ],
    Education: [
      "Teacher",
      "Professor",
      "Tutor",
      "School Administrator",
      "Guidance Counselor",
      "Librarian",
      "Other (Custom)",
    ],
    Engineering: [
      "Civil Engineer",
      "Mechanical Engineer",
      "Electrical Engineer",
      "Electronics Engineer",
      "Software Engineer",
      "QA Engineer",
      "Architect",
      "Other (Custom)",
    ],
    "Freelance & Creative": [
      "Freelancer",
      "Photographer",
      "Videographer",
      "Writer",
      "Artist",
      "Musician",
      "Other (Custom)",
    ],
    Healthcare: [
      "Doctor",
      "Nurse",
      "Midwife",
      "Pharmacist",
      "Dentist",
      "Medical Technologist",
      "Caregiver",
      "Therapist",
      "Paramedic",
      "Public Health Worker",
      "Other (Custom)",
    ],
    "IT & Digital": [
      "Developer",
      "UI/UX Designer",
      "Product Manager",
      "Data Analyst",
      "IT Support",
      "Cybersecurity",
      "Digital Marketer",
      "Other (Custom)",
    ],
    "Public Service": [
      "Gov’t Employee",
      "Barangay Health Worker",
      "Social Worker",
      "Police",
      "Firefighter",
      "Military",
      "Other (Custom)",
    ],
    "Skilled Trades": [
      "Driver",
      "Electrician",
      "Plumber",
      "Mechanic",
      "Construction Worker",
      "Farmer",
      "Fisherfolk",
      "Other (Custom)",
    ],
    Student: [
      "Senior High Student",
      "College Student",
      "Graduate Student",
      "Other (Custom)",
    ],
  };

  function fillProfCategories() {
    if (!selProfCat) return;
    selProfCat.innerHTML = "";
    selProfCat.append(opt("Select Category…", ""));
    Object.keys(PROF_MAP)
      .sort()
      .forEach((cat) => selProfCat.append(opt(cat, cat)));
  }
  function fillProfRoles(cat) {
    if (!selProfRole) return;
    selProfRole.innerHTML = "";
    selProfRole.append(opt("Select Role…", ""));
    (PROF_MAP[cat] || []).forEach((role) =>
      selProfRole.append(opt(role, role))
    );
  }
  function showCustom(show) {
    if (!profCustomWrap || !inputProfession) return;
    profCustomWrap.style.display = show ? "" : "none";
    inputProfession.disabled = !show;
    if (show && !inputProfession.value) inputProfession.value = "";
  }
  function getProfessionForSave() {
    if (!selProfCat || !selProfRole)
      return (inputProfession?.value || "").trim();
    const cat = selProfCat.value;
    const role = selProfRole.value;
    if (role && role !== "Other (Custom)") return `${role} — ${cat}`;
    const custom = (inputProfession?.value || "").trim();
    if (custom && cat) return `${custom} — ${cat}`;
    return custom || "";
  }
  function initProfessionUI(savedProfession) {
    fillProfCategories();
    if (selProfRole) selProfRole.disabled = true;
    if (inputProfession) inputProfession.disabled = true;

    if (!savedProfession) return;

    const parts = savedProfession.split("—").map((s) => s.trim());
    if (parts.length === 2 && selProfCat && selProfRole) {
      const [role, cat] = parts;
      const catOpt = Array.from(selProfCat.options).find(
        (o) => o.value === cat
      );
      if (catOpt) {
        selProfCat.value = cat;
        fillProfRoles(cat);
        selProfRole.disabled = false;
        const roleOpt = Array.from(selProfRole.options).find(
          (o) => o.value === role
        );
        if (roleOpt) {
          selProfRole.value = role;
          showCustom(false);
          if (inputProfession) inputProfession.value = role;
          return;
        } else {
          selProfRole.value = "Other (Custom)";
          showCustom(true);
          if (inputProfession) inputProfession.value = role;
          return;
        }
      }
    }
    if (selProfCat) selProfCat.value = "";
    if (selProfRole) {
      selProfRole.innerHTML = '<option value="">Select Role…</option>';
      selProfRole.disabled = true;
    }
    showCustom(true);
    if (inputProfession) inputProfession.value = savedProfession;
  }

  selProfCat?.addEventListener("change", () => {
    const cat = selProfCat.value;
    fillProfRoles(cat);
    if (selProfRole) {
      selProfRole.disabled = !cat;
      selProfRole.value = "";
    }
    showCustom(false);
  });
  selProfRole?.addEventListener("change", () => {
    const isCustom = selProfRole.value === "Other (Custom)";
    showCustom(isCustom);
    if (!isCustom && inputProfession) {
      inputProfession.value = selProfRole.value
        ? `${selProfRole.value}`
        : "";
    }
  });

  /* ===== Privacy toggles ===== */
  function applyToggleState(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active", !!on);
    el.setAttribute("aria-checked", !!on ? "true" : "false");
  }

  function setupToggles(uid) {
    const toggles = [
      { id: "toggleLocation", field: "showLocation" },
      { id: "toggleProfile", field: "publicProfile" },
    ];
    toggles.forEach(({ id, field }) => {
      const el = document.getElementById(id);
      if (!el || el.__bound) return;
      el.__bound = true;
      const flip = async () => {
        const on = !el.classList.contains("active");
        el.classList.toggle("active", on);
        el.setAttribute("aria-checked", on ? "true" : "false");
        try {
          await setDoc(
            doc(db, "users", uid),
            { [field]: on },
            { merge: true }
          );
        } catch (e) {
          console.warn("Failed writing toggle", e);
        }
      };
      el.addEventListener("click", flip);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          flip();
        }
      });
    });
  }

  /* ===== Inline Edit & Save ===== */
  function setupInlineEdit(uid) {
    const editBtn = document.getElementById("editProfileBtn");
    const saveBtn = document.getElementById("saveProfileBtn");
    const profilePic = document.getElementById("profilePic");

    const inputs = ["name", "email", "phone", "bio"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    editBtn?.addEventListener("click", () => {
      inputs.forEach((i) => i.removeAttribute("disabled"));
      [
        "selProfCat",
        "selProfRole",
        "profession",
        "selRegion",
        "selProvince",
        "selCityMun",
        "selBarangay",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
      });
      editBtn.classList.add("hidden");
      saveBtn?.classList.remove("hidden");
    });

    saveBtn?.addEventListener("click", async () => {
      const updatedProfession = getProfessionForSave();

      const updatedData = {
        name: document.getElementById("name")?.value.trim() || "",
        email: document.getElementById("email")?.value.trim() || "",
        phone: document.getElementById("phone")?.value.trim() || "",
        profession: updatedProfession,
        location: document.getElementById("location")?.value.trim() || "",
        bio: document.getElementById("bio")?.value.trim() || "",
        photoURL: profilePic?.src || "",
      };

      try {
        await setDoc(doc(db, "users", uid), updatedData, { merge: true });
        if (auth.currentUser)
          await updateProfile(auth.currentUser, {
            photoURL: updatedData.photoURL,
          });

        if (nameDisplay)
          nameDisplay.textContent = updatedData.name || "Anonymous User";
        if (profLine)
          profLine.textContent =
            updatedProfession || "Add your profession";
        if (bioPreview)
          bioPreview.textContent = updatedData.bio || "—";

        try {
          localStorage.setItem(
            "userProfile",
            JSON.stringify({
              location: updatedData.location || "",
              name: updatedData.name || "",
              photoURL: updatedData.photoURL || "",
            })
          );
        } catch {}

        inputs.forEach((i) => i.setAttribute("disabled", "true"));
        [
          "selProfCat",
          "selProfRole",
          "profession",
          "selRegion",
          "selProvince",
          "selCityMun",
          "selBarangay",
        ].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.disabled = true;
        });

        saveBtn?.classList.add("hidden");
        editBtn?.classList.remove("hidden");

        pushActivity("Profile updated", nowStr());
        toastTop("Profile updated");
      } catch (e) {
        console.error(e);
        alert("Failed to update profile.");
      }
    });
  }

  /* ===== “Add Donation” / “New Request” button actions ===== */
  document
    .getElementById("btnAddDonation")
    ?.addEventListener("click", () => (location.href = "donate.html"));
  document
    .getElementById("btnNewRequest")
    ?.addEventListener("click", () => (location.href = "request.html"));

  /* ===== Message this user → message.html (chat) ===== */
  const btnMessageUser = document.getElementById("btnMessageUser");
  if (btnMessageUser) {
    btnMessageUser.addEventListener("click", () => {
      if (!auth.currentUser) {
        alert("You must be signed in to send a message.");
        window.location.href = "index.html"; // or auth.html
        return;
      }

      if (!viewedUserId) {
        alert("This profile is not linked to a user account.");
        return;
      }

      if (viewedUserId === auth.currentUser.uid) {
        alert("You can’t send a message to your own profile.");
        return;
      }

      openChatFromProfile({
        targetUid: viewedUserId,
        displayName: viewedUserDisplayName,
        avatarUrl: viewedUserAvatar,
      });
    });
  }

  /* ===== Auth: load user + wire realtime ===== */
  let unsubUserDoc = null;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubMyDon) {
        unsubMyDon();
        unsubMyDon = null;
      }
      if (unsubReq) {
        unsubReq();
        unsubReq = null;
      }
      if (unsubEventsHeader) {
        unsubEventsHeader();
        unsubEventsHeader = null;
      }
      try {
        localStorage.removeItem("userProfile");
      } catch {}
      renderSignedOutHeader();
      listenToEventsHeader(null);
      return;
    }

    // If profile.html?uid=OTHER_UID → show that user’s profile; otherwise show own
    const effectiveUid = viewedUserIdFromUrl || user.uid;

    window.__notif_userId = user.uid;
    const userRef = doc(db, "users", effectiveUid);

    if (unsubUserDoc) {
      unsubUserDoc();
      unsubUserDoc = null;
    }

    try {
      unsubUserDoc = onSnapshot(
        userRef,
        async (snap) => {
          const data = snap.exists() ? snap.data() : {};

          const userData = {
            uid: effectiveUid,
            name: data.name || user.displayName || "Anonymous User",
            email: data.email || user.email || "",
            phone: data.phone || user.phone || "",
            profession: data.profession || "Add your profession",
            location: data.location || "",
            bio: data.bio || "",
            photoURL: data.photoURL || user.photoURL || "default-profile.png",
            donations:
              typeof data.donations === "number" ? data.donations : 0,
            requests:
              typeof data.requests === "number" ? data.requests : 0,
            rating: Number(data.rating ?? 4.8),
            since: data.since || "2025",
            showLocation: data.showLocation ?? false,
            publicProfile: data.publicProfile ?? false,
            verified: !!data.verified,
            donorTier:
              data.donorTier || computeDonorTier(data.donations || 0),
          };

          // Store viewed user details for the "Message this user" button
          viewedUserId = userData.uid;
          viewedUserDisplayName = userData.name || null;
          viewedUserAvatar = userData.photoURL || null;

          try {
            localStorage.setItem(
              "userProfile",
              JSON.stringify({
                location: userData.location || "",
                name: userData.name || "",
                photoURL: userData.photoURL || "",
              })
            );
          } catch {}

          const pic = document.getElementById("profilePic");
          if (pic) pic.src = userData.photoURL;
          if (nameDisplay) nameDisplay.textContent = userData.name;
          if (profLine) profLine.textContent = userData.profession;
          if (bioPreview) bioPreview.textContent = userData.bio || "—";

          const nameInput = document.getElementById("name");
          const emailInput = document.getElementById("email");
          const phoneInput = document.getElementById("phone");
          const bioInput = document.getElementById("bio");

          if (nameInput) nameInput.value = userData.name;
          if (emailInput) emailInput.value = userData.email;
          if (phoneInput) phoneInput.value = userData.phone;
          if (bioInput) bioInput.value = userData.bio;
          if (hiddenLocation) hiddenLocation.value = userData.location || "";

          updateMetricsUI(userData);

          initProfessionUI(
            userData.profession === "Add your profession"
              ? ""
              : userData.profession
          );
          await initPSGCCascader(userData.location || "");

          applyToggleState("toggleLocation", userData.showLocation);
          applyToggleState("toggleProfile", userData.publicProfile);
          setupToggles(user.uid);
          setupInlineEdit(user.uid);

          updateHeaderProfile(user, userData);
          listenToEventsHeader(user);

          // Donations + requests always use the logged-in user’s UID
          startMyDonationsRealtime(user.uid);
          startMyRequestsRealtime(user.uid);
        },
        (err) => {
          console.error("users doc onSnapshot error:", err);
          getDoc(userRef)
            .then((snap) => {
              const data = snap.exists() ? snap.data() : {};
              updateMetricsUI({
                donations: data.donations ?? 0,
                requests: data.requests ?? 0,
                rating: data.rating ?? 4.8,
              });
            })
            .catch(() => {});
        }
      );
    } catch (err) {
      console.error("Failed to initialize profile listeners", err);
      alert("Unable to load your profile right now.");
    }
  });
});
