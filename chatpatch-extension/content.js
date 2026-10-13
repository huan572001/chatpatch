// Observe only a real user gesture. Do NOT modify requests, cookies or ChatGPT DOM.
(() => {
  const chatId = () => {
    const m=location.pathname.match(/(?:^|\/)c\/([A-Za-z0-9-]{8,})(?:\/|$)/);
    return m?.[1] || null;
  };
  let last = 0;
  document.addEventListener('click', e => {
    if (!e.isTrusted || !chatId()) return;
    const el=e.target instanceof Element ? e.target : e.target?.parentElement;
    const clicked=el?.closest('a,button,[role="button"]');
    if (!clicked) return;
    const href=clicked.getAttribute('href')||clicked.closest('a')?.getAttribute('href')||'';
    const label=[clicked.textContent,clicked.getAttribute('aria-label'),clicked.getAttribute('title'),clicked.getAttribute('download'),href].filter(Boolean).join(' ').slice(0,1000);
    const near=clicked.closest('article,[data-testid],div[class*="group"]')?.textContent?.slice(0,350)||'';
    const looks=/\.zip(?:\b|[?&#])/i.test(label+' '+near)||/download|tải xuống|tải về/i.test(label);
    if (!looks || Date.now()-last<400) return;
    last=Date.now();
    chrome.runtime.sendMessage({kind:'CLICK_DOWNLOAD',chatId:chatId(),href,at:Date.now()}).catch(()=>{});
  },true);
})();
