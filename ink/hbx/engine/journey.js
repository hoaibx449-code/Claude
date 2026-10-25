/* FORMAT HÀNH TRÌNH (journey) — "mắt người xem được dẫn đi": một thế giới 3D liền mạch,
   mỗi cảnh là một TRẠM đặt dọc con đường; máy quay trôi tới từng trạm (dolly-in), rồi bay sang trạm kế
   (chuyển cảnh = chuyển động máy quay, không cắt). Ảnh thật dựng thành bảng lớn trong không gian, chữ khối 3D,
   số đếm, thẻ ý bật theo cue, và CHỮ NHẤN (*từ*) hiện ra trong không gian đúng lúc giọng đọc tới. */
(function () {
  const X = window.HBX_EXT = window.HBX_EXT || { scenes: {}, trans: {}, themeTrans: {}, trSfx: {}, update: [], fit: null };
  const U = () => window.HBX_UTIL;
  const ST = [];                     // trạm: {s, i, start, dur, pose, el}
  let EMPH = [], LAMPS = null, WORLD = null, CAMEL = null, READY = false;
  const PERSP = 1100, D_FAR = 1300, D_NEAR = 860, GAP = 2300;
  /* Phong cách theo chủ đề (body[data-mood], đặt từ sb.mood): độ dày chữ khối + kiểu chữ tiêu đề xuất hiện.
     tech=glitch số · finance=hiện mờ→nét chậm · alert=đóng dấu + rung · bright=bật nảy · calm=nổi lên nhẹ */
  const MOOD = () => document.body.dataset.mood || '';
  const DEPTH = () => ({ finance: 5, calm: 5, alert: 9 })[MOOD()] ?? 12;
  const TITLE_DUR = { finance: 1.0, calm: 1.1, alert: .35, tech: .7, bright: .6 };
  function titleIn(p, E, T) {
    const e = E.out3(p), m = MOOD();
    if (m === 'tech') {            // glitch: giật ngang theo nấc, lệch nghiêng rồi khựng lại đúng chỗ
      const g = p < 1 ? Math.sign(Math.sin(T * 97)) * (1 - e) * 46 : 0;
      return { t: ` translateX(${g.toFixed(1)}px) skewX(${((1 - e) * -14).toFixed(1)}deg) translateY(${(1 - e) * 60}px)`, o: p > 0 ? (p < .5 ? (Math.floor(T * 30) % 2 ? .35 : 1) : 1) : 0 };
    }
    if (m === 'finance') return { t: ` translateY(${(1 - e) * 70}px)`, o: e, f: `blur(${((1 - e) * 14).toFixed(1)}px)` };
    if (m === 'alert') {           // đóng dấu: rơi từ to xuống, rung tắt dần sau khi chạm
      return { t: ` scale(${(1.9 - .9 * p * p).toFixed(3)}) rotate(${(-6 + 6 * p).toFixed(2)}deg)`, o: Math.min(1, p * 3) };
    }
    if (m === 'bright') return { t: ` scale(${(.3 + .7 * E.back(p)).toFixed(3)}) rotate(${((1 - e) * -8).toFixed(2)}deg)`, o: Math.min(1, p * 2) };
    if (m === 'calm') return { t: ` translateY(${(1 - e) * 50}px)`, o: e };
    return { t: ` translateY(${(1 - e) * 120}px) rotateX(${(1 - e) * -40}deg)`, o: Math.min(1, p * 2) };
  }

  const extrude = (face, side, depth) => {
    const sh = []; for (let i = 1; i <= depth; i++) sh.push(`${i * .5}px ${i}px 0 ${side}`);
    sh.push(`0 ${depth + 18}px 30px rgba(0,0,0,.55)`);
    return `color:${face};text-shadow:${sh.join(',')}`;
  };

  /* ---- cảnh: trạm dừng ---- */
  X.scenes.j_stop = (s, c) => {
    const { esc } = U();
    ST[c.i] = { s, i: c.i, start: c.start, dur: s.dur };
    const tsfx = { alert: 'impact', tech: 'glitch' }[document.body.dataset.mood], hasT = Array.isArray(s.title) ? s.title.length : !!s.title;
    const marks = (tsfx && hasT ? `<i class="jm" data-in="${(s.titleAt ?? .25) + (tsfx === 'impact' ? .35 : 0)}" data-a="none" data-sfx="${tsfx}"></i>` : '') + (s.items || []).map((it, k) => `<i class="jm" data-in="${it.at ?? 1 + k * .8}" data-a="none" data-sfx="tick"></i>`).join('')
      + (s.value !== undefined ? `<i class="jm" data-in="${(s.numAt ?? .9) + 1.3}" data-a="none" data-sfx="impact"></i>` : '');
    return {
      cam: 'still', html: `
      <div class="jlabel" data-in=".35" data-a="left"><b>${String(c.i + 1).padStart(2, '0')}</b>${esc(s.label || '')}</div>${marks}`
    };
  };

  /* ---- dựng thế giới 1 lần, sau khi mọi cảnh đã build ---- */
  function poseOf(i) {
    const s = ST[i].s, side = i % 2 ? 1 : -1;
    const yaw = s.turn ?? (i === 0 ? 0 : side * 14);
    if (i === 0) return { x: 0, y: 0, z: 0, yaw };
    const p = ST[i - 1].pose;
    return { x: p.x + (s.dx ?? side * 560), y: 0, z: p.z - (s.gap ?? GAP), yaw };
  }
  function stationHTML(st) {
    const { esc, rich, photo, credit } = U(), s = st.s, side = s.side === 'right' ? 1 : s.side === 'left' ? -1 : (st.i % 2 ? 1 : -1);
    const title = Array.isArray(s.title) ? s.title : s.title ? [s.title] : [];
    let h = `<div class="jbill" style="transform:translate3d(-440px,-640px,0)">${photo(s.image, 'jph')}<div class="jshade"></div>${credit(s.image)}</div>`;
    h += `<div class="jbase" style="transform:translate3d(-470px,470px,0) rotateX(90deg)"></div>`;
    if (title.length) h += `<div class="jo jtitle" data-k="title" data-at="${s.titleAt ?? .25}" style="--x:${side * 70}px;--y:-500px;--z:420px">
        <div class="jt1" style="${extrude('#fff', 'var(--m-side2,#9aa3b8)', DEPTH())}">${rich(title[0])}</div>${title[1] ? `<div class="jt2" style="${extrude('var(--hl)', 'var(--m-side,#8a6a00)', DEPTH())}">${rich(title[1])}</div>` : ''}</div>`;
    if (s.value !== undefined) h += `<div class="jo jnum" data-k="num" data-at="${s.numAt ?? .9}" style="--x:${-side * 40}px;--y:-60px;--z:330px">
        <div class="jn" style="${extrude('var(--hl)', '#7a5c00', 16)}">${esc(s.prefix || '')}<span class="jcnt" data-to="${s.value}" data-dec="${s.decimals || 0}">0</span>${esc(s.suffix || '')}</div>
        ${s.caption ? `<div class="jcap">${rich(s.caption)}</div>` : ''}</div>`;
    (s.items || []).forEach((it, k) => {
      const t = typeof it === 'string' ? it : it.text, at = typeof it === 'string' ? 1 + k * .8 : (it.at ?? 1 + k * .8);
      const x = (k % 2 ? 1 : -1) * 150 + side * 40, y = -150 + k * 150, z = 250 + k * 70;
      h += `<div class="jo jitem" data-k="item" data-at="${at}" style="--x:${x}px;--y:${y}px;--z:${z}px"><i>${k + 1}</i><span>${rich(t)}</span></div>`;
    });
    if (s.note) h += `<div class="jo jnote" data-k="note" data-at="${s.noteAt ?? 1.2}" style="--x:${side * 120}px;--y:160px;--z:380px">${rich(s.note)}</div>`;
    return h;
  }

  const prevFit = X.fit;
  X.fit = root => {
    if (prevFit) prevFit(root);
    if (document.body.dataset.theme !== 'journey' || READY) return;
    READY = true;
    ST.forEach((st, i) => { st.pose = poseOf(i); });
    const n = ST.length, last = ST[n - 1].pose;
    WORLD = document.createElement('div'); WORLD.id = 'jworld';
    let h = `<div class="jsky"></div><div class="jcam">`;
    h += `<div class="jfloor" style="width:9000px;height:${-last.z + 9000}px;transform:translate3d(-4500px,560px,4000px) rotateX(90deg)"></div>`;
    ST.forEach(st => {
      const p = st.pose;
      h += `<div class="jst" data-i="${st.i}" style="transform:translate3d(${p.x}px,${p.y}px,${p.z}px) rotateY(${p.yaw}deg)">${stationHTML(st)}</div>`;
      // cột mốc ánh sáng dọc đường đi
      for (let k = 1; k <= 3 && st.i < n - 1; k++) {
        const q = ST[st.i + 1] && ST[st.i + 1].pose, f = k / 4;
        if (!q) break;
        const x = p.x + (q.x - p.x) * f, z = p.z + (q.z - p.z) * f;
        h += `<div class="jlamp" style="transform:translate3d(${x + 520}px,180px,${z}px)"></div><div class="jlamp" style="transform:translate3d(${x - 520}px,180px,${z}px)"></div>`;
      }
    });
    h += `</div><div class="jfog"></div><div class="jvig"></div>`;
    WORLD.innerHTML = h; root.insertBefore(WORLD, root.firstChild);
    CAMEL = WORLD.querySelector('.jcam');
    ST.forEach(st => { st.el = WORLD.querySelector(`.jst[data-i="${st.i}"]`); st.objs = [...st.el.querySelectorAll('.jo')];
      // video trên bảng: bắt đầu chạy sớm 1,5 s (lúc máy đang bay tới) và chạy hết thời gian dừng
      st.el.querySelectorAll('img.vf').forEach(v => { v.dataset.t0 = Math.max(0, st.start - 1.5); v.dataset.d = st.dur + 1.5; }); });
    // chữ nhấn: gom các từ *…* liên tiếp (cùng cụm phụ đề) thành 1 cụm, gán vào trạm theo thời điểm nói
    const W = (window.HBX && window.HBX.WORDS) || [];
    const groups = [];
    W.forEach((w, i) => {
      if (!w.k) return;
      const g = groups[groups.length - 1];
      if (g && g.last === i - 1 && W[g.last].c === w.c) { g.text += ' ' + w.w; g.last = i; }
      else groups.push({ text: w.w, t: w.t, last: i });
    });
    const perSt = {};
    const stOf = t => Math.max(0, ST.findIndex(st => t >= st.start && t < st.start + st.dur));
    for (let j = groups.length - 1; j >= 0; j--) { const s = ST[stOf(groups[j].t)].s; if (s.value !== undefined && /\d/.test(groups[j].text)) groups.splice(j, 1); }
    EMPH = groups.map(g => {
      const i = Math.max(0, ST.findIndex(st => g.t >= st.start && g.t < st.start + st.dur));
      const k = perSt[i] = (perSt[i] ?? -1) + 1, side = k % 2 ? 1 : -1;
      const el = document.createElement('div'); el.className = 'jemph';
      el.innerHTML = `<span class="jbar"></span><span class="jtx">${U().esc(g.text.replace(/[.,!?:;]+$/, ''))}</span>`;
      el.style.cssText = `--x:${side * 50}px;--y:${250 - (k % 2) * 30}px;--z:720px`;
      ST[i].el.appendChild(el);
      return { el, t: g.t, i };
    });
    EMPH.forEach((e, j) => { const nx = EMPH[j + 1], st = ST[e.i]; e.end = Math.min(e.t + 2.3, nx && nx.i === e.i ? nx.t - .08 : 1e9, st.start + st.dur - .2); });
    // âm thanh cho chữ nhấn
    const EV = window.HBX && window.HBX.EVENTS;
    if (EV) { EMPH.forEach(e => EV.push({ t: e.t, k: 'pop' })); EV.sort((a, b) => a.t - b.t); }
    EMPH.forEach(e => { const tx = e.el.querySelector('.jtx'), sw = tx.scrollWidth; if (sw > 600) tx.style.fontSize = Math.floor(76 * 600 / sw) + 'px'; });
    // chữ tiêu đề không rộng quá 760px
    WORLD.querySelectorAll('.jt1,.jt2').forEach(t => { const f = parseFloat(getComputedStyle(t).fontSize), sw = t.scrollWidth; if (sw > 760) t.style.fontSize = Math.floor(f * 760 / sw) + 'px'; });
  };

  /* ---- máy quay: vị trí theo thời gian tuyệt đối ---- */
  /* ---- NGÔN NGỮ MÁY QUAY ----
     Lúc dừng ở trạm (s.cam):  push  = đẩy máy vào chậm, mượt (slow push-in)
                               dolly = tiến thẳng đều theo trục (dolly-in / tracking forward), quãng dài hơn, tốc độ không đổi
                               zoom  = máy gần như đứng, thu phóng sâu vào không gian (đổi tiêu cự)
     Lúc rời trạm (s.move):    arc   = vòng qua mép bảng ảnh sang trạm kế (êm, mặc định)
                               track = tiến thẳng xuyên qua trạm sang trạm kế theo trục
                               fpv   = bay kiểu drone FPV: nhanh, nghiêng cánh, hạ thấp, xuyên qua không gian (cảnh rộng, nhịp nhanh)
     Không ghi → mặc định theo mood (chủ đề), xem CAM_DEF. */
  const CAM_DEF = { tech: ['dolly', 'fpv'], finance: ['push', 'arc'], alert: ['zoom', 'track'], bright: ['dolly', 'fpv'], calm: ['push', 'arc'] };
  const camOf = s => s.cam || (CAM_DEF[MOOD()] || ['push'])[0];
  const moveOf = s => s.move || (CAM_DEF[MOOD()] || [, 'arc'])[1];
  function camAt(T) {
    const { E, clamp } = U();
    const n = ST.length;
    let i = ST.findIndex(st => T >= st.start && T < st.start + st.dur); if (i < 0) i = T < 0 ? 0 : n - 1;
    const st = ST[i], lt = T - st.start, mv = moveOf(st.s), hold = camOf(st.s);
    const trv = i < n - 1 ? (mv === 'fpv' ? Math.min(1.0, st.dur * .25) : mv === 'track' ? Math.min(1.5, st.dur * .32) : Math.min(1.25, st.dur * .3)) : 0;
    const at = (p, D) => ({ x: p.x + Math.sin(p.yaw * Math.PI / 180) * D, y: -30, z: p.z + Math.cos(p.yaw * Math.PI / 180) * D, yaw: p.yaw });
    // khoảng cách đầu/cuối của từng kiểu dừng
    const HOLD = { push: [D_FAR, D_NEAR], dolly: [1650, 830], zoom: [1180, 1080] };
    const [h0, h1] = HOLD[hold] || HOLD.push;
    const next = i < n - 1 ? ST[i + 1] : null, nh = next ? (HOLD[camOf(next.s)] || HOLD.push)[0] : D_FAR;
    let c, moving = 0, zoom = 1, roll = 0, blurK = 2.2;
    const zEnd = hold === 'zoom' ? 1.3 : 1;
    if (lt < st.dur - trv) {
      const r = clamp(lt / Math.max(.5, st.dur - trv));
      const q = hold === 'dolly' ? r * (.15 + .85 * clamp(r * 6)) /* tốc độ đều, chỉ êm ở khởi đầu */ : E.io(r);
      c = at(st.pose, h0 + (h1 - h0) * q);
      if (hold === 'zoom') zoom = 1 + (zEnd - 1) * E.io(r);
      if (i === 0) { const q0 = E.out3(clamp(lt / 1.6)); c = at(st.pose, 2600 + (h0 - 2600) * q0 + (h1 - h0) * q); }
    } else {
      const p = clamp((lt - (st.dur - trv)) / trv), A = at(st.pose, h1), B = at(next.pose, nh);
      zoom = zEnd + (1 - zEnd) * E.io(clamp(p * 1.6));      // nhả tiêu cự khi bắt đầu bay
      if (mv === 'arc') {
        // né trạm hiện tại: dạt ngang trước (ra ngoài mép bảng ảnh), tiến sâu sau, rồi về giữa trạm mới
        const side = Math.sign(next.pose.x - st.pose.x) || 1, ex = E.out3(p), ez = p * p * (3 - 2 * p);
        c = { x: A.x + (B.x - A.x) * ex + side * 760 * Math.sin(Math.PI * Math.min(1, p * 1.15)), y: A.y - Math.sin(Math.PI * p) * 90,
              z: A.z + (B.z - A.z) * ez };
        // luôn nhìn về một điểm trượt từ trạm cũ sang trạm mới → khung hình không bao giờ trống
        const P = st.pose, Q = next.pose, w = E.io(clamp(p * 1.4 - .1));
        const tx = P.x + (Q.x - P.x) * w, tz = P.z + (Q.z - P.z) * w;
        const look = Math.atan2(-(tx - c.x), -(tz - c.z)) * 180 / Math.PI;
        const blend = Math.sin(Math.PI * p);
        c.yaw = (A.yaw + (B.yaw - A.yaw) * w) * (1 - blend) + look * blend;
      } else {
        // track / fpv: đi thẳng xuyên qua trạm hiện tại (trạm mờ dần khi máy tới sát) sang trạm kế
        const fp = mv === 'fpv';
        const e = fp ? (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) : p * p * (3 - 2 * p);
        const side = Math.sign(next.pose.x - st.pose.x) || 1;
        c = { x: A.x + (B.x - A.x) * e, y: A.y + (fp ? Math.sin(Math.PI * p) * 110 : -Math.sin(Math.PI * p) * 40), z: A.z + (B.z - A.z) * e,
              yaw: A.yaw + (B.yaw - A.yaw) * E.io(p) };
        if (fp) { roll = -side * 13 * Math.sin(Math.PI * p); c.yaw += side * 9 * Math.sin(Math.PI * p); blurK = 4; }
        else blurK = 1.6;
      }
      moving = Math.sin(Math.PI * p);
    }
    // cầm tay: rung rất nhẹ, có chủ đích (FPV rung gắt hơn khi đang bay)
    const sh = roll ? 2.2 : 1;
    c.x += Math.sin(T * 1.3) * 7 * sh; c.y += Math.sin(T * 1.9 + 1) * 5 * sh; c.yaw += Math.sin(T * .7) * .5;
    return { c, i, moving, zoom, roll, blurK };
  }

  let lastT = -1;
  X.update.push((o, lt, T) => {
    if (!WORLD || T === lastT) return; lastT = T;
    const { E, clamp } = U();
    const { c, i: cur, moving, zoom, roll, blurK } = camAt(T);
    CAMEL.style.transform = `rotateZ(${roll.toFixed(2)}deg) rotateY(${-c.yaw}deg) translate3d(${-c.x}px,${-c.y}px,${-c.z}px)`;
    WORLD.style.transform = zoom !== 1 ? `scale(${zoom.toFixed(4)})` : '';
    WORLD.style.filter = moving > .15 ? `blur(${(moving * blurK).toFixed(2)}px)` : '';
    ST.forEach(st => {
      const d = st.i - cur; st.el.style.display = d < -1 || d > 2 ? 'none' : '';
      if (st.el.style.display) return;
      const slt = T - st.start;
      // máy bay xuyên qua trạm (track/fpv): trạm mờ dần khi máy tới sát mặt phẳng, khuất hẳn khi đã ở sau lưng
      const depth = (c.z - st.pose.z) * Math.cos(st.pose.yaw * Math.PI / 180) + (c.x - st.pose.x) * Math.sin(st.pose.yaw * Math.PI / 180);
      const near = clamp((depth - 140) / 360);
      st.el.style.visibility = depth < 140 ? 'hidden' : '';
      st.el.style.opacity = (d > 0 ? .55 + .45 * (d === 1 ? clamp(1 - (st.start - T) / 1.5) : 0) : 1) * near;
      st.objs.forEach(ob => {
        const k = ob.dataset.k, p = clamp((slt - +ob.dataset.at) / (k === 'title' ? (TITLE_DUR[MOOD()] || .6) : .6)), e = E.out3(p), bk = E.back(p);
        let t = 'translate3d(var(--x),var(--y),var(--z))', ti = null;
        if (k === 'title') { ti = titleIn(p, E, T); t += ti.t; ob.style.filter = ti.f || '';
          if (MOOD() === 'alert') { const a = slt - +ob.dataset.at - TITLE_DUR.alert; if (a > 0 && a < .5) t += ` translate(${(Math.sin(a * 70) * 14 * (1 - a / .5)).toFixed(1)}px,0)`; } }
        else if (k === 'num') t += ` scale(${.4 + .6 * bk})`;
        else if (k === 'item') t += ` translateX(${(1 - e) * (ob.style.getPropertyValue('--x').startsWith('-') ? -260 : 260)}px) rotateY(${(1 - e) * 35}deg)`;
        else t += ` translateY(${(1 - e) * -80}px)`;
        t += ` translateY(${Math.sin(T * 1.1 + st.i) * 6}px)`;   // trôi nhẹ trong không gian
        ob.style.transform = t; ob.style.opacity = p > 0 ? (ti ? ti.o : Math.min(1, p * 2)) : 0;
        if (k === 'num') {
          const cn = ob.querySelector('.jcnt'), q = E.out5(clamp((slt - +ob.dataset.at - .2) / 1.3)), dec = +cn.dataset.dec;
          cn.textContent = (+cn.dataset.to * q).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }
      });
    });
    // đèn đường xa có thể bị trình duyệt vẽ đè lên chữ nhấn (sắp lớp 3D) → tắt đèn trong lúc chữ nhấn đang hiện
    const emOn = EMPH.some(e => T >= e.t - .05 && T < e.end + .3);
    if (LAMPS === null) LAMPS = [...WORLD.querySelectorAll('.jlamp')];
    LAMPS.forEach(l => { l.style.opacity = emOn ? 0 : ''; });
    EMPH.forEach(e => {
      const p = clamp((T - e.t + .05) / .35), out = clamp((T - e.end) / .3), on = T >= e.t - .05 && T < e.end + .3;
      e.el.style.opacity = on ? Math.min(1, p * 2.5) * (1 - out) : 0;
      if (!on) return;
      e.el.style.transform = `translate3d(var(--x),var(--y),var(--z)) scale(${.6 + .4 * E.back(p)}) rotate(${-3 + Math.sin(T * 2) * .6}deg)`;
      e.el.querySelector('.jbar').style.transform = `scaleX(${E.io(clamp((T - e.t) / .4))})`;
    });
  });

  // chuyển cảnh = máy quay bay; lớp chữ 2D chỉ hoà dần
  X.trans.journey = (A, B, p, fx) => {
    A.style.visibility = B.style.visibility = 'visible';
    A.style.opacity = 1 - p; B.style.opacity = p; fx.innerHTML = '';
  };
  X.themeTrans.journey = 'journey';
  X.trSfx.journey = 'whoosh';
})();
