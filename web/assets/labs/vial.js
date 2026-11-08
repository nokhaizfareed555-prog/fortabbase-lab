/* Labs: sample vial scroll section. A real 3D scene in plain WebGL2 with no libraries.
   The scroll position drives the story; the cube wall and the liquid keep moving on their own while the section is on screen.
   To reuse it, include vial.css and this file and put an empty <section class="vx"></section> on the page. The script fills in the words. */
(function () {
  const PATIENT = "Ayesha Khan", TEST = "Complete Blood Count", CLINIC = "Fort Abbas Poly Clinic";
  /* Scroll marks, 0 to 1. Change these to speed up or slow down a stage. */
  const T = { arrive: [0, .12], label: [.12, .23], capNear: [.24, .34], needle: [.34, .38], fill: [.38, .52], needleOut: [.52, .55], twist: [.56, .66], rock: [.67, .78], lay: [.78, .85], print: [.84, .89], end: .92 };
  const STEPS = [[0, .12], [.12, .24], [.24, .34], [.34, .55], [.55, .67], [.67, .79], [.79, .92]];

  const HINT = "Scroll down to see how we care for every sample", HINT_DONE = "Complete. Keep scrolling down to continue";
  const WORDS = [["A new tube and its cap", "Every test begins with its own clean collection tube."], ["The label goes on first", "The tube is ready to be identified before anything goes in it."], ["The cap moves into place", "Tube and cap stay together from the first step."], ["The sample is collected", "Drawn straight into the tube, with nothing in between."], ["Sealed tight", "The cap is turned until the tube is fully closed."], ["Moved with care", "A gentle motion keeps the sample evenly mixed."], ["Named and coded", "The tube carries the patient's name and a code used for this one test."]];
  const markup = () => `<div class="vx-stage"><h2 class="vx-title">How we care for every sample</h2><canvas class="vx-cv" aria-hidden="true"></canvas><div class="vx-copy">${WORDS.map(([h, t], i) => `<div class="vx-step vx-panel"><span class="vx-n">0${i + 1}</span><h3>${h}</h3><p>${t}</p></div>`).join("")}</div><div class="vx-toast" role="status"><span class="vx-dot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg></span><div><small>New test received · <span data-vx="test"></span></small><b data-vx="name"></b><code data-vx="code"></code></div></div><div class="vx-end"><h2>Every test is treated with the utmost care.</h2><p>Each sample is followed under its own code and checked against its quality parameters, so results meet expectations and, sometimes, exceed them.</p></div><div class="vx-hint"><span class="vx-hint-t">${HINT}</span><span class="vx-line" aria-hidden="true"><i></i></span></div></div>`;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t), out = (t) => 1 - Math.pow(1 - t, 3);
  const M = {
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3]; return o; },
    id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    t: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
    s: (x, y = x, z = x) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]),
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); },
    chain: (...m) => m.reduce((a, b) => M.mul(a, b)),
    pt: (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]],
  };

  /* Turns a side profile [radius, height] into a round mesh. Corners sharper than about 35 degrees stay crisp. */
  function lathe(prof, seg = 72) {
    const P = [], N = [], I = [], n = prof.length - 1, sn = [];
    for (let i = 0; i < n; i++) { const dr = prof[i + 1][0] - prof[i][0], dy = prof[i + 1][1] - prof[i][1], l = Math.hypot(dr, dy) || 1; sn.push([dy / l, -dr / l]); }
    const blend = (a, b) => { if (!b || a[0] * b[0] + a[1] * b[1] < .82) return a; const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y); return [x / l, y / l]; };
    for (let i = 0; i < n; i++) {
      const base = P.length / 3;
      [[prof[i], blend(sn[i], sn[i - 1])], [prof[i + 1], blend(sn[i], sn[i + 1])]].forEach(([p, nn]) => {
        for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2, s = Math.sin(a), c = Math.cos(a); P.push(p[0] * s, p[1], p[0] * c); N.push(nn[0] * s, nn[1], nn[0] * c); }
      });
      for (let j = 0; j < seg; j++) { const a = base + j, b = a + 1, c = base + seg + 1 + j, d = c + 1; I.push(a, b, c, b, d, c); }
    }
    return { P: new Float32Array(P), N: new Float32Array(N), I: new Uint16Array(I) };
  }
  const arc = (r, cy, steps = 14) => Array.from({ length: steps + 1 }, (_, i) => { const a = i / steps * Math.PI / 2; return [r * Math.sin(a), cy - r * Math.cos(a)]; });
  const TUBE = [...arc(.5, -2), [.5, 2.28], [.54, 2.32], [.54, 2.42], [.5, 2.46]];
  const BLOOD = [...arc(.455, -2), [.455, 2.25]];
  const CAP = [[0, .74], [.5, .74], [.5, 0], [.625, 0], [.64, .03], [.64, .84], [.61, .94], [.54, .98], [.31, .98], [.28, .9], [0, .9]];

  const VS_CUBE = `#version 300 es
  in vec3 aP; in vec3 aN; in vec3 aI;
  uniform mat4 uVP; uniform float uT, uCell, uPulse, uPulseR; uniform vec3 uMix;
  out vec3 vN; out vec3 vW; out vec2 vC; out vec2 vS; out float vD; out float vR;
  float h(vec2 p, float r){
    float l=length(p*vec2(.82,1.));
    float a=sin(l*1.25-uT*1.5);
    float b=sin((p.x+p.y)*.72+uT*1.05)*.8+sin((p.x-p.y)*1.15-uT*.7)*.35;
    float c=sin(p.x*1.5+uT*1.1)*sin(p.y*1.5-uT*.85)*1.25;
    float v=a*uMix.x+b*uMix.y+c*uMix.z;
    v*=mix(.45,1.,smoothstep(1.5,7.,l));
    v+=(r-.5)*.72*smoothstep(.5,5.,l);
    v+=uPulse*1.7*exp(-pow(l-uPulseR,2.)*.9);
    return v*.5;
  }
  void main(){
    float e=uCell;
    float z=h(aI.xy,aI.z);
    /* How much taller the neighbours up and to the left are: they cast the crisp shadows */
    vS=vec2(max(0.,h(aI.xy-vec2(e,0),aI.z)-z),max(0.,h(aI.xy+vec2(0,e),aI.z)-z));
    vC=aP.xy; vD=aP.z; vR=aI.z;
    vec3 w=vec3(aI.xy+aP.xy*e*.965,(aP.z-1.)*2.4+z-7.);
    vN=aN; vW=w; gl_Position=uVP*vec4(w,1.);
  }`;
  const FS_CUBE = `#version 300 es
  precision highp float;
  in vec3 vN; in vec3 vW; in vec2 vC; in vec2 vS; in float vD; in float vR;
  uniform vec2 uA,uB; uniform float uRed;
  out vec4 o;
  float cap(vec2 p){vec2 d=uB-uA;float t=clamp(dot(p-uA,d)/max(dot(d,d),.001),0.,1.);return length(p-uA-d*t);}
  void main(){
    vec3 L=normalize(vec3(-.45,.62,.64));
    float d=max(dot(vN,L),0.);
    vec3 c;
    if(vN.z>.5){
      c=mix(vec3(.945,.955,.98),vec3(.985,.99,1.),vR);
      float sx=smoothstep(-.5+min(vS.x*1.1,.5),-.5+min(vS.x*1.1,.5)-.03,vC.x)*step(.015,vS.x);
      float sy=smoothstep(.5-min(vS.y*1.1,.5),.5-min(vS.y*1.1,.5)+.03,vC.y)*step(.015,vS.y);
      c*=1.-max(sx,sy)*.17;
      float ed=max(abs(vC.x),abs(vC.y));
      c*=1.-smoothstep(.45,.5,ed)*.12;
      c+=smoothstep(.45,.49,max(-vC.x,vC.y))*.03;
    }else{
      c=mix(vec3(.47,.52,.62),vec3(.86,.89,.95),d*1.4)*mix(.55,1.,clamp(vD,0.,1.));
    }
    float s=exp(-pow(cap(vW.xy),2.)*.42);
    c*=1.-s*.2;
    c=mix(c,c*vec3(1.,.86,.87),s*uRed);
    o=vec4(c,1.);
  }`;
  const VS = `#version 300 es
  in vec3 aP; in vec3 aN;
  uniform mat4 uVP,uM;
  out vec3 vW; out vec3 vN; out vec3 vL;
  void main(){ vec4 w=uM*vec4(aP,1.); vW=w.xyz; vL=aP; vN=mat3(uM)*aN; gl_Position=uVP*w; }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vW; in vec3 vN; in vec3 vL;
  uniform vec3 uCam,uPlane,uNorm; uniform int uMode; uniform float uT,uRip,uAlpha,uS; uniform mat3 uE;
  out vec4 o;
  float env(vec3 R){
    vec3 r=normalize(uE*R); r=normalize(vec3(r.x,r.y*.16,r.z));
    return smoothstep(.93,.985,dot(r,normalize(vec3(-.62,0.,.78))))*1.
      +smoothstep(.975,.995,dot(r,normalize(vec3(.72,0.,.69))))*.75
      +smoothstep(.2,.9,r.z)*.06;
  }
  void main(){
    vec3 N=normalize(vN),V=normalize(uCam-vW);
    bool front=gl_FrontFacing; if(!front)N=-N;
    float nv=clamp(dot(N,V),0.,1.),f=pow(1.-nv,3.);
    vec3 L=normalize(vec3(-.45,.7,.6));
    if(uMode==1){
      vec3 R=reflect(-V,N); float e=env(R)*smoothstep(-2.25,-1.75,vL.y);
      float a=(front?.07:.035)+f*(front?.62:.25)+e*(front?.72:.12);
      o=vec4(mix(vec3(.56,.64,.76),vec3(1.),clamp(e*1.4,0.,1.)),clamp(a*uAlpha,0.,1.));
      return;
    }
    if(uMode==2){
      vec3 q=vW-uPlane;
      float dist=dot(q,uNorm)+uS*uRip*(sin(q.x*9./uS+uT*11.)+.6*sin(q.z*13./uS-uT*8.));
      if(uAlpha>.5&&dist>0.)discard;
      vec3 c;
      if(front){
        vec3 R=reflect(-V,N); float e=env(R)*smoothstep(-2.25,-1.75,vL.y);
        c=mix(vec3(.25,.012,.035),vec3(.60,.035,.075),pow(1.-nv,1.35));
        c=mix(c,vec3(.52,.05,.09),smoothstep(-.11*uS,0.,dist)*.8*step(.5,uAlpha));
        c+=e*vec3(.5,.42,.44)*.55;
      }else{
        float d=max(dot(uNorm,L),0.);
        c=vec3(.44,.03,.07)+d*vec3(.19,.03,.05);
        vec3 H=normalize(L+V); c+=pow(max(dot(uNorm,H),0.),90.)*.5;
      }
      o=vec4(c,1.); return;
    }
    if(uMode==3){
      vec3 R=reflect(-V,N); float e=env(R);
      o=vec4(mix(vec3(.46,.5,.56),vec3(1.),clamp(e+.15,0.,1.)),1.); return;
    }
    /* cap */
    float r=length(vL.xz),ang=atan(vL.x,vL.z)*44.;
    vec3 base=vec3(.82,.085,.125);
    bool side=r>.63&&vL.y>.05&&vL.y<.84;
    if(side){
      float fw=fwidth(ang); float k=clamp(1.-fw*.55,0.,1.);
      vec3 t=normalize(cross(vec3(0.,1.,0.),N));
      N=normalize(N+t*cos(ang)*.42*k); base*=1.-.2*k*(.5-.5*sin(ang));
    }
    if(vL.y>.86&&r<.3){ base=mix(vec3(.5,.53,.58),vec3(.18,.19,.22),smoothstep(.13,.1,r)); }
    if(!side&&vL.y<.8&&r<.51)base*=.42;
    float d=max(dot(N,L)*.62+.38,0.);
    vec3 H=normalize(L+V); float sp=pow(max(dot(N,H),0.),46.);
    vec3 R=reflect(-V,N);
    o=vec4(base*(.34+d*.88)+vec3(1.)*(sp*.34+env(R)*.2+f*.14),1.);
  }`;
  const VS_LBL = `#version 300 es
  in vec2 aU;
  uniform mat4 uVP,uM; uniform float uBend,uRad,uLen,uAxis,uY;
  out vec2 vU; out vec3 vN; out vec3 vW;
  void main(){
    float s=(aU.x-.5)*uLen,k=max(uBend,.0005)/uRad;
    vec3 p=vec3(sin(s*k)/k,uY+(aU.y-.5)*uAxis,uRad+(cos(s*k)-1.)/k);
    vec3 n=vec3(sin(s*k),0.,cos(s*k));
    vec4 w=uM*vec4(p,1.); vU=aU; vW=w.xyz; vN=mat3(uM)*n; gl_Position=uVP*w;
  }`;
  const FS_LBL = `#version 300 es
  precision highp float;
  in vec2 vU; in vec3 vN; in vec3 vW;
  uniform sampler2D uTex; uniform float uPrint; uniform vec3 uCam;
  out vec4 o;
  void main(){
    vec3 N=normalize(vN),V=normalize(uCam-vW),L=normalize(vec3(-.3,.5,.8));
    if(!gl_FrontFacing){ o=vec4(vec3(.8,.82,.86),1.); return; }
    float d=max(dot(N,L),0.);
    vec3 c=vec3(.985,.985,.97)*(.64+d*.42);
    vec4 t=texture(uTex,vec2(vU.y,vU.x));
    float w=smoothstep(uPrint*1.06,uPrint*1.06-.03,vU.y);
    c=mix(c,t.rgb*(.75+d*.3),t.a*w);
    c+=pow(max(dot(N,normalize(L+V)),0.),30.)*.08;
    o=vec4(c,1.);
  }`;

  function code() { const d = new Date(), y = String(d.getFullYear()).slice(2), m = String(d.getMonth() + 1).padStart(2, "0"), a = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", b = new Uint8Array(5); crypto.getRandomValues(b); return `FAP-${y}${m}-${[...b].map((x) => a[x % a.length]).join("")}`; }

  /* The printed side of the label. Text runs along the tube, as on a real sample tube. */
  function drawLabel(cv, id) {
    const W = cv.width, H = cv.height, g = cv.getContext("2d");
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#d81f26"; g.fillRect(70, H * .2, 14, H * .6);
    g.fillStyle = "#14305c"; g.textBaseline = "alphabetic";
    let fs = 128; g.font = `800 ${fs}px "Plus Jakarta Sans",system-ui,sans-serif`;
    while (g.measureText(PATIENT).width > W - 190) { fs -= 4; g.font = `800 ${fs}px "Plus Jakarta Sans",system-ui,sans-serif`; }
    g.fillText(PATIENT, 112, H * .5 + fs * .1);
    g.font = '600 46px "Inter",system-ui,sans-serif'; g.fillStyle = "#51627f"; g.fillText(CLINIC + " · " + TEST, 112, H * .5 - fs * .92);
    g.font = '700 60px ui-monospace,Menlo,Consolas,monospace'; g.fillStyle = "#d81f26"; g.fillText(id, 112, H * .5 + fs * .1 + 84);
    g.fillStyle = "#14305c"; let x = 112; const end = W - 90, top = H * .5 + fs * .1 + 112, seed = [...id].map((c) => c.charCodeAt(0));
    for (let i = 0; x < end; i++) { const w = 3 + (seed[i % seed.length] * (i + 3)) % 9; g.fillRect(x, top, w, 58); x += w + 3 + (seed[(i + 2) % seed.length] * 7) % 8; }
  }

  function mount(sec) {
    if (sec.dataset.vxOn) return; sec.dataset.vxOn = "1"; sec.dir = "ltr"; if (!sec.querySelector(".vx-stage")) sec.innerHTML = markup();
    const stage = sec.querySelector(".vx-stage"), hint = sec.querySelector(".vx-hint-t"), lite = document.documentElement.classList.contains("lite");
    const cv = sec.querySelector(".vx-cv"), steps = [...sec.querySelectorAll(".vx-step")], toast = sec.querySelector(".vx-toast"), endEl = sec.querySelector(".vx-end"), bar = sec.querySelector(".vx-line i"), id = code();
    sec.querySelectorAll("[data-vx=code]").forEach((n) => (n.textContent = id));
    sec.querySelectorAll("[data-vx=name]").forEach((n) => (n.textContent = PATIENT));
    sec.querySelectorAll("[data-vx=test]").forEach((n) => (n.textContent = TEST));
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = cv.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) { sec.classList.add("still", "nogl"); endEl.classList.add("on"); return; }
    if (still) sec.classList.add("still");

    const prog = (v, f) => { const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }; const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, v)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}, a = {}; for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); } for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i < n; i++) { const nm = gl.getActiveAttrib(p, i).name; a[nm] = gl.getAttribLocation(p, nm); } return { p, u, a }; };
    const pCube = prog(VS_CUBE, FS_CUBE), pMat = prog(VS, FS), pLbl = prog(VS_LBL, FS_LBL);
    const attr = (loc, data, size, div) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); if (div) gl.vertexAttribDivisor(loc, 1); } return b; };
    const mesh = (m) => { const v = gl.createVertexArray(); gl.bindVertexArray(v); attr(pMat.a.aP, m.P, 3); attr(pMat.a.aN, m.N, 3); const b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.I, gl.STATIC_DRAW); return { v, n: m.I.length }; };
    const tube = mesh(lathe(TUBE)), blood = mesh(lathe(BLOOD)), cap = mesh(lathe(CAP, 96)), thread = mesh(lathe([[1, 0], [1, 1]], 18));

    /* Unit cube without a back: the +z face is the visible top */
    const F = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
    const bp = [], bn = [], bi = [];
    F.forEach(([n, u, v], f) => { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const p = [0, 1, 2].map((k) => (n[k] + u[k] * a + v[k] * b) * .5); bp.push(p[0], p[1], p[2] + .5); bn.push(...n); }); const o = f * 4; bi.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    const box = gl.createVertexArray(); gl.bindVertexArray(box); attr(pCube.a.aP, new Float32Array(bp), 3); attr(pCube.a.aN, new Float32Array(bn), 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bi), gl.STATIC_DRAW);
    let instBuf = attr(pCube.a.aI, new Float32Array(3), 3, true), instN = 0, cell = .46;

    const G = 26, gp = []; for (let y = 0; y <= 1; y += 1 / 4) for (let x = 0; x <= G; x++) gp.push(x / G, y);
    const gi = []; for (let r = 0; r < 4; r++) for (let x = 0; x < G; x++) { const a = r * (G + 1) + x, b = a + 1, c = a + G + 1, d = c + 1; gi.push(a, b, c, b, d, c); }
    const label = gl.createVertexArray(); gl.bindVertexArray(label); attr(pLbl.a.aU, new Float32Array(gp), 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(gi), gl.STATIC_DRAW); const lblN = gi.length;

    const tc = document.createElement("canvas"); tc.width = 1408; tc.height = 812;
    const tex = gl.createTexture(), upload = () => { drawLabel(tc, id); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); const ext = gl.getExtension("EXT_texture_filter_anisotropic"); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8); };
    upload();
    if (document.fonts) Promise.all([document.fonts.load('800 80px "Plus Jakarta Sans"'), document.fonts.load('600 40px "Inter"')]).then(() => { upload(); dirty(); }).catch(() => {});

    gl.enable(gl.DEPTH_TEST); gl.clearColor(.42, .47, .57, 1); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let W = 0, H = 0, asp = 1, portrait = false, VP = M.id(), cur = still ? 1 : 0, target = cur, visible = true, raf = 0, last = 0, clock = 0;
    let px = 0, py = 0, pxs = 0, pys = 0;
    const cam = [0, 0, 11], fov = 32 * Math.PI / 180;
    const sl = { a: 0, va: 0, b: 0, vb: 0, tilt: 0, x: 0, vx: 0, ready: false };
    let pulse = 0, pulseR = 0, wasClick = false, wasToast = false, wasDone = false;
    const ring = () => { pulse = 1; pulseR = 0; };

    function size() {
      const r = stage.getBoundingClientRect(), small = r.width < 700, dpr = lite ? 1 : Math.min(devicePixelRatio || 1, small ? 1.6 : 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w === W && h === H) return;
      W = cv.width = w; H = cv.height = h; asp = r.width / r.height; portrait = asp < 1.02;
      VP = M.mul(M.persp(fov, asp, .5, 60), M.t(-cam[0], -cam[1], -cam[2]));
      cell = small ? .56 : .46;
      const hh = 18.6 * Math.tan(fov / 2) + 1.5, hw = hh * asp + 1.5, nx = Math.ceil(hw / cell), ny = Math.ceil(hh / cell), a = [];
      for (let y = -ny; y <= ny; y++) for (let x = -nx; x <= nx; x++) { const k = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; a.push((x + .5) * cell, (y + .5) * cell, k - Math.floor(k)); }
      instN = a.length / 3;
      gl.bindVertexArray(box); gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
      gl.viewport(0, 0, W, H);
    }

    /* Where everything is at a given scroll position */
    function pose(p) {
      const s = ([a, b]) => clamp((p - a) / (b - a)), v = {};
      const arrive = out(s(T.arrive)), labelIn = ease(s(T.label)), near = ease(s(T.capNear)), needle = ease(s(T.needle)), filled = s(T.fill), nOut = ease(s(T.needleOut)), twist = s(T.twist), rock = s(T.rock), lay = ease(s(T.lay)), print = s(T.print), hh = 11 * Math.tan(fov / 2), hw = hh * asp;
      const bx = portrait ? mix(hw * .46, 0, lay) : Math.min(hw * .42, 2.5);
      const up = portrait ? Math.min(.78, hw * .42) : .56, flat = portrait ? Math.min(.82, hw * 2 / 6.2) : .86, sc = mix(mix(up * .82, up, arrive), flat, lay);
      const ease2 = Math.sin(rock * Math.PI * 3) * (1 - rock * .3) * (portrait ? .43 : .72) * (rock < 1 ? 1 : 0);
      const swayX = Math.sin(rock * Math.PI * 3 + .7) * .22 * Math.sin(rock * Math.PI);
      v.x = mix(-hw - 3.5, bx, arrive) + swayX; v.y = portrait ? mix(-.87 * sc, .5, lay) : mix(-.3 * sc, 0, lay) - .12 * (1 - lay); v.z = mix(-3, 0, arrive);
      v.s = sc; v.tilt = mix(.5, 0, arrive) + ease2 + mix(0, -Math.PI / 2 + .05, lay);
      const away = ease(clamp((p - .25) / .1)); v.spin = mix(-2.4, 0, arrive) + 2.75 * away * (1 - lay); /* Label turns aside so the sample stays in view, then comes back for its name */
      v.fill = filled; v.pour = filled > 0 && filled < 1 ? 1 : 0; v.filledP = filled;
      /* Cap flies in from the other side, parks beside the tube, then lines up above it */
      const seat = 1.76, hover = seat + 1.5, drop = ease(twist), capL = mix(hover, seat, drop);
      const parkX = portrait ? .42 : 1.75, parkY = portrait ? 2.6 : 1.5;
      v.capDetachX = mix(mix(hw + 4, parkX, arrive), 0, near); v.capDetachY = mix(parkY, capL, near); v.capDetachZ = mix(mix(-3, .4, arrive), 0, near);
      v.capTilt = mix(mix(-1.3, -.55, arrive), 0, near); v.capSpin = mix(3.2, 0, arrive) + twist * Math.PI * 3.5;
      v.needle = needle * (1 - nOut); v.labelIn = labelIn; v.print = print; v.lay = lay; v.click = twist >= .995;
      return v;
    }

    function ui(p) {
      steps.forEach((el, i) => el.classList.toggle("on", p < T.end && p >= STEPS[i][0] && p < STEPS[i][1]));
      const tOn = p >= .835; toast.classList.toggle("on", tOn); endEl.classList.toggle("on", p >= T.end);
      if (bar) bar.style.transform = `scaleX(${p})`;
      const done = p >= .985; if (done !== wasDone) { hint.textContent = done ? HINT_DONE : HINT; hint.parentNode.classList.toggle("done", done); wasDone = done; }
      if (tOn && !wasToast) ring(); wasToast = tOn;
    }

    function frame(now) {
      raf = 0; if (!sec.isConnected) return; const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; clock += dt;
      if (!still) { const r = sec.getBoundingClientRect(), cs = getComputedStyle(sec), pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0, top = parseFloat(getComputedStyle(stage).top) || 0; target = clamp((top - r.top - pt) / ((r.height - pt - pb - stage.offsetHeight) || 1)); cur += (target - cur) * (1 - Math.exp(-dt * 8)); if (Math.abs(target - cur) < .00005) cur = target; }
      draw(dt); ui(cur);
      if (!still && visible) raf = requestAnimationFrame(frame);
    }
    const dirty = () => { if (still && !raf) raf = requestAnimationFrame(frame); };

    function draw(dt) {
      size(); const p = cur, v = pose(p);
      pxs += (px - pxs) * .08; pys += (py - pys) * .08;
      const has = v.fill > 0, idle = has ? Math.sin(clock * 1.15) * .05 + Math.sin(clock * .53) * .03 : 0;
      const tilt = v.tilt + idle + pxs * .1 * clamp(v.fill * 2), yaw = pxs * .22 + (v.lay > 0 ? 0 : Math.sin(clock * .4) * .05);
      const roll = pys * .1;
      if (v.click && !wasClick) ring(); wasClick = v.click;
      pulse = Math.max(0, pulse - dt * .65); pulseR += dt * 8.5;

      /* Sloshing: a damped spring that the tube's turning and sideways speed keep disturbing */
      if (sl.ready) {
        const om = clamp((tilt - sl.tilt) / dt, -9, 9), nvx = clamp((v.x - sl.x) / dt, -14, 14), ax = clamp((nvx - sl.vx) / dt, -70, 70);
        const steps2 = 2, h = dt / steps2;
        for (let i = 0; i < steps2; i++) {
          sl.va += h * (-46 * sl.a - 2.6 * sl.va - om * 3.4 - ax * .3);
          sl.a += h * sl.va;
          sl.vb += h * (-52 * sl.b - 3 * sl.vb + pys * .3 + om * 1.3);
          sl.b += h * sl.vb;
        }
        sl.a = clamp(sl.a, -.52, .52); sl.b = clamp(sl.b, -.3, .3); sl.vx = nvx;
      } else sl.ready = true;
      sl.tilt = tilt; sl.x = v.x;
      const n = [Math.sin(sl.a) , Math.cos(sl.a), Math.sin(sl.b)], nl = Math.hypot(...n); n[0] /= nl; n[1] /= nl; n[2] /= nl;

      const base = M.chain(M.t(v.x, v.y, v.z), M.rz(tilt), M.rx(roll), M.ry(yaw), M.s(v.s));
      const vial = M.mul(base, M.ry(v.spin));
      const capM = M.chain(base, M.t(v.capDetachX / v.s, v.capDetachY, v.capDetachZ / v.s), M.rz(v.capTilt), M.ry(v.capSpin));

      const tA = M.pt(base, 0, -2.5, 0), tB = M.pt(base, 0, 2.5, 0), k = 18 / 11;
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(pCube.p); gl.uniformMatrix4fv(pCube.u.uVP, false, VP);
      gl.uniform1f(pCube.u.uT, clock); gl.uniform1f(pCube.u.uCell, cell); gl.uniform1f(pCube.u.uPulse, pulse); gl.uniform1f(pCube.u.uPulseR, pulseR);
      const q = p * 3, w0 = clamp(1 - Math.abs(q - .4) * 1.2), w1 = clamp(1 - Math.abs(q - 1.5) * 1.2), w2 = clamp(1 - Math.abs(q - 2.6) * 1.2), ws = (w0 + w1 + w2) || 1;
      gl.uniform3f(pCube.u.uMix, w0 / ws, w1 / ws, w2 / ws);
      gl.uniform2f(pCube.u.uA, tA[0] * k + .55, tA[1] * k - .5); gl.uniform2f(pCube.u.uB, tB[0] * k + .55, tB[1] * k - .5); gl.uniform1f(pCube.u.uRed, clamp(v.fill) * .9);
      gl.bindVertexArray(box); gl.drawElementsInstanced(gl.TRIANGLES, 30, gl.UNSIGNED_SHORT, 0, instN);

      gl.useProgram(pMat.p); gl.uniformMatrix4fv(pMat.u.uVP, false, VP); gl.uniform3fv(pMat.u.uCam, cam); gl.uniform1f(pMat.u.uT, clock); gl.uniform1f(pMat.u.uS, v.s);
      const c = Math.cos(tilt), s = Math.sin(tilt); gl.uniformMatrix3fv(pMat.u.uE, false, new Float32Array([c, -s, 0, s, c, 0, 0, 0, 1]));
      const draw1 = (m, mode, mat, alpha = 1) => { gl.uniform1i(pMat.u.uMode, mode); gl.uniform1f(pMat.u.uAlpha, alpha); gl.uniformMatrix4fv(pMat.u.uM, false, mat); gl.bindVertexArray(m.v); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0); };

      gl.enable(gl.BLEND); gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); draw1(tube, 1, vial); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);

      draw1(cap, 0, capM);
      if (v.needle > .001) { const L = 1.75 * v.needle; draw1(thread, 3, M.chain(capM, M.t(0, .76 - L, 0), M.s(.024, L + .02, .024))); }

      gl.useProgram(pLbl.p); gl.uniformMatrix4fv(pLbl.u.uVP, false, VP); gl.uniform3fv(pLbl.u.uCam, cam);
      const li = v.labelIn, fly = 1 - clamp(li / .62), bend = ease(clamp((li - .5) / .5));
      const lblM = M.chain(vial, M.t(fly * fly * (portrait ? 3 : 5), fly * -1.1, fly * 1.3), M.rz(fly * -.5), M.ry(fly * .7));
      if (li > 0.001) { gl.uniform1f(pLbl.u.uBend, bend); gl.uniform1f(pLbl.u.uRad, .515); gl.uniform1f(pLbl.u.uLen, 1.5); gl.uniform1f(pLbl.u.uAxis, 2.6); gl.uniform1f(pLbl.u.uY, -.5); gl.uniform1f(pLbl.u.uPrint, v.print); gl.uniformMatrix4fv(pLbl.u.uM, false, lblM); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pLbl.u.uTex, 0); gl.bindVertexArray(label); gl.drawElements(gl.TRIANGLES, lblN, gl.UNSIGNED_SHORT, 0); }

      gl.useProgram(pMat.p);
      if (has) {
        const ly = mix(-2.52, .78, out(v.fill)), P0 = M.pt(base, 0, ly, 0), sq = Math.sin(tilt) * Math.sin(tilt);
        gl.uniform3f(pMat.u.uPlane, P0[0], P0[1] + v.s * .17 * sq, P0[2]); gl.uniform3f(pMat.u.uNorm, n[0], n[1], n[2]);
        gl.uniform1f(pMat.u.uRip, .004 + Math.min(.03, Math.abs(sl.va) * .018) + v.pour * .018);
        draw1(blood, 2, vial, 1);
        if (v.pour) { const top = capLocalNeedle(v), bot = ly; const len = top - bot; if (len > 0) { const wob = Math.sin(clock * 34) * .004; draw1(thread, 2, M.chain(base, M.t(wob, bot, 0), M.s(.038 + wob, len, .038 + wob)), 0); } }
      }
      gl.enable(gl.BLEND); gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); draw1(tube, 1, vial); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    }
    const capLocalNeedle = (v) => v.capDetachY + .76 - 1.75 * v.needle;

    const onMove = (e) => { const r = cv.getBoundingClientRect(); px = (e.clientX - r.left) / r.width * 2 - 1; py = (e.clientY - r.top) / r.height * 2 - 1; };
    if (matchMedia("(hover:hover)").matches) sec.addEventListener("pointermove", onMove, { passive: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !still) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { rootMargin: "120px" }).observe(sec);
    addEventListener("resize", () => { W = 0; dirty(); }, { passive: true });
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); sec.classList.add("still", "nogl"); endEl.classList.add("on"); });
    if (still) { endEl.classList.add("on"); clock = 2; } raf = requestAnimationFrame(frame);
  }
  const go = () => document.querySelectorAll(".vx").forEach(mount);
  window.FA_VIAL = { mount: go };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
})();
