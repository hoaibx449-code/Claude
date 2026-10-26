/* THẾ GIỚI ẨN DỤ 3D (m_scene) — WebGL/three.js, dùng chung format cine.
   Mỗi khái niệm trừu tượng = MỘT VẬT ẨN DỤ đang chuyển động trên một "đảo diorama" nổi, có nhân vật không mặt.
   Thế giới (bảng màu, trời, sàn) do storyboard.world quyết định theo TỪNG series/video — không gán cứng.
   Mọi chuyển động là hàm thuần của thời gian (xác định khung-theo-khung để dựng song song).

   Cảnh: {type:'m_scene', prop:'treadmill|stairs2|leaky|meter|dominoes|cluster|split|jar|stage', o:{...tuỳ prop},
          cam:{kind,target,d0,d1,h0,h1,a0,a1,fov} | cams:[{at|cue, ...}] (cắt góc máy trong cảnh, vật vẫn chạy liền),
          tag:{en, vi, at|cue} (thẻ thuật ngữ song ngữ), title:[l1,l2], titleAt, num:{value, from, decimals, suffix, caption, at|cue, dur},
          person:{pose, at...} (tuỳ prop), label }
*/
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const TAU = Math.PI * 2;
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const io = t => (t = cl(t), t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const out3 = t => 1 - Math.pow(1 - cl(t), 3);
  const back = t => { t = cl(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  // mốc thời gian: số giây, hoặc {cue} đã được align.py đổi thành {at}
  const A = (v, d) => (v && typeof v === 'object') ? (v.at ?? d) : (v ?? d);

  /* ---------- renderer dùng chung (1 ngữ cảnh WebGL cho mọi cảnh) ---------- */
  let R = null;
  function renderer() {
    if (R) return R;
    const dsf = window.devicePixelRatio || 1, c = document.createElement('canvas');
    c.width = Math.round(720 * dsf); c.height = Math.round(1280 * dsf);
    R = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(c.width, c.height, false);
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
    return R;
  }
  const PAL = () => Object.assign({
    sky: ['#0e2a30', '#2d6467'], floor: '#efe4d2', side: '#c4553b', rock: '#6b3326',
    accent: '#f2b134', accent2: '#e4572e', cool: '#7cc4bb', char: '#f3e6d0', ink: '#14222a', font: 'Be Vietnam Pro'
  }, ((window.HBX && window.HBX._sb) || {}).world || {});

  const M = {};
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .72, metalness: 0 }, o));
  const gold = P => M.gold || (M.gold = mat(P.accent, { roughness: .32, metalness: .55, emissive: P.accent, emissiveIntensity: .08 }));
  const shadowy = (o) => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  /* chữ trên vật (sprite canvas) */
  function label(text, o = {}) {
    if (text && typeof text === 'object') text = text.text || text.label || text.vi || '';   // never "[object Object]"
    text = String(text ?? '');
    const P = PAL(), fs = o.size || 64, pad = fs * .45, cv = document.createElement('canvas'), g = cv.getContext('2d');
    g.font = `800 ${fs}px "${o.font || P.font}", sans-serif`;
    const w = Math.ceil(g.measureText(text).width + pad * 2), h = Math.ceil(fs * 1.5);
    cv.width = w; cv.height = h; g.font = `800 ${fs}px "${o.font || P.font}", sans-serif`;
    if (o.bg !== false) { g.fillStyle = o.bg || P.ink; const r = h / 2; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill(); }
    g.fillStyle = o.color || '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, h / 2 + fs * .04);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, fog: false }));
    const H = o.h || .42; sp.scale.set(H * w / h, H, 1); sp.renderOrder = 10; return sp;
  }

  /* ---------- thế giới: đảo diorama nổi ---------- */
  function world(P, o = {}) {
    const sc = new THREE.Scene();
    sc.fog = new THREE.Fog(P.sky[0], 26, 70);
    sc.add(new THREE.HemisphereLight('#fff4e4', P.sky[0], 1.25));
    const key = new THREE.DirectionalLight('#fff0da', 2.7); key.position.set(7, 13, 8); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); const sc2 = key.shadow.camera; sc2.left = sc2.bottom = -9; sc2.right = sc2.top = 9; sc2.near = 1; sc2.far = 40;
    key.shadow.bias = -.0006; key.shadow.radius = 5; sc.add(key);
    const rim = new THREE.DirectionalLight(P.cool, 1.1); rim.position.set(-9, 5, -7); sc.add(rim);
    const R0 = o.radius || 7;
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 * .97, .7, 72), [mat(P.side), mat(P.floor, { roughness: .9 }), mat(P.rock)]);
    isl.position.y = -.35; isl.receiveShadow = true; sc.add(isl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R0 - .02, .045, 8, 96), mat(P.accent, { roughness: .4 })); ring.rotation.x = Math.PI / 2; ring.position.y = .01; sc.add(ring);
    // vòng chỉ dẫn nhạt trên sàn (cảm giác sân khấu)
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(R0 * .55, R0 * .555, 96), new THREE.MeshBasicMaterial({ color: P.side, transparent: true, opacity: .25 }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = .005; sc.add(ring2);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(R0 * .96, 5.5, 9, 2), mat(P.rock, { flatShading: true }));
    rock.rotation.x = Math.PI; rock.position.y = -.7 - 2.75; sc.add(rock);
    // mảnh đá trôi xa (chiều sâu + thị sai)
    const deb = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.25 + rnd(i) * .7, 0), mat(i % 3 ? P.rock : P.side, { flatShading: true }));
      const a = rnd(i + 9) * TAU, r = 11 + rnd(i + 3) * 12; m.position.set(Math.cos(a) * r, -3 + rnd(i + 5) * 9, Math.sin(a) * r);
      m.userData = { y: m.position.y, s: .3 + rnd(i + 7), p: rnd(i + 2) * TAU }; sc.add(m); deb.push(m);
    }
    return { sc, deb, key };
  }

  /* ---------- nhân vật không mặt ---------- */
  function person(P, col) {
    const m = mat(col || P.char, { roughness: .6 }), mj = mat(P.side, { roughness: .6 });
    const cap = (r, l) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), m);
    const G = new THREE.Group(), hips = new THREE.Group(); hips.position.y = 1.0; G.add(hips);
    const j = { hips };
    const leg = (s) => {
      const th = new THREE.Group(); th.position.set(s * .12, -.02, 0); hips.add(th);
      const a = cap(.085, .34); a.position.y = -.22; th.add(a);
      const kn = new THREE.Group(); kn.position.y = -.46; th.add(kn);
      const b = cap(.075, .34); b.position.y = -.2; kn.add(b);
      const ft = new THREE.Mesh(new THREE.BoxGeometry(.13, .08, .26), mj); ft.position.set(0, -.44, .06); kn.add(ft);
      return [th, kn];
    };
    [j.tL, j.kL] = leg(-1); [j.tR, j.kR] = leg(1);
    const torso = new THREE.Group(); hips.add(torso); j.torso = torso;
    const body = cap(.2, .34); body.position.y = .33; torso.add(body);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(.205, .205, .07, 16), mj); belt.position.y = .1; torso.add(belt);
    const head = new THREE.Group(); head.position.y = .7; torso.add(head); j.head = head;
    const hd = new THREE.Mesh(new THREE.SphereGeometry(.17, 24, 18), m); hd.position.y = .1; hd.scale.set(1, 1.1, 1); head.add(hd);
    const arm = (s) => {
      const sh = new THREE.Group(); sh.position.set(s * .27, .58, 0); torso.add(sh);
      const a = cap(.062, .24); a.position.y = -.16; sh.add(a);
      const el = new THREE.Group(); el.position.y = -.34; sh.add(el);
      const b = cap(.055, .22); b.position.y = -.15; el.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 10), mj); h.position.y = -.33; el.add(h);
      return [sh, el];
    };
    [j.sL, j.eL] = arm(-1); [j.sR, j.eR] = arm(1);
    shadowy(G); return { g: G, j };
  }
  function pose(p, kind, t, k = 1) {
    const j = p.j; ['tL', 'tR', 'kL', 'kR', 'sL', 'sR', 'eL', 'eR', 'torso', 'head', 'hips'].forEach(n => j[n].rotation.set(0, 0, 0));
    j.hips.position.y = 1.0; j.sL.rotation.z = -.12; j.sR.rotation.z = .12;
    if (kind === 'run' || kind === 'walk') {
      const run = kind === 'run', ph = t * TAU * (run ? 1.45 : .95) * k, A = run ? .95 : .5;
      j.tL.rotation.x = A * Math.sin(ph); j.tR.rotation.x = -A * Math.sin(ph);
      j.kL.rotation.x = (run ? 1.3 : .6) * Math.max(0, -Math.sin(ph - .6)); j.kR.rotation.x = (run ? 1.3 : .6) * Math.max(0, Math.sin(ph - .6));
      j.sL.rotation.x = -A * .9 * Math.sin(ph); j.sR.rotation.x = A * .9 * Math.sin(ph);
      j.eL.rotation.x = j.eR.rotation.x = run ? -1.25 : -.35;
      j.hips.position.y = 1.0 - (run ? .04 : .02) + (run ? .07 : .03) * Math.abs(Math.sin(ph));
      j.torso.rotation.x = run ? .16 + .03 * k : .04; j.torso.rotation.y = .08 * Math.sin(ph);
    } else if (kind === 'slump') {
      j.torso.rotation.x = .32; j.head.rotation.x = .45; j.sL.rotation.z = -.05; j.sR.rotation.z = .05; j.sL.rotation.x = j.sR.rotation.x = .25;
      j.hips.position.y = .97 + .01 * Math.sin(t * 1.5);
    } else if (kind === 'cheer') {
      const b = Math.abs(Math.sin(t * 6)) * k;
      j.sL.rotation.z = -2.6; j.sR.rotation.z = 2.6; j.eL.rotation.z = -.3; j.eR.rotation.z = .3;
      j.hips.position.y = 1.0 + .18 * b; j.tL.rotation.x = j.tR.rotation.x = -.15 * b; j.kL.rotation.x = j.kR.rotation.x = .3 * b; j.head.rotation.x = -.2;
    } else if (kind === 'think') {
      j.sR.rotation.x = -1.5; j.sR.rotation.z = .5; j.eR.rotation.x = -1.7; j.head.rotation.x = .12; j.head.rotation.z = .1 * Math.sin(t * .8); j.torso.rotation.y = .1;
    } else if (kind === 'point') {
      j.sR.rotation.x = -1.35; j.sR.rotation.z = .25; j.head.rotation.y = -.2;
    } else if (kind === 'carry') {
      j.sL.rotation.x = j.sR.rotation.x = -1.1; j.eL.rotation.x = j.eR.rotation.x = -.7; j.sL.rotation.z = .2; j.sR.rotation.z = -.2;
    } else { // idle: thở
      j.torso.rotation.x = .02 * Math.sin(t * 1.8); j.head.rotation.y = .12 * Math.sin(t * .6); j.hips.position.y = 1.0 + .008 * Math.sin(t * 1.8);
    }
  }

  /* ---------- đồng xu (instanced) ---------- */
  function coins(P, n) {
    const g = new THREE.CylinderGeometry(.16, .16, .045, 22); const im = new THREE.InstancedMesh(g, gold(P), n);
    im.castShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return im;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function setI(im, i, x, y, z, rx, ry, rz, s) { _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz)); _s.setScalar(s); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); }

  /* ---------- VẬT ẨN DỤ ---------- */
  const PROPS = {};

  // Máy chạy bộ: chạy nhanh dần theo `speeds:[{at,k}]`; `off:{at}` bước xuống đi lên bậc thang bên cạnh
  PROPS.treadmill = (P, o, W) => {
    const g = new THREE.Group(), dark = mat(P.ink, { roughness: .5 }), side = mat(P.side);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, .28, 3.4), side); base.position.y = .14; g.add(base);
    // băng chạy có vạch
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 512; const c2 = cv.getContext('2d');
    c2.fillStyle = '#20282c'; c2.fillRect(0, 0, 64, 512); c2.fillStyle = '#3c474c'; for (let i = 0; i < 8; i++) c2.fillRect(0, i * 64, 64, 18);
    const tx = new THREE.CanvasTexture(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, 2);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.2, .04, 3.2), new THREE.MeshStandardMaterial({ map: tx, roughness: .8 })); belt.position.y = .3; g.add(belt);
    [-1, 1].forEach(s => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.5, 10), dark); post.position.set(s * .7, 1.0, -1.3); post.rotation.x = -.15; g.add(post);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1.1, 10), dark); rail.rotation.x = Math.PI / 2; rail.position.set(s * .7, 1.35, -.85); g.add(rail);
    });
    const con = new THREE.Mesh(new THREE.BoxGeometry(1.6, .5, .14), dark); con.position.set(0, 1.78, -1.42); con.rotation.x = -.5; g.add(con);
    // màn hình tốc độ
    const scv = document.createElement('canvas'); scv.width = 256; scv.height = 96; const stx = new THREE.CanvasTexture(scv); stx.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .42), new THREE.MeshBasicMaterial({ map: stx })); scr.position.set(0, 1.8, -1.34); scr.rotation.x = -.5; g.add(scr);
    shadowy(g); g.position.set(o.x || 0, 0, o.z || 0); W.sc.add(g);
    const p = person(P); W.sc.add(p.g);
    let stairs = null;
    if (o.off) { // bậc thang đi lên khi bước xuống
      stairs = new THREE.Group(); for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, .3 * (i + 1), .55), i % 2 ? mat(P.floor) : mat(P.cool)); b.position.set(2.2, .15 * (i + 1), .6 - i * .55); stairs.add(b); }
      shadowy(stairs); W.sc.add(stairs);
      const lab = o.offLabel && label(o.offLabel, { bg: P.accent, color: P.ink, h: .36 }); if (lab) { lab.position.set(2.2, 2.6, -2.4); stairs.add(lab); }
    }
    const SP = (o.speeds || [{ at: 0, k: 1 }]).map((q, i) => ({ k: q.k, at: A(q, i ? 1 : 0) }));
    const kAt = t => { let k = SP[0].k; for (let i = 1; i < SP.length; i++) k = lerp(k, SP[i].k, io((t - SP[i].at) / .8)); return k; };
    // vị trí băng = tích phân tốc độ (xác định)
    const posAt = t => { let s = 0; const dt = 1 / 30; for (let u = 0; u < t; u += dt) s += kAt(u) * dt; return s; };
    let last = '';
    return {
      g, person: p, focus: [o.off ? 1 : 0, 1.3, -.2], size: o.off ? 1 : .72,
      update(t) {
        const k = kAt(t), s = posAt(t); tx.offset.y = -s * 1.1;
        const txt = (o.screen || ['x1', 'x2', 'x3', 'x4'])[Math.min(SP.length - 1, SP.filter(q => t >= q.at).length - 1)] || '';
        if (txt !== last) { last = txt; const c = scv.getContext('2d'); c.fillStyle = '#0d1a1d'; c.fillRect(0, 0, 256, 96); c.fillStyle = P.accent; c.font = `800 58px "${P.font}"`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 128, 52); stx.needsUpdate = true; }
        const offAt = o.off ? A(o.off, 1) : 1e9, off = cl((t - offAt) / 1.1);
        if (t >= offAt) {
          const w = t - offAt;
          // mặt người mặc định nhìn +z; console ở -z → chạy thì quay π; bước sang phải (+x) rồi leo bậc về -z
          if (off < 1) { p.g.position.set(lerp(0, 2.2, io(off)), .32 + Math.sin(off * Math.PI) * .4 - .32 * io(off) + .3 * io(off), .6); p.g.rotation.y = lerp(Math.PI, Math.PI / 2, io(cl(off * 2))); pose(p, 'walk', w, 1); }
          else { const u = Math.min(5, (w - 1.1) / .6), st = Math.min(5, Math.floor(u)); p.g.position.set(2.2, .3 * (st + 1) + .12 * Math.sin((u % 1) * Math.PI), .6 - u * .55); p.g.rotation.y = Math.PI; pose(p, u >= 5 ? 'cheer' : 'walk', w, u >= 5 ? .4 : 1.2); }
        } else { p.g.position.set(0, .32, .25); p.g.rotation.y = Math.PI; pose(p, k > .15 ? 'run' : 'idle', s, 1); }
      }
    };
  };

  // Hai cầu thang song song: thu nhập (vàng) & chi tiêu (san hô) cùng lên bậc; khoảng hở vẫn mỏng
  PROPS.stairs2 = (P, o, W) => {
    const g = new THREE.Group(), n = o.steps || (o.beats || []).length || 4, ats = (o.beats || []).length ? o.beats.map((b, i) => A(b, .4 + i * .9)) : Array.from({ length: n }, (_, i) => (o.t0 ?? .4) + i * (o.dt ?? .9)), gap = o.gap ?? .12;
    const cols = [gold(P), mat(P.accent2)], bars = [[], []];
    for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) {
      const h = .55 * (i + 1) - (c ? gap : 0), b = new THREE.Mesh(new THREE.BoxGeometry(.9, 1, .9), cols[c]);
      b.userData = { h, x: (c ? .55 : -.55), z: 1.6 - i * 1.0 }; g.add(b); bars[c].push(b);
    }
    const labs = (o.labels || ['Thu nhập', 'Chi tiêu']).map((t, c) => { const l = label(t, { bg: c ? P.accent2 : P.accent, color: P.ink, h: .34 }); g.add(l); return l; });
    const p = person(P); g.add(p.g); shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 1.4, -.4], size: .85,
      update(t) {
        let top = 0;
        bars.forEach((B, c) => B.forEach((b, i) => {
          const q = out3((t - ats[i] - c * .22) / .55), h = Math.max(.001, b.userData.h * q);
          b.scale.y = h; b.position.set(b.userData.x, h / 2, b.userData.z); b.visible = q > 0; if (!c && q > 0) top = i;
        }));
        const li = Math.max(0, bars[0].filter(b => b.visible).length - 1);
        labs.forEach((l, c) => { const b = bars[c][li]; l.position.set(b.userData.x * 2.4, b.userData.h + .55, b.userData.z); });
        const b = bars[0][top], hop = cl((t - ats[top]) / .5);
        p.g.position.set(-.55, b.userData.h * out3(cl((t - ats[top]) / .55)) + Math.sin(hop * Math.PI) * .25, b.userData.z);
        p.g.rotation.y = .5; pose(p, hop < 1 ? 'walk' : 'idle', t, 1);
        // khoảng hở: dải sáng mảnh giữa đỉnh hai cột ở bậc cao nhất
      }
    };
  };

  // Ví/xô thủng: xu đổ vào trên, rò ra đáy — tiền vào bao nhiêu, ra bấy nhiêu
  PROPS.leaky = (P, o, W) => {
    const g = new THREE.Group(), N = 46;
    const pts = []; for (let i = 0; i <= 12; i++) { const y = i / 12; pts.push(new THREE.Vector2(.8 + .35 * y, y * 1.6)); }
    const bucket = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat(P.side, { side: THREE.DoubleSide })); bucket.position.y = .5; g.add(bucket);
    const holes = [[.0, .5, .82], [-.55, .5, .55], [.6, .5, .5]];
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(.55, .7, .5, 24), mat(P.ink)); stand.position.y = .25; g.add(stand);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 1.4, 16), mat(P.ink, { roughness: .4 })); pipe.position.set(0, 4.3, 0); g.add(pipe);
    const cs = coins(P, N); g.add(cs);
    const lIn = label(o.in || 'Lương', { bg: P.accent, color: P.ink, h: .36 }); lIn.position.set(-1.0, 4.5, 0); g.add(lIn);
    const lOut = label(o.out || 'Chi tiêu', { bg: P.accent2, color: P.ink, h: .36 }); lOut.position.set(1.15, .95, 1.6); g.add(lOut);
    const p = person(P); p.g.position.set(-2.1, 0, .6); p.g.rotation.y = .9; g.add(p.g);
    shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 2.0, 0], size: 1.0,
      update(t) {
        const rate = o.rate || 1;
        for (let i = 0; i < N; i++) {
          const life = 2.2, ph = ((t * rate + rnd(i) * life * 1.0 + i * (life / N)) % life) / life;
          let x, y, z, r = rnd(i + 1) * 6;
          if (ph < .45) { const u = ph / .45; x = (rnd(i + 2) - .5) * .25; z = (rnd(i + 3) - .5) * .25; y = 3.6 - u * u * 2.6; }
          else if (ph < .55) { x = (rnd(i + 2) - .5) * .9; z = (rnd(i + 3) - .5) * .9; y = 1.0 + (rnd(i + 4)) * .2; }
          else { const u = (ph - .55) / .45, h = holes[i % 3]; x = h[0] * (1 + u * 1.6); z = h[2] * (1 + u * 1.6); y = Math.max(.03, h[1] + .2 - u * u * 1.4); if (y <= .03) r = 1.57; }
          setI(cs, i, x, y, z, r, r * .7, 0, t < (o.at || 0) ? 0 : 1);
        }
        cs.instanceMatrix.needsUpdate = true; pose(p, o.pose || 'think', t);
      }
    };
  };

  // Thước hạnh phúc: vọt lên rồi tụt dần về vạch cũ; đám đông nhỏ nhảy mừng rồi lặng dần
  PROPS.meter = (P, o, W) => {
    const g = new THREE.Group(), base = o.base ?? .35, peak = o.peak ?? .95, t0 = A(o.rise, o.at ?? .6), tf = A(o.fall, t0 + 1.2), decay = o.decay ?? 3.2;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 4, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: .22, roughness: .1 })); tube.position.y = 2.2; g.add(tube);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, 1, 32), mat(P.accent, { emissive: P.accent, emissiveIntensity: .25 })); g.add(fill);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.6, .7, .2, 32), mat(P.ink)); foot.position.y = .1; g.add(foot);
    const line = new THREE.Mesh(new THREE.TorusGeometry(.5, .025, 8, 48), mat(P.cool, { emissive: P.cool, emissiveIntensity: .6 })); line.rotation.x = Math.PI / 2; line.position.y = .2 + base * 4; g.add(line);
    const bl = label(o.baseLabel || 'mức cũ', { bg: P.cool, color: P.ink, h: .3 }); bl.position.set(1.1, .2 + base * 4, 0); g.add(bl);
    const crowd = [], n = o.crowd || 22;
    for (let i = 0; i < n; i++) { const p = person(P, i % 4 ? P.char : P.floor); const a = (i / n) * TAU * .9 - Math.PI * .95, r = 2.3 + (i % 3) * .55; p.g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + .8); p.g.scale.setScalar(.55); p.g.rotation.y = -a - Math.PI / 2; g.add(p.g); crowd.push(p); }
    shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 1.8, .6], size: 1.05,
      update(t) {
        const up = out3((t - t0) / .7), dn = io((t - tf) / decay), lv = base + (peak - base) * up * (1 - dn * .97);
        const h = .2 + lv * 4; fill.scale.y = Math.max(.01, h - .2); fill.position.y = .2 + (h - .2) / 2;
        const joy = t < t0 ? 0 : Math.max(0, 1 - dn);
        crowd.forEach((p, i) => pose(p, joy > .15 ? 'cheer' : 'idle', t + rnd(i) * 3, joy));
      }
    };
  };

  // Domino: quân đầu (đỏ) đổ kéo cả chuỗi — mỗi quân có thể gắn nhãn
  PROPS.dominoes = (P, o, W) => {
    const g = new THREE.Group(), L = (o.items || ['', '', '', '', '', '', '']).map(x => typeof x === 'object' ? x : { text: x }), t0 = A(o.start, o.at ?? .8), dt = o.dt ?? .45;
    const D = L.map((it, i) => { const txt = it.text || '';
      const s = .8 + i * .14, m = new THREE.Mesh(new THREE.BoxGeometry(.75 * s, 1.5 * s, .18 * s), i === 0 ? mat(P.accent2) : i === L.length - 1 ? mat(P.ink) : mat(i % 2 ? P.floor : P.cool));
      const piv = new THREE.Group(); const a = -.9 + i * .32, r = 3.4; piv.position.set(Math.sin(a) * r - .2, 0, -Math.cos(a) * r + 2.6 - i * .05); piv.rotation.y = -a;
      m.position.set(0, .75 * s, 0); piv.add(m); g.add(piv);
      let lab = null; if (txt) { lab = label(txt, { bg: i === 0 ? P.accent2 : P.ink, color: '#fff', h: .3 }); lab.position.set(0, 1.5 * s + .45, 0); piv.add(lab); }
      return { piv, s, lab, at: it.at };
    });
    shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 1.2, 1.2], size: 1.0,
      update(t) {
        D.forEach((d, i) => {
          const q = io((t - (d.at ?? (t0 + i * dt))) / .55), last = i === D.length - 1, maxA = last ? 1.5 : 1.12;
          d.piv.rotation.x = -maxA * q; d.piv.children[0].position.z = 0; if (d.lab) d.lab.material.opacity = 1;
          if (last) d.piv.children[0].material.emissiveIntensity = 0;
        });
      }
    };
  };

  // Cụm kéo theo: vật chính bật ra, các vật phụ lần lượt bay tới quanh nó, nối bằng dây
  PROPS.cluster = (P, o, W) => {
    const g = new THREE.Group(), items = o.items || [{ text: 'A' }, { text: 'B' }, { text: 'C' }], t0 = A(o.start, o.at ?? .4), dt = o.dt ?? .7;
    const core = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.7, .14), mat(P.ink, { roughness: .3 })); const scr = new THREE.Mesh(new THREE.PlaneGeometry(.78, 1.5), mat(P.cool, { emissive: P.cool, emissiveIntensity: .5 })); scr.position.z = .075; core.add(scr);
    const cg = new THREE.Group(); cg.add(core); cg.position.y = 1.8; g.add(cg);
    const cl0 = label(o.core || 'Điện thoại mới', { bg: P.accent, color: P.ink, h: .34 }); cl0.position.set(0, .55, .6); g.add(cl0);
    const shapes = [() => new THREE.BoxGeometry(.6, 1.1, .12), () => new THREE.TorusGeometry(.3, .1, 12, 24), () => new THREE.CylinderGeometry(.32, .32, .14, 24), () => new THREE.SphereGeometry(.3, 18, 14), () => new THREE.BoxGeometry(.5, .5, .5)];
    const S = items.map((it, i) => {
      const m = new THREE.Mesh(shapes[i % shapes.length](), i % 2 ? mat(P.accent2) : gold(P)); const a = Math.PI * (-.12 + 1.24 * (i + .5) / items.length), r = 2.5;
      const grp = new THREE.Group(); grp.add(m); g.add(grp);
      const lb = label(it.text, { bg: P.ink, color: '#fff', h: .34 }); lb.position.y = -.75; grp.add(lb);
      const ln = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1, 6), mat(P.accent)); g.add(ln);
      return { grp, m, a, r, ln, at: it.at ?? t0 + .6 + i * dt };
    });
    shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 2.2, 0], size: 1.0,
      update(t) {
        const c = back((t - t0) / .6); cg.scale.setScalar(Math.max(.001, c)); cg.rotation.y = Math.sin(t * .8) * .35; cl0.visible = t > t0;
        S.forEach((s, i) => {
          const q = out3((t - s.at) / .7), x = Math.cos(s.a) * s.r * q, y = 1.8 + Math.sin(s.a) * s.r * q * .75 + Math.sin(t * 1.5 + i) * .06, z = .3 * q;
          s.grp.position.set(x, y, z); s.grp.scale.setScalar(Math.max(.001, back((t - s.at) / .6))); s.m.rotation.set(t * .7 + i, t * .9, 0);
          const len = Math.hypot(x, y - 1.8, z); s.ln.visible = q > .05; s.ln.scale.y = Math.max(.001, len * .8); s.ln.position.set(x / 2, (y + 1.8) / 2, z / 2);
          if (len > .01) s.ln.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y - 1.8, z).normalize());
        });
      }
    };
  };

  // Chia dòng: xu chảy từ ống; từ `at` một van rẽ phần `frac` vào hũ tiết kiệm (mực dâng), phần còn lại ra đĩa chi tiêu
  PROPS.split = (P, o, W) => {
    const g = new THREE.Group(), N = 60, t0 = A(o.open, o.at ?? 1.2), frac = o.frac ?? .5;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1.4, 16), mat(P.ink, { roughness: .4 })); pipe.position.set(0, 4.6, 0); g.add(pipe);
    const valve = new THREE.Mesh(new THREE.BoxGeometry(1.4, .12, .5), mat(P.cool, { emissive: P.cool, emissiveIntensity: .35 })); valve.position.set(0, 2.8, 0); g.add(valve);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, 1.9, 36, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: .25, roughness: .05, side: THREE.DoubleSide })); jar.position.set(-1.6, .95, 0); g.add(jar);
    const lvl = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 1, 36), gold(P)); g.add(lvl);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(.9, .6, .3, 32), mat(P.accent2)); dish.position.set(1.7, .15, 0); g.add(dish);
    const l1 = label(o.save || 'Tiết kiệm', { bg: P.accent, color: P.ink, h: .34 }); l1.position.set(-1.6, 2.35, 1.0); g.add(l1);
    const l2 = label(o.spend || 'Chi tiêu', { bg: P.accent2, color: P.ink, h: .34 }); l2.position.set(1.8, 1.0, 1.1); g.add(l2);
    const l3 = label(o.top || 'Khoản tăng lương', { bg: P.ink, color: '#fff', h: .32 }); l3.position.set(1.15, 5.0, 0); g.add(l3);
    const cs = coins(P, N); g.add(cs); shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 2.3, 0], size: 1.05,
      update(t) {
        const on = io((t - t0) / .6); valve.rotation.z = lerp(0, .38, on); valve.position.x = 0;
        for (let i = 0; i < N; i++) {
          const life = 1.6, ph = ((t + i * (life / N)) % life) / life, left = rnd(i) < frac * on;
          let x = 0, y, z = (rnd(i + 3) - .5) * .2;
          if (ph < .5) { y = 4.0 - ph / .5 * 1.1; x = (rnd(i + 2) - .5) * .2; }
          else { const u = (ph - .5) / .5, tx = left ? -1.6 : 1.7, ty = left ? .3 + .2 : .4; x = lerp(0, tx, io(u)) + (rnd(i + 2) - .5) * .3; y = lerp(2.9, ty, u * u) + Math.sin(u * Math.PI) * .5; }
          setI(cs, i, x, y, z, rnd(i) * 6 + t * 3, rnd(i + 1) * 6, 0, 1);
        }
        cs.instanceMatrix.needsUpdate = true;
        const lv = .1 + 1.6 * out3((t - t0 - .4) / Math.max(1, (o.fillDur || 5))) * (o.fillTo ?? .8);
        lvl.scale.y = lv; lvl.position.set(-1.6, lv / 2 + .02, 0);
      }
    };
  };

  // Hũ dâng: mực vàng dâng từ `from` lên `to` (0..1), dùng với num để đếm số
  PROPS.jar = (P, o, W) => {
    const g = new THREE.Group(), t0 = A(o.fill, o.at ?? .5), du = o.dur ?? 2.5;
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: .22, roughness: .05, side: THREE.DoubleSide })); jar.position.y = 1.6; g.add(jar);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, .2, 40), mat(P.side)); lid.position.y = 3.3; g.add(lid);
    const lvl = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 1, 40), gold(P)); g.add(lvl);
    const marks = (o.marks || []).map(m => { const r = new THREE.Mesh(new THREE.TorusGeometry(1.12, .02, 6, 48), mat(P.cool, { emissive: P.cool, emissiveIntensity: .5 })); r.rotation.x = Math.PI / 2; r.position.y = .05 + m.v * 3.1; g.add(r); const l = label(m.text, { bg: P.cool, color: P.ink, h: .28 }); l.position.set(1.75, .05 + m.v * 3.1, 0); g.add(l); return r; });
    const p = person(P); p.g.position.set(-1.9, 0, .7); p.g.rotation.y = .7; g.add(p.g);
    shadowy(g); W.sc.add(g);
    return {
      g, focus: [0, 2.0, 0], size: 1.0,
      update(t) { const v = lerp(o.from ?? .1, o.to ?? .6, out3((t - t0) / du)) * 3.1; lvl.scale.y = Math.max(.01, v); lvl.position.y = v / 2 + .05; pose(p, t > t0 + du ? 'cheer' : 'point', t, .6); }
    };
  };

  // Sân khấu trống + nhân vật theo `pose` (dùng cho câu chốt, câu hỏi)
  PROPS.stage = (P, o, W) => {
    const p = person(P); W.sc.add(p.g); p.g.rotation.y = o.ry ?? .3;
    return { g: p.g, focus: [0, 1.1, 0], size: .5, update(t) { pose(p, o.pose || 'idle', t); } };
  };

  /* ---------- VẬT ẨN DỤ DO AI VIẾT CHO TỪNG VIDEO (storyboard.props = {tên: mã}) ----------
     Mã là thân một hàm nhận (THREE, K) và trả về (P, o, W) => ({g, focus, size, update(t)}) như các vật trên.
     K = bộ công cụ dùng chung (vật liệu, chữ, nhân vật, đường cong) để vật mới cùng phong cách với cả kênh.
     Lỗi (biên dịch hay khi chạy) không làm hỏng video: cảnh dùng nhân vật đứng thay và lỗi được ghi vào HBX_ERRORS. */
  const KIT = { mat, gold, label, person, pose, coins, setI, shadowy, cl, io, out3, back, rnd, lerp, A, TAU };
  window.HBX_ERRORS = window.HBX_ERRORS || [];
  const CUSTOM = {};
  function custom(name) {
    if (name in CUSTOM) return CUSTOM[name];
    const code = (((window.HBX && window.HBX._sb) || {}).props || {})[name];
    let mk = null;
    if (typeof code === 'string') {
      try { mk = new Function('THREE', 'K', '"use strict";\n' + code)(THREE, KIT); if (typeof mk !== 'function') throw new Error('mã không trả về hàm (P, o, W) => {...}'); }
      catch (e) { HBX_ERRORS.push({ prop: name, step: 'compile', error: String(e && e.message || e) }); mk = null; }
    }
    if (mk) { // a prop that throws while building or moving gives way to the stand-in, the rest of the video goes on
      const inner = mk;
      mk = (P, o, W) => {
        let r; try { r = inner(P, o, W); if (!r || !r.g || typeof r.update !== 'function') throw new Error('thiếu g hoặc update'); }
        catch (e) { HBX_ERRORS.push({ prop: name, step: 'build', error: String(e && e.message || e) }); return PROPS.stage(P, o, W); }
        const up = r.update.bind(r); let bad = false;
        r.update = (t) => { if (bad) return; try { up(t); } catch (e) { bad = true; HBX_ERRORS.push({ prop: name, step: 'update', error: String(e && e.message || e) }); } };
        return r;
      };
    }
    return (CUSTOM[name] = mk);
  }

  /* ---------- máy quay ---------- */
  // khoảng cách tính cho vật cao ~5 đơn vị (nhân với `size` của từng vật); khung dọc 9:16
  const CAMK = {
    orbit: { d0: 13, d1: 12.2, h0: 4.2, h1: 4.6, a0: -26, a1: 14 },
    push: { d0: 15, d1: 10.5, h0: 3.8, h1: 3.2, a0: 10, a1: 4 },
    pull: { d0: 9.5, d1: 15.5, h0: 2.6, h1: 6, a0: -10, a1: -4 },
    rise: { d0: 12, d1: 13.5, h0: 1.0, h1: 8.5, a0: 20, a1: 8 },
    low: { d0: 11, d1: 10, h0: .7, h1: 1.1, a0: -32, a1: -18 },
    top: { d0: 6, d1: 5.4, h0: 15, h1: 14, a0: 0, a1: 20 },
    side: { d0: 12.5, d1: 11.5, h0: 3, h1: 3.3, a0: 70, a1: 80 },
  };
  function camAt(S, lt, dur, focus, size) {
    const list = S.cams || [Object.assign({ at: 0 }, S.cam || {})];
    let i = 0; for (let k = 0; k < list.length; k++) if (lt >= (list[k].at || 0)) i = k;
    const c = Object.assign({}, CAMK[list[i].kind || 'orbit'], list[i]), a = c.at || 0, b = list[i + 1] ? list[i + 1].at : dur;
    const ramp = q => 1 - Math.pow(1 - q, 2.2);
    const q = ramp(cl((lt - a) / Math.max(.3, b - a))), tg = c.target || focus, z = (c.size || size || 1);
    const d = lerp(c.d0, c.d1, q) * z, h = lerp(c.h0, c.h1, q) * z, an = lerp(c.a0, c.a1, q) * Math.PI / 180;
    return { pos: [tg[0] + Math.sin(an) * d, tg[1] + h - 1, tg[2] + Math.cos(an) * d], tg, fov: c.fov || 38, roll: c.roll || 0 };
  }

  /* ---------- cảnh ---------- */
  const at = (o, d) => (o && o.at !== undefined ? o.at : d);
  X.scenes.m_scene = (s, c) => {
    const { esc, rich } = U();
    let h = `<div class="m3"><canvas class="m3c" width="720" height="1280"></canvas><div class="m3vig"></div>`;
    if (s.tag) h += `<div class="m3tag" data-in="${at(s.tag, .5)}" data-a="pop"><b>${esc(s.tag.en || '')}</b>${s.tag.vi ? `<small>${esc(s.tag.vi)}</small>` : ''}</div>`;
    const tl = Array.isArray(s.title) ? s.title : s.title ? [s.title] : [];
    if (tl.length) h += `<div class="m3title" data-in="${s.titleAt ?? .3}" data-a="up">${tl.map((l, i) => `<div class="m3t${i + 1}">${rich(l)}</div>`).join('')}</div>`;
    if (s.num) { const n = s.num, t0 = at(n, .6); h += `<div class="m3num" data-in="${t0}" data-a="pop"><div class="m3n">${esc(n.prefix || '')}<span class="cnt" data-from="${n.from ?? 0}" data-to="${n.value}" data-dec="${n.decimals || 0}" data-t="${t0 + .1}" data-dur="${n.dur || 2.2}">${n.from ?? 0}</span>${esc(n.suffix || '')}</div>${n.caption ? `<small>${rich(n.caption)}</small>` : ''}</div>`; }
    if (s.label) h += `<div class="clabel" data-in=".3" data-a="left"><b>${String(c.i + 1).padStart(2, '0')}</b>${esc(s.label)}</div>`;
    const sfx = [s.tag && `<i class="cm" data-in="${at(s.tag, .5)}" data-a="none" data-sfx="pop"></i>`, s.num && `<i class="cm" data-in="${at(s.num, .6) + 2.2}" data-a="none" data-sfx="impact"></i>`].filter(Boolean).join('');
    return { cam: 'still', html: h + sfx };
  };

  const CACHE = new Map();
  function sceneOf(o) {
    if (CACHE.has(o)) return CACHE.get(o);
    const P = PAL(), s = o.s, W = world(P, s.world || {});
    const mk = PROPS[s.prop] || custom(s.prop) || PROPS.stage, pr = mk(P, Object.assign({}, s.o || {}), W);
    const cam = new THREE.PerspectiveCamera(38, 720 / 1280, .1, 200);
    const v = { W, pr, cam, cv: o.el.querySelector('.m3c') };
    const dsf = window.devicePixelRatio || 1; v.cv.width = Math.round(720 * dsf); v.cv.height = Math.round(1280 * dsf);
    o.el.querySelector('.m3').style.background = `linear-gradient(180deg, ${P.sky[0]} 0%, ${P.sky[1]} 100%)`;
    CACHE.set(o, v); return v;
  }

  X.update.push((o, lt) => {
    if (o.s.type !== 'm_scene' || !window.THREE) return;
    const v = sceneOf(o), t = Math.max(0, lt), s = o.s;
    v.pr.update(t);
    v.W.deb.forEach((m, i) => { const u = m.userData; m.position.y = u.y + Math.sin(t * u.s + u.p) * .35; m.rotation.set(t * .1 * u.s, t * .15 * u.s + i, 0); });
    const c = camAt(s, t, o.dur, v.pr.focus || [0, 1.2, 0], v.pr.size);
    v.cam.fov = c.fov; v.cam.updateProjectionMatrix(); v.cam.position.set(...c.pos); v.cam.lookAt(...c.tg);
    if (c.roll) v.cam.rotateZ(c.roll * Math.PI / 180);
    const r = renderer(); r.setClearColor(0x000000, 0); r.render(v.W.sc, v.cam);
    const g = v.cv.getContext('2d'); g.clearRect(0, 0, v.cv.width, v.cv.height); g.drawImage(r.domElement, 0, 0);
  });
  X.trSfx.cut = X.trSfx.cut || 'impact';
  window.HBX_META3D = { PROPS, CAMK, KIT };
})();
