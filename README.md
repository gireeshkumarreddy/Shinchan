# Ora! Shin-chan fan website

> **This is the `lite` branch: code only, without the images or the hero video.**
> To run the full experience, add these files (or use the [`main`](https://github.com/gireeshkumarreddy/Shinchan/tree/main) branch, which has everything):
>
> - `assets/hero.mp4` (hero intro video), `assets/hero-poster.jpg`, `assets/hero-end.jpg`
> - `assets/flowers-poster.jpg`, `assets/shin-peek.png`
> - `assets/cast/`: `family`, `group`, `actionkamen`, `kazama`, `nene`, `masao`, `bochan`, `shiro`, `himawari`, `principal`, `matsuzaka`, `nanako` (`.webp`)

An interactive fan landing page for Crayon Shin-chan. Shin-chan tears through a bright yellow page, says hi, and then keeps an eye on you: his head and eyes follow your cursor.

Watch the 40-second walkthrough: [`shinchan-showcase.mp4`](shinchan-showcase.mp4)

## Highlights

- **Paper-tear hero**: a colour-graded intro video, choreographed with the headline and a camera move.
- **Living face rig**: after the intro, a WebGL rig redraws Shin-chan's head so it turns toward the cursor, blinks, glances around when idle and blushes when you hover his face.
- **The whole cast is interactive**: an explorable Nohara family portrait (everyone has a signature move), the Kasukabe Defense Force with a linked group photo, Action Kamen's chargeable Action Beam, flip-over polaroids of the grown-ups, and eyes across the page that follow your cursor.
- **Flower delivery**: name someone, Shin-chan shyly brings them a bouquet, you take it, and you get a link (`?flowers=Name`) that replays the delivery for them.
- Sticky notes you can drag, a pinned horizontal timeline, a sign-up card with a peeking Shin-chan, and full mobile layouts.

## Run it

Open `index.html` in a browser. It needs an internet connection for the fonts, icons and GSAP.

Or serve it locally (byte ranges included, so videos can seek):

```bash
node video-tools/serve.mjs
```

Then visit http://127.0.0.1:5173.

## Structure

```
index.html            page markup
css/styles.css        all styles
js/main.js            hero choreography, scrolling effects, sign-up form
js/rig.js             WebGL face rig + behaviour (springs, gaze, blinking)
js/rig-data.js        rig textures and geometry (generated from the hero video)
js/cast.js            family, friends, Action Kamen, polaroids, eye glints
js/cast-data.js       cast eye and hotspot data (generated)
js/flowers.js         flower delivery
assets/               videos, posters and character cut-outs
video-tools/          scripts that recorded the showcase video
```

Built with HTML, CSS, vanilla JavaScript, WebGL and GSAP.

## Credits

A fan-made tribute. Crayon Shin-chan © Yoshito Usui / Futabasha, Shin-Ei Animation and TV Asahi. This project is not affiliated with them.
