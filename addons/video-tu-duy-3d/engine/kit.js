// kit.js — HẠ TẦNG cho cảnh 3D (không phải mẫu hình ảnh).
// Cung cấp: renderer/camera/sương/ánh sáng theo world.json, thời gian theo timeline.json,
// bộ chuyển động máy quay, easing, số ngẫu nhiên có seed, vật liệu theo "material".
// Thế giới, vật ẩn dụ, bố cục: MỖI VIDEO TỰ VIẾT trong scene.html.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export { THREE };

export const ease = {
  linear: t => t,
  inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const lerp = (a, b, t) => a + (b - a) * t;
// tiến trình 0..1 của khoảng [a,b] tại t
export const prog = (t, a, b, fn = ease.inOut) => fn(clamp01((t - a) / Math.max(1e-6, b - a)));

// Tia sáng mềm (god rays giả): mặt phẳng gradient cộng sáng. Trả về Mesh; chỉnh .material.opacity theo thời gian.
export function softBeam(color = '#ffe2b0', w = 2, h = 24) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  const gv = x.createLinearGradient(0, 0, 0, 256); gv.addColorStop(0, 'rgba(255,255,255,1)'); gv.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gv; x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = 'destination-in'; const gh = x.createLinearGradient(0, 0, 64, 0);
  gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(.5, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gh; x.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const g = new THREE.PlaneGeometry(w, h); g.translate(0, -h / 2, 0); return new THREE.Mesh(g, m);
}

export function rng(seed = 1) { // mulberry32 — dùng thay Math.random để render lặp lại được
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Vật liệu gợi ý theo id material trong world.json (tự chỉnh/ghi đè thoải mái)
export function material(id, color, extra = {}) {
  const c = new THREE.Color(color);
  const P = {
    glazed_ceramic: { roughness: .18, metalness: 0, clearcoat: 1, clearcoatRoughness: .1 },
    frosted_glass: { roughness: .45, metalness: 0, transmission: .9, thickness: .6, ior: 1.4 },
    clay: { roughness: .95, metalness: 0 },
    origami: { roughness: .85, metalness: 0, flatShading: true },
    oak: { roughness: .7, metalness: 0 },
    brushed_metal: { roughness: .35, metalness: 1 },
    toy_plastic: { roughness: .25, metalness: 0, clearcoat: .6 },
    marble: { roughness: .2, metalness: 0, clearcoat: .4 },
    felt: { roughness: 1, metalness: 0, sheen: 1, sheenRoughness: .8 },
    water: { roughness: .05, metalness: 0, transmission: .95, ior: 1.33, thickness: 1 },
    sand: { roughness: 1, metalness: 0, flatShading: true },
    ice: { roughness: .1, metalness: 0, transmission: .8, ior: 1.31, thickness: .8 },
    brass: { roughness: .3, metalness: 1 },
    bioluminescent: { roughness: .6, metalness: 0, emissiveIntensity: 1.6 },
    concrete: { roughness: .95, metalness: 0 },
    lacquer: { roughness: .12, metalness: .1, clearcoat: 1 },
  }[id] || { roughness: .6, metalness: 0 };
  const m = new THREE.MeshPhysicalMaterial({ color: c, ...P, ...extra });
  if (id === 'bioluminescent') m.emissive = c.clone();
  return m;
}

// Bộ máy quay: mỗi kiểu trả về {pos, look} cho tiến trình p (0..1) của 1 shot.
// target: Vector3 điểm nhìn; r: khoảng cách; h: độ cao; a: góc bắt đầu (rad); dir: ±1
export function camMove(type, p, o = {}) {
  const T = o.target || new THREE.Vector3(), r = o.r ?? 8, h = o.h ?? 2.5, a = o.a ?? 0, dir = o.dir ?? 1;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  switch (type) {
    case 'lateral_track': { const x = lerp(-r * .6, r * .6, p) * dir; return { pos: V(T.x + x, T.y + h * .6, T.z + r), look: V(T.x + x * .7, T.y, T.z) }; }
    case 'follow': { const f = o.followPos || T; return { pos: V(f.x - r * .7, f.y + h * .5, f.z + r * .5), look: f.clone() }; }
    case 'orbit': { const ang = a + dir * p * Math.PI * .9; return { pos: V(T.x + Math.sin(ang) * r, T.y + h, T.z + Math.cos(ang) * r), look: T.clone() }; }
    case 'top_down': { const ang = a + dir * p * .6; return { pos: V(T.x + Math.sin(ang) * .01, T.y + r * 1.4, T.z + Math.cos(ang) * .01), look: T.clone(), up: V(Math.sin(ang), 0, -Math.cos(ang)) }; }
    case 'macro': { const d = lerp(r * .32, r * .22, p); return { pos: V(T.x + d * .7 * dir, T.y + h * .15, T.z + d), look: T.clone(), fov: 24 }; }
    case 'push_in': { const d = lerp(r * 1.1, r * .55, p); return { pos: V(T.x + Math.sin(a) * d, T.y + h * lerp(1, .6, p), T.z + Math.cos(a) * d), look: T.clone() }; }
    case 'crane_reveal': { return { pos: V(T.x + Math.sin(a) * r * .8, T.y + lerp(.4, h * 3, p), T.z + Math.cos(a) * lerp(r * .5, r * 1.4, p)), look: V(T.x, T.y + lerp(.5, 0, p), T.z) }; }
    case 'handheld_doc': { const t = (o.t ?? p * 4); const j = V(Math.sin(t * 1.7) * .06, Math.sin(t * 2.3) * .05, Math.cos(t * 1.1) * .05);
      return { pos: V(T.x + Math.sin(a) * r, T.y + h, T.z + Math.cos(a) * r).add(j), look: T.clone().add(j.multiplyScalar(.5)) }; }
    case 'dolly_zoom': { const d = lerp(r * 1.3, r * .6, p); const fov = 2 * Math.atan(Math.tan((40 * Math.PI / 180) / 2) * (r * 1.3) / d) * 180 / Math.PI * .5;
      return { pos: V(T.x + Math.sin(a) * d, T.y + h * .5, T.z + Math.cos(a) * d), look: T.clone(), fov: Math.min(80, fov * 2) }; }
    default: return { pos: V(T.x, T.y + h, T.z + r), look: T.clone() };
  }
}

// Sân khấu: đọc world.json + timeline.json + storyboard.json đặt cạnh scene.html
export async function createStage(opts = {}) {
  const [world, timeline, storyboard] = await Promise.all(
    ['world.json', 'timeline.json', 'storyboard.json'].map(f => fetch(f).then(r => r.ok ? r.json() : null).catch(() => null)));
  const W = opts.width || innerWidth, H = opts.height || innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.style.margin = 0; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pal = (world?.palette?.colors || ['#20232a', '#e0d6c8', '#e8a15a']).map(c => new THREE.Color(c));
  scene.background = pal[0].clone(); scene.fog = new THREE.FogExp2(pal[0].clone(), opts.fog ?? .045);
  // phản chiếu môi trường mềm để kim loại/kính không bị đen (tắt: opts.env = 0)
  if ((opts.env ?? .5) > 0) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
    scene.environmentIntensity = opts.env ?? .5; }
  const camera = new THREE.PerspectiveCamera(40, W / H, .05, 400);
  const shots = timeline?.shots || [{ id: 'S01', start: 0, end: 10 }];
  const duration = timeline?.duration || shots[shots.length - 1].end;
  // shotAt(t) -> {i, shot (storyboard), start, end, p (0..1), local (giây trong shot)}
  const shotAt = t => {
    let i = shots.findIndex(s => t >= s.start && t < s.end); if (i < 0) i = t < 0 ? 0 : shots.length - 1;
    const s = shots[i]; return { i, shot: storyboard?.shots?.[i] || {}, start: s.start, end: s.end, local: t - s.start, p: clamp01((t - s.start) / (s.end - s.start)) };
  };
  const applyCam = (c) => { camera.position.copy(c.pos); camera.up.copy(c.up || new THREE.Vector3(0, 1, 0)); camera.lookAt(c.look);
    const f = c.fov || 40; if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } };
  const stage = { THREE, scene, camera, renderer, world, timeline, storyboard, pal, shots, duration, shotAt, applyCam };
  stage.run = (update) => {
    window.__duration = duration;
    window.__seek = (t) => { update(t, shotAt(t)); renderer.render(scene, camera); return true; };
    window.__seek(0); window.__ready = true;
    if (!navigator.webdriver) { const t0 = performance.now(); const loop = () => { window.__seek(((performance.now() - t0) / 1000) % duration); requestAnimationFrame(loop); }; loop(); }
  };
  return stage;
}
