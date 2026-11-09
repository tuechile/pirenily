document.addEventListener("DOMContentLoaded", () => {
    // Create lightbox elements
    const lightboxOverlay = document.createElement("div");
    lightboxOverlay.classList.add("lightbox-overlay");

    const img = document.createElement("img");
    lightboxOverlay.appendChild(img);

    const closeBtn = document.createElement("span");
    closeBtn.classList.add("close-btn");
    closeBtn.innerHTML = "&times;";
    lightboxOverlay.appendChild(closeBtn);

    // Append the overlay to the document
    document.body.appendChild(lightboxOverlay);

    // Hold the photo back until it has decoded, then let it sharpen into focus
    function pullFocus(el) {
        el.classList.remove("focus-in");
        el.classList.add("is-loading");
        el.decode().catch(() => {}).then(() => {
            el.classList.remove("is-loading");
            void el.offsetWidth;
            el.classList.add("focus-in");
        });
    }

    // Event: Open the lightbox
    const lightboxLinks = document.querySelectorAll(".lightbox");
    lightboxLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            img.src = link.href;
            lightboxOverlay.style.display = "flex";
            pullFocus(img);
        });
    });

    // Event: Close the lightbox when clicking the close button
    closeBtn.addEventListener("click", () => {
        lightboxOverlay.style.display = "none";
    });

    // Event: Close the lightbox when clicking outside the image
    lightboxOverlay.addEventListener("click", (e) => {
        if (e.target === lightboxOverlay) {
            lightboxOverlay.style.display = "none";
        }
    });
});
