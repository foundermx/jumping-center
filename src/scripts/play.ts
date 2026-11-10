// Doorman of the physics playground. three.js and cannon-es are by far the heaviest thing on the
// page (≈165 kB gzipped), and setting them up takes the main thread for a moment. So they come
// once the page itself has loaded and its entrance has played, at the first quiet moment (or when
// a pit or the footer is within a screen of the viewport), and never in the middle of a scroll,
// where that moment would stutter the hero's zoom. Never for visitors who asked for less motion
// or less data.
const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const frugal = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const stage = document.querySelectorAll('[data-pit], [data-play-floor]');

if (!calm && !frugal && stage.length) {
  // .play prepares the page for it: the pit pictures stop drifting, the footer grows a floor.
  root.classList.add('play');

  let scrolled = 0;
  addEventListener('scroll', () => (scrolled = performance.now()), { passive: true });
  /** Runs `job` once the page has not scrolled for a moment. */
  const still = (job: () => void) => {
    const wait = 200 - (performance.now() - scrolled);
    if (wait > 0) setTimeout(() => still(job), wait);
    else job();
  };

  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    near.disconnect();
    still(() =>
      import('./playground')
        .then(({ start }) => still(() => start() || root.classList.remove('play')))
        .catch(() => root.classList.remove('play')),
    );
  };
  const near = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && go(), { rootMargin: '100% 0px' });
  const idle = (job: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(job, { timeout: 2500 }) : setTimeout(job, 300));

  const watch = () => {
    stage.forEach((el) => near.observe(el));
    setTimeout(() => idle(go), 1800); // after the hero's entrance
  };
  if (document.readyState === 'complete') watch();
  else addEventListener('load', watch, { once: true });
}

export {}; // a module: its names stay its own
