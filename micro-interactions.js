// Premium micro-interactions for Focus Cave
(() => {
  const EASE_OUT = [0.16, 1, 0.3, 1];

  // Magnetic button effect
  function initMagneticButtons() {
    const buttons = document.querySelectorAll('.primary-btn, .ghost-btn');

    buttons.forEach(button => {
      button.addEventListener('mouseenter', (e) => {
        button.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
      });

      button.addEventListener('mousemove', (e) => {
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        const moveX = x * 0.15;
        const moveY = y * 0.15;

        button.style.transform = `translate(${moveX}px, ${moveY}px)`;
      });

      button.addEventListener('mouseleave', () => {
        button.style.transform = 'translate(0, 0)';
      });
    });
  }

  // Ripple effect on buttons
  function createRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.classList.add('ripple');

    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) {
      existingRipple.remove();
    }

    button.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  function initRippleEffect() {
    const buttons = document.querySelectorAll('.primary-btn, .stream, .vibe');
    buttons.forEach(button => {
      button.style.position = 'relative';
      button.style.overflow = 'hidden';
      button.addEventListener('click', createRipple);
    });
  }

  // Smooth number counter animation
  function animateCounter(element, target, duration = 800) {
    const start = parseInt(element.textContent) || 0;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * easeProgress);

      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // Observe stat changes and animate
  function initStatAnimations() {
    const stats = document.querySelectorAll('.streak-stats strong');

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const target = parseInt(mutation.target.textContent) || 0;
          if (target > 0) {
            animateCounter(mutation.target, target);
          }
        }
      });
    });

    stats.forEach(stat => {
      observer.observe(stat, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
  }

  // Card hover lift effect
  function initCardHoverEffects() {
    const cards = document.querySelectorAll('.glass-card');

    cards.forEach(card => {
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.24)';
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = 'var(--shadow-md)';
      });
    });
  }

  // Smooth scroll reveal for dynamically added content
  function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    // Observe task items and presence items
    const observeNewItems = () => {
      document.querySelectorAll('.task-item, .presence-person').forEach(item => {
        if (!item.dataset.observed) {
          item.dataset.observed = 'true';
          item.style.opacity = '0';
          item.style.transform = 'translateY(10px)';
          item.style.transition = 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
          observer.observe(item);
        }
      });
    };

    // Initial observation
    observeNewItems();

    // Watch for new items
    const listObserver = new MutationObserver(observeNewItems);
    const taskList = document.getElementById('taskList');
    const presenceList = document.getElementById('presenceList');

    if (taskList) listObserver.observe(taskList, { childList: true });
    if (presenceList) listObserver.observe(presenceList, { childList: true });
  }

  // Add CSS for ripple effect
  const style = document.createElement('style');
  style.textContent = `
    .ripple {
      position: absolute;
      border-radius: 50%;
      background: rgba(250, 250, 249, 0.3);
      transform: scale(0);
      animation: ripple-animation 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    @keyframes ripple-animation {
      to {
        transform: scale(2);
        opacity: 0;
      }
    }

    .glass-card {
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
  `;
  document.head.appendChild(style);

  // Initialize all micro-interactions
  function init() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
      initMagneticButtons();
      initRippleEffect();
      initCardHoverEffects();
      initScrollReveal();
    }

    initStatAnimations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
