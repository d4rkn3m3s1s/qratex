/**
 * Çevrimdışı yedek sayfanın işaretlemesi + satır içi betiği (sunucu tarafında dizgi olarak üretilir).
 *
 * NEDEN React adası değil? `/offline` SW ön belleğindeki HTML'den sunulur; config/pwa.js rota
 * chunk'larını ön belleğe ALMAZ (yalnız uygulama kabuğu). Kullanıcı /offline'ı daha önce hiç
 * açmadıysa sayfanın JS chunk'ı cihazda yoktur ve React adası hiç hidrasyona giremez. Bu yüzden
 * bütün davranış HTML'e gömülü küçük bir betikle çalışır (ağ ve chunk gerektirmez); içerik
 * `dangerouslySetInnerHTML` kabında durduğu için React hidrasyonu betiğin değişikliklerine
 * dokunmaz.
 *
 * Davranış (rapor offline bulgu 1, 3, 4, 5, 6, 9, 7; eksik özellik 1, 2, 3, 5, 6):
 *  - "Şimdi tekrar dene" bağlantıyı yoklar (HEAD /manifest.json, 4 sn) ve başarılıysa ASIL
 *    adresi yeniden yükler (QR/kart adresi kaybolmaz); doğrudan /offline açıldıysa ana sayfaya.
 *  - `online` / görünürlük olaylarında ve artan aralıklarla (5→10→20→30 sn) otomatik yoklama;
 *    durum `role=status` ile duyurulur, geri sayım görsel (ekran okuyucuya her saniye okunmaz).
 *  - Bağlama göre mesaj (kart / masa QR'ı / masa sinyali / cüzdan).
 *  - Son kaydedilen kart: yalnız son doğrulanmış oturum sahibinin (`qx:session-uid`) Kartım
 *    anlık görüntüsü; QR hazır görsel (çevrimdışı üretim gerekmez) + "Kasada göster" tam ekranı.
 *  - Çevrimdışı açılabilen sayfalar (SW `others` önbelleğindeki bilinen sayfalar).
 *  - Bekleyen masa sinyalleri sayısı (masa sinyali kuyruğu).
 *  - Gösterim günlüğü (bağlantı gelince SessionDeviceGuard analitiğe gönderir).
 *  - `<html data-qx-bare>` → global çevrimdışı şeridi, kurulum bandı ve sohbet balonu gizlenir.
 */
import { SNAPSHOT_MAX_AGE_MS, SNAPSHOT_VERSION } from '@/lib/wallet-card/snapshot';
import { LOCALE_STORAGE_KEY } from '@/lib/locale-shared';
import { BARE_CHROME_ATTR } from '@/lib/pwa/bare-chrome-attr';
import { QUEUE_TTL_MS, SIGNAL_QUEUE_KEY } from '../table/signal-client';
import { OFFLINE_COPY } from './copy';
import { OFFLINE_LOG_KEY, OFFLINE_LOG_MAX, SESSION_UID_KEY, WALLET_SNAPSHOT_PREFIX } from './device-data';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON'u <script> içine güvenle gömer. */
function jsonForScript(v: unknown): string {
  const LS = String.fromCharCode(0x2028);
  const PS = String.fromCharCode(0x2029);
  const BS = String.fromCharCode(0x5c);
  return JSON.stringify(v)
    .replace(/</g, `${BS}u003c`)
    .split(LS)
    .join(`${BS}u2028`)
    .split(PS)
    .join(`${BS}u2029`);
}

const BTN_PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground shadow-sm transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60';
const BTN_GHOST =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-base font-medium text-fg transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Sinyal arıyor görseli: üç halka + kesik Wi-Fi simgesi (SVG, ağ gerektirmez). */
const SIGNAL_VISUAL = `
<div id="qx-off-signal" class="qx-off-signal relative flex h-28 w-28 items-center justify-center" aria-hidden="true">
  <span class="qx-off-ring" style="--qx-s:.62"></span>
  <span class="qx-off-ring" style="--qx-s:.82"></span>
  <span class="qx-off-ring" style="--qx-s:1"></span>
  <span class="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-subtle text-brand ring-1 ring-brand-border">
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2.01-1.53"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="m2 2 20 20"/></svg>
  </span>
</div>`;

