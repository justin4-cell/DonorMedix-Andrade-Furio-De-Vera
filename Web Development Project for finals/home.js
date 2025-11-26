// -------------------------------------------------------
// DonorMedix Header: Auth (Profile)
// - Sign-in button becomes user's NAME (live from Firestore)
// - Profile modal with name/email + "Go to Profile" + "Sign Out" (normal size)
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
function onReady(fn){
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn)
    : fn();
}

function firstTwo(str="U"){ return str.trim().slice(0,2).toUpperCase(); }
function displayNameFrom(u, data){
  return data?.name || u?.displayName || (u?.email ? u.email.split("@")[0] : "Profile");
}

// ---------- State ----------
let signInBtn;            // .sign-in-btn
let profileModal;         // profile modal (normal size)
let unsubUserDoc = null;
let currentUser  = null;

// ---------- Profile Modal (normal size) ----------
function ensureProfileModal(){
  if (profileModal) return profileModal;

  profileModal = document.createElement("div");
  profileModal.id = "dm_profile_modal";

  Object.assign(profileModal.style, {
    position: "fixed",
    zIndex: "1000",
    right: "16px",
    top: "64px",
    width: "min(92vw, 300px)",   // normal size
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
    try {
      await signOut(auth);
    } catch(e){
      console.warn("signOut error", e);
    }
    hideProfileModal();
  });

  return profileModal;
}

function showProfileModal(){
  ensureProfileModal();
  profileModal.style.display = "block";
}
function hideProfileModal(){
  if (profileModal) profileModal.style.display = "none";
}

function updateProfileUI(u, userData){
  const name = displayNameFrom(u, userData);

  // update header button
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
  signInBtn.onclick = (e)=>{
    e.preventDefault();
    if (profileModal.style.display === "none") showProfileModal();
    else hideProfileModal();
  };
}

function renderSignedOut(){
  signInBtn.textContent = "Sign In";
  signInBtn.title = "Sign In";
  signInBtn.setAttribute("aria-label","Sign In");
  signInBtn.onclick = ()=> (window.location.href = "auth.html");
  hideProfileModal();
}

// ---------- Firestore listeners ----------
function listenToUserDoc(u){
  if (unsubUserDoc){
    unsubUserDoc();
    unsubUserDoc = null;
  }
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

// ---------- Init ----------
onReady(()=>{
  signInBtn = document.querySelector(".sign-in-btn");
  if (!signInBtn) return;

  renderSignedOut();

  onAuthStateChanged(auth, (u)=>{
    currentUser = u;
    if (!u){
      if (unsubUserDoc){
        unsubUserDoc();
        unsubUserDoc = null;
      }
      renderSignedOut();
    } else {
      listenToUserDoc(u);
    }
  });
});
