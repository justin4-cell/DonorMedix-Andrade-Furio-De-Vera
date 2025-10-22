import {
  getAuth,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7"
};

    // DOM refs
    const requestsList = document.getElementById('requestsList');
    const countEl = document.getElementById('count');
    const categoryFilter = document.getElementById('categoryFilter');
    const urgencyFilter = document.getElementById('urgencyFilter');
    const createForm = document.getElementById('createForm');
    const browsePanel = document.getElementById('browsePanel');
    const createPanel = document.getElementById('createPanel');
    const tabs = document.querySelectorAll('.tab');
    const btnSignIn = document.getElementById('btn-signin');
    const authModal = document.getElementById('authModal');
    const signinBtn = document.getElementById('signinBtn');
    const signupBtn = document.getElementById('signupBtn');
    const closeAuth = document.getElementById('closeAuth');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const btnLogout = document.getElementById('btn-logout');
    const btnProfile = document.getElementById('btn-profile');

    // helper: priority label class
    function priorityClass(u){
      if(u === 'high') return 'badge high';
      if(u === 'medium') return 'badge medium';
      return 'badge low';
    }

    // render a request
    function renderRequest(docData, docId, currentUser){
      const container = document.createElement('div');
      container.className = 'card request-row';

      const left = document.createElement('div');
      left.className = 'request-main';

      // badges
      const badges = document.createElement('div');
      badges.className = 'badges';
      const pBadge = document.createElement('div');
      pBadge.className = priorityClass(docData.urgency);
      pBadge.textContent = docData.urgency ? (docData.urgency + ' priority') : 'priority';
      badges.appendChild(pBadge);

      if(docData.status === 'matched'){
        const matched = document.createElement('div');
        matched.className = 'badge';
        matched.textContent = 'matched';
        badges.appendChild(matched);
      } else if (docData.status === 'open'){
        const state = document.createElement('div');
        state.className = 'badge';
        state.textContent = 'open';
        badges.appendChild(state);
      }

      left.appendChild(badges);

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.style.marginBottom = '6px';
      title.textContent = docData.title;
      left.appendChild(title);

      const desc = document.createElement('div');
      desc.style.color = 'var(--muted)';
      desc.textContent = docData.description;
      left.appendChild(desc);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<span>👤 ${docData.requesterName || 'Anonymous'}</span>
                        <span>📍 ${docData.location || '—'}</span>
                        <span>⏱ ${docData._when || ''}</span>`;
      left.appendChild(meta);

      container.appendChild(left);

      // right actions
      const right = document.createElement('div');
      right.className = 'right-actions';

      const helpBtn = document.createElement('button');
      helpBtn.className = 'help-btn';
      helpBtn.innerText = docData.status === 'matched' ? 'Matched' : 'Help';
      helpBtn.disabled = docData.status === 'matched';
      helpBtn.addEventListener('click', async () => {
        // For demo: toggle matched status and set matchedBy
        try {
          const docRef = doc(db, 'requests', docId);
          await updateDoc(docRef, {
            status: 'matched',
            matchedBy: currentUser ? currentUser.uid : null,
            matchedAt: serverTimestamp()
          });
        } catch (err){
          console.error(err);
          alert('Failed to mark matched: ' + err.message);
        }
      });

      const idpill = document.createElement('div');
      idpill.className = 'muted-pill small';
      idpill.textContent = docData.category || 'Other';

      right.appendChild(helpBtn);
      right.appendChild(idpill);

      container.appendChild(right);
      return container;
    }

    // format timestamp to relative time (simple)
    function timeAgo(ts){
      if(!ts) return '';
      const now = Date.now();
      const diff = (now - ts) / 1000;
      if(diff < 60) return `${Math.floor(diff)}s ago`;
      if(diff < 3600) return `${Math.floor(diff/60)}m ago`;
      if(diff < 86400) return `${Math.floor(diff/3600)}h ago`;
      return `${Math.floor(diff/86400)}d ago`;
    }

    // real-time query
    let unsubscribe = null;
    function startListener(){
      if(unsubscribe) unsubscribe();

      // base query: order by createdAt desc
      let q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));

      // for performance, we'll use onSnapshot and then filter client-side by category/urgency
      unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          // add friendly _when
          data._when = timeAgo(data.createdAt ? data.createdAt.toMillis() : Date.now());
          docs.push({ id: docSnap.id, data });
        });

        renderList(docs);
      }, (err) => {
        console.error("Listener error:", err);
      });
    }

    // apply client-side filters and render
    function renderList(docs){
      const cat = categoryFilter.value;
      const urg = urgencyFilter.value;
      requestsList.innerHTML = '';

      const filtered = docs.filter(d => {
        if(cat && d.data.category !== cat) return false;
        if(urg && d.data.urgency !== urg) return false;
        return true;
      });

      countEl.textContent = `Showing ${filtered.length} active request${filtered.length !== 1 ? 's' : ''}`;

      // current user
      const currentUser = auth.currentUser;

      filtered.forEach(item => {
        const el = renderRequest(item.data, item.id, currentUser);
        requestsList.appendChild(el);
      });
    }

    // initial listener
    startListener();

    // filters event
    categoryFilter.addEventListener('change', ()=> startListener()); // listener re-renders anyway
    urgencyFilter.addEventListener('change', ()=> startListener());

    // create request
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('title').value.trim();
      const description = document.getElementById('description').value.trim();
      const category = document.getElementById('category').value;
      const urgency = document.getElementById('urgency').value;
      const location = document.getElementById('location').value.trim();

      if(!auth.currentUser){
        alert('You must be signed in to create a request.');
        return;
      }

      try {
        await addDoc(collection(db, 'requests'), {
          title,
          description,
          category,
          urgency,
          location,
          requesterId: auth.currentUser.uid,
          requesterName: auth.currentUser.email || null,
          status: 'open',
          createdAt: serverTimestamp()
        });
        createForm.reset();
        // show browse tab
        document.querySelector('.tab[data-tab="browse"]').click();
      } catch (err){
        console.error(err);
        alert('Failed to create request: ' + err.message);
      }
    });

    // tab switching
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const tname = t.dataset.tab;
        if(tname === 'browse'){
          browsePanel.style.display = '';
          createPanel.style.display = 'none';
        } else {
          browsePanel.style.display = 'none';
          createPanel.style.display = '';
        }
      });
    });

    // simple auth modal handlers
    btnSignIn.addEventListener('click', ()=> authModal.style.display = 'flex');
    closeAuth.addEventListener('click', ()=> authModal.style.display = 'none');

    signupBtn.addEventListener('click', async () => {
      const email = authEmail.value.trim();
      const pw = authPassword.value;
      if(!email || !pw){ alert('Provide email and password'); return; }
      try {
        await createUserWithEmailAndPassword(auth, email, pw);
        authModal.style.display = 'none';
        authEmail.value = authPassword.value = '';
      } catch (err){
        alert('Sign up error: ' + err.message);
      }
    });

    signinBtn.addEventListener('click', async () => {
      const email = authEmail.value.trim();
      const pw = authPassword.value;
      if(!email || !pw){ alert('Provide email and password'); return; }
      try {
        await signInWithEmailAndPassword(auth, email, pw);
        authModal.style.display = 'none';
        authEmail.value = authPassword.value = '';
      } catch (err){
        alert('Sign in error: ' + err.message);
      }
    });

    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch (err){ console.error(err); }
    });

    // auth state
    onAuthStateChanged(auth, (user) => {
      if(user){
        btnSignIn.style.display = 'none';
        btnLogout.style.display = '';
        btnProfile.style.display = '';
        btnProfile.textContent = user.email || 'Profile';
      } else {
        btnSignIn.style.display = '';
        btnLogout.style.display = 'none';
        btnProfile.style.display = 'none';
      }
      // re-render list with current user (to enable matched)
      startListener();
    });