// Help chat in the bottom right corner: a round button opens a small chat that answers how-to
// questions with the site's AI (POST /api/help/chat). The conversation stays in this tab only.
'use strict';
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (paths) => {
    const s = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${paths}</svg>`, 'image/svg+xml');
    for (const n of [...doc.documentElement.childNodes]) s.append(document.importNode(n, true));
    return s;
  };
  const BUBBLE = '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>';
  const BOT = '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/>';
  const SEND = '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>';
  const QUICK = ['Tìm prompt tạo video', 'Tìm bot Zalo tự động hóa', 'Cách tạo video', 'Đổi giọng đọc thế nào?', 'Tải video ở đâu?'];
  let mounted = null;
  const history = [];
  try { history.push(...JSON.parse(sessionStorage.getItem('nv_help') || '[]').slice(-20)); } catch {}
  const keep = () => { try { sessionStorage.setItem('nv_help', JSON.stringify(history.slice(-20))); } catch {} };

  function mount() {
    const cfg = typeof ui !== 'undefined' ? ui?.site?.helpBot : null;
    if (!cfg?.enabled) { mounted?.btn.remove(); mounted?.panel.remove(); mounted = null; return; }
    if (mounted) { mounted.title.textContent = cfg.name; return; }
    const msgs = document.createElement('div'); msgs.className = 'msgs'; msgs.setAttribute('role', 'log'); msgs.setAttribute('aria-live', 'polite');
    const add = (role, text, cls = '') => {
      const m = document.createElement('div'); m.className = `msg ${role === 'user' ? 'me' : 'bot'} ${cls}`; m.textContent = text;
      msgs.append(m); msgs.scrollTop = msgs.scrollHeight; return m;
    };
    const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'Nhập câu hỏi…'; input.maxLength = 1000; input.setAttribute('aria-label', 'Câu hỏi cho trợ lý');
    const send = document.createElement('button'); send.type = 'submit'; send.setAttribute('aria-label', 'Gửi'); send.append(svg(SEND));
    const form = document.createElement('form'); form.append(input, send);
    const quick = document.createElement('div'); quick.className = 'quick';
    const ask = async (text) => {
      text = text.trim(); if (!text || send.disabled) return;
      quick.hidden = true; input.value = ''; send.disabled = true;
      add('user', text);
      const wait = add('bot', 'Đang trả lời…', 'typing');
      try {
        const r = await api('/api/help/chat', { method: 'POST', body: { text, history: history.slice(-8) } });
        wait.classList.remove('typing'); wait.textContent = r.reply;
        if (r.ai === false) { const label = document.createElement('small'); label.textContent = 'Hướng dẫn dự phòng · AI chưa trả lời'; wait.prepend(label, document.createElement('br')); }
        for (const source of r.sources || []) {
          const solution=/^\/giai-phap\/[a-z0-9-]{1,100}$/.test(source.url||'');
          if (!solution&&!source.url?.startsWith('/#/prompt-hunter?q=')) continue;
          const link = document.createElement('a'); link.href = source.url; link.textContent = (solution?'Xem giải pháp: ':'Xem prompt: ') + source.title; link.className = 'help-source'; wait.append(link);
        }
        history.push({ role: 'user', text }, { role: 'bot', text: r.reply }); keep();
      } catch (e) { wait.classList.remove('typing'); wait.textContent = e.message || 'Chưa trả lời được, bạn thử lại sau nhé.'; }
      send.disabled = false; input.focus();
    };
    for (const q of QUICK) { const b = document.createElement('button'); b.type = 'button'; b.textContent = q; b.addEventListener('click', () => ask(q)); quick.append(b); }
    form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });

    const head = document.createElement('header');
    const av = document.createElement('span'); av.className = 'av'; av.append(svg(BOT));
    const who = document.createElement('div'); const title = document.createElement('strong'); title.textContent = cfg.name;
    const sub = document.createElement('small'); sub.textContent = 'Trợ lý AI · prompt, giải pháp & hỗ trợ'; who.append(title, document.createElement('br'), sub);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.setAttribute('aria-label', 'Đóng trợ lý');
    head.append(av, who, close);
    const note = document.createElement('p'); note.className = 'note'; note.textContent = 'Câu trả lời do AI tạo, có thể chưa chính xác.';
    const panel = document.createElement('section'); panel.className = 'helpchat'; panel.hidden = true; panel.setAttribute('aria-label', 'Trợ lý hỗ trợ');
    panel.append(head, msgs, quick, form, note);

    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'helpchat-btn'; btn.setAttribute('aria-label', 'Mở trợ lý hỗ trợ'); btn.setAttribute('aria-expanded', 'false');
    btn.append(svg(BUBBLE));
    const toggle = (open) => {
      panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) {
        if (!msgs.childNodes.length) { add('bot', cfg.welcome); for (const t of history) add(t.role, t.text); quick.hidden = history.length > 0; }
        input.focus();
      }
    };
    btn.addEventListener('click', () => toggle(panel.hidden));
    close.addEventListener('click', () => { toggle(false); btn.focus(); });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); btn.focus(); } });
    document.body.append(panel, btn);
    mounted = { btn, panel, title };
  }
  window.nvHelpChat = mount;
  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
