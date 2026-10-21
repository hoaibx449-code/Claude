// Deliberately anchored: ordinary reports containing these words are not requests.
const folded=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
export function councilInvocation(value:string):{kind:'menu'|'ask'|'none';text:string}{
  const text=value.trim(),plain=folded(text);
  const menu=/^(?:(?:mo|hien|bat|goi|xem|cho toi xem|cho toi) )?(?:menu(?: tro ly)?|bang dieu khien(?: tro ly)?|danh sach nut bam|tro ly(?: oi)?|faciup(?: oi)?)(?: giup toi| nhe| nao| voi| di)?$/;
  if(menu.test(plain)||['oi tro ly','alo tro ly','chao tro ly','tro ly dau roi','tro ly co do khong','tro ly giup toi','tro ly ho tro toi'].includes(plain))return{kind:'menu',text:''};
  const prefix=text.match(/^(?:trợ lý|tro ly|faciup)(?:\s+(?:ơi|oi))?(?:[\s,:;!?.…]+|$)/iu);
  if(prefix){
    const rest=text.slice(prefix[0].length).trim();
    if(!rest||menu.test(folded(rest))||/^(?:cho toi xem|hien|mo) (?:cac nut|cac nut bam|danh sach nut bam)(?: nhe| voi)?$/.test(folded(rest)))return{kind:'menu',text:''};
    if(!/(?:ơi|oi)[\s,:;!?.…]*$/iu.test(prefix[0])&&!/[,:;!?.…]/u.test(prefix[0])&&
      !/^(?:hay|giup|cho|lam|viet|tao|mo|giai|xem|len|ho tro|toi can|ban co)\b/.test(folded(rest)))return{kind:'none',text};
    return{kind:'ask',text:rest};
  }
  return{kind:'none',text};
}
