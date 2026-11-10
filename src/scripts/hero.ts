// The first scroll goes into the model: the park grows towards its trampoline court and comes to
// the middle of the screen while the headline steps aside, the cubes drift past and the orbit
// fades; then the page carries on. On wide screens the hero holds still for it (sticky, see
// Hero.astro); on phones it happens, gentler, as the hero scrolls away. It follows the scroll with
// a little lag, so it glides instead of jumping with every wheel notch.
//
// Only `translate`, `scale` and `opacity` change: the CSS entrances and loops animate `transform`
// and compose with them.
const hero = document.querySelector<HTMLElement>('.hero');
const stage = hero?.querySelector<HTMLElement>('.hero__stage');
const art = hero?.querySelector<HTMLElement>('.hero__art');
const court = hero?.querySelector<HTMLElement>('.court');

if (hero && stage && art && court && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const copy = hero.querySelector<HTMLElement>('.hero__copy');
  const hint = hero.querySelector<HTMLElement>('.hint');
  const orbit = hero.querySelector<SVGElement>('.hero__orbit');
  const kid = hero.querySelector<HTMLElement>('.hero__kid');
  const cubes = [...hero.querySelectorAll<HTMLElement>('.cube')];
  const wide = matchMedia('(width >= 900px)');

  /** Middle of the trampoline court, in fractions of the picture (hero.webp). */
  const FOCUS = { x: 0.49, y: 0.62 };
  /** How much bigger the park gets: enough to go in, not so much that it turns into a close-up. */
  const ZOOM = { wide: 1.3, narrow: 1.14 };

  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
  const ease = (t: number) => t * t * (3 - 2 * t);

  let travel = 1; // scroll it takes, px
  let zoom = 1;
  let tx = 0; // how far the court travels, px
  let ty = 0;
  let drift = 0; // phones: the park lags behind the page a little as it leaves
  let spread: { x: number; y: number }[] = [];

  let goal = 0;
  let now = -1;
  let raf = 0;
  let before = 0;

  function measure() {
    for (const el of [art, copy, hint, orbit, kid, ...cubes]) {
      if (!el) continue;
      el.style.translate = '';
      el.style.scale = '';
    }
    const box = art!.getBoundingClientRect();
    const c = court!.getBoundingClientRect();
    const fx = c.left + c.width * FOCUS.x - box.left;
    const fy = c.top + c.height * FOCUS.y - box.top;
    art!.style.transformOrigin = `${fx}px ${fy}px`;
    const header = document.querySelector<HTMLElement>('.site-header')?.offsetHeight ?? 72;
    stage!.style.top = `${header}px`; // pinned right under the header, as tall as it really is
    if (wide.matches) {
      // the hero is pinned for exactly its extra height; the court ends up in the middle below the header
      travel = Math.max(1, hero!.offsetHeight - stage!.offsetHeight);
      zoom = ZOOM.wide;
      const pinned = header + (box.top - stage!.getBoundingClientRect().top); // the park's top while pinned
      tx = innerWidth / 2 - (box.left + fx);
      ty = header + (innerHeight - header) * 0.6 - (pinned + fy);
      drift = 0;
    } else {
      travel = Math.max(1, hero!.offsetHeight * 0.8);
      zoom = ZOOM.narrow;
      tx = innerWidth / 2 - (box.left + fx);
      ty = 0;
      drift = travel * 0.22;
    }
    // the cubes float around the park: they fly outwards, as if passing the camera
    spread = cubes.map((cube) => {
      const r = cube.getBoundingClientRect();
      return { x: r.left + r.width / 2 - (box.left + fx), y: r.top + r.height / 2 - (box.top + fy) };
    });
    now = -1;
  }

  function apply(p: number) {
    const e = ease(p);
    art!.style.scale = `${1 + (zoom - 1) * e}`;
    art!.style.translate = `${tx * e}px ${ty * e + drift * p}px`;
    if (copy) {
      // the headline steps aside for the park, and can't be clicked once it has
      copy.style.opacity = `${1 - ease(clamp01(p / 0.6))}`;
      copy.style.translate = `0 ${-48 * e}px`;
      copy.style.pointerEvents = p > 0.5 ? 'none' : '';
    }
    if (hint) hint.style.opacity = `${1 - clamp01(p * 3)}`;
    if (orbit) {
      orbit.style.opacity = `${1 - ease(clamp01(p * 1.25))}`;
      orbit.style.scale = `${1 + 0.22 * e}`;
    }
    if (kid) kid.style.scale = `${1 + 0.06 * e}`; // a touch nearer than the court he stands on
    cubes.forEach((cube, i) => {
      cube.style.translate = `${spread[i].x * 0.85 * e}px ${spread[i].y * 0.85 * e}px`;
      cube.style.scale = `${1 + 0.9 * e}`;
    });
  }

  function frame(time: number) {
    const dt = Math.min((time - before) / 1000, 0.05);
    before = time;
    // follows the scroll with a ~0.1 s lag
    now = now < 0 ? goal : now + (goal - now) * (1 - Math.exp(-dt * 10));
    if (Math.abs(goal - now) < 0.0004) now = goal;
    apply(now);
    raf = now === goal ? 0 : requestAnimationFrame(frame);
  }

  function update() {
    goal = clamp01(scrollY / travel);
    if (raf || goal === now) return;
    before = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const remeasure = () => {
    measure();
    update();
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', remeasure);
  wide.addEventListener('change', remeasure);
  document.fonts?.ready.then(remeasure);
  remeasure();
}

export {}; // a module: its names stay its own
