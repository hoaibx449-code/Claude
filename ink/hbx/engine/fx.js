/* KHO KỸ THUẬT DỰNG — dùng được cho MỌI kiểu cảnh, chọn riêng cho từng cảnh qua s.fx (đạo diễn quyết định):
   s.fx = {
     camera:  punchIn | punchOut | snapZoom | crashZoom | kenBurns | handheld | shake | pullOut | tiltUp | tiltDown | panL | panR | dutch | breathe
     at / cue: lúc xảy ra cú máy, đồ hoạ (cue = cụm từ trong lời đọc → align.py tính "at")
     overlay: [{kind, text?, x?, y?, w?, h?, cue?|at?}]  — arrow | circle | box | underline | scribble | spotlight | impact | keyword |
              lowerthird | counter | progress | typewriter | stamp | sticker | bracket | flash
     effect:  vignette | grain | glow | chroma | lightleak | halftone | bw | warm | cool | blurIn | filmburn | dim | duotone
     speed:   slow | ramp | freeze | fast   (cảnh có video thật)
   }
   Toạ độ x, y: 0..1 của khung 720x1280. Mọi phần tử có data-in/data-sfx nên có tiếng và nhịp như các phần tử gốc. */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  X.decorate = X.decorate || [];
  const U = () => window.HBX_UTIL, W = 720, H = 1280;
  const esc = (s) => U().esc(String(s ?? '')), rich = (s) => U().rich(String(s ?? ''));
  const atOf = (o, d) => (o && o.at != null ? +o.at : d);

  /* ---------- đồ hoạ phủ: dựng lúc build ---------- */
  const OV = {
    arrow: (o) => `<svg class="fxo fx-arrow" viewBox="0 0 220 120" style="left:${o.x * W - 110}px;top:${o.y * H - 60}px;width:220px;transform:rotate(${o.rot ?? -18}deg)">
      <path d="M8 96 C 70 30, 140 20, 196 40" pathLength="1"/><path d="M168 18 L198 40 L166 62" pathLength="1"/></svg>${o.text ? `<div class="fxo fx-tag" style="left:${o.x * W - 150}px;top:${o.y * H + 52}px">${rich(o.text)}</div>` : ''}`,
    circle: (o) => `<svg class="fxo fx-circle" viewBox="0 0 300 200" style="left:${o.x * W - (o.w || 300) / 2}px;top:${o.y * H - (o.h || 200) / 2}px;width:${o.w || 300}px;height:${o.h || 200}px">
      <ellipse cx="150" cy="100" rx="140" ry="88" pathLength="1" transform="rotate(-4 150 100)"/></svg>`,
    box: (o) => `<div class="fxo fx-box" style="left:${o.x * W - (o.w || 300) / 2}px;top:${o.y * H - (o.h || 160) / 2}px;width:${o.w || 300}px;height:${o.h || 160}px"><i></i><i></i><i></i><i></i></div>`,
    underline: (o) => `<svg class="fxo fx-under" viewBox="0 0 400 30" style="left:${o.x * W - (o.w || 360) / 2}px;top:${o.y * H}px;width:${o.w || 360}px"><path d="M6 18 C 120 6, 260 26, 394 12" pathLength="1"/></svg>`,
    scribble: (o) => `<svg class="fxo fx-scrib" viewBox="0 0 300 90" style="left:${o.x * W - 150}px;top:${o.y * H - 45}px;width:300px"><path d="M10 50 C 40 10, 60 80, 90 40 S 140 10, 170 50 S 230 80, 290 30" pathLength="1"/></svg>`,
    spotlight: (o) => `<div class="fxo fx-spot" style="--sx:${o.x * 100}%;--sy:${o.y * 100}%"></div>`,
    impact: (o) => `<div class="fxo fx-impact" style="top:${(o.y ?? .3) * H}px">${rich(o.text || '')}</div>`,
    keyword: (o) => `<div class="fxo fx-key" style="left:${(o.x ?? .5) * W}px;top:${(o.y ?? .22) * H}px">${rich(o.text || '')}</div>`,
    lowerthird: (o) => `<div class="fxo fx-l3" style="top:${(o.y ?? .62) * H}px"><b>${esc(o.text || '')}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`,
    counter: (o) => `<div class="fxo fx-count" style="left:${(o.x ?? .82) * W}px;top:${(o.y ?? .1) * H}px"><b>${esc(o.text || '1')}</b>${o.of ? `<small>/${esc(o.of)}</small>` : ''}</div>`,
    progress: (o) => `<div class="fxo fx-prog" style="top:${(o.y ?? .2) * H}px"><small>${esc(o.text || '')}</small><div><i style="--to:${Math.max(0, Math.min(100, +o.value || 70))}%"></i></div></div>`,
    typewriter: (o) => `<div class="fxo fx-type" style="top:${(o.y ?? .18) * H}px" data-full="${esc(o.text || '')}"></div>`,
    stamp: (o) => `<div class="fxo fx-stamp" style="left:${(o.x ?? .5) * W}px;top:${(o.y ?? .3) * H}px">${esc(o.text || '')}</div>`,
    sticker: (o) => `<div class="fxo fx-stick" style="left:${(o.x ?? .7) * W}px;top:${(o.y ?? .14) * H}px">${rich(o.text || '')}</div>`,
    bracket: (o) => `<div class="fxo fx-brk" style="left:${o.x * W - (o.w || 320) / 2}px;top:${o.y * H - (o.h || 200) / 2}px;width:${o.w || 320}px;height:${o.h || 200}px"></div>`,
    flash: () => `<div class="fxo fx-flash"></div>`,
  };
  const OV_SFX = { arrow: 'swish', circle: 'swish', box: 'tick', underline: 'swish', scribble: 'swish', spotlight: 'whoosh', impact: 'impact', keyword: 'pop',
    lowerthird: 'swish', counter: 'tick', progress: 'roll', typewriter: 'type', stamp: 'impact', sticker: 'pop', bracket: 'tick', flash: 'impact' };
  const DEF = { arrow: { x: .5, y: .3 }, circle: { x: .5, y: .38 }, box: { x: .5, y: .4 }, underline: { x: .5, y: .3 }, scribble: { x: .5, y: .3 }, spotlight: { x: .5, y: .4 }, bracket: { x: .5, y: .4 } };

  X.decorate.push((s, el, c) => {
    const f = s.fx; if (!f || typeof f !== 'object') return;
    const stage = el.querySelector('.cam') || el, dur = +s.dur || 3;
    let h = '';
    (Array.isArray(f.overlay) ? f.overlay : f.overlay ? [f.overlay] : []).slice(0, 3).forEach((o, k) => {
      if (!o || !OV[o.kind]) return;
      o = { ...(DEF[o.kind] || {}), ...o };
      // vùng phụ đề (khoảng 0,66–0,9 chiều cao) luôn để trống cho chữ chạy theo giọng
      if (o.y != null && o.y > .62 && o.y < .92) o.y = o.kind === 'lowerthird' ? .6 : .58;
      if (o.x != null) o.x = Math.max(.12, Math.min(.88, +o.x));
      const t = Math.min(dur - .4, atOf(o, Math.min(dur * .35, .5 + k * .7)));
      const len = o.kind === 'typewriter' ? Math.min(1.8, Math.max(.6, (o.text || '').length * .045)) : .55;
      h += `<div class="fxw" data-in="${t.toFixed(2)}" data-a="none" data-sfx="${OV_SFX[o.kind]}" data-kind="${o.kind}" data-len="${len}">${OV[o.kind](o)}</div>`;
    });
    if (h) el.insertAdjacentHTML('beforeend', `<div class="fxlayer">${h}</div>`);
    if (f.effect) { el.dataset.fx = f.effect; el.insertAdjacentHTML('beforeend', `<div class="fxeff fxe-${f.effect}"></div>`); }
    if (f.camera) el.dataset.fxcam = f.camera;
    // cú máy dứt khoát (punch/snap/crash/shake) có tiếng
    if (['punchIn', 'punchOut', 'snapZoom', 'crashZoom', 'shake'].includes(f.camera))
      el.insertAdjacentHTML('beforeend', `<i class="fxsfx" data-in="${Math.min(dur - .3, atOf(f, dur * .45)).toFixed(2)}" data-a="none" data-sfx="${f.camera === 'crashZoom' || f.camera === 'shake' ? 'impact' : 'whoosh'}"></i>`);
    // tốc độ của video thật
    if (f.speed) el.querySelectorAll('img.vf').forEach(v => { v.dataset.speed = f.speed; v.dataset.fat = atOf(f, dur * .5); });
    if (f.speed === 'freeze') el.insertAdjacentHTML('beforeend', `<i class="fxsfx" data-in="${atOf(f, dur * .5).toFixed(2)}" data-a="none" data-sfx="impact"></i>`);
  });

  /* ---------- mỗi khung: máy quay giả, đồ hoạ phủ, hiệu ứng ---------- */
  const E = () => U().E, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const CAMFX = {
    punchIn: (q, lt, a) => lt >= a ? ` scale(${1.16})` : '',
    punchOut: (q, lt, a) => lt >= a ? '' : ` scale(1.16)`,
    snapZoom: (q, lt, a) => { const p = clamp((lt - a) / .22); return ` scale(${1 + .22 * E().out3(p)})`; },
    crashZoom: (q, lt, a) => { const p = clamp((lt - a) / .16); return ` scale(${1 + .45 * E().out3(p)}) rotate(${(1 - p) * p * 8}deg)`; },
    kenBurns: (q) => ` scale(${1.04 + .1 * q}) translate(${-16 * q}px,${-10 * q}px)`,
    handheld: (q, lt) => ` translate(${Math.sin(lt * 2.1) * 5 + Math.sin(lt * 5.3) * 2}px,${Math.cos(lt * 1.7) * 4 + Math.sin(lt * 4.1) * 2}px) rotate(${Math.sin(lt * 1.3) * .5}deg)`,
    shake: (q, lt, a) => { const k = lt >= a ? Math.max(0, 1 - (lt - a) / .5) : 0; return ` translate(${Math.sin(lt * 90) * 14 * k}px,${Math.cos(lt * 77) * 10 * k}px)`; },
    pullOut: (q) => ` scale(${1.2 - .2 * E().io(q)})`,
    tiltUp: (q) => ` scale(1.15) translateY(${70 - 140 * E().io(q)}px)`,
    tiltDown: (q) => ` scale(1.15) translateY(${-70 + 140 * E().io(q)}px)`,
    panL: (q) => ` scale(1.18) translateX(${60 - 120 * E().io(q)}px)`,
    panR: (q) => ` scale(1.18) translateX(${-60 + 120 * E().io(q)}px)`,
    dutch: (q) => ` rotate(${-4 + 2 * q}deg) scale(1.08)`,
    breathe: (q, lt) => ` scale(${1.03 + .02 * Math.sin(lt * 1.6)})`,
  };
  X.update.push((o, lt) => {
    const f = o.s.fx; if (!f || typeof f !== 'object') return;
    const q = clamp(lt / (o.dur || 1)), a = atOf(f, (o.dur || 3) * .45);
    // cảnh đồ hoạ (chữ sát mép) chỉ nhận 35% biên độ máy quay giả để chữ không tràn khung
    if (f.camera && CAMFX[f.camera]) {
      let tf = CAMFX[f.camera](q, lt, a);
      if (o.s.type !== 'shot') tf = tf.replace(/scale\(([\d.]+)\)/g, (m, v) => `scale(${(1 + (v - 1) * .35).toFixed(4)})`).replace(/(-?[\d.]+)px/g, (m, v) => `${(v * .35).toFixed(1)}px`).replace(/(-?[\d.]+)deg/g, (m, v) => `${(v * .35).toFixed(2)}deg`);
      o.cam.style.transform += tf;
    }
    if (f.effect === 'blurIn') o.cam.style.filter = `blur(${Math.max(0, 10 * (1 - lt / .5))}px)`;
    o.el.querySelectorAll('.fxw').forEach(w => {
      const t0 = +w.dataset.in, p = clamp((lt - t0) / +w.dataset.len), k = w.dataset.kind, on = lt >= t0;
      w.style.opacity = on ? 1 : 0;
      const e = E().out3(p);
      w.querySelectorAll('path,ellipse').forEach(pa => { pa.style.strokeDasharray = 1; pa.style.strokeDashoffset = 1 - e; });
      if (k === 'impact') w.firstElementChild.style.transform = `translateX(-50%) scale(${2.2 - 1.2 * E().back(p)})`;
      if (k === 'keyword' || k === 'sticker') w.firstElementChild.style.transform = `translate(-50%,-50%) scale(${.3 + .7 * E().back(p)}) rotate(${(k === 'sticker' ? 6 : 0) + Math.sin(lt * 3) * 1.5}deg)`;
      if (k === 'stamp') w.firstElementChild.style.transform = `translate(-50%,-50%) rotate(-9deg) scale(${2.4 - 1.4 * E().out3(p)})`;
      if (k === 'lowerthird') w.firstElementChild.style.clipPath = `inset(0 ${(1 - e) * 100}% 0 0)`;
      if (k === 'counter') w.firstElementChild.style.transform = `translate(-50%,0) scale(${.5 + .5 * E().back(p)})`;
      if (k === 'progress') { const i = w.querySelector('i'); i.style.width = `calc(var(--to) * ${E().io(clamp((lt - t0) / 1.2))})`; }
      if (k === 'typewriter') { const el = w.firstElementChild, s = el.dataset.full; el.textContent = s.slice(0, Math.floor(s.length * p)) + (p < 1 && Math.floor(lt * 4) % 2 ? '▌' : ''); }
      if (k === 'spotlight') w.firstElementChild.style.opacity = E().io(p) * .85;
      if (k === 'box' || k === 'bracket') w.firstElementChild.style.transform = `scale(${1.3 - .3 * e})`;
      if (k === 'flash') w.firstElementChild.style.opacity = on ? Math.max(0, 1 - (lt - t0) / .35) : 0;
    });
    // video thật: tốc độ (chậm, tăng tốc rồi chậm, dừng hình)
  });

  /* ---------- chuyển cảnh thêm ---------- */
  const vis = (A, B, p) => { A.style.visibility = p < .5 ? 'visible' : 'hidden'; B.style.visibility = p >= .5 ? 'visible' : 'hidden'; };
  Object.assign(X.trans, {
    blur(A, B, p, fx) { vis(A, B, p); const k = 1 - Math.abs(2 * p - 1); (p < .5 ? A : B).style.filter = `blur(${k * 22}px) brightness(${1 + .25 * k})`; fx.innerHTML = ''; },
    spin(A, B, p, fx) { const e = U().E.io(p); vis(A, B, p); (p < .5 ? A : B).style.transform = `rotate(${(e - .5) * 40}deg) scale(${1 + Math.sin(Math.PI * p) * .35})`; (p < .5 ? A : B).style.filter = `blur(${Math.sin(Math.PI * p) * 10}px)`; fx.innerHTML = ''; },
    stretch(A, B, p, fx) { vis(A, B, p); const k = Math.sin(Math.PI * p); (p < .5 ? A : B).style.transform = `scaleX(${1 + k * .9}) scaleY(${1 - k * .25})`; (p < .5 ? A : B).style.filter = `blur(${k * 8}px)`; fx.innerHTML = ''; },
    rgb(A, B, p, fx, T) { vis(A, B, p); const k = 1 - Math.abs(2 * p - 1), el = p < .5 ? A : B; el.style.filter = `drop-shadow(${-12 * k}px 0 0 rgba(255,0,60,.8)) drop-shadow(${12 * k}px 0 0 rgba(0,220,255,.8)) contrast(${1 + .3 * k})`; el.style.transform = `translateX(${Math.sin(T * 80) * 10 * k}px)`; fx.innerHTML = ''; },
    lightleak(A, B, p, fx) { A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2; B.style.opacity = U().E.io(p); const k = Math.sin(Math.PI * p);
      fx.innerHTML = `<div style="position:absolute;inset:0;mix-blend-mode:screen;opacity:${k};background:radial-gradient(60% 50% at ${20 + 60 * p}% 40%,rgba(255,170,60,.95),transparent 70%),radial-gradient(50% 40% at ${80 - 50 * p}% 70%,rgba(255,60,90,.7),transparent 70%)"></div>`; },
    filmburn(A, B, p, fx) { vis(A, B, p); const k = Math.sin(Math.PI * p);
      fx.innerHTML = `<div style="position:absolute;inset:0;mix-blend-mode:screen;opacity:${k};background:radial-gradient(70% 60% at 30% 60%,#fff6d8,#ff9a2e 40%,#b3261e 70%,transparent 85%)"></div>`; },
    dipblack(A, B, p, fx) { vis(A, B, p); fx.innerHTML = `<div style="position:absolute;inset:0;background:#000;opacity:${1 - Math.abs(2 * p - 1)}"></div>`; },
    dipwhite(A, B, p, fx) { vis(A, B, p); fx.innerHTML = `<div style="position:absolute;inset:0;background:#fff;opacity:${1 - Math.abs(2 * p - 1)}"></div>`; },
    pushup(A, B, p, fx) { const e = U().E.io(p); A.style.visibility = B.style.visibility = 'visible'; A.style.transform = `translateY(${-e * 1280}px)`; B.style.transform = `translateY(${(1 - e) * 1280}px)`; fx.innerHTML = ''; },
    slide(A, B, p, fx) { const e = U().E.io(p); A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2; A.style.transform = `translateX(${-e * 240}px)`; A.style.filter = `brightness(${1 - .5 * e})`; B.style.transform = `translateX(${(1 - e) * 720}px)`; B.style.boxShadow = '-30px 0 60px rgba(0,0,0,.4)'; fx.innerHTML = ''; },
    iris(A, B, p, fx) { const e = U().E.io(p); A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2; B.style.clipPath = `circle(${e * 82}% at 50% 45%)`; fx.innerHTML = ''; },
    wipe(A, B, p, fx) { const e = U().E.io(p); A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2; B.style.clipPath = `polygon(0 0,${e * 140}% 0,${e * 140 - 40}% 100%,0 100%)`; fx.innerHTML = ''; },
    smash(A, B, p, fx, T) { vis(A, B, p); const k = p >= .5 ? Math.max(0, 1 - (p - .5) * 3) : 0; B.style.transform = `scale(${1 + .12 * k}) translate(${Math.sin(T * 90) * 12 * k}px,0)`; fx.innerHTML = `<div style="position:absolute;inset:0;background:#fff;opacity:${p >= .5 && p < .6 ? .8 : 0}"></div>`; },
  });
  Object.assign(X.trSfx = X.trSfx || {}, { blur: 'whoosh', spin: 'whoosh', stretch: 'whoosh', rgb: 'glitch_s', lightleak: 'swish', filmburn: 'swish', dipblack: 'swish', dipwhite: 'swish',
    pushup: 'whoosh', slide: 'whoosh', iris: 'swish', wipe: 'whoosh', smash: 'impact' });
})();

