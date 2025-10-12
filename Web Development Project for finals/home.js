/* =========================================================
   🌐 DonorMedix Main Script
   Features:
   - Smooth scrolling + page navigation
   - Active nav highlighting
   - Notification bell toggle
   - Newsletter handling
   - CTA button interaction
   ========================================================= */

/* ================================
   🧭 NAVIGATION & SMOOTH SCROLL
=================================== */
document.querySelectorAll("nav a").forEach(link => {
  link.addEventListener("click", function (e) {
    const href = this.getAttribute("href");

    // Smooth scroll for same-page sections
    if (href.startsWith("#")) {
      e.preventDefault();
      const targetId = href.substring(1);
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        window.scrollTo({
          top: targetElement.offsetTop - 80, // adjust for header height
          behavior: "smooth"
        });
      }
    }

    // Normal navigation for other HTML files
    else if (href.endsWith(".html")) {
      e.preventDefault();
      window.location.href = href;
    }
  });
});

// Highlight the active page in navigation
const currentPage = window.location.pathname.split("/").pop();
document.querySelectorAll("nav a").forEach(link => {
  const href = link.getAttribute("href");
  if (href === currentPage) {
    link.classList.add("nav-link-active");
  } else {
    link.classList.remove("nav-link-active");
  }
});


/* ================================
   🔔 NOTIFICATION BELL TOGGLE
=================================== */
const bellBtn = document.querySelector(".bell-btn");
const notificationDot = document.querySelector(".notification-dot");

if (bellBtn && notificationDot) {
  bellBtn.addEventListener("click", () => {
    notificationDot.classList.toggle("hidden");
  });
}


/* ================================
   📰 NEWSLETTER SUBSCRIPTION
=================================== */
const newsletterForm = document.querySelector(".newsletter-form");

if (newsletterForm) {
  newsletterForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const emailInput = this.querySelector(".newsletter-input");
    const email = emailInput.value.trim();

    if (validateEmail(email)) {
      alert(`✅ Thank you for subscribing with ${email}`);
      emailInput.value = "";
    } else {
      alert("⚠️ Please enter a valid email address.");
    }
  });
}

// Email validation helper
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}


/* ================================
   🚀 CTA BUTTON ACTIONS
=================================== */
document.querySelectorAll(".btn-primary, .btn-secondary").forEach(btn => {
  btn.addEventListener("click", () => {
    alert("🚀 Feature coming soon!");
  });
});
