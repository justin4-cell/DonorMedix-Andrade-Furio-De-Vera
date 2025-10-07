// ===== Smooth Scroll for Navigation =====
document.querySelectorAll("nav a").forEach(link => {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    const targetId = this.getAttribute("href").substring(1);
    const targetElement = document.getElementById(targetId);

    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 80, // adjust for header height
        behavior: "smooth"
      });
    }
  });
});

// ===== Notification Bell Toggle =====
const bellBtn = document.querySelector(".bell-btn");
const notificationDot = document.querySelector(".notification-dot");

if (bellBtn && notificationDot) {
  bellBtn.addEventListener("click", () => {
    notificationDot.classList.toggle("hidden"); // toggle visibility
  });
}

// ===== Newsletter Form Handling =====
const newsletterForm = document.querySelector(".newsletter-form");

if (newsletterForm) {
  newsletterForm.addEventListener("submit", function (e) {
    e.preventDefault();

    const emailInput = this.querySelector(".newsletter-input");
    const email = emailInput.value.trim();

    if (validateEmail(email)) {
      alert("✅ Thank you for subscribing with " + email);
      emailInput.value = "";
    } else {
      alert("⚠️ Please enter a valid email address.");
    }
  });
}

// Email validation function
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}

// ===== CTA Buttons =====
document.querySelectorAll(".btn-primary, .btn-secondary").forEach(btn => {
  btn.addEventListener("click", () => {
    alert("🚀 Feature coming soon!");
  });
});
