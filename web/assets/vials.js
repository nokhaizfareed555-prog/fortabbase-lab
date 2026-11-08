/* Home page: blood collection tube cards on a turning arc.
   Page scroll turns the arc; the arrows, dragging and tapping a card add to it. */
(function () {
  const STEP = 17.2 * Math.PI / 180, RADIUS = 4.4;
  let stop = null;
  window.FA_VIALS = {
    mount() {
      if (stop) stop();
      const root = document.querySelector("#vials .vc");
      if (!root) return;
      const stage = root.querySelector(".vc-stage"), cards = [...root.querySelectorAll(".vc-card")], n = cards.length;
      if (!n) return;
      const ac = new AbortController(), on = (t, ev, fn, o) => t.addEventListener(ev, fn, { signal: ac.signal, ...o });
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const span = Math.min(n - 1, 5), edge = Math.min(3.1, n / 2 - .1);
      let R = 1000, manual = 0, target = 0, pos = 0, raf = 0, moved = false;
      const scrollPart = () => {
        if (still) return 0;
        const r = root.getBoundingClientRect(), vh = innerHeight, p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
        return (p - .5) * span;
      };
      const wrap = (i, p) => { const v = (i - p + n / 2) % n; return (v < 0 ? v + n : v) - n / 2; };
      const paint = () => {
        cards.forEach((c, i) => {
          const d = wrap(i, pos), m = Math.abs(d), a = d * STEP;
          if (m > edge) { c.style.visibility = "hidden"; return; }
          c.style.visibility = "visible";
          c.style.opacity = Math.min(1, (edge - m) / .5);
          c.style.zIndex = 100 - Math.round(m * 10);
          c.style.transform = `translate3d(${(R * Math.sin(a)).toFixed(1)}px,${(R * (1 - Math.cos(a))).toFixed(1)}px,0) rotate(${(a * 180 / Math.PI).toFixed(2)}deg)`;
          c.style.setProperty("--inx", (-Math.sign(d) * Math.min(1, m) * 18).toFixed(1) + "px");
        });
      };
      const tick = () => {
        raf = 0;
        const gap = target - pos;
        if (still || Math.abs(gap) < .001) pos = target; else { pos += gap * .13; raf = requestAnimationFrame(tick); }
        paint();
      };
      const go = () => { target = scrollPart() + manual; if (!raf) raf = requestAnimationFrame(tick); };
      const size = () => { R = cards[0].offsetWidth * RADIUS; paint(); };
      const moveTo = (t) => { manual += t - target; go(); };
      const closeAll = (but) => cards.forEach((c) => c !== but && c.classList.remove("open"));
      const arrow = (dir) => { closeAll(); moveTo(Math.round(target) + dir); };
      on(root.querySelector(".vc-arr.prev"), "click", () => arrow(-1));
      on(root.querySelector(".vc-arr.next"), "click", () => arrow(1));
      on(root, "keydown", (ev) => { if (ev.key === "ArrowLeft") arrow(-1); else if (ev.key === "ArrowRight") arrow(1); });
      cards.forEach((c, i) => {
        const pick = () => {
          const d = wrap(i, target);
          closeAll(c);
          if (Math.abs(d) > .5) { moveTo(target + d); c.classList.add("open"); } else c.classList.toggle("open");
        };
        on(c, "click", () => { if (!moved) pick(); });
        on(c, "keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
      });
      /* Dragging sideways turns the arc. Vertical movement stays with the page. */
      let startX = null, startM = 0, id = null;
      on(stage, "pointerdown", (ev) => { startX = ev.clientX; startM = manual; id = ev.pointerId; moved = false; });
      on(stage, "pointermove", (ev) => {
        if (startX === null || ev.pointerId !== id) return;
        const dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) > 8) { moved = true; try { stage.setPointerCapture(id); } catch {} closeAll(); }
        if (moved) { manual = startM - dx / (R * Math.sin(STEP)); go(); }
      });
      const end = () => { if (startX === null) return; startX = null; if (moved) { moveTo(Math.round(target)); setTimeout(() => { moved = false; }, 0); } };
      on(stage, "pointerup", end); on(stage, "pointercancel", end);
      on(window, "scroll", go, { passive: true });
      on(window, "resize", () => { size(); go(); }, { passive: true });
      size(); target = pos = scrollPart(); paint();
      stop = () => { ac.abort(); if (raf) cancelAnimationFrame(raf); stop = null; };
    },
  };
})();
