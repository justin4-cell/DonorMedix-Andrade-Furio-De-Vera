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

// Extra helpers from home.js for profile
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
const donorProfileCache = {}; // uid -> { name, verified, donorTier, location, photoURL }

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
      photoURL: data.photoURL || data.avatarUrl || "",
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

// ---------- Header / Profile ----------
let signInBtn; // .sign-in-btn
let profileModal = null;
let unsubUserDoc = null;

// ======================================================
//  PROFILE MODAL (from home.js) – only for signed-in users
// ======================================================
function ensureProfileModal() {
  // Do not create modal at all if there is no logged-in user
  if (!currentUser) return null;

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
    display: "none", // IMPORTANT: hidden by default
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
  const modal = ensureProfileModal();
  if (!modal) return;
  modal.style.display = "block";
}
function hideProfileModal() {
  if (profileModal) profileModal.style.display = "none";
}

function updateProfileUI(u, userData) {
  // If somehow called with no user, treat as signed out
  if (!u) return renderSignedOut();

  const name = displayNameFrom(u, userData);

  // update header button
  if (!signInBtn) return;
  signInBtn.textContent = name;
  signInBtn.title = name;
  signInBtn.setAttribute("aria-label", name);

  // update modal
  const modal = ensureProfileModal();
  if (!modal) return;

  const nm = $("#dm_profile_name");
  const em = $("#dm_profile_email");
  const av = $("#dm_profile_avatar");
  if (nm) nm.textContent = name;
  if (em) em.textContent = u?.email || "";
  if (av) av.textContent = firstTwo(name);

  // toggle modal on click – only when logged in
  signInBtn.onclick = (e) => {
    e.preventDefault();
    if (!currentUser) {
      window.location.href = "index.html";
      return;
    }
    if (!profileModal || profileModal.style.display === "none") showProfileModal();
    else hideProfileModal();
  };
}

