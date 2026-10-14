/*
 * The cast.
 *
 * - Everyone with shiny cartoon eyes watches your cursor (their eye glints were lifted out
 *   of the artwork and are redrawn here, so they can move inside the eye).
 * - The family portrait and the Defense Force photo are explorable: point at someone to
 *   spotlight them, click to make them do their thing.
 * - Action Kamen fires a chargeable Action Beam, the grown-ups' polaroids flip over,
 *   and Shiro in the footer likes to be petted.
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const CAST = window.SHIN_CAST;
  const G = window.gsap;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (!CAST) return;

  /* ------------------------------------------------------------ pointer + attention */
  const pointer = { x: 0, y: 0, active: false };
  const onPointer = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer.active = false; });
  let attention = null;     // { x, y, until } in screen px: something everyone should look at

  /* ------------------------------------------------------------ eye glints */
  const watchers = [];
  $$('[data-cast]').forEach((fig) => {
    const d = CAST[fig.dataset.cast];
    if (!d) return;
    fig.style.aspectRatio = `${d.w} / ${d.h}`;
    const img = fig.querySelector('img');
    const eyes = d.eyes.map((e) => {
      const g = document.createElement('span');
      g.className = 'glint';
      g.style.left = `${((e.hx - e.hr) / d.w) * 100}%`;
      g.style.top = `${((e.hy - e.hr) / d.h) * 100}%`;
      g.style.width = `${((2 * e.hr - 0.4) / d.w) * 100}%`;
      img.after(g);
      return { g, e, x: 0, y: 0 };
    });
    if (eyes.length) watchers.push({ fig, d, eyes, visible: false });
  });
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((en) => { const w = watchers.find((x) => x.fig === en.target); if (w) w.visible = en.isIntersecting; });
  }, { rootMargin: '120px' });
  watchers.forEach((w) => seen.observe(w.fig));

  function updateGlints(now) {
    const target = attention && now < attention.until ? attention : pointer.active ? pointer : null;
    for (const w of watchers) {
      if (!w.visible) continue;
      const r = w.fig.getBoundingClientRect();
      if (!r.width) continue;
      const k = r.width / w.d.w;
      for (const it of w.eyes) {
        const e = it.e;
        let tx = 0, ty = 0;
        if (target) {
          const ex = r.left + e.x * k, ey = r.top + e.y * k;
          const dx = target.x - ex, dy = target.y - ey;
          const dist = Math.hypot(dx, dy) || 1;
          const room = Math.max(0, e.r - e.hr - 1.2);
          const amt = Math.min(1, dist / 170);
          // where the glint wants to be (image px, relative to the eye centre), kept inside the eye
          let ox = e.hx - e.x + (dx / dist) * room * amt;
          let oy = e.hy - e.y + (dy / dist) * room * amt;
          const len = Math.hypot(ox, oy);
          if (len > room) { ox *= room / len; oy *= room / len; }
          tx = (ox - (e.hx - e.x)) * k;
          ty = (oy - (e.hy - e.y)) * k;
        }
        it.x += (tx - it.x) * 0.2;
        it.y += (ty - it.y) * 0.2;
        it.g.style.transform = `translate3d(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px, 0)`;
      }
    }
  }
  (function loop(now) { updateGlints(now); requestAnimationFrame(loop); })(performance.now());

  /* ------------------------------------------------------------ effects */
  const FX = {
    add(layer, cls, html, x, y) {
      const el = document.createElement('span');
      el.className = cls;
      el.innerHTML = html;
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      layer.appendChild(el);
      return el;
    },
    bubble(layer, text, x, y, hold = 1.4) {
      const el = FX.add(layer, 'bubble', text, x, y);
      if (!G) { setTimeout(() => el.remove(), 1800); return el; }
      G.set(el, { xPercent: -18, yPercent: -100, transformOrigin: '18% 100%' });
      G.timeline({ onComplete: () => el.remove() })
        .fromTo(el, { scale: 0.3, autoAlpha: 0, y: 12 }, { scale: 1, autoAlpha: 1, y: 0, duration: 0.4, ease: 'back.out(3)' })
        .to(el, { autoAlpha: 0, y: -12, duration: 0.35, ease: 'power2.in' }, `+=${hold}`);
      return el;
    },
    shout(layer, text, x, y, rot = -6) {
      if (!G) return;
      const el = FX.add(layer, 'shout', text, x, y);
      G.set(el, { xPercent: -50, yPercent: -50, rotation: rot });
      G.timeline({ onComplete: () => el.remove() })
        .fromTo(el, { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(3.5)' })
        .to(el, { y: -26, autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, '+=0.8');
    },
    burst(layer, x, y, { icon = 'sparkle', n = 8, color = 'var(--red)', spread = 90, up = 30, life = 1.1 } = {}) {
      if (!G || REDUCED) return;
      for (let i = 0; i < n; i++) {
        const el = FX.add(layer, 'p', `<i class="ph-bold ph-${typeof icon === 'function' ? icon(i) : icon}"></i>`, x, y);
        el.style.color = color;
        const a = rand(0, Math.PI * 2), d = rand(spread * 0.45, spread);
        G.set(el, { xPercent: -50, yPercent: -50 });
        G.fromTo(el, { x: 0, y: 0, scale: 0.3, rotation: rand(-40, 40), autoAlpha: 1 }, {
          x: Math.cos(a) * d, y: Math.sin(a) * d - up, scale: rand(0.8, 1.35), rotation: rand(-60, 60),
          duration: rand(life * 0.75, life * 1.2), ease: 'power2.out',
        });
        G.to(el, { autoAlpha: 0, duration: 0.35, delay: life * 0.8, onComplete: () => el.remove() });
      }
    },
    rise(layer, x, y, { icon = 'heart', n = 6, color = 'var(--red)', height = 140, life = 1.6 } = {}) {
      if (!G || REDUCED) return;
      for (let i = 0; i < n; i++) {
        const el = FX.add(layer, 'p', `<i class="ph-bold ph-${icon}"></i>`, x + rand(-8, 8), y);
        el.style.color = color;
        G.set(el, { xPercent: -50, yPercent: -50 });
        G.fromTo(el, { y: 0, x: 0, scale: 0.4, autoAlpha: 0 }, {
          y: -height * rand(0.6, 1.1), x: rand(-30, 30), scale: rand(0.8, 1.3), autoAlpha: 1,
          duration: life, delay: i * 0.12, ease: 'power1.out',
        });
        G.to(el, { autoAlpha: 0, duration: 0.4, delay: i * 0.12 + life * 0.75, onComplete: () => el.remove() });
      }
    },
    sticker(layer, src, x, y) {
      const el = FX.add(layer, 'sticker-pop', `<img src="${src}" alt="">`, x, y);
      if (G) G.set(el, { xPercent: -50, yPercent: -85 });
      return el;
    },
  };

  /* ------------------------------------------------------------ explorable image */
  function explorable(fig, { name, label, onHover, onPick }) {
    const d = CAST[fig.dataset.cast];
    const holder = $('.explore__spots', fig), dim = $('.explore__dim', fig), fx = $('.fx', fig);
    const spots = {};
    let current = null;
    d.spots.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'spot';
      b.style.left = `${((s.x - s.r) / d.w) * 100}%`;
      b.style.top = `${((s.y - s.r) / d.h) * 100}%`;
      b.style.width = `${((2 * s.r) / d.w) * 100}%`;
      b.setAttribute('aria-label', label(s.id));
      b.innerHTML = `<span class="spot__label" aria-hidden="true">${name(s.id)}</span>`;
      b.addEventListener('pointerenter', () => onHover(s.id, true));
      b.addEventListener('pointerleave', () => onHover(s.id, false));
      b.addEventListener('focus', () => onHover(s.id, true));
      b.addEventListener('blur', () => onHover(s.id, false));
      b.addEventListener('click', () => onPick(s.id));
      holder.appendChild(b);
      spots[s.id] = { el: b, s };
    });

    function place(id, animate) {
      const s = spots[id].s, k = fig.getBoundingClientRect().width / d.w;
      const props = { '--sx': `${s.x * k}px`, '--sy': `${s.y * k}px`, '--sr': `${s.r * k * 1.08}px` };
      if (G && animate) G.to(dim, { ...props, duration: 0.45, ease: 'power3.out', overwrite: true });
      else Object.entries(props).forEach(([key, v]) => dim.style.setProperty(key, v));
    }
    function spotlight(id) {
      const was = current;
      current = id;
      Object.values(spots).forEach((o) => o.el.classList.toggle('is-active', o.s.id === id));
      if (!id) { fig.classList.remove('is-spot'); return; }
      place(id, !!was && fig.classList.contains('is-spot'));
      fig.classList.add('is-spot');
    }
    const at = (id, dx = 0, dy = 0) => {
      const s = spots[id].s;
      return [((s.x + dx) / d.w) * 100, ((s.y + dy) / d.h) * 100];
    };
    addEventListener('resize', () => { if (current) place(current, false); });
    return { spotlight, at, fx, fig };
  }

  /* ------------------------------------------------------------ the Nohara family */
  const FAMILY = {
    shin: {
      name: 'Shinnosuke', jp: 'しんのすけ', role: 'The troublemaker', tag: 'Age 5', icon: 'music-notes', move: 'Do the butt dance',
      bio: "Futaba Kindergarten's wildest student. Lives on Chocobi, worships Action Kamen and dances whenever he feels like it.",
    },
    misae: {
      name: 'Misae', jp: 'みさえ', role: 'Mom, and the real boss', tag: 'Age 29', icon: 'hand-fist', move: 'Give him a noogie',
      bio: 'Bargain hunter, nap lover and the one person Shin-chan truly fears. Her knuckle noogie is legendary.',
    },
    hiroshi: {
      name: 'Hiroshi', jp: 'ひろし', role: 'Dad, salaryman', tag: 'Age 35', icon: 'sneaker', move: 'Take off his socks',
      bio: 'Works hard at Futaba Trading and pays off a very long home loan. His socks after work could knock out a lion.',
    },
    himawari: {
      name: 'Himawari', jp: 'ひまわり', role: 'Little sister', tag: 'Baby', icon: 'diamond', move: 'Show her something shiny',
      bio: "Named after the sunflower. Can't talk yet, but will crawl across town for anything shiny or any handsome face.",
    },
    shiro: {
      name: 'Shiro', jp: 'シロ', role: 'The family dog', tag: 'Good boy', icon: 'cloud', move: 'Cotton candy!',
      bio: 'A fluffy white stray Shin-chan brought home in a cardboard box. His best trick: curling up into cotton candy.',
    },
  };
  const ORDER = ['shin', 'misae', 'hiroshi', 'himawari', 'shiro'];

  const portrait = $('#familyPortrait');
  if (portrait) {
    const card = $('#memberCard'), tabs = $('.member__tabs'), moveBtn = $('.member__move');
    let selected = 'shin', hovered = null, busy = 0;

    const fam = explorable(portrait, {
      name: (id) => FAMILY[id].name,
      label: (id) => `${FAMILY[id].name}: ${FAMILY[id].move.toLowerCase()}`,
      onHover: (id, on) => { hovered = on ? id : hovered === id ? null : hovered; refreshSpot(); },
      onPick: (id) => { select(id); doMove(id); },
    });
    portrait.addEventListener('pointerleave', () => { hovered = null; refreshSpot(); });
    function refreshSpot() { fam.spotlight(hovered || (busy ? selected : null)); }

    ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'member__tab';
      b.dataset.id = id;
      b.textContent = FAMILY[id].name;
      b.setAttribute('aria-pressed', String(id === selected));
      b.addEventListener('click', () => select(id));
      b.addEventListener('pointerenter', () => { hovered = id; refreshSpot(); });
      b.addEventListener('pointerleave', () => { hovered = null; refreshSpot(); });
      tabs.appendChild(b);
    });

    function render(id) {
      const m = FAMILY[id];
      $('.member__jp', card).textContent = m.jp;
      $('.member__name', card).textContent = m.name;
      $('.member__roleText', card).textContent = m.role;
      $('.member__tag', card).textContent = m.tag;
      $('.member__bio', card).textContent = m.bio;
      $('span', moveBtn).textContent = m.move;
      $('i', moveBtn).className = `ph-bold ph-${m.icon}`;
    }
    function select(id) {
      if (id === selected) return;
      selected = id;
      $$('.member__tab', tabs).forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.id === id)));
      if (G && !REDUCED) {
        G.timeline()
          .to(card, { rotationY: -8, x: -10, autoAlpha: 0.2, duration: 0.16, ease: 'power2.in', transformPerspective: 900 })
          .call(() => render(id))
          .to(card, { rotationY: 0, x: 0, autoAlpha: 1, duration: 0.45, ease: 'back.out(2)' });
      } else {
        render(id);
      }
    }
    render(selected);
    moveBtn.addEventListener('click', () => doMove(selected));

    function doMove(id) {
      busy++;
      refreshSpot();
      setTimeout(() => { busy--; refreshSpot(); }, 1700);
      const fx = fam.fx;
      if (id === 'shin') {
        const [x, y] = fam.at('shin', 0, -70);
        FX.burst(fx, x, y, { icon: (i) => (i % 2 ? 'music-note' : 'music-notes'), n: 9, color: 'var(--red)', spread: 120, up: 60 });
        FX.bubble(fx, 'Buri buri!', x + 6, y - 6);
        if (G && !REDUCED) G.fromTo(portrait, { rotation: 0 }, { rotation: 2.2, duration: 0.11, yoyo: true, repeat: 7, ease: 'sine.inOut', clearProps: 'rotation' });
      } else if (id === 'misae') {
        const [x, y] = fam.at('misae', -10, -110);
        FX.shout(fx, 'GRRR!', x, y, -8);
        FX.burst(fx, x, y + 6, { icon: 'lightning', n: 6, color: 'var(--red)', spread: 80, up: 10 });
        const [sx, sy] = fam.at('shin', -10, -120);
        setTimeout(() => FX.bubble(fx, 'Ow ow ow!', sx, sy), 450);
        if (G && !REDUCED) G.fromTo(portrait, { x: 0 }, { x: 7, duration: 0.05, yoyo: true, repeat: 9, ease: 'none', clearProps: 'x' });
      } else if (id === 'hiroshi') {
        const [x, y] = fam.at('hiroshi', -40, 230);
        FX.rise(fx, x, y, { icon: 'cloud', n: 8, color: '#8FA83A', height: 260, life: 1.8 });
        FX.shout(fx, 'PEE-YEW!', ...fam.at('hiroshi', 0, -150), 5);
        const [mx, my] = fam.at('misae', 10, -120);
        setTimeout(() => FX.bubble(fx, 'Hiroshi!! Windows!', mx, my), 600);
      } else if (id === 'himawari') {
        const [x, y] = fam.at('himawari', 0, -40);
        const st = FX.sticker(fx, 'assets/cast/himawari.webp', x, y);
        FX.burst(fx, x, y - 8, { icon: 'sparkle', n: 12, color: '#F4B400', spread: 140, up: 40, life: 1.4 });
        if (G) {
          G.timeline({ onComplete: () => st.remove() })
            .fromTo(st, { scale: 0, rotation: -18 }, { scale: 1, rotation: 4, y: -40, duration: 0.55, ease: 'back.out(2.4)' })
            .to(st, { rotation: -4, duration: 0.18, yoyo: true, repeat: 3 })
            .to(st, { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'back.in(2)' }, '+=0.4');
        } else setTimeout(() => st.remove(), 1500);
      } else if (id === 'shiro') {
        const [x, y] = fam.at('shiro', 0, -10);
        const st = FX.sticker(fx, 'assets/cast/shiro.webp', x, y);
        if (G) {
          G.timeline({ onComplete: () => st.remove() })
            .fromTo(st, { scale: 0 }, { scale: 1, y: -50, duration: 0.45, ease: 'back.out(2.2)' })
            .to(st, { scaleX: 1.25, scaleY: 0.75, duration: 0.15 })
            .to(st, { scaleX: 0.8, scaleY: 0.8, rotation: 720, duration: 0.8, ease: 'power2.inOut' })
            .to(st, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'back.out(3)' })
            .to(st, { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'back.in(2)' }, '+=0.35');
        } else setTimeout(() => st.remove(), 1500);
        setTimeout(() => FX.rise(fx, x, y - 20, { icon: 'heart', n: 5, color: 'var(--red)', height: 120 }), 700);
        setTimeout(() => FX.bubble(fx, 'Fluffy!', x + 4, y - 22), 900);
      }
    }
  }

  /* ------------------------------------------------------------ Kasukabe Defense Force */
  const groupFig = $('#groupPhoto');
  const cells = {};
  $$('[data-friend]').forEach((c) => { cells[c.dataset.friend] = c; });
  const NAMES = { kazama: 'Kazama', masao: 'Masao', shin: 'Shin-chan', bochan: 'Bo-chan', nene: 'Nene', shiro: 'Shiro' };
  let rocks = 0;

  if (groupFig) {
    let linked = null;
    const grp = explorable(groupFig, {
      name: (id) => NAMES[id],
      label: (id) => (cells[id] ? `${NAMES[id]}: poke` : `Say hi to ${NAMES[id]}`),
      onHover: (id, on) => link(on ? id : null),
      onPick: (id) => {
        if (cells[id]) react(id);
        else {
          const [x, y] = grp.at(id, 0, id === 'shiro' ? -55 : -80);
          FX.bubble(grp.fx, id === 'shin' ? 'Ora! Ora!' : 'Arf!', x, y);
          FX.burst(grp.fx, x, y + 10, { icon: id === 'shin' ? 'star-four' : 'heart', n: 6, color: 'var(--paper)', spread: 60 });
        }
      },
    });
    groupFig.addEventListener('pointerleave', () => link(null));

    function link(id) {
      if (linked === id) return;
      linked = id;
      grp.spotlight(id);
      Object.entries(cells).forEach(([k, c]) => c.classList.toggle('is-linked', k === id));
    }
    Object.entries(cells).forEach(([id, c]) => {
      c.addEventListener('pointerenter', () => link(id));
      c.addEventListener('pointerleave', () => link(null));
      $('.cell__art', c).addEventListener('click', () => react(id));
    });
  }

  function artPoint(cell, ix, iy) {
    // image px inside the card art -> % of the card (where the fx layer lives)
    const img = $('.cell__art img', cell), cr = cell.getBoundingClientRect(), ir = img.getBoundingClientRect();
    return [((ir.left - cr.left + (ix / img.naturalWidth) * ir.width) / cr.width) * 100,
      ((ir.top - cr.top + (iy / img.naturalHeight) * ir.height) / cr.height) * 100];
  }

  function react(id) {
    const cell = cells[id];
    if (!cell) return;
    const fx = $('.fx', cell), art = $('.cell__art img', cell);
    if (id === 'kazama') {
      if (G && !REDUCED) G.fromTo(art, { y: 0 }, { y: -18, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'y' });
      FX.bubble(cell.querySelector('.fx'), pick(['Ahem. I will be elite.', 'Stop calling me Toru-chan!', 'I have cram school.']), 8, 16);
      FX.burst(fx, ...artPoint(cell, 170, 120), { icon: 'sparkle', n: 6, color: 'var(--red)', spread: 70 });
    } else if (id === 'nene') {
      if (G && !REDUCED) G.fromTo(art, { x: 0 }, { x: 6, duration: 0.05, yoyo: true, repeat: 7, clearProps: 'x' });
      const [x, y] = artPoint(cell, 120, 300);
      if (G) {
        const pow = FX.add(fx, 'pow', '<span>POW!</span>', x - 30, y);
        G.set(pow, { xPercent: -50, yPercent: -50 });
        G.timeline({ onComplete: () => pow.remove() })
          .fromTo(pow, { scale: 0, rotation: -40 }, { scale: 1, rotation: -8, duration: 0.35, ease: 'back.out(3)' })
          .to(pow, { scale: 0, autoAlpha: 0, duration: 0.25 }, '+=0.7');
      }
      setTimeout(() => FX.bubble(fx, "Let's play house. NOW.", 8, 16), 350);
    } else if (id === 'masao') {
      if (G && !REDUCED) G.fromTo(art, { x: 0 }, { x: 2.5, duration: 0.04, yoyo: true, repeat: 21, clearProps: 'x' });
      FX.bubble(fx, 'Waaaah!', 8, 16);
      if (G && !REDUCED) {
        [[132, 150, -1], [206, 150, 1]].forEach(([ix, iy, side]) => {
          const [x, y] = artPoint(cell, ix, iy);
          for (let i = 0; i < 6; i++) {
            const t = FX.add(fx, 'tear', '', x, y);
            G.set(t, { xPercent: -50, yPercent: -50, rotation: 45 });
            G.timeline({ delay: i * 0.12, onComplete: () => t.remove() })
              .fromTo(t, { x: 0, y: 0, autoAlpha: 1 }, { x: side * rand(30, 60), duration: 0.7, ease: 'none' })
              .fromTo(t, { y: 0 }, { y: rand(40, 80), duration: 0.7, ease: 'power2.in' }, 0)
              .to(t, { autoAlpha: 0, duration: 0.2 }, 0.5);
          }
        });
      }
    } else if (id === 'bochan') {
      rocks++;
      $('.rocks strong', cell).textContent = rocks;
      let pile = $('.rock-pile', cell);
      if (!pile) { pile = document.createElement('span'); pile.className = 'rock-pile'; pile.setAttribute('aria-hidden', 'true'); cell.appendChild(pile); }
      if (rocks <= 14) {
        const r = document.createElement('i');
        const col = rocks - 1;
        r.style.left = `${(col % 7) * 16 + rand(-2, 2)}px`;
        r.style.top = `${46 - Math.floor(col / 7) * 11}px`;
        pile.appendChild(r);
        if (G && !REDUCED) G.from(r, { y: -120, rotation: rand(-90, 90), duration: 0.6, ease: 'bounce.out' });
      }
      FX.bubble(fx, pick(['...nice rock.', '...', 'This one is round.', 'Bo.']), 8, 16);
    }
  }

  /* ------------------------------------------------------------ Action Kamen */
  const beamBtn = $('#beamBtn');
  if (beamBtn) {
    const art = $('#akArt'), fig = $('.cast-fig', art), charge = $('.ak-charge', art), beam = $('.ak-beam', art);
    const meter = $('.beam-meter', beamBtn), labelEl = $('.beam-label', beamBtn), countEl = $('#beamCount');
    const d = CAST.actionkamen;
    const hx = (d.hand[0] / d.w) * 100, hy = (d.hand[1] / d.h) * 100;
    [charge, beam].forEach((el) => { el.style.left = `${hx}%`; el.style.top = `${hy}%`; });
    const angle = (Math.atan2(-96, 158) * 180) / Math.PI;   // along his raised arm
    if (G) G.set(beam, { yPercent: -50, rotation: angle, scaleX: 0, transformOrigin: '0% 50%' });
    let charging = false, firing = false, t0 = 0, shake = null, fired = 0;
    const idleLabel = 'Hold to charge the beam';

    function start() {
      if (charging || firing) return;
      charging = true;
      t0 = performance.now();
      labelEl.textContent = 'Charging...';
      if (!G) return;
      G.to(meter, { scaleX: 1, duration: 1.4, ease: 'none', overwrite: true });
      G.to(charge, { scale: 1.5, duration: 1.4, ease: 'power1.in', overwrite: true });
      if (!REDUCED) shake = G.to(fig, { x: 2.5, duration: 0.05, yoyo: true, repeat: -1, ease: 'none' });
    }
    function release() {
      if (!charging) return;
      charging = false;
      fire(Math.min(1, Math.max(0.3, (performance.now() - t0) / 1400)));
    }
    function fire(power) {
      firing = true;
      if (shake) { shake.kill(); shake = null; }
      fired++;
      countEl.textContent = fired;
      labelEl.textContent = power > 0.95 ? 'MAXIMUM BEAM!' : 'Action Beam!';
      const r = art.getBoundingClientRect();
      attention = { x: r.left + (hx / 100) * r.width + 160, y: r.top + (hy / 100) * r.height - 100, until: performance.now() + 1600 };
      const done = () => {
        firing = false;
        labelEl.textContent = idleLabel;
      };
      if (!G) { setTimeout(done, 600); return; }
      G.set(fig, { x: 0 });
      const tl = G.timeline({ onComplete: done });
      tl.set(beam, { height: 16 + 30 * power, autoAlpha: 1, scaleX: 0 })
        .to(charge, { scale: 1 + 2 * power, duration: 0.15, ease: 'power2.out' })
        .to(beam, { scaleX: 1, duration: REDUCED ? 0.01 : 0.3, ease: 'power4.out' }, '<')
        .to(meter, { scaleX: 0, duration: 0.6, ease: 'power2.out' }, '<')
        .to(beam, { autoAlpha: 0, duration: 0.45 }, '+=0.45')
        .to(charge, { scale: 0, duration: 0.4 }, '<');
      if (!REDUCED) {
        G.fromTo(art, { x: -10 * power }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)', clearProps: 'x' });
        const flash = document.createElement('div');
        flash.className = 'flash';
        document.body.appendChild(flash);
        G.timeline({ onComplete: () => flash.remove() }).to(flash, { opacity: 0.35 * power, duration: 0.06 }).to(flash, { opacity: 0, duration: 0.45 });
      }
      const fx = $('.fx', art);
      FX.shout(fx, 'WAHAHAHA!', 30, 6, -8);
      FX.burst(fx, hx, hy, { icon: 'star-four', n: 10, color: 'var(--red)', spread: 110, up: 0, life: 0.9 });
    }

    beamBtn.addEventListener('pointerdown', (e) => { if (e.button === 0) { beamBtn.setPointerCapture(e.pointerId); start(); } });
    beamBtn.addEventListener('pointerup', release);
    beamBtn.addEventListener('pointercancel', release);
    beamBtn.addEventListener('lostpointercapture', release);
    beamBtn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
    beamBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); release(); } });
    beamBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ------------------------------------------------------------ the grown-ups */
  const POLAROID_FX = {
    exclaim: (fx) => FX.burst(fx, 50, 22, { icon: 'warning-circle', n: 5, color: 'var(--red)', spread: 90, up: 40 }),
    rose: (fx) => FX.rise(fx, 50, 60, { icon: 'flower', n: 6, color: 'var(--red)', height: 180 }),
    hearts: (fx) => FX.rise(fx, 50, 55, { icon: 'heart', n: 7, color: 'var(--red)', height: 200 }),
  };
  $$('.polaroid').forEach((p) => {
    p.style.setProperty('--tilt', `${p.dataset.tilt}deg`);
    const fx = $('.fx', p), play = POLAROID_FX[p.dataset.fx];
    let last = 0;
    p.addEventListener('click', () => {
      const on = p.getAttribute('aria-pressed') !== 'true';
      p.setAttribute('aria-pressed', String(on));
      if (on) play(fx);
    });
    p.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || performance.now() - last < 2500) return;
      last = performance.now();
      play(fx);
    });
  });

  /* ------------------------------------------------------------ Shiro in the footer */
  const fShiro = $('#footerShiro');
  if (fShiro) {
    const img = $('img', fShiro), fx = $('.fx', fShiro);
    let pets = 0;
    fShiro.addEventListener('click', () => {
      pets++;
      FX.rise(fx, 50, 30, { icon: 'heart', n: 4, color: 'var(--paper)', height: 90 });
      FX.bubble(fx, pets % 5 === 0 ? 'Arf arf arf!' : 'Arf!', -70, 40, 0.8);
      if (G && !REDUCED) G.fromTo(img, { rotation: 0 }, { rotation: 8, duration: 0.09, yoyo: true, repeat: 5, ease: 'sine.inOut', clearProps: 'rotation' });
    });
  }

  /* ------------------------------------------------------------ entrances */
  if (G && window.ScrollTrigger && !REDUCED) {
    G.from('#familyPortrait', { scale: 0.86, rotation: -4, autoAlpha: 0, duration: 1, ease: 'back.out(1.5)', clearProps: 'transform', scrollTrigger: { trigger: '#familyPortrait', start: 'top 82%' } });
    G.from('.member', { x: 50, autoAlpha: 0, duration: 0.9, ease: 'power3.out', clearProps: 'transform', scrollTrigger: { trigger: '.member', start: 'top 85%' } });
    G.from('#akArt', { x: 90, rotation: 6, autoAlpha: 0, duration: 1.1, ease: 'back.out(1.4)', clearProps: 'transform', scrollTrigger: { trigger: '#action', start: 'top 70%' } });
    G.from('.action__controls', { y: 24, autoAlpha: 0, duration: 0.7, ease: 'power3.out', clearProps: 'transform', scrollTrigger: { trigger: '#action', start: 'top 60%' } });
    G.from('.polaroid', {
      y: -120, rotation: (i) => [-18, 14, -10][i] || 0, autoAlpha: 0, duration: 1, stagger: 0.12, ease: 'back.out(1.3)', clearProps: 'transform',
      scrollTrigger: { trigger: '.polaroids', start: 'top 80%' },
    });
    G.from('#footerShiro', { y: 60, autoAlpha: 0, duration: 0.8, ease: 'back.out(2)', clearProps: 'transform', scrollTrigger: { trigger: '.footer', start: 'top 90%' } });
  }
})();
