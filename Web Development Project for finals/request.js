  <script src="https://widget.cloudinary.com/v2.0/global/all.js"></script>

    /* ========= Utilities ========= */
    var PSGC_BASE = "https://psgc.gitlab.io/api";
    function nowStr(){ var d=new Date(); return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}); }
    function timeAgo(ts){ if(!ts) return ""; var diff=(Date.now()-ts)/1000; if(diff<60) return String(Math.floor(diff))+"s ago"; if(diff<3600) return String(Math.floor(diff/60))+"m ago"; if(diff<86400) return String(Math.floor(diff/3600))+"h ago"; return String(Math.floor(diff/86400))+"d ago"; }
    function keyFor(uid,kind){ return "dmx_"+kind+"_"+uid; }
    function getArr(uid,kind){ try{ return JSON.parse(localStorage.getItem(keyFor(uid,kind))||"[]"); }catch(e){ return []; } }
    function setArr(uid,kind,arr){ localStorage.setItem(keyFor(uid,kind), JSON.stringify(arr)); }
    function fetchJson(url){ return fetch(url).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status+" for "+r.url); return r.json(); }); }
    function getRegions(){ return fetchJson(PSGC_BASE+"/regions/"); }
    function getProvincesByRegion(regionCode){ return fetchJson(PSGC_BASE+"/regions/"+regionCode+"/provinces/").catch(function(){ return fetchJson(PSGC_BASE+"/provinces/").then(function(all){ return all.filter(function(p){ return p.regionCode===regionCode; }); }); }); }
    function getCitiesMunsByProvince(provCode){ return fetchJson(PSGC_BASE+"/provinces/"+provCode+"/cities-municipalities/").catch(function(){ return fetchJson(PSGC_BASE+"/provinces/"+provCode+"/").then(function(prov){ return fetchJson(PSGC_BASE+"/regions/"+prov.regionCode+"/cities-municipalities/").then(function(rc){ return rc.filter(function(x){ return x.provinceCode===provCode; }); }); }); }); }
    function getBarangaysByCityMun(cm){ var code=cm.code||cm.cityCode||cm.municipalityCode; return fetchJson(PSGC_BASE+"/cities/"+code+"/barangays/").catch(function(){ return fetchJson(PSGC_BASE+"/municipalities/"+code+"/barangays/").catch(function(){ return fetchJson(PSGC_BASE+"/barangays/").then(function(all){ return all.filter(function(b){ return b.cityCode===code || b.municipalityCode===code; }); }); }); }); }
    function opt(text,value){ var o=document.createElement("option"); o.textContent=text; o.value=value; return o; }
    function locationFromSelects(selRegion, selProvince, selCityMun, selBarangay){
      var rn = selRegion && selRegion.selectedOptions[0] ? selRegion.selectedOptions[0].textContent : "";
      var pn = selProvince && selProvince.selectedOptions[0] ? selProvince.selectedOptions[0].textContent : "";
      var cn = selCityMun && selCityMun.selectedOptions[0] ? selCityMun.selectedOptions[0].textContent : "";
      var bn = selBarangay && selBarangay.selectedOptions[0] ? selBarangay.selectedOptions[0].textContent : "";
      var parts=[rn,pn,cn,bn].filter(function(x){return !!x;});
      return parts.join(" · ");
    }

    /* ========= Firebase ========= */
    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
    import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, updateDoc, where, deleteDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
    import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

    var firebaseConfig = {
      apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
      authDomain: "donormedix.firebaseapp.com",
      projectId: "donormedix",
      storageBucket: "donormedix.appspot.com",
      messagingSenderId: "627472172279",
      appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
      measurementId: "G-NTNPR4FPT7"
    };

    /* ========= Cloudinary ========= */
    var CLOUDINARY_CLOUD_NAME = "dsw0erpjx";
    var CLOUDINARY_UPLOAD_PRESET = "donormedix";

    /* ========= Medicine Catalog ========= */
    var medicineCatalog = {
      "Paracetamol":"Pain Relief","Acetaminophen":"Pain Relief","Ibuprofen":"Pain Relief","Naproxen":"Pain Relief","Mefenamic Acid":"Pain Relief","Diclofenac":"Pain Relief",
      "Dextromethorphan":"Cough","Ambroxol":"Cough","Guaifenesin":"Cough","Carbocisteine":"Cough","Phenylephrine":"Cough","Pseudoephedrine":"Cough","Butamirate":"Cough",
      "Amoxicillin":"Antibiotic","Co-amoxiclav":"Antibiotic","Amoxicillin + Clavulanate":"Antibiotic","Azithromycin":"Antibiotic","Cefalexin":"Antibiotic","Ciprofloxacin":"Antibiotic","Metronidazole":"Antibiotic",
      "Cetirizine":"Other","Loratadine":"Other","Fexofenadine":"Other","Diphenhydramine":"Other","Chlorpheniramine":"Other",
      "Omeprazole":"Other","Loperamide":"Other","ORS":"Other","Domperidone":"Other","Hyoscine":"Other","Buscopan":"Other",
      "Ascorbic Acid":"Other","Vitamin C":"Other","Multivitamins":"Other","Zinc":"Other",
      "Salbutamol":"Other","Budesonide":"Other",
      "Metformin":"Other","Gliclazide":"Other",
      "Amlodipine":"Other","Losartan":"Other"
    };
    var medicineListForDatalist = Object.keys(medicineCatalog).sort();

    /* ========= Panels / Switcher ========= */
    var panelCommunity = document.getElementById('panel-community');
    var panelMine      = document.getElementById('panel-mine');
    var panelCreate    = document.getElementById('panel-create');
    var switcherBtns   = document.querySelectorAll('.switcher .pill');
    function showPanel(which){
      panelCommunity.classList.toggle('hidden', which!=='community');
      panelMine.classList.toggle('hidden', which!=='mine');
      panelCreate.classList.toggle('hidden', which!=='create');
      switcherBtns.forEach(function(b){
        var active = b.getAttribute('data-view')===which;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }
    switcherBtns.forEach(function(btn){ btn.addEventListener('click', function(){ showPanel(btn.getAttribute('data-view')); }); });

    /* ========= Init ========= */
    window.addEventListener("DOMContentLoaded", function(){
      // Build medicine datalist
      var dl = document.getElementById('medicinesList');
      if (dl){ dl.innerHTML = ''; medicineListForDatalist.forEach(function(name){ var opt = document.createElement('option'); opt.value = name; dl.appendChild(opt); }); }

      // PSGC selects
      var selRegion   = document.getElementById("selRegion");
      var selProvince = document.getElementById("selProvince");
      var selCityMun  = document.getElementById("selCityMun");
      var selBarangay = document.getElementById("selBarangay");
      var locationText= document.getElementById("locationText");

      var profileSavedLocation = (function(){ try{ var c=JSON.parse(localStorage.getItem("userProfile")||"{}"); return c.location || ""; }catch(e){ return ""; } })();

      function initPSGC(savedText){
        if (!selRegion || !selProvince || !selCityMun || !selBarangay) return;
        selRegion.innerHTML="";   selRegion.appendChild(opt("Select Region…",""));
        selProvince.innerHTML=""; selProvince.appendChild(opt("Select Province…","")); selProvince.disabled=true;
        selCityMun.innerHTML="";  selCityMun.appendChild(opt("Select City/Municipality…","")); selCityMun.disabled=true;
        selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); selBarangay.disabled=true;

        getRegions().then(function(regions){
          regions.sort(function(a,b){ var an=a.regionName||a.name, bn=b.regionName||b.name; return an.localeCompare(bn); });
          regions.forEach(function(r){ var name = r.regionName ? r.regionName : r.name; selRegion.appendChild(opt(name, r.code)); });

          if (savedText){
            var parts = savedText.split(" · ").map(function(s){ return (s||"").trim(); }).filter(function(s){ return !!s; });
            var r = parts[0], p = parts[1], c = parts[2], b = parts[3];
            if (r){
              var ro = Array.prototype.find.call(selRegion.options, function(o){ return o.textContent===r; });
              if (ro){ selRegion.value = ro.value; onRegionChange(false).then(function(){
                if (p){
                  var po = Array.prototype.find.call(selProvince.options, function(o){ return o.textContent===p; });
                  if (po){ selProvince.value = po.value; onProvinceChange(false).then(function(){
                    if (c){
                      var co = Array.prototype.find.call(selCityMun.options, function(o){ return o.textContent===c; });
                      if (co){ selCityMun.value = co.value; onCityMunChange(false).then(function(){
                        if (b){
                          var bo = Array.prototype.find.call(selBarangay.options, function(o){ return o.textContent===b; });
                          if (bo){ selBarangay.value = bo.value; }
                        }
                      }); }
                    }
                  }); }
                }
              }); }
            }
          }
        }).catch(function(e){ console.warn("PSGC init failed:", e); });
      }
      function onRegionChange(clearLower){ if (clearLower===undefined) clearLower=true; if (!selRegion || !selProvince || !selCityMun || !selBarangay) return Promise.resolve(); var regionCode = selRegion.value; if (!regionCode){ if (clearLower){ selProvince.innerHTML=""; selProvince.appendChild(opt("Select Province…","")); selProvince.disabled=true; selCityMun.innerHTML="";  selCityMun.appendChild(opt("Select City/Municipality…","")); selCityMun.disabled=true; selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); selBarangay.disabled=true; } return Promise.resolve(); } selProvince.disabled=false; selProvince.innerHTML=""; selProvince.appendChild(opt("Loading provinces…","")); return getProvincesByRegion(regionCode).then(function(provs){ selProvince.innerHTML=""; selProvince.appendChild(opt("Select Province…","")); provs.sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(p){ selProvince.appendChild(opt(p.name, p.code)); }); selCityMun.innerHTML=""; selCityMun.appendChild(opt("Select City/Municipality…","")); selCityMun.disabled=true; selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); selBarangay.disabled=true; }).catch(function(e){ console.warn("Provinces load error:", e); }); }
      function onProvinceChange(clearLower){ if (clearLower===undefined) clearLower=true; if (!selProvince || !selCityMun || !selBarangay) return Promise.resolve(); var code = selProvince.value; if (!code){ if (clearLower){ selCityMun.innerHTML=""; selCityMun.appendChild(opt("Select City/Municipality…","")); selCityMun.disabled=true; selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); selBarangay.disabled=true; } return Promise.resolve(); } selCityMun.disabled=false; selCityMun.innerHTML=""; selCityMun.appendChild(opt("Loading…","")); return getCitiesMunsByProvince(code).then(function(cms){ selCityMun.innerHTML=""; selCityMun.appendChild(opt("Select City/Municipality…","")); cms.sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(c){ selCityMun.appendChild(opt(c.name, c.code)); }); selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); selBarangay.disabled=true; }).catch(function(e){ console.warn("Cities load error:", e); }); }
      function onCityMunChange(clearLower){ if (clearLower===undefined) clearLower=true; if (!selCityMun || !selBarangay) return Promise.resolve(); var code = selCityMun.value; if (!code){ if (clearLower){ selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); selBarangay.disabled=true; } return Promise.resolve(); } selBarangay.disabled=false; selBarangay.innerHTML=""; selBarangay.appendChild(opt("Loading barangays…","")); var cm = { code: code }; return getBarangaysByCityMun(cm).then(function(brgys){ selBarangay.innerHTML=""; selBarangay.appendChild(opt("Select Barangay…","")); brgys.sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(b){ selBarangay.appendChild(opt(b.name, b.code)); }); }).catch(function(e){ console.warn("Barangays load error:", e); }); }
      if (selRegion) selRegion.addEventListener("change", function(){ onRegionChange(true); });
      if (selProvince) selProvince.addEventListener("change", function(){ onProvinceChange(true); });
      if (selCityMun) selCityMun.addEventListener("change", function(){ onCityMunChange(true); });
      initPSGC(profileSavedLocation);

      /* Firebase init */
      var app = initializeApp(firebaseConfig);
      var db  = getFirestore(app);
      var auth= getAuth(app);

      /* DOM */
      var requestsList   = document.getElementById("requestsList");
      var countEl        = document.getElementById("count");
      var categoryFilter = document.getElementById("categoryFilter");
      var urgencyFilter  = document.getElementById("urgencyFilter");
      var createForm     = document.getElementById("createForm");

      var myList   = document.getElementById("myRequestsList");
      var myCount  = document.getElementById("myCount");
      var myHint   = document.getElementById("myAuthHint");

      /* Cloudinary */
      var uploadedImageUrl = null;
      var thumb = document.getElementById('thumb');
      var btnUpload = document.getElementById('btnUpload');
      var btnRemove = document.getElementById('btnRemove');
      var fileInput = document.getElementById('fileInput');
      var cloudinaryWidget = null;

      function setThumb(url){
        if (!thumb) return;
        thumb.innerHTML = '';
        if (url){
          var img = new Image();
          img.src = url; img.alt = 'Upload preview';
          img.onload = function(){ img.classList.add('flash'); };
          thumb.appendChild(img);
          if (btnRemove) btnRemove.style.display = '';
        } else {
          thumb.innerHTML = '<span class="muted">No image</span>';
          if (btnRemove) btnRemove.style.display = 'none';
        }
      }
      function hasCloudinaryConfig(){ return !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET); }
      function uploadFileToCloudinary(file){
        if (!hasCloudinaryConfig()){ alert('Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in the code.'); }
        var form = new FormData();
        form.append('file', file);
        form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        return fetch('https://api.cloudinary.com/v1_1/'+CLOUDINARY_CLOUD_NAME+'/image/upload', { method:'POST', body: form })
          .then(function(r){ if(!r.ok) throw new Error('Upload failed'); return r.json(); })
          .then(function(json){ return json.secure_url; });
      }
      function openCloudinaryWidget(){
        if (!window.cloudinary){ return false; }
        if (!hasCloudinaryConfig()){ alert('Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in the code.'); return false; }
        if (!cloudinaryWidget){
          try {
            cloudinaryWidget = window.cloudinary.createUploadWidget({
              cloudName: CLOUDINARY_CLOUD_NAME,
              uploadPreset: CLOUDINARY_UPLOAD_PRESET,
              multiple: false,
              cropping: false,
              sources: ['local','camera','url'],
              maxFileSize: 5_000_000,
              clientAllowedFormats: ['jpg','jpeg','png','webp']
            }, function(error, result){
              if (error){ console.error('Cloudinary error:', error); return; }
              if (result && result.event === 'success'){
                uploadedImageUrl = result.info.secure_url;
                setThumb(uploadedImageUrl);
              }
            });
          } catch(e){ console.error('Cloudinary widget init failed', e); return false; }
        }
        try { cloudinaryWidget.open(); return true; } catch(e){ console.error(e); return false; }
      }
      if (btnUpload){ btnUpload.addEventListener('click', function(){ var opened = openCloudinaryWidget(); if (!opened && fileInput){ fileInput.click(); } }); }
      if (fileInput){ fileInput.addEventListener('change', function(){ var f = fileInput.files && fileInput.files[0]; if (!f) return; uploadFileToCloudinary(f).then(function(url){ uploadedImageUrl = url; setThumb(url); }).catch(function(err){ console.error(err); alert('Upload failed.'); }); });
      }
      if (btnRemove){ btnRemove.addEventListener('click', function(){ uploadedImageUrl=null; setThumb(null); }); }

      /* Medicine -> Category auto-map */
      var titleInput = document.getElementById('title');
      var categorySelect = document.getElementById('category');
      function applyAutoCategory(){
        var name = (titleInput.value||'').trim();
        if (!name) return;
        var foundCat = medicineCatalog[name] || null;
        if (!foundCat){
          var key = Object.keys(medicineCatalog).find(function(k){ return k.toLowerCase()===name.toLowerCase(); });
          if (key) foundCat = medicineCatalog[key];
        }
        if (foundCat){ categorySelect.value = foundCat; }
      }
      if (titleInput){
        titleInput.addEventListener('change', applyAutoCategory);
        titleInput.addEventListener('blur', applyAutoCategory);
        titleInput.addEventListener('input', function(e){ if (medicineCatalog[e.target.value]) applyAutoCategory(); });
      }

      /* Render helpers */
      function urgencyBadgeClass(u){ if (u==='high') return 'badge badge--urg-high'; if (u==='low') return 'badge badge--urg-low'; return 'badge badge--urg-medium'; }

      // ---- CHAT MODAL ----
      var modal, modalBody, modalTitle, inputMsg, btnSend, btnClose;
      function ensureModal(){
        if (modal) return;
        modal = document.createElement('div');
        modal.className = 'modal'; modal.innerHTML = `
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title" id="chatTitle">Conversation</div>
              <button class="btn btn-ghost" id="chatClose">Close</button>
            </div>
            <div class="modal-body"><div class="chat" id="chatBody"></div></div>
            <div class="modal-footer">
              <input id="chatInput" class="input" placeholder="Write a message…"/>
              <button id="chatSend" class="btn btn-primary">Send</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        modalBody  = modal.querySelector('#chatBody');
        modalTitle = modal.querySelector('#chatTitle');
        inputMsg   = modal.querySelector('#chatInput');
        btnSend    = modal.querySelector('#chatSend');
        btnClose   = modal.querySelector('#chatClose');
        btnClose.addEventListener('click', function(){ closeChat(); });
      }
      var activeThread = { id:null, unsub:null, peerLabel:'', participants:[] };

      async function openOrCreateThreadForRequest(requestDoc){
        ensureModal();
        if (!auth.currentUser){ alert('Please sign in to message.'); return; }

        var me = auth.currentUser;
        var requesterId = requestDoc.requesterId;
        if (!requesterId){ alert('Requester not found.'); return; }
        var peerId = (me.uid === requesterId) ? (requestDoc.matchedBy || requesterId) : requesterId;
        if (!peerId){ alert('No peer available to message.'); return; }

        // Try to find an existing thread for same participants + requestId
        var existing = await getDocs(query(collection(db,'threads'),
          where('requestId','==', requestDoc._id || requestDoc.id || '')
        ));
        void existing; // reserved for future lookup

        // Create new thread
        var newThreadId = crypto.randomUUID();
        var participants = [me.uid, peerId];
        var participantsMap = {}; participants.forEach(function(uid){ participantsMap[uid]=true; });
        await setDoc(doc(db,'threads', newThreadId), {
          participants: participants,
          participantsMap: participantsMap,
          requestId: requestDoc._id || requestDoc.id || null,
          requestTitle: requestDoc.title || 'Request',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: null,
          lastSenderId: null
        });

        openChat(newThreadId, requestDoc, participants);
      }

      function openChat(threadId, requestDoc, participants){
        ensureModal();
        modal.classList.add('open');
        modalTitle.textContent = 'Conversation — ' + (requestDoc.title || 'Request');
        modalBody.innerHTML = 'Loading…';
        inputMsg.value = '';

        if (activeThread.unsub) { try{ activeThread.unsub(); }catch(e){} }
        activeThread.id = threadId;
        activeThread.participants = participants || [];

        var msgsRef = collection(db,'threads', threadId, 'messages');
        activeThread.unsub = onSnapshot(query(msgsRef, orderBy('createdAt','asc')), function(ss){
          modalBody.innerHTML = '';
          ss.forEach(function(docSnap){
            var m = docSnap.data();
            var div = document.createElement('div');
            div.className = 'msg' + (auth.currentUser && m.senderId===auth.currentUser.uid ? ' me' : '');
            div.textContent = m.text || '';
            modalBody.appendChild(div);
          });
          modalBody.parentElement.scrollTop = modalBody.parentElement.scrollHeight;
        });

        btnSend.onclick = async function(){
          var text = (inputMsg.value||'').trim();
          if (!text) return;
          try{
            await addDoc(collection(db,'threads', threadId, 'messages'), {
              text, senderId: auth.currentUser.uid, createdAt: serverTimestamp()
            });
            await updateDoc(doc(db,'threads',threadId), {
              lastMessage: text, lastSenderId: auth.currentUser.uid, updatedAt: serverTimestamp()
            });
            inputMsg.value = '';
          }catch(e){ console.error(e); alert('Failed to send message.'); }
        };
      }
      function closeChat(){
        if (activeThread.unsub){ try{ activeThread.unsub(); }catch(e){} activeThread.unsub=null; }
        activeThread.id=null;
        if (modal) modal.classList.remove('open');
      }

      /* CARD RENDERER */
      function renderRequestCard(data, id, auth, db){
        var card = document.createElement("div");
        card.className="browse-card";

        data._id = id;

        var imgWrap = document.createElement("div");
        imgWrap.className="browse-card-image";
        var imgSrc = data.imageUrl || 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=1200&auto=format&fit=crop';
        imgWrap.innerHTML = '<img src="'+imgSrc+'" alt="Medicine">';

        var badgebar = document.createElement('div'); badgebar.className = 'badgebar';
        var b1 = document.createElement('span'); b1.className='badge badge--cat'; b1.textContent = data.category||'Other';
        var b2 = document.createElement('span'); b2.className= urgencyBadgeClass(data.urgency||'medium'); b2.textContent = (data.urgency||'medium').toUpperCase();
        badgebar.appendChild(b1); badgebar.appendChild(b2);
        imgWrap.appendChild(badgebar);

        var status = document.createElement('div'); status.className='status-chip'; status.textContent = (data.status||'open').toUpperCase();
        if (data.status==='matched'){ status.style.background='#16a34a'; }
        imgWrap.appendChild(status);

        var body = document.createElement("div"); body.className="browse-card-content";

        var h = document.createElement("h3"); h.textContent = data.title || "Request"; body.appendChild(h);

        var p1 = document.createElement("p"); p1.textContent = data.description || ""; body.appendChild(p1);

        var meta = document.createElement('div'); meta.className='meta';
        var m1 = document.createElement('span'); m1.innerHTML='📍 <strong>'+(data.location||'—')+'</strong>';
        var m2 = document.createElement('span'); m2.innerHTML='⏱ '+(data._when||'');
        var m3 = document.createElement('span'); m3.innerHTML='👤 Requested by <strong>'+(data.requesterName || 'Anonymous')+'</strong>';
        meta.appendChild(m1); meta.appendChild(m2); meta.appendChild(m3);
        body.appendChild(meta);

        var actions = document.createElement('div'); actions.className='card-actions';

        // Is this my own request?
        var isMine = auth.currentUser && data.requesterId === auth.currentUser.uid;

        // Help / Matched (disabled for own requests)
        var helpBtn = document.createElement("button");
        helpBtn.className="btn btn-primary";
        helpBtn.textContent = data.status === "matched" ? "Matched" : "Help";
        helpBtn.disabled = (data.status === "matched") || isMine;
        if (isMine) helpBtn.title = "You can't help your own request";
        helpBtn.addEventListener("click", function(){
          if (helpBtn.disabled) return;
          if (!auth.currentUser){ alert("Please sign in to help with a request."); return; }
          updateDoc(doc(db,"requests",id), { status:"matched", matchedBy:auth.currentUser.uid, matchedAt:serverTimestamp() }).catch(function(e){
            console.error(e); alert("Failed to mark matched.");
          });
        });

        // Share
        var share = document.createElement('button'); share.className='btn btn-ghost'; share.textContent='Share';
        share.addEventListener('click', function(){
          var text = 'Need: '+(data.title||'Medicine')+' — '+(data.description||'')+' | '+(data.location||'');
          if (navigator.share){ navigator.share({ title:'DonorMedix Request', text, url: location.href }).catch(function(){}); }
          else { navigator.clipboard.writeText(text).then(function(){ alert('Copied!'); }); }
        });

        // Message (hidden for own requests)
        if (!isMine){
          var messageBtn = document.createElement('button');
          messageBtn.className = 'btn btn-ghost';
          messageBtn.textContent = 'Message';
          messageBtn.addEventListener('click', function(){ openOrCreateThreadForRequest(data); });
          actions.appendChild(messageBtn);
        }

        // Delete (owner-only)
        var del = document.createElement('button'); del.className='btn btn-danger'; del.textContent='Delete'; del.style.marginLeft='auto';
        if (!isMine) del.style.display='none';
        del.addEventListener('click', async function(){
          var ok = confirm('Delete this request? This cannot be undone.');
          if (!ok) return;
          try{ await deleteDoc(doc(db,'requests',id)); }catch(e){ console.error(e); alert('Failed to delete: ' + (e.message||e)); }
        });

        // Assemble actions
        actions.appendChild(helpBtn);
        actions.appendChild(share);
        actions.appendChild(del);
        body.appendChild(actions);

        card.appendChild(imgWrap);
        card.appendChild(body);
        return card;
      }

      function renderList(docs){
        if (!requestsList || !countEl) return;
        var cat = categoryFilter ? categoryFilter.value : "";
        var urg = urgencyFilter ? urgencyFilter.value : "";
        requestsList.innerHTML="";
        var filtered = docs.filter(function(d){
          if (cat && d.data.category !== cat) return false;
          if (urg && d.data.urgency  !== urg) return false;
          return true;
        });
        countEl.textContent = "Showing " + filtered.length + " active request" + (filtered.length!==1?"s":"");
        filtered.forEach(function(item){ requestsList.appendChild(renderRequestCard(item.data, item.id, auth, db)); });
      }

      function renderMyList(docs){
        if (!myList || !myCount) return;
        myList.innerHTML="";
        myCount.textContent = "Showing " + docs.length + " of your request" + (docs.length!==1?"s":"");
        docs.forEach(function(item){ myList.appendChild(renderRequestCard(item.data, item.id, auth, db)); });
      }

      /* Real-time listeners */
      var unsubscribeAll = null;
      var unsubscribeMine = null;

      function startAllListener(){
        if (unsubscribeAll) unsubscribeAll();
        var qy = query(collection(db,"requests"), orderBy("createdAt","desc"));
        unsubscribeAll = onSnapshot(qy, function(snapshot){
          var docs=[]; snapshot.forEach(function(s){
            var d = s.data();
            var ms = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt? d.createdAt.seconds*1000 : Date.now());
            d._when = timeAgo(ms);
            docs.push({ id:s.id, data:d });
          });
          renderList(docs);
        }, function(err){
          console.error("Community listener error:", err);
          var msg = "⚠️ Failed to load requests.";
          if (err && (err.code === 'permission-denied' || /Missing or insufficient permissions/i.test(err.message||''))) {
            msg = "🔒 Missing or insufficient permissions. Update your Firestore rules to allow reading /requests.";
          }
          if (requestsList) requestsList.innerHTML = "<p>"+msg+"</p>";
        });
      }

      // My Requests (client-side sort)
      function startMyListener(uid){
        if (unsubscribeMine) unsubscribeMine();
        if (!uid){
          if (myHint) myHint.classList.remove('hidden');
          if (myList) myList.innerHTML = "";
          if (myCount) myCount.textContent = "Showing 0 of your requests";
          return;
        }
        if (myHint) myHint.classList.add('hidden');

        var qy = query(collection(db,"requests"), where("requesterId","==",uid));
        unsubscribeMine = onSnapshot(qy, function(snapshot){
          var docs=[];
          snapshot.forEach(function(s){
            var d = s.data();
            var ms = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt? d.createdAt.seconds*1000 : Date.now());
            d._when = timeAgo(ms);
            docs.push({ id:s.id, data:d, _ms: ms });
          });
          docs.sort(function(a,b){ return b._ms - a._ms; });
          renderMyList(docs);
        }, function(err){
          console.error("My listener error:", err);
          var msg = "⚠️ Failed to load your requests.";
          if (myList) myList.innerHTML = "<p>"+msg+"</p>";
        });
      }

      startAllListener();
      if (categoryFilter) categoryFilter.addEventListener("change", startAllListener);
      if (urgencyFilter)  urgencyFilter.addEventListener("change", startAllListener);

      // Auth-aware: bind create form & my-requests listener once
      var submitBound = false;
      onAuthStateChanged(auth, function(user){
        startMyListener(user ? user.uid : null);

        if (!createForm || submitBound) return;
        submitBound = true;
        createForm.addEventListener("submit", function(e){
          e.preventDefault();
          if (!auth.currentUser){ alert("You must be signed in to create a request."); return; }

          var titleEl = document.getElementById("title");
          var descriptionEl = document.getElementById("description");
          var categoryEl = document.getElementById("category");
          var urgencyEl  = document.getElementById("urgency");
          var selRegion   = document.getElementById("selRegion");
          var selProvince = document.getElementById("selProvince");
          var selCityMun  = document.getElementById("selCityMun");
          var selBarangay = document.getElementById("selBarangay");
          var locationText= document.getElementById("locationText");

          var title = titleEl ? (titleEl.value||"").trim() : "";
          var description = descriptionEl ? (descriptionEl.value||"").trim() : "";
          var category = categoryEl ? categoryEl.value : "Other";
          var urgency  = urgencyEl ? urgencyEl.value : "medium";
          if (!title || !description){ alert("Please complete the form."); return; }

          var casc = locationFromSelects(selRegion, selProvince, selCityMun, selBarangay);
          var finalLocation = casc || (locationText && locationText.value ? locationText.value.trim() : "");
          var profileSavedLocation2 = (function(){ try{ var c=JSON.parse(localStorage.getItem("userProfile")||"{}"); return c.location || ""; }catch(e){ return ""; } })();
          if (!finalLocation && profileSavedLocation2) finalLocation = profileSavedLocation2;

          addDoc(collection(db,"requests"), {
            title: title,
            description: description,
            category: category,
            urgency: urgency,
            location: finalLocation || null,
            imageUrl: uploadedImageUrl || null,
            requesterId: auth.currentUser.uid,
            requesterName: auth.currentUser.email || null,
            status: "open",
            createdAt: serverTimestamp()
          }).then(function(){
            uploadedImageUrl = null; setThumb(null);
            var arr = getArr(auth.currentUser.uid,"requests");
            arr.unshift({ id:String(Date.now()), title, subtitle:description, date: nowStr(), status:"pending", statusClass:"status--reserved", emoji:"📝" });
            setArr(auth.currentUser.uid,"requests",arr);
            showPanel('mine');
          }).catch(function(err){
            console.error(err);
            alert("Failed to create request: " + (err.message || err));
          });
        });
      });

      // “Back” button returns to Community panel
      const backBtnBottom = document.getElementById("backBtnBottom");
      if (backBtnBottom) backBtnBottom.addEventListener("click", function () {
        showPanel("community");
      });
    });
  </script>

  <script>
    // Auto-highlight current nav link by filename
    (function(){
      try{
        var path = location.pathname.split('/').pop();
        var links = document.querySelectorAll('nav a');
        links.forEach(function(a){ if (a.getAttribute('href') === path) a.classList.add('active'); });
      }catch(e){}
    })();
