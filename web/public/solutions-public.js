const ui=JSON.parse(document.getElementById('solution-site-config')?.textContent||'{}');
async function api(path,options={}){
 const res=await fetch(path,{method:options.method||'GET',credentials:'same-origin',headers:{'x-nv':'1',...(options.body?{'content-type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Không kết nối được máy chủ.');return data;
}
document.addEventListener('click',async event=>{
 const button=event.target.closest?.('[data-copy-resource]');if(!button)return;
 const code=button.closest('.resource-code')?.querySelector('code');if(!code)return;
 try{await navigator.clipboard.writeText(code.textContent);button.textContent='Đã sao chép';setTimeout(()=>button.textContent='Sao chép mã',1800);}catch{button.textContent='Hãy chọn nội dung để sao chép';}
});
