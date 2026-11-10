// Doorman of the physics playground. three.js and cannon-es are by far the heaviest thing on the
// page (≈160 kB gzipped), so they are fetched only once the page itself has finished loading and
// a pit or the footer is within a screen of the viewport, and never for visitors who asked for
// less motion or less data.
const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const frugal = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const stage = document.querySelectorAll('[data-pit], [data-play-floor]');

if (!calm && !frugal && stage.length) {
  // .play prepares the page for it: the pit pictures stop drifting, the footer grows a floor.
  root.classList.add('play');
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      import('./playground')
        .then(({ start }) => start() || root.classList.remove('play'))
        .catch(() => root.classList.remove('play'));
    },
    { rootMargin: '100% 0px' },
  );
  const watch = () => stage.forEach((el) => near.observe(el));
  if (document.readyState === 'complete') watch();
  else addEventListener('load', watch, { once: true });
}
