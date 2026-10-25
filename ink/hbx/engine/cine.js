/* FORMAT ĐIỆN ẢNH (cine) — "mắt người xem là máy quay".
   Mỗi cảnh `shot` là TOÀN CẢNH thật lấp đầy khung: video Pixabay hoặc ảnh tách chiều sâu 2.5D.
   Chuyển động máy (push/dolly/zoom/fpv/truck/rise/orbit) được NƯỚNG SẴN thành chuỗi khung (depth25.py --bake),
   thị sai theo từng điểm ảnh. Chữ, số, ghim được NEO VÀO KHÔNG GIAN: cùng công thức máy quay (camOf/project)
   nên trôi theo đúng vật thể. Máy giữ đà tiến qua điểm cắt; chuyển cảnh "through" = lao tiếp vào cảnh sau.
   Phong cách (sáng/tối, màu, font, chỉnh màu) do storyboard.style quyết định cho TỪNG video — không gán cứng. */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const SH = 1280, SW = 720;

  /* ---- máy quay: GIỐNG depth25.py ---- */
  const ease = t => (t < .25 ? 2 * t * t : t - .125) / .875;
  // nhịp NHANH (video ngắn): lao mạnh đầu cú máy rồi hãm (speed ramp), biên độ lớn hơn
  const ramp = t => t >= 1 ? 1 + (t - 1) * .15 : 1 - Math.pow(1 - t, 3);
  const PACE = () => ((window.HBX && window.HBX._sb) || {}).pace === 'fast';
  function camOf(kind, t) {
    if (PACE()) { const c = camBase(kind, t, ramp); return [c[0] * 1.35, c[1] * 1.3, c[2] * 1.3, c[3] * 1.3, 1 + (c[4] - 1) * 1.5]; }
    return camBase(kind, t, ease);
  }
  function camBase(kind, t, ease) {
    const e = ease(t), sn = Math.sin(Math.PI * Math.min(t, 1));
    switch (kind) {
      case 'push': return [.09 * e, 0, 0, 0, 1];
      case 'dolly': return [.22 * e, 0, 0, 0, 1];
      case 'zoom': return [0, 0, 0, 0, 1 + .28 * e];
      case 'fpv': return [.38 * e, .05 * sn, -.03 * e, 5 * sn, 1];
      case 'truckL': return [.03 * e, -.08 * e, 0, 0, 1];
      case 'truckR': return [.03 * e, .08 * e, 0, 0, 1];
      case 'rise': return [.04 * e, 0, -.08 * e, 0, 1];
      case 'orbit': return [.05 * e, .07 * Math.sin(Math.PI * (Math.min(t, 1) - .5)), 0, 1.5 * sn, 1];
      default: return [.03 * e, 0, 0, 0, 1];
    }
  }
  const OVER = 1.07;
  // thẻ chữ (danh sách, số, ghi chú) bám không gian nhưng GIẢM chuyển động ngang/xoay để không trôi khỏi khung
  const damp = (c, f) => [c[0] * f, c[1] * f * .5, c[2] * f * .5, c[3] * f, 1 + (c[4] - 1) * f];
  const DAMP = { title: .6, num: .45, item: .3, note: .3, pin: 1 };
  function project(px, py, d, c) {      // px,py: toạ độ chuẩn hoá quanh tâm (đơn vị = chiều cao), d: độ gần 0..1
    const [z, x, y, roll, zm] = c, s = 1 / (1 - z * (.12 + .88 * d)), k = .2 + .8 * d;
    let qx = px * s - x * k, qy = py * s - y * k; const r = roll * Math.PI / 180;
    [qx, qy] = [qx * Math.cos(r) - qy * Math.sin(r), qx * Math.sin(r) + qy * Math.cos(r)];
    return { x: qx * zm * OVER, y: qy * zm * OVER, s: s * zm };
  }
  // độ gần tại điểm (x,y 0..1) từ lưới 9x16 của ảnh; video coi như 0,45
  function dAt(bg, x, y) {
    const g = bg && bg.dgrid; if (!g) return .45;
    const gx = Math.min(8, Math.max(0, x * 9 - .5)), gy = Math.min(15, Math.max(0, y * 16 - .5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(8, x0 + 1), y1 = Math.min(15, y0 + 1), fx = gx - x0, fy = gy - y0;
    return (g[y0][x0] * (1 - fx) + g[y0][x1] * fx) * (1 - fy) + (g[y1][x0] * (1 - fx) + g[y1][x1] * fx) * fy;
  }

  /* ---- cảnh ---- */
  // vị trí: x,y theo phần khung 0..1 (0,0 = góc trên trái). Neo vào vật: d lấy từ ảnh tại (x,y).
  const anc = (x, y, d) => `data-px="${(x - .5) * SW / SH}" data-py="${y - .5}" data-d="${d}"`;
  X.scenes.shot = (s, c) => {
    const { esc, rich } = U(), bg = s.bg || {};
    const base = bg.baked ? `<img class="vf" src="${bg.baked.dir}/f0001.jpg" data-dir="${bg.baked.dir}" data-n="${bg.baked.n}" data-fps="${bg.baked.fps}" data-d="${bg.baked.n / bg.baked.fps}">`
      : bg.frames ? `<img class="vf cmov" src="${bg.src}" data-dir="${bg.frames.dir}" data-n="${bg.frames.n}" data-fps="${bg.frames.fps}">`
        : bg.src ? `<div class="cimg cmov" style="background-image:url('${bg.src}');background-position:${(bg.focus && bg.focus.x || .5) * 100}% ${(bg.focus && bg.focus.y || .5) * 100}%"></div>`
          : `<div class="cimg ph">${esc(bg.q || '')}</div>`;
    let h = `<div class="cbg">${base}</div><div class="cscrim"></div><div class="cw">`;
    const title = Array.isArray(s.title) ? s.title : s.title ? [s.title] : [];
    const tp = s.titlePos || (s.value !== undefined || (s.items || []).length ? 'top' : 'mid');
    const ty = { top: .23, mid: .36, low: .55 }[tp] || .3;
    if (title.length) {
      let wi = 0, inK = false;
      const line = (t, cls) => `<div class="${cls}">${String(t).split(/\s+/).map(w => {
        const n = (w.match(/\*/g) || []).length, k = inK || n > 0; if (n % 2) inK = !inK;
        return `<span class="cwd${k ? ' k' : ''}" data-w="${wi++}">${esc(w.replace(/\*/g, ''))}</span>`; }).join(' ')}</div>`;
      h += `<div class="ca ctitle" data-k="title" data-at="${s.titleAt ?? .2}" ${anc(.5, ty, s.titleD ?? .62)}>${line(title[0], 'ct1')}${title[1] ? line(title[1], 'ct2') : ''}</div>`;
    }
    if (s.value !== undefined) h += `<div class="ca cnum" data-k="num" data-at="${s.numAt ?? .6}" ${anc(.5, title.length ? .45 : .36, .7)}>
        <div class="cn">${esc(s.prefix || '')}<span class="ccnt" data-to="${s.value}" data-dec="${s.decimals || 0}">0</span>${esc(s.suffix || '')}</div>${s.caption ? `<div class="ccap">${rich(s.caption)}</div>` : ''}</div>`;
    (s.pins || []).forEach((p, k) => {
      h += `<div class="ca cpin ${p.x > .55 ? 'r' : ''}" data-k="pin" data-at="${p.at ?? 1 + k * .9}" ${anc(p.x, p.y, p.d ?? dAt(bg, p.x, p.y))}><i></i><b>${rich(p.text)}</b></div>`;
    });
    (s.items || []).forEach((it, k) => {
      const t = typeof it === 'string' ? it : it.text, at = typeof it === 'string' ? 1 + k * .8 : (it.at ?? 1 + k * .8);
      h += `<div class="ca citem" data-k="item" data-at="${at}" ${anc(.5, .40 + k * .085, .78)}><i>${k + 1}</i><span>${rich(t)}</span></div>`;
    });
    const ny = s.items && s.items.length ? .40 + s.items.length * .085 + .02 : (s.pins || []).some(p => p.y > .45) ? (title.length ? .40 : .30) : .58;
    if (s.note) h += `<div class="ca cnote" data-k="note" data-at="${s.noteAt ?? 1.2}" ${anc(.5, ny, .8)}>${rich(s.note)}</div>`;
    if (s.quote) h += `<div class="ca cquote" data-k="note" data-at="${s.quote.at ?? .5}" ${anc(.5, .45, .7)}>“${rich(s.quote.text)}”${s.quote.by ? `<small>${esc(s.quote.by)}</small>` : ''}</div>`;
    h += `</div>`;
    if (s.label) h += `<div class="clabel" data-in=".3" data-a="left"><b>${String(c.i + 1).padStart(2, '0')}</b>${esc(s.label)}</div>`;
    // chú thích nguồn ảnh/video: mặc định ẨN (Pixabay không bắt buộc ghi nguồn); bật lại bằng style.credits = true
    if (bg.credit && ((window.HBX && window.HBX._sb || {}).style || {}).credits) h += `<div class="credit ccredit">${esc(bg.credit)}${bg.tag ? ` · ${esc(bg.tag)}` : ''}</div>`;
    const marks = (s.items || []).map((it, k) => `<i class="cm" data-in="${(typeof it === 'object' && it.at) ?? 1 + k * .8}" data-a="none" data-sfx="tick"></i>`).join('')
      + (s.pins || []).map((p, k) => `<i class="cm" data-in="${p.at ?? 1 + k * .9}" data-a="none" data-sfx="pop"></i>`).join('')
      + (s.value !== undefined ? `<i class="cm" data-in="${(s.numAt ?? .6) + 1.4}" data-a="none" data-sfx="impact"></i>` : '');
    return { cam: 'still', html: h + marks };
  };

  /* ---- chữ nhấn trong không gian: các *từ* liên tiếp trong cùng cụm phụ đề ---- */
  let EMPH = null, PUNCH = [];
  function buildEmph(SC) {
    const W = (window.HBX && window.HBX.WORDS) || [], groups = [];
    W.forEach((w, i) => {
      if (!w.k) return; const g = groups[groups.length - 1];
      if (g && g.last === i - 1 && W[g.last].c === w.c) { g.text += ' ' + w.w; g.last = i; } else groups.push({ text: w.w, t: w.t, last: i });
    });
    EMPH = []; PUNCH = groups.map(g => g.t);
    groups.forEach((g, j) => {
      const o = SC.find(o => g.t >= o.start && g.t < o.start + o.dur); if (!o || o.s.type !== 'shot' || o.s.emph === false) return;
      const s = o.s; if (s.value !== undefined && /\d/.test(g.text)) return;          // số đã có thẻ số
      if (PACE() && s.emph !== true) return;   // nhịp nhanh: phụ đề CapCut + punch-in đã nhấn, không lặp chữ
      const busy = (s.items || []).length || (s.pins || []).length || s.note || s.quote;
      const hasTitle = Array.isArray(s.title) ? s.title.length : !!s.title;
      if (busy && hasTitle) return;                       // khung đã kín: phụ đề karaoke tự tô từ nhấn
      const el = document.createElement('div'); el.className = 'cemph';
      el.innerHTML = `<span class="ctx">${U().esc(g.text.replace(/[.,!?:;]+$/, ''))}</span>`;
      const n = EMPH.filter(e => e.o === o).length;
      const y = busy ? .18 + (n % 2) * .05 : .62 - (n % 2) * .05;
      el.dataset.px = '0'; el.dataset.py = (y - .5).toString(); el.dataset.d = '.85';
      o.el.querySelector('.cw').appendChild(el);
      EMPH.push({ el, t: g.t, o });
    });
    EMPH.forEach((e, j) => { const nx = EMPH[j + 1]; e.end = Math.min(e.t + 2.2, nx && nx.o === e.o ? nx.t - .08 : 1e9, e.o.start + e.o.dur - .15); });
    const EV = window.HBX && window.HBX.EVENTS;
    if (EV) { EMPH.forEach(e => EV.push({ t: e.t, k: 'pop' })); EV.sort((a, b) => a.t - b.t); }
    EMPH.forEach(e => { const tx = e.el.querySelector('.ctx'), sw = tx.scrollWidth; if (sw > 560) tx.style.fontSize = Math.floor(parseFloat(getComputedStyle(tx).fontSize) * 560 / sw) + 'px'; e.w = e.el.offsetWidth + 40; });
  }

  /* ---- phong cách theo video: storyboard.style ---- */
  const prevFit = X.fit;
  X.fit = root => {
    if (prevFit) prevFit(root);
    if (document.body.dataset.theme !== 'cine') return;
    const SB = window.HBX._sb || {}, st = SB.style || {}, B = document.body;
    B.dataset.scheme = st.scheme || 'dark';
    const set = (k, v) => v && B.style.setProperty(k, v);
    set('--c-acc', st.accent); set('--c-acc2', st.accent2); set('--c-acc-ink', st.accentInk);
    set('--c-card', st.card); set('--c-ink', st.ink); set('--c-font', st.font && `"${st.font}"`); set('--c-body', st.bodyFont && `"${st.bodyFont}"`);
    if (st.titleCase) B.style.setProperty('--c-case', st.titleCase);
    root.querySelectorAll('.ct1,.ct2').forEach(t => { const f = parseFloat(getComputedStyle(t).fontSize), sw = t.scrollWidth; if (sw > 640) t.style.fontSize = Math.floor(f * 640 / sw) + 'px'; });
    root.querySelectorAll('.citem span,.cnote,.cpin b').forEach(t => t.style.maxWidth = '');
    if (!EMPH) buildEmph(window.HBX._SC || []);
  };

  /* ---- mỗi khung ---- */
  X.update.push((o, lt, T) => {
    if (o.s.type !== 'shot') return;
    const { E, clamp } = U(), s = o.s, kind = s.cam || 'push';
    const c = camOf(kind, Math.max(0, lt) / o.dur);
    // video/ảnh chưa nướng (xem trước): máy quay CSS tương đương, coi như độ sâu 0,45
    o.el.querySelectorAll('.cmov').forEach(m => {
      const p = project(0, 0, .45, c), q = project(.3, .3, .45, c), sc = (q.x - p.x) / .3 / OVER;
      m.style.transform = `translate(${p.x * SH}px,${p.y * SH}px) rotate(${c[3]}deg) scale(${(sc * OVER).toFixed(4)})`;
    });
    // giật máy (punch-in) đúng lúc giọng đọc tới từ nhấn — nhịp nhấn nhá của video ngắn
    let pk = 0; PUNCH.forEach(t => { const d = T - t; if (d >= 0 && d < .45 && t >= o.start - .05 && t < o.start + o.dur) pk = Math.max(pk, Math.exp(-d * 9) * (1 - Math.exp(-d * 60))); });
    const bgEl = o.el.querySelector('.cbg');
    if (bgEl) bgEl.style.transform = pk > .01 ? `scale(${(1 + .07 * pk).toFixed(4)}) translate(${(Math.sin(T * 90) * 5 * pk).toFixed(1)}px,${(Math.cos(T * 77) * 4 * pk).toFixed(1)}px)` : '';
    o.el.querySelectorAll('.ca').forEach(a => {
      const at = +a.dataset.at, k = a.dataset.k, p = clamp((lt - at) / (k === 'title' ? .9 : .55)), e = E.out3(p);
      const q = project(+a.dataset.px, +a.dataset.py, +a.dataset.d, damp(c, DAMP[k] ?? .4));
      const sc = Math.min(1.5, Math.pow(q.s, .55));
      let tr = `translate(${SW / 2 + q.x * SH}px,${SH / 2 + q.y * SH}px) translate(-50%,-50%) rotate(${c[3] * .6}deg) scale(${sc.toFixed(4)})`;
      if (k === 'num') tr += ` scale(${.5 + .5 * E.back(p)})`;
      else if (k === 'pin') tr += ` scale(${.6 + .4 * E.back(p)})`;
      else if (k !== 'title') tr += ` translateY(${(1 - e) * 40}px)`;
      a.style.transform = tr; a.style.opacity = k === 'title' ? (lt >= at ? 1 : 0) : Math.min(1, p * 2);
      if (k === 'title') a.querySelectorAll('.cwd').forEach(w => {     // chữ tiêu đề bật từng từ
        const pw = clamp((lt - at - +w.dataset.w * .09) / .38);
        w.style.opacity = pw > 0 ? 1 : 0; w.style.transform = `translateY(${(1 - E.out3(pw)) * 60}%) scale(${.7 + .3 * E.back(pw)})`;
      });
      if (k === 'num') { const cn = a.querySelector('.ccnt'), qn = E.out5(clamp((lt - at - .2) / 1.3)), dec = +cn.dataset.dec; cn.textContent = (+cn.dataset.to * qn).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
    });
    (EMPH || []).forEach(e => {
      if (e.o !== o) return;
      const on = T >= e.t - .05 && T < e.end + .25; e.el.style.opacity = 0; if (!on) return;
      const p = clamp((T - e.t + .05) / .3), out = clamp((T - e.end) / .25);
      const q = project(+e.el.dataset.px, +e.el.dataset.py, +e.el.dataset.d, damp(c, .6));
      e.el.style.opacity = Math.min(1, p * 2.5) * (1 - out);
      const fit = Math.min(1.4, Math.pow(q.s, .5), 580 / (e.w || 580));       // không để tràn mép khung
      e.el.style.transform = `translate(${SW / 2 + q.x * SH}px,${SH / 2 + q.y * SH}px) translate(-50%,-50%) rotate(${-2 + c[3] * .6}deg) scale(${(.65 + .35 * E.back(p)) * fit})`;
      e.el.querySelector('.ctx').style.backgroundSize = `${(E.io(clamp((T - e.t) / .35)) * 100).toFixed(1)}% 100%`;
    });
  });

  /* ---- chuyển cảnh: lao tiếp về phía trước (through) / bay FPV / hoà ---- */
  X.trans.through = (A, B, p, fx) => {
    const a = p < .5, q = a ? p / .5 : (p - .5) / .5, E = U().E;
    A.style.visibility = a ? 'visible' : 'hidden'; B.style.visibility = a ? 'hidden' : 'visible';
    if (a) { A.style.transform = `scale(${1 + .55 * q * q})`; A.style.filter = `blur(${q * q * 10}px)`; }
    else { B.style.transform = `scale(${1.35 - .35 * E.out3(q)})`; B.style.filter = `blur(${(1 - q) * 8}px)`; }
    const sch = document.body.dataset.scheme === 'light';
    fx.innerHTML = `<div style="position:absolute;inset:0;background:${sch ? 'rgba(255,250,240,' : 'rgba(0,0,0,'}${(.35 * Math.sin(Math.PI * p)).toFixed(3)})"></div>`;
  };
  X.trans.dissolve = (A, B, p, fx) => { A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2; B.style.opacity = p; fx.innerHTML = ''; };
  X.trans.cut = (A, B, p, fx) => { A.style.visibility = p < .5 ? 'visible' : 'hidden'; B.style.visibility = p < .5 ? 'hidden' : 'visible'; fx.innerHTML = ''; };
  X.themeTrans.cine = 'through';
  X.trSfx.through = 'whoosh'; X.trSfx.dissolve = 'swish'; X.trSfx.cut = 'impact';
  window.HBX_CINE = { camOf, project };
})();
