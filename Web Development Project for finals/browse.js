import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ✅ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAaWN2gj3VJxT6kwOvCX4LIXkWlbt0LTHQ",
  authDomain: "donormedix.firebaseapp.com",
  projectId: "donormedix",
  storageBucket: "donormedix.appspot.com",
  messagingSenderId: "627472172279",
  appId: "1:627472172279:web:9bf645b54d33075a0d7ff2",
  measurementId: "G-NTNPR4FPT7",
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ Wait for DOM to load
window.addEventListener("DOMContentLoaded", () => {
  const browseContainer = document.querySelector(".browse-list");
  if (!browseContainer) {
    console.error("Browse list container not found!");
    return;
  }

  // ✅ Query donations ordered by time
  const q = query(collection(db, "donations"), orderBy("createdAt", "desc"));

  // ✅ Listen in real-time
  onSnapshot(
    q,
    (snapshot) => {
      browseContainer.innerHTML = "";

      if (snapshot.empty) {
        browseContainer.innerHTML = `<p>No donations found yet.</p>`;
        return;
      }

      snapshot.forEach((doc) => {
        const donation = doc.data();
        const imageUrl =
          donation.imageUrl ||
          "https://via.placeholder.com/250x180?text=No+Image";

        const item = document.createElement("div");
        item.classList.add("browse-card");

        item.innerHTML = `
          <div class="browse-card-image">
            <img src="${imageUrl}" alt="${donation.medicineName}">
          </div>
          <div class="browse-card-content">
            <h3>${donation.medicineName}</h3>
            <p><strong>Category:</strong> ${donation.category}</p>
            <p><strong>Description:</strong> ${donation.description}</p>
            <p><strong>Quantity:</strong> ${donation.quantity}</p>
            <p><strong>Condition:</strong> ${donation.condition}</p>
            <p><strong>Pickup Location:</strong> ${donation.pickupLocation}</p>
            <p><strong>Urgency:</strong> ${donation.urgencyLevel || "N/A"}</p>
            <p><strong>Contact:</strong> ${donation.contactMethod || "N/A"}</p>
          </div>
        `;

        browseContainer.appendChild(item);
      });
    },
    (error) => {
      console.error("Error loading donations:", error);
      browseContainer.innerHTML = `<p>⚠️ Failed to load donations.</p>`;
    }
  );
});
