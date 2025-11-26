// profile.js (ESM) — drop into a file and import with <script type="module" src="profile.js"></script>

/* ---------- Firebase imports (keep top-level for ESM) ---------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment, deleteDoc,
  collection, query, where, orderBy, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

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

/* ---------- Utility helpers ---------- */
const nowStr = () => new Date().toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
const keyFor = (uid, kind) => `dmx_${kind}_${uid}`;
const getArr = (uid, kind) => { try { return JSON.parse(localStorage.getItem(keyFor(uid, kind)) || '[]'); } catch { return []; } };
const setArr = (uid, kind, arr) => localStorage.setItem(keyFor(uid, kind), JSON.stringify(arr));
function escapeHtml(s){ return (s ?? "").toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m] || m)); }

/* ---------- Toast / announce helpers ---------- */
function toastTopFactory(){
  let toastEl = document.getElementById('dmx_toast_top');
  if (!toastEl){
    toastEl = document.createElement('div');
    toastEl.id = 'dmx_toast_top';
    toastEl.style.cssText = 'position:fixed;top:84px;left:50%;transform:translateX(-50%);background:#065f46;color:#ecfdf5;padding:.6rem .9rem;border-radius:10px;box-shadow:0 8px 22px rgba(2,6,23,.08);z-index:9999;font-weight:700;display:none';
    document.body.appendChild(toastEl);
  }
  let hideTimer = null;
  return (msg, ms = 6000) => {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(()=> { toastEl.style.display = 'none'; hideTimer = null; }, ms);
  };
}
const toastTop = toastTopFactory();

/* ---------- Main logic runs after DOM ready ---------- */
document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Tabs (safe selectors) ---------- */
  try {
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const panels = Array.from(document.querySelectorAll('.tab-panel'));
    function showTab(id){
      panels.forEach(p => p.style.display = (p.id === id) ? 'block' : 'none');
      tabs.forEach(t => t.classList.toggle('tab--active', t.dataset.target === id));
      tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.target === id ? 'true':'false'));
    }
    tabs.forEach(t => t.addEventListener('click', ()=> showTab(t.dataset.target)));
    if (panels.length) showTab(panels[0].id || 'section-overview');
  } catch(e){ console.warn('Tabs init error', e); }

  /* ---------- Active nav highlight ---------- */
  (function(){
    try {
      const path = (location.pathname||'').split('/').pop();
      document.querySelectorAll('nav a').forEach(a=>{
        if (a.getAttribute('href') === path) a.classList.add('active');
      });
    } catch(e){ /* ignore */ }
  })();

  /* ---------- Announce bar (if present) ---------- */
  const announce = document.getElementById('announce');
  const announceText = document.getElementById('announceText');
  document.getElementById('announceClose')?.addEventListener('click', ()=> announce?.classList.remove('show'));
  function toastAnnounce(msg){
    if(!announce||!announceText) return;
    announceText.textContent = msg;
    announce.classList.add('show');
    setTimeout(()=>announce.classList.remove('show'), 6000);
  }

  /* ---------- Cloudinary avatar widget ---------- */
  const CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
  const CLOUDINARY_UNSIGNED_PRESET = "donormedix";
  document.getElementById('avatarClick')?.addEventListener('click', ()=>{
    if (!window.cloudinary?.createUploadWidget) return alert("Cloudinary widget not loaded. Include the Cloudinary widget script on the page.");
    const w = window.cloudinary.createUploadWidget({
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UNSIGNED_PRESET,
      multiple:false, cropping:true, croppingAspectRatio:1, maxImageFileSize:5_000_000
    }, (err,res)=>{
      if (err) { console.error(err); return; }
      if (res?.event === 'success'){
        const url = res.info.secure_url;
        const img = document.getElementById('profilePic');
        if (img) img.src = url;
        document.getElementById('saveProfileBtn')?.classList.remove('hidden');
        document.getElementById('editProfileBtn')?.classList.add('hidden');
      }
    });
    w.open();
  });

  /* ---------- DOM refs used in multiple places ---------- */
  const donationsList = document.getElementById('donationsList');
  const requestsList  = document.getElementById('requestsList');
  const activityFeed  = document.getElementById('activityFeed');

  const nameDisplay   = document.getElementById('nameDisplay');
  const profLine      = document.getElementById('professionLine');

  const mDon = document.getElementById('mDon');
  const mReq = document.getElementById('mRequests') || document.getElementById('mReq'); // fallback
  const mRat = document.getElementById('mRating') || document.getElementById('mRat');
  const ratingDisp = document.getElementById('ratingDisplay');
  const sinceDisp  = document.getElementById('sinceDisplay');
  const donsDisp   = document.getElementById('donationsDisplay');

  /* ---------- Activity / notification helpers ---------- */
  function pushActivity(text, sub){
    if (!activityFeed) return;
    const d = document.createElement('div'); d.className='act';
    d.innerHTML = `<div class="icon">💬</div><div><div style="font-weight:800">${escapeHtml(text)}</div><div class="muted">${escapeHtml(sub||'')}</div></div>`;
    activityFeed.prepend(d);
    const ddAct = document.getElementById('dd-act');
    if (ddAct) ddAct.innerHTML = `<div class="dd-item"><strong>${escapeHtml(text)}</strong><br><small>${nowStr()}</small></div>` + (ddAct.innerHTML||'');
  }

  function updateMetricsUI(data){
    if (!data) return;
    if (mDon) mDon.textContent = String(data.donations ?? mDon.textContent ?? 0);
    if (mReq) mReq.textContent = String(data.requests ?? mReq.textContent ?? 0);
    if (mRat) mRat.textContent = (Number(data.rating ?? (mRat.textContent||0))).toFixed ? (Number(data.rating ?? (mRat.textContent||0)).toFixed(1)) : (data.rating ?? mRat.textContent);
    if (ratingDisp) ratingDisp.textContent = `(${(Number(data.rating ?? 0)).toFixed(1)})`;
    if (sinceDisp) sinceDisp.textContent = data.since || '—';
    if (donsDisp) donsDisp.textContent = String(data.donations ?? donsDisp?.textContent ?? 0);
  }
  // Add this helper after updateMetricsUI definition