const STYLE = `
.qx-off-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid hsl(var(--brand) / .28);transform:scale(var(--qx-s));opacity:.55}
[data-checking="true"] .qx-off-ring{animation:qx-off-wave 1.2s cubic-bezier(.2,0,0,1) 2 both}
[data-checking="true"] .qx-off-ring:nth-child(2){animation-delay:.2s}
[data-checking="true"] .qx-off-ring:nth-child(3){animation-delay:.4s}
@keyframes qx-off-wave{0%{opacity:.9;transform:scale(.5)}100%{opacity:0;transform:scale(1.18)}}
#qx-off-status[data-tone="ok"]{border-color:hsl(var(--success-border));background:hsl(var(--success-subtle));color:hsl(var(--success-text))}
@media (prefers-reduced-motion: reduce){[data-checking="true"] .qx-off-ring{animation:none}}
html.reduce-animations [data-checking="true"] .qx-off-ring{animation:none}
`;

export function buildOfflineMarkup(): string {
  const t = OFFLINE_COPY.tr;
  return `
<style>${STYLE}</style>
<main class="flex min-h-dvh flex-col items-center bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-6 text-fg sm:pt-10" aria-labelledby="qx-off-title">
  <div class="flex w-full max-w-md flex-col gap-6">
    <a href="/" class="inline-flex min-h-11 items-center gap-2 self-start rounded-control font-display text-lg font-bold tracking-tight text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <span aria-hidden="true" class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-black text-brand-fg">Q</span>Qratex
    </a>
    <section class="flex flex-col items-center gap-4 text-center">
      ${SIGNAL_VISUAL}
      <h1 id="qx-off-title" class="qx-h1 text-fg">${esc(t.title)}</h1>
      <p id="qx-off-context" class="max-w-sm text-base text-fg-muted">${esc(t.contextDefault)}</p>
      <div class="flex flex-col items-center gap-1">
        <p id="qx-off-status" role="status" aria-live="polite" class="inline-flex min-h-8 items-center rounded-full border border-border bg-surface-1 px-3 text-sm font-medium text-fg">${esc(t.statusOffline)}</p>
        <p id="qx-off-next" aria-hidden="true" class="min-h-5 text-xs tabular-nums text-fg-muted"></p>
      </div>
      <div class="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <button id="qx-off-retry" type="button" class="${BTN_PRIMARY}">${esc(t.retry)}</button>
        <a id="qx-off-home" href="/" class="${BTN_GHOST}">${esc(t.home)}</a>
      </div>
    </section>

    <p id="qx-off-pending" hidden class="rounded-control border border-warning-border bg-warning-subtle p-3 text-sm text-fg"></p>

    <section id="qx-off-card" hidden aria-labelledby="qx-off-card-title" class="rounded-card border border-border bg-surface-1 p-4 qx-elevation-1">
      <div class="flex items-baseline justify-between gap-3">
        <h2 id="qx-off-card-title" class="qx-h3 text-fg"></h2>
        <p id="qx-off-card-saved" class="text-xs text-fg-muted"></p>
      </div>
      <div class="mt-4 flex items-center gap-4">
        <img id="qx-off-card-qr" alt="" width="112" height="112" class="h-28 w-28 shrink-0 rounded-lg bg-white p-1.5" />
        <div class="min-w-0 space-y-1">
          <p id="qx-off-card-holder" class="truncate font-semibold text-fg"></p>
          <p id="qx-off-card-masked" class="font-mono text-sm tracking-widest text-fg-muted"></p>
        </div>
      </div>
      <p id="qx-off-card-note" class="mt-3 text-xs text-fg-muted"></p>
      <button id="qx-off-card-show" type="button" class="${BTN_PRIMARY} mt-4 w-full"></button>
    </section>

    <section id="qx-off-cached" hidden aria-labelledby="qx-off-cached-title" class="rounded-card border border-border bg-surface-1 p-4">
      <h2 id="qx-off-cached-title" class="qx-h3 text-fg"></h2>
      <p id="qx-off-cached-note" class="mt-1 text-xs text-fg-muted"></p>
      <ul id="qx-off-cached-list" class="mt-3 flex flex-col gap-1"></ul>
    </section>
  </div>

  <div id="qx-off-full" hidden role="dialog" aria-modal="true" aria-labelledby="qx-off-full-title" class="fixed inset-0 z-modal overflow-y-auto bg-white text-neutral-900">
    <div class="flex min-h-full flex-col items-center justify-center gap-5 p-6 text-center">
    <h2 id="qx-off-full-title" class="text-xl font-semibold"></h2>
    <img id="qx-off-full-qr" alt="" class="aspect-square w-full max-w-xs" />
    <p id="qx-off-full-holder" class="text-lg font-semibold"></p>
    <p id="qx-off-full-masked" class="font-mono tracking-widest text-neutral-700"></p>
    <button id="qx-off-full-close" type="button" class="inline-flex min-h-11 min-w-32 items-center justify-center rounded-lg border border-neutral-300 px-5 font-medium text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"></button>
    </div>
  </div>
</main>`;
}

