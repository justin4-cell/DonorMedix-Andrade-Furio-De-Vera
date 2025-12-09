import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

/* ---------- Firebase config ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

// Reuse app if already initialized somewhere else
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ---------- Cloudinary config (for images in chat) ---------- */
const CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
const CLOUDINARY_UPLOAD_PRESET = "donormedix";
const CLOUDINARY_FOLDER = "donormedix-chat";

/* ---------- URL params ---------- */
const urlParams = new URLSearchParams(window.location.search);

// Direct chat target
const otherUid =
  urlParams.get("chatWith") ||
  urlParams.get("uid") ||
  urlParams.get("to");

// Group chat target
const groupId = urlParams.get("groupId") || null;
let isGroupChat = !!groupId;

const donationId = urlParams.get("donationId") || null;
const requestId = urlParams.get("requestId") || null;

// fallback name + avatar from donate.js / browse.js
const otherNameFromUrl = urlParams.get("name") || null;
const otherAvatarFromUrl = urlParams.get("avatar") || null;

/* ---------- DOM elements ---------- */
// Left sidebar
const sidebarAvatarImg = document.getElementById("sidebarAvatar");
const sidebarNameSpan = document.getElementById("sidebarName");
const btnAllChats = document.getElementById("btnAllChats");
const btnProfileNav = document.getElementById("btnProfileNav");
const btnSettingsNav = document.getElementById("btnSettingsNav");
const settingsCardContainer = document.getElementById("settingsCardContainer");
const sidebarAside = sidebarAvatarImg?.closest("aside");

// All Chats section
const allChatsSection = document.getElementById("allChatsSection");
const chatListEl = document.getElementById("chatList");
const chatSearchInput = document.getElementById("chatSearch");

// Main header
const headerAvatarImg = document.getElementById("headerAvatar");
const headerNameSpan = document.getElementById("headerName");
const headerStatusSpan = document.getElementById("headerStatus");
const headerSubSpan = document.getElementById("chatSubtitle");

// Messages
const messagesSection = document.getElementById("messages");

// Footer controls
const imageBtn = document.getElementById("imageBtn");
const cameraBtn = document.getElementById("cameraBtn");
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");

/* ---------- Create Group button (below Settings in left menu) ---------- */

let btnCreateGroup = null;

if (btnSettingsNav && btnSettingsNav.parentElement) {
  const nav = btnSettingsNav.parentElement; // the <nav> with menu buttons

  btnCreateGroup = document.createElement("button");
  btnCreateGroup.type = "button";
  btnCreateGroup.id = "btnCreateGroup";
  btnCreateGroup.className =
    "flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-slate-900 text-xs text-slate-100";

  btnCreateGroup.innerHTML = `
    <div class="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[11px] text-slate-100 font-semibold shadow">
      G
    </div>
    <span class="truncate">Create group</span>
  `;

  nav.appendChild(btnCreateGroup);

  btnCreateGroup.addEventListener("click", () => {
    openCreateGroupModal();
  });
}

/* ---------- Sidebar Logout button at the bottom ---------- */

let btnLogoutSidebar = null;

if (sidebarAside) {
  const wrapper = document.createElement("div");
  wrapper.className = "mt-auto pt-4";

  btnLogoutSidebar = document.createElement("button");
  btnLogoutSidebar.type = "button";
  btnLogoutSidebar.id = "btnLogoutSidebar";
  btnLogoutSidebar.className =
    "w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs text-rose-400 hover:bg-slate-900/60";

  btnLogoutSidebar.innerHTML = `
    <div class="w-7 h-7 rounded-full bg-rose-500/10 flex items-center justify-center text-[13px] text-rose-400 font-semibold shadow">
      ⏻
    </div>
    <span class="truncate">Logout</span>
  `;

  wrapper.appendChild(btnLogoutSidebar);
  sidebarAside.appendChild(wrapper);

  btnLogoutSidebar.addEventListener("click", () => {
    handleLogout().catch(console.error);
  });
}

/* Hidden file inputs for image & camera */
const imageInput = document.createElement("input");
imageInput.type = "file";
imageInput.accept = "image/*";
imageInput.classList.add("hidden");
document.body.appendChild(imageInput);

const cameraInput = document.createElement("input");
cameraInput.type = "file";
cameraInput.accept = "image/*";
cameraInput.capture = "environment";
cameraInput.classList.add("hidden");
document.body.appendChild(cameraInput);

/* Typing indicator element */
const typingIndicator = document.createElement("div");
typingIndicator.className =
  "px-6 pb-1 text-[11px] text-slate-500 italic flex gap-1 items-center";
typingIndicator.style.display = "none";
if (messagesSection && messagesSection.parentElement) {
  messagesSection.parentElement.appendChild(typingIndicator);
}

/* ---------- State ---------- */
let currentUser = null;
let currentUserProfile = null;
let otherUserProfile = null;
let currentGroupName = null;
let conversationId = null;

let messagesUnsub = null;
let typingUnsub = null;
let chatsUnsub = null;
let presenceUnsub = null;
let presenceHeartbeatInterval = null;

let lastMessageTimestamps = {}; // local notification dedupe

// typing debounce
const TYPING_TIMEOUT_MS = 3500;
let typingTimeout = null;
let lastTypingSent = 0;