function setTotalDonationsCount(n){
  // Support two common ids just in case: #totalDonations and #donationsDisplay (you already use donationsDisplay)
  const el1 = document.getElementById('totalDonations');
  const el2 = document.getElementById('donationsDisplay'); // existing element in file
  if (el1) el1.textContent = String(n);
  if (el2) el2.textContent = String(n);
}

  /* ---------- Local donation templates / logic (legacy) ---------- */
  const donationItemTemplate = (d)=>`
    <article class="donation-card" data-id="${escapeHtml(String(d.id))}">
      <div class="thumb">${d.emoji || '🎁'}</div>
      <div>
        <div class="item-title">${escapeHtml(d.title || '')}</div>
        <div class="item-sub">${escapeHtml(d.subtitle || '')}</div>
        <div class="item-date">Posted ${escapeHtml(d.date || nowStr())}</div>
      </div>
      <div style="display:grid;gap:8px;justify-items:end">
        <span class="status ${escapeHtml(d.statusClass || 'status--available')}">${escapeHtml(d.status || 'available')}</span>
        <button class="btn-del" data-type="donation" data-id="${escapeHtml(String(d.id))}" type="button">Delete</button>
      </div>
    </article>`;

  function renderDonationList(uid){
    if (!donationsList) return;
    const ds = getArr(uid,'donations');
    donationsList.innerHTML = (Array.isArray(ds) && ds.length) ? ds.map(donationItemTemplate).join('') : '<div class="muted">No donations yet.</div>';
    updateMetricsUI({ donations: items.length, requests: Number(mReq?.textContent || 0), rating: Number(mRat?.textContent || 0) });
    // ensure the "Total Donations" UI shows the same count
    setTotalDonationsCount(items.length);

  }

  function bindDonationDeletes(uid, userData){
    if (!donationsList) return;
    donationsList.addEventListener('click', (e)=>{
      const btn = e.target.closest('.btn-del'); if (!btn) return;
      const id = btn.dataset.id;
      let ds = getArr(uid,'donations');
      const before = ds.length;
      ds = ds.filter(x=> String(x.id) !== String(id));
      setArr(uid,'donations', ds);
      renderDonationList(uid);
      if (before !== ds.length){
        pushActivity('Donation removed', `ID ${id}`);
        userData.donations = Math.max(0,(userData.donations||0)-1);
        // sync total donations number from users/{uid} (fallback)
        setTotalDonationsCount(userData.donations || 0);

      }
    });
  }

  /* ---------- Requests template (UPDATED: includes avatar image & request image) ---------- */
  // NOTE: updated to prefer showing request.imageUrl as thumbnail; fallback to requester photo, then emoji.
  const requestItemTemplate = (r)=>`
    <article class="request-card" data-id="${escapeHtml(r._id || r.id || '')}" style="display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:12px;border:1px solid #e6edf2;background:#fff;">
      <div style="width:76px;height:76px;border-radius:12px;overflow:hidden;flex-shrink:0;background:#f1f5f9;display:grid;place-items:center;">
        ${ r.imageUrl ? `<img src="${escapeHtml(r.imageUrl)}" alt="request image" style="width:100%;height:100%;object-fit:cover">`
         : ( r._photo ? `<img src="${escapeHtml(r._photo)}" alt="avatar" style="width:100%;height:100%;object-fit:cover">` : '📝' )
        }
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="min-width:0">
            <div class="item-title" style="font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.title || 'Request')}</div>
            <div class="item-sub muted" style="font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.description || r.subtitle || '')}</div>
          </div>
          <div style="text-align:right;min-width:90px;">
            <div class="item-date muted" style="font-size:.85rem">${escapeHtml(r._when || '')}</div>
          </div>
        </div>
      </div>
      <div style="display:grid;gap:8px;justify-items:end">
        <div style="display:flex; gap:8px">
          <button class="btn-del"  data-type="request" data-id="${escapeHtml(r._id || r.id || '')}" type="button">Delete</button>
          <button class="btn-open" data-id="${escapeHtml(r._id || r.id || '')}" type="button">Open</button>
        </div>
      </div>
    </article>`;

  /* ---------- Notification modal helpers ---------- */
  const btnBell   = document.getElementById('btnBell');
  const bellBadge = document.getElementById('bellBadge');
  const nmWrap    = document.getElementById('notifModal');
  const nmTabs    = nmWrap ? Array.from(nmWrap.querySelectorAll('.nm-tab')) : [];
  const nmCloseEls= nmWrap ? Array.from(nmWrap.querySelectorAll('[data-nm-close]')) : [];
  const ddMsg     = document.getElementById('dd-msg');
  const ddAct     = document.getElementById('dd-act');
  const markAll   = document.getElementById('nmMarkAll');

  function setBadge(n){
    if(!bellBadge) return;
    if(n>0){ bellBadge.textContent=String(n); bellBadge.classList.remove('hidden'); }
    else { bellBadge.classList.add('hidden'); }
  }
  function switchPane(which){
    if(!ddMsg || !ddAct) return;
    const isMsg = which==='msg';
    ddMsg.classList.toggle('hidden', !isMsg);
    ddAct.classList.toggle('hidden', isMsg);
    nmTabs.forEach(t=>{
      const active = t.dataset.tab===which;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active?'true':'false');
    });
  }
  function openNotifModal(){
    if(!nmWrap) return;
    nmWrap.classList.add('open');
    nmWrap.setAttribute('aria-hidden','false');
    if (nmTabs[0]) nmTabs[0].focus();
    switchPane('msg');
  }
  function closeNotifModal(){
    if(!nmWrap) return;
    nmWrap.classList.remove('open');
    nmWrap.setAttribute('aria-hidden','true');
  }
  btnBell?.addEventListener('click', openNotifModal);
  nmTabs.forEach(t=> t.addEventListener('click', ()=> switchPane(t.dataset.tab)));
  nmCloseEls.forEach(el=> el.addEventListener('click', closeNotifModal));
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeNotifModal(); });
  nmWrap?.addEventListener('click', (e)=>{ if(e.target?.hasAttribute?.('data-nm-close')) closeNotifModal(); });

  function getReadMap(uid){ try{ return JSON.parse(localStorage.getItem(`dmx_unread_${uid}`)||'{}'); }catch{return{}} }
  function setReadMap(uid,map){ localStorage.setItem(`dmx_unread_${uid}`, JSON.stringify(map||{})); }

  markAll?.addEventListener('click', ()=>{
    if(!window.__notif_userId) return;
    const map = getReadMap(window.__notif_userId);
    const now = Date.now();
    Object.keys(map).forEach(k=> map[k]=now);
    setReadMap(window.__notif_userId, map);
    setBadge(0);
  });

  /* ---------- PSGC location + profession cascaders ---------- */
  const PSGC_BASE = "https://psgc.gitlab.io/api";
  async function fetchJson(url){ const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status} for ${url}`); return r.json(); }
  async function getRegions(){ return fetchJson(`${PSGC_BASE}/regions/`); }
  async function getProvincesByRegion(regionCode){
    try{ return await fetchJson(`${PSGC_BASE}/regions/${regionCode}/provinces/`); }
    catch{ const all = await fetchJson(`${PSGC_BASE}/provinces/`); return all.filter(p=>p.regionCode===regionCode); }
  }
  async function getCitiesMunsByProvince(provCode){
    try{ return await fetchJson(`${PSGC_BASE}/provinces/${provCode}/cities-municipalities/`); }
    catch{
      const prov = await fetchJson(`${PSGC_BASE}/provinces/${provCode}/`);
      const regionCities = await fetchJson(`${PSGC_BASE}/regions/${prov.regionCode}/cities-municipalities/`);
      return regionCities.filter(x=>x.provinceCode===provCode);
    }
  }
  async function getBarangaysByCityMun(cm){
    const code = cm.code || cm.cityCode || cm.municipalityCode;
    try{ return await fetchJson(`${PSGC_BASE}/cities/${code}/barangays/`); }
    catch{
      try{ return await fetchJson(`${PSGC_BASE}/municipalities/${code}/barangays/`); }
      catch{
        const all = await fetchJson(`${PSGC_BASE}/barangays/`);
        return all.filter(b=>b.cityCode===code || b.municipalityCode===code);
      }
    }
  }
  function opt(text, value){ const o=document.createElement('option'); o.textContent=text; o.value=value; return o; }

  const selRegion = document.getElementById('selRegion');
  const selProvince = document.getElementById('selProvince');
  const selCityMun = document.getElementById('selCityMun');
  const selBarangay = document.getElementById('selBarangay');
  const hiddenLocation = document.getElementById('location');

  function updateLocationString(){
    if (!hiddenLocation) return;
    const rn = selRegion?.selectedOptions?.[0]?.textContent || '';
    const pn = selProvince?.selectedOptions?.[0]?.textContent || '';
    const cn = selCityMun?.selectedOptions?.[0]?.textContent || '';
    const bn = selBarangay?.selectedOptions?.[0]?.textContent || '';
    hiddenLocation.value = [rn,pn,cn,bn].filter(Boolean).join(' · ');
  }

  async function initPSGCCascader(savedText){
    if (!selRegion||!selProvince||!selCityMun||!selBarangay) return;
    selRegion.innerHTML=''; selRegion.append(opt('Select Region…',''));
    selProvince.innerHTML=''; selProvince.append(opt('Select Province…','')); selProvince.disabled=true;
    selCityMun.innerHTML=''; selCityMun.append(opt('Select City/Municipality…','')); selCityMun.disabled=true;
    selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…','')); selBarangay.disabled=true;
    try{
      const regions = await getRegions();
      regions.sort((a,b)=> (a.regionName||a.name).localeCompare(b.regionName||b.name));
      regions.forEach(r=> selRegion.append(opt(r.regionName||r.name, r.code)));

      if (savedText){
        const parts = savedText.split(' · ').map(s=>s.trim()).filter(Boolean);
        const [savedRegion, savedProv, savedCity, savedBrgy] = parts;
        if (savedRegion){
          const rOpt = Array.from(selRegion.options).find(o=>o.textContent===savedRegion);
          if (rOpt){ selRegion.value=rOpt.value; await onRegionChange(false); }
        }
        if (savedProv){
          const pOpt = Array.from(selProvince.options).find(o=>o.textContent===savedProv);
          if (pOpt){ selProvince.value=pOpt.value; await onProvinceChange(false); }
        }
        if (savedCity){
          const cOpt = Array.from(selCityMun.options).find(o=>o.textContent===savedCity);
          if (cOpt){ selCityMun.value=cOpt.value; await onCityMunChange(false); }
        }
        if (savedBrgy){
          const bOpt = Array.from(selBarangay.options).find(o=>o.textContent===savedBrgy);
          if (bOpt){ selBarangay.value=bOpt.value; }
        }
        updateLocationString();
      }
    }catch(e){ console.warn("PSGC init failed:", e); }
  }
  async function onRegionChange(clearLower=true){
    if (!selRegion||!selProvince||!selCityMun||!selBarangay) return;
    const regionCode=selRegion.value;
    if (!regionCode){
      if (clearLower){
        selProvince.innerHTML=''; selProvince.append(opt('Select Province…','')); selProvince.disabled=true;
        selCityMun.innerHTML=''; selCityMun.append(opt('Select City/Municipality…','')); selCityMun.disabled=true;
        selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…','')); selBarangay.disabled=true;
      }
      updateLocationString(); return;
    }
    selProvince.disabled=false;
    selProvince.innerHTML=''; selProvince.append(opt('Loading provinces…',''));
    try{
      const provs = await getProvincesByRegion(regionCode);
      selProvince.innerHTML=''; selProvince.append(opt('Select Province…',''));
      provs.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p=> selProvince.append(opt(p.name,p.code)));
      selCityMun.innerHTML=''; selCityMun.append(opt('Select City/Municipality…','')); selCityMun.disabled=true;
      selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…','')); selBarangay.disabled=true;
    }catch(e){ console.warn("Provinces error:", e); }
    updateLocationString();
  }
  async function onProvinceChange(clearLower=true){
    if (!selProvince||!selCityMun||!selBarangay) return;
    const code=selProvince.value;
    if (!code){
      if (clearLower){
        selCityMun.innerHTML=''; selCityMun.append(opt('Select City/Municipality…','')); selCityMun.disabled=true;
        selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…','')); selBarangay.disabled=true;
      }
      updateLocationString(); return;
    }
    selCityMun.disabled=false;
    selCityMun.innerHTML=''; selCityMun.append(opt('Loading…',''));
    try{
      const cms = await getCitiesMunsByProvince(code);
      selCityMun.innerHTML=''; selCityMun.append(opt('Select City/Municipality…',''));
      cms.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=> selCityMun.append(opt(c.name,c.code)));
      selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…','')); selBarangay.disabled=true;
    }catch(e){ console.warn("Cities error:", e); }
    updateLocationString();
  }
  async function onCityMunChange(clearLower=true){
    if (!selCityMun||!selBarangay) return;
    const code=selCityMun.value;
    if (!code){
      if (clearLower){
        selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…','')); selBarangay.disabled=true;
      }
      updateLocationString(); return;
    }
    selBarangay.disabled=false;
    selBarangay.innerHTML=''; selBarangay.append(opt('Loading barangays…',''));
    try{
      const brgys = await getBarangaysByCityMun({code});
      selBarangay.innerHTML=''; selBarangay.append(opt('Select Barangay…',''));
      brgys.sort((a,b)=>a.name.localeCompare(b.name)).forEach(b=> selBarangay.append(opt(b.name,b.code)));
    }catch(e){ console.warn("Barangays error:", e); }
    updateLocationString();
  }
  selRegion?.addEventListener('change', ()=>onRegionChange(true).then(updateLocationString));
  selProvince?.addEventListener('change', ()=>onProvinceChange(true).then(updateLocationString));
  selCityMun?.addEventListener('change', ()=>onCityMunChange(true).then(updateLocationString));
  selBarangay?.addEventListener('change', updateLocationString);

  /* ---------- Profession categories/roles UI ---------- */
  const selProfCat = document.getElementById('selProfCat');
  const selProfRole = document.getElementById('selProfRole');
  const profCustomWrap = document.getElementById('profCustomWrap');
  const inputProfession = document.getElementById('profession');

  const PROF_MAP = {
    "Business": ["Entrepreneur","Operations","Sales","Finance/Accounting","HR","Admin Assistant","Other (Custom)"],
    "Education": ["Teacher","Professor","Tutor","School Administrator","Guidance Counselor","Librarian","Other (Custom)"],
    "Engineering": ["Civil Engineer","Mechanical Engineer","Electrical Engineer","Electronics Engineer","Software Engineer","QA Engineer","Architect","Other (Custom)"],
    "Freelance & Creative": ["Freelancer","Photographer","Videographer","Writer","Artist","Musician","Other (Custom)"],
    "Healthcare": ["Doctor","Nurse","Midwife","Pharmacist","Dentist","Medical Technologist","Caregiver","Therapist","Paramedic","Public Health Worker","Other (Custom)"],
    "IT & Digital": ["Developer","UI/UX Designer","Product Manager","Data Analyst","IT Support","Cybersecurity","Digital Marketer","Other (Custom)"],
    "Public Service": ["Gov’t Employee","Barangay Health Worker","Social Worker","Police","Firefighter","Military","Other (Custom)"],
    "Skilled Trades": ["Driver","Electrician","Plumber","Mechanic","Construction Worker","Farmer","Fisherfolk","Other (Custom)"],
    "Student": ["Senior High Student","College Student","Graduate Student","Other (Custom)"]
  };
  function fillProfCategories(){
    if (!selProfCat) return;
    selProfCat.innerHTML = "";
    selProfCat.append(opt("Select Category…",""));
    Object.keys(PROF_MAP).sort().forEach(cat=> selProfCat.append(opt(cat, cat)));
  }
  function fillProfRoles(cat){
    if (!selProfRole) return;
    selProfRole.innerHTML = "";
    selProfRole.append(opt("Select Role…",""));
    (PROF_MAP[cat] || []).forEach(role=> selProfRole.append(opt(role, role)));
  }
  function showCustom(show){
    if (!profCustomWrap || !inputProfession) return;
    profCustomWrap.style.display = show ? "" : "none";
    inputProfession.disabled = !show;
    if (show && !inputProfession.value) inputProfession.value = "";
  }
  function getProfessionForSave(){
    if (!selProfCat || !selProfRole) return (inputProfession?.value || "").trim();
    const cat = selProfCat.value;
    const role = selProfRole.value;
    if (role && role !== "Other (Custom)") return `${role} — ${cat}`;
    const custom = (inputProfession?.value || "").trim();
    if (custom && cat) return `${custom} — ${cat}`;
    return custom || "";
  }
  function initProfessionUI(savedProfession){
    fillProfCategories();
    if (selProfRole) selProfRole.disabled = true;
    if (inputProfession) inputProfession.disabled = true;

    if (!savedProfession) return;
    const parts = savedProfession.split("—").map(s=>s.trim());
    if (parts.length === 2 && selProfCat && selProfRole){
      const [role, cat] = parts;
      const catOpt = Array.from(selProfCat.options).find(o=>o.value===cat);
      if (catOpt){
        selProfCat.value = cat;
        fillProfRoles(cat);
        selProfRole.disabled = false;
        const roleOpt = Array.from(selProfRole.options).find(o=>o.value===role);
        if (roleOpt){
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
    if (selProfRole){
      selProfRole.innerHTML = '<option value="">Select Role…</option>';
      selProfRole.disabled = true;
    }
    showCustom(true);
    if (inputProfession) inputProfession.value = savedProfession;
  }
  selProfCat?.addEventListener('change', ()=>{
    const cat = selProfCat.value;
    fillProfRoles(cat);
    if (selProfRole) { selProfRole.disabled = !cat; selProfRole.value = ""; }
    showCustom(false);
  });
  selProfRole?.addEventListener('change', ()=>{
    const isCustom = selProfRole.value === "Other (Custom)";
    showCustom(isCustom);
    if (!isCustom && inputProfession) inputProfession.value = selProfRole.value ? `${selProfRole.value}` : "";
  });

  /* ---------- Toggles (persist to Firestore field) ---------- */
  function applyToggleState(id, on){
    const el = document.getElementById(id); if(!el) return;
    el.classList.toggle('active', !!on);
    el.setAttribute('aria-checked', !!on ? 'true' : 'false');
  }
  function setupToggles(uid){
    const toggles = [
      { id:"toggleLocation", field:"showLocation" },
      { id:"toggleProfile", field:"publicProfile" },
    ];
    toggles.forEach(({id, field})=>{
      const el = document.getElementById(id);
      if(!el) return;
      const flip = async ()=>{
        const on = !el.classList.contains('active');
        el.classList.toggle('active', on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
        try{ await setDoc(doc(db,'users',uid), { [field]: on }, { merge:true }); }catch(e){ console.warn('Failed writing toggle', e); }
      };
      el.addEventListener('click', flip);
      el.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); flip(); }});
    });
  }

  /* ---------- Inline edit / save ---------- */
  function setupInlineEdit(uid){
    const editBtn = document.getElementById('editProfileBtn');
    const saveBtn = document.getElementById('saveProfileBtn');
    const profilePic = document.getElementById('profilePic');

    const inputs = ["name","email","phone","bio"].map(id=>document.getElementById(id)).filter(Boolean);

    editBtn?.addEventListener("click", ()=>{
      inputs.forEach(i=> i.removeAttribute("disabled"));
      ["selProfCat","selProfRole","profession","selRegion","selProvince","selCityMun","selBarangay"].forEach(id=>{
        const el=document.getElementById(id); if(el){ el.disabled=false; }
      });
      editBtn.classList.add('hidden');
      saveBtn?.classList.remove('hidden');
    });

    saveBtn?.addEventListener("click", async ()=>{
      const updatedProfession = getProfessionForSave();
      const updatedData = {
        name: document.getElementById("name")?.value.trim() || "",
        email: document.getElementById("email")?.value.trim() || "",
        phone: document.getElementById("phone")?.value.trim() || "",
        profession: updatedProfession,
        location: document.getElementById("location")?.value.trim() || "",
        bio: document.getElementById("bio")?.value.trim() || "",
        photoURL: profilePic?.src || ""
      };
      try{
        await setDoc(doc(db,"users",uid), updatedData, { merge:true });
        if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: updatedData.photoURL });

        // reflect to header/profile
        if (nameDisplay) nameDisplay.textContent = updatedData.name || "Anonymous User";
        if (profLine) profLine.textContent = updatedProfession || "Add your profession";
        const bp = document.getElementById('bioPreview'); if (bp) bp.textContent = updatedData.bio || '—';

        // persist tiny cache for faster reads on other pages (requests)
        try {
          localStorage.setItem('userProfile', JSON.stringify({
            location: updatedData.location || "",
            name: updatedData.name || "",
            photoURL: updatedData.photoURL || ""
          }));
        } catch (e) {
          console.warn('Could not write userProfile to localStorage', e);
        }

        inputs.forEach(i=> i.setAttribute("disabled","true"));
        ["selProfCat","selProfRole","profession","selRegion","selProvince","selCityMun","selBarangay"].forEach(id=>{
          const el=document.getElementById(id); if(el){ el.disabled=true; }
        });
        saveBtn?.classList.add('hidden');
        editBtn?.classList.remove('hidden');
        toastTop('✅ Profile updated');
      }catch(e){
        console.error(e); alert("Failed to update profile.");
      }
    });
  }

  /* ---------- My Donations — Firestore realtime ---------- */
  const donationsCol = collection(db,'donations');
  let unsubMyDon = null;

  function donationItemTemplateFS(d){
    return `
      <article class="donation-card" data-id="${escapeHtml(d._id)}">
        <div class="thumb">
          ${d.imageUrl ? `<img src="${escapeHtml(d.imageUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : (d.emoji || '🎁')}
        </div>
        <div>
          <div class="item-title">${escapeHtml(d.medicineName || 'Donation')}</div>
          <div class="item-sub">${escapeHtml(d.category || 'Other')}: Quantity: ${escapeHtml(String(d.quantity || '1'))}</div>
          <div class="item-date">Posted ${new Date(d._ms).toLocaleString()}</div>
        </div>
        <div style="display:grid;gap:8px;justify-items:end">
          <span class="status ${escapeHtml(d.statusClass || 'status--available')}">${escapeHtml(d.status || 'available')}</span>
          <button class="btn-del" data-type="donation" data-id="${escapeHtml(d._id)}" type="button">Delete</button>
        </div>
      </article>`;
  }

  function bindDonationDeletesFS(){
    if (!donationsList) return;
    donationsList.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.btn-del'); if (!btn) return;
      const id = btn.dataset.id;
      if (!confirm('Delete this donation?')) return;
      try {
        await deleteDoc(doc(db,'donations', id));
        pushActivity('Donation removed', `ID ${id}`);
      } catch(err){ alert('Failed to delete.'); console.error(err); }
    });
  }

  // UPDATED: realtime listener that updates UI, syncs users/{uid}.donations, and shows activity/toast
 function startMyDonationsRealtime(uid, userData){
   if (unsubMyDon) unsubMyDon();
   let lastKnownCount = null;

   unsubMyDon = onSnapshot(
     query(donationsCol, where('userId','==', uid)),
     async (ss)=>{
       const items = [];
       ss.forEach(s=>{
         const d = s.data();
         const ms = d.createdAt?.toMillis?.() || (d.createdAt?.seconds ? d.createdAt.seconds*1000 : Date.now());
         items.push({ ...d, _id: s.id, _ms: ms });
       });
       items.sort((a,b)=> b._ms - a._ms);

       // Render list UI
       if (donationsList) donationsList.innerHTML = items.length ? items.map(donationItemTemplateFS).join('') : '<div class="muted">No donations yet.</div>';

       // Update profile metrics UI (this updates mDon and the "Total Donations" shown)
       updateMetricsUI({ donations: items.length, requests: Number(mReq?.textContent || 0), rating: Number(mRat?.textContent || 0) });

       // Sync the aggregate to users/{uid}.donations so other parts of the app reading user doc see the updated count.
       // This is best-effort; it won't block the UI.
       try{
         if (lastKnownCount === null) lastKnownCount = items.length; // initial baseline
         if (items.length !== lastKnownCount){
           await setDoc(doc(db,'users', uid), { donations: items.length }, { merge:true });

           // Show activity + toast describing the change
           if (items.length > lastKnownCount){
             const added = items.length - lastKnownCount;
             const msg = added === 1 ? 'You posted a new donation' : `You posted ${added} new donations`;
             pushActivity(msg, nowStr());
             toastTop(msg);
           } else {
             const removed = lastKnownCount - items.length;
             const msg = removed === 1 ? 'A donation was removed' : `${removed} donations were removed`;
             pushActivity(msg, nowStr());
             toastTop(msg);
           }

           lastKnownCount = items.length;
         }
       }catch(e){
         console.warn('Failed to sync user donation count:', e);
       }

       // Ensure delete binding only once
       if (!donationsList?.__delBound) {
         bindDonationDeletesFS();
         if (donationsList) donationsList.__delBound = true;
       }
     },
     (err)=> { console.error('My donations listener error:', err); }
   );
 }

  /* ---------- Events (site-wide) listener for activity & notifications (IMPROVED) ---------- */
  const eventsCol = collection(db, 'events');
  let unsubEvents = null;

  function renderEventsToUI(items, currentUid){
    if (activityFeed) {
      const html = items.slice(0,50).map(ev=>{
        const when = ev.createdAt ? (ev.createdAt.toDate ? ev.createdAt.toDate().toLocaleString() : new Date(ev.createdAt).toLocaleString()) : '';
        const who = ev.userName ? `<strong>${escapeHtml(ev.userName)}</strong> — ` : '';
        const msg = escapeHtml(ev.message || '');
        return `<div class="act" data-eid="${escapeHtml(ev.id)}"><div class="icon">${ev.type==='donation'?'🎁':'🔔'}</div><div><div style="font-weight:800">${who}${msg}</div><div class="muted">${escapeHtml(when)}</div></div></div>`;
      }).join('');
      activityFeed.innerHTML = html || '<div class="muted">No recent activity.</div>';
    }

    if (ddAct) {
      ddAct.innerHTML = items.map(ev=>{
        const when = ev.createdAt ? (ev.createdAt.toDate ? ev.createdAt.toDate().toLocaleString() : new Date(ev.createdAt).toLocaleString()) : '';
        const who = ev.userName ? `${escapeHtml(ev.userName)} — ` : '';
        const msg = escapeHtml(ev.message || '');
        return `<div class="dd-item" data-eid="${escapeHtml(ev.id)}"><strong>${who}${msg}</strong><br/><small>${escapeHtml(when)}</small></div>`;
      }).join('') || '<div class="dd-empty">No notifications.</div>';
    }

    if (currentUid) {
      const readMap = getReadMap(currentUid);
      const unread = items.reduce((acc, ev) => {
        const seenAt = Number(readMap[ev.id] || 0);
        const evMs = ev.createdAt?.toDate ? ev.createdAt.toDate().getTime() : (ev.createdAt?.seconds ? ev.createdAt.seconds*1000 : Date.now());
        return acc + (evMs > seenAt ? 1 : 0);
      }, 0);
      setBadge(unread);
    } else {
      setBadge(items.length);
    }

    if (ddAct) {
      ddAct.querySelectorAll('.dd-item').forEach(el=>{
        el.onclick = () => {
          const eid = el.getAttribute('data-eid');
          if (!eid || !window.__notif_userId) return;
          const m = getReadMap(window.__notif_userId);
          m[eid] = Date.now();
          setReadMap(window.__notif_userId, m);
          setBadge(0);
          closeNotifModal();
          try {
            (async ()=>{
              const evDoc = await getDoc(doc(db, 'events', eid));
              if (evDoc.exists()){
                const data = evDoc.data() || {};
                const meta = data.metadata || {};
                if (meta && meta.donationId) {
                  location.href = `browse.html#donation=${encodeURIComponent(meta.donationId)}`;
                  return;
                }
              }
            })();
          } catch(e){}
        };
      });
    }
  }

  function listenToEventsRealtime(currentUid){
    if (unsubEvents) { unsubEvents(); unsubEvents = null; }
    try {
      const q = query(eventsCol, orderBy('createdAt', 'desc'), limit(40));
      unsubEvents = onSnapshot(q, (snap)=>{
        snap.docChanges().forEach(ch=>{
          if (ch.type === 'added') {
            const d = ch.doc.data() || {};
            const ev = {
              id: ch.doc.id,
              type: d.type || 'info',
              message: d.message || '',
              userName: d.userName || '',
              createdAt: d.createdAt || null,
              metadata: d.metadata || {}
            };
            try {
              pushActivity(ev.message ? `${ev.userName ? ev.userName + ' — ' : ''}${ev.message}` : 'New activity', ev.createdAt ? (ev.createdAt.toDate ? ev.createdAt.toDate().toLocaleString() : '') : '');
              toastTop(ev.message || 'New activity');
            } catch(e){ /* ignore toast errors */ }
          }
        });

        const fullItems = [];
        snap.forEach(d=>{
          const data = d.data() || {};
          fullItems.push({
            id: d.id,
            type: data.type || 'info',
            message: data.message || '',
            userName: data.userName || '',
            createdAt: data.createdAt || null,
            metadata: data.metadata || {}
          });
        });

        renderEventsToUI(fullItems, currentUid);

      }, (err)=>{
        console.warn('events listener error:', err);
        renderEventsToUI([], currentUid);
        setBadge(0);
      });
    } catch (e) {
      console.warn('listenToEventsRealtime error:', e);
    }
  }

  /* ---------- Real-time + auth handling ---------- */
  let unsubReq = null, unsubThreads = null, unsubUserDoc = null;

  onAuthStateChanged(auth, async (user)=>{
    if (!user) {
      if (unsubMyDon) { unsubMyDon(); unsubMyDon = null; }
      if (unsubReq) { unsubReq(); unsubReq = null; }
      if (unsubThreads) { unsubThreads(); unsubThreads = null; }
      if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }
      if (unsubEvents) { unsubEvents(); unsubEvents = null; }

      // Clear cached small profile for security / freshness on sign-out
      try { localStorage.removeItem('userProfile'); } catch(e){ /* ignore */ }

      return;
    }

    window.__notif_userId = user.uid;

    if (unsubUserDoc) { unsubUserDoc(); unsubUserDoc = null; }

    try {
      const userRef = doc(db,"users", user.uid);

      unsubUserDoc = onSnapshot(userRef, async (snap) => {
        const data = snap.exists() ? snap.data() : {};

        const userData = {
          uid: user.uid,
          name: data.name || user.displayName || "Anonymous User",
          email: data.email || user.email || "",
          phone: data.phone || user.phone || "",
          profession: data.profession || "Add your profession",
          location: data.location || "",
          bio: data.bio || "",
          photoURL: data.photoURL || user.photoURL || "default-profile.png",
          donations: typeof data.donations === "number" ? data.donations : 0,
          requests: typeof data.requests === "number" ? data.requests : 0,
          rating: Number(data.rating ?? 4.8),
          since: data.since || "2023",
          showLocation: data.showLocation ?? false,
          publicProfile: data.publicProfile ?? false,
        };

        // ---------- write a tiny local cache so request.js can read profile location fast ----------
        try {
          localStorage.setItem('userProfile', JSON.stringify({
            location: userData.location || "",
            name: userData.name || "",
            photoURL: userData.photoURL || ""
          }));
        } catch (e) {
          console.warn('Could not write userProfile to localStorage', e);
        }
        // -------------------------------------------------------------------------

        if (document.getElementById('profilePic')) document.getElementById('profilePic').src = userData.photoURL;
        if (nameDisplay) nameDisplay.textContent = userData.name;
        if (profLine) profLine.textContent = userData.profession;
        const bp = document.getElementById('bioPreview'); if (bp) bp.textContent = userData.bio || '—';
        ["name","email","phone","bio"].forEach(id=>{
          const el = document.getElementById(id); if (el) el.value = (userData[id] ?? "");
        });
        updateMetricsUI(userData);

        if (typeof initProfessionUI === 'function') initProfessionUI(userData.profession === "Add your profession" ? "" : userData.profession);
        if (typeof initPSGCCascader === 'function') await initPSGCCascader(userData.location || "");
        applyToggleState('toggleLocation', userData.showLocation);
        applyToggleState('toggleProfile',  userData.publicProfile);
        setupToggles(user.uid);
        setupInlineEdit(user.uid);

        /* Donations — Firestore realtime */
        startMyDonationsRealtime(user.uid, userData);

        // Start listening to site-wide events (notifications & recent activity)
        listenToEventsRealtime(user.uid);

        // Optional: route Add Donation button to the Donate flow
        document.getElementById('btnAddDonation')?.addEventListener('click', ()=>{ location.href = 'Donate.html'; });

      }, (err) => {
        console.error('users doc onSnapshot error:', err);
        getDoc(doc(db,"users",user.uid)).then(snap => {
          const data = snap.exists() ? snap.data() : {};
          updateMetricsUI({ donations: data.donations ?? 0, requests: data.requests ?? 0, rating: data.rating ?? 4.8 });
        }).catch(()=>{});
      });

      /* My Requests — Firestore real-time (UPDATED: attach current user's photo to each request item and show request image) */
      if (unsubReq) unsubReq();
      unsubReq = onSnapshot(
        query(collection(db,'requests'), where('requesterId','==', user.uid)),
        (ss)=>{
          const items=[]; const changesText=[];
          ss.docChanges().forEach(ch=>{
            const d = ch.doc.data();
            if (ch.type==='added')    changesText.push(`Created request: ${d.title||'Untitled'}`);
            if (ch.type==='modified') changesText.push(`Updated request: ${d.title||'Untitled'} (${d.status||'open'})`);
            if (ch.type==='removed')  changesText.push(`Deleted request: ${d.title||'Untitled'}`);
          });

          ss.forEach(s=>{
            const d = s.data();
            const ms = d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.createdAt?.seconds ? d.createdAt.seconds*1000 : Date.now());
            d._when = 'Requested ' + new Date(ms).toLocaleString();
            d._ms   = ms;
            d._id   = s.id;

            // Attach the requester's photo (current user) for display.
            // Prefer the real-time userData if available via localStorage/user snapshot; otherwise fallback.
            try {
              const local = JSON.parse(localStorage.getItem('userProfile') || '{}');
              d._photo = (local && local.photoURL) ? local.photoURL : (auth.currentUser?.photoURL || 'default-profile.png');
            } catch(e){
              d._photo = auth.currentUser?.photoURL || 'default-profile.png';
            }

            // ensure imageUrl property exists (if request included an uploaded image)
            d.imageUrl = d.imageUrl || d.image || null;

            items.push(d);
          });

          items.sort((a,b)=> b._ms - a._ms);

          if (requestsList) requestsList.innerHTML = items.length ? items.map(requestItemTemplate).join('') : '<div class="muted">No requests yet.</div>';

          requestsList?.querySelectorAll('.btn-del')?.forEach(btn=>{
            btn.addEventListener('click', async ()=>{
              const id = btn.dataset.id;
              if (!confirm('Delete this request?')) return;
              try{ await deleteDoc(doc(db,'requests',id)); pushActivity('Request removed', `ID ${id}`); }catch(e){ alert('Failed to delete.'); }
            });
          });

          if (requestsList && !requestsList.__openBound) {
            requestsList.addEventListener('click', (e)=>{
              const openBtn = e.target.closest('.btn-open');
              if (!openBtn) return;
              const id = openBtn.dataset.id;
              location.href = `Request.html?rid=${encodeURIComponent(id)}&view=mine`;
            });
            requestsList.__openBound = true;
          }

          const userReqCount = items.length;
          const currDon = Number(mDon?.textContent||0);
          const currRat = Number(mRat?.textContent||0);
          updateMetricsUI({ donations:currDon, requests:userReqCount, rating:currRat });

          if (changesText.length){
            changesText.forEach(t=> pushActivity(t, nowStr()));
            toastTop(changesText[0]);
          }
        },
        (err)=>{ console.error('My requests listener error:', err); }
      );

      /* Threads — real-time for notifications (modal) */
      if (unsubThreads) unsubThreads();
      unsubThreads = onSnapshot(
        query(collection(db,'threads'), where('participants','array-contains', user.uid), orderBy('updatedAt','desc')),
        (ss)=>{
          const readMap = getReadMap(user.uid);
          const rows = []; let unread = 0;
          ss.forEach(d=>{
            const t = d.data(); const id = d.id;
            const updatedAt = t.updatedAt?.toMillis?.() || Date.now();
            const lastByOther = t.lastSenderId && t.lastSenderId !== user.uid;
            const seenAt = Number(readMap[id]||0);
            const isUnread = lastByOther && updatedAt > seenAt;
            if (isUnread) unread++;
            rows.push(`<div class="dd-item" data-thread="${escapeHtml(id)}">
              <div style="font-weight:800;color:${isUnread?'#0d9488':'#0f172a'}">${escapeHtml(t.requestTitle || 'Conversation')}</div>
              <small>${escapeHtml(t.lastMessage||'(no messages)')}</small><br/>
              <small>${new Date(updatedAt).toLocaleString()}</small>
            </div>`);
          });
          if (ddMsg) ddMsg.innerHTML = rows.length ? rows.join('') : '<div class="dd-empty">No messages yet.</div>';
          setBadge(unread);

          ddMsg?.querySelectorAll('.dd-item')?.forEach(el=>{
            el.addEventListener('click', ()=>{
              const id = el.getAttribute('data-thread');
              const m = getReadMap(user.uid); m[id]=Date.now(); setReadMap(user.uid,m);
              closeNotifModal();
              location.href = 'request.html';
            });
          });

          if (unread>0){ toastTop(`You have ${unread} new message${unread>1?'s':''}`); }
        },
        (err)=> console.error('threads listener error:', err)
      );

    } catch(err){
      console.error("❌ Error loading user doc:", err);
      alert("Failed to load profile data — see console.");
    }
  });

});
