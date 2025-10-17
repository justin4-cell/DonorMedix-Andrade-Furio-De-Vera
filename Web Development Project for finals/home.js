/* =========================================================
   🌐 DonorMedix Main Script (with Smooth Page Transitions)
   ========================================================= */

/* ================================
   🎬 PAGE TRANSITION EFFECT
=================================== */
document.addEventListener("DOMContentLoaded", () => {
  // Fade in when page loads
  document.body.classList.add("fade-in");
});

// Handle fade-out when navigating to another page
document.querySelectorAll("a, button").forEach(el => {
  el.addEventListener("click", e => {
    const href = el.getAttribute("href");

    // Only trigger for links to .html files or internal anchors
    if (href && (href.endsWith(".html") || href.startsWith("#"))) {
      e.preventDefault();
      document.body.classList.add("fade-out");

      // Wait for animation before changing the page
      setTimeout(() => {
        if (href.startsWith("#")) {
          const target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: "smooth" });
          }
          document.body.classList.remove("fade-out");
        } else {
          window.location.href = href;
        }
      }, 300); // 300ms matches CSS transition duration
    }
  });
});
