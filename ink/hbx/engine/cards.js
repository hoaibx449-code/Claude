/* FORMAT THẺ 3D — mỗi cảnh là 1 thẻ màu phẳng lơ lửng trong không gian tối, 1 ý / thẻ.
   Đăng ký vào engine qua window.HBX_EXT (nạp TRƯỚC engine.js). */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const PAL = ['navy', 'orange', 'cream', 'cobalt', 'lime', 'black'];
  const MPAL = { tech: ['t1', 't2', 't3'], finance: ['f1', 'f2', 'f3'], alert: ['a1', 'a2', 'a3'], bright: ['b1', 'b2', 'b3'], calm: ['c1', 'c2', 'c3'] };
  const ACC = { navy: '#ff5a1f', orange: '#ffd9c7', cream: '#ff4d1c', cobalt: '#e8ff3a', lime: '#2238f0', black: '#d9ff2e' };
  const BG = { navy: '#0f1b3d', orange: '#ff4d1c', cream: '#f1ece0', cobalt: '#2238f0', lime: '#d9ff2e', black: '#141414' };
  const tc = t => { const s = Math.floor(t); return `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const rich = s => U().rich(s);
  const esc = s => U().esc(s);

  // màu tự xoay vòng, không trùng cảnh liền trước
  function pal(s, c) {
    if (s.color) return s.color;
    // bảng màu theo CHỦ ĐỀ (sb.mood), xoay vòng cố định trong bảng đó — không lấy màu ngoài nhận diện
    const P = MPAL[c.sb.mood] || PAL, seed = (c.sb.seed || 0); return P[(c.i + (P === PAL ? c.i + seed : 0)) % P.length];
  }
  function card(s, c, body, extra = '') {
    const p = pal(s, c); s._pal = p;
    return {
      cam: 'still', html: `
      <div class="cbg" style="--cbg:${BG[p]}"><div class="glow"></div><div class="floor"></div><div class="hz"></div></div>
      <div class="cstage"><div class="cslot"><div class="c3d pal-${p}">
        ${extra}
        <div class="cc tl"></div><div class="cc tr"></div><div class="cc bl"></div><div class="cc br"></div>
        <div class="chrome top"><span>${esc(c.sb.series || 'BẢN TIN')}</span><span>${String(c.i + 1).padStart(2, '0')} / ${String(c.n).padStart(2, '0')}</span></div>
        <div class="cbody">${body}</div>
        <div class="chrome bot"><span>${tc(c.start)}</span><span>${esc(s.source || c.sb.source || '')}</span></div>
      </div></div></div>`
    };
  }
  const over = (t, d = .25) => t ? `<div class="over" data-in="${d}" data-a="up">${esc(t)}</div>` : '';

  const S = X.scenes;
  // tiêu đề lớn (hook)
  S.c_headline = (s, c) => card(s, c, `${over(s.over)}
    <div class="fit" data-max="${s.size || 74}" data-in=".35" data-a="pop">${rich(s.text)}</div>
    ${s.sub ? '' : ''}${s.tag ? `<div class="csub" data-in=".8" data-a="up">${esc(s.tag)}</div>` : ''}
    ${s.line !== false ? `<div class="cline" data-in=".9" data-a="grow"></div>` : ''}`);
  // một từ / câu chốt (NHƯNG…, SPACEX)
  S.c_word = (s, c) => card(s, c, `<div class="fit" data-max="${s.size || 110}" data-in=".2" data-a="pop">${rich(s.text)}</div>`);
  // con số lớn đếm lên
  S.c_number = (s, c) => card(s, c, `${over(s.over)}
    <div class="fit" data-max="${s.size || 120}" data-in=".3" data-a="pop">${esc(s.prefix || '')}<span class="cnt" data-from="${s.from || 0}" data-to="${s.value}" data-dec="${s.decimals || 0}" data-t="${s.countAt || .35}" data-dur="${s.countDur || 1.1}">0</span>${esc(s.suffix || '')}</div>
    ${s.unit ? `<div class="csub" style="font-size:30px" data-in=".9" data-a="up">${esc(s.unit)}</div>` : ''}
    ${s.bars ? `<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px">${s.bars.map((b, i) => `<div class="cbar ${i ? 'ghost' : ''}" style="width:${b * 4.2}px"><b data-bar="${1.1 + i * .2}"></b></div>`).join('')}</div>` : ''}`);
  // lưới chấm (1 chấm = 1 đơn vị)
  S.c_dots = (s, c) => {
    const cols = s.cols || 18, rows = s.rows || 5, n = cols * rows, hi = new Set(s.hi || [Math.floor(n / 2) - 2]);
    const dots = Array.from({ length: n }, (_, k) => `<i class="${hi.has(k) ? 'hi' : ''}" data-k="${k}"></i>`).join('');
    return card(s, c, `${s.text ? `<div class="fit" data-max="${s.size || 52}" data-in=".2" data-a="up">${rich(s.text)}</div>` : ''}
      <div class="dots" style="grid-template-columns:repeat(${cols},15px)" data-dots="${s.dotsAt || .5}">${dots}</div>
      ${over(s.caption, 1.4)}`);
  };
  // thanh tỷ lệ
  S.c_bar = (s, c) => card(s, c, `${over(s.over)}
    <div class="fit" data-max="${s.size || 104}" data-in=".3" data-a="pop">${rich(s.text)}</div>
    ${s.label ? `<div style="font-weight:900;font-size:22px;text-transform:uppercase" data-in=".7" data-a="up">${esc(s.label)}</div>` : ''}
    <div class="cbar" style="margin-top:6px"><b data-bar="1" data-pct="${s.pct}"></b></div>
    ${s.pctLabel ? `<div class="csub" data-in="1.6" data-a="up">${esc(s.pctLabel)}</div>` : ''}`);
  // vòng tỷ lệ
  S.c_ring = (s, c) => card(s, c, `${over(s.over)}
    ${s.text ? `<div class="fit" data-max="${s.size || 46}" data-in=".3" data-a="up">${rich(s.text)}</div>` : ''}
    <div style="display:flex;align-items:center;gap:34px;margin-top:6px">
      <svg width="150" height="150" viewBox="-75 -75 150 150"><circle r="60" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="16"/>
        <circle r="60" fill="none" stroke="var(--cacc)" stroke-width="16" stroke-linecap="round" pathLength="100" transform="rotate(-90)" data-ring="${s.pct}" data-t=".8"/>
        <text y="9" text-anchor="middle" font-family="Be Vietnam Pro" font-weight="900" font-size="26" fill="currentColor">${esc(s.center || s.pct + '%')}</text></svg>
      <div style="text-align:left;font-weight:800;font-size:25px;line-height:1.3;max-width:260px" data-in="1.2" data-a="right">${rich(s.side || '')}</div>
    </div>`);
  // danh sách gạch đầu dòng
  S.c_list = (s, c) => card(s, c, `${s.text ? `<div class="fit" data-max="${s.size || 40}" data-in=".2" data-a="up">${rich(s.text)}</div>` : ''}
    <div class="clist" style="margin-top:14px">${(s.items || []).map((x, i) => { const o = typeof x === 'string' ? { text: x } : x; return `<div data-in="${o.at ?? .7 + i * .5}" data-a="left" data-sfx="tick">${esc(o.text)}</div>`; }).join('')}</div>`);
  // phép tính
  S.c_equation = (s, c) => card(s, c, `
    <div class="fit" data-max="44" data-in=".2" data-a="left">${rich(s.left)}</div>
    <div style="font-weight:900;font-size:56px;line-height:.8;color:var(--cacc)" data-in=".7" data-a="pop">=</div>
    <div class="fit" data-max="${s.size || 120}" data-in="1.0" data-a="pop">${rich(s.result)}</div>
    ${s.qmark ? `<div class="cqmark" style="right:70px;top:190px" data-in="1.4" data-a="pop">?</div>` : ''}`);
  // thẻ có ảnh thật
  S.c_photo = (s, c) => card(s, c, `<div style="position:absolute;left:0;right:0;bottom:6px;text-align:left;color:#fff">${over(s.over)}
      <div class="fit" data-max="${s.size || 54}" data-in=".35" data-a="up" style="text-align:left">${rich(s.text)}</div></div>`,
    `<div class="cphoto">${U().photo(s.image, 'kb')}</div>${U().credit(s.image)}`);
  // kêu gọi
  S.c_cta = (s, c) => card(s, c, `<div class="fit" data-max="${s.size || 92}" data-in=".25" data-a="pop">${rich(s.text)}</div>
    ${s.tag ? `<div style="font-weight:900;font-size:21px;text-transform:uppercase;letter-spacing:.5px" data-in=".8" data-a="up">${esc(s.tag)}</div>` : ''}`);

  /* co chữ cho vừa thẻ */
  X.fit = (root) => root.querySelectorAll('.fit').forEach(el => {
    el.querySelectorAll('.cnt').forEach(c => c.textContent = (+c.dataset.to).toLocaleString('vi-VN', { minimumFractionDigits: +c.dataset.dec, maximumFractionDigits: +c.dataset.dec }));
    let f = +el.dataset.max; el.style.fontSize = f + 'px';
    const W = 540;
    while (f > 18 && el.scrollWidth > W) { f -= 2; el.style.fontSize = f + 'px'; }
  });

  /* chuyển động trong thẻ + thẻ trôi lơ lửng */
  X.update.push((o, lt, T) => {
    const c3 = o.el.querySelector('.c3d'); if (!c3) return;
    o.el.querySelector('.cslot').style.transform = ''; o.el.querySelector('.cbg').style.opacity = 1;
    const { E, clamp } = U(), i = o.s._idx ?? 0;
    const yaw = (o.s.yaw ?? ((SCIDX(o) % 2) ? 15 : -15)) + 3 * Math.sin(lt * .7), pit = 8 + 1.5 * Math.sin(lt * .9 + 1);
    c3.style.transform = `rotateY(${yaw}deg) rotateX(${pit}deg) translateZ(${Math.min(lt, o.dur) * 9}px) translateY(${Math.sin(lt * 1.1) * 5}px)`;
    o.el.querySelectorAll('[data-dots]').forEach(g => {
      const t0 = +g.dataset.dots, ds = g.children, n = ds.length;
      for (let k = 0; k < n; k++) { const q = clamp((lt - t0 - k * (0.9 / n)) / .2); ds[k].style.transform = `scale(${q})`; }
      g.querySelectorAll('.hi').forEach(h => { const q = clamp((lt - t0 - 1.1) / .3); h.style.transform = `scale(${1 + .6 * Math.sin(q * Math.PI)})`; });
    });
    o.el.querySelectorAll('[data-bar]').forEach(b => { const q = E.out3(clamp((lt - +b.dataset.bar) / .9)); b.style.width = (b.dataset.pct ? +b.dataset.pct : 100) * q + '%'; });
    o.el.querySelectorAll('[data-ring]').forEach(r => { const q = E.out3(clamp((lt - +r.dataset.t) / 1.0)); r.style.strokeDasharray = `${+r.dataset.ring * q} 100`; });
    o.el.querySelectorAll('.cqmark').forEach(q => q.style.transform += ` rotate(${Math.sin(lt * 3) * 10}deg)`);
  });
  const SCIDX = o => [...o.el.parentNode.children].indexOf(o.el);

  /* chuyển thẻ: thẻ cũ bay trái-xoay, thẻ mới bay vào từ phải */
  X.trans.cardswap = (A, B, p, fx) => {
    const { E } = U(), e = E.io(p);
    A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2;
    const sa = A.querySelector('.cslot'), sb = B.querySelector('.cslot');
    if (sa) sa.style.transform = `translateX(${-e * 760}px) rotateY(${e * 60}deg) translateZ(${-e * 200}px)`;
    if (sb) sb.style.transform = `translateX(${(1 - e) * 760}px) rotateY(${-(1 - e) * 60}deg) translateZ(${-(1 - e) * 200}px)`;
    const ga = A.querySelector('.cbg'), gb = B.querySelector('.cbg');
    if (ga) ga.style.opacity = 1 - e; if (gb) gb.style.opacity = e;
    fx.innerHTML = '';
  };
  // lật thẻ tại chỗ (dùng cho thẻ bẻ hướng "NHƯNG…")
  X.trans.cardflip = (A, B, p, fx) => {
    const { E } = U(), first = p < .5, q = first ? p * 2 : (p - .5) * 2;
    A.style.visibility = first ? 'visible' : 'hidden'; B.style.visibility = first ? 'hidden' : 'visible';
    const sa = A.querySelector('.cslot'), sb = B.querySelector('.cslot');
    if (sa) sa.style.transform = `rotateX(${E.io(q) * 90}deg)`;
    if (sb) sb.style.transform = `rotateX(${-(1 - E.out3(q)) * 90}deg)`;
    fx.innerHTML = '';
  };
  X.themeTrans.cards = 'cardswap';
  X.trSfx.cardswap = 'whoosh'; X.trSfx.cardflip = 'impact';
})();