/* ---------- QC: soát từng cảnh trước khi dựng (chữ tràn khung, đồ hoạ đè phụ đề) ---------- */
window.HBX_QC = function () {
  const H = window.HBX, out = [], sub = document.getElementById('sub');
  H._SC.forEach((o, i) => {
    for (const f of [.55, .9]) {
      H.setTime(o.start + o.dur * f);
      const sr = sub.getBoundingClientRect();
      o.el.querySelectorAll('.fxo, .big, .title, .ctitle, .fit, .citem, .cnote, .kicker, .g3title').forEach(e => {
        if (getComputedStyle(e).visibility === 'hidden' || +getComputedStyle(e.closest('[data-in]') || e).opacity === 0) return;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
        if (r.left < -12 || r.right > 732) out.push({ scene: i + 1, at: +(o.start + o.dur * f).toFixed(2), what: 'tràn khung ngang', el: e.className.baseVal || e.className });
        if (e.classList.contains('fxo') && sr.height && r.bottom > sr.top + 6 && r.top < sr.bottom - 6 && r.right > sr.left && r.left < sr.right)
          out.push({ scene: i + 1, at: +(o.start + o.dur * f).toFixed(2), what: 'đồ hoạ đè phụ đề', el: e.className.baseVal || e.className });
      });
    }
  });
  return out;
};
