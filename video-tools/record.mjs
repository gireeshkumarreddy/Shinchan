/*
 * Records the 40 s website showcase.
 * The page clock is slowed to RATE (0.35x) so screencast frames (~25/s real) become ~70/s of
 * page time; frames are then re-timed to page time and encoded at 60 fps.
 * Re-render (serve the project first: node video-tools/serve.mjs):
 *   node record.mjs                                   -> showcase-silent.mp4 + events.json
 *   ffmpeg -i ../assets/hero.mp4 -vn -ac 2 -ar 48000 hero.wav
 *   ffmpeg -i ../assets/flowers.mp4 -vn -ac 2 -ar 48000 flowers.wav && python audio.py   -> mix.wav
 *   ffmpeg -i showcase-silent.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy
 *          -af loudnorm=I=-16:TP=-1.5 -c:a aac -b:a 192k -t 40 ../shinchan-showcase.mp4
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const RATE = 0.18;
const FPS = 60;
const LENGTH = 40;
const OUT = 'frames';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT);

const warp = `(() => {
  const RATE = ${RATE};
  const rp = performance.now.bind(performance), rd = Date.now, p0 = rp(), d0 = rd();
  window.__realNow = rd;
  performance.now = () => p0 + (rp() - p0) * RATE;
  Date.now = () => d0 + (rd() - d0) * RATE;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => cb(p0 + (ts - p0) * RATE));
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  window.setTimeout = (fn, d = 0, ...a) => st(fn, d / RATE, ...a);
  window.setInterval = (fn, d = 0, ...a) => si(fn, d / RATE, ...a);
  const scale = (v) => v.split(',').map((s) => (parseFloat(s) / RATE) + 's').join(', ');
  const slowCSS = () => {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      const walk = (list) => { for (const r of list) {
        if (r.cssRules) walk(r.cssRules);
        if (!r.style) continue;
        for (const p of ['transition-duration', 'transition-delay', 'animation-duration', 'animation-delay']) {
          const v = r.style.getPropertyValue(p); if (v && /s/.test(v)) r.style.setProperty(p, scale(v));
        }
      } };
      walk(rules);
    }
  };
  document.addEventListener('DOMContentLoaded', slowCSS);
  if (window.top === window) {
    const waiters = [];
    window.__heroGo = () => { window.__go = true; waiters.splice(0).forEach((f) => f()); };
    window.__heroWait = (f) => (window.__go ? f() : waiters.push(f));
  } else {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.defaultPlaybackRate = RATE; this.playbackRate = RATE;
      return new Promise((res, rej) => window.top.__heroWait(() => {
        this.playbackRate = RATE;
        const kind = this.id === 'heroVideo' ? 'hero' : 'fplay';
        play.call(this).then(() => { window.top.__log && window.top.__log(kind, { ct: this.currentTime }); res(); }, rej);
      }));
    };
    document.addEventListener('DOMContentLoaded', () => {
      const fv = document.getElementById('flowerVideo');
      if (fv) fv.addEventListener('pause', () => window.top.__log && window.top.__log('fpause', { ct: fv.currentTime }));
    });
    for (const t of ['move', 'down', 'up']) {
      addEventListener('mouse' + t, (e) => window.top.__frameMouse && window.top.__frameMouse(t, e.clientX, e.clientY), true);
    }
  }
})();`;

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--headless=new', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.addInitScript(warp);
await page.goto('http://127.0.0.1:5173/video-tools/stage.html', { waitUntil: 'load', timeout: 90000 });
await page.evaluate(() => { document.getElementById('site').src = '/index.html'; });
await page.waitForFunction(() => {
  const d = document.getElementById('site').contentDocument;
  return d && d.readyState === 'complete' && d.getElementById('heroVideo')?.readyState >= 2 && document.fonts.status === 'loaded';
}, null, { timeout: 60000 });
await page.evaluate(() => window.__build());

/* capture */
const cdp = await page.context().newCDPSession(page);
const frames = [];
const pending = [];
cdp.on('Page.screencastFrame', (f) => {
  const file = `${OUT}/${String(frames.length).padStart(5, '0')}.jpg`;
  pending.push(fs.promises.writeFile(file, Buffer.from(f.data, 'base64')));
  frames.push({ file, t: f.metadata.timestamp * 1000 });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
const sync = await page.evaluate(() => { const r = window.__realNow(); window.__start(); return { real: r }; });
const realStart = Date.now() - (Date.now() - sync.real);
const at = async (v) => { const wait = realStart + (v * 1000) / RATE - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); };

/* cursor helpers (positions in stage px, durations in video seconds).
   The stage animates the visible cursor; real mouse events follow the same path for hover effects. */
let cur = { x: 1700, y: 700 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function glide(to, dur) {
  const from = { ...cur };
  await page.evaluate(([x, y, d]) => { window.__glide(x, y, d); }, [to.x, to.y, dur]);
  const t0 = Date.now(), total = (dur * 1000) / RATE;
  for (;;) {
    const u = Math.min(1, (Date.now() - t0) / total);
    const k = ease(u), bend = Math.sin(Math.PI * u) * 40;
    await page.mouse.move(from.x + (to.x - from.x) * k + bend * 0.3, from.y + (to.y - from.y) * k - bend * 0.2);
    if (u >= 1) break;
    await sleep(45);
  }
  cur = { ...to };
}
const pt = (sel, fx = 0.5, fy = 0.5, dx = 0, dy = 0) => page.evaluate(([s, a, b, c, d]) => window.__point(s, a, b, c, d), [sel, fx, fy, dx, dy]);
async function click() { await page.mouse.down(); await sleep(80 / RATE); await page.mouse.up(); }
const videoNow = () => ((Date.now() - realStart) * RATE) / 1000;
// every move has a deadline (v + dur): if the page was slow to answer, the glide is shortened
// wait (up to maxV video seconds) until a condition inside the site is true
const until = async (fn, maxV = 4) => {
  const end = videoNow() + maxV;
  while (videoNow() < end) {
    if (await page.evaluate(fn)) return true;
    await sleep(60);
  }
  return false;
};
const glideAt = async (v, target, dur) => {
  await at(v);
  const to = typeof target === 'function' ? await target() : target;
  await glide(to, Math.max(0.12, v + dur - videoNow()));
};

/* choreography (video seconds) */
await at(8.6);
await page.mouse.move(cur.x, cur.y);
await page.evaluate(([x, y]) => window.__showCursor(x, y), [cur.x, cur.y]);
await at(9.6);
const face = await pt('#poke', 0.5, 0.45);
await glideAt(9.65, { x: face.x - 560, y: face.y + 140 }, 0.7);
await glideAt(10.4, { x: face.x - 160, y: face.y - 360 }, 0.7);
await glideAt(11.15, { x: face.x + 420, y: face.y - 80 }, 0.7);
await glideAt(11.9, { x: face.x, y: face.y + 10 }, 0.5);
await glideAt(12.95, { x: 1600, y: 760 }, 0.4);

await glideAt(14.1, () => pt('#familyPortrait .spot[aria-label^="Shiro"]'), 0.45);
await at(14.6); await click();
await glideAt(15.6, () => pt('#familyPortrait .spot[aria-label^="Misae"]'), 0.4);
await at(16.05); await click();

await glideAt(18.2, () => pt('#groupPhoto .spot[aria-label^="Nene"]'), 0.4);
await glideAt(18.65, () => pt('.cell--nene .cell__art'), 0.35);
await at(19.05); await click();
await glideAt(19.55, () => pt('.cell--masao .cell__art'), 0.35);
await at(19.95); await click();

await glideAt(21.55, () => pt('#beamBtn'), 0.4);
await at(22.0);
await page.evaluate(() => window.__log('charge'));
await page.mouse.down();
await at(23.4);
await page.mouse.up();
await page.evaluate(() => window.__log('zap'));

await glideAt(25.25, () => pt('.polaroid:nth-child(3)'), 0.4);
await at(25.7); await click();

await glideAt(29.3, () => pt('.chip-btn[data-name="Mom"]'), 0.45);
await at(29.85); await click();
await at(31.4);
await until(() => !document.getElementById('site').contentDocument.getElementById('flowerTake').hidden, 4);
await sleep(250 / RATE);
const tTake = videoNow();
await glideAt(tTake, () => pt('#flowerTake', 0.5, 0.45), 0.42);
await at(tTake + 0.5); await click();
await glideAt(33.0, { x: 1500, y: 840 }, 0.6);

await glideAt(37.82, () => pt('#footerShiro', 0.5, 0.55), 0.3);
await at(38.15); await click();

await at(LENGTH + 0.6);
await cdp.send('Page.stopScreencast');
const events = await page.evaluate(() => window.__events);
await browser.close();
await Promise.all(pending);

/* re-time frames to video time and encode */
const vt = (t) => ((t - realStart) * RATE) / 1000;
const list = [];
let fi = 0;
for (let n = 0; n < LENGTH * FPS; n++) {
  const T = n / FPS;
  while (fi + 1 < frames.length && vt(frames[fi + 1].t) <= T) fi++;
  list.push(`file '${frames[fi].file}'\nduration ${1 / FPS}`);
}
fs.writeFileSync('frames.txt', list.join('\n') + `\nfile '${frames[fi].file}'\n`);
fs.writeFileSync('events.json', JSON.stringify(events, null, 1));
console.log(`captured ${frames.length} frames, ${(frames.length / (LENGTH / RATE)).toFixed(1)} real fps, ${(frames.length / LENGTH).toFixed(1)} video fps`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-r', String(FPS), '-t', String(LENGTH),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'showcase-silent.mp4'], { stdio: 'inherit' });
console.log('wrote showcase-silent.mp4');
