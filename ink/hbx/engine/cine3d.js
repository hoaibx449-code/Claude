/* CẢNH ĐỒ HOẠ 3D cho format cine — xen với cảnh quay thật khi cần giải thích CON SỐ / QUAN HỆ / TRÌNH TỰ.
   Dùng chung phong cách video (storyboard.style). Không gắn với chủ đề nào: mỗi video tự chọn loại + nội dung.
   g_flow     {nodes:[{icon,label,cue|at}], title?}          — đường đi/dòng chảy qua các chặng (máy bay dọc đường sáng)
   g_blocks   {count, unit, total, suffix, label, cue|at}       — N khối 3D rơi xuống lần lượt, cộng dồn thành tổng
   g_timeline {items:[{year,text,cue|at}], title?}             — trục thời gian 3D, máy tiến dọc các mốc
   g_cards    {items:[{title,text,cue|at}]}                    — thẻ 3D lật lần lượt (danh sách, câu hỏi, bước)
   Icon: tên Lucide (render.py nhúng SVG). */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const at = (o, k, step = .9, base = .4) => (o && o.at) ?? base + k * step;
  const shell = (s, c, inner, extra = '') => {
    const { esc } = U();
    return `<div class="g3"><div class="g3floor"></div><div class="g3w"><div class="g3cam">${inner}</div></div>${extra}
      ${s.label ? `<div class="clabel" data-in=".2" data-a="left"><b>${String(c.i + 1).padStart(2, '0')}</b>${esc(s.label)}</div>` : ''}</div>`;
  };
  const sfx = (list, k) => list.map(t => `<i class="cm" data-in="${t}" data-a="none" data-sfx="${k}"></i>`).join('');
  const ttl = (s, y = 210) => {
    const { rich } = U(); const t = Array.isArray(s.title) ? s.title : s.title ? [s.title] : [];
    return t.length ? `<div class="g3title" data-in="${s.titleAt ?? .1}" data-a="pop" style="top:${y}px">${t.map((l, i) => `<div class="ct${i + 1}"><span class="cwd${i ? ' k' : ''}">${rich(l)}</span></div>`).join('')}</div>` : '';
  };

  /* ---- dòng chảy qua các chặng ---- */
  const FLOW_STEP = 900;
  const flowPos = k => ({ x: (k % 2 ? 1 : -1) * 170 * (k ? 1 : 0), z: -k * FLOW_STEP });
  X.scenes.g_flow = (s, c) => {
    const { rich } = U(), N = s.nodes || [];
    let h = '';
    N.forEach((n, k) => {
      const p = flowPos(k);
      h += `<div class="g3node" data-k="${k}" data-at="${at(n, k)}" style="transform:translate3d(${p.x}px,0px,${p.z}px)">
        <div class="g3ico">${n.icon && n.icon.startsWith('<') ? n.icon : ''}</div><div class="g3lab">${rich(n.label || '')}</div></div>`;
      if (k) {
        const q = flowPos(k - 1), dx = p.x - q.x, dz = p.z - q.z, L = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx) * 180 / Math.PI;
        h += `<div class="g3seg" data-k="${k}" data-at="${at(n, k) - .55}" style="width:${L}px;transform:translate3d(${q.x}px,230px,${q.z}px) rotateY(${ang}deg) rotateX(90deg)"><i></i></div>`;   // nằm phẳng trên sàn: không cắt xuyên các nút
      }
    });
    return { cam: 'still', html: shell(s, c, h, ttl(s, 190)) + sfx(N.map((n, k) => at(n, k)), 'pop') };
  };
  /* ---- khối cộng dồn ---- */
  X.scenes.g_blocks = (s, c) => {
    const { esc, rich } = U(), n = s.count || 10, cols = s.cols || Math.min(6, Math.ceil(Math.sqrt(n * 1.5))), t0 = s.at ?? .3, dt = Math.min(.22, 2.2 / n);
    let h = '';
    for (let k = 0; k < n; k++) {
      const cx = (k % cols - (cols - 1) / 2) * 118, cz = -Math.floor(k / cols) * 118;
      h += `<div class="g3cube" data-at="${t0 + k * dt}" style="--x:${cx}px;--z:${cz}px"><b class="f"></b><b class="t"></b><b class="r"></b>${k === 0 && s.unit ? `<span>${esc(s.unit)}</span>` : ''}</div>`;
    }
    const tot = `<div class="g3tot" data-in="${t0 + .2}" data-a="up">${esc(s.prefix || '')}<span class="cnt" data-from="0" data-to="${s.total ?? n}" data-dec="${s.decimals || 0}" data-t="${t0}" data-dur="${(n * dt).toFixed(2)}">0</span>${esc(s.suffix || '')}${s.caption ? `<small>${rich(s.caption)}</small>` : ''}</div>`;
    return { cam: 'still', html: shell(s, c, `<div class="g3grid" data-n="${n}" data-cols="${cols}">${h}</div>`, ttl(s, 170) + tot) + sfx(Array.from({ length: Math.min(n, 14) }, (_, k) => t0 + k * dt), 'tick') };
  };
  /* ---- trục thời gian ---- */
  X.scenes.g_timeline = (s, c) => {
    const { esc, rich } = U(), I = s.items || [];
    let h = `<div class="g3rail" style="height:${(I.length + 1) * 700}px"></div>`;
    I.forEach((it, k) => {
      h += `<div class="g3ms" data-k="${k}" data-at="${at(it, k, 1.1, .3)}" style="transform:translate3d(0,0,${-k * 700}px)">
        <div class="g3yr">${esc(String(it.year || ''))}</div><div class="g3tx">${rich(it.text || '')}</div><i></i></div>`;
    });
    return { cam: 'still', html: shell(s, c, h, ttl(s, 170)) + sfx(I.map((it, k) => at(it, k, 1.1, .3)), 'impact') };
  };
  /* ---- thẻ lật ---- */
  X.scenes.g_cards = (s, c) => {
    const { esc, rich } = U(), I = s.items || [];
    let h = '';
    I.forEach((it, k) => {
      h += `<div class="g3card" data-k="${k}" data-at="${at(it, k, 1.2, .2)}"><div class="g3cn">${String(k + 1).padStart(2, '0')}</div>
        <div class="g3ct">${rich(it.title || '')}</div>${it.text ? `<div class="g3cx">${rich(it.text)}</div>` : ''}</div>`;
    });
    return { cam: 'still', html: shell(s, c, h, ttl(s, 170)) + sfx(I.map((it, k) => at(it, k, 1.2, .2)), 'swish') };
  };

  /* ---- chuyển động mỗi khung ---- */
  X.update.push((o, lt) => {
    const t = o.s.type; if (!t || !t.startsWith('g_')) return;
    const { E, clamp } = U(), cam = o.el.querySelector('.g3cam'), floor = o.el.querySelector('.g3floor');
    const P = (x, a, d = .6) => clamp((lt - a) / d);
    if (t === 'g_flow') {
      const N = [...o.el.querySelectorAll('.g3node')];
      // máy bay theo nút đang được nói tới (nội suy mượt giữa các nút)
      let f = 0; N.forEach((n, k) => { const a = +n.dataset.at; if (lt >= a - .5) f = Math.max(f, k - 1 + E.io(clamp((lt - a + .5) / .9))); });
      f = Math.max(0, f); const k0 = Math.floor(f), fr = f - k0, p0 = flowPos(k0), p1 = flowPos(Math.min(N.length - 1, k0 + 1));
      const cx = p0.x + (p1.x - p0.x) * fr, cz = p0.z + (p1.z - p0.z) * fr;
      cam.style.transform = `translate3d(${-cx}px,${-90 + Math.sin(lt * 1.3) * 8}px,${-cz - 120 + lt * 10}px) rotateY(${Math.sin(lt * .6) * 3}deg)`;
      floor.style.backgroundPosition = `0 ${(-cz * .25 + lt * 40) % 120}px`;
      N.forEach(n => { const p = P(0, +n.dataset.at, .5); n.style.opacity = .28 + .72 * p; n.querySelector('.g3ico').style.transform = `scale(${.3 + .7 * E.back(p)})`; });
      o.el.querySelectorAll('.g3seg').forEach(g => { g.querySelector('i').style.transform = `scaleX(${E.io(P(0, +g.dataset.at, .6))})`; });
    } else if (t === 'g_blocks') {
      cam.style.transform = `translate3d(0,120px,${160 + lt * 30}px) rotateX(-30deg) rotateY(${-20 + lt * 5}deg)`;
      o.el.querySelectorAll('.g3cube').forEach(b => {
        const p = P(0, +b.dataset.at, .45), e = E.out3(p);
        b.style.opacity = p > 0 ? 1 : 0;
        b.style.transform = `translate3d(var(--x),${-(1 - e) * 520 + (p >= 1 ? 0 : 0)}px,var(--z)) rotateY(${(1 - e) * 90}deg) scale(${.9 + .1 * E.back(p)})`;
      });
    } else if (t === 'g_timeline') {
      const M = [...o.el.querySelectorAll('.g3ms')];
      let f = 0; M.forEach((m, k) => { const a = +m.dataset.at; if (lt >= a - .4) f = Math.max(f, k - 1 + E.io(clamp((lt - a + .4) / .8))); });
      f = Math.max(0, f);
      cam.style.transform = `translate3d(${Math.sin(lt * .7) * 20}px,-40px,${f * 700 - 120 + lt * 10}px) rotateY(${Math.sin(lt * .5) * 4}deg)`;
      floor.style.backgroundPosition = `0 ${(f * 175) % 120}px`;
      M.forEach((m, k) => { const p = P(0, +m.dataset.at, .5); m.style.opacity = p * clamp(1 - (f - k) * 2.2); m.querySelector('.g3yr').style.transform = `translateY(${(1 - E.out3(p)) * 60}px) scale(${.6 + .4 * E.back(p)})`; });
    } else if (t === 'g_cards') {
      const C = [...o.el.querySelectorAll('.g3card')];
      cam.style.transform = `translate3d(0,0,${lt * 14}px)`;
      C.forEach((card, k) => {
        const a = +card.dataset.at, nx = C[k + 1] ? +C[k + 1].dataset.at : 1e9, p = P(0, a, .55), q = P(0, nx - .1, .45);
        card.style.opacity = p > 0 && q < 1 ? 1 : 0;
        card.style.transform = `translate3d(${-q * 520}px,${(1 - E.out3(p)) * 80}px,${-q * 300}px) rotateY(${(1 - E.out3(p)) * -160 + q * -35}deg) rotateZ(${(k % 2 ? 2 : -2) * (1 - q)}deg)`;
      });
    }
  });
})();
