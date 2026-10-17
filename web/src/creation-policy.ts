import { creativeBrief } from './creative.ts';
import { HttpError } from './util.ts';

// Creation support is a release decision, not an admin label or a renderer unit test.
// Legacy projects remain readable. Do not advertise a new mode until its whole pipeline works.
export const RETIRED_LOOKS = ['director','act','whiteboard','illustrated','split','chat','story','data','quiz','doc'];
export function creationChoice(input: any) {
  const selected = input.look;
  const creative = creativeBrief(input.creative);
  if (creative) {
    if (!['topic','mine-ai'].includes(input.source)) throw new HttpError(400,'Chọn chủ đề hoặc kịch bản của bạn.');
    return {...input,creative,look:'',visual:'sketch',intro:false};
  }
  if (selected && !['auto','classic-sketch','kinetic'].includes(selected))
    throw new HttpError(409, 'Dạng video này đã ngừng tạo mới sau rà soát chất lượng. Chọn Whiteboard hoặc Chữ chuyển động.');
  if (input.source === 'mine-free' || input.source === 'template')
    throw new HttpError(409, 'Đã bỏ cách dựng theo mẫu/quy tắc. Chọn Chủ đề hoặc Kịch bản + AI để AI thiết kế từng cảnh.');
  if (input.source && !['topic','mine-ai'].includes(input.source)) throw new HttpError(400, 'Cách tạo không hợp lệ.');
  return { ...input, source: input.source || 'mine-ai', look: selected === 'kinetic' ? 'kinetic' : '', visual: 'sketch', mode: selected === 'kinetic' ? 'kinetic' : 'hand', style: selected === 'kinetic' ? 'bold' : 'whiteboard', intro: false };
}

/** Reject missing or repeated AI designs before cleanSpec can silently fill them with rules. */
export function designIssues(out: any, look?: string, expectedScenes?: number, allowTextOnly = false): string[] {
  if (!Array.isArray(out?.scenes) || !out.scenes.length) return ['Thiếu cảnh'];
  if (expectedScenes !== undefined && out.scenes.length !== expectedScenes) return ['Sai số cảnh của kịch bản'];
  const issues: string[] = [], signatures = new Set<string>();
  out.scenes.forEach((s: any, i: number) => {
    if (look === 'kinetic') {
      if (!Array.isArray(s.x?.keys) || !s.x.keys.length || s.x.keys.some((k: any) => typeof k !== 'string' || !(s.lines || []).join(' ').toLocaleLowerCase().includes(k.toLocaleLowerCase()))) issues.push(`Cảnh ${i+1}: thiếu từ nhấn đúng lời đọc`);
      return;
    }
    const items = s.diagram?.items;
    if (s.diagram?.kind !== 'sketch' || !Array.isArray(items)) {
      issues.push(`Cảnh ${i+1}: cần diagram.kind=sketch và mảng items, nhận ${s.diagram?.kind || 'thiếu diagram'}`); return;
    }
    if (items.length < (allowTextOnly ? 1 : 2) || items.length > (allowTextOnly ? 18 : 8)) {
      issues.push(`Cảnh ${i+1}: số vật thể ${items.length} không hợp lệ (tối đa ${allowTextOnly ? 18 : 8})`); return;
    }
    if (!items.some((it: any) => (allowTextOnly ? ['text','icon','person','chart'] : ['icon','person','chart']).includes(it?.t))) {
      issues.push(`Cảnh ${i+1}: cần hình minh hoạ hoặc chữ có nội dung`); return;
    }
    if (items.some((it: any) => !it || !['text','icon','person','chart','arrow','circle','underline','box','cross','check'].includes(it?.t))) issues.push(`Cảnh ${i+1}: vật thể không hỗ trợ`);
    const signature = JSON.stringify(items);
    if (signatures.has(signature)) issues.push(`Cảnh ${i+1}: lặp nguyên thiết kế cảnh trước`);
    signatures.add(signature);
  });
  return issues;
}
