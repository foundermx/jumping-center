// Every scroll effect on the page, driven by IntersectionObserver: no scroll listeners,
// nothing runs per frame. CSS does the animating; this only flips classes.
document.documentElement.classList.add('js');

// One-shot entrances: [data-reveal] gets .is-in the first time it comes into view.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      reveal.unobserve(entry.target);
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
);
document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

// Idle loops (the hopping kid, floating cubes) only run while their block is on screen.
const live = new IntersectionObserver((entries) => {
  for (const entry of entries) entry.target.classList.toggle('is-live', entry.isIntersecting);
});
document.querySelectorAll('[data-loop]').forEach((el) => live.observe(el));

// Header shadow as soon as the page leaves the very top.
const header = document.querySelector('.site-header');
const edge = document.getElementById('top-edge');
if (header && edge) {
  new IntersectionObserver(([entry]) => header.classList.toggle('is-stuck', !entry.isIntersecting)).observe(edge);
}

// Main nav marks the section in the middle of the viewport (innermost wins: Fiestas sits inside El parque).
const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-nav]')];
const visible = new Set<HTMLElement>();
const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
      else visible.delete(entry.target as HTMLElement);
    }
    const current = [...visible].sort((a, b) => a.offsetHeight - b.offsetHeight)[0];
    for (const link of links) {
      if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  },
  { rootMargin: '-45% 0px -50% 0px' },
);
for (const link of links) {
  const target = document.getElementById(link.hash.slice(1));
  if (target) spy.observe(target);
}

// Links to an FAQ answer (e.g. #cotizar) open it.
const openFromHash = () => {
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
};
addEventListener('hashchange', openFromHash);
openFromHash();