function renderSignedOut() {
  if (!signInBtn) return;

  // Reset button to plain Sign In
  signInBtn.textContent = "Sign In";
  signInBtn.title = "Sign In";
  signInBtn.setAttribute("aria-label", "Sign In");
  signInBtn.onclick = () => (window.location.href = "index.html");

  // Completely remove any existing profile modal so it can't appear as default
  if (profileModal) {
    profileModal.remove();
    profileModal = null;
  }
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

  // IMPORTANT: donor / owner id (supports userId or createdBy)
  const ownerId = donation.userId || donation.createdBy || "";

  const donorProfile = donation._donorProfile || null;
  const donorTierLabel = donorProfile?.donorTier || "";
  const donorTierCss = donorTierClass(donorTierLabel);

  const donorName =
    donorProfile?.name || donation.donorName || "Anonymous";

  const donorAvatar =
    donorProfile?.photoURL ||
    donation.donorAvatarUrl ||
    donation.donorPhotoURL ||
    "";

  // data-* for filters + message navigation
  card.dataset.category = donation.category || "";
  card.dataset.urgency = donation.urgency || "";
  card.dataset.available = donation._isAvailable ? "true" : "false";
  card.dataset.verified = donation._donorProfile?.verified ? "true" : "false";
  card.dataset.id = donation.id || "";
  card.dataset.donorId = ownerId || "";
  card.dataset.donorName = donorName || "";
  card.dataset.donorAvatar = donorAvatar || "";

  // ---------- Image ----------
  const imgDiv = document.createElement("div");
  imgDiv.className = "card-image";
  imgDiv.style.backgroundImage = `url('${
    donation.imageUrl || DEFAULT_DONATION_IMAGE
  }')`;

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

  // details list with Font Awesome icons
  const ul = document.createElement("ul");
  ul.className = "details-list";

  // quantity
  const liQty = document.createElement("li");
  const qtyIcon = document.createElement("span");
  qtyIcon.className = "detail-icon";
  qtyIcon.innerHTML = `<i class="fa-solid fa-pills"></i>`;
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
  expIcon.innerHTML = `<i class="fa-regular fa-clock"></i>`;
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
  locIcon.innerHTML = `<i class="fa-solid fa-location-dot"></i>`;
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

  // ---------- Donor line ----------
  const donorP = document.createElement("p");
  donorP.className = "donor";

  // left side
  const donorLeft = document.createElement("span");
  donorLeft.className = "donor-left";

  const donorIconWrap = document.createElement("span");
  donorIconWrap.className = "donor-icon";
  donorIconWrap.innerHTML = `<i class="fa-solid fa-user"></i>`;

  const donorTextSpan = document.createElement("span");
  donorTextSpan.className = "donor-text";
  donorTextSpan.textContent = "Donated by ";

  const donorNameSpan = document.createElement("span");
  donorNameSpan.className = "donor-name";
  donorNameSpan.textContent = donorName;

  donorTextSpan.appendChild(donorNameSpan);
  donorLeft.appendChild(donorIconWrap);
  donorLeft.appendChild(donorTextSpan);
  donorP.appendChild(donorLeft);

  // right side: donor tier badge
  if (donorTierLabel) {
    const donorTypeSpan = document.createElement("span");
    donorTypeSpan.className = "donor-type " + donorTierCss;
    donorTypeSpan.textContent = donorTierLabel;
    donorP.appendChild(donorTypeSpan);
  }

  const donorMeta = document.createElement("div");
  donorMeta.className = "donor-meta";

  if (donorProfile?.verified) {
    const verifiedSpan = document.createElement("span");
    verifiedSpan.className = "pill verified donor-verified";
    verifiedSpan.textContent = "Verified";
    donorMeta.appendChild(verifiedSpan);
  }

  // footer with request + message button
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
  btnMessage.innerHTML = `<i class="fa-regular fa-message"></i>`;

  // Disable message button if this is your own donation
  if (currentUser && ownerId && ownerId === currentUser.uid) {
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
  if (donorMeta.childElementCount > 0) {
    body.appendChild(donorMeta);
  }
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

// ---------- Request + Message button helpers ----------
function handleRequestClick(cardEl) {
  const donationId = cardEl.dataset.id || "";
  if (!donationId) return;

  // Use current page as base so request.html is in the same folder as browse.html
  const url = new URL("request.html", window.location.href);
  url.searchParams.set("donationId", donationId);
  window.location.href = url.toString();
}

function handleMessageClick(cardEl) {
  const donationId = cardEl.dataset.id || "";
  const donorId = cardEl.dataset.donorId || "";
  const donorName = cardEl.dataset.donorName || "";
  const donorAvatar = cardEl.dataset.donorAvatar || "";

  if (!donationId) {
    alert("Missing donation information.");
    return;
  }

  if (!donorId) {
    alert("Donor user ID is missing for this donation.");
    return;
  }

  // Require login
  if (!currentUser) {
    window.location.href = "index.html"; // auth / landing page
    return;
  }

  // Extra guard: don't allow chatting with yourself
  if (currentUser.uid === donorId) {
    alert("You can't message yourself about your own donation.");
    return;
  }

  // message.html is assumed to be in the SAME DIRECTORY as browse.html
  const url = new URL("message.html", window.location.href);
  url.searchParams.set("chatWith", donorId);
  url.searchParams.set("donationId", donationId);

  if (donorName) {
    url.searchParams.set("name", donorName);
  }
  if (donorAvatar) {
    url.searchParams.set("avatar", donorAvatar);
  }

  window.location.href = url.toString();
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
          '<p class="item-desc"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load donations.</p>';
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

  // Profile UI initial (signed out by default)
  if (signInBtn) {
    renderSignedOut();
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
    } else {
      listenToUserDoc(user);
    }

    // Re-render so message buttons update based on current user
    applyFiltersAndRender();
  });
});
