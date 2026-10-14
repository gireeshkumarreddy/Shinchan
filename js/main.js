/*
 * Page choreography.
 *
 * Hero story (driven by the video's own clock so it never drifts):
 *   0.0s  blank paper, a pencil note on it
 *   1.5s  the paper starts to tear, the note jitters and gets pushed away
 *   4.1s  he bursts through (tiny camera bump)
 *   6.3s  "Hi!"  -> the camera glides aside and the headline answers him
 *   8.0s  video ends -> the WebGL rig takes over and he follows your cursor
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  if (G && ST) G.registerPlugin(ST);
  if (G && window.Draggable) G.registerPlugin(window.Draggable);

  const RIG = window.SHIN_RIG;
  const V = { w: 1920, h: 1080 };
  const HEAD = { x: RIG.headBox[0], y: RIG.headBox[1], w: RIG.headBox[2], h: RIG.headBox[3] };
  const FACE_CENTER = { x: 990, y: 500 };
  const FOCUS = {
    intro: { x: 500, y: 200, w: 1040, h: 720 },
    wide: { x: 540, y: 210, w: 1000, h: 700 },
    narrow: { x: 548, y: 236, w: 990, h: 640 },
  };
  const HELLO_AT = 6.2;

  const hero = $('#top'), world = $('#world'), stage = $('#stage'), video = $('#heroVideo');
  const rigCanvas = $('#heroRig'), poke = $('#poke'), note = $('#note'), hint = $('#hint');
  const copy = $('#heroCopy'), skipBtn = $('#skipBtn'), nav = $('#nav');
  const soundBtn = $('#soundBtn'), replayBtn = $('#replayBtn');

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nowS = () => performance.now() / 1000;

  /* ------------------------------------------------------------ shared pointer */
  const pointer = { x: innerWidth / 2, y: innerHeight * 0.4, active: false, last: -1e9 };
  let travel = 0;
  function onPointer(e) {
    if (pointer.active) travel += Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.active = true; pointer.last = nowS();
    if (hintShown && travel > 520) hideHint();
  }
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
  addEventListener('blur', () => { pointer.active = false; });

  /* ------------------------------------------------------------ hero camera */
  const cam = { x: 0, y: 0, s: 0.5 };
  let phase = 'intro';
  let camTween = null;

  const isNarrow = () => innerWidth <= 820 || innerWidth / Math.max(1, hero.clientHeight) < 0.9;
  const navBottom = () => nav.offsetHeight + 10;

  function copyRight() {
    const h = hero.getBoundingClientRect().left;
    const els = [$('.hero__eyebrow'), ...$$('.line__inner'), $('.hero__sub'), ...$$('.hero__ctas > *')];
    return Math.max(...els.map((el) => {
      const r = el.getBoundingClientRect();
      if (el.classList.contains('hero__sub')) {
        const range = document.createRange(); range.selectNodeContents(el);
        return range.getBoundingClientRect().right - h;
      }
      return r.right - h;
    }));
  }

  function camFor(which) {
    const W = hero.clientWidth, H = hero.clientHeight, top = navBottom();
    const narrow = isNarrow();
    let F, R, s;
    if (which === 'intro') {
      F = narrow ? FOCUS.narrow : FOCUS.intro;
      R = { x: 0, y: top, w: W, h: H - top };
      const fit = Math.min(R.w * (narrow ? 1.04 : 0.9) / F.w, R.h * 0.9 / F.h);
      const cover = Math.max(W / V.w, H / V.h);
      s = cover <= fit ? cover : fit;
    } else if (narrow) {
      F = FOCUS.narrow;
      const copyH = copy.offsetHeight;
      R = { x: 0, y: top, w: W, h: Math.max(180, H - copyH - top + 12) };
      s = Math.min(R.w * 1.06 / F.w, R.h / F.h);
    } else {
      F = FOCUS.wide;
      const gutter = Math.max(16, Math.min(56, W * 0.04));
      const left = Math.max(W * 0.4, copyRight() - 20);
      R = { x: left, y: top, w: W - left - gutter * 0.5, h: H - top - 8 };
      s = Math.min(R.w / F.w, R.h / F.h, 1.2);
    }
    let x = R.x + R.w / 2 - (F.x + F.w / 2) * s;
    let y = R.y + R.h / 2 - (F.y + F.h / 2) * s;
    if (which === 'intro' && s >= Math.max(W / V.w, H / V.h) - 1e-6) {
      x = Math.min(0, Math.max(W - V.w * s, x));
      y = Math.min(0, Math.max(H - V.h * s, y));
    }
    return { x, y, s };
  }

  function applyCam() {
    const { x, y, s } = cam;
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    poke.style.left = `${x + (HEAD.x + 20) * s}px`;
    poke.style.top = `${y + (HEAD.y + 10) * s}px`;
    poke.style.width = `${(HEAD.w - 40) * s}px`;
    poke.style.height = `${(HEAD.h - 10) * s}px`;
    note.style.left = `${x + 960 * s - note.offsetWidth / 2}px`;
    note.style.top = `${y + 470 * s - note.offsetHeight}px`;
    placeHint();
  }

  function placeHint() {
    const { x, y, s } = cam;
    const W = hero.clientWidth;
    let hx = x + 1250 * s, hy = y + 575 * s;
    if (hx + hint.offsetWidth > W - 12 || isNarrow()) {
      hx = x + FACE_CENTER.x * s - hint.offsetWidth / 2;
      hy = y + (HEAD.y - 20) * s - hint.offsetHeight;
      hint.classList.add('is-above');
    } else {
      hint.classList.remove('is-above');
    }
    hint.style.left = `${Math.max(12, hx)}px`;
    hint.style.top = `${Math.max(navBottom(), hy)}px`;
  }

  function setCam(which) {
    if (camTween) { camTween.kill(); camTween = null; }
    Object.assign(cam, camFor(which));
    applyCam();
  }

  function glideTo(which, duration) {
    phase = which;
    const target = camFor(which);
    if (!G || duration <= 0) { setCam(which); afterCamera(); return; }
    if (camTween) camTween.kill();
    camTween = G.to(cam, {
      ...target, duration, ease: 'power3.inOut',
      onUpdate: applyCam,
      onComplete: () => { camTween = null; afterCamera(); },
    });
  }

  function afterCamera() {
    if (heroRig) heroRig.resize(cam.s);
  }

  /* ------------------------------------------------------------ hero rig */
  let heroRig = null, heroBrain = null, rigOn = false, heroVisible = true;
  heroBrain = new window.RigBrain({
    pointer,
    calm: REDUCED,
    reach: { x: 0.42, y: 0.45 },
    getAnchor: () => {
      const r = world.getBoundingClientRect();
      return {
        x: r.left + cam.x + FACE_CENTER.x * cam.s,
        y: r.top + cam.y + FACE_CENTER.y * cam.s,
        w: HEAD.w * cam.s, h: HEAD.h * cam.s,
      };
    },
  });

  const heroRigReady = (async () => {
    try {
      const rig = new window.ShinRig(rigCanvas, RIG);
      if (await rig.init()) { heroRig = rig; rig.resize(cam.s); }
    } catch (err) { console.warn('Face rig unavailable, keeping the still frame.', err); }
  })();

  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(hero);

  /* ------------------------------------------------------------ intro state machine */
  let heroState = 'intro';   // intro | live | replay
  let soundOn = false;
  let hintShown = false, hintDone = false, hintBob = null;

  const cues = [
    { t: 0.05, run: (late) => { if (!late) fadeInNote(); } },
    { t: 0.8, run: (late) => { if (!late && G) G.to(skipBtn, { autoAlpha: 1, duration: 0.5 }); } },
    { t: 1.45, run: (late) => { if (!late) jiggleNote(); } },
    { t: 2.0, run: (late) => pushNoteAway(late) },
    { t: 4.12, run: (late) => { if (!late) bump(); } },
    { t: 6.3, run: (late) => { hideSkip(); glideTo('settled', late ? 0.6 : 1.3); } },
    { t: 7.0, run: (late) => revealCopy(late) },
  ];
  let cueIndex = 0;
  function runCues(force) {
    const t = force ? Infinity : video.currentTime;
    while (cueIndex < cues.length && t >= cues[cueIndex].t) {
      const c = cues[cueIndex++];
      c.run(force || t - c.t > 0.45);
    }
  }

  function fadeInNote() {
    if (!G) return;
    G.fromTo(note, { autoAlpha: 0, y: 10, rotation: -3 }, { autoAlpha: 0.85, y: 0, rotation: -3, duration: 0.9, ease: 'power2.out' });
  }
  function jiggleNote() {
    if (!G) return;
    G.to(note, { x: '+=3', rotation: '+=3', duration: 0.05, yoyo: true, repeat: 9, ease: 'none' });
  }
  function pushNoteAway(late) {
    if (!G) { note.style.opacity = 0; return; }
    if (late) { G.set(note, { autoAlpha: 0 }); return; }
    G.to(note, { y: -46, x: -30, rotation: -16, autoAlpha: 0, duration: 0.75, ease: 'power2.in' });
  }
  function bump() {
    if (!G || REDUCED) return;
    G.fromTo(stage.parentNode, { x: 0 }, { x: 5, duration: 0.045, yoyo: true, repeat: 5, ease: 'none', clearProps: 'x' });
  }
  function hideSkip() { if (G) G.to(skipBtn, { autoAlpha: 0, duration: 0.3 }); else skipBtn.hidden = true; }

  function prepareCopy() {
    if (!G || REDUCED) return;
    G.set('.hero__eyebrow', { autoAlpha: 0, y: 18, rotation: -9 });
    G.set('.line__inner', { yPercent: 118 });
    G.set('.hero__sub', { autoAlpha: 0, y: 16 });
    G.set('.hero__ctas > *', { autoAlpha: 0, y: 16, scale: 0.9 });
  }

  let copyShown = false;
  function revealCopy(fast) {
    if (copyShown) return;
    copyShown = true;
    if (!G || REDUCED) return;
    const tl = G.timeline({ defaults: { ease: 'power4.out' } });
    tl.to('.hero__eyebrow', { autoAlpha: 1, y: 0, rotation: -2.5, duration: 0.7, ease: 'back.out(2)' })
      .to('.line__inner', { yPercent: 0, duration: 0.9, stagger: 0.12 }, 0.12)
      .to('.hero__sub', { autoAlpha: 1, y: 0, duration: 0.7 }, 0.45)
      .to('.hero__ctas > *', { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.08, ease: 'back.out(2.2)' }, 0.6);
    if (fast) tl.timeScale(2.2);
  }

  async function goLive() {
    runCues(true);
    heroState = 'live';
    poke.classList.add('is-ready');
    await heroRigReady;
    if (heroRig) {
      heroRig.resize(cam.s);
      fadeInRig();
      rigOn = true;
    }
    if (!hintDone) setTimeout(showHint, 700);
  }

  function showHint() {
    if (hintShown || hintDone || heroState !== 'live' || !heroRig) return;
    hintShown = true; travel = 0;
    placeHint();
    if (!G) { hint.style.opacity = 1; return; }
    G.fromTo(hint, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(2)' });
    if (!REDUCED) hintBob = G.to(hint, { y: -5, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 0.6 });
    setTimeout(hideHint, 11000);
  }
  function hideHint() {
    if (!hintShown || hintDone) return;
    hintDone = true;
    if (hintBob) hintBob.kill();
    if (G) G.to(hint, { autoAlpha: 0, y: -8, duration: 0.4 }); else hint.style.opacity = 0;
  }

  /* The intro needs nothing from the user. If autoplay is blocked or the user prefers
     reduced motion, we go straight to the final frame with the headline in place. */
  function finishInstant() {
    if (heroState !== 'intro') return;
    try { video.pause(); } catch (e) { /* ignore */ }
    if (video.currentTime > 0.05 && video.duration) video.currentTime = video.duration - 0.03;
    else video.poster = 'assets/hero-end.jpg';
    if (G) G.set([note, skipBtn], { autoAlpha: 0 }); else { note.style.opacity = 0; skipBtn.hidden = true; }
    phase = 'settled';
    setCam('settled');
    revealCopy(true);
    goLive();
  }

  function skipIntro() {
    if (heroState !== 'intro') return;
    const end = (video.duration || 8) - 0.06;
    if (video.readyState >= 1) {
      video.currentTime = end;
      if (video.paused) video.play().catch(finishInstant);
    } else {
      finishInstant();
    }
  }

  video.addEventListener('ended', () => {
    if (heroState === 'intro') goLive();
    else if (heroState === 'replay') endReplay();
  });

  async function replayHello() {
    if (heroState !== 'live') return;
    heroState = 'replay';
    hideHint();
    heroBrain.neutral = true;
    const t0 = performance.now();
    while (!heroBrain.isNeutral() && performance.now() - t0 < 600) await wait(30);
    rigCanvas.classList.remove('is-live');
    await wait(REDUCED ? 0 : 280);
    video.muted = !soundOn;
    try {
      if (!video.currentSrc) video.load();
      video.currentTime = HELLO_AT;
      await video.play();
    } catch (err) {
      endReplay();
    }
  }
  function endReplay() {
    heroState = 'live';
    if (heroRig) fadeInRig(); else heroBrain.neutral = false;
  }

  /* The rig must match the video's last frame while it fades in, otherwise two pairs of
     eyes would cross-dissolve. Hold the neutral pose until the fade is done. */
  function fadeInRig() {
    heroBrain.neutral = true;
    heroRig.render(heroBrain.update(0, nowS()));
    rigCanvas.classList.add('is-live');
    setTimeout(() => { if (heroState === 'live') heroBrain.neutral = false; }, REDUCED ? 0 : 360);
  }

  poke.addEventListener('click', replayHello);
  replayBtn.addEventListener('click', () => {
    if (heroState === 'intro') { skipIntro(); return; }
    replayHello();
  });
  skipBtn.addEventListener('click', skipIntro);
  addEventListener('keydown', (e) => { if (e.key === 'Tab' && heroState === 'intro') skipIntro(); });

  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    soundBtn.querySelector('i').className = `ph-bold ${soundOn ? 'ph-speaker-simple-high' : 'ph-speaker-simple-slash'}`;
    video.muted = !soundOn;
    window.SHIN_SOUND = soundOn;
    window.dispatchEvent(new CustomEvent('shin:sound', { detail: soundOn }));
    if (soundOn && heroState === 'live' && heroVisible) replayHello();
  });

  /* ------------------------------------------------------------ boot the hero */
  prepareCopy();
  setCam(REDUCED ? 'settled' : 'intro');
  if (REDUCED) {
    finishInstant();
  } else {
    const p = video.play();
    if (p && p.catch) p.catch(finishInstant);
    setTimeout(() => { if (heroState === 'intro' && video.currentTime < 0.05) finishInstant(); }, 4500);
  }

  /* ------------------------------------------------------------ peek rig (join section) */
  const peekCanvas = $('#peekRig');
  let peekRig = null, peekBrain = null, peekVisible = false;
  (async () => {
    try {
      const rig = new window.ShinRig(peekCanvas, RIG, { mask: true });
      if (await rig.init()) {
        peekRig = rig;
        rig.resize(peekCanvas.clientWidth / RIG.crop[2]);
        peekBrain = new window.RigBrain({
          pointer, calm: REDUCED, reach: { x: 0.5, y: 0.5 },
          getAnchor: () => {
            const r = peekCanvas.getBoundingClientRect();
            const k = r.width / RIG.crop[2];
            return { x: r.left + (FACE_CENTER.x - RIG.crop[0]) * k, y: r.top + (FACE_CENTER.y - RIG.crop[1]) * k, w: HEAD.w * k, h: HEAD.h * k };
          },
        });
        return;
      }
    } catch (err) { console.warn(err); }
    const img = new Image();
    img.className = 'peek'; img.alt = ''; img.src = 'assets/shin-peek.png';
    peekCanvas.replaceWith(img);
  })();
  new IntersectionObserver(([e]) => { peekVisible = e.isIntersecting; }, { rootMargin: '120px' }).observe($('#join'));

  /* ------------------------------------------------------------ frame loop */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (heroState === 'intro') runCues(false);
    if (rigOn && heroVisible) heroRig.render(heroBrain.update(dt, t));
    if (peekRig && peekBrain && peekVisible) peekRig.render(peekBrain.update(dt, t));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------ nav + mobile menu */
  const menuBtn = $('#menuBtn'), menu = $('#mobileMenu');
  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuBtn.querySelector('i').className = `ph-bold ${open ? 'ph-x' : 'ph-list'}`;
    document.body.style.overflow = open ? 'hidden' : '';
    navSolid();
    if (open) menu.querySelector('a').focus();
  }
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  const navSolid = () => nav.classList.toggle('is-solid', scrollY > 40 || !menu.hidden);

  /* ------------------------------------------------------------ torn paper edges */
  function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  }
  function tear() {
    $$('.torn').forEach((el, i) => {
      const w = el.offsetWidth, r = rng(97 + i * 131);
      const pts = [];
      for (let x = 0; x < w; x += 9 + r() * 24) pts.push(`${x.toFixed(1)}px ${(3 + r() * 15).toFixed(1)}px`);
      pts.push(`${w}px ${(3 + r() * 15).toFixed(1)}px`);
      el.style.clipPath = `polygon(${pts.join(',')}, 100% 100%, 0 100%)`;
    });
  }

  /* ------------------------------------------------------------ marquee band */
  const bandTrack = $('#bandTrack');
  bandTrack.innerHTML += bandTrack.innerHTML;

  /* ------------------------------------------------------------ join form */
  const form = $('#joinForm'), email = $('#email'), msg = $('#formMsg');
  const peekLift = (y, d = 0.5) => { const el = $('.peek'); if (G && el) G.to(el, { y, duration: d, ease: 'back.out(2)' }); };
  form.addEventListener('focusin', () => peekLift(-36));
  form.addEventListener('focusout', () => setTimeout(() => { if (!form.contains(document.activeElement)) peekLift(0); }, 50));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    msg.classList.toggle('is-error', !ok);
    msg.classList.toggle('is-ok', ok);
    email.setAttribute('aria-invalid', String(!ok));
    if (!ok) {
      msg.textContent = email.value.trim() ? 'That email looks a little off. Mind checking it?' : 'Pop your email in first, then hit the button.';
      if (G && !REDUCED) G.fromTo(email, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      email.focus();
      return;
    }
    msg.textContent = "You're in! Shin-chan approves.";
    email.value = '';
    if (peekBrain) { peekBrain.blushBoost = 1; setTimeout(() => { peekBrain.blushBoost = 0; }, 2600); }
    const el = $('.peek');
    if (G && el && !REDUCED) G.timeline().to(el, { y: -70, duration: 0.25, ease: 'power2.out' }).to(el, { y: -36, duration: 0.6, ease: 'bounce.out' });
  });

  /* ------------------------------------------------------------ resize */
  let resizeTimer = 0;
  function onResize() {
    setCam(phase === 'intro' && heroState === 'intro' ? 'intro' : 'settled');
    afterCamera();
    if (peekRig) peekRig.resize(peekCanvas.clientWidth / RIG.crop[2]);
    tear();
  }
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(onResize, 120); });
  tear();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (!camTween) setCam(phase === 'intro' && heroState === 'intro' ? 'intro' : 'settled'); afterCamera(); tear(); if (ST) ST.refresh(); });
  }

  /* ------------------------------------------------------------ scroll-driven motion */
  if (!G || !ST) {
    addEventListener('scroll', navSolid, { passive: true });
    return;
  }

  ST.create({ start: 0, end: 'max', onUpdate: navSolid });
  navSolid();

  // as you scroll away he looks down at the page you're heading to
  ST.create({
    trigger: hero, start: 'top top', end: 'bottom top',
    onUpdate: (self) => { heroBrain.bias.pitch = self.progress * 1.2; heroBrain.bias.gy = self.progress; },
  });

  const mm = G.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    G.to(world, { yPercent: 14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

    // marquee: drifts on its own, rushes (and reverses) with your scroll
    const loop = G.to(bandTrack, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
    loop.totalTime(loop.duration() * 400);
    ST.create({
      start: 0, end: 'max',
      onUpdate: (self) => {
        const dir = self.direction;
        const speed = 1 + Math.min(5, Math.abs(self.getVelocity()) / 320);
        G.to(loop, { timeScale: dir * speed, duration: 0.2, overwrite: true, onComplete: () => G.to(loop, { timeScale: dir, duration: 1.1 }) });
      },
    });

    // section headings
    G.utils.toArray('[data-reveal]').forEach((el) => {
      G.from(el, { autoAlpha: 0, y: 36, duration: 0.9, ease: 'power4.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
    });

    // bento cells
    G.from('[data-cell]', {
      autoAlpha: 0, y: 40, scale: 0.94, duration: 0.8, ease: 'power3.out', stagger: 0.08, clearProps: 'transform',
      scrollTrigger: { trigger: '.bento', start: 'top 82%' },
    });

    // timeline year cards (vertical layouts)
    G.from('.era', { autoAlpha: 0, y: 40, duration: 0.8, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '#track', start: 'top 85%' } });

    // the join card lands
    G.from('.join__card', { y: 60, rotation: -2, autoAlpha: 0, duration: 1, ease: 'back.out(1.4)', scrollTrigger: { trigger: '#join', start: 'top 75%' } });
  });

  // sticky notes: tossed onto the board, draggable with a mouse
  const notes = $$('.note');
  mm.add('(min-width: 901px)', () => {
    notes.forEach((n) => G.set(n, { rotation: Number(n.dataset.rot) }));
    if (!REDUCED) {
      G.from(notes, {
        y: -160, autoAlpha: 0, rotation: (i) => Number(notes[i].dataset.rot) * 5,
        duration: 0.9, ease: 'back.out(1.5)', stagger: 0.1,
        scrollTrigger: { trigger: '#board', start: 'top 80%' },
      });
    }
    if (FINE && window.Draggable) {
      const drags = window.Draggable.create(notes, {
        type: 'x,y', bounds: '#board', zIndexBoost: true,
        onPress() { G.to(this.target, { scale: 1.06, rotation: 0, duration: 0.2 }); },
        onRelease() { G.to(this.target, { scale: 1, rotation: G.utils.random(-7, 7), duration: 0.6, ease: 'back.out(2.5)' }); },
      });
      return () => drags.forEach((d) => d.kill());
    }
    return undefined;
  });
  mm.add('(max-width: 900px)', () => {
    notes.forEach((n) => G.set(n, { rotation: Number(n.dataset.rot) * 0.5 }));
  });

  // timeline: horizontal pan while pinned (desktop)
  mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    const track = $('#track'), section = $('#timeline');
    const distance = () => Math.max(0, track.scrollWidth - innerWidth);
    const st = { trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 };
    G.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: st });
    G.fromTo('#trackLine', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { ...st, pin: false } });
  });
})();
