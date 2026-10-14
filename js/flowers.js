/*
 * Shin-chan's flower delivery.
 *
 * Scroll in: he walks over with a bouquet and waits (video 0 -> 2.4 s).
 * Name someone: he offers the flowers, shyly, and the video pauses at 4.0 s until YOU take them.
 * Then the happy ending plays, flowers burst, and you get a link (?flowers=Name) that greets
 * that person and replays the delivery with their name on it.
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const G = window.gsap;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  const stage = $('#flowerStage');
  if (!stage) return;
  const video = $('#flowerVideo'), tag = $('#flowerTag'), stamp = $('#flowerStamp');
  const bubble = $('#flowerBubble'), take = $('#flowerTake'), fx = $('.fx', stage);
  const form = $('#flowerForm'), input = $('#flowerName'), statusEl = $('#flowerStatus'), go = $('.flowers__go', form);
  const done = $('#flowerDone'), doneName = $('#flowerDoneName'), link = $('#flowerLink');
  const copyBtn = $('#flowerCopy'), again = $('#flowerAgain');

  const WAIT = 2.4;      // holding the bouquet, waiting for a name
  const OFFER = 4.0;     // bouquet held out, just before the hand comes in
  const END = 9.95;
  const SPOT = { wait: [54, 24], offer: [58, 22], talk: [60, 19], close: [70, 20] };   // bubble anchors, % of the video

  let state = 'idle';    // idle | intro | waiting | delivering | offering | finale | done
  let name = '';
  let pendingName = null;
  let stopAt = null, onStop = null, cues = [];

  const clean = (v) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const setStatus = (text, cue = false) => { statusEl.textContent = text; statusEl.classList.toggle('is-cue', cue); };

  /* ------------------------------------------------------------ video control */
  video.muted = !window.SHIN_SOUND;
  addEventListener('shin:sound', (e) => { video.muted = !e.detail; });

  function playTo(t, cb) {
    stopAt = t;
    onStop = cb;
    video.muted = !window.SHIN_SOUND;
    if (video.currentTime >= t - 0.02) { stop(); return; }
    const p = video.play();
    if (p && p.catch) {
      p.catch(() => {            // sound blocked: retry muted, else jump straight there
        video.muted = true;
        video.play().catch(() => { video.currentTime = t; stop(); });
      });
    }
  }
  function stop() {
    video.pause();
    if (stopAt != null && Math.abs(video.currentTime - stopAt) > 0.06) video.currentTime = stopAt;
    const cb = onStop;
    stopAt = null;
    onStop = null;
    if (cb) cb();
  }
  (function tick() {
    if (stopAt != null && !video.paused && video.currentTime >= stopAt) stop();
    if (!video.paused) cues.forEach((c) => { if (!c.done && video.currentTime >= c.t) { c.done = true; c.run(); } });
    requestAnimationFrame(tick);
  })();

  /* ------------------------------------------------------------ overlays */
  function say(text, where, hold = 0) {
    const [x, y] = SPOT[where];
    bubble.style.left = `${x}%`;
    bubble.style.bottom = `${100 - y}%`;
    bubble.textContent = text;
    if (!G) { bubble.style.opacity = 1; if (hold) setTimeout(hush, hold * 1000); return; }
    G.killTweensOf(bubble);
    G.fromTo(bubble, { autoAlpha: 0, scale: 0.4, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(2.6)' });
    if (hold) G.to(bubble, { autoAlpha: 0, y: -8, duration: 0.3, delay: hold });
  }
  function hush() { if (G) G.to(bubble, { autoAlpha: 0, duration: 0.25, overwrite: true }); else bubble.style.opacity = 0; }
  function pop(el, rot, from = 0.5) {
    if (!G) { el.style.opacity = 1; return; }
    G.fromTo(el, { autoAlpha: 0, scale: from, rotation: rot - 10 }, { autoAlpha: 1, scale: 1, rotation: rot, duration: 0.5, ease: 'back.out(2.4)' });
  }
  function fade(el) { if (G) G.to(el, { autoAlpha: 0, duration: 0.25 }); else el.style.opacity = 0; }

  function burst() {
    if (!G || REDUCED) return;
    const icons = ['flower', 'flower-tulip', 'flower-lotus', 'heart', 'sparkle'];
    const colors = ['var(--red)', '#EE7FA4', '#F4B400', '#8C79C9', 'var(--red)'];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement('span');
      el.className = 'p';
      el.innerHTML = `<i class="ph-bold ph-${icons[i % icons.length]}"></i>`;
      el.style.color = colors[i % colors.length];
      el.style.left = `${91 + rand(-4, 4)}%`;
      el.style.top = `${62 + rand(-10, 10)}%`;
      fx.appendChild(el);
      G.set(el, { xPercent: -50, yPercent: -50 });
      G.fromTo(el, { x: 0, y: 0, scale: 0.2, autoAlpha: 1, rotation: rand(-40, 40) }, {
        x: rand(-190, 30), y: rand(-240, -50), scale: rand(0.9, 1.7), rotation: rand(-90, 90),
        duration: rand(1.1, 1.8), ease: 'power2.out',
      });
      G.to(el, { autoAlpha: 0, duration: 0.45, delay: 1.4, onComplete: () => el.remove() });
    }
  }

  /* ------------------------------------------------------------ the delivery */
  function intro() {
    if (state !== 'idle') return;
    state = 'intro';
    if (REDUCED) { video.currentTime = WAIT; arrived(); return; }
    playTo(WAIT, arrived);
  }
  function arrived() {
    state = 'waiting';
    stage.classList.add('is-waiting');
    if (pendingName) { const n = pendingName; pendingName = null; deliver(n); return; }
    say('Who are these for...?', 'wait');
    setStatus("He's waiting for a name.");
  }

  const toast = $('#flowerToast');
  const dropToast = () => { if (toast && !toast.hidden) { if (G) G.to(toast, { autoAlpha: 0, y: 30, duration: 0.3, onComplete: () => { toast.hidden = true; } }); else toast.hidden = true; } };

  function deliver(n) {
    dropToast();
    name = n;
    if (state === 'idle' || state === 'intro') {
      pendingName = n;
      setStatus('He is on his way...');
      intro();
      return;
    }
    if (state !== 'waiting') return;
    state = 'delivering';
    go.disabled = true;
    $('strong', tag).textContent = name;
    pop(tag, -3);
    stage.classList.remove('is-waiting');
    hush();
    setStatus(`Delivering to ${name}...`);
    playTo(OFFER, () => {
      state = 'offering';
      stage.classList.add('is-waiting');
      say(`Th-these are for you, ${name}...`, 'offer');
      take.hidden = false;
      if (G && !REDUCED) G.fromTo(take, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2.2)' });
      take.querySelector('span').textContent = matchMedia('(hover: none)').matches ? 'Tap to take the flowers' : 'Take the flowers';
      setStatus('Your turn: take the flowers.', true);
      take.focus({ preventScroll: true });
    });
  }

  take.addEventListener('click', () => {
    if (state !== 'offering') return;
    state = 'finale';
    take.hidden = true;
    stage.classList.remove('is-waiting');
    hush();
    setStatus(`${name} took the flowers!`);
    cues = [
      { t: 5.05, run: () => say(`Ehehe... ${name}, you're the best!`, 'talk', 1.35) },
      { t: 7.25, run: burst },
      { t: 7.9, run: () => say('...do you like them?', 'close') },
    ].map((c) => ({ ...c, done: false }));
    playTo(END, finale);
  });

  function finale() {
    state = 'done';
    cues = [];
    if (G && !REDUCED) G.fromTo(stamp, { autoAlpha: 0, scale: 2.2, rotation: -6 }, { autoAlpha: 1, scale: 1, rotation: 9, duration: 0.35, ease: 'power3.in' });
    else stamp.style.opacity = 1;
    doneName.textContent = name;
    link.value = deliveryLink(name);
    form.hidden = true;
    done.hidden = false;
    if (G && !REDUCED) G.from(done, { y: 24, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' });
    go.disabled = false;
  }

  function reset() {
    cues = [];
    stopAt = null;
    onStop = null;
    video.pause();
    video.currentTime = WAIT;
    [tag, stamp].forEach(fade);
    take.hidden = true;
    done.hidden = true;
    form.hidden = false;
    input.value = '';
    state = 'waiting';
    stage.classList.add('is-waiting');
    say('Who are these for...?', 'wait');
    setStatus("He's waiting for a name.");
    input.focus({ preventScroll: true });
  }

  function deliveryLink(n) {
    const u = new URL(location.href);
    u.hash = '';
    u.search = '';
    u.searchParams.set('flowers', n);
    return u.toString();
  }

  /* ------------------------------------------------------------ form + buttons */
  function submitName(raw) {
    const n = clean(raw);
    if (!n) {
      input.setAttribute('aria-invalid', 'true');
      setStatus('Give him a name first.', true);
      if (G && !REDUCED) G.fromTo(input, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      input.focus();
      return;
    }
    input.setAttribute('aria-invalid', 'false');
    input.value = n;
    deliver(n);
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); submitName(input.value); });
  form.querySelectorAll('.chip-btn').forEach((b) => b.addEventListener('click', () => submitName(b.dataset.name)));
  again.addEventListener('click', reset);
  copyBtn.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(link.value); ok = true; } catch (e) {
      link.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    const label = $('span', copyBtn);
    label.textContent = ok ? 'Copied!' : 'Press Ctrl+C';
    if (!ok) link.select();
    setTimeout(() => { label.textContent = 'Copy link'; }, 2200);
  });

  /* ------------------------------------------------------------ when it comes into view */
  const near = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { video.preload = 'auto'; near.disconnect(); }
  }, { rootMargin: '900px' });
  near.observe(stage);
  const seen = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && e.intersectionRatio > 0.45) { intro(); dropToast(); seen.disconnect(); }
  }, { threshold: [0, 0.45, 0.6] });
  seen.observe(stage);

  /* ------------------------------------------------------------ someone opened a delivery link */
  const incoming = clean(new URLSearchParams(location.search).get('flowers'));
  if (incoming) {
    input.value = incoming;
    const btn = $('#flowerToastBtn');
    $('span', toast).textContent = `${incoming}, someone sent you flowers!`;
    setTimeout(() => {
      toast.hidden = false;
      if (G && !REDUCED) G.from(toast, { y: 40, autoAlpha: 0, duration: 0.5, ease: 'back.out(2)' });
    }, 1800);
    btn.addEventListener('click', () => {
      toast.hidden = true;
      $('#flowers').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      deliver(incoming);
    });
  }

  if (G && window.ScrollTrigger && !REDUCED) {
    G.from(stage, { y: 60, rotation: -2, autoAlpha: 0, duration: 1, ease: 'back.out(1.4)', clearProps: 'transform', scrollTrigger: { trigger: stage, start: 'top 85%' } });
    G.from('.flowers__panel', { x: 50, autoAlpha: 0, duration: 0.9, ease: 'power3.out', clearProps: 'transform', scrollTrigger: { trigger: stage, start: 'top 80%' } });
  }
})();
