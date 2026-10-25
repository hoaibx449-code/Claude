/* INFOGRAPHIC CHO VIDEO KIẾN THỨC — kiểu cảnh dùng được trong mọi format (lấy màu của video: --ink, --ink2, --acc, --acc2, --card).
   Mọi nội dung nằm trong vùng 150–900px (dưới đó là phụ đề). Mỗi phần tử hiện theo nhịp (data-in) hoặc theo cue → at.
   i_donut {title, value, label, parts?:[{label,value}]}         — phần trăm dạng vành khuyên (1 giá trị hoặc nhiều phần)
   i_rank {title, items:[{label,value}], unit}                   — xếp hạng thanh ngang, cao nhất trên cùng
   i_funnel {title, items:[{label,value?}]}                       — phễu: rộng → hẹp
   i_pyramid {title, items:[{label}]}                             — kim tự tháp: đáy → đỉnh (item đầu = đỉnh)
   i_venn {title, a, b, both}                                     — hai vòng giao nhau
   i_matrix {title, x:[trái,phải], y:[dưới,trên], items:[{label,q:1-4}]} — ma trận 2x2 (q1 phải-trên, q2 trái-trên, q3 trái-dưới, q4 phải-dưới)
   i_cycle {title, items:[{label,icon?}]}                         — vòng tuần hoàn
   i_proscons {title, pros:[..], cons:[..]}                        — ưu / nhược
   i_beforeafter {title, before:{label,text,image?}, after:{...}} — trước / sau (thanh trượt quét)
   i_table {title, cols:[..], rows:[[..]]}                         — bảng so sánh (ô "✓"/"✗" tự tô màu)
   i_ipo {title, input, process, output}                          — đầu vào → xử lý → đầu ra
   i_gauge {title, value(0-100), label, low?, high?}              — đồng hồ đo
   i_scale {title, items:[{label,value}], unit}                   — so sánh kích thước bằng vòng tròn tỉ lệ
   i_steps {title, items:[{text,cue?}]}                            — các bước đánh số, hiện lần lượt */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL, esc = (s) => U().esc(String(s ?? '')), rich = (s) => U().rich(String(s ?? ''));
  const at = (o, k, step = .45, base = .55) => (o && o.at != null ? +o.at : base + k * step);
  const head = (s) => `${s.kicker ? `<div class="label ig-kick" data-in=".05" data-a="left">${esc(s.kicker)}</div>` : ''}
    ${s.title ? `<div class="title ig-title" data-in=".12" data-a="title">${rich(s.title)}</div>` : ''}`;
  const wrap = (s, inner, cam = 'push') => ({ cam, html: `${head(s)}<div class="ig">${inner}</div>` });
  const num = (v) => (+v || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const COLORS = ['var(--acc)', 'var(--acc2)', 'color-mix(in srgb,var(--acc) 55%,var(--ink))', 'color-mix(in srgb,var(--acc2) 55%,var(--ink))', 'rgba(127,127,127,.55)'];

  X.scenes.i_donut = (s) => {
    const parts = Array.isArray(s.parts) && s.parts.length ? s.parts : [{ label: s.label || '', value: +s.value || 0 }, { label: '', value: 100 - (+s.value || 0), rest: true }];
    const tot = parts.reduce((a, p) => a + (+p.value || 0), 0) || 1, R = 190, C = 2 * Math.PI * R;
    let off = 0, arcs = '', leg = '';
    parts.forEach((p, k) => {
      const f = (+p.value || 0) / tot;
      arcs += `<circle cx="260" cy="260" r="${R}" fill="none" stroke="${p.rest ? 'rgba(127,127,127,.22)' : COLORS[k % 4]}" stroke-width="58" pathLength="1"
        stroke-dasharray="${f} ${1 - f}" stroke-dashoffset="${-off}" transform="rotate(-90 260 260)" data-in="${p.rest ? .3 : at(p, k, .35, .5)}" data-a="fade"/>`;
      off += f;
      if (!p.rest && parts.length > 2) leg += `<div class="ig-leg" data-in="${at(p, k, .35, .8)}" data-a="up"><i style="background:${COLORS[k % 4]}"></i>${esc(p.label)} <b>${num(p.value)}%</b></div>`;
    });
    const main = parts.length > 2 ? '' : `<div class="ig-donut-c" data-in=".7" data-a="pop"><b><span class="cnt" data-from="0" data-to="${+parts[0].value || 0}" data-dec="${String(parts[0].value).includes('.') ? 1 : 0}" data-t=".6" data-dur="1.1">0</span>%</b><small>${esc(parts[0].label)}</small></div>`;
    return wrap(s, `<svg class="ig-donut" viewBox="0 0 520 520">${arcs}</svg>${main}<div class="ig-legend">${leg}</div>`);
  };

  X.scenes.i_rank = (s) => {
    const it = (s.items || []).slice(0, 6).map((x) => ({ ...x, value: +x.value || 0 })).sort((a, b) => b.value - a.value), mx = Math.max(1, ...it.map((x) => x.value));
    return wrap(s, it.map((x, k) => `<div class="ig-rank" style="top:${k * 104}px" data-in="${at(x, k, .32)}" data-a="left">
      <span class="ig-rk">${k + 1}</span><div class="ig-rbar"><i style="width:${Math.max(8, 100 * x.value / mx)}%;background:${k ? 'rgba(127,127,127,.5)' : 'var(--acc)'}" data-in="${at(x, k, .32) + .1}" data-a="grow"></i>
      <span>${esc(x.label)}</span><b>${num(x.value)}${esc(s.unit || '')}</b></div></div>`).join(''));
  };

  X.scenes.i_funnel = (s) => {
    const it = (s.items || []).slice(0, 5), n = it.length || 1;
    return wrap(s, it.map((x, k) => { const w = 620 - k * (360 / Math.max(1, n - 1 || 1)); return `<div class="ig-fun" style="top:${k * 128}px;width:${w}px;background:${COLORS[k % 4]}" data-in="${at(x, k, .4)}" data-a="pop">
      <b>${esc(x.label)}</b>${x.value != null ? `<small>${esc(x.value)}</small>` : ''}</div>`; }).join(''));
  };

  X.scenes.i_pyramid = (s) => {
    const it = (s.items || []).slice(0, 5), n = it.length || 1, H = 600 / n;
    return wrap(s, it.map((x, k) => { const t = k / n, b = (k + 1) / n; // k = 0 là đỉnh
      return `<div class="ig-pyr" style="top:${k * H}px;height:${H - 8}px;font-size:${k ? 26 : 20}px;clip-path:polygon(${50 - 46 * t}% 0,${50 + 46 * t}% 0,${50 + 46 * b}% 100%,${50 - 46 * b}% 100%);background:${COLORS[k % 4]}" data-in="${at(x, n - 1 - k, .4)}" data-a="up"><b>${esc(x.label)}</b></div>`; }).join(''));
  };

  X.scenes.i_venn = (s) => wrap(s, `<div class="ig-vc ig-va" data-in=".5" data-a="left"><b>${esc(s.a)}</b></div><div class="ig-vc ig-vb" data-in=".9" data-a="right"><b>${esc(s.b)}</b></div>
    <div class="ig-vboth" data-in="${s.at ?? 1.4}" data-a="pop">${rich(s.both || '')}</div>`);

  X.scenes.i_matrix = (s) => {
    const pos = { 1: [75, 25], 2: [25, 25], 3: [25, 75], 4: [75, 75] }, seen = {};
    return wrap(s, `<div class="ig-mx" data-in=".35" data-a="pop"><i></i><i></i>
      <span class="ig-mx-x0">${esc((s.x || [])[0])}</span><span class="ig-mx-x1">${esc((s.x || [])[1])}</span><span class="ig-mx-y0">${esc((s.y || [])[0])}</span><span class="ig-mx-y1">${esc((s.y || [])[1])}</span>
      ${(s.items || []).slice(0, 6).map((x, k) => { const q = pos[x.q] ? x.q : 1 + (k % 4), p = pos[q], n = (seen[q] = (seen[q] || 0) + 1) - 1; return `<div class="ig-mx-dot" style="left:${p[0]}%;top:${p[1] - 9 + n * 18}%" data-in="${at(x, k, .4, .8)}" data-a="pop">${esc(x.label)}</div>`; }).join('')}</div>`);
  };

  X.scenes.i_cycle = (s) => {
    const it = (s.items || []).slice(0, 6), n = it.length || 1, R = 230;
    return wrap(s, `<svg class="ig-cyc" viewBox="0 0 640 640"><circle cx="320" cy="320" r="${R}" fill="none" stroke="var(--acc)" stroke-width="6" stroke-dasharray="14 16" pathLength="1" data-in=".3" data-a="draw" data-d="1.4"/></svg>
      ${it.map((x, k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / n; return `<div class="ig-cn" style="left:${320 + R * Math.cos(a)}px;top:${320 + R * Math.sin(a)}px" data-in="${at(x, k, .45, .6)}" data-a="pop"><em>${k + 1}</em>${esc(x.label)}</div>`; }).join('')}
      ${s.center ? `<div class="ig-cc" data-in="${.6 + n * .45}" data-a="pop">${rich(s.center)}</div>` : ''}`);
  };

  X.scenes.i_proscons = (s) => wrap(s, `<div class="ig-pc ig-pro" data-in=".4" data-a="left"><h4>${esc(s.prosTitle || 'Ưu điểm')}</h4>${(s.pros || []).slice(0, 4).map((x, k) => `<p data-in="${.7 + k * .35}" data-a="up"><i>✓</i>${esc(x)}</p>`).join('')}</div>
    <div class="ig-pc ig-con" data-in=".6" data-a="right"><h4>${esc(s.consTitle || 'Nhược điểm')}</h4>${(s.cons || []).slice(0, 4).map((x, k) => `<p data-in="${1 + (s.pros || []).length * .35 + k * .35}" data-a="up"><i>✗</i>${esc(x)}</p>`).join('')}</div>`);

  X.scenes.i_beforeafter = (s) => {
    const side = (o, cls) => `<div class="ig-ba ${cls}">${o && o.image && o.image.src ? U().photo(o.image, 'kb') : ''}<div class="ig-ba-t"><small>${esc(o?.label || (cls === 'ig-b4' ? 'TRƯỚC' : 'SAU'))}</small><b>${rich(o?.text || '')}</b></div></div>`;
    return wrap(s, `<div class="ig-baw" data-in=".3" data-a="pop">${side(s.before, 'ig-b4')}${side(s.after, 'ig-af')}<i class="ig-bar"></i></div>`, 'still');
  };

  X.scenes.i_table = (s) => {
    const cols = (s.cols || []).slice(0, 3), rows = (s.rows || []).slice(0, 5);
    const cell = (v) => { const t = String(v ?? ''); return t === '✓' || /^(có|yes)$/i.test(t) ? '<b class="ok">✓</b>' : t === '✗' || /^(không|no)$/i.test(t) ? '<b class="no">✗</b>' : esc(t); };
    return wrap(s, `<table class="ig-tb" data-in=".3" data-a="pop"><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>
      ${rows.map((r, k) => `<tr data-in="${.6 + k * .35}" data-a="left">${r.slice(0, cols.length + 1).map((v, i) => i ? `<td>${cell(v)}</td>` : `<td class="rh">${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`);
  };

  X.scenes.i_ipo = (s) => {
    const box = (o, k, cls) => `<div class="ig-ipo ${cls}" style="top:${k * 220}px" data-in="${.4 + k * .6}" data-a="pop"><small>${['ĐẦU VÀO', 'XỬ LÝ', 'KẾT QUẢ'][k]}</small><b>${rich(o || '')}</b></div>`;
    return wrap(s, box(s.input, 0, '') + `<i class="ig-arr" style="top:150px" data-in=".8" data-a="growY"></i>` + box(s.process, 1, 'mid') + `<i class="ig-arr" style="top:370px" data-in="1.4" data-a="growY"></i>` + box(s.output, 2, 'out'));
  };

  X.scenes.i_gauge = (s) => {
    const v = Math.max(0, Math.min(100, +s.value || 0));
    return wrap(s, `<svg class="ig-gauge" viewBox="0 0 600 340"><path d="M60 300 A240 240 0 0 1 540 300" fill="none" stroke="rgba(127,127,127,.25)" stroke-width="44" stroke-linecap="round"/>
      <path d="M60 300 A240 240 0 0 1 540 300" fill="none" stroke="url(#gg)" stroke-width="44" stroke-linecap="round" pathLength="100" stroke-dasharray="${v} 100" data-in=".5" data-a="fade"/>
      <defs><linearGradient id="gg"><stop offset="0" stop-color="var(--acc2)"/><stop offset="1" stop-color="var(--acc)"/></linearGradient></defs>
      <g class="ig-needle" style="transform:rotate(${-90 + 180 * v / 100}deg)" data-in=".5" data-a="fade"><line x1="300" y1="300" x2="300" y2="96" stroke="var(--ink)" stroke-width="9" stroke-linecap="round"/><circle cx="300" cy="300" r="20" fill="var(--ink)"/></g></svg>
      <div class="ig-gv" data-in="1" data-a="pop"><b><span class="cnt" data-from="0" data-to="${v}" data-dec="0" data-t=".6" data-dur="1">0</span>${esc(s.unit ?? '%')}</b><small>${esc(s.label || '')}</small></div>
      <span class="ig-glo">${esc(s.low || '')}</span><span class="ig-ghi">${esc(s.high || '')}</span>`);
  };

  X.scenes.i_scale = (s) => {
    const it = (s.items || []).slice(0, 4), mx = Math.max(1, ...it.map((x) => +x.value || 0));
    let x = 40;
    return wrap(s, it.map((o, k) => { const d = Math.max(36, 320 * Math.sqrt((+o.value || 0) / mx)), h = `<div class="ig-sc" style="left:${x}px;width:${d}px;height:${d}px;background:${COLORS[k % 4]}" data-in="${at(o, k, .45)}" data-a="pop"></div>
      <div class="ig-scl" style="left:${x + d / 2}px" data-in="${at(o, k, .45) + .15}" data-a="up"><b>${num(o.value)}${esc(s.unit || '')}</b>${esc(o.label)}</div>`; x += d + 24; return h; }).join(''));
  };

  X.scenes.i_steps = (s) => wrap(s, (s.items || []).slice(0, 5).map((x, k) => `<div class="ig-step" style="top:${k * 122}px" data-in="${at(x, k, .55)}" data-a="left"><em>${k + 1}</em><span>${rich(x.text || x)}</span></div>`).join(''));

  // kim đồng hồ đo + thanh trượt trước/sau: chuyển động theo thời gian cảnh
  X.update.push((o, lt) => {
    if (o.s.type === 'i_gauge') { const g = o.el.querySelector('.ig-needle'), v = Math.max(0, Math.min(100, +o.s.value || 0)), p = U().E.out3(Math.max(0, Math.min(1, (lt - .5) / 1.2)));
      if (g) g.style.transform = `rotate(${-90 + 180 * v / 100 * p}deg)`; const arc = o.el.querySelector('.ig-gauge path[data-a]'); if (arc) arc.setAttribute('stroke-dasharray', `${v * p} 100`); }
    if (o.s.type === 'i_beforeafter') { const p = U().E.io(Math.max(0, Math.min(1, (lt - (o.s.at ?? o.dur * .45)) / .9))), af = o.el.querySelector('.ig-af'), bar = o.el.querySelector('.ig-bar');
      if (af) af.style.clipPath = `inset(0 0 0 ${100 - 100 * p}%)`; if (bar) bar.style.left = `${100 - 100 * p}%`; }
    if (o.s.type === 'i_donut') o.el.querySelectorAll('.ig-donut circle[data-a]').forEach(c => { const d = c.getAttribute('stroke-dasharray').split(' ')[0], t0 = +c.dataset.in, p = U().E.out3(Math.max(0, Math.min(1, (lt - t0) / .9)));
      c.style.strokeDasharray = `${d * p} ${1 - d * p}`; });
  });
})();
