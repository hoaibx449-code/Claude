/** Mechanical checks only: this does not prove factual accuracy or semantic quality. */
export function councilQuality(value:string,brief:string,final=false,brand=''){
  const warnings:string[]=[],source=brief+'\n'+brand;
  const foreign=[/\p{Script=Cyrillic}/u,/\p{Script=Hangul}/u,/\p{Script=Kannada}/u,/\p{Script=Gurmukhi}/u,
    /\p{Script=Devanagari}/u,/\p{Script=Arabic}/u,/\p{Script=Thai}/u,/\p{Script=Han}/u,/\p{Script=Hiragana}/u,/\p{Script=Katakana}/u];
  if(!/dịch|tiếng (Hàn|Trung|Nhật|Nga|Thái|Ả Rập|Hindi)|ngôn ngữ gốc/iu.test(source)&&foreign.some(r=>r.test(value)&&!r.test(source)))
    warnings.push('Nội dung tiếng Việt bị lẫn hệ chữ khác không có trong yêu cầu. Cần viết lại, không chỉ đổi font.');
  if(final){
    const days=Number(brief.match(/\b([1-9]|[12]\d|3[01])\s*ngày\b/iu)?.[1]||0);
    if(days){
      const found=new Set([...value.matchAll(/^(?:[\s#>*•-]*|\d+[.)]\s*)Ngày\s*(?:thứ\s*)?(\d{1,2})\b/gimu)].map(m=>Number(m[1])));
      const week=days===7&&[/thứ\s*hai/iu,/thứ\s*ba/iu,/thứ\s*tư/iu,/thứ\s*năm/iu,/thứ\s*sáu/iu,/thứ\s*bảy/iu,/chủ\s*nhật/iu].every(r=>r.test(value));
      const missing=Array.from({length:days},(_,i)=>i+1).filter(d=>!found.has(d));
      if(missing.length&&!week)warnings.push('Bản tổng hợp chưa tách đủ '+days+' ngày theo yêu cầu; thiếu ngày '+missing.join(', ')+'.');
    }
    if(!/mẫu|template|khung|placeholder/iu.test(brief)&&/\{(?:brand|topic|name)\}|\[(?:điền|tên thương hiệu)[^\]]*\]|lorem ipsum/iu.test(value))
      warnings.push('Bản tổng hợp còn chỗ trống chưa điền, chưa sẵn sàng trình duyệt.');
  }
  return warnings;
}