export function buildOfflineScript(): string {
  const cfg = {
    copy: OFFLINE_COPY,
    localeKey: LOCALE_STORAGE_KEY,
    bareAttr: BARE_CHROME_ATTR,
    uidKey: SESSION_UID_KEY,
    snapPrefix: WALLET_SNAPSHOT_PREFIX,
    snapVersion: SNAPSHOT_VERSION,
    snapMaxAge: SNAPSHOT_MAX_AGE_MS,
    logKey: OFFLINE_LOG_KEY,
    logMax: OFFLINE_LOG_MAX,
    queueKey: SIGNAL_QUEUE_KEY,
    queueTtl: QUEUE_TTL_MS,
    delays: [5, 10, 20, 30],
  };
  return `(function(){try{
var K=${jsonForScript(cfg)};
var d=document,w=window,html=d.documentElement,ls=null;
html.setAttribute(K.bareAttr,'offline');
try{ls=w.localStorage;}catch(e){}
function get(k){try{return ls?ls.getItem(k):null;}catch(e){return null;}}
function $(id){return d.getElementById(id);}
function fill(s,v){return s.replace(/\\{(\\w+)\\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(v,k)?String(v[k]):m;});}
var lang=get(K.localeKey)==='en'?'en':'tr',t=K.copy[lang],tag=lang==='en'?'en-GB':'tr-TR';
html.lang=lang;
var path=location.pathname,direct=path==='/offline';
var ctx=t.contextDefault;
if(/^\\/c\\//.test(path))ctx=t.contextCard;else if(/^\\/feedback\\//.test(path))ctx=t.contextFeedback;else if(/^\\/table-signal/.test(path))ctx=t.contextSignal;else if(/^\\/customer\\/wallet/.test(path))ctx=t.contextWallet;
$('qx-off-title').textContent=t.title;$('qx-off-context').textContent=ctx;$('qx-off-retry').textContent=t.retry;$('qx-off-home').textContent=t.home;
try{var raw=get(K.logKey),list=raw?JSON.parse(raw):[];if(!Array.isArray(list))list=[];list.push({path:path,at:Date.now()});ls&&ls.setItem(K.logKey,JSON.stringify(list.slice(-K.logMax)));}catch(e){}
var st=$('qx-off-status'),nx=$('qx-off-next'),vis=$('qx-off-signal'),retry=$('qx-off-retry');
var attempt=0,timer=0,tick=0,busy=false,done=false;
function say(s){if(st.textContent!==s)st.textContent=s;}
function recover(){if(done)return;done=true;clearTimeout(timer);clearInterval(tick);nx.textContent='';st.setAttribute('data-tone','ok');say(t.statusBack);setTimeout(function(){if(direct)location.replace('/');else location.reload();},600);}
function schedule(){if(done)return;clearTimeout(timer);clearInterval(tick);var s=K.delays[Math.min(attempt,K.delays.length-1)];attempt++;var left=s;say(t.statusOffline);nx.textContent=fill(t.statusStill,{seconds:left});tick=setInterval(function(){left--;if(left>0)nx.textContent=fill(t.statusStill,{seconds:left});},1000);timer=setTimeout(function(){clearInterval(tick);probe();},s*1000);}
function probe(){if(busy||done)return;busy=true;clearTimeout(timer);clearInterval(tick);nx.textContent='';retry.disabled=true;vis.setAttribute('data-checking','true');say(t.statusChecking);
var ctrl=w.AbortController?new AbortController():null,to=setTimeout(function(){if(ctrl)ctrl.abort();},4000);
var fin=function(ok){clearTimeout(to);busy=false;retry.disabled=false;setTimeout(function(){vis.removeAttribute('data-checking');},2400);if(ok)recover();else schedule();};
fetch('/manifest.json?qx-probe='+Date.now(),{method:'HEAD',cache:'no-store',credentials:'omit',signal:ctrl?ctrl.signal:void 0}).then(function(r){fin(!!r&&(r.ok||r.status===304));},function(){fin(false);});}
retry.addEventListener('click',function(){attempt=0;probe();});
w.addEventListener('online',function(){attempt=0;probe();});
d.addEventListener('visibilitychange',function(){if(d.visibilityState==='visible')probe();});
if(navigator.onLine!==false)setTimeout(probe,1500);else schedule();
try{var q=JSON.parse(get(K.queueKey)||'[]'),n=0,now=Date.now();if(Array.isArray(q))for(var i=0;i<q.length;i++){if(q[i]&&typeof q[i].createdAt==='number'&&now-q[i].createdAt<=K.queueTtl)n++;}
if(n>0){var pe=$('qx-off-pending');pe.textContent=fill(t.pendingSignals,{count:n});pe.hidden=false;}}catch(e){}
try{var uid=get(K.uidKey);if(uid&&/^[A-Za-z0-9_-]{1,191}$/.test(uid)){var sn=JSON.parse(get(K.snapPrefix+uid)||'null'),now2=Date.now();
if(sn&&sn.v===K.snapVersion&&typeof sn.savedAt==='number'&&now2-sn.savedAt<=K.snapMaxAge&&sn.savedAt<=now2+60000&&Array.isArray(sn.cards)&&sn.qr){var card=null;
for(var j=0;j<sn.cards.length;j++){var c=sn.cards[j];if(c&&c.status==='ACTIVATED'&&typeof c.token==='string'&&typeof sn.qr[c.token]==='string'&&sn.qr[c.token].indexOf('data:image/')===0){card=c;break;}}
if(card){var tail=card.token.slice(-8),masked='\\u2022\\u2022\\u2022\\u2022 '+(tail.length>4?tail.slice(0,tail.length-4)+' '+tail.slice(-4):tail),holder=typeof sn.holderName==='string'?sn.holderName:'',src=sn.qr[card.token];
var when=new Intl.DateTimeFormat(tag,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Istanbul'}).format(sn.savedAt);
$('qx-off-card-title').textContent=t.cardTitle;$('qx-off-card-saved').textContent=fill(t.cardSaved,{time:when});$('qx-off-card-holder').textContent=holder;$('qx-off-card-masked').textContent=masked;$('qx-off-card-note').textContent=t.cardNote;
var qi=$('qx-off-card-qr');qi.src=src;qi.alt=t.cardQrAlt;var sb=$('qx-off-card-show');sb.textContent=t.cardShow;$('qx-off-card').hidden=false;
var full=$('qx-off-full'),fc=$('qx-off-full-close'),last=null;$('qx-off-full-title').textContent=t.cardFullscreenTitle;var fq=$('qx-off-full-qr');fq.src=src;fq.alt=t.cardQrAlt;$('qx-off-full-holder').textContent=holder;$('qx-off-full-masked').textContent=masked;fc.textContent=t.cardClose;
var lock=null;function close(){full.hidden=true;try{lock&&lock.release();}catch(e){}lock=null;if(last&&last.focus)last.focus();}
sb.addEventListener('click',function(){last=d.activeElement;full.hidden=false;fc.focus();try{if(navigator.wakeLock)navigator.wakeLock.request('screen').then(function(l){lock=l;},function(){});}catch(e){}});
fc.addEventListener('click',close);full.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){e.preventDefault();fc.focus();}});}}}}catch(e){}
try{if(w.caches&&caches.has){caches.has('others').then(function(h){if(!h)return null;return caches.open('others').then(function(c){return c.keys();});}).then(function(reqs){if(!reqs||!reqs.length)return;var seen={},found=[];
for(var i=0;i<reqs.length;i++){try{var u=new URL(reqs[i].url);if(u.origin!==location.origin||u.search.indexOf('_rsc')>=0)continue;var p=u.pathname.replace(/\\/$/,'')||'/';if(p!==path&&t.pages[p])seen[p]=1;}catch(e){}}
for(var k in t.pages){if(seen[k])found.push(k);}if(!found.length)return;var ul=$('qx-off-cached-list');
for(var m=0;m<found.length&&m<8;m++){var li=d.createElement('li'),a=d.createElement('a');a.href=found[m];a.textContent=t.pages[found[m]];a.className='flex min-h-11 items-center rounded-control px-3 font-medium text-brand underline-offset-4 hover:bg-surface-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';li.appendChild(a);ul.appendChild(li);}
$('qx-off-cached-title').textContent=t.cachedTitle;$('qx-off-cached-note').textContent=t.cachedNote;$('qx-off-cached').hidden=false;}).catch(function(){});}}catch(e){}
}catch(e){}})();`;
}
