// i18n tarama: en/tr anahtar farkı + ASCII'leşmiş Türkçe + jenerik pazarlama dili.
import fs from 'node:fs'; import path from 'node:path';
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const q=p?p+'.'+k:k; if(v&&typeof v==='object')flat(v,q,out); else out[q]=v;}return out;};
const tr=flat(JSON.parse(fs.readFileSync('messages/tr.json','utf8'))), en=flat(JSON.parse(fs.readFileSync('messages/en.json','utf8')));
const missEn=Object.keys(tr).filter(k=>!(k in en)), missTr=Object.keys(en).filter(k=>!(k in tr));
const sameVal=Object.keys(tr).filter(k=>en[k]===tr[k]&&/[çğıöşüÇĞİÖŞÜ]/.test(String(tr[k])));
const ascii=/\b(Kullanici|kullanici|Sifre|sifre|Giris|giris yap|Cikis|cikis|Basarili|basarili|Basarisiz|Ayarlar[ıi]n? kaydedildi|Hata olustu|olustu|Guncelle|guncelle|Duzenle|duzenle|Odul|odul|Musteri|musteri|Bayi bulunamadi|bulunamadi|yukleniyor|Yukleniyor|Iptal|Islem|islem|Lutfen|lutfen|Gonder|gonder|Degisiklik|degisiklik|Sec\b|Tum\b|tum\b)\b/;
const hype=/(bir üst seviyeye|üst seviyeye taşı|devrim niteliğinde|kusursuz deneyim|sınırları zorla|potansiyelini (açığa|ortaya) çıkar|dijital dönüşüm|oyunun kurallarını|yeni nesil|benzersiz deneyim|next level|unleash|seamless|game[- ]chang|revolutioniz|cutting[- ]edge|supercharge)/i;
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='node_modules'||e.name.startsWith('.')?[]:e.isDirectory()?walk(path.join(d,e.name)):/\.(tsx|ts)$/.test(e.name)?[path.join(d,e.name)]:[]);
const files=['app','components','lib'].flatMap(walk); const asciiHits=[],hypeHits=[],jsxTr={};
for(const f of files){const L=fs.readFileSync(f,'utf8').split('\n');L.forEach((l,i)=>{
 if(/^\s*(\/\/|\*|import)/.test(l))return; const loc=`${f.split(path.sep).join('/')}:${i+1}`;
 const s=l.match(/(['"`>])([^'"`<>{}]*)/g)?.join(' ')||''; if(ascii.test(s))asciiHits.push(loc+'  '+l.trim().slice(0,110));
 if(hype.test(l))hypeHits.push(loc+'  '+l.trim().slice(0,110));
 if(f.endsWith('.tsx')&&/>\s*[^<>{}]*[çğıöşüÇĞİÖŞÜ][^<>{}]*</.test(l))jsxTr[f]=(jsxTr[f]||0)+1;});}
const top=Object.entries(jsxTr).sort((a,b)=>b[1]-a[1]);
const r={missEn:missEn.length,missTr:missTr.length,sameTrEn:sameVal.length,asciiHits:asciiHits.length,hypeHits:hypeHits.length,jsxTrFiles:top.length,jsxTrLines:top.reduce((a,b)=>a+b[1],0)};
console.log(JSON.stringify(r));
if(process.argv.includes('--detail')){console.log('\n# missing en\n'+missEn.slice(0,60).join('\n'));console.log('\n# missing tr\n'+missTr.slice(0,60).join('\n'));console.log('\n# ascii\n'+asciiHits.join('\n'));console.log('\n# hype\n'+hypeHits.join('\n'));console.log('\n# top JSX TR files\n'+top.slice(0,30).map(x=>x[1]+' '+x[0]).join('\n'));}