/* ---------- Theme helpers (Dark / Light) ---------- */

const THEME_STORAGE_KEY = "dmx_theme";

function applyTheme(theme) {
  const root = document.documentElement;
  if (!root) return;

  const normalized = theme === "dark" ? "dark" : "light";
  root.setAttribute("data-theme", normalized);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // ignore
  }

  let styleEl = document.getElementById("dmx-theme-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dmx-theme-style";
    document.head.appendChild(styleEl);
  }

  if (normalized === "dark") {
    styleEl.textContent = `
      :root[data-theme="dark"] body {
        background-color: #020617;
        color: #e5e7eb;
      }
      :root[data-theme="dark"] .bg-white {
        background-color: #020617 !important;
      }
      :root[data-theme="dark"] .bg-slate-50,
      :root[data-theme="dark"] .bg-slate-100 {
        background-color: #020617 !important;
      }
      :root[data-theme="dark"] .text-slate-900 {
        color: #e5e7eb !important;
      }
      :root[data-theme="dark"] .text-slate-700 {
        color: #cbd5f5 !important;
      }
      :root[data-theme="dark"] .border-slate-200 {
        border-color: #1f2937 !important;
      }
    `;
  } else {
    styleEl.textContent = "";
  }
}

function initTheme() {
  let saved = "light";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      saved = stored;
    }
  } catch {
    saved = "light";
  }
  applyTheme(saved);
}

initTheme();

/* ---------- Time / date helpers ---------- */

