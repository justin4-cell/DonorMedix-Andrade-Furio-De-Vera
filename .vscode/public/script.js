 // Mobile Menu Toggle
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuIcon = document.querySelector('.menu-icon');
    const closeIcon = document.querySelector('.close-icon');
    
    if (mobileMenu.classList.contains('active')) {
        mobileMenu.classList.remove('active');
        menuIcon.style.display = 'block';
        closeIcon.style.display = 'none';
    } else {
        mobileMenu.classList.add('active');
        menuIcon.style.display = 'none';
        closeIcon.style.display = 'block';
    }
}

// Donate Dialog
function openDonateDialog() {
    const dialog = document.getElementById('donateDialog');
    dialog.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDonateDialog() {
    const dialog = document.getElementById('donateDialog');
    dialog.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Request Dialog
function openRequestDialog() {
    const dialog = document.getElementById('requestDialog');
    dialog.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeRequestDialog() {
    const dialog = document.getElementById('requestDialog');
    dialog.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Close dialog when clicking outside
document.addEventListener('click', function(event) {
    const donateDialog = document.getElementById('donateDialog');
    const requestDialog = document.getElementById('requestDialog');
    
    if (event.target === donateDialog) {
        closeDonateDialog();
    }
    
    if (event.target === requestDialog) {
        closeRequestDialog();
    }
});

// Close dialog with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeDonateDialog();
        closeRequestDialog();
    }
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            
            // Close mobile menu if open
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenu.classList.contains('active')) {
                toggleMobileMenu();
            }
        }
    });
});

// Form submission handling (placeholder)
document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Form submitted successfully! (This is a demo)');
        
        // Close the active dialog
        closeDonateDialog();
        closeRequestDialog();
        
        // Reset form
        form.reset();
    });
});
