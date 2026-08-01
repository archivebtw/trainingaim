window.AIM_CONFIG={supabaseUrl:"https://edadwxggqqjugldngfll.supabase.co",supabaseAnonKey:"sb_publishable_mOwditWAOlsz5Xq32b2g8g_6goNvfz0"};

/* AIM TRAINER — COMBO UPDATE 1.1 */
(()=>{
'use strict';
const PROFILE='aimTrainerProfileV3',SOUND='aimTrainerSoundV1';let streak=0,maxStreak=0,sound=localStorage.getItem(SOUND)!=='off',ctx=null;
const el=id=>document.getElementById(id),read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))||f}catch{return f}};
function beep(f=650,d=.06){if(!sound)return;const A=window.AudioContext||window.webkitAudioContext;if(!A)return;ctx=ctx||new A();const o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(.025,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+d);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+d)}
function profile(){return{best:0,rounds:0,combo:0,...read(PROFILE,{})}}
function drawProfile(){const p=profile();if(el('pBest'))el('pBest').textContent=p.best;if(el('pRounds'))el('pRounds').textContent=p.rounds;if(el('pCombo'))el('pCombo').textContent=p.combo+'×'}
function rank(n){return n>=50?'👑 Мастер':n>=40?'💎 Алмаз':n>=30?'🥇 Золото':n>=20?'🥈 Серебро':'🥉 Бронза'}
function install(){
 const style=document.createElement('style');style.textContent=`.stats{grid-template-columns:repeat(6,1fr)!important}.comboFx{position:absolute;z-index:9;top:22px;left:50%;transform:translateX(-50%);font-size:34px;font-weight:1000;text-shadow:0 0 24px #ff3b5c;animation:cf .7s forwards}@keyframes cf{0%{opacity:0;transform:translateX(-50%) scale(.5)}35%{opacity:1;transform:translateX(-50%) scale(1.1)}100%{opacity:0}}.profileMini{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.profileMini div{padding:9px 5px;text-align:center;border:1px solid var(--line);border-radius:11px;background:#ffffff08}.profileMini span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase}.profileMini strong{display:block;margin-top:3px}.rankTag{display:block;margin-top:2px;color:var(--muted);font-size:8px;text-transform:uppercase}.soundBtn{margin-left:8px;border:1px solid var(--line);border-radius:11px;background:#ffffff0b;color:white;padding:9px;cursor:pointer}.rankBanner{margin:12px 0 0;padding:10px;border:1px solid #ffd16655;border-radius:12px;color:#ffe39a;background:#ffd16612;font-weight:900}@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)!important}}`;document.head.appendChild(style);
 const stats=document.querySelector('.stats');if(stats&&!el('comboValue')){const d=document.createElement('div');d.className='stat';d.innerHTML='<span>Серия</span><strong id="comboValue">0×</strong>';stats.appendChild(d)}
 const logo=document.querySelector('.logo');if(logo){logo.insertAdjacentHTML('beforeend','<button class="soundBtn" id="soundBtn" title="Звук">'+(sound?'🔊':'🔇')+'</button>')}
 const status=el('status');if(status){const p=document.createElement('div');p.className='profileMini';p.innerHTML='<div><span>Рекорд</span><strong id="pBest">0</strong></div><div><span>Раундов</span><strong id="pRounds">0</strong></div><div><span>Серия</span><strong id="pCombo">0×</strong></div>';status.insertAdjacentElement('afterend',p)}
 el('soundBtn')?.addEventListener('click',()=>{sound=!sound;localStorage.setItem(SOUND,sound?'on':'off');el('soundBtn').textContent=sound?'🔊':'🔇';if(sound)beep(800)})
 drawProfile();
}
function comboFx(){if(streak<5||streak%5)return;const d=document.createElement('div');d.className='comboFx';d.textContent=streak+'× COMBO';el('arena').appendChild(d);setTimeout(()=>d.remove(),750)}
function dedupe(list){const m=new Map();for(const x of list||[]){const k=String(x.name||'').trim().toLowerCase(),old=m.get(k);if(!old||x.score>old.score||x.score===old.score&&x.reaction<old.reaction)m.set(k,x)}return[...m.values()].sort((a,b)=>b.score-a.score||a.reaction-b.reaction)}
function hooks(){
 el('target')?.addEventListener('pointerdown',()=>{if(typeof running==='undefined'||!running)return;streak++;maxStreak=Math.max(maxStreak,streak);if(el('comboValue'))el('comboValue').textContent=streak+'×';beep(streak%5===0?900:680);comboFx()},true);
 el('arena')?.addEventListener('pointerdown',e=>{if(e.target===el('target')||typeof running==='undefined'||!running)return;streak=0;if(el('comboValue'))el('comboValue').textContent='0×';beep(150,.09)},true);
 el('start')?.addEventListener('click',()=>{streak=0;maxStreak=0;if(el('comboValue'))el('comboValue').textContent='0×'},true);
 if(typeof render==='function')render=(orig=>function(list){orig(dedupe(list));document.querySelectorAll('.score').forEach((row,i)=>{if(i===0)row.style.borderColor='#ffd16655';const score=Number(row.querySelector('.points')?.textContent||0),s=document.createElement('span');s.className='rankTag';s.textContent=rank(score);row.querySelector('.player')?.appendChild(s)})})(render);
 if(typeof finish==='function')finish=(orig=>async function(){const before=profile();await orig();const score=Number(el('rHits')?.textContent||0),p=profile();p.best=Math.max(p.best,score);p.rounds++;p.combo=Math.max(p.combo,maxStreak);localStorage.setItem(PROFILE,JSON.stringify(p));drawProfile();const box=el('result');if(box&&!el('rankBanner')){const b=document.createElement('div');b.id='rankBanner';b.className='rankBanner';box.insertAdjacentElement('afterend',b)}if(el('rankBanner'))el('rankBanner').textContent=rank(score)+(score>before.best?' · Новый рекорд!':'')})(finish)
}
function init(){install();hooks();setTimeout(()=>typeof loadScores==='function'&&loadScores(),0)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
