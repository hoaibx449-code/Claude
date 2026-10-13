// Reference-inspired process desk. All final rendering remains on the server.
'use strict';
const RenderDesk = (() => {
  const stages = [['preparing', 'Chuẩn bị'], ['images', 'Minh họa'], ['voice', 'Giọng đọc'], ['rendering', 'Dựng video'], ['uploading', 'Lưu kết quả']];
  let dialog, timer, generation = 0;
  function close() { generation++; clearTimeout(timer); dialog?.close(); dialog?.remove(); dialog = null; }
  async function open(spec, projectId, jobId) {
    close();
    const version = ++generation, began = Date.now();
    const headline = h('h2', { id: 'render-desk-title' }, 'Video của bạn đang được chuẩn bị');
    const clock = h('span', { class: 'render-clock' }, '00:00');
    const steps = stages.map(([, label]) => h('li', {}, h('span', { class: 'step-dot', 'aria-hidden': 'true' }), label));
    const canvas = h('canvas', { 'aria-label': 'Bố cục cảnh đầu, không phải khung hình đang dựng trên máy chủ' });
    const note = h('p', { class: 'muted', role: 'status' }, 'Đang đọc trạng thái máy dựng…');
    const progress = h('progress', { max: 100, value: 0, 'aria-label': 'Tiến độ máy dựng' });
    const percent = h('b', {}, 'Đang chờ');
    const actions = h('div', { class: 'row' });
    const thumbs = spec.scenes.slice(0, 12).map((_, i) => h('canvas', { 'aria-label': `Bố cục cảnh ${i + 1}` }));
    const storyboard = h('div', { class: 'render-storyboard' }, spec.scenes.map((scene, i) => h('article', {}, h('b', {}, `Cảnh ${i + 1}`), thumbs[i] || null, h('p', {}, scene.lines.join(' ')))));
    dialog = h('dialog', { class: 'render-desk', 'aria-labelledby': 'render-desk-title' },
      h('header', { class: 'render-desk-head' }, h('div', {}, h('small', { class: 'eyebrow' }, 'XƯỞNG VIDEO'), headline), clock,
        h('button', { type: 'button', class: 'ghost small', 'aria-label': 'Đóng bàn dựng', onclick: close }, 'Đóng')),
      h('ol', { class: 'render-steps' }, steps),
      h('div', { class: 'render-desk-body' }, h('figure', { class: 'render-still' }, canvas, h('figcaption', {}, 'Xem bố cục cảnh đầu')),
        h('section', {}, h('h3', {}, spec.title || 'Video mới'), note, h('div', { class: 'render-meter' }, progress, percent),
          h('p', { class: 'muted' }, 'Bạn có thể đóng cửa sổ hoặc rời trang. Máy chủ tiếp tục dựng; kết quả lưu trong mục Video.'), actions,
          h('details', {}, h('summary', {}, `Storyboard · ${spec.scenes.length} cảnh`), storyboard))));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    document.body.append(dialog); dialog.showModal();
    previewModel(spec, 0.5).then((model) => {
      if (version !== generation || !dialog) return;
      canvas.width = model.W * 0.5; canvas.height = model.H * 0.5;
      NV.renderFrame(canvas.getContext('2d'), model, model.timeline.scenes[0].end - 0.2, { hand: false });
      thumbs.forEach((thumb, i) => {
        thumb.width = canvas.width; thumb.height = canvas.height;
        NV.renderFrame(thumb.getContext('2d'), model, model.timeline.scenes[i].end - 0.2, { hand: false });
      });
    }).catch(() => { canvas.replaceWith(h('p', { class: 'muted' }, 'Không tải được ảnh nháp. Việc dựng trên máy chủ vẫn tiếp tục.')); });
    async function poll() {
      if (version !== generation || !dialog?.open) return;
      try {
        const { jobs, queueLength } = await api(`/api/projects/${projectId}/jobs`);
        if (version !== generation) return;
        const job = jobs.find((item) => item.id === jobId);
        if (!job) throw new Error('Không tìm thấy lượt dựng này. Mở mục Video để kiểm tra.');
        const elapsed = Math.max(0, Math.floor((Date.now() - (job.created_at || began)) / 1000));
        clock.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
        const done = job.status === 'done', failed = job.status === 'failed';
        const current = stages.findIndex(([key]) => key === job.phase);
        steps.forEach((step, i) => { step.className = done || (current >= 0 && i < current) ? 'complete' : i === current && !failed ? 'active' : ''; });
        headline.textContent = done ? 'Video đã sẵn sàng' : failed ? 'Chưa dựng được video' : job.status === 'queued' ? 'Video đang trong hàng chờ' : 'Máy dựng đang xử lý video';
        note.textContent = done ? 'MP4 và phụ đề đã được lưu.' : failed ? job.error || 'Hãy thử lại hoặc liên hệ hỗ trợ.' : job.status === 'queued' ? `Có ${queueLength} video đang chờ. Tiến độ sẽ hiện khi máy dựng bắt đầu.` : job.message || 'Máy dựng đang xử lý tài nguyên.';
        const pct = done ? 100 : Math.max(0, Math.min(99, Number(job.progress) || 0));
        progress.value = pct; percent.textContent = done ? '100%' : job.status === 'queued' ? 'Đang chờ' : job.phase === 'rendering' || job.phase === 'uploading' ? `${pct}%` : 'Đang xử lý';
        actions.replaceChildren();
        if (done) {
          actions.append(h('a', { class: 'btn', href: `#/xem/${projectId}/${job.id}`, onclick: close }, 'Xem video'), h('a', { class: 'btn ghost', href: `/api/jobs/${job.id}/video`, download: true }, 'Tải MP4'), h('a', { href: `/api/jobs/${job.id}/srt`, download: true }, 'Tải SRT'));
          return;
        }
        if (failed) { actions.append(h('button', { type: 'button', class: 'ghost', onclick: close }, 'Quay lại chỉnh và thử lại')); return; }
      } catch (error) { if (version !== generation) return; note.textContent = 'Chưa đọc được trạng thái: ' + error.message + '. Sẽ kiểm tra lại; không tạo thêm lượt dựng.'; }
      timer = setTimeout(poll, 3000);
    }
    await poll();
  }
  addEventListener('hashchange', close);
  return { open, close };
})();
