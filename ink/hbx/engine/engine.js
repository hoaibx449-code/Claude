/* HBX Video Engine — storyboard JSON → khung hình xác định theo thời gian (setTime).
   Mọi chuyển động là hàm thuần của t ⇒ render song song, không lệch khung. */
(function () {
  const EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const W = 720, H = 1280;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const E = {
    out3: p => 1 - Math.pow(1 - p, 3),
    out5: p => 1 - Math.pow(1 - p, 5),
    io: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
    back: p => { const c = 2.0; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    elastic: p => p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - .75) * 2.094) + 1,
  };
  const rnd = s => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // *từ khóa* → <em>, \n → <br>
  const rich = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  const lines2 = t => Array.isArray(t) ? `${esc(t[0])}${t[1] ? `<b>${esc(t[1])}</b>` : ''}` : esc(t);

  /* ---------- khối dùng chung ---------- */
  const hdr = (s, o = {}) => `
    <div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
    ${s.title ? `<div class="title" data-in=".15" data-a="${o.titleAnim || 'title'}">${lines2(s.title)}</div>
    <div class="uline" style="top:${o.ulineTop || 300}px" data-in=".45" data-a="grow"></div>` : ''}`;
  const photo = (img, cls = '') => {
    // video Pixabay: chuỗi khung JPG, đổi khung theo setTime (xác định, không phụ thuộc trình phát)
    if (img && img.frames) return `<div class="photo vid ${cls}"><img class="vf" src="${img.src}" data-dir="${img.frames.dir}" data-n="${img.frames.n}" data-fps="${img.frames.fps}"></div>`;
    if (img && img.src) return `<div class="photo ${cls}" style="background-image:url('${img.src}')"></div>`;
    return `<div class="photo ph ${cls}">${esc(img && img.q || 'ảnh')}</div>`;
  };
  const credit = img => img && img.credit ? `<div class="credit">${esc(img.credit)}</div>` : '';
  const deco = (seed) => {
    let h = '<div class="deco">';
    const a = rnd(seed) * 300;
    h += `<div class="arc" style="left:${-300 + a * .3}px;top:${380 + a}px;width:1300px;height:950px"></div>`;
    h += `<div class="arc" style="left:${-140}px;top:${520 + a * .5}px;width:1000px;height:760px"></div>`;
    return h + '</div><div class="grain"></div>';
  };

  /* ---------- 13 loại cảnh ---------- */
  const S = {};

  // 1. Mở đầu ảnh thật + khoanh tiêu điểm
  S.hook_photo = (s) => {
    const f = Object.assign({ x: .5, y: .45, r: .22 }, s.focus || {});
    const cw = 638, ch = 570, cx = f.x * cw, cy = f.y * ch, r = f.r * cw;
    return {
      cam: 'push', html: `${hdr(s)}
      <div class="card" style="top:340px;height:580px" data-in=".3" data-a="pop">
        ${photo(s.image, 'kb')}
        <svg style="position:absolute;inset:0" width="${cw}" height="${ch}">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--warn)" stroke-width="5" pathLength="1" transform="rotate(-90 ${cx} ${cy})" data-in=".9" data-a="draw"/>
          <circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2" stroke-dasharray="4 10" data-in="1.1" data-a="fade"/>
          <path d="M${cx - r * .7} ${cy + r * .7} L${Math.max(40, cx - r - 60)} ${ch - 40}" stroke="var(--warn)" stroke-width="4" stroke-dasharray="10 8" fill="none" data-in="1.3" data-a="fade"/>
        </svg>
        <div class="tag">${esc(s.tag || 'ẢNH MINH HỌA')}</div>${credit(s.image)}
      </div>
      ${s.chip ? `<div class="chip" style="left:54px;top:888px;transform:rotate(-2.5deg)" data-in="1.4" data-a="pop">${esc(s.chip)}</div>` : ''}`,
      focus: f
    };
  };

  // 2. Câu hỏi chữ lớn (open loop)
  S.question = (s) => {
    const n = (s.text || '').split('\n').length;
    return {
      cam: 'pull', html: `
      ${s.image ? `<div style="position:absolute;inset:0;opacity:.28;filter:blur(14px) saturate(1.2)">${photo(s.image, 'kb')}</div>` : ''}
      <div class="qmark" style="position:absolute;left:0;right:0;top:250px;text-align:center;font-family:var(--font-h);font-weight:900;font-size:620px;line-height:1;color:var(--ink);opacity:.06">?</div>
      <div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
      <div class="kicker" style="top:${470 - n * 45}px" data-in=".15" data-a="pop">${esc(s.kicker || 'CÂU HỎI')}</div>
      <div class="big" style="top:${530 - n * 45}px" data-in=".3" data-a="title">${rich(s.text)}</div>
      <div class="qline" style="position:absolute;left:180px;right:180px;top:${530 - n * 45}px;height:7px;background:var(--warn);border-radius:4px;transform-origin:center" data-in=".7" data-a="grow"></div>`
    };
  };

  // 3. Ảnh thật + các ghim chú thích
  S.callouts = (s) => {
    const cw = 638, ch = 570;
    let svg = '', lbl = '';
    (s.pins || []).forEach((p, i) => {
      const x = p.x * cw, y = p.y * ch, t = 0.8 + i * (s.pinGap || 0.9);
      const right = p.side ? p.side === 'r' : p.x < .5;
      const lx = right ? Math.min(cw - 30, x + 150) : Math.max(30, x - 150), ly = y - 50;
      svg += `<circle cx="${x}" cy="${y}" r="13" fill="var(--warn)" stroke="#fff" stroke-width="4" data-in="${t}" data-a="pop"/>
              <circle class="pulse" cx="${x}" cy="${y}" r="13" fill="none" stroke="var(--warn)" stroke-width="3" data-t="${t}"/>
              <path d="M${x} ${y} L${lx} ${ly}" stroke="#fff" stroke-width="3" stroke-dasharray="7 6" fill="none" data-in="${t + .1}" data-a="fade"/>`;
      lbl += `<div class="pinlbl" style="${right ? 'left' : 'right'}:${right ? lx + 36 : cw - lx + 36}px;top:${340 + ly - 22}px" data-in="${t + .2}" data-a="${right ? 'right' : 'left'}">${esc(p.text)}</div>`;
    });
    return {
      cam: 'push', html: `${hdr(s)}
      <div class="card" style="top:340px;height:580px" data-in=".3" data-a="pop">
        ${photo(s.image, 'kb')}<div class="shade"></div>
        <svg style="position:absolute;inset:0" width="${cw}" height="${ch}">${svg}</svg>
        <div class="tag">${esc(s.tag || 'ẢNH MINH HỌA')}</div>${credit(s.image)}
      </div>${lbl}`
    };
  };

  // 4. Con số lớn
  S.big_number = (s) => {
    const up = (s.dir || 'up') === 'up';
    return {
      cam: 'still', html: `
      ${s.image ? `<div style="position:absolute;inset:0;opacity:.22;filter:blur(10px)">${photo(s.image, 'kb')}</div>` : ''}
      <svg class="burst" style="position:absolute;left:60px;top:250px" width="600" height="600" viewBox="-300 -300 600 600">
        ${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="-170" x2="0" y2="-280" stroke="var(--acc)" stroke-width="4" stroke-linecap="round" opacity=".25" transform="rotate(${i * 15})"/>`).join('')}
      </svg>
      <div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
      <div class="kicker" style="top:330px" data-in=".1" data-a="pop">${esc(s.kicker || 'CON SỐ')}</div>
      <div class="numwrap" style="top:420px;font-size:${s.size || 160}px;line-height:1" data-in=".25" data-a="pop">
        <span style="font-size:.45em;vertical-align:.6em">${esc(s.prefix || '')}</span><span class="cnt" data-from="${s.from || 0}" data-to="${s.value}" data-dec="${s.decimals || 0}" data-t="${s.countAt || .35}" data-dur="${s.countDur || 1.4}">0</span><span style="font-size:.4em;color:var(--ink2)">${esc(s.suffix || '')}</span>
      </div>
      <div class="cap" style="top:${420 + (s.size || 160) + 40}px" data-in="1.2" data-a="up">${rich(s.caption)}</div>
      ${s.delta ? `<div class="delta" style="top:${420 + (s.size || 160) + 150}px;background:${up ? 'var(--up)' : 'var(--down)'}" data-in="1.8" data-a="pop">${up ? '▲' : '▼'} ${esc(s.delta)}</div>` : ''}`
    };
  };

  // 5. Biểu đồ tự vẽ (line | bar)
  S.chart = (s) => {
    const d = s.data || [], n = d.length, cw = 638, ch = 570, px = 60, py = 90, gw = cw - px * 2, gh = ch - py - 110;
    const mn = s.kind === 'bar' ? 0 : Math.min(...d) * .92, mx = Math.max(...d) * 1.06;
    const X = i => px + (n === 1 ? gw / 2 : i * gw / (n - 1)), Y = v => py + gh - (v - mn) / (mx - mn) * gh;
    let g = '';
    for (let k = 0; k <= 4; k++) g += `<line x1="${px}" x2="${cw - px}" y1="${py + k * gh / 4}" y2="${py + k * gh / 4}" stroke="rgba(127,127,127,.25)" stroke-width="1.5" stroke-dasharray="5 6"/>`;
    const fmt = v => (s.fmt === 'vi' ? v.toLocaleString('vi-VN') : String(v)) + (s.unit || '');
    if (s.kind === 'bar') {
      const bw = gw / n * .62;
      d.forEach((v, i) => {
        const x = px + (i + .5) * gw / n - bw / 2, hl = i === (s.highlight ?? n - 1);
        g += `<rect x="${x}" y="${Y(v)}" width="${bw}" height="${py + gh - Y(v)}" rx="8" fill="${hl ? 'var(--acc)' : 'rgba(127,127,127,.45)'}" data-in="${.7 + i * .18}" data-a="growY"/>
        <text x="${x + bw / 2}" y="${Y(v) - 14}" text-anchor="middle" font-weight="900" font-size="${hl ? 26 : 20}" fill="var(--card-ink)" data-in="${.9 + i * .18}" data-a="fade">${fmt(v)}</text>
        <text x="${x + bw / 2}" y="${py + gh + 36}" text-anchor="middle" font-weight="700" font-size="19" fill="var(--card-ink)" opacity=".7">${esc((s.labels || [])[i] || '')}</text>`;
      });
    } else {
      const pts = d.map((v, i) => `${X(i)},${Y(v)}`).join(' L');
      g += `<path d="M${X(0)},${py + gh} L${pts} L${X(n - 1)},${py + gh}Z" fill="var(--acc)" opacity=".16" data-in="1.8" data-a="fade"/>
        <path d="M${pts}" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" pathLength="1" data-in=".7" data-a="draw" data-d="1.6"/>`;
      d.forEach((v, i) => { g += `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === n - 1 ? 11 : 6}" fill="var(--card)" stroke="var(--acc)" stroke-width="4" data-in="${.7 + 1.6 * i / Math.max(1, n - 1)}" data-a="pop"/>`; });
      (s.labels || []).forEach((l, i) => { if (l) g += `<text x="${X(i)}" y="${py + gh + 36}" text-anchor="middle" font-weight="700" font-size="18" fill="var(--card-ink)" opacity=".7">${esc(l)}</text>`; });
      const lv = d[n - 1];
      g += `<g data-in="2.4" data-a="pop"><rect x="${X(n - 1) - 120}" y="${Y(lv) - 72}" width="132" height="46" rx="10" fill="var(--acc)"/><text x="${X(n - 1) - 54}" y="${Y(lv) - 40}" text-anchor="middle" font-weight="900" font-size="22" fill="var(--hl-ink)">${fmt(lv)}</text></g>`;
    }
    return {
      cam: 'push', html: `${hdr(s)}
      <div class="card" style="top:340px;height:580px" data-in=".3" data-a="pop">
        <svg width="${cw}" height="${ch}" style="font-family:var(--font-b)">
          <text x="${px}" y="54" font-weight="800" font-size="20" fill="var(--card-ink)" opacity=".75">${esc(s.caption || '')}</text>${g}
        </svg>
        ${s.source ? `<div style="position:absolute;left:${px}px;bottom:16px;font-size:14px;font-weight:600;color:var(--card-ink);opacity:.6">Nguồn: ${esc(s.source)}</div>` : ''}
      </div>`
    };
  };

  // 6. So sánh A/B
  S.compare = (s) => {
    const side = (o, top, a, t) => `<div class="half" style="top:${top}px" data-in="${t}" data-a="${a}">${photo(o.image, 'kb')}<div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.65))"></div>
      <div class="nm">${esc(o.name)}</div><div class="pts">${(o.points || []).map((p, i) => `<div data-in="${t + .5 + i * .35}" data-a="${a}">${esc(p)}</div>`).join('')}</div>${credit(o.image)}</div>`;
    return {
      cam: 'still', html: `<div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
      <div class="title" style="font-size:46px" data-in=".1" data-a="title">${lines2(s.title)}</div>
      ${side(s.a || {}, 330, 'left', .35)}${side(s.b || {}, 650, 'right', .9)}
      <div class="vs" style="top:640px" data-in="1.4" data-a="pop">VS</div>`
    };
  };

  // 7. Checklist / các bước
  S.checklist = (s) => {
    const it = s.items || [], gap = Math.min(128, 470 / it.length);
    return {
      cam: 'still', html: `<div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
      <div class="kicker" style="top:290px" data-in=".1" data-a="pop">${esc(s.kicker || '')}</div>
      <div class="big" style="top:345px;font-size:64px" data-in=".2" data-a="title">${rich(s.title)}</div>
      ${it.map((x, i) => `<div class="check" style="top:${470 + i * gap}px" data-in="${(s.itemAt || .7) + i * (s.itemGap || .8)}" data-a="left" data-sfx="tick"><i><b>${i + 1}</b></i>${esc(x)}</div>`).join('')}`
    };
  };

  // 8. Dòng thời gian
  S.timeline = (s) => {
    const it = s.items || [], gap = Math.min(150, 540 / it.length);
    return {
      cam: 'rise', html: `${hdr(s)}
      <div style="position:absolute;left:83px;top:360px;width:5px;height:${gap * (it.length - 1) + 30}px;background:var(--acc);opacity:.6;transform-origin:top" data-in=".4" data-a="growY" data-d="1.2"></div>
      ${it.map((x, i) => { const t = .6 + i * (s.itemGap || .9); return `<div class="tl-dot" style="top:${362 + i * gap}px" data-in="${t}" data-a="pop"></div>
        <div class="tl-item" style="top:${352 + i * gap}px" data-in="${t + .1}" data-a="right"><div class="w">${esc(x.when)}</div><div class="t">${esc(x.text)}</div></div>`; }).join('')}`
    };
  };

  // 9. Tiêu đề báo (trích nguồn) — đánh máy + bút dạ quang
  S.headline = (s) => {
    let hd = esc(s.text);
    if (s.highlight) hd = hd.replace(esc(s.highlight), `<mark data-t="${s.markAt || 2.2}">${esc(s.highlight)}</mark>`);
    return {
      cam: 'push', html: `
      ${s.image ? `<div style="position:absolute;inset:0;opacity:.35;filter:blur(8px)">${photo(s.image, 'kb')}</div>` : ''}
      <div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
      <div class="kicker" style="top:300px" data-in=".1" data-a="pop">${esc(s.kicker || 'NGUỒN TIN')}</div>
      <div class="news" style="top:380px;transform:rotate(-1.2deg)" data-in=".3" data-a="up">
        <div class="src">${esc(s.source)}<span>${esc(s.date || '')}</span></div>
        <div class="hd" data-a2="type" data-t="${s.typeAt || .7}" data-dur="${s.typeDur || 1.4}">${hd}</div>
      </div>`
    };
  };

  // 10. Ảnh tràn màn hình, điện ảnh
  S.fullbleed = (s) => ({
    cam: 'drift', html: `<div style="position:absolute;inset:0">${photo(s.image, 'kb fb')}</div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,0) 30%,rgba(0,0,0,.15) 50%,rgba(0,0,0,.8) 75%)"></div>
      <div class="letterbox" style="top:0" data-lb="1"></div><div class="letterbox" style="bottom:0" data-lb="1"></div>
      <div class="label" style="top:${s.capTop ? s.capTop - 40 : 640}px;color:#fff;opacity:.9" data-in=".3" data-a="left">${esc(s.label || '')}</div>
      <div class="fb-cap" style="top:${s.capTop || 680}px" data-in=".45" data-a="title">${lines2(s.caption)}</div>
      ${credit(s.image).replace('class="credit"', 'class="credit" style="bottom:auto;top:110px"')}`
  });

  // 11. Cảnh báo
  S.warning = (s) => ({
    cam: 'push', html: `${hdr(s)}
      <div class="card" style="top:340px;height:580px" data-in=".3" data-a="pop">
        ${photo(s.image, 'kb')}<div class="vign" style="position:absolute;inset:0;box-shadow:inset 0 0 120px 30px rgba(226,65,59,.8);opacity:0"></div>
        <div class="tag">${esc(s.tag || 'ẢNH MINH HỌA')}</div>${credit(s.image)}
      </div>
      ${(s.warns || []).map((w, i) => `<div class="warn" style="${i % 2 ? 'right:60px' : 'left:60px'};top:${820 - i * 82}px;transform:rotate(${i % 2 ? 2 : -2}deg)" data-in="${1 + i * .45}" data-a="pop">! ${esc(w)}</div>`).join('')}`
  });

  // 12. Kết — đóng vòng lặp + CTA
  S.outro = (s) => ({
    cam: 'pull', html: `
      ${s.image ? `<div style="position:absolute;inset:0;opacity:.25;filter:blur(12px)">${photo(s.image, 'kb')}</div>` : ''}
      <div class="label" data-in=".05" data-a="left">${esc(s.label || '')}</div>
      <div class="kicker" style="top:300px" data-in=".1" data-a="pop">${esc(s.kicker || 'GHI NHỚ')}</div>
      <div class="big" style="top:360px;font-size:${s.size || 70}px" data-in=".25" data-a="title">${rich(s.text)}</div>
      ${s.cta ? `<div class="ctab" style="position:absolute;left:50%;top:${s.ctaTop || 760}px;transform:translateX(-50%);background:var(--card);color:var(--card-ink);border:4px solid var(--hl);font-weight:900;font-size:28px;padding:18px 34px;border-radius:50px;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.3)" data-in="1.2" data-a="pop">${esc(s.cta)} →</div>` : ''}`
  });

  // 13. Sơ đồ SVG tùy biến (.draw tự vẽ nét, [data-in] tự chạy)
  S.svg = (s) => ({ cam: 'push', html: `${hdr(s)}<div style="position:absolute;left:30px;top:340px;width:660px;height:590px">${s.svg || ''}</div>` });

  Object.assign(S, EXT.scenes);

  /* ---------- Camera ảo ---------- */
  const CAM = {
    still: (p) => `scale(${1 + .015 * p})`,
    push: (p) => `scale(${1 + .06 * E.io(p)})`,
    pull: (p) => `scale(${1.08 - .08 * E.out3(p)})`,
    drift: (p) => `scale(${1.04 + .03 * p}) translateX(${-12 + 24 * p}px)`,
    rise: (p) => `translateY(${30 - 30 * E.out3(p)}px) scale(1.02)`,
    panL: (p) => `scale(1.08) translateX(${24 - 48 * E.io(p)}px)`,
    panR: (p) => `scale(1.08) translateX(${-24 + 48 * E.io(p)}px)`,
    // ngôn ngữ máy quay mới (dùng chung tên với journey)
    dolly: (p) => `scale(${1 + .13 * p})`,                                   // tiến thẳng đều theo trục (tracking forward)
    zoom: (p) => `scale(${1 + .2 * Math.pow(E.io(p), 1.4)})`,                // thu phóng sâu vào không gian (về tiêu điểm)
    fpv: (p) => `scale(${1.01 + .11 * p}) rotate(${Math.sin(p * 6.3) * 1.6}deg) translate(${Math.sin(p * 23) * 4}px,${Math.cos(p * 19) * 3}px)`, // bay FPV: lao tới, nghiêng, rung
  };

  /* ---------- Chuyển cảnh ---------- */
  const TR = {
    // bay xuyên (FPV): lao vào giữa cảnh cũ (phóng to + nhòe + nghiêng) rồi trồi ra ở cảnh mới
    fpv(A, B, p, fx) {
      // cảnh cũ lao tới + nghiêng + nhoè; cảnh mới hiện dần từ vệt nhoè (không đổi cỡ đột ngột, không lộ viền)
      const m = clamp((p - .35) / .35), e = E.io(p);
      A.style.visibility = 'visible'; B.style.visibility = m > 0 ? 'visible' : 'hidden'; B.style.zIndex = 2;
      A.style.transform = `scale(${1 + .6 * e * e}) rotate(${4 * e * e}deg)`; A.style.filter = `blur(${e * 10}px)`;
      B.style.opacity = E.io(m); B.style.transform = `rotate(${-2 * (1 - m)}deg) scale(${1 + .06 * (1 - m)})`; B.style.filter = `blur(${(1 - m) * 9}px)`;
      fx.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,transparent 30%,rgba(0,0,0,${.45 * Math.sin(Math.PI * p)}) 80%)"></div>`;
    },
    stripes(A, B, p, fx) {
      A.style.visibility = p < .5 ? 'visible' : 'hidden'; B.style.visibility = p >= .5 ? 'visible' : 'hidden';
      const cols = ['var(--acc2)', 'var(--acc)', '#fff'];
      fx.innerHTML = cols.map((c, i) => { const q = clamp(p * 1.25 - i * .1), x = 1400 - 2900 * E.io(q); return `<div style="position:absolute;top:-200px;bottom:-200px;left:${x + i * 160}px;width:${i == 2 ? 120 : 760}px;background:${c};transform:skewX(-18deg)"></div>`; }).join('');
    },
    glitch(A, B, p, fx, T) {
      const on = p < .5 ? A : B; A.style.visibility = p < .5 ? 'visible' : 'hidden'; B.style.visibility = p >= .5 ? 'visible' : 'hidden';
      const k = 1 - Math.abs(2 * p - 1), f = Math.floor(T * 30);
      on.style.transform = `translateX(${(rnd(f) - .5) * 40 * k}px)`;
      on.style.filter = `hue-rotate(${(rnd(f + 3) - .5) * 120 * k}deg) contrast(${1 + .4 * k})`;
      let h = '';
      for (let i = 0; i < 9; i++) { const y = rnd(f * 7 + i) * 1280, hh = 8 + rnd(f * 3 + i) * 70; if (rnd(f + i * 11) < k * .9) h += `<div style="position:absolute;left:${(rnd(i + f) - .5) * 200}px;top:${y}px;width:100%;height:${hh}px;background:${i % 3 ? 'var(--acc)' : 'var(--acc2)'};opacity:${.35 + .5 * rnd(i * f)};mix-blend-mode:screen"></div>`; }
      fx.innerHTML = h + `<div style="position:absolute;inset:0;background:#fff;opacity:${Math.max(0, k - .7) * 1.2}"></div>`;
    },
    slideup(A, B, p, fx) {
      const e = E.io(p); A.style.visibility = B.style.visibility = 'visible';
      A.style.transform = `scale(${1 - .06 * e})`; A.style.filter = `brightness(${1 - .5 * e})`;
      B.style.clipPath = `inset(${(1 - e) * 100}% 0 0 0)`; B.style.zIndex = 2;
      fx.innerHTML = `<div style="position:absolute;left:0;right:0;top:${(1 - e) * 1280 - 3}px;height:6px;background:linear-gradient(90deg,#f7dc8a,#b8841c,#f7dc8a);box-shadow:0 0 24px #e7b641"></div>`;
    },
    whip(A, B, p, fx) {
      const e = E.io(p), bl = Math.sin(Math.PI * p) * 16; A.style.visibility = B.style.visibility = 'visible';
      A.style.transform = `translateX(${-e * 720}px)`; B.style.transform = `translateX(${(1 - e) * 720}px)`;
      A.style.filter = B.style.filter = `blur(${bl}px)`; fx.innerHTML = '';
    },
    zoom(A, B, p, fx) {
      const e = E.io(p); A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2;
      A.style.transform = `scale(${1 + .8 * e})`; A.style.opacity = clamp(1 - e * 1.4); A.style.filter = `blur(${e * 10}px)`;
      B.style.opacity = clamp(e * 1.6 - .2); B.style.filter = `blur(${(1 - e) * 10}px)`;
      fx.innerHTML = '';
    },
    flash(A, B, p, fx) {
      A.style.visibility = p < .5 ? 'visible' : 'hidden'; B.style.visibility = p >= .5 ? 'visible' : 'hidden';
      fx.innerHTML = `<div style="position:absolute;inset:0;background:#fff;opacity:${1 - Math.abs(2 * p - 1)}"></div>`;
    },
  };
  Object.assign(TR, EXT.trans);
  const THEME_TR = Object.assign({ life: 'stripes', tech: 'glitch', finance: 'slideup', tips: 'whip' }, EXT.themeTrans);
  const TR_SFX = Object.assign({ fpv: 'whoosh', stripes: 'whoosh', glitch: 'glitch', slideup: 'whoosh', whip: 'whoosh', zoom: 'whoosh', flash: 'impact' }, EXT.trSfx);
  const TD = .5;

  /* ---------- Build ---------- */
  let SB, SC = [], TOTAL = 0, WORDS = [], CHUNKS = [], EVENTS = [];
  const root = document.getElementById('stage');

  function build(sb) {
    SB = sb; document.body.dataset.theme = sb.theme || 'life';
    if (sb.mood) document.body.dataset.mood = sb.mood; else delete document.body.dataset.mood;
    let acc = 0;
    sb.scenes.forEach((s, i) => {
      const def = S[s.type](s, { i, n: sb.scenes.length, start: acc, sb });
      const el = document.createElement('section');
      el.className = 'scene'; el.dataset.tone = s.tone || 'a';
      el.innerHTML = `<div class="cam">${deco(i + (sb.seed || 1))}${sb.brand ? `<div class="pill"><i></i>${esc(sb.brand)}</div>` : ''}${def.html}</div>`;
      root.appendChild(el);
      (EXT.decorate || []).forEach(f => f(s, el, { i, start: acc }));   // kho kỹ thuật dựng (fx.js): đồ hoạ phủ, hiệu ứng, tốc độ
      const o = { s, el, cam: el.querySelector('.cam'), camKind: s.camera || def.cam, start: acc, dur: s.dur, focus: def.focus, items: [...el.querySelectorAll('[data-in]')] };
      o.items.forEach(x => { x._base = x.style.transform || ''; x._in = parseFloat(x.dataset.in); x._d = parseFloat(x.dataset.d || .55); });
      el.querySelectorAll('[data-a2=type]').forEach(x => { x._html = x.innerHTML; });
      el.querySelectorAll('img.vf').forEach(v => { v.dataset.t0 = acc; if (v.dataset.d === undefined) v.dataset.d = s.dur; });
      SC.push(o); acc += s.dur;
    });
    TOTAL = acc;
    buildWords(); buildEvents();
    const prog = document.getElementById('prog'); for (let i = 0; i < 12; i++) prog.appendChild(document.createElement('div'));
    const imgs = [...document.querySelectorAll('.photo')].map(p => (p.style.backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1]).filter(Boolean);
    return Promise.all([document.fonts.ready, ...imgs.map(u => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = u; }))]).then(() => { placeLines(root); return EXT.fit && EXT.fit(root); });
  }

  // gạch dưới câu hỏi: đặt theo chiều cao THẬT của chữ sau khi tự xuống dòng (không đoán theo số dòng)
  function placeLines(root) {
    root.querySelectorAll('.qline').forEach(l => { const b = l.previousElementSibling; if (b) l.style.top = (b.offsetTop + b.offsetHeight + 18) + 'px'; });
  }
  // Phụ đề: dùng mốc từ giọng đọc (sb.words) nếu có, không thì chia theo độ dài từ
  /* ---------- Phụ đề: ngắt cụm theo NGHĨA ----------
     Ưu tiên: (1) dấu "|" do kịch bản đánh dấu, (2) dấu câu, (3) tự chia đôi cụm dài
     tại điểm cân bằng nhất mà không để lửng hư từ ở cuối / không bẻ đôi số + đơn vị. */
  const BAD_END = new Set('của và với cho để là thì mà nhờ còn những các một đã đang sẽ vẫn rất không chưa được bị khi nếu vì nên nhưng hay hoặc từ ở trong trên dưới về như theo bằng tại qua sau trước giữa cả mỗi từng nhiều ít hơn nhất quá cũng đều chỉ có phải sự việc cái con người này kia đó gần hết'.split(' '));
  const BAD_START = new Set('ra lên xuống vào được nữa rồi thôi nhé đâu lại này kia đó ấy nào hơn nhất lắm quá'.split(' '));
  const GOOD_START = new Set('và nhưng còn khi vì để nên mà thì nếu hay hoặc chứ bởi rồi sau trước cho'.split(' '));
  const UNIT = /^(triệu|tỷ|nghìn|ngàn|trăm|%|usd|đồng|năm|tháng|ngày|giờ|tiếng|phút|giây|lần|người|mét|km|cm|kg)[.,?!]*$/i;
  const MAXC = 38;
  const bare = w => w.toLowerCase().replace(/[.,?!:;"“”()]/g, '');
  function splitClause(ix) {
    const L = ix.reduce((a, i) => a + WORDS[i].w.length + 1, 0);
    if (L <= MAXC || ix.length < 4) return [ix];
    let best = null, bc = 1e9;
    for (let k = 1; k < ix.length - 1; k++) {
      const left = ix.slice(0, k + 1), right = ix.slice(k + 1);
      const ll = left.reduce((a, i) => a + WORDS[i].w.length + 1, 0), rl = L - ll;
      const lw = bare(WORDS[left[left.length - 1]].w), rw = bare(WORDS[right[0]].w);
      let c = Math.abs(ll - rl);
      if (BAD_END.has(lw)) c += 40;
      if (BAD_START.has(rw)) c += 30;
      if (GOOD_START.has(rw)) c -= 14;
      if (/^\d/.test(lw) && UNIT.test(rw)) c += 60;
      if (ll < 10 || rl < 10) c += 35;
      if (c < bc) { bc = c; best = k; }
    }
    return [...splitClause(ix.slice(0, best + 1)), ...splitClause(ix.slice(best + 1))];
  }
  function buildWords() {
    const raw = [];
    if (SB.words && SB.words.length) { const man = SB.words.some(w => w.w === '|'); SB.words.forEach(w => raw.push({ w: w.w, t: w.t, m: man })); }
    else SC.forEach(o => {
      const ws = (o.s.sub || '').replace(/\s*\|\s*/g, ' | ').split(/\s+/).filter(Boolean); if (!ws.length) return;
      const real = ws.filter(w => w !== '|');
      const a = o.start + .3, b = o.start + o.dur - .35, tot = real.reduce((x, w) => x + w.length + 2, 0); let c = a;
      const manual = ws.includes('|');
      ws.forEach(w => { if (w === '|') { raw.push({ w, t: c }); return; } raw.push({ w, t: c, m: manual }); c += (w.length + 2) / tot * (b - a); });
    });
    // tách cụm thô theo | / dấu câu / ranh giới cảnh
    const sceneOf = t => SC.findIndex(o => t >= o.start && t < o.start + o.dur);
    const clauses = []; let cur = [], inK = false;
    raw.forEach(r => {
      if (r.w === '|') { if (cur.length) clauses.push(cur); cur = []; return; }
      // *cụm nhiều từ*: mọi từ nằm giữa 2 dấu * đều là từ nhấn (không chỉ từ mang dấu *)
      const st = (r.w.match(/\*/g) || []).length, k = inK || st > 0; if (st % 2) inK = !inK;
      // phụ đề không để dấu chấm cuối câu (giữ "…", "?" và "!" vì chúng mang nghĩa)
      const i = WORDS.length; WORDS.push({ w: r.w.replace(/\*/g, '').replace(/(^|[^.])\.$/, '$1'), t: r.t, k, m: r.m });
      if (cur.length && sceneOf(r.t) !== sceneOf(WORDS[cur[0]].t)) { clauses.push(cur); cur = []; }
      cur.push(i);
      const len = cur.reduce((a, j) => a + WORDS[j].w.length + 1, 0);
      if (!r.m && (/[.?!:;…]$/.test(r.w) || (/,$/.test(r.w) && len >= 14))) { clauses.push(cur); cur = []; }
    });
    if (cur.length) clauses.push(cur);
    // gộp mệnh đề quá ngắn (<12 ký tự) vào mệnh đề kế nếu cùng cảnh và vẫn vừa khung
    const merged = [];
    clauses.forEach(c => {
      const prev = merged[merged.length - 1], ln = x => x.reduce((a, j) => a + WORDS[j].w.length + 1, 0);
      if (prev && !WORDS[prev[0]].m && ln(prev) < 12 && ln(prev) + ln(c) <= MAXC && sceneOf(WORDS[prev[0]].t) === sceneOf(WORDS[c[0]].t)) prev.push(...c);
      else merged.push([...c]);
    });
    const NW = +SB.subWords || 0;   // phụ đề kiểu CapCut: mỗi lần hiện tối đa NW từ, chia đều
    merged.forEach(c => (WORDS[c[0]].m ? [c] : splitClause(c)).forEach(x => {
      if (!NW || x.length <= NW) { CHUNKS.push(x); return; }
      const parts = Math.ceil(x.length / NW), sz = Math.ceil(x.length / parts);
      for (let i = 0; i < x.length; i += sz) CHUNKS.push(x.slice(i, i + sz));
    }));
    WORDS.forEach((w, i) => { w.c = CHUNKS.findIndex(c => c.includes(i)); });
  }

  function buildEvents() {
    const ev = [{ t: 0, k: 'impact' }];
    SC.forEach((o, i) => {
      if (i > 0) { const tr = o.s.trans || SB.trans || THEME_TR[SB.theme]; ev.push({ t: o.start - TD / 2 + .05, k: TR_SFX[tr] || 'whoosh' }); }
      o.items.forEach(x => {
        const t = o.start + x._in, a = x.dataset.a;
        if (x.dataset.sfx) ev.push({ t, k: x.dataset.sfx });
        else if (a === 'pop' && !x.closest('svg')) ev.push({ t, k: 'pop' });
        else if (a === 'title') ev.push({ t, k: SB.theme === 'tech' ? 'glitch_s' : 'swish' });
      });
      o.el.querySelectorAll('.cnt').forEach(c => { const t = o.start + +c.dataset.t; ev.push({ t, k: 'roll', d: +c.dataset.dur }); ev.push({ t: t + +c.dataset.dur, k: 'impact' }); });
      o.el.querySelectorAll('[data-a2=type]').forEach(c => ev.push({ t: o.start + +c.dataset.t, k: 'type', d: +c.dataset.dur }));
      o.el.querySelectorAll('mark').forEach(c => ev.push({ t: o.start + +c.dataset.t, k: 'swish' }));
    });
    if (SB.sticker) ev.push({ t: SB.sticker.t0, k: 'pop' });
    // biên tập nhạc theo nhịp: riser dồn lên trước cú bẻ hướng + nhạc khựng lặng đúng lúc bẻ (mstop) rồi trở lại;
    // phần thưởng nhỏ có tiếng bass nện vào đúng chữ đắt
    SC.forEach((o, i) => {
      const b = o.s.beat, at = (o.s.fx && o.s.fx.at != null) ? +o.s.fx.at : .25;
      if (b === 'turn' && i > 0) { ev.push({ t: Math.max(0, o.start - 1.5), k: 'riser', d: 1.5 }); ev.push({ t: o.start - .25, k: 'mstop', d: .9 }); }
      if (b === 'reward') ev.push({ t: o.start + at, k: 'bass' });
    });
    if (SC.length > 2) ev.push({ t: Math.max(0, SC[SC.length - 1].start - .2), k: 'mswell', d: SC[SC.length - 1].dur });
    ev.sort((a, b) => a.t - b.t);
    EVENTS = ev.filter((e, i) => i === 0 || e.t - ev[i - 1].t > .1 || e.k !== ev[i - 1].k);
  }

  /* ---------- Animator ---------- */
  function anim(x, lt, T) {
    const p = clamp((lt - x._in) / x._d), e = E.out3(p), a = x.dataset.a, b = x._base;
    if (x._op === undefined) x._op = parseFloat(x.getAttribute('opacity') || 1);
    if (a !== 'draw') x.style.opacity = p > 0 ? Math.min(1, p * 2.5) * x._op : 0;
    switch (a) {
      case 'pop': x.style.transform = `${b} scale(${.5 + .5 * E.back(p)})`; break;
      case 'up': x.style.transform = `${b} translateY(${(1 - e) * 50}px)`; break;
      case 'left': x.style.transform = `${b} translateX(${-(1 - e) * 90}px)`; break;
      case 'right': x.style.transform = `${b} translateX(${(1 - e) * 90}px)`; break;
      case 'grow': x.style.transform = `${b} scaleX(${e})`; break;
      case 'growY': x.style.transformOrigin = x.closest('svg') ? 'bottom' : 'top'; x.style.transformBox = 'fill-box'; x.style.transform = `${b} scaleY(${E.out5(p)})`; break;
      case 'draw': x.style.opacity = p > 0 ? 1 : 0; x.style.strokeDasharray = 1; x.style.strokeDashoffset = 1 - E.io(p); break;
      case 'title': {
        const th = SB.theme;
        if (th === 'tech') { // glitch vào
          const f = Math.floor(T * 30), k = p < 1 ? (1 - p) : 0;
          x.style.transform = `${b} translateX(${(rnd(f) - .5) * 26 * k}px)`;
          x.style.textShadow = k ? `${-6 * k}px 0 #ff2bd6, ${6 * k}px 0 #22e1ff` : 'none';
          x.style.opacity = p > 0 ? (rnd(f + 1) < .25 * k ? .2 : 1) : 0;
        } else if (th === 'finance') { x.style.transform = `${b} translateY(${(1 - e) * 24}px)`; x.style.filter = `blur(${(1 - e) * 8}px)`; x.style.letterSpacing = `${(1 - e) * 6 - .5}px`; }
        else if (th === 'tips') x.style.transform = `${b} scale(${.4 + .6 * E.elastic(p)}) rotate(${(1 - e) * -4}deg)`;
        else x.style.transform = `${b} translateY(${(1 - e) * 46}px)`;
        break;
      }
    }
    if (x.closest('svg') && ['pop', 'growY'].includes(a)) { x.style.transformBox = 'fill-box'; if (a === 'pop') x.style.transformOrigin = 'center'; }
  }

  function updateScene(o, lt, T) {
    const pr = clamp(lt / o.dur);
    o.cam.style.transform = (CAM[o.camKind] || CAM.still)(pr) + punch(o, lt);
    o.items.forEach(x => anim(x, lt, T));
    // Ken Burns về tiêu điểm + rack focus
    o.el.querySelectorAll('.kb').forEach(k => {
      const f = o.focus || { x: .5, y: .45 };
      k.style.transformOrigin = `${f.x * 100}% ${f.y * 100}%`;
      k.style.transform = `scale(${1.02 + .12 * E.io(pr)})`;
      if (!k.classList.contains('fb')) k.style.filter = `blur(${Math.max(0, 7 * (1 - lt / .7))}px)`;
    });
    o.el.querySelectorAll('[data-lb]').forEach(l => l.style.height = 70 * E.out3(clamp(lt / .6)) + 'px');
    o.el.querySelectorAll('.pulse').forEach(c => { const q = ((lt - +c.dataset.t) % 1.2) / 1.2; c.setAttribute('r', lt < +c.dataset.t ? 0 : 13 + 30 * q); c.style.opacity = lt < +c.dataset.t ? 0 : 1 - q; });
    o.el.querySelectorAll('.cnt').forEach(c => {
      const q = E.out5(clamp((lt - +c.dataset.t) / +c.dataset.dur)), v = +c.dataset.from + (+c.dataset.to - +c.dataset.from) * q;
      c.textContent = v.toLocaleString('vi-VN', { minimumFractionDigits: +c.dataset.dec, maximumFractionDigits: +c.dataset.dec });
    });
    o.el.querySelectorAll('.burst').forEach(bu => bu.style.transform = `rotate(${lt * 8}deg) scale(${.9 + .1 * Math.sin(lt * 2)})`);
    o.el.querySelectorAll('.qmark').forEach(q => q.style.transform = `rotate(${Math.sin(lt * .8) * 6}deg) scale(${1 + .03 * Math.sin(lt * 1.6)})`);
    o.el.querySelectorAll('[data-a2=type]').forEach(x => {
      const q = clamp((lt - +x.dataset.t) / +x.dataset.dur), txt = x._html.replace(/<[^>]+>/g, ''), n = Math.floor(txt.length * q);
      // giữ thẻ <mark>: cắt theo số ký tự hiển thị
      let out = '', c = 0; x._html.split(/(<[^>]+>)/).forEach(seg => { if (seg.startsWith('<')) out += seg; else { const take = Math.max(0, Math.min(seg.length, n - c)); out += seg.slice(0, take); c += seg.length; } });
      x.innerHTML = out + (q < 1 && Math.floor(T * 4) % 2 ? '<span style="opacity:.6">|</span>' : '');
    });
    o.el.querySelectorAll('mark').forEach(m => m.style.backgroundSize = `${E.io(clamp((lt - +m.dataset.t) / .6)) * 100}% 100%`);
    o.el.querySelectorAll('.vign').forEach(v => v.style.opacity = lt > .8 ? .45 + .4 * Math.sin(lt * 4) : 0);
    EXT.update.forEach(f => f(o, lt, T));
    o.el.querySelectorAll('.ctab').forEach(c => { if (lt > 1.8) c.style.transform = `translateX(-50%) scale(${1 + .04 * Math.sin(lt * 6)})`; });
  }
  // cú "punch" camera nhỏ khi có điểm nhấn (đếm số xong)
  function punch(o, lt) {
    let s = 0; o.el.querySelectorAll('.cnt').forEach(c => { const t = +c.dataset.t + +c.dataset.dur, d = lt - t; if (d > 0 && d < .35) s = Math.max(s, Math.sin(d / .35 * Math.PI) * .05); });
    if (o === SC[0] && lt < .3) s = Math.max(s, (1 - lt / .3) * .08);
    return s ? ` scale(${1 + s})` : '';
  }

  function setTime(T) {
    const fx = document.getElementById('fx'); fx.innerHTML = '';
    let cur = SC.findIndex(o => T >= o.start && T < o.start + o.dur); if (cur < 0) cur = SC.length - 1;
    SC.forEach(o => { o.el.style.visibility = 'hidden'; o.el.style.transform = o.el.style.filter = o.el.style.clipPath = ''; o.el.style.opacity = 1; o.el.style.zIndex = 1; });
    // tìm chuyển cảnh đang diễn ra
    let tr = null;
    for (let i = 1; i < SC.length; i++) { const b = SC[i].start; if (Math.abs(T - b) < TD / 2) tr = { A: SC[i - 1], B: SC[i], p: (T - b + TD / 2) / TD, kind: SC[i].s.trans || SB.trans || THEME_TR[SB.theme] }; }
    if (tr) {
      updateScene(tr.A, T - tr.A.start, T); updateScene(tr.B, Math.max(0, T - tr.B.start), T);
      TR[tr.kind](tr.A.el, tr.B.el, tr.p, fx, T);
    } else { SC[cur].el.style.visibility = 'visible'; updateScene(SC[cur], T - SC[cur].start, T); }
    // flash mở màn (pattern interrupt)
    // chớp trắng mở đầu: TẮT mặc định (khung 0 là ảnh bìa hook — cover.py); bật lại bằng storyboard.introFlash
    if (T < .25 && SB.introFlash) fx.innerHTML += `<div style="position:absolute;inset:0;background:#fff;opacity:${1 - T / .25}"></div>`;
    // tone cho lớp phủ chung theo cảnh hiện tại
    const tone = SC[tr ? (tr.p < .5 ? SC.indexOf(tr.A) : SC.indexOf(tr.B)) : cur].el.dataset.tone;
    ['sub', 'prog', 'sticker'].forEach(id => document.getElementById(id).dataset.tone = tone);
    document.getElementById('sub').dataset.bg = SC[tr ? (tr.p < .5 ? SC.indexOf(tr.A) : SC.indexOf(tr.B)) : cur].s.subTone || 'dark';
    // phụ đề karaoke
    const sub = document.getElementById('sub');
    let wi = -1; for (let i = 0; i < WORDS.length; i++) if (WORDS[i].t <= T) wi = i;
    if (wi < 0 || (tr && Math.abs(tr.p - .5) < .3)) { sub.style.opacity = 0; }
    else {
      const ch = CHUNKS[WORDS[wi].c]; sub.style.opacity = 1;
      const ws = SC[cur].start, pin = E.out3(clamp((T - Math.max(ws, WORDS[ch[0]].t)) / .2));
      sub.style.transform = `translateY(${(1 - pin) * 14}px)`;
      sub.innerHTML = ch.map(i => `<span class="${i === wi ? 'on' : ''} ${WORDS[i].k ? 'k' : ''}">${esc(WORDS[i].w)}</span>`).join(' ');
    }
    // thanh tiến trình
    const n = T / TOTAL * 12; [...document.getElementById('prog').children].forEach((d, i) => { d.className = i < Math.floor(n) ? 'f' : ''; d.style.background = i === Math.floor(n) ? `linear-gradient(90deg,var(--hl) ${(n % 1) * 100}%,rgba(127,127,127,.3) 0)` : ''; });
    // sticker giữ chân giữa video
    const st = document.getElementById('sticker');
    if (SB.sticker && T >= SB.sticker.t0 && T < SB.sticker.t1) {
      const q = clamp((T - SB.sticker.t0) / .5); st.style.visibility = 'visible'; st.textContent = SB.sticker.text;
      st.style.transform = `rotate(${3 + Math.sin(T * 7) * 2}deg) scale(${.5 + .5 * E.back(q)})`;
    } else st.style.visibility = 'hidden';
    // khung video: chọn khung theo thời gian cảnh (clip ngắn hơn cảnh → chạy chậm tới 0,5x rồi giữ khung cuối)
    const pend = [];
    document.querySelectorAll('img.vf').forEach(v => {
      if (v.dataset.t0 === undefined) return;
      const t0 = +v.dataset.t0, d = +v.dataset.d; if (T < t0 - .6 || T > t0 + d + .6) return;
      const n = +v.dataset.n, fps = +v.dataset.fps, rate = Math.max(.5, Math.min(1, n / fps / Math.max(d, .1)));
      // tốc độ theo đạo diễn: slow (chậm 0,5x), fast (nhanh 1,6x), ramp (nhanh rồi chậm), freeze (dừng hình từ mốc)
      const lt = T - t0, sp = v.dataset.speed, fat = +v.dataset.fat || d / 2;
      const tt = sp === 'slow' ? lt * .5 : sp === 'fast' ? lt * 1.6 : sp === 'ramp' ? (lt < fat ? lt * 1.8 : fat * 1.8 + (lt - fat) * .4) : sp === 'freeze' ? Math.min(lt, fat) : lt * rate;
      const k = Math.max(0, Math.min(n - 1, Math.floor(tt * fps)));
      const u = `${v.dataset.dir}/f${String(k + 1).padStart(4, '0')}.jpg`;
      if (v._u !== u) { v._u = u; v.src = u; pend.push(v.decode().catch(() => {})); }
    });
    return pend.length ? Promise.all(pend) : undefined;
  }

  window.HBX_UTIL = { E, clamp, rnd, esc, rich, photo, credit };
  window.HBX = { build, setTime, get TOTAL() { return TOTAL; }, get EVENTS() { return EVENTS; }, get WORDS() { return WORDS; }, get _sb() { return SB; }, get _SC() { return SC; }, SCENE_TYPES: Object.keys(S) };
})();
