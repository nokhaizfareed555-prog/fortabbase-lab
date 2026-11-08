/* Home page DNA section: a glowing double helix drawn on a canvas and driven by the scroll position.
   Loaded only when the section is on the page. It draws only while the scroll position is changing. */
(function () {
  const TAU = Math.PI * 2, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), mix = (a, b, t) => a + (b - a) * t;
  const PAIR = { A: "T", T: "A", G: "C", C: "G" }, BASES = "ATGC";
  const HOT = ["#ff9a3c", "#ffb45e", "#ffd7a1"], RED = "#ff3a22", COOL = ["#38a3ff", "#79cdff", "#c2e8ff"];
  const rnd = (k, j) => { const x = Math.sin(k * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  let unmount = null;

  /* Tiles are drawn once to small images, so each frame only copies them */
  function sprites() {
    const S = 72, out = { tile: {}, soft: {} }, make = () => { const c = document.createElement("canvas"); c.width = c.height = S; return [c, c.getContext("2d")]; };
    [...HOT, RED, ...COOL].forEach((col) => {
      [..."ATGC", "#"].forEach((ch) => {
        const [c, g] = make(), m = 15, w = S - m * 2;
        g.shadowColor = col; g.shadowBlur = 13; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3.5;
        g.beginPath(); g.roundRect(m, m, w, w, 7);
        if (ch === "#") g.fill();
        else { g.globalAlpha = .16; g.fill(); g.globalAlpha = 1; g.stroke(); g.font = "800 29px ui-monospace,Menlo,Consolas,monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.shadowBlur = 5; g.fillText(ch, S / 2, S / 2 + 1); }
        out.tile[col + ch] = c;
      });
      const [c, g] = make(), r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      r.addColorStop(0, col); r.addColorStop(.45, col + "88"); r.addColorStop(1, col + "00");
      g.fillStyle = r; g.fillRect(0, 0, S, S); out.soft[col] = c;
    });
    return out;
  }

  function mount() {
    if (unmount) unmount();
    const sec = document.getElementById("dna"), cv = sec && sec.querySelector(".dna-cv");
    if (!cv) return;
    const ctx = cv.getContext("2d"), SP = sprites(), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = document.documentElement.classList.contains("lite"), steps = [...sec.querySelectorAll(".dna-steps li")], rtl = document.documentElement.dir === "rtl";
    const dust = Array.from({ length: 80 }, (_, i) => ({ x: rnd(i, 1), y: rnd(i, 2), d: .3 + rnd(i, 3) * .7 }));
    let W = 0, H = 0, cur = still ? .45 : 0, target = cur, raf = 0, shown = -1;
    sec.classList.toggle("dna-still", still);

    function size() {
      const r = cv.parentElement.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, lite ? 1 : r.width < 700 ? 1.35 : 2);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(p) {
      const tall = W < H * .85, wob = Math.sin(p * Math.PI);
      const zoom = mix(.9, 1.4, wob * wob * (3 - 2 * wob)) * mix(1, 1.12, p);
      const R = (tall ? W * .3 : Math.min(H * .31, W * .2)) * zoom, F = R * 4.2;
      const cx = tall ? W * .5 : W * (rtl ? .3 : .7), cy = H * (tall ? .3 : .5);
      const tilt = mix(-.4, .3, p), ax = Math.sin(tilt), ay = Math.cos(tilt), ux = ay, uy = -ax;
      const dy = R * .26, offset = p * 22, twist = .3, spin = p * Math.PI * 1.5;
      const reach = Math.min(lite || tall ? 28 : 40, Math.ceil(Math.hypot(W, H) / dy / 2) + 3), first = Math.floor(offset) - reach, last = Math.floor(offset) + reach;
      const paths = [], items = [], perRung = tall || lite ? 7 : 9, fade = (a) => clamp(1.15 - Math.abs(a) / (Math.hypot(W, H) * .62));

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .8);
      bg.addColorStop(0, "#0b1a4a"); bg.addColorStop(.55, "#070c2c"); bg.addColorStop(1, "#04051a");
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#bcd9ff";
      dust.forEach((d) => { const y = ((d.y - p * d.d * .6) % 1 + 1) % 1; ctx.globalAlpha = .12 + d.d * .4; const s = d.d * 1.8; ctx.fillRect(d.x * W, y * H, s, s); });

      const place = (a, off, z) => { const s = F / (F + z), x = cx + (ax * a + ux * off) * s, y = cy + (ay * a + uy * off) * s; return [x, y, s]; };

      /* the two blue strands */
      for (const sign of [1, -1]) {
        const stepK = lite ? .5 : .25, path = [];
        paths.push(path);
        for (let k = first; k < last; k += stepK) {
          const pt = (q) => { const a = (q - offset) * dy, th = q * twist + spin; return { a, z: sign * R * Math.sin(th), p: place(a, sign * R * Math.cos(th), sign * R * Math.sin(th)) }; };
          const A = pt(k), B = pt(k + stepK);
          path.push(A.p);
          items.push({ z: (A.z + B.z) / 2, line: [A.p[0], A.p[1], B.p[0], B.p[1]], s: A.p[2], a: fade(A.a) });
        }
      }

      /* the rungs: one glowing tile at a time, paired letters on each half */
      for (let k = first; k <= last; k++) {
        const a = (k - offset) * dy, th = k * twist + spin, co = Math.cos(th), si = Math.sin(th), base = BASES[Math.floor(rnd(k, 0) * 4)];
        const hot = Math.exp(-Math.pow((k - offset) / 5.5, 2)), alpha = fade(a);
        for (let j = -perRung; j <= perRung; j++) {
          if (!j) continue;
          const f = (j - Math.sign(j) * .5) / perRung * .93, off = f * R * co, z = f * R * si, r = rnd(k, j);
          const pool = r < hot ? HOT : COOL;
          let col = pool[Math.floor(rnd(j, k) * 3)];
          if (pool === HOT && rnd(k + Math.floor(p * 26), j) > .9) col = RED;
          const solid = rnd(j * 3, k) > .62, ch = solid ? "#" : j > 0 ? base : PAIR[base];
          items.push({ z, tile: [a, off, col, ch], a: alpha });
        }
      }

      /* soft glow along each strand, as one continuous line */
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1677ff";
      for (const [w, al] of [[.24, .07], [.13, .12]]) {
        ctx.lineWidth = R * w; ctx.globalAlpha = al;
        paths.forEach((pts) => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); });
      }

      items.sort((x, y) => y.z - x.z);
      for (const it of items) {
        const depth = clamp((it.z + R) / (2 * R));   // 0 = nearest, 1 = farthest
        if (it.line) {
          const l = it.line;
          ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "butt";
          ctx.strokeStyle = "#5cb8ff"; ctx.globalAlpha = (.95 - depth * .6) * it.a; ctx.lineWidth = R * .042 * it.s;
          ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke();
          continue;
        }
        const [a, off, col, ch] = it.tile, [x, y, s] = place(a, off, it.z);
        if (x < -60 || x > W + 60 || y < -60 || y > H + 60 || it.a <= 0) continue;
        const sz = R * (1.55 / perRung) * s, focus = Math.abs(it.z) / R * .75 + Math.abs(a) / (R * 3.4);
        if (focus > .82) {
          ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = clamp(.72 - depth * .4) * it.a;
          const b = sz * 1.15; ctx.drawImage(SP.soft[col], x - b / 2, y - b / 2, b, b);
        } else {
          ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = clamp(1 - depth * .55) * it.a;
          ctx.drawImage(SP.tile[col + ch], x - sz / 2, y - sz / 2, sz, sz);
        }
      }
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }

    function paint() {
      draw(cur);
      sec.style.setProperty("--dna-p", cur.toFixed(4));
      const i = Math.min(steps.length - 1, Math.floor(cur * steps.length));
      if (i !== shown) { steps.forEach((s, n) => s.classList.toggle("on", n === i)); shown = i; }
    }
    function tick() {
      cur += (target - cur) * .16;
      if (Math.abs(target - cur) < .0004) { cur = target; raf = 0; paint(); return; }
      paint(); raf = requestAnimationFrame(tick);
    }
    function read() {
      const r = sec.getBoundingClientRect(), room = r.height - parseFloat(getComputedStyle(sec).paddingBottom) - cv.parentElement.offsetHeight;
      target = clamp(room > 0 ? -r.top / room : 0);
      if (!raf && target !== cur) raf = requestAnimationFrame(tick);
    }
    const onSize = () => { size(); if (!still) { read(); cur = target; } paint(); };
    const ro = new ResizeObserver(onSize);
    size(); if (!still) { read(); cur = target; addEventListener("scroll", read, { passive: true }); }
    paint(); ro.observe(cv.parentElement);
    unmount = () => { removeEventListener("scroll", read); ro.disconnect(); cancelAnimationFrame(raf); unmount = null; };
  }

  window.FA_DNA = { mount };
})();
