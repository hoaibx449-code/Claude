// UI-only review control. This never sends a Zalo message or calls a write API.
document.querySelector('[data-live-preview]')?.addEventListener('click',()=>{
  document.dispatchEvent(new Event('faciup-live:preview-message'));
});
