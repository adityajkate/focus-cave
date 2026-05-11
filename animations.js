// Minimal animation choreography for Focus Cave
(() => {
  const EASE_OUT = [0.16, 1, 0.3, 1];
  const STAGGER = 80;

  // Hide page loader
  function hideLoader() {
    const loader = document.querySelector('.page-loader');
    if (loader) {
      setTimeout(() => {
        loader.classList.add('loaded');
        setTimeout(() => {
          loader.style.display = 'none';
        }, 800);
      }, 1200); // Show loader for 1.2 seconds
    }
  }

  // Page load reveal sequence
  function initPageReveal() {
    const elements = [
      { selector: '.hero', delay: 200 },
      { selector: '.timer-card', delay: 200 + STAGGER },
      { selector: '.radio-card', delay: 200 + STAGGER * 2 },
      { selector: '.tasks-panel', delay: 200 + STAGGER * 3 },
      { selector: '.presence-panel', delay: 200 + STAGGER * 4 },
      { selector: '.ambient-panel', delay: 200 + STAGGER * 4 },
      { selector: '.streak-panel', delay: 200 + STAGGER * 5 },
      { selector: '.vibe-panel', delay: 200 + STAGGER * 5 },
    ];

    elements.forEach(({ selector, delay }) => {
      const el = document.querySelector(selector);
      if (!el) return;

      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';

      setTimeout(() => {
        el.style.transition = `opacity 0.6s cubic-bezier(${EASE_OUT.join(',')}), transform 0.6s cubic-bezier(${EASE_OUT.join(',')})`;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, delay);
    });

    hideLoader();
  }

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPageReveal);
    } else {
      initPageReveal();
    }
  } else {
    hideLoader();
  }
})();
