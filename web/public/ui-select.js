// Modern dropdowns for every <select> on the site: a button showing the choice and a listbox that
// opens below (or above when there is no room). The real <select> stays in place underneath, so
// forms, values and "change" events work as before; screen readers get button + listbox roles,
// the keyboard works (arrows, Enter, Escape, type to jump). A select with data-preview="url{v}"
// shows a ▶ button on each option to listen before choosing (voices).
// iPhone: no automatic zoom when a field gets focus (iOS still lets people pinch to zoom, so
// text zoom stays available); other phones keep full zoom.
// Keep the user's pinch-to-zoom available; 16px fields prevent unwanted focus zoom.

(() => {
  'use strict';
  let open = null, audio = null, playing = '';
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const protoIdx = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  function stopAudio() { if (audio) { audio.pause(); audio = null; } playing = ''; document.querySelectorAll('.nv-play.on').forEach((b) => { b.classList.remove('on'); b.textContent = '▶'; }); }
  function play(url, btn) {
    if (playing === url) { stopAudio(); return; }
    stopAudio();
    audio = new Audio(url); playing = url;
    if (btn) { btn.classList.add('on'); btn.textContent = '❚❚'; }
    audio.addEventListener('ended', stopAudio);
    audio.play().catch(() => { stopAudio(); if (btn) { btn.textContent = '!'; btn.title = 'Chưa nghe thử được, hãy thử lại sau'; } });
  }
  window.nvPlayPreview = play;

  function close() {
    if (!open) return;
    open.list.remove(); open.btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    open = null;
  }
  function outside(e) { if (open && !open.wrap.contains(e.target) && !open.list.contains(e.target)) close(); }

  function label(sel, btn) {
    const o = sel.options[sel.selectedIndex];
    btn.querySelector('span').textContent = o ? o.textContent : '';
    btn.disabled = sel.disabled;
  }

  function build(sel, wrap, btn) {
    const list = document.createElement('ul');
    list.className = 'nv-list'; list.setAttribute('role', 'listbox'); list.id = 'nvl-' + Math.random().toString(36).slice(2, 8);
    btn.setAttribute('aria-controls', list.id);
    const items = [];
    const add = (o) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.dataset.v = o.value;
      li.setAttribute('aria-selected', String(o.selected));
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      const t = document.createElement('span'); t.textContent = o.textContent; li.append(t);
      if (sel.dataset.preview && o.value) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'play nv-play'; b.textContent = '▶'; b.setAttribute('aria-label', 'Nghe thử ' + o.textContent);
        b.addEventListener('click', (e) => { e.stopPropagation(); play(sel.dataset.preview.replace('{v}', encodeURIComponent(o.value)), b); });
        li.append(b);
      }
      li.addEventListener('click', () => { if (!o.disabled) choose(o.value); });
      items.push(li); list.append(li);
    };
    for (const node of sel.children) {
      if (node.tagName === 'OPTGROUP') {
        const g = document.createElement('li'); g.className = 'group'; g.setAttribute('role', 'presentation'); g.textContent = node.label; list.append(g);
        for (const o of node.children) add(o);
      } else add(node);
    }
    function choose(v) {
      const before = sel.value;
      proto.set.call(sel, v);
      label(sel, btn); close(); btn.focus();
      if (before !== v) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    return { list, items, choose };
  }

  function toggle(sel, wrap, btn) {
    if (open && open.sel === sel) { close(); return; }
    close();
    const { list, items, choose } = build(sel, wrap, btn);
    wrap.append(list);
    const r = btn.getBoundingClientRect();
    if (window.innerHeight - r.bottom < Math.min(320, list.scrollHeight) + 16 && r.top > window.innerHeight - r.bottom) list.classList.add('up');
    btn.setAttribute('aria-expanded', 'true');
    let active = Math.max(0, items.findIndex((li) => li.getAttribute('aria-selected') === 'true'));
    const mark = () => { items.forEach((li, i) => li.classList.toggle('active', i === active)); items[active]?.scrollIntoView({ block: 'nearest' }); btn.setAttribute('aria-activedescendant', ''); };
    mark();
    open = { sel, wrap, btn, list, move: (d) => { do { active = (active + d + items.length) % items.length; } while (items[active].getAttribute('aria-disabled') === 'true' && items.some((x) => x.getAttribute('aria-disabled') !== 'true')); mark(); }, pick: () => choose(items[active].dataset.v),
      jump: (ch) => { const i = items.findIndex((li, k) => k > active && li.textContent.trim().toLowerCase().startsWith(ch)); const j = i >= 0 ? i : items.findIndex((li) => li.textContent.trim().toLowerCase().startsWith(ch)); if (j >= 0) { active = j; mark(); } } };
    document.addEventListener('pointerdown', outside, true);
  }

  function enhance(sel) {
    if (sel.multiple || sel.size > 1 || sel.classList.contains('native') || sel.closest('.nv-select')) return;
    const wrap = document.createElement('div'); wrap.className = 'nv-select';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.append(document.createElement('span'));
    if (sel.id) { const l = document.querySelector(`label[for="${CSS.escape(sel.id)}"]`); if (l) btn.setAttribute('aria-label', l.textContent); }
    if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    sel.parentNode.insertBefore(wrap, sel); wrap.append(sel, btn);
    sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    label(sel, btn);
    // programmatic changes (sel.value = …) keep the button in step
    Object.defineProperty(sel, 'value', { configurable: true, get() { return proto.get.call(this); }, set(v) { proto.set.call(this, v); label(sel, btn); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return protoIdx.get.call(this); }, set(v) { protoIdx.set.call(this, v); label(sel, btn); } });
    sel.addEventListener('change', () => label(sel, btn));
    new MutationObserver(() => label(sel, btn)).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    btn.addEventListener('click', () => toggle(sel, wrap, btn));
    btn.addEventListener('keydown', (e) => {
      const isOpen = open && open.sel === sel;
      if (!isOpen && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); toggle(sel, wrap, btn); return; }
      if (!isOpen) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); open.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); open.move(-1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open.pick(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close();
      else if (e.key.length === 1) open.jump(e.key.toLowerCase());
    });
  }

  const scan = (root) => { if (root.tagName === 'SELECT') enhance(root); else root.querySelectorAll?.('select').forEach(enhance); };
  new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => scan(document.body));
  window.addEventListener('resize', close);
  window.addEventListener('hashchange', () => { close(); stopAudio(); });
})();
