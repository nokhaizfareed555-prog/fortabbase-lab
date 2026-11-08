/* Home page DNA section: a glowing double helix drawn on a canvas and driven by the scroll position.
   Loaded only when the section is on the page. It draws only while the scroll position is changing. */
(function () {
  const TAU = Math.PI * 2, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), mix = (a, b, t) => a + (b - a) * t;
  const PAIR = { A: "T", T: "A", G: "C", C: "G" }, BASES = "ATGC";
  /* The frosted glass background is light, so the helix uses deeper colors and normal blending there. */
  const DARK = { HOT: ["#ff9a3c", "#ffb45e", "#ffd7a1"], RED: "#ff3a22", COOL: ["#38a3ff", "#79cdff", "#c2e8ff"], strand: "#5cb8ff", halo: "#1677ff", blend: "lighter" };
  const LIGHT = { HOT: ["#d9480f", "#e8590c", "#f76707"], RED: "#d81f26", COOL: ["#0a4fa3", "#0b63c5", "#1677ff"], strand: "#0b63c5", halo: "#1677ff", blend: "source-over" };
  const rnd = (k, j) => { const x = Math.sin(k * 127.1 + j * 311.7) * 43758.5453; return x - Math.floor(x); };
  let unmount = null;

  /* Tiles are drawn once to small images, so each frame only copies them */
  function sprites({ HOT, RED, COOL }) {
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

  /* ---- Glass helix (WebGL2, no libraries) ----
     Clear rippled glass in a studio light, modelled on the owner's reference. Pointer light: pieces near the cursor
     warm to orange, with a small bright pearl riding on the glass. Each piece is drawn back to front so the glass
     layers correctly. Like the old version it only draws while something is moving. */
  const VS_GLASS = `#version 300 es
  in vec3 aPos, aNor, aCen; in float aKind;
  uniform vec2 uC, uHalf, uAxis; uniform float uR, uF, uSpin, uSlide;
  out vec3 vL, vN, vCen, vView; out float vKind;
  void main(){
    float c=cos(uSpin), s=sin(uSpin);
    vec3 p=vec3(aPos.x*c-aPos.z*s, aPos.y-uSlide, aPos.x*s+aPos.z*c);
    vec3 v=uR*vec3(uAxis.x*p.y+uAxis.y*p.x, uAxis.y*p.y-uAxis.x*p.x, p.z);
    float w=(uF+v.z)/uF;
    gl_Position=vec4((uC.x*w+v.x)/uHalf.x, -(uC.y*w+v.y)/uHalf.y, 0., w);
    vL=aPos; vN=aNor; vCen=aCen; vKind=aKind; vView=vec3(v.x, -v.y, -(v.z+uF));
  }`;
  const FS_GLASS = `#version 300 es
  precision highp float;
  in vec3 vL, vN, vCen, vView; in float vKind; out vec4 o;
  uniform float uSpin, uBack, uGlow; uniform vec2 uAxis; uniform vec3 uL1, uL2;
  float hs(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(hs(i),hs(i+vec3(1,0,0)),f.x),mix(hs(i+vec3(0,1,0)),hs(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hs(i+vec3(0,0,1)),hs(i+vec3(1,0,1)),f.x),mix(hs(i+vec3(0,1,1)),hs(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float ht(vec3 p){ float w=vn(p*2.6); float h=vn(p*5.+w*2.2)*.62+vn(p*12.+w*3.)*.28;
    #ifndef LITE
    h+=vn(p*27.)*.1;
    #endif
    return h; }
  vec3 rot(vec3 n){ float c=cos(uSpin), s=sin(uSpin); vec3 r=vec3(n.x*c-n.z*s,n.y,n.x*s+n.z*c);
    vec3 v=vec3(uAxis.x*r.y+uAxis.y*r.x, uAxis.y*r.y-uAxis.x*r.x, r.z); return vec3(v.x,-v.y,-v.z); }
  /* The studio: a pale room, big soft windows, dark flags at the sides that give glass its black lines */
  vec3 env(vec3 d){
    float up=d.y*.5+.5;
    vec3 c=mix(vec3(.74,.78,.83),vec3(.98,.99,1.),smoothstep(.15,.85,up));
    float b=abs(d.x*1.15+d.y*.35);
    c=mix(c,vec3(.36,.5,.65),smoothstep(.58,.76,b)*.85);
    c=mix(c,vec3(.05,.08,.12),smoothstep(.9,1.1,b)*.8);
    c+=vec3(1.3)*smoothstep(.93,.985,dot(d,normalize(vec3(-.42,.62,.66))));
    c+=vec3(.75,.85,1.)*smoothstep(.95,.99,dot(d,normalize(vec3(.6,-.25,.75))));
    return c;
  }
  void main(){
    vec3 n=normalize(vN);
    float e=.006, s=vKind>.5?1.25:1.;
    vec3 q=vL*s; float h=ht(q);
    vec3 g=vec3(ht(q+vec3(e,0,0))-h,ht(q+vec3(0,e,0))-h,ht(q+vec3(0,0,e))-h)/e;
    g-=n*dot(g,n);
    vec3 m=normalize(n-g*(vKind>.5?.05:.06));
    vec3 N=rot(m), V=normalize(-vView);
    if(uBack>.5) N=-N;
    float nv=clamp(dot(N,V),0.,1.), F=.05+.95*pow(1.-nv,3.2);
    vec3 R=reflect(-V,N), T=refract(-V,N,.72);
    if(dot(T,T)<.01) T=R;
    vec3 refl=env(R), tran=env(T*vec3(1.35,1.2,1.));
    float rip=1.-abs(2.*fract(h*7.)-1.); rip=smoothstep(.86,1.,rip)*.55;
    vec3 col=mix(tran,refl,F);
    col=mix(col,col*vec3(.26,.34,.46),rip*.5);
    float dark=1.-clamp(dot(col,vec3(.33)),0.,1.);
    float a=clamp(.1+F*.6+dark*dark*.85+rip*.16,0.,1.);
    float glint=smoothstep(.965,1.,dot(reflect(-V,N),normalize(vec3(-.38,.58,.72))));
    float gl1=dot(vCen-uL1,vCen-uL1), gl2=dot(vCen-uL2,vCen-uL2);
    float G=uGlow*max(exp(-gl1/.3),exp(-gl2/.8)*.72);
    if(G>.004){
      vec3 ramp=mix(vec3(1.,.83,.68),vec3(1.,.57,.17),smoothstep(.16,.5,G));
      ramp=mix(ramp,vec3(.98,.36,.01),smoothstep(.52,.92,G));
      float sh=.78+.26*h-.2*rip;
      vec3 warm=min(ramp*sh+vec3(.22,.14,.04)*pow(1.-nv,2.),vec3(1.,.8,.62));
      float k=smoothstep(.02,.34,G);
      col=mix(col,warm,k*.97);
      a=mix(a,max(a,.5+.47*G),k);
    }
    if(uBack>.5) a*=.36;
    o=vec4(col*a+vec3(1.)*glint*.9,clamp(a+glint*.5,0.,1.));
  }`;
  const VS_FULL = `#version 300 es
  in vec2 aP; out vec2 vU; void main(){ vU=aP*.5+.5; gl_Position=vec4(aP,0.,1.); }`;
  /* Depth of field and the pearl, in one pass */
  const FS_POST = `#version 300 es
  precision highp float;
  in vec2 vU; out vec4 o;
  uniform sampler2D uT; uniform vec2 uRes, uC, uAxis, uDot; uniform float uR, uBlur, uGlow, uPx;
  void main(){
    vec2 px=vec2(vU.x,1.-vU.y)*uRes;
    float d=abs(dot(px-uC,uAxis))/uR, r=smoothstep(1.2,2.9,d)*uBlur;
    vec4 c;
    if(r<.6) c=texture(uT,vU);
    else { c=vec4(0.); for(int i=0;i<TAPS;i++){ float t=(float(i)+.5)/float(TAPS), a=float(i)*2.39996;
      c+=texture(uT,vU+vec2(cos(a),sin(a))*sqrt(t)*r/uRes); } c/=float(TAPS); }
    if(uGlow>.01){
      float q=length(px-uDot)/uPx;
      float core=1.-smoothstep(6.,8.,q), halo=exp(-q*q/190.)*.75;
      vec4 h=vec4(vec3(1.,.62,.2)*halo,halo*.8)*uGlow; c=h+c*(1.-h.a);
      float a=core*uGlow; c=vec4(mix(c.rgb,vec3(1.,.97,.9),a),c.a+(1.-c.a)*a);
    }
    o=c;
  }`;

  /* Soft irregular wobble, so the glass looks poured rather than machined */
  const lump = (a, b) => (Math.sin(a * 1.7 + b * 2.3 + 1.1) + Math.sin(a * 3.9 - b * 1.3 + 4.2) * .6 + Math.sin(a * 7.3 + b * 4.1 + 2.6) * .3) / 1.9;

  function buildHelix(lite) {
    const TW = .3, DY = .26, K0 = -32, K1 = 54, ST = .2, SEG = 5;
    const SIDES = lite ? 12 : 20, RSIDES = lite ? 7 : 10, RRINGS = lite ? 13 : 21;
    const V = [], I = [], chunks = [];
    const centre = (q, s) => [s * Math.cos(q * TW), q * DY, s * Math.sin(q * TW)];
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const add = (p, n, c, kind) => { V.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], kind); return V.length / 10 - 1; };
    const quads = (a, rings, sides, r0, rN) => { const start = I.length; for (let r = r0; r < rN; r++) for (let j = 0; j < sides; j++) { const b = a + r * sides + j, c = a + r * sides + (j + 1) % sides, d = b + sides, e = c + sides; I.push(b, d, c, c, d, e); } return [start, I.length - start]; };
    const mid = (r0, rN, f) => f((r0 + rN) / 2);

    for (const s of [1, -1]) {
      const rings = Math.round((K1 - K0) / ST) + 1, base = V.length / 10;
      for (let r = 0; r < rings; r++) {
        const q = K0 + r * ST, c = centre(q, s), t = norm(centre(q + .01, s).map((x, i) => x - centre(q - .01, s)[i]));
        let n = [c[0], 0, c[2]]; n = norm(n.map((x, i) => x - t[i] * dot(n, t)));
        const b = cross(t, n), nearRung = Math.exp(-Math.pow(((q % 2) + 2) % 2 - 1, 2) / .05);
        for (let j = 0; j < SIDES; j++) {
          const a = j / SIDES * TAU, ca = Math.cos(a), sa = Math.sin(a), w = 1 + .13 * lump(q * .9 + s * 3, a) + .06 * lump(q * 2.4, a * 2) + .06 * nearRung;
          const rn = .125 * w, rb = .165 * w;
          const p = c.map((x, i) => x + n[i] * ca * rn + b[i] * sa * rb);
          add(p, norm(n.map((x, i) => x * ca / rn + b[i] * sa / rb)), c, 0);
        }
      }
      for (let r = 0; r + SEG < rings; r += SEG) { const [o, n] = quads(base, rings, SIDES, r, r + SEG); chunks.push({ o, n, c: centre(K0 + (r + SEG / 2) * ST, s) }); }
    }
    for (let k = K0 + 1; k < K1; k += 2) {
      const A = centre(k, 1), base = V.length / 10, axis = [A[0], 0, A[2]], len = Math.hypot(...axis), t = axis.map((x) => x / len);
      const n = [0, 1, 0], b = cross(t, n), lift = lump(k, 1.3) * .035, rungC = [0, A[1] + lift, 0];
      for (let r = 0; r < RRINGS; r++) {
        const u = r / (RRINGS - 1) * 2 - 1, e = Math.abs(u);
        const flare = Math.pow(e, 7) * .055, joint = Math.exp(-u * u / .012) * .018 - Math.exp(-Math.pow(e - .18, 2) / .006) * .008;
        for (let j = 0; j < RSIDES; j++) {
          const a = j / RSIDES * TAU, ca = Math.cos(a), sa = Math.sin(a), R0 = (.04 + flare + joint) * (1 + .2 * lump(k + u * 3.4, a));
          const c = [t[0] * u * .93, A[1] + lift * (1 - u * u), t[2] * u * .93], nn = n.map((x, i) => x * ca + b[i] * sa);
          add(c.map((x, i) => x + nn[i] * R0), nn, rungC, 1);
        }
      }
      const N = 4, parts = RRINGS - 1;
      for (let z = 0; z < N; z++) { const r0 = Math.floor(z * parts / N), rN = Math.floor((z + 1) * parts / N), [o, n2] = quads(base, RRINGS, RSIDES, r0, rN); chunks.push({ o, n: n2, c: mid(r0, rN, (m) => { const u = m / parts * 2 - 1; return [t[0] * u, A[1], t[2] * u]; }) }); }
    }
    return { v: new Float32Array(V), i: new Uint16Array(I), chunks, K0, K1, TW, DY };
  }

  function glassMount(sec, cv) {
    const gl = cv.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) return false;
    const lite = document.documentElement.classList.contains("lite"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = innerWidth < 700, cheap = lite || small, TAPS = cheap ? 14 : 30;
    const shade = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
    const prog = (vs, fs, attrs) => { const a = shade(gl.VERTEX_SHADER, vs), b = shade(gl.FRAGMENT_SHADER, fs); if (!a || !b) return null; const p = gl.createProgram(); gl.attachShader(p, a); gl.attachShader(p, b); attrs.forEach((n, i) => gl.bindAttribLocation(p, i, n)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; } const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); } return { p, u }; };
    const withDefs = (s, d) => s.replace("precision highp float;", "precision highp float;\n" + d);
    const G = prog(VS_GLASS, withDefs(FS_GLASS, cheap ? "#define LITE 1" : ""), ["aPos", "aNor", "aCen", "aKind"]), P = prog(VS_FULL, withDefs(FS_POST, `#define TAPS ${TAPS}`), ["aP"]);
    if (!G || !P) return false;

    const H_ = buildHelix(cheap), vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer(), S = 40;
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, H_.v, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, H_.i, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 1, 36]].forEach(([l, n, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, S, o); });
    const vaoQ = gl.createVertexArray(), qb = gl.createBuffer(); gl.bindVertexArray(vaoQ); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const msFb = gl.createFramebuffer(), msRb = gl.createRenderbuffer(), resFb = gl.createFramebuffer(), tex = gl.createTexture();
    const samples = Math.min(cheap ? 2 : 4, gl.getParameter(gl.MAX_SAMPLES) || 1);
    let W = 0, H = 0, BW = 0, BH = 0, dpr = 1;
    function size() {
      const r = cv.parentElement.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, lite ? 1 : r.width < 700 ? 1.5 : 2);
      W = r.width; H = r.height; BW = Math.max(1, Math.round(W * dpr)); BH = Math.max(1, Math.round(H * dpr)); cv.width = BW; cv.height = BH;
      gl.bindRenderbuffer(gl.RENDERBUFFER, msRb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, BW, BH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msFb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msRb);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, BW, BH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
      gl.bindFramebuffer(gl.FRAMEBUFFER, resFb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }

    const rtl = document.documentElement.dir === "rtl", steps = [...sec.querySelectorAll(".dna-steps li")];
    const hover = matchMedia("(hover:hover) and (pointer:fine)").matches;
    let cur = still ? .45 : 0, target = cur, raf = 0, shown = -1, last = 0, ptr = null;
    const L1 = [0, 0, 0], L2 = [0, 0, 0]; let glow = 0, glowT = 0, primed = false, dot2 = [0, 0];

    function pose(p) {
      const tall = W < H * .85, wob = Math.sin(p * Math.PI), zoom = mix(.94, 1.2, wob * wob * (3 - 2 * wob)) * mix(1, 1.06, p);
      const R = (tall ? W * .27 : Math.min(H * .215, W * .16)) * zoom, F = R * 5.5, cx = tall ? W * .5 : W * (rtl ? .29 : .71), cy = H * (tall ? .31 : .5);
      const tilt = mix(-.34, .26, p);
      return { tall, R, F, cx, cy, ax: Math.sin(tilt), ay: Math.cos(tilt), spin: p * Math.PI * 1.5, slide: p * 22 * H_.DY, offset: p * 22 };
    }
    const project = (o, x, y, z) => { const c = Math.cos(o.spin), s = Math.sin(o.spin), X = x * c - z * s, Y = y - o.slide, Z = x * s + z * c, vx = o.R * (o.ax * Y + o.ay * X), vy = o.R * (o.ay * Y - o.ax * X), vz = o.R * Z, w = (o.F + vz) / o.F; return [o.cx + vx / w, o.cy + vy / w, vz]; };

    /* The glass point closest to the pointer. Phones have no hover, so the light rests on the middle of the helix. */
    function aim(o) {
      const at = hover ? ptr : [o.cx, o.cy];
      if (!at) { glowT = 0; return; }
      const reach = o.tall ? 18 : 24, thr = hover ? o.R * .5 : Infinity;
      let best = 1e12, hit = null, real = 1e12;
      const test = (x, y, z) => { const q = project(o, x, y, z), d = Math.hypot(q[0] - at[0], q[1] - at[1]), sc = d + q[2] * .1; if (sc < best) { best = sc; real = d; hit = [x, y, z]; } };
      const f0 = Math.floor(o.offset) - reach, f1 = Math.floor(o.offset) + reach;
      for (let q = f0; q <= f1; q += .5) { const a = q * H_.TW, c = Math.cos(a), s = Math.sin(a), y = q * H_.DY; test(c, y, s); test(-c, y, -s); }
      for (let k = f0 | 1; k <= f1; k += 2) { const a = k * H_.TW, c = Math.cos(a), s = Math.sin(a), y = k * H_.DY; for (const u of [-.66, -.33, 0, .33, .66]) test(c * u, y, s * u); }
      if (real <= thr && hit) { glowT = 1; if (!primed || glow < .02) { L1.splice(0, 3, ...hit); L2.splice(0, 3, ...hit); primed = true; } aim.t = hit; } else glowT = 0;
    }

    function draw(p) {
      const o = pose(p), c = Math.cos(o.spin), s = Math.sin(o.spin);
      const order = H_.chunks.map((ch) => ({ ch, z: ch.c[0] * s + ch.c[2] * c, y: ch.c[1] - o.slide, x: ch.c[0] * c - ch.c[2] * s })).filter((e) => { const q = o.R * (o.ay * e.y - o.ax * e.x), r = o.R * (o.ax * e.y + o.ay * e.x); return Math.abs(q) < H * .92 + o.R && Math.abs(r) < W * 1.1 + o.R; }).sort((a, b) => b.z - a.z);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msFb); gl.viewport(0, 0, BW, BH); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.CULL_FACE);
      gl.useProgram(G.p); gl.bindVertexArray(vao);
      gl.uniform2f(G.u.uC, o.cx - W / 2, o.cy - H / 2); gl.uniform2f(G.u.uHalf, W / 2, H / 2); gl.uniform2f(G.u.uAxis, o.ax, o.ay);
      gl.uniform1f(G.u.uR, o.R); gl.uniform1f(G.u.uF, o.F); gl.uniform1f(G.u.uSpin, o.spin); gl.uniform1f(G.u.uSlide, o.slide); gl.uniform1f(G.u.uGlow, glow);
      gl.uniform3fv(G.u.uL1, L1); gl.uniform3fv(G.u.uL2, L2);
      for (const e of order) {
        gl.uniform1f(G.u.uBack, 1); gl.cullFace(gl.FRONT); gl.drawElements(gl.TRIANGLES, e.ch.n, gl.UNSIGNED_SHORT, e.ch.o * 2);
        gl.uniform1f(G.u.uBack, 0); gl.cullFace(gl.BACK); gl.drawElements(gl.TRIANGLES, e.ch.n, gl.UNSIGNED_SHORT, e.ch.o * 2);
      }
      gl.disable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resFb); gl.blitFramebuffer(0, 0, BW, BH, 0, 0, BW, BH, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, BW, BH); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.BLEND);
      const d = project(o, L1[0], L1[1], L1[2]);
      gl.useProgram(P.p); gl.bindVertexArray(vaoQ); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P.u.uT, 0);
      gl.uniform2f(P.u.uRes, BW, BH); gl.uniform2f(P.u.uC, o.cx * dpr, o.cy * dpr); gl.uniform2f(P.u.uAxis, o.ax, o.ay); gl.uniform2f(P.u.uDot, d[0] * dpr, d[1] * dpr);
      gl.uniform1f(P.u.uR, o.R * dpr); gl.uniform1f(P.u.uBlur, o.R * dpr * .085); gl.uniform1f(P.u.uGlow, glow); gl.uniform1f(P.u.uPx, dpr);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return o;
    }

    function paint() {
      const o = pose(cur); aim(o); if (aim.t && !raf) { L1.splice(0, 3, ...aim.t); L2.splice(0, 3, ...aim.t); glow = glowT; }
      draw(cur); sec.style.setProperty("--dna-p", cur.toFixed(4));
      const i = Math.min(steps.length - 1, Math.floor(cur * steps.length));
      if (i !== shown) { steps.forEach((s, n) => s.classList.toggle("on", n === i)); shown = i; }
    }
    function tick(t) {
      const dt = Math.min(.05, (t - (last || t - 16)) / 1000); last = t; raf = 0;
      cur += (target - cur) * (1 - Math.exp(-dt * 10.5)); if (Math.abs(target - cur) < .0004) cur = target;
      aim(pose(cur));
      if (aim.t) for (let i = 0; i < 3; i++) { L1[i] += (aim.t[i] - L1[i]) * (1 - Math.exp(-dt * 15)); L2[i] += (aim.t[i] - L2[i]) * (1 - Math.exp(-dt * 4.2)); }
      glow += (glowT - glow) * (1 - Math.exp(-dt * (glowT > glow ? 9 : 4.5))); if (Math.abs(glowT - glow) < .004) glow = glowT;
      draw(cur); sec.style.setProperty("--dna-p", cur.toFixed(4));
      const i = Math.min(steps.length - 1, Math.floor(cur * steps.length));
      if (i !== shown) { steps.forEach((s, n) => s.classList.toggle("on", n === i)); shown = i; }
      const busy = cur !== target || glow !== glowT || (aim.t && glow > 0 && (Math.abs(aim.t[0] - L2[0]) + Math.abs(aim.t[1] - L2[1]) + Math.abs(aim.t[2] - L2[2]) > .004));
      if (busy) kick(); else last = 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    function read() {
      const r = sec.getBoundingClientRect(), room = r.height - parseFloat(getComputedStyle(sec).paddingBottom) - cv.parentElement.offsetHeight;
      target = clamp(room > 0 ? -r.top / room : 0); if (target !== cur) kick();
    }
    const stick = cv.parentElement;
    const move = (e) => { if (e.pointerType === "touch" || !hover) return; const r = stick.getBoundingClientRect(); ptr = [e.clientX - r.left, e.clientY - r.top]; kick(); };
    const leave = () => { ptr = null; kick(); };
    const onSize = () => { size(); if (!still) { read(); cur = target; } paint(); };
    const ro = new ResizeObserver(onSize);
    const lost = (e) => { e.preventDefault(); if (unmount) unmount(); const n = cv.cloneNode(); cv.replaceWith(n); mount(true); };
    size(); if (!still) { read(); cur = target; addEventListener("scroll", read, { passive: true }); }
    glow = hover ? 0 : 1; glowT = glow;
    sec.classList.toggle("dna-still", still);
    stick.addEventListener("pointermove", move, { passive: true }); stick.addEventListener("pointerleave", leave);
    cv.addEventListener("webglcontextlost", lost);
    paint(); ro.observe(stick);
    unmount = () => { removeEventListener("scroll", read); stick.removeEventListener("pointermove", move); stick.removeEventListener("pointerleave", leave); cv.removeEventListener("webglcontextlost", lost); ro.disconnect(); cancelAnimationFrame(raf); unmount = null; };
    return true;
  }

  function mount(no3d) {
    if (unmount) unmount();
    const sec = document.getElementById("dna");
    let cv = sec && sec.querySelector(".dna-cv");
    if (!cv) return;
    if (!no3d && sec.classList.contains("dna-glass")) {
      let ok = false;
      try { ok = glassMount(sec, cv); } catch (e) { console.error(e); }
      if (ok) return;
      const fresh = cv.cloneNode(); cv.replaceWith(fresh); cv = fresh;   // a canvas that tried WebGL cannot switch to 2D
    }
    const glass = sec.classList.contains("dna-glass"), PAL = glass ? LIGHT : DARK, { HOT, RED, COOL } = PAL;
    const ctx = cv.getContext("2d"), SP = sprites(PAL), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
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

      if (glass) ctx.clearRect(0, 0, W, H);
      else {
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .8);
      bg.addColorStop(0, "#0b1a4a"); bg.addColorStop(.55, "#070c2c"); bg.addColorStop(1, "#04051a");
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#bcd9ff";
      dust.forEach((d) => { const y = ((d.y - p * d.d * .6) % 1 + 1) % 1; ctx.globalAlpha = .12 + d.d * .4; const s = d.d * 1.8; ctx.fillRect(d.x * W, y * H, s, s); });
      }

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
      ctx.globalCompositeOperation = PAL.blend; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = PAL.halo;
      for (const [w, al] of [[.24, .07], [.13, .12]]) {
        ctx.lineWidth = R * w; ctx.globalAlpha = al;
        paths.forEach((pts) => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); });
      }

      items.sort((x, y) => y.z - x.z);
      for (const it of items) {
        const depth = clamp((it.z + R) / (2 * R));   // 0 = nearest, 1 = farthest
        if (it.line) {
          const l = it.line;
          ctx.globalCompositeOperation = PAL.blend; ctx.lineCap = "butt";
          ctx.strokeStyle = PAL.strand; ctx.globalAlpha = (.95 - depth * .6) * it.a; ctx.lineWidth = R * .042 * it.s;
          ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke();
          continue;
        }
        const [a, off, col, ch] = it.tile, [x, y, s] = place(a, off, it.z);
        if (x < -60 || x > W + 60 || y < -60 || y > H + 60 || it.a <= 0) continue;
        const sz = R * (1.55 / perRung) * s, focus = Math.abs(it.z) / R * .75 + Math.abs(a) / (R * 3.4);
        if (focus > .82) {
          ctx.globalCompositeOperation = PAL.blend; ctx.globalAlpha = clamp(.72 - depth * .4) * it.a;
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

  window.FA_DNA = { mount: () => mount() };
})();
