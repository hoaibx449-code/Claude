/* Hành trình 3D (v_scene) — kiểu "Đòn Bẩy Tư Duy": máy quay dẫn người xem đi qua những không gian ẩn dụ
   (hành lang đêm, văn phòng vắng, cánh cửa sáng, con đường, bậc thang, cây cầu, phố, đỉnh núi, bầu trời), ánh sáng
   đi theo cảm xúc (lạnh tối → ấm → rực → bình minh), máy quay không bao giờ đứng yên.

   Cảnh: { type: 'v_scene', space: { kind, mood, mood2?, seed? }, u: [u0, u1], walker?: true, prop?: tên,
           title?: [dòng], pops?: [{text, at, kind: num|term|word}], closing?: 'câu chốt', source?: 'Nguồn: …' }
   - u: đoạn đường của không gian mà cảnh này đi qua (0 → 1). Các câu liền nhau trong cùng một không gian đi tiếp
     đúng chỗ câu trước dừng, nên cắt giữa chúng là liền mạch như một cú máy.
   - mood2: ánh sáng chuyển dần tới mood này trong cảnh (vd cold → warm khi hy vọng hé ra). */
(() => {
  const X = window.HBX_EXT, M = () => window.HBX_META3D, U = () => window.HBX_UTIL;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
  const io = t => (t = clamp(t), t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const FRAME = () => (((window.HBX && window.HBX._sb) || {}).ar === '16:9' ? [1280, 720] : [720, 1280]);

  // ánh sáng theo cảm xúc: bầu trời (trên, dưới), sương, ánh sáng chính, đèn trong không gian (0 = tắt, 1 = sáng)
  const MOODS = {
    cold:   { sky: ['#05080f', '#142238'], fog: '#0d1626', fogN: 6, fogF: 46, hemi: ['#7d95c4', '#05070c', .45], key: ['#9db8ff', .55], lamps: .25, ground: '#141b28', sun: 0 },
    dim:    { sky: ['#11131c', '#2e3346'], fog: '#22273a', fogN: 8, fogF: 55, hemi: ['#a7b0cc', '#0c0d12', .65], key: ['#c7d2f0', .8], lamps: .5, ground: '#262b38', sun: 0 },
    warm:   { sky: ['#2b1d2c', '#c7764e'], fog: '#5a3a3a', fogN: 12, fogF: 70, hemi: ['#ffd2a6', '#2a1a20', 1.0], key: ['#ffc58a', 1.6], lamps: .9, ground: '#4a3a36', sun: .5 },
    bright: { sky: ['#ffb36b', '#fff1d0'], fog: '#ffd9a6', fogN: 18, fogF: 95, hemi: ['#fff3dc', '#7a5a46', 1.5], key: ['#fff1d6', 2.6], lamps: 1, ground: '#d9b994', sun: 1 },
    dawn:   { sky: ['#5b6fa8', '#ffb07a'], fog: '#e8a985', fogN: 16, fogF: 110, hemi: ['#ffe2c4', '#3c3550', 1.3], key: ['#ffd1a0', 2.2], lamps: .2, ground: '#8a7a86', sun: 1 },
  };
  const C = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  function moodAt(s, q) {
    // q: how far through the scene; space.q = the part of the whole space this scene covers (the light turns once per space)
    const r = Array.isArray(s.space.q) ? lerp(+s.space.q[0], +s.space.q[1], q) : q;
    const a = MOODS[s.space.mood] || MOODS.dim, b = MOODS[s.space.mood2] || a, k = io(r);
    if (a === b) return a;
    return { sky: [C(a.sky[0], b.sky[0], k), C(a.sky[1], b.sky[1], k)], fog: C(a.fog, b.fog, k), fogN: lerp(a.fogN, b.fogN, k), fogF: lerp(a.fogF, b.fogF, k),
      hemi: [C(a.hemi[0], b.hemi[0], k), C(a.hemi[1], b.hemi[1], k), lerp(a.hemi[2], b.hemi[2], k)], key: [C(a.key[0], b.key[0], k), lerp(a.key[1], b.key[1], k)],
      lamps: lerp(a.lamps, b.lamps, k), ground: C(a.ground, b.ground, k), sun: lerp(a.sun, b.sun, k) };
  }

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .8, metalness: 0 }, o));
  const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  // a light to look into (a door, the sun): a soft disc of additive glow
  function halo(r, color) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
    sp.scale.set(r, r, 1); return sp;
  }

  /* ---------- KHÔNG GIAN: mỗi cái dựng dọc trục -z, trả về đường máy quay path(u) và chỗ nhân vật đứng/đi ---------- */
  // path(u) → { pos, tg }; who(u) → [x, y, z] chỗ người đi bộ (null: không có người); lamps: vật phát sáng theo mood
  const SPACES = {
    corridor(P, L = 40) { // hành lang: cột hai bên, đèn trần thưa, cuối hành lang là khe sáng
      const g = new THREE.Group(), lamps = [], wall = mat('#3a4150'), col = mat('#566074', { roughness: .6 });
      g.add(put(box(7, .1, L + 10, mat('#2a303c', { roughness: .4, metalness: .2 })), 0, -.05, -L / 2));
      for (const x of [-3.5, 3.5]) g.add(put(box(.3, 5, L + 10, wall), x, 2.5, -L / 2));
      g.add(put(box(7, .2, L + 10, wall), 0, 5, -L / 2));
      for (let z = 2; z > -L - 4; z -= 4) {
        for (const x of [-3.1, 3.1]) g.add(put(box(.5, 5, .5, col), x, 2.5, z));
        const l = box(2.6, .06, .5, glow('#dfe8ff', .9)); l.position.set(0, 4.88, z - 2); g.add(l); lamps.push(l);
      }
      const end = box(2.4, 4, .1, new THREE.MeshBasicMaterial({ color: '#fff6e2', transparent: true, fog: false, toneMapped: false })); end.position.set(0, 2, -L - 4.5); g.add(end); const h = halo(9, '#fff1d0'); h.position.set(0, 2.2, -L - 4); g.add(h); lamps.push(end, h);
      return { g, lamps, path: u => ({ pos: [Math.sin(u * 3) * .35, 1.75 + Math.sin(u * 9) * .04, 3 - u * (L - 2)], tg: [0, 1.65, -3 - u * (L - 2) - 6] }), who: u => [0, 0, -1 - u * (L - 2)] };
    },
    office(P, L = 36) { // văn phòng vắng: hàng bàn, ghế, màn hình (tắt khi lạnh)
      const g = new THREE.Group(), lamps = [], desk = mat('#c9c2b6'), chair = mat('#3b4250'), scr = [];
      g.add(put(box(18, .1, L + 12, mat('#5a5f69', { roughness: .9 })), 0, -.05, -L / 2));
      for (let z = 0, k = 0; z > -L - 4; z -= 3.2) for (const x of [-4.6, -2.2, 2.2, 4.6]) {
        k++; const d = box(1.8, .08, 1.1, desk); d.position.set(x, .75, z); g.add(d);
        const leg = box(1.7, .7, .06, chair); leg.position.set(x, .38, z - .5); g.add(leg);
        const c = box(.55, .08, .55, chair); c.position.set(x + (rnd(k) - .5) * .4, .48, z + .85); c.rotation.y = (rnd(k + 3) - .5) * .9; g.add(c);
        const cb = box(.55, .6, .07, chair); cb.position.set(c.position.x, .82, z + 1.12); cb.rotation.y = c.rotation.y; g.add(cb);
        const m = box(.75, .45, .04, glow('#9fc6ff', .8)); m.position.set(x, 1.05, z - .3); g.add(m); scr.push(m);
      }
      for (let z = 0; z > -L; z -= 6) { const l = box(5, .05, .4, glow('#eef3ff', .8)); l.position.set(0, 3.6, z); g.add(l); lamps.push(l); }
      return { g, lamps: lamps.concat(scr), path: u => ({ pos: [Math.sin(u * 2.4) * .6, 2.3 - u * .4, 4 - u * (L - 4)], tg: [0, 1.0, -4 - u * (L - 4)] }), who: () => null };
    },
    door(P, L = 18) { // căn phòng tối, cuối phòng là cánh cửa hắt sáng: máy quay đẩy vào khe sáng
      const g = new THREE.Group(), lamps = [];
      g.add(put(box(10, .1, L + 6, mat('#1d2129')), 0, -.05, -L / 2));
      const back = box(10, 7, .3, mat('#262b35')); back.position.set(0, 3.5, -L); g.add(back);
      const fr = mat('#6b5a48'); [[-1.15, 1.6, .2, 3.4], [1.15, 1.6, .2, 3.4], [0, 3.35, 2.5, .2]].forEach(([x, y, w, h]) => { const b = box(w, h, .4, fr); b.position.set(x, y, -L + .2); g.add(b); });
      const light = box(2.1, 3.2, .05, new THREE.MeshBasicMaterial({ color: '#fff7e6', transparent: true, fog: false, toneMapped: false })); light.position.set(0, 1.6, -L + .1); g.add(light);
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, L * .8), glow('#ffe7b8', .18)); beam.rotation.x = -Math.PI / 2; beam.position.set(0, .02, -L * .55); g.add(beam);
      const h = halo(12, '#ffeccc'); h.position.set(0, 1.7, -L + .5); g.add(h); lamps.push(light, beam, h);
      return { g, lamps, alwaysOn: [light, h], path: u => ({ pos: [0, 1.6 + u * .1, 4 - io(u) * (L + 1.2)], tg: [0, 1.6, -L - 2] }), who: u => (u < .75 ? [0, 0, 4 - io(u) * (L + 1.2) - 5.5] : null) };
    },
    road(P, L = 60) { // con đường: vạch kẻ, đèn hai bên, đồi xa; máy quay bay thấp dọc đường
      const g = new THREE.Group(), lamps = [];
      g.add(put(box(80, .1, L + 40, mat('#3c4a3c', { roughness: 1 })), 0, -.08, -L / 2));
      g.add(put(box(4.2, .06, L + 40, mat('#30333a', { roughness: .7 })), 0, 0, -L / 2));
      for (let z = 4; z > -L - 16; z -= 3) { const d = box(.14, .07, 1.3, mat('#e9e2c8')); d.position.set(0, .01, z); g.add(d); }
      for (let z = 0, k = 0; z > -L - 16; z -= 8, k++) for (const x of [-3, 3]) {
        const p = box(.12, 3.2, .12, mat('#4a4f58')); p.position.set(x, 1.6, z); g.add(p);
        const b = halo(1.6, '#ffd9a0'); b.position.set(x * .92, 3.2, z); g.add(b); lamps.push(b);
      }
      for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(4 + rnd(i) * 6, 3 + rnd(i + 1) * 6, 7), mat(i % 2 ? '#3f5a4a' : '#56705a', { flatShading: true })); c.position.set((i % 2 ? 1 : -1) * (14 + rnd(i + 2) * 18), 1, -rnd(i + 5) * (L + 20)); g.add(c); }
      return { g, lamps, path: u => ({ pos: [Math.sin(u * 2) * .8, 1.3 + Math.sin(u * 5) * .15, 4 - u * L], tg: [0, 1.2, -6 - u * L] }), who: u => [.5, 0, -1.5 - u * L] };
    },
    stairs(P, L = 26) { // bậc thang đi lên: mỗi bậc là một cột mốc
      const g = new THREE.Group(), lamps = [], step = mat('#b9b2a6'), n = 30, rise = .32, run = L / n;
      for (let i = 0; i < n; i++) { const b = box(3.2, rise, run, step); b.position.set(0, i * rise + rise / 2, -i * run); g.add(b);
        if (i % 5 === 4) { const m = halo(1.4, '#ffe2a8'); m.position.set(1.9, i * rise + 1.2, -i * run); g.add(m); lamps.push(m); } }
      const top = box(6, .3, 6, step); top.position.set(0, n * rise, -L - 2.5); g.add(top);
      const yAt = z => clamp(-z / run, 0, n) * rise;
      return { g, lamps, path: u => { const z = 4 - u * (L + 2); return { pos: [Math.sin(u * 3) * 1.2 + 1.5, yAt(z) + 2.2, z], tg: [0, yAt(z - 6) + 1.2, z - 6] }; },
        who: u => { const z = 4 - u * (L + 2) - 5; return z < -L ? null : [0, yAt(z) + .02, z]; } };
    },
    bridge(P, L = 44) { // cây cầu qua khoảng trống mù sương
      const g = new THREE.Group(), lamps = [], deck = mat('#7a6a58');
      g.add(put(box(2.6, .2, L + 8, deck), 0, 0, -L / 2));
      for (let z = 2; z > -L - 4; z -= 2.2) for (const x of [-1.3, 1.3]) { const p = box(.08, 1.1, .08, mat('#4d4238')); p.position.set(x, .6, z); g.add(p); }
      for (const x of [-1.3, 1.3]) { const r = box(.06, .06, L + 8, mat('#4d4238')); r.position.set(x, 1.15, -L / 2); g.add(r); }
      for (let i = 0; i < 4; i++) { const t = box(.4, 9, .4, mat('#5a4e44')); t.position.set(i % 2 ? 1.6 : -1.6, 3.5, -L * (.2 + .25 * Math.floor(i / 2))); g.add(t); const l = halo(2, '#ffdcb0'); l.position.set(t.position.x, 8.2, t.position.z); g.add(l); lamps.push(l); }
      return { g, noGround: true, lamps, path: u => ({ pos: [2.6 * Math.cos(u * 2.2), 2.4 + Math.sin(u * 3) * .4, 3 - u * (L - 2)], tg: [0, 1, -6 - u * (L - 2)] }), who: u => [0, .1, -1 - u * (L - 2)] };
    },
    city(P, L = 60) { // phố: khối nhà hai bên, cửa sổ sáng theo mood; máy quay bay giữa các toà nhà
      const g = new THREE.Group(), lamps = [];
      g.add(put(box(60, .1, L + 30, mat('#2a2e36')), 0, -.05, -L / 2));
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x2 = cv.getContext('2d'); x2.fillStyle = '#000'; x2.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) if (rnd(i * 31 + j) < .55) { x2.fillStyle = rnd(i + j * 7) < .5 ? '#ffd7a0' : '#cfe3ff'; x2.fillRect(4 + i * 7.6, 4 + j * 7.6, 4, 4); }
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
      for (let z = 0, k = 0; z > -L - 20; z -= 7, k++) for (const sgn of [-1, 1]) {
        const h = 6 + rnd(k * 2 + (sgn > 0)) * 16, b = box(5, h, 5, mat('#3b4150', { emissive: '#ffffff', emissiveMap: tx, emissiveIntensity: .9 }));
        b.position.set(sgn * (6 + rnd(k + 9) * 2), h / 2, z); g.add(b); lamps.push(b);
      }
      return { g, lamps, emissiveLamps: true, path: u => ({ pos: [Math.sin(u * 2.5) * 1.5, 5 + u * 3, 6 - u * L], tg: [0, 4, -8 - u * L] }), who: () => null };
    },
    peak(P, L = 30) { // đỉnh núi lúc bình minh: máy quay lên cao rồi lùi ra cho thấy khoảng rộng
      const g = new THREE.Group(), lamps = [];
      const main = new THREE.Mesh(new THREE.ConeGeometry(9, 9, 9, 3), mat('#7d6f74', { flatShading: true })); main.position.set(0, 4.5 - 4.5, -L); main.scale.y = 1; g.add(main);
      for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(5 + rnd(i) * 7, 4 + rnd(i + 1) * 7, 8), mat(i % 2 ? '#6c6170' : '#8a7c80', { flatShading: true })); c.position.set((rnd(i + 2) - .5) * 70, 0, -L - 10 - rnd(i + 3) * 40); g.add(c); }
      const sun = halo(26, '#ffd9a0'); sun.position.set(-6, 9, -L - 60); g.add(sun); const core = new THREE.Mesh(new THREE.CircleGeometry(3, 40), glow('#fff2cf', 1)); core.position.set(-6, 9, -L - 59); g.add(core);
      lamps.push(sun, core);
      return { g, lamps, alwaysOn: [sun, core], path: u => ({ pos: [Math.sin(u * 1.6) * 9, 3 + u * 6, -L + 16 + u * 6], tg: [0, 4 + u * 1.5, -L] }), who: () => [0, 4.5 + .02, -L] };
    },
    sky(P, L = 40) { // khoảng trời mở: mây, chân trời, mặt trời; máy quay bay lên
      const g = new THREE.Group(), lamps = [], cl = mat('#fff4ea', { roughness: 1 });
      for (let i = 0; i < 26; i++) { const c = new THREE.Group(); for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1.2 + rnd(i * 9 + k) * 1.6, 14, 10), cl); s.position.set(k * 1.5, rnd(i + k) * .6, rnd(k + i * 3) * .8); c.add(s); }
        c.position.set((rnd(i) - .5) * 40, -3 + rnd(i + 1) * 4, -rnd(i + 2) * (L + 30)); g.add(c); }
      const sun = halo(30, '#ffe0aa'); sun.position.set(0, 6, -L - 50); g.add(sun); lamps.push(sun);
      return { g, noGround: true, lamps, alwaysOn: [sun], path: u => ({ pos: [0, 1 + u * 7, 6 - u * L * .7], tg: [0, 3 + u * 2, -30 - u * L] }), who: () => null };
    },
  };

  /* ---------- dựng một cảnh ---------- */
  const CACHE = new Map();
  function build(o) {
    if (CACHE.has(o)) return CACHE.get(o);
    const s = o.s, P = M().PAL(), K = M().KIT, kind = SPACES[s.space && s.space.kind] ? s.space.kind : 'corridor';
    const sc = new THREE.Scene(), sp = SPACES[kind](P), m0 = moodAt(s, 0);
    sc.fog = new THREE.Fog(m0.fog, m0.fogN, m0.fogF);
    const hemi = new THREE.HemisphereLight(m0.hemi[0], m0.hemi[1], m0.hemi[2]); sc.add(hemi);
    const key = new THREE.DirectionalLight(m0.key[0], m0.key[1]); key.position.set(-6, 12, 6); sc.add(key);
    let ground = null;
    if (!sp.noGround) { ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(m0.ground, { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.12; sc.add(ground); }
    sc.add(sp.g);
    // dust in the light: depth, and the sense of moving through air
    const n = 220, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd(i) - .5) * 14; pos[i * 3 + 1] = rnd(i + 1) * 7; pos[i * 3 + 2] = 6 - rnd(i + 2) * 70; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#fff2dc', size: .05, transparent: true, opacity: .55, depthWrite: false })); sc.add(dust);
    let walker = null;
    if (s.walker !== false && sp.who && sp.who(0)) { walker = K.person(P, '#f1e6d6'); walker.g.scale.setScalar(.95); sc.add(walker.g); }
    let prop = null;
    if (s.prop) { const mk = M().PROPS[s.prop] || M().custom(s.prop); if (mk) try { const W = { sc, deb: [] }; prop = mk(P, Object.assign({}, s.o || {}), W); const a = sp.who(.5) || sp.path(.6).tg; prop.g.position.set(a[0] + 2.2, a[1], a[2] - 1.5); } catch (e) { prop = null; } }
    const [fw, fh] = FRAME(), cam = new THREE.PerspectiveCamera(fw > fh ? 42 : 54, fw / fh, .1, 260);
    const cv = o.el.querySelector('.vc'), dsf = window.devicePixelRatio || 1; cv.width = Math.round(fw * dsf); cv.height = Math.round(fh * dsf);
    const v = { sc, sp, hemi, key, ground, dust, walker, prop, cam, cv, kind };
    CACHE.set(o, v); return v;
  }

  X.scenes.v_scene = (s, c) => {
    const { esc, rich } = U();
    let h = `<div class="vy"><canvas class="vc"></canvas><div class="vyvig"></div>`;
    const tl = Array.isArray(s.title) ? s.title : s.title ? [s.title] : [];
    if (tl.length) h += `<div class="vytitle">${tl.map((l, i) => `<div data-in="${.25 + i * .22}" data-a="term" data-d=".35" data-out="${s.titleOut ?? 3}">${rich(l)}</div>`).join('')}</div>`;
    (s.pops || []).forEach((p, i) => {
      const at = p.at ?? (.6 + i * 1.2), kind = p.kind === 'num' ? 'stat' : 'term';
      h += `<div class="vypop vy-${esc(p.kind || 'word')}" data-in="${at}" data-a="${kind}" data-d="${kind === 'stat' ? .22 : .32}" data-out="${at + (p.hold ?? 1.8)}" data-sfx="pop">${esc(p.text)}</div>`;
    });
    if (s.closing) h += `<div class="vyclose"><div data-in="${s.closingAt ?? .4}" data-a="close" data-d=".5">${rich(s.closing)}</div></div>`;
    if (s.source) h += `<div class="vysrc" data-in="${s.sourceAt ?? 1.2}" data-a="up">${esc(s.source)}</div>`;
    return { cam: 'still', html: h + '</div>' };
  };

  X.update.push((o, lt) => {
    if (o.s.type !== 'v_scene' || !window.THREE || !M()) return;
    const v = build(o), s = o.s, t = Math.max(0, lt), q = clamp(t / Math.max(.5, o.dur));
    const u0 = (s.u && +s.u[0]) || 0, u1 = (s.u && +s.u[1]) || 1, u = lerp(u0, u1, q);
    // light follows the feeling (and may turn within the scene)
    const m = moodAt(s, q);
    v.sc.fog.color.set(m.fog); v.sc.fog.near = m.fogN; v.sc.fog.far = m.fogF;
    v.hemi.color.set(m.hemi[0]); v.hemi.groundColor.set(m.hemi[1]); v.hemi.intensity = m.hemi[2];
    v.key.color.set(m.key[0]); v.key.intensity = m.key[1];
    if (v.ground) v.ground.material.color.set(m.ground);
    const on = new Set(v.sp.alwaysOn || []);
    v.sp.lamps.forEach((l, i) => {
      const k = on.has(l) ? 1 : clamp(m.lamps * 1.15 - rnd(i) * .35 + .1);
      if (l.material.emissiveIntensity !== undefined && v.sp.emissiveLamps) l.material.emissiveIntensity = .15 + k * 1.1;
      else if (l.material) l.material.opacity = (l.isSprite ? .8 : .95) * k;
    });
    o.el.querySelector('.vy').style.background = `linear-gradient(180deg, ${m.sky[0]} 0%, ${m.sky[1]} 100%)`;
    // the camera never stops: along the space's path, with a slow breathing sway
    const p = v.sp.path(u), sway = Math.sin(t * .9) * .06;
    v.cam.position.set(p.pos[0] + sway, p.pos[1] + Math.sin(t * 1.3) * .03, p.pos[2]); v.cam.lookAt(p.tg[0], p.tg[1], p.tg[2]);
    if (v.walker) { const w = v.sp.who(Math.min(1, u + .02)); if (w) { v.walker.g.visible = true; v.walker.g.position.set(w[0], w[1], w[2]); v.walker.g.rotation.y = Math.PI; M().KIT.pose(v.walker, s.space.kind === 'peak' ? (q > .5 ? 'cheer' : 'idle') : 'walk', t, .8); } else v.walker.g.visible = false; }
    if (v.prop) try { v.prop.update(t + (+s.pt0 || 0)); } catch (e) { /* the prop stops, the journey goes on */ }
    const a = v.dust.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.array[i * 3 + 1] = (rnd(i + 1) * 7 + t * (.05 + rnd(i) * .08)) % 7; a.needsUpdate = true;
    v.dust.position.z = p.pos[2] - 2;
    const r = M().renderer(); r.setClearColor(0x000000, 0); r.render(v.sc, v.cam);
    const g = v.cv.getContext('2d'); g.clearRect(0, 0, v.cv.width, v.cv.height); g.drawImage(r.domElement, 0, 0, v.cv.width, v.cv.height);
  });
  X.trSfx.flash = X.trSfx.flash || 'impact';
})();
