/* FORMAT BENTO EDITORIAL — nền giấy kem, 1 màu nhấn đỏ đất, các ô bento bật ra theo lời đọc.
   Bố cục chảy theo cột (flex); chữ trong ô tự co theo kích thước ô, không bẻ từ, tối đa 2 dòng. */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const pad = n => String(n).padStart(2, '0');

  X.scenes.b_grid = (s, c) => {
    const { esc } = U(), sb = c.sb, n = s.chapter || c.i + 1, of = sb.chapters || c.n;
    let t = s.tilesAt || .7;
    const tiles = (s.tiles || []).map((x, k) => {
      const at = x.at ?? t; t = at + (s.tileGap || 1.1);
      const hotNow = x.hot && x.hotAt == null;
      return `<div class="tile ${hotNow ? 'hot' : ''}" style="grid-column:span ${x.w || 3};grid-row:span ${x.h || 1}" data-at="${at}" data-hot="${x.hotAt ?? ''}" data-in="${at}" data-a="tile" data-sfx="tick">
        <div class="hotfill" ${hotNow ? 'style="transform:scaleX(1)"' : ''}></div>
        <div class="tin"><div class="trow"><div class="n">${pad(x.n ?? k + 1)}</div>${x.icon ? `<div class="ic">${x.icon}</div>` : ''}</div>
        <div class="tb"><div class="t ${x.big ? 'tbig' : ''}" data-w="${x.w || 3}" data-h="${x.h || 1}">${esc(x.title)}</div>${x.desc ? `<div class="d">${esc(x.desc)}</div>` : ''}</div></div></div>`;
    }).join('');
    const head = esc(s.head).replace(/\n/g, '<br>');
    return {
      cam: 'still', html: `
      <div class="btop"><span><b>●</b>${esc(sb.series || '')}</span><span>${pad(n)} / ${pad(of)}</span></div>
      <div class="bcontent">
        <div class="bsec" data-in=".05" data-a="left">${pad(n)} — ${esc(s.sec || '')}</div>
        <div class="bhead ${s.headStyle || (c.i % 2 ? 'serif' : 'cond')}" data-a2="bhead">${head}</div>
        <div class="bgrid">${tiles}</div>
        ${s.note ? `<div class="bnote" data-in="${s.noteAt || t}" data-a="left">${esc(s.note)}</div>` : ''}
      </div>
      <div class="bfoot"><span>${esc(sb.footer || '')}</span><span>${esc(sb.footRight || 'MÔ HÌNH MINH HỌA')}</span></div>`
    };
  };

  /* Co chữ trong ô: bắt đầu từ cỡ theo kích thước ô, giảm tới khi
     (a) không từ nào tràn ngang, (b) ≤ 2 dòng, (c) cả khối chữ nằm gọn dưới hàng số/icon. */
  function fitTiles(root) {
    root.querySelectorAll('.tile .t').forEach(el => {
      const w = +el.dataset.w, h = +el.dataset.h, big = el.classList.contains('tbig');
      let f = big ? Math.min(64, 22 + w * 5 + h * 6) : Math.min(40, 18 + w * 2.6 + h * 3);
      const tin = el.closest('.tin'), row = tin.querySelector('.trow'), tb = el.parentNode;
      const ok = () => {
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        const avail = tin.clientHeight - row.offsetHeight - 34;
        return el.scrollWidth <= el.clientWidth + 1 && el.offsetHeight <= lh * 2 + 2 && tb.offsetHeight <= avail;
      };
      el.style.fontSize = f + 'px';
      while (f > 16 && !ok()) { f -= 1; el.style.fontSize = f + 'px'; }
    });
  }
  // giãn chiều cao hàng để lưới lấp đầy khoảng giữa tiêu đề và phụ đề
  function fillGrid(root) {
    root.querySelectorAll('.bcontent').forEach(bc => {
      const g = bc.querySelector('.bgrid'); if (!g || !g.children.length) return;
      const rows = Math.round((g.offsetHeight + 12) / (132 + 12));
      const note = bc.querySelector('.bnote'), used = g.offsetTop + (note ? note.offsetHeight + 20 : 0);
      const rh = Math.max(120, Math.min(178, (bc.clientHeight - used - 12 * (rows - 1)) / rows));
      g.style.gridAutoRows = rh + 'px';
    });
  }
  const prevFit = X.fit;
  X.fit = root => { if (prevFit) prevFit(root); fillGrid(root); fitTiles(root); };

  X.update.push((o, lt) => {
    if (o.s.type !== 'b_grid') return;
    const { E, clamp } = U();
    o.el.querySelectorAll('.btop,.bfoot').forEach(x => x.style.opacity = 1);
    const bc = o.el.querySelector('.bcontent'); bc.style.transform = ''; bc.style.opacity = 1;
    o.el.querySelectorAll('.tile').forEach(tl => {
      const p = clamp((lt - +tl.dataset.at) / .45), e = E.out3(p);
      tl.style.opacity = p > 0 ? Math.min(1, p * 2) : 0;
      tl.style.transform = `translateY(${(1 - e) * 18}px) scale(${.94 + .06 * e})`;
      const h = tl.dataset.hot;
      if (h !== '') {
        const q = E.io(clamp((lt - +h) / .5));
        tl.querySelector('.hotfill').style.transform = `scaleX(${q})`; tl.classList.toggle('hot', q > .45);
      }
    });
    // tiêu đề hiện như được viết ra từ trái sang phải
    o.el.querySelectorAll('[data-a2=bhead]').forEach(hd => {
      const p = clamp((lt - .15) / .7); hd.style.clipPath = `inset(-20% ${(1 - E.out3(p)) * 100}% -20% 0)`;
    });
  });

  // chuyển chương: nội dung trượt lên & mờ, khung trên/dưới đứng yên
  X.trans.bento = (A, B, p, fx) => {
    const { E } = U(), e = E.io(p);
    A.style.visibility = B.style.visibility = 'visible'; B.style.zIndex = 2;
    const a = A.querySelector('.bcontent'), b = B.querySelector('.bcontent');
    if (a) { a.style.transform = `translateY(${-e * 70}px)`; a.style.opacity = 1 - Math.min(1, e * 1.6); }
    if (b) { b.style.transform = `translateY(${(1 - e) * 70}px)`; b.style.opacity = Math.max(0, e * 1.6 - .6); }
    A.querySelectorAll('.btop,.bfoot').forEach(x => x.style.opacity = 0);
    fx.innerHTML = '';
  };
  X.themeTrans.bento = 'bento';
  X.trSfx.bento = 'swish';
})();
