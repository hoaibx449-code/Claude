/* FORMAT SÂN KHẤU GIẤY RISO — sticker người thật in chấm 2 màu đặt trong không gian 3D,
   chữ khối đứng trên sàn (mặt mực đen, thành khối màu chủ đạo), con dấu, ghi chú giấy xé, chuyển cảnh xé giấy. */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const pad = n => String(n).padStart(2, '0');
  const shade = (hex, k) => { const h = hex.replace('#', ''); const c = [0, 2, 4].map(i => Math.round(parseInt(h.substr(i, 2), 16) * k)); return `rgb(${c})`; };

  function extrude(face, side, depth) {
    const sh = []; for (let i = 1; i <= depth; i++) sh.push(`${i * .55}px ${i}px 0 ${side}`);
    sh.push(`${depth * .55 + 6}px ${depth + 14}px 18px rgba(0,0,0,.28)`);
    return `color:${face};text-shadow:${sh.join(',')}`;
  }

  X.scenes.p_stage = (s, c) => {
    const { esc, rich } = U(), sb = c.sb, spot = sb.spot || '#e8432e';
    document.body.style.setProperty('--spot', spot);
    const items = (s.items || []).map((it, k) => {
      const at = it.at ?? .3 + k * .6, x = it.x || 0, y = it.y || 0, z = it.z || 0;
      let inner = '', sfx = 'swish';
      if (it.kind === 'cut' || it.kind === 'plate') {
        const h = it.h || 520;
        inner = `<div class="bb" style="height:${h}px;left:0;translate:-50% 0"><img src="${it.image && it.image.src || ''}" style="height:${h}px">
          ${it.tape ? `<div class="ptape" style="left:${it.tapeX ?? 30}%;top:-12px;rotate:${-8 + (k % 3) * 7}deg"></div>` : ''}
          ${it.kind === 'cut' ? `<div class="pshadow" style="width:${h * .55}px"></div>` : ''}</div>`;
      } else if (it.kind === 'word') {
        const face = it.color === 'spot' ? spot : it.color === 'paper' ? '#f6efe0' : '#1a1816';
        const side = it.color === 'spot' ? shade(spot, .55) : it.color === 'paper' ? '#a99d86' : spot;
        inner = `<div class="bb pword" style="font-size:${it.size || 120}px;${extrude(face, side, it.depth || 14)};left:0;translate:-50% 0">${rich(it.text)}</div>`;
        sfx = 'impact';
      } else if (it.kind === 'stamp') {
        inner = `<div class="bb pstamp" style="font-size:${it.size || 70}px;left:0;translate:-50% 0">${esc(it.text)}</div>`;
        sfx = 'impact';
      } else if (it.kind === 'note') {
        inner = `<div class="bb pnote" style="width:${it.w || 520}px;left:0;translate:-50% 0;font-size:${it.size || 40}px">${rich(it.text)}</div>`;
        sfx = 'swish';
      }
      return `<div class="pit" data-k="${it.kind}" data-enter="${it.enter || ({ cut: 'slap', plate: 'slide', word: 'rise', stamp: 'stamp', note: 'drop' })[it.kind]}"
        data-x="${x}" data-y="${y}" data-z="${z}" data-rot="${it.rot || 0}" data-at="${at}" data-in="${at}" data-a="none" data-sfx="${sfx}">${inner}</div>`;
    }).join('');
    const cam = s.cam || {};
    return {
      cam: 'still', html: `
      <div class="pmeta"><span><b>N° ${pad(c.i + 1)}</b> — ${esc(s.label || '')}</span><span>${esc(sb.series || '')}</span></div>
      <div class="reg" style="left:16px;top:16px"><i></i></div><div class="reg" style="right:16px;top:16px"><i></i></div>
      <div class="reg" style="left:16px;top:1160px"><i></i></div><div class="reg" style="right:16px;top:1160px"><i></i></div>
      <div class="pworld"><div class="pcam" data-from="${(cam.from || [0, 0, -60, -5]).join(',')}" data-to="${(cam.to || [0, 0, 110, 4]).join(',')}">
        <div class="pwall"></div><div class="pfloor"></div>${items}
      </div></div>`
    };
  };

  // chữ khối không rộng quá 560px (để khi máy quay tiến vào vẫn nằm trong khung)
  const prevFit = X.fit;
  X.fit = root => { if (prevFit) prevFit(root);
    root.querySelectorAll('.pword').forEach(w => { const f = parseFloat(w.style.fontSize), sw = w.scrollWidth; if (sw > 560) w.style.fontSize = Math.floor(f * 560 / sw) + 'px'; }); };

  X.update.push((o, lt, T) => {
    if (o.s.type !== 'p_stage') return;
    const { E, clamp, rnd } = U();
    const camEl = o.el.querySelector('.pcam'), A = camEl.dataset.from.split(',').map(Number), B = camEl.dataset.to.split(',').map(Number);
    const q = E.io(clamp(lt / o.dur)), v = A.map((a, i) => a + (B[i] - a) * q);
    // rung máy khi con dấu / chữ khối đập xuống
    let shake = 0;
    o.el.querySelectorAll('.pit').forEach(p => { const d = lt - +p.dataset.at; if ((p.dataset.enter === 'stamp' || p.dataset.enter === 'rise') && d > .12 && d < .45) shake = Math.max(shake, (1 - (d - .12) / .33) * 9); });
    const f = Math.floor(T * 30), sx = (rnd(f) - .5) * shake, sy = (rnd(f + 7) - .5) * shake;
    camEl.style.transform = `translate3d(${-v[0] + sx}px, ${v[1] + sy}px, ${v[2]}px) rotateY(${v[3]}deg)`;
    o.el.querySelectorAll('.pit').forEach((p, k) => {
      const d = lt - +p.dataset.at, pr = clamp(d / .5), e = E.out3(pr), bk = E.back(pr), rot = +p.dataset.rot;
      const base = `translate3d(${p.dataset.x}px, ${-p.dataset.y}px, ${p.dataset.z}px)`;
      const bb = p.querySelector('.bb'); let t = '', op = pr > 0 ? 1 : 0;
      switch (p.dataset.enter) {
        case 'slap': t = `translateY(${(1 - e) * -90}px) rotate(${rot + (1 - e) * 9 + Math.sin(lt * 1.3 + k) * .6}deg) scale(${1.25 - .25 * bk})`; break;
        case 'slide': t = `translateX(${(1 - e) * (k % 2 ? 520 : -520)}px) rotate(${rot + (1 - e) * -6}deg)`; break;
        case 'rise': t = `scaleY(${Math.max(.001, bk)}) rotate(${rot}deg)`; break;
        case 'stamp': { const s2 = clamp(d / .18); t = `rotate(${rot}deg) scale(${2.4 - 1.4 * E.out3(s2)})`; op = s2; break; }
        case 'drop': t = `translateY(${(1 - bk) * -160}px) rotate(${rot + (1 - e) * -5}deg)`; break;
      }
      p.style.transform = base; p.style.opacity = op; bb.style.transform = t;
    });
  });

  // chuyển cảnh XÉ GIẤY: cảnh mới lộ ra sau đường xé răng cưa quét ngang
  X.trans.tear = (A, B, p, fx, T) => {
    const { E } = U(), e = E.io(p);
    A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2;
    const base = 800 - e * 1000, pts = [], edge = [];
    for (let y = -20; y <= 1300; y += 34) {
      const x = base + Math.sin(y * .021) * 34 + Math.sin(y * .113 + 2) * 12 + ((y * 7919) % 13 - 6) * 1.6 + (y - 640) * .18;
      pts.push(`${x}px ${y}px`); edge.push([x, y]);
    }
    B.style.clipPath = `polygon(${pts.join(',')}, 800px 1300px, 800px -20px)`;
    A.style.transform = `translateX(${-e * 40}px) rotate(${-e * 1.2}deg)`;
    const d = edge.map(([x, y], i) => `${i ? 'L' : 'M'}${x - 6} ${y}`).join(' ');
    fx.innerHTML = `<svg width="720" height="1280" style="position:absolute;inset:0;overflow:visible"><path d="${d}" stroke="rgba(0,0,0,.25)" stroke-width="22" fill="none" transform="translate(-6 6)"/><path d="${d}" stroke="#f6efe0" stroke-width="16" fill="none" stroke-linejoin="round"/></svg>`;
  };
  X.themeTrans.paper = 'tear';
  X.trSfx.tear = 'whoosh';
})();
