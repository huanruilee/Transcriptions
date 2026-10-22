#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const course=path.join(root,'courses/入中論善顯密意疏');
const a=JSON.parse(fs.readFileSync(path.join(root,'reviews/evidence/session36a-quality/audio-alignment.json')));
const t=JSON.parse(fs.readFileSync(path.join(course,'sessions/session_36A.json')));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const v=t.paragraphs.flatMap(p=>p.verbatimSentences);
if(v.length!==a.items.length || v.some((s,i)=>s.id!==a.items[i].id || s.text!==a.items[i].publishedText || s.start!==a.items[i].start || s.end!==a.items[i].end))throw Error('Stale acoustic evidence');
if(!/^https:\/\/buddha\.flyday\.com\.tw\//.test(t.audioUrl))throw Error('Unexpected audio host');
const samples=new Set(a.representativeSampleIds);
const rows=a.items.filter(x=>x.status==='listening-review-required' || samples.has(x.id));
const cards=rows.map(s=>`<article id="${esc(s.id)}" data-review-id="${esc(s.id)}"><h2>${esc(s.id)} · ${Math.floor(s.start/60)}:${String(Math.floor(s.start%60)).padStart(2,'0')} ${s.status==='listening-review-required'?'待聽核':'分層抽樣'}</h2><button data-start="${s.start}" data-end="${s.end}">播放原音片段</button><p><strong>課堂原話：</strong>${esc(s.publishedText)}</p><details><summary>查看自動辨識對照（可能有錯字）</summary><p>${esc(s.asrText)}</p><p>文字覆蓋比：${s.characterCoverage}；此數值不代表正確率。</p></details></article>`).join('\n');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>36A 原音抽查與待覆核清單</title><style>body{font:18px/1.8 system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#25312c;background:#faf9f5}article{border-top:1px solid #bbb;padding:1rem 0}h2{font-size:1.1rem}audio{width:100%;position:sticky;top:0;background:#fff}button{font:inherit;cursor:pointer;padding:.4rem 1rem}a{color:#285f4a}</style><h1>36A 原音抽查與待覆核清單</h1><p><a href="../../../?course=ru-zhong-lun#session-36A">返回 36A 閱讀頁</a> · <a href="lecture_36A_study_guide.html">閱讀整理講記</a></p><p>這是供讀者驗收的清單，不是已完成人工聽核的證書。全講 ${a.totalVerbatim} 句已與自動辨識比對，其中 ${a.needsListening} 句達到待聽核門檻；另列 ${samples.size} 句分層抽樣，去重後共 ${rows.length} 句。高覆蓋比也可能同樣辨識錯誤，所有句子仍可回原音核對。</p><p>整理講記的單句時間碼為段內估算；課堂原話使用既有時間錨點，沒有依模型重排。原音完整解碼長度為 ${a.duration.toFixed(3)} 秒；MP3 檔頭的估算長度較短，不據此截掉末段。</p><audio id="audio" controls preload="none" src="${esc(t.audioUrl)}"></audio><p id="play-status" role="status"></p>${cards}<script>const audio=document.getElementById('audio');let stopAt=null;document.querySelectorAll('button[data-start]').forEach(button=>button.addEventListener('click',()=>{stopAt=Number(button.dataset.end);audio.currentTime=Number(button.dataset.start);audio.play().catch(()=>{document.getElementById('play-status').textContent='原音無法播放，請稍後重試或至官方音檔確認。';});}));audio.addEventListener('timeupdate',()=>{if(stopAt!==null&&audio.currentTime>=stopAt){audio.pause();stopAt=null;}});</script></html>`;
fs.writeFileSync(path.join(course,'publications/lecture_36A_quality_review.html'),html+'\n');
console.log(JSON.stringify({items:rows.length,needsListening:a.needsListening,samples:samples.size}));
