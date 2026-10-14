/*
 * Shin-chan face rig.
 *
 * The hero video ends on a still frame. This module redraws the head from that frame with
 * WebGL so it can keep living: the head turns (a smooth warp driven by two weight maps),
 * the eyes are separate sprites that follow the cursor, blink and catch the light, and the
 * cheeks can blush. All textures come from rig-data.js as data URIs, so WebGL can read
 * them even when the page is opened straight from disk.
 *
 * ShinRig   = the renderer (one per canvas)
 * RigBrain  = the behaviour (springs, gaze, blinking, idle glances, blush)
 */
(function (global) {
  'use strict';

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFace, uEye, uMaps, uMask;
uniform vec4 uCrop;            // crop rect in video pixels
uniform vec2 uPivot;           // neck pivot for the head tilt
uniform vec4 uAmp;             // full-turn travel: head x, face x, head y, face y
uniform vec2 uEyeAmp;          // extra eye travel inside the sockets
uniform vec2 uHlAmp;           // catch-light travel inside the eye
uniform float uYaw, uPitch, uRoll, uBlink, uBlush, uPx, uMaskMode;
uniform vec2 uGaze;
uniform vec2 uEye0, uEye1, uCheek0, uCheek1;
uniform vec3 uHl0, uHl1;

vec2 toUv(vec2 p) { return (p - uCrop.xy) / uCrop.zw; }
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
vec2 travel(vec3 m) { return vec2(uYaw * (uAmp.x * m.r + uAmp.y * m.g), uPitch * (uAmp.z * m.r + uAmp.w * m.g)); }

// where a point of the still frame ends up after the head moves
vec2 forward(vec2 p) {
  vec3 m = texture2D(uMaps, toUv(p)).rgb;
  return uPivot + rot(p - uPivot, uRoll * m.r) + travel(m);
}

vec3 blush(vec3 col, vec2 s, vec2 c) {
  vec2 d = s - c;
  float r = length(d / vec2(46.0, 25.0));
  float skin = 1.0 - smoothstep(0.06, 0.16, distance(col, vec3(0.961, 0.769, 0.596)));
  float base = (1.0 - smoothstep(0.42, 1.0, r)) * skin * uBlush;
  col = mix(col, vec3(0.99, 0.50, 0.50), base * 0.55);
  float t = dot(d, normalize(vec2(1.0, 0.62)));
  float f = abs(fract(t / 12.0 + 0.5) - 0.5) * 12.0;
  float stroke = (1.0 - smoothstep(1.0, 2.2, f)) * (1.0 - smoothstep(0.5, 0.72, r)) * step(abs(t), 18.0);
  return mix(col, vec3(0.86, 0.24, 0.28), stroke * skin * uBlush * 0.85);
}

vec3 eye(vec3 col, vec2 p, vec2 c0, vec3 hl, float side) {
  vec2 cd = forward(c0) + uGaze * uEyeAmp;
  float scx = 1.0 - 0.13 * uYaw * side;              // far eye foreshortens a little
  float scy = max(1.0 - 0.88 * uBlink, 0.075);
  vec2 d = (p - cd) / vec2(scx, scy);
  if (dot(d, d) > 3700.0) return col;
  vec2 sp = c0 + d;
  float a = texture2D(uMaps, toUv(sp)).b;
  col = col * (1.0 - a) + texture2D(uEye, toUv(sp)).rgb;   // eye sprite is premultiplied
  vec2 hc = cd + (hl.xy - c0) * vec2(scx, 1.0) + uGaze * uHlAmp;
  float r = length((p - hc) / vec2(scx, scy));
  float vis = (1.0 - smoothstep(0.28, 0.5, uBlink)) * smoothstep(0.6, 0.95, a);
  float ring = 1.0 - smoothstep(hl.z + 1.3 - uPx, hl.z + 1.3 + uPx, r);
  float core = 1.0 - smoothstep(hl.z - 0.5 - uPx, hl.z - 0.5 + uPx, r);
  col = mix(col, vec3(0.09, 0.07, 0.06), (ring - core) * vis * 0.7);
  return mix(col, vec3(0.995, 0.99, 0.98), core * vis);
}

void main() {
  vec2 p = uCrop.xy + vUv * uCrop.zw;
  vec3 m = texture2D(uMaps, vUv).rgb;
  vec2 s = uPivot + rot(p - uPivot, -uRoll * m.r) - travel(m);
  vec3 col = texture2D(uFace, toUv(s)).rgb;
  if (uBlush > 0.002) { col = blush(col, s, uCheek0); col = blush(col, s, uCheek1); }
  col = eye(col, p, uEye0, uHl0, -1.0);
  col = eye(col, p, uEye1, uHl1, 1.0);
  float alpha;
  if (uMaskMode > 0.5) {
    alpha = texture2D(uMask, toUv(s)).r;
  } else {
    vec2 e = min(vUv, 1.0 - vUv) * uCrop.zw;
    alpha = smoothstep(0.0, 14.0, min(e.x, e.y));
  }
  gl_FragColor = vec4(col * alpha, alpha);
}`;

  const DEFAULT_AMP = { head: [16, 8], face: [22, 12], eye: [7, 5], highlight: [10, 8] };

  class ShinRig {
    constructor(canvas, data, opts = {}) {
      this.canvas = canvas;
      this.data = data;
      this.mask = !!opts.mask;
      this.amp = Object.assign({}, DEFAULT_AMP, opts.amp);
      this.scale = 1;
      this.ready = false;
    }

    async init() {
      const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
        || this.canvas.getContext('experimental-webgl');
      if (!gl) return false;
      this.gl = gl;
      const imgs = await Promise.all(['face', 'eye', 'maps', 'mask'].map((k) => loadImage(this.data.tex[k])));
      const prog = program(gl, VERT, FRAG);
      if (!prog) return false;
      this.prog = prog;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      ['uFace', 'uEye', 'uMaps', 'uMask'].forEach((name, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgs[i]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(prog, name), i);
      });
      const u = (n) => gl.getUniformLocation(prog, n);
      this.u = {};
      ['uCrop', 'uPivot', 'uAmp', 'uEyeAmp', 'uHlAmp', 'uYaw', 'uPitch', 'uRoll', 'uBlink', 'uBlush', 'uPx',
        'uMaskMode', 'uGaze', 'uEye0', 'uEye1', 'uCheek0', 'uCheek1', 'uHl0', 'uHl1'].forEach((n) => { this.u[n] = u(n); });
      const d = this.data;
      gl.uniform4f(this.u.uCrop, d.crop[0], d.crop[1], d.crop[2], d.crop[3]);
      gl.uniform2f(this.u.uPivot, d.pivot[0], d.pivot[1]);
      gl.uniform4f(this.u.uAmp, this.amp.head[0], this.amp.face[0], this.amp.head[1], this.amp.face[1]);
      gl.uniform2f(this.u.uEyeAmp, this.amp.eye[0], this.amp.eye[1]);
      gl.uniform2f(this.u.uHlAmp, this.amp.highlight[0], this.amp.highlight[1]);
      gl.uniform2f(this.u.uEye0, d.eyes[0].c[0], d.eyes[0].c[1]);
      gl.uniform2f(this.u.uEye1, d.eyes[1].c[0], d.eyes[1].c[1]);
      gl.uniform3f(this.u.uHl0, d.eyes[0].hl[0], d.eyes[0].hl[1], d.eyes[0].hl[2]);
      gl.uniform3f(this.u.uHl1, d.eyes[1].hl[0], d.eyes[1].hl[1], d.eyes[1].hl[2]);
      gl.uniform2f(this.u.uCheek0, d.cheeks[0][0], d.cheeks[0][1]);
      gl.uniform2f(this.u.uCheek1, d.cheeks[1][0], d.cheeks[1][1]);
      gl.uniform1f(this.u.uMaskMode, this.mask ? 1 : 0);
      gl.clearColor(0, 0, 0, 0);
      this.ready = true;
      this.resize(this.scale);
      return true;
    }

    /* scale = on-screen CSS pixels per video pixel */
    resize(scale) {
      this.scale = scale;
      if (!this.ready) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(this.data.crop[2] * scale * dpr));
      const h = Math.max(2, Math.round(this.data.crop[3] * scale * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.gl.viewport(0, 0, w, h);
      this.gl.uniform1f(this.u.uPx, 1 / Math.max(scale * dpr, 0.05));
    }

    render(p) {
      if (!this.ready) return;
      const gl = this.gl, u = this.u;
      gl.uniform1f(u.uYaw, p.yaw);
      gl.uniform1f(u.uPitch, p.pitch);
      gl.uniform1f(u.uRoll, p.roll);
      gl.uniform1f(u.uBlink, p.blink);
      gl.uniform1f(u.uBlush, p.blush);
      gl.uniform2f(u.uGaze, p.gx, p.gy);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  /* ------------------------------------------------------------------ behaviour */

  const spring = () => ({ x: 0, v: 0 });
  function step(s, target, k, c, dt) {
    const a = k * (target - s.x) - c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  class RigBrain {
    /**
     * getAnchor() -> { x, y, w, h } of the face on screen (CSS px)
     * pointer     -> shared { x, y, active, last } object
     */
    constructor(opts) {
      this.getAnchor = opts.getAnchor;
      this.pointer = opts.pointer;
      this.reach = opts.reach || { x: 0.42, y: 0.45 };
      this.calm = !!opts.calm;                 // reduced motion: eyes only, gentle head
      this.yaw = spring(); this.pitch = spring(); this.roll = spring();
      this.gx = spring(); this.gy = spring(); this.blushS = spring();
      this.bias = { pitch: 0, gy: 0 };
      this.blushBoost = 0;
      this.neutral = false;
      this.blinkAt = 0; this.blinkStart = -10; this.double = false; this.blinkV = 0;
      this.glanceAt = 0; this.glance = { yaw: 0, pitch: 0 };
      this.prevYawT = 0;
      this.pose = { yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, blink: 0, blush: 0 };
    }

    blinkNow(t) { if (t - this.blinkStart > 0.35) { this.blinkStart = t; this.double = Math.random() < 0.2; } }

    update(dt, t) {
      const P = this.pointer;
      const a = this.getAnchor();
      let yawT = 0, pitchT = 0, gxT = 0, gyT = 0, hovering = false;
      const idle = !P.active || t - P.last > 4.2;

      if (this.neutral) {
        // hold still, looking straight out of the page
      } else if (!idle) {
        const dx = (P.x - a.x) / Math.max(300, innerWidth * this.reach.x);
        const dy = (P.y - a.y) / Math.max(240, innerHeight * this.reach.y);
        yawT = Math.tanh(dx * 1.25);
        pitchT = Math.tanh(dy * 1.25);
        gxT = Math.tanh(dx * 1.9);
        gyT = Math.tanh(dy * 1.9);
        hovering = Math.abs(P.x - a.x) < a.w * 0.42 && Math.abs(P.y - a.y) < a.h * 0.45;
      } else {
        // idle: curious glances around the room, often back at you
        if (t > this.glanceAt) {
          const center = Math.random() < 0.35;
          this.glance = center ? { yaw: 0, pitch: 0 } : { yaw: rand(-0.75, 0.75), pitch: rand(-0.35, 0.45) };
          this.glanceAt = t + rand(1.1, 2.8);
        }
        yawT = this.glance.yaw; pitchT = this.glance.pitch;
        gxT = clamp(this.glance.yaw * 1.3, -1, 1); gyT = clamp(this.glance.pitch * 1.3, -1, 1);
      }

      if (!this.neutral) {
        pitchT = clamp(pitchT + this.bias.pitch, -1, 1);
        gyT = clamp(gyT + this.bias.gy, -1, 1);
      }

      // a big head turn usually comes with a blink
      if (Math.abs(yawT - this.prevYawT) > 0.85) this.blinkNow(t);
      this.prevYawT = yawT;

      const head = this.calm ? 0.3 : 1;
      const breathe = this.calm || this.neutral ? 0 : 1;
      const kH = this.neutral ? 140 : 62, cH = this.neutral ? 24 : 11.5;
      step(this.yaw, yawT * head, kH, cH, dt);
      step(this.pitch, pitchT * head + Math.sin(t * 1.35) * 0.035 * breathe, kH, cH, dt);
      step(this.roll, (yawT * 0.05 * head) + Math.sin(t * 0.8) * 0.006 * breathe, 48, 10, dt);
      step(this.gx, gxT, 320, 30, dt);
      step(this.gy, gyT, 320, 30, dt);
      const blushT = Math.max(hovering ? 1 : 0, this.blushBoost);
      step(this.blushS, blushT, 18, 7.5, dt);

      // blinking: close fast, open a little slower, sometimes twice
      if (t > this.blinkAt && !this.neutral) { this.blinkNow(t); this.blinkAt = t + rand(2.3, 5.6); }
      const ph = t - this.blinkStart;
      const one = (q) => (q < 0 ? 0 : q < 0.07 ? q / 0.07 : q < 0.11 ? 1 : q < 0.23 ? 1 - (q - 0.11) / 0.12 : 0);
      const blink = Math.max(one(ph), this.double ? one(ph - 0.3) : 0);

      const o = this.pose;
      o.yaw = this.yaw.x; o.pitch = this.pitch.x; o.roll = this.roll.x;
      o.gx = this.gx.x; o.gy = this.gy.x; o.blink = blink; o.blush = clamp(this.blushS.x, 0, 1);
      return o;
    }

    isNeutral() {
      return Math.abs(this.yaw.x) + Math.abs(this.pitch.x) + Math.abs(this.roll.x) * 10 +
        Math.abs(this.gx.x) * 0.5 + Math.abs(this.gy.x) * 0.5 < 0.02;
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function program(gl, vs, fs) {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const v = make(gl.VERTEX_SHADER, vs), f = make(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
    return p;
  }

  global.ShinRig = ShinRig;
  global.RigBrain = RigBrain;
})(window);