function toDateMaybe(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function formatTimeShort(date) {
  if (!date) return "";
  const hours = date.getHours();
  const minutes = pad2(date.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(date) {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  const opts = { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, opts);
}

function formatRelativeAgo(date) {
  if (!date) return "Offline";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Offline";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) {
    const s = sec || 1;
    return `Offline · ${s} sec ago`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `Offline · ${min} min ago`;
  }
  const hours = Math.floor(min / 60);
  if (hours < 24) {
    return `Offline · ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `Offline · ${days} day${days === 1 ? "" : "s"} ago`;
}

/* ---------- Helpers ---------- */

function combineUserIds(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

async function findUserUidByName(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const usersCol = collection(db, "users");
  const fields = ["name", "displayName", "username"];

  for (const field of fields) {
    try {
      const qUsers = query(usersCol, where(field, "==", trimmed));
      const snap = await getDocs(qUsers);
      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch (e) {
      console.warn(`findUserUidByName error on field ${field}`, e);
    }
  }

  return null;
}

/* ---------- Avatar helpers ---------- */

function createInitialsFromName(name, fallback = "U") {
  if (!name) return fallback;
  const trimmed = name.trim();
  if (!trimmed) return fallback;

  const parts = trimmed.split(/\s+/);
  let letters = "";
  if (parts.length === 1) {
    letters = trimmed.slice(0, 2);
  } else {
    letters = (parts[0][0] || "") + (parts[1][0] || "");
  }
  return letters.toUpperCase();
}

function renderHeaderLetterAvatar(initials, isGroup = false) {
  if (!headerAvatarImg || !headerAvatarImg.parentElement) return;
  const container = headerAvatarImg.parentElement;

  const old = container.querySelector('[data-header-letter-avatar="1"]');
  if (old) old.remove();

  headerAvatarImg.style.display = "none";

  const div = document.createElement("div");
  div.setAttribute("data-header-letter-avatar", "1");
  div.className =
    "w-10 h-10 rounded-full flex items-center justify-center text-[11px] text-slate-100 font-semibold shadow " +
    (isGroup ? "bg-slate-700" : "bg-slate-800");
  div.textContent = initials;

  container.insertBefore(div, headerAvatarImg);
}

function renderHeaderPhotoAvatar(url) {
  if (!headerAvatarImg) return;
  const container = headerAvatarImg.parentElement;
  if (container) {
    const old = container.querySelector('[data-header-letter-avatar="1"]');
    if (old) old.remove();
  }
  headerAvatarImg.style.display = "block";
  headerAvatarImg.src = url;
}

async function updateConversationSubtitle() {
  if (!headerSubSpan) return;
  headerSubSpan.textContent = "";
  headerSubSpan.style.display = "none";
}

function hideSubtitle() {
  if (!headerSubSpan) return;
  headerSubSpan.textContent = "";
  headerSubSpan.style.display = "none";
}

function setSidebarProfile(profile) {
  if (!profile) return;
  if (sidebarNameSpan) sidebarNameSpan.textContent = profile.displayName || "Me";

  if (sidebarAvatarImg) {
    if (profile.photoURL) {
      sidebarAvatarImg.style.display = "block";
      sidebarAvatarImg.src = profile.photoURL;
    } else {
      // keep whatever default image you placed in HTML
      sidebarAvatarImg.style.display = "block";
    }
  }
}

/**
 * Header avatar for the person you are talking to.
 * - If other user has `photoURL` in Firestore → show that photo
 * - Else → initials circle
 */
function setHeaderProfile(profile) {
  if (!profile || isGroupChat) return;

  if (headerNameSpan) headerNameSpan.textContent = profile.displayName || "User";

  const initials = createInitialsFromName(
    profile.displayName || profile.name,
    "U"
  );

  if (profile.photoURL) {
    renderHeaderPhotoAvatar(profile.photoURL);
  } else {
    renderHeaderLetterAvatar(initials, false);
  }

  if (headerStatusSpan) headerStatusSpan.textContent = "Online";

  hideSubtitle();
}

function clearMessagesUI() {
  if (!messagesSection) return;
  messagesSection.innerHTML = "";
}

function getDisplayNameForMsg(msg) {
  if (msg.from === currentUser?.uid && currentUserProfile?.displayName) {
    return currentUserProfile.displayName;
  }
  if (!isGroupChat && msg.from === otherUid && otherUserProfile?.displayName) {
    return otherUserProfile.displayName;
  }
  if (msg.fromName) return msg.fromName;
  return "User";
}

function appendDateSeparator(date) {
  if (!messagesSection) return;
  const wrapper = document.createElement("div");
  wrapper.className = "flex justify-center my-3";

  const inner = document.createElement("div");
  inner.className =
    "px-3 py-1 rounded-full bg-slate-200 text-[11px] text-slate-600";
  inner.textContent = formatDayLabel(date);

  wrapper.appendChild(inner);
  messagesSection.appendChild(wrapper);
}

function renderMessage(msg, isOwn, createdAtDate) {
  if (!messagesSection) return;

  const createdAt = createdAtDate || toDateMaybe(msg.createdAt);
  const timeLabel = formatTimeShort(createdAt);

  const wrapper = document.createElement("div");
  wrapper.className = "flex " + (isOwn ? "justify-end" : "");

  const bubble = document.createElement("div");
  bubble.classList.add(
    "max-w-[70%]",
    "px-4",
    "py-2.5",
    "rounded-2xl",
    "shadow",
    "text-sm",
    "text-slate-900"
  );

  if (isOwn) {
    bubble.classList.add("bg-sky-400", "rounded-br-md");
  } else {
    bubble.classList.add("bg-white", "rounded-bl-md");
  }

  const nameLabel = document.createElement("div");
  nameLabel.className = "text-[11px] text-slate-500 mb-0.5";
  if (isOwn) {
    nameLabel.textContent = "You";
  } else {
    nameLabel.textContent = getDisplayNameForMsg(msg);
  }
  bubble.appendChild(nameLabel);

  if (msg.type === "image" && msg.imageUrl) {
    if (msg.caption) {
      const captionEl = document.createElement("div");
      captionEl.textContent = msg.caption;
      captionEl.className = "mb-1";
      bubble.appendChild(captionEl);
    }

    const img = document.createElement("img");
    img.src = msg.imageUrl;
    img.alt = msg.fileName || "Image";
    img.className = "mt-0.5 rounded-xl max-h-64 object-cover";
    bubble.appendChild(img);
  } else {
    const content = document.createElement("div");
    content.textContent = msg.text || "";
    bubble.appendChild(content);
  }

  const metaRow = document.createElement("div");
  metaRow.className =
    "mt-1 text-[10px] text-slate-700 flex items-center gap-2 justify-end";

  if (timeLabel) {
    const timeSpan = document.createElement("span");
    timeSpan.textContent = timeLabel;
    metaRow.appendChild(timeSpan);
  }

  if (isOwn && msg.seenBy && Array.isArray(msg.seenBy)) {
    const othersSeen = msg.seenBy.filter((uid) => uid !== currentUser?.uid);
    if (othersSeen.length > 0) {
      const seenLabel = document.createElement("span");
      seenLabel.className = "text-right";

      const seenAtDate = toDateMaybe(msg.lastSeenAt);
      if (seenAtDate) {
        const seenTime = formatTimeShort(seenAtDate);
        seenLabel.textContent = `Seen ${seenTime}`;
      } else {
        seenLabel.textContent = "Seen";
      }

      metaRow.appendChild(seenLabel);
    }
  }

  bubble.appendChild(metaRow);

  wrapper.appendChild(bubble);
  messagesSection.appendChild(wrapper);
  messagesSection.scrollTop = messagesSection.scrollHeight;
}

/* ---------- Cloudinary upload ---------- */

async function uploadImageToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  if (CLOUDINARY_FOLDER) formData.append("folder", CLOUDINARY_FOLDER);

  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    console.error("Cloudinary upload error:", await res.text());
    throw new Error("Failed to upload image to Cloudinary");
  }

  const data = await res.json();
  return data.secure_url;
}

/* ---------- Conversation ensure helper ---------- */

async function ensureConversationDoc() {
  if (!currentUser) throw new Error("Not signed in");

  if (isGroupChat) {
    if (!groupId) throw new Error("No groupId provided");
    conversationId = groupId;
    const convRef = doc(db, "conversations", groupId);
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      throw new Error("Group conversation does not exist");
    }
    return convRef;
  }

  if (!otherUid) throw new Error("No recipient user ID");

  if (!conversationId) {
    conversationId = combineUserIds(currentUser.uid, otherUid);
  }

  const convRef = doc(db, "conversations", conversationId);
  const convSnap = await getDoc(convRef);

  if (!convSnap.exists()) {
    await setDoc(convRef, {
      participants: [currentUser.uid, otherUid],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      donationId: donationId || null,
      requestId: requestId || null,
      lastMessagePreview: "",
      isGroup: false,
    });
  } else {
    const data = convSnap.data() || {};
    const updates = {};
    if (donationId && !data.donationId) {
      updates.donationId = donationId;
    }
    if (requestId && !data.requestId) {
      updates.requestId = requestId;
    }
    if (Object.keys(updates).length > 0) {
      await updateDoc(convRef, updates).catch((e) =>
        console.warn("ensureConversationDoc update metadata error:", e)
      );
    }
  }

  return convRef;
}

/* ---------- Send text & image ---------- */

async function sendTextMessage() {
  if (!messageInput) return;

  const text = messageInput.value.trim();
  if (!text) return;

  try {
    const convRef = await ensureConversationDoc();
    const messagesCol = collection(convRef, "messages");

    await addDoc(messagesCol, {
      type: "text",
      text,
      from: currentUser.uid,
      fromName: currentUserProfile?.displayName || "Me",
      to: isGroupChat ? null : otherUid,
      createdAt: serverTimestamp(),
      donationId: isGroupChat ? null : (donationId || null),
      requestId: isGroupChat ? null : (requestId || null),
      seenBy: [currentUser.uid],
    });

    await updateDoc(convRef, {
      lastUpdated: serverTimestamp(),
      lastMessagePreview: text.slice(0, 80),
    });

    messageInput.value = "";
    await setTyping(false);
  } catch (e) {
    console.error("sendTextMessage error:", e);
    alert("Failed to send message: " + (e.message || e));
  }
}

async function sendImageMessage(file, via = "image") {
  if (!file) return;

  try {
    const convRef = await ensureConversationDoc();
    const messagesCol = collection(convRef, "messages");

    const imageUrl = await uploadImageToCloudinary(file);

    await addDoc(messagesCol, {
      type: "image",
      imageUrl,
      fileName: file.name,
      via,
      from: currentUser.uid,
      fromName: currentUserProfile?.displayName || "Me",
      to: isGroupChat ? null : otherUid,
      createdAt: serverTimestamp(),
      donationId: isGroupChat ? null : (donationId || null),
      requestId: isGroupChat ? null : (requestId || null),
      seenBy: [currentUser.uid],
    });

    await updateDoc(convRef, {
      lastUpdated: serverTimestamp(),
      lastMessagePreview: "Sent an image",
    });
  } catch (e) {
    console.error("sendImageMessage error:", e);
    alert("Failed to send image: " + (e.message || e));
  }
}

/* ---------- Typing indicator ---------- */

async function setTyping(isTyping) {
  if (!currentUser || !conversationId) return;
  if (isGroupChat) return;

  const now = Date.now();
  if (isTyping && now - lastTypingSent < 500) return;
  lastTypingSent = now;

  const typingDocRef = doc(
    db,
    "conversations",
    conversationId,
    "typing",
    currentUser.uid
  );

  try {
    await setDoc(
      typingDocRef,
      {
        typing: isTyping,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("setTyping error", e);
  }
}

function subscribeToTyping() {
  if (!currentUser || !conversationId) return;
  if (isGroupChat) return;

  if (typingUnsub) {
    typingUnsub();
    typingUnsub = null;
  }

  if (!otherUid) return;

  const typingDocRef = doc(
    db,
    "conversations",
    conversationId,
    "typing",
    otherUid
  );

  typingUnsub = onSnapshot(
    typingDocRef,
    (snap) => {
      const data = snap.data();
      const show = data && data.typing;
      typingIndicator.style.display = show ? "block" : "none";
    },
    (err) => {
      console.warn("typing listener error", err);
      typingIndicator.style.display = "none";
    }
  );
}

/* ---------- Seen receipts ---------- */

async function markMessagesSeen(snapshot) {
  if (!currentUser || !conversationId) return;

  const promises = [];

  snapshot.forEach((docSnap) => {
    const msg = docSnap.data();
    if (!msg) return;

    const alreadySeen =
      Array.isArray(msg.seenBy) && msg.seenBy.includes(currentUser.uid);

    if (msg.from !== currentUser.uid && !alreadySeen) {
      const ref = docSnap.ref;
      promises.push(
        updateDoc(ref, {
          seenBy: arrayUnion(currentUser.uid),
          lastSeenAt: serverTimestamp(),
        }).catch((e) => console.warn("seen update error", e))
      );
    }
  });

  if (promises.length) {
    await Promise.all(promises);
  }
}

/* ---------- Local notifications ---------- */

let notificationPermissionAsked = false;

async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (notificationPermissionAsked) return false;

  notificationPermissionAsked = true;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

async function maybeNotifyNewMessage(msg) {
  if (!("Notification" in window)) return;
  if (document.hasFocus()) return;

  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const title = isGroupChat
    ? (currentGroupName || "New group message on DonorMedix")
    : (otherUserProfile?.displayName || "New message on DonorMedix");

  const body = msg.type === "text" ? msg.text : "Sent an image";

  const key = `${msg.id || ""}-${msg.createdAt?.seconds || ""}`;
  if (lastMessageTimestamps[key]) return;
  lastMessageTimestamps[key] = true;

  new Notification(title, {
    body,
  });
}

/* ---------- Realtime messages ---------- */

function subscribeToMessages() {
  if (!currentUser || !conversationId) return;

  if (messagesUnsub) {
    messagesUnsub();
    messagesUnsub = null;
  }

  const messagesCol = collection(
    db,
    "conversations",
    conversationId,
    "messages"
  );
  const qMessages = query(messagesCol, orderBy("createdAt", "asc"));

  messagesUnsub = onSnapshot(
    qMessages,
    async (snapshot) => {
      clearMessagesUI();

      if (snapshot.empty) {
        const div = document.createElement("div");
        div.className = "flex";
        div.innerHTML = `
          <div class="max-w-[70%] bg-white rounded-2xl rounded-bl-md shadow px-4 py-2.5 text-sm text-slate-900">
            Start chatting in this conversation.
          </div>
        `;
        messagesSection.appendChild(div);
        return;
      }

      let lastDate = null;

      snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        const isOwn = msg.from === currentUser.uid;
        msg.id = docSnap.id;

        const createdAtDate = toDateMaybe(msg.createdAt) || new Date();

        if (!lastDate || !isSameDay(createdAtDate, lastDate)) {
          appendDateSeparator(createdAtDate);
          lastDate = createdAtDate;
        }

        renderMessage(msg, isOwn, createdAtDate);

        if (!isOwn) {
          maybeNotifyNewMessage(msg).catch(console.error);
        }
      });

      await markMessagesSeen(snapshot);
    },
    (err) => {
      console.error("messages onSnapshot error", err);
    }
  );
}

/* ---------- Simple Call / Video modals (UI-only) ---------- */

function openCallModal(type) {
  const existing = document.getElementById("callOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "callOverlay";
  overlay.className =
    "fixed inset-0 bg-black/50 flex items-center justify-center z-50";

  const box = document.createElement("div");
  box.className =
    "bg-white rounded-2xl shadow-2xl px-6 py-4 w-full max-w-xs text-center";

  const title = document.createElement("div");
  title.className = "text-sm font-semibold text-slate-900 mb-1";
  title.textContent = type === "video" ? "Video call" : "Audio call";

  const subtitle = document.createElement("div");
  subtitle.className = "text-xs text-slate-500 mb-4";
  subtitle.textContent = otherUserProfile?.displayName
    ? `Calling ${otherUserProfile.displayName}...`
    : "Calling user...";

  const btn = document.createElement("button");
  btn.className =
    "mt-2 px-4 py-1.5 rounded-full bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600";
  btn.textContent = "End call";
  btn.addEventListener("click", () => overlay.remove());

  box.appendChild(title);
  box.appendChild(subtitle);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/* ---------- All Chats list (toggle + responsive) ---------- */

let allChatsVisible = false;

function updateAllChatsVisibilityForViewport() {
  if (!allChatsSection) return;

  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    allChatsSection.style.display = allChatsVisible ? "flex" : "none";
  } else {
    allChatsSection.style.display = "flex";
  }
}

updateAllChatsVisibilityForViewport();
window.addEventListener("resize", updateAllChatsVisibilityForViewport);

btnAllChats?.addEventListener("click", () => {
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    allChatsVisible = !allChatsVisible;
  } else {
    allChatsVisible = true;
  }

  updateAllChatsVisibilityForViewport();
});

let otherProfilesCache = new Map();

async function getOtherProfileCached(uid) {
  if (!uid) return null;
  if (otherProfilesCache.has(uid)) return otherProfilesCache.get(uid);
  const prof = await fetchUserProfile(uid, {});
  otherProfilesCache.set(uid, prof);
  return prof;
}

function otherUidFromConvData(data, myUid) {
  const participants = data.participants || [];
  return participants.find((p) => p !== myUid) || null;
}

/* ---------- UPDATED: subscribeToAllChats (client-side sorting) ---------- */

function subscribeToAllChats() {
  if (!currentUser) return;
  if (!chatListEl) return;

  if (chatsUnsub) {
    chatsUnsub();
    chatsUnsub = null;
  }

  const convCol = collection(db, "conversations");

  // Removed orderBy here to avoid composite index issues with array-contains.
  // We will sort the conversations on the client using lastUpdated / createdAt.
  const qChats = query(
    convCol,
    where("participants", "array-contains", currentUser.uid)
  );

  chatsUnsub = onSnapshot(
    qChats,
    async (snap) => {
      chatListEl.innerHTML = "";

      if (snap.empty) {
        const msg = document.createElement("p");
        msg.className = "text-xs text-slate-500 px-3 py-2";
        msg.textContent =
          "No chats yet. Message a donor/requestor from a donation or request, or create a group.";
        chatListEl.appendChild(msg);
        return;
      }

      // Collect all conversations
      const items = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        items.push({ id: docSnap.id, data });
      });

      // Sort by lastUpdated (desc), fallback to createdAt
      items.sort((a, b) => {
        const aTs =
          (a.data.lastUpdated && toDateMaybe(a.data.lastUpdated)) ||
          (a.data.createdAt && toDateMaybe(a.data.createdAt)) ||
          null;
        const bTs =
          (b.data.lastUpdated && toDateMaybe(b.data.lastUpdated)) ||
          (b.data.createdAt && toDateMaybe(b.data.createdAt)) ||
          null;

        const aTime = aTs ? aTs.getTime() : 0;
        const bTime = bTs ? bTs.getTime() : 0;

        return bTime - aTime; // newest first
      });

      // Render in sorted order
      for (const { id, data } of items) {
        const isGroup = !!data.isGroup;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-200 text-slate-900 text-left";

        let displayName = "";
        let avatarHtml = "";

        if (isGroup) {
          const groupName = data.groupName || "Group chat";
          displayName = groupName;

          const initials = createInitialsFromName(groupName, "GC");

          avatarHtml = `
            <div class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-[11px] text-slate-100 font-semibold shadow">
              ${initials}
            </div>
          `;

          btn.addEventListener("click", () => {
            window.location.href =
              "message.html?groupId=" + encodeURIComponent(id);
          });
        } else {
          const otherId = otherUidFromConvData(data, currentUser.uid);
          const prof = await getOtherProfileCached(otherId);

          const initials = createInitialsFromName(
            prof?.displayName || "U",
            "U"
          );

          if (prof?.photoURL) {
            avatarHtml = `<img src="${prof.photoURL}" class="w-9 h-9 rounded-full object-cover shadow" alt="Avatar"/>`;
          } else {
            avatarHtml = `
              <div class="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-[11px] text-slate-100 font-semibold shadow">
                ${initials}
              </div>`;
          }

          displayName = prof?.displayName || "Chat";

          btn.addEventListener("click", () => {
            if (!otherId) return;
            window.location.href =
              "message.html?chatWith=" +
              encodeURIComponent(otherId) +
              (data.donationId
                ? "&donationId=" + encodeURIComponent(data.donationId)
                : "") +
              (data.requestId
                ? "&requestId=" + encodeURIComponent(data.requestId)
                : "");
          });
        }

        btn.innerHTML = `
          ${avatarHtml}
          <div class="flex flex-col">
            <span class="text-sm font-medium truncate">${displayName}</span>
            <span class="text-[11px] text-slate-500 truncate">
              ${data.lastMessagePreview || (isGroup ? "Group chat" : "Direct message")}
            </span>
          </div>
        `;

        chatListEl.appendChild(btn);
      }
    },
    (err) => {
      console.warn("all chats listener error:", err);
      chatListEl.innerHTML = "";
    }
  );
}

/* ---------- Firestore helpers ---------- */

async function fetchUserProfile(uid, fallback = {}) {
  if (!uid) {
    return {
      uid: null,
      displayName: fallback.displayName || fallback.name || "User",
      photoURL: fallback.photoURL || fallback.avatar || null,
    };
  }

  try {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      return {
        uid,
        displayName: fallback.displayName || fallback.name || "User",
        photoURL: fallback.photoURL || fallback.avatar || null,
      };
    }
    const data = snap.data() || {};
    return {
      uid,
      displayName:
        data.name ||
        data.displayName ||
        data.username ||
        fallback.displayName ||
        fallback.name ||
        "User",
      photoURL: data.photoURL || data.avatarUrl || fallback.photoURL || fallback.avatar || null,
    };
  } catch (e) {
    console.warn("fetchUserProfile error:", e);
    return {
      uid,
      displayName: fallback.displayName || fallback.name || "User",
      photoURL: fallback.photoURL || fallback.avatar || null,
    };
  }
}

/* ---------- Presence ---------- */

async function setCurrentUserOnlineStatus(isOnline) {
  if (!currentUser) return;
  try {
    const userRef = doc(db, "users", currentUser.uid);
    await setDoc(
      userRef,
      {
        isOnline,
        lastActiveAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("setCurrentUserOnlineStatus error:", e);
  }
}

function setupCurrentUserPresence() {
  if (!currentUser) return;

  setCurrentUserOnlineStatus(true).catch(console.error);

  if (presenceHeartbeatInterval) {
    clearInterval(presenceHeartbeatInterval);
  }
  presenceHeartbeatInterval = setInterval(() => {
    setCurrentUserOnlineStatus(true).catch(console.error);
  }, 60000);

  document.addEventListener("visibilitychange", () => {
    const online = !document.hidden;
    setCurrentUserOnlineStatus(online).catch(console.error);
  });

  window.addEventListener("beforeunload", () => {
    setCurrentUserOnlineStatus(false);
  });
}

function subscribeToOtherPresence() {
  if (!otherUid) return;
  if (isGroupChat) return;

  if (presenceUnsub) {
    presenceUnsub();
    presenceUnsub = null;
  }

  const otherRef = doc(db, "users", otherUid);
  presenceUnsub = onSnapshot(
    otherRef,
    (snap) => {
      const data = snap.data() || {};
      const isOnline = !!data.isOnline;
      const lastActiveAt = toDateMaybe(data.lastActiveAt);

      if (!headerStatusSpan) return;

      if (isOnline) {
        headerStatusSpan.textContent = "Online";
      } else {
        headerStatusSpan.textContent = formatRelativeAgo(lastActiveAt);
      }
    },
    (err) => {
      console.warn("presence listener error", err);
      if (headerStatusSpan) headerStatusSpan.textContent = "Offline";
    }
  );
}

/* ---------- Settings / Logout / Theme ---------- */

async function handleLogout() {
  try {
    await signOut(auth);
    window.location.href = "auth.html";
  } catch (e) {
    console.error("logout error:", e);
    alert("Failed to log out: " + (e.message || e));
  }
}

async function handleEditUsername() {
  if (!currentUser) return;
  const currentName = currentUserProfile?.displayName || "";
  const newName = prompt("Enter new display name:", currentName);
  if (!newName) return;

  try {
    const userRef = doc(db, "users", currentUser.uid);
    await setDoc(
      userRef,
      {
        name: newName,
        displayName: newName,
      },
      { merge: true }
    );

    currentUserProfile = {
      ...currentUserProfile,
      displayName: newName,
    };
    setSidebarProfile(currentUserProfile);

    alert("Display name updated.");
  } catch (e) {
    console.error("edit username error:", e);
    alert("Failed to update username: " + (e.message || e));
  }
}

function openThemeModal() {
  const existing = document.getElementById("themeOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "themeOverlay";
  overlay.className =
    "fixed inset-0 bg-black/40 flex items-center justify-center z-50";

  const box = document.createElement("div");
  box.className =
    "bg-white rounded-2xl shadow-2xl px-6 py-5 w-full max-w-xs text-slate-900";

  const title = document.createElement("div");
  title.className = "text-sm font-semibold mb-1";
  title.textContent = "Appearance";

  const subtitle = document.createElement("div");
  subtitle.className = "text-xs text-slate-500 mb-4";
  subtitle.textContent = "Choose your chat theme.";

  const btnRow = document.createElement("div");
  btnRow.className = "flex flex-col gap-2";

  const currentTheme =
    document.documentElement.getAttribute("data-theme") || "light";

  function makeThemeButton(label, themeValue) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "w-full px-3 py-2 rounded-xl border text-xs flex items-center justify-between";
    btn.classList.add(
      currentTheme === themeValue ? "border-sky-500" : "border-slate-300"
    );
    btn.innerHTML = `
      <span>${label}</span>
      ${
        currentTheme === themeValue
          ? '<span class="text-[10px] text-sky-600 font-semibold">Current</span>'
          : ""
      }
    `;
    btn.addEventListener("click", () => {
      applyTheme(themeValue);
      overlay.remove();
    });
    return btn;
  }

  btnRow.appendChild(makeThemeButton("Light theme", "light"));
  btnRow.appendChild(makeThemeButton("Dark theme", "dark"));

  const closeRow = document.createElement("div");
  closeRow.className = "mt-4 flex justify-end";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className =
    "px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => overlay.remove());

  closeRow.appendChild(closeBtn);

  box.appendChild(title);
  box.appendChild(subtitle);
  box.appendChild(btnRow);
  box.appendChild(closeRow);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

settingsCardContainer?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const label = (
    btn.dataset.settingsAction ||
    btn.textContent ||
    ""
  )
    .trim()
    .toLowerCase();

  if (!label) return;

  if (label.startsWith("preferences")) {
    openThemeModal();
  } else if (label.startsWith("edit username")) {
    handleEditUsername().catch(console.error);
  } else if (label.startsWith("restricted")) {
    alert("Restricted accounts management is coming soon.");
  } else if (label.startsWith("privacy")) {
    alert("Privacy & safety settings are not yet configurable in this version.");
  } else if (label.startsWith("log out") || label.startsWith("logout")) {
    handleLogout().catch(console.error);
  }
});

/* ---------- Group creation ---------- */

function openCreateGroupModal() {
  if (!currentUser) {
    alert("You must be logged in to create a group.");
    return;
  }

  const existing = document.getElementById("groupCreateOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "groupCreateOverlay";
  overlay.className =
    "fixed inset-0 bg-black/50 flex items-center justify-center z-50";

  const box = document.createElement("div");
  box.className =
    "bg-white rounded-2xl shadow-2xl px-6 py-5 w-full max-w-sm text-slate-900";

  const title = document.createElement("div");
  title.className = "text-sm font-semibold mb-1";
  title.textContent = "Create group chat";

  const subtitle = document.createElement("div");
  subtitle.className = "text-xs text-slate-500 mb-4";
  subtitle.textContent =
    "Add a group name and member names. You will be added automatically.";

  const nameLabel = document.createElement("label");
  nameLabel.className = "block text-xs font-medium text-slate-700 mb-1";
  nameLabel.textContent = "Group name";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className =
    "w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400";
  nameInput.placeholder = "e.g. Donor team chat";

  const membersLabel = document.createElement("label");
  membersLabel.className = "block text-xs font-medium text-slate-700 mb-1";
  membersLabel.textContent = "Member names (comma separated)";

  const membersInput = document.createElement("textarea");
  membersInput.rows = 2;
  membersInput.className =
    "w-full mb-3 px-3 py-2 rounded-lg border border-slate-300 text-xs outline-none resize-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400";
  membersInput.placeholder = "Juan, Ana, Mark";

  const btnRow = document.createElement("div");
  btnRow.className = "mt-4 flex justify-end gap-2";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className =
    "px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => overlay.remove());

  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.className =
    "px-4 py-1.5 rounded-full bg-sky-500 text-white text-xs font-semibold hover:bg-sky-600";
  createBtn.textContent = "Create";

  createBtn.addEventListener("click", async () => {
    const groupName = nameInput.value.trim();
    const nameList = membersInput.value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!groupName) {
      alert("Please enter a group name.");
      return;
    }

    if (!nameList.length) {
      alert("Please enter at least one member name.");
      return;
    }

    const resolvedUids = [];
    const failedNames = [];

    for (const name of nameList) {
      const uid = await findUserUidByName(name);
      if (!uid) {
        failedNames.push(name);
      } else if (uid !== currentUser.uid && !resolvedUids.includes(uid)) {
        resolvedUids.push(uid);
      }
    }

    if (!resolvedUids.length) {
      alert(
        "Could not find any users for the given names. Make sure the names match your users collection."
      );
      return;
    }

    const participants = Array.from(new Set([currentUser.uid, ...resolvedUids]));

    try {
      const convCol = collection(db, "conversations");
      const convRef = await addDoc(convCol, {
        isGroup: true,
        groupName,
        groupCreatedBy: currentUser.uid,
        participants,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        lastMessagePreview: "",
      });

      if (failedNames.length > 0) {
        alert(
          "Group created, but these names were not found: " +
            failedNames.join(", ")
        );
      }

      overlay.remove();

      window.location.href =
        "message.html?groupId=" + encodeURIComponent(convRef.id);
    } catch (e) {
      console.error("create group error:", e);
      alert("Failed to create group: " + (e.message || e));
    }
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(createBtn);

  box.appendChild(title);
  box.appendChild(subtitle);
  box.appendChild(nameLabel);
  box.appendChild(nameInput);
  box.appendChild(membersLabel);
  box.appendChild(membersInput);
  box.appendChild(btnRow);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  nameInput.focus();
}

/* ---------- Event listeners ---------- */

sendBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  sendTextMessage().catch(console.error);
});

messageInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage().catch(console.error);
  }

  if (!currentUser) return;
  setTyping(true).catch(console.error);
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    setTyping(false).catch(console.error);
  }, TYPING_TIMEOUT_MS);
});

imageBtn?.addEventListener("click", () => {
  imageInput.value = "";
  imageInput.click();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  sendImageMessage(file, "gallery").catch(console.error);
});

cameraBtn?.addEventListener("click", () => {
  cameraInput.value = "";
  cameraInput.click();
});

cameraInput.addEventListener("change", () => {
  const file = cameraInput.files?.[0];
  if (!file) return;
  sendImageMessage(file, "camera").catch(console.error);
});

btnProfileNav?.addEventListener("click", () => {
  window.location.href = "profile.html";
});

btnSettingsNav?.addEventListener("click", () => {
  if (!settingsCardContainer) return;
  settingsCardContainer.classList.toggle("hidden");
});

/* ---------- Direct / Group init ---------- */

async function initDirectChat() {
  otherUserProfile = await fetchUserProfile(otherUid, {
    displayName: otherNameFromUrl,
    name: otherNameFromUrl,
    photoURL: otherAvatarFromUrl,
    avatar: otherAvatarFromUrl,
  });
  setHeaderProfile(otherUserProfile);

  await updateConversationSubtitle();

  subscribeToOtherPresence();

  conversationId = combineUserIds(currentUser.uid, otherUid);
  try {
    await ensureConversationDoc();
  } catch (e) {
    console.warn("ensureConversationDoc at init error:", e);
  }

  subscribeToMessages();
  subscribeToTyping();
  subscribeToAllChats();
}

async function initGroupChat() {
  if (!groupId) return;

  conversationId = groupId;

  try {
    const convRef = doc(db, "conversations", groupId);
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      clearMessagesUI();
      const div = document.createElement("div");
      div.className = "flex";
      div.innerHTML = `
        <div class="max-w-[70%] bg-white rounded-2xl rounded-bl-md shadow px-4 py-2.5 text-sm text-slate-900">
          This group chat does not exist or was deleted.
        </div>
      `;
      messagesSection.appendChild(div);
      return;
    }

    const data = snap.data() || {};
    currentGroupName = data.groupName || "Group chat";

    if (headerNameSpan) headerNameSpan.textContent = currentGroupName;
    hideSubtitle();
    if (headerStatusSpan) {
      const count = (data.participants || []).length || 1;
      headerStatusSpan.textContent = `Group · ${count} member${
        count === 1 ? "" : "s"
      }`;
    }

    const initials = createInitialsFromName(currentGroupName, "GC");
    renderHeaderLetterAvatar(initials, true);

    subscribeToMessages();
    subscribeToAllChats();
  } catch (e) {
    console.warn("initGroupChat error:", e);
  }
}

/* ---------- Auth flow ---------- */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("You must be logged in to use messages.");
    window.location.href = "auth.html";
    return;
  }

  currentUser = user;

  currentUserProfile = await fetchUserProfile(user.uid, {
    displayName:
      user.displayName || (user.email ? user.email.split("@")[0] : "Me"),
    photoURL: user.photoURL || null,
  });

  setSidebarProfile(currentUserProfile);

  setupCurrentUserPresence();

  if (!otherUid && !groupId) {
    clearMessagesUI();
    const div = document.createElement("div");
    div.className = "flex";
    div.innerHTML = `
      <div class="max-w-[70%] bg-white rounded-2xl rounded-bl-md shadow px-4 py-2.5 text-sm text-slate-900">
        No chat selected. Open this page from a donation/request, pick a chat from the list, or create a group.
      </div>
    `;
    messagesSection.appendChild(div);

    subscribeToAllChats();
    return;
  }

  if (groupId) {
    isGroupChat = true;
    await initGroupChat();
    return;
  }

  if (otherUid === currentUser.uid) {
    alert("You can’t message yourself. Please choose another user.");
    clearMessagesUI();
    return;
  }

  isGroupChat = false;
  await initDirectChat();
});
