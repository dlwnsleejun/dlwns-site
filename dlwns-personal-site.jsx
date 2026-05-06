import { useState, useEffect, useRef, useCallback } from "react";

// ─── storage ──────────────────────────────────────────────────────────────────
const K = { posts:"dlwns-posts4", profile:"dlwns-profile4" };
async function load(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function save(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {} }
const toB64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });

// ─── data ─────────────────────────────────────────────────────────────────────
const CATS = [
  { id:"all",         label:"전체" },
  { id:"insight",     label:"인사이트",    color:"#0052CC" },
  { id:"inspiration", label:"인스퍼레이션",color:"#6554C0" },
  { id:"career",      label:"커리어",      color:"#00875A" },
  { id:"study",       label:"스터디",      color:"#FF8B00" },
  { id:"daily",       label:"하루기록",    color:"#DE350B" },
  { id:"photo",       label:"오늘의 사진", color:"#008DA6" },
];
const CAT = Object.fromEntries(CATS.map(c=>[c.id,c]));

const DEF_PROFILE = { name:"dlwnsleejun", tagline:"기록하는 사람", bio:"일상, 생각, 그리고 순간들을 기록합니다." , avatar:"" };
const DEF_POSTS = [
  { id:1, cat:"insight",     title:"AI 시대, 개인이 갖춰야 할 역량",    summary:"앞으로의 시대에는 어떤 능력이 중요해질까?", date:"2026-05-04", img:"", pinned:true, body:"AI의 발전은 단순 반복 업무를 대체하고 있다. 이 시대에 개인이 갖춰야 할 것은 창의성, 비판적 사고, 그리고 협업 능력이다." },
  { id:2, cat:"study",       title:"React 18 주요 변경사항 정리",       summary:"Concurrent Features와 useTransition 학습 정리.", date:"2026-05-03", img:"", pinned:false, body:"React 18에서 가장 주목할 변화는 Concurrent Mode의 정식 도입이다." },
  { id:3, cat:"daily",       title:"오늘도 커피 한 잔과 함께",           summary:"아침 루틴을 바꾸고 나서 집중력이 좋아졌다.", date:"2026-05-02", img:"", pinned:false, body:"작은 습관 하나가 하루를 바꾼다." },
  { id:4, cat:"career",      title:"첫 번째 사이드 프로젝트 회고",       summary:"혼자 만든 첫 프로젝트에서 배운 것들.", date:"2026-05-01", img:"", pinned:false, body:"기술보다 기획이 먼저였다는 걸 뼈저리게 느꼈다." },
  { id:5, cat:"inspiration", title:"디터 람스의 좋은 디자인 10원칙",    summary:"단순함이란 결국 본질만 남기는 것이다.", date:"2026-04-30", img:"", pinned:false, body:"Less but better. 이 철학은 제품을 넘어 삶에도 적용된다." },
  { id:6, cat:"photo",       title:"을지로, 오래된 골목의 감성",         summary:"우연히 들어간 골목에서 찍은 사진들.", date:"2026-04-29", img:"", pinned:false, body:"낡음이 주는 온기가 있다." },
];

function fmtDate(s){ const d=new Date(s); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }

// ─── STOCK DATA (realistic simulated) ────────────────────────────────────────
function genCandles(base, vol, days=90) {
  const data=[]; let price=base;
  const now=new Date(); now.setHours(0,0,0,0);
  for(let i=days;i>=0;i--){
    const d=new Date(now); d.setDate(d.getDate()-i);
    if(d.getDay()===0||d.getDay()===6) continue;
    const change=(Math.random()-0.48)*vol;
    const open=price;
    const close=+(price*(1+change/100)).toFixed(2);
    const high=+(Math.max(open,close)*(1+Math.random()*vol*0.003)).toFixed(2);
    const low=+(Math.min(open,close)*(1-Math.random()*vol*0.003)).toFixed(2);
    data.push({ d:d.toISOString().slice(0,10), o:open, h:high, l:low, c:close });
    price=close;
  }
  return data;
}

const SP500_STOCKS = [
  { ticker:"NVDA", name:"NVIDIA",    base:875,  vol:3.2, color:"#76b900" },
  { ticker:"GOOGL",name:"Alphabet",  base:168,  vol:2.1, color:"#4285F4" },
  { ticker:"AAPL", name:"Apple",     base:195,  vol:1.8, color:"#555" },
  { ticker:"MSFT", name:"Microsoft", base:385,  vol:1.9, color:"#00a4ef" },
  { ticker:"AMZN", name:"Amazon",    base:192,  vol:2.4, color:"#FF9900" },
  { ticker:"META", name:"Meta",      base:578,  vol:2.6, color:"#0866FF" },
  { ticker:"TSLA", name:"Tesla",     base:248,  vol:4.1, color:"#cc0000" },
  { ticker:"BRK",  name:"Berkshire", base:418,  vol:1.2, color:"#6B4226" },
  { ticker:"LLY",  name:"Eli Lilly", base:792,  vol:2.3, color:"#c0392b" },
  { ticker:"JPM",  name:"JPMorgan",  base:228,  vol:1.7, color:"#1A4080" },
];

const KOSPI_STOCKS = [
  { ticker:"005930",name:"삼성전자",  base:58000,vol:2.4, color:"#1428A0" },
  { ticker:"000660",name:"SK하이닉스",base:192000,vol:3.1,color:"#EA001E" },
  { ticker:"005380",name:"현대차",    base:24500, vol:2.2, color:"#002C5F" },
  { ticker:"051910",name:"LG화학",    base:31500, vol:2.8, color:"#A50034" },
  { ticker:"035420",name:"NAVER",     base:19800, vol:2.3, color:"#03C75A" },
  { ticker:"000270",name:"기아",      base:10800, vol:2.1, color:"#05141F" },
  { ticker:"068270",name:"셀트리온",  base:18500, vol:3.4, color:"#0099CC" },
  { ticker:"035720",name:"카카오",    base:3850,  vol:3.8, color:"#FEE500" },
  { ticker:"028260",name:"삼성물산",  base:14200, vol:1.9, color:"#1428A0" },
  { ticker:"003550",name:"LG",        base:6800,  vol:1.8, color:"#A50034" },
];

// Pre-generate candles once
const SP500_DATA = SP500_STOCKS.map(s=>({ ...s, candles:genCandles(s.base,s.vol) }));
const KOSPI_DATA = KOSPI_STOCKS.map(s=>({ ...s, candles:genCandles(s.base,s.vol) }));

function genIndexCandles(stocks, days=90){
  const len = stocks[0].candles.length;
  return Array.from({length:len},(_,i)=>{
    const avg = stocks.reduce((sum,s)=>{
      const w = 1/stocks.length;
      return sum + s.candles[i].c * w;
    },0);
    return { d:stocks[0].candles[i].d, c:avg };
  });
}

const SP500_INDEX = genIndexCandles(SP500_DATA);
const KOSPI_INDEX = genIndexCandles(KOSPI_DATA);

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Montserrat:wght@600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --primary:#0052CC;
  --text:#111;
  --sub:#444;
  --muted:#777;
  --border:#e0e0e0;
  --bg:#f5f5f5;
  --white:#fff;
  --red:#DE350B;
  --green:#00875A;
  --radius:6px;
}
body{font-family:'Noto Sans KR',sans-serif;color:var(--text);background:var(--white);font-size:14px;line-height:1.6;}
button{font-family:'Noto Sans KR',sans-serif;}

/* ── TOPBAR ── */
.topbar{background:#fff;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200;}
.topbar-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;height:60px;padding:0 24px;gap:32px;}
.logo{font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.2rem;color:#111;cursor:pointer;letter-spacing:-0.5px;display:flex;align-items:center;gap:6px;text-decoration:none;}
.logo-dot{width:8px;height:8px;background:var(--primary);border-radius:50%;}
.nav-links{display:flex;gap:4px;flex:1;}
.nav-btn{background:none;border:none;padding:8px 14px;font-size:0.82rem;font-weight:500;color:var(--muted);cursor:pointer;border-radius:var(--radius);transition:all 0.15s;}
.nav-btn:hover{color:var(--text);background:#f0f0f0;}
.nav-btn.active{color:var(--primary);background:#EDF2FF;}
.topbar-right{display:flex;align-items:center;gap:10px;margin-left:auto;}
.btn-write{background:var(--primary);color:#fff;border:none;padding:8px 18px;font-size:0.8rem;font-weight:500;cursor:pointer;border-radius:var(--radius);transition:background 0.15s;}
.btn-write:hover{background:#0043A8;}
.btn-outline{background:#fff;color:var(--text);border:1px solid var(--border);padding:7px 14px;font-size:0.8rem;cursor:pointer;border-radius:var(--radius);transition:all 0.15s;}
.btn-outline:hover{border-color:#aaa;}

/* ── HERO BANNER ── */
.hero-section{background:#fff;border-bottom:1px solid var(--border);padding:60px 0 0;}
.hero-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:flex-end;}
.hero-eyebrow{font-size:0.72rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--primary);margin-bottom:14px;}
.hero-title{font-family:'Montserrat',sans-serif;font-size:clamp(2rem,4vw,3.2rem);font-weight:700;line-height:1.15;color:#111;margin-bottom:16px;letter-spacing:-1px;}
.hero-title span{color:var(--primary);}
.hero-sub{font-size:0.9rem;color:var(--sub);line-height:1.8;margin-bottom:28px;max-width:440px;}
.hero-actions{display:flex;gap:10px;margin-bottom:48px;}
.hero-stats{display:flex;gap:0;border-top:1px solid var(--border);}
.h-stat{padding:20px 28px;border-right:1px solid var(--border);}
.h-stat:first-child{padding-left:0;}
.h-stat-n{font-family:'Montserrat',sans-serif;font-size:1.8rem;font-weight:700;color:var(--primary);line-height:1;}
.h-stat-l{font-size:0.72rem;color:var(--muted);margin-top:3px;}
.hero-right{position:relative;background:var(--bg);border-radius:12px 12px 0 0;min-height:260px;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.hero-profile-card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:24px;width:260px;box-shadow:0 8px 30px rgba(0,0,0,0.08);}
.hero-avatar{width:64px;height:64px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:12px;overflow:hidden;cursor:pointer;position:relative;}
.hero-avatar img{width:100%;height:100%;object-fit:cover;}
.hero-avatar-ov{position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:#fff;opacity:0;transition:opacity 0.2s;}
.hero-avatar:hover .hero-avatar-ov{opacity:1;}
.hero-avatar-name{font-weight:700;font-size:0.95rem;margin-bottom:3px;}
.hero-avatar-tag{font-size:0.78rem;color:var(--muted);margin-bottom:12px;}
.hero-avatar-bio{font-size:0.75rem;color:var(--sub);line-height:1.6;padding-top:12px;border-top:1px solid var(--border);}

/* ── STOCK SECTION ── */
.stock-section{background:#fff;padding:48px 0;border-bottom:1px solid var(--border);}
.stock-inner{max-width:1200px;margin:0 auto;padding:0 24px;}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;}
.section-title{font-family:'Montserrat',sans-serif;font-size:1.15rem;font-weight:700;color:#111;display:flex;align-items:center;gap:8px;}
.section-title-dot{width:6px;height:6px;background:var(--primary);border-radius:50%;}
.section-sub{font-size:0.78rem;color:var(--muted);}
.stock-tabs{display:flex;gap:4px;}
.stock-tab{padding:6px 14px;font-size:0.78rem;font-weight:500;border:1px solid var(--border);background:#fff;color:var(--muted);cursor:pointer;border-radius:var(--radius);transition:all 0.15s;}
.stock-tab.active{background:var(--primary);color:#fff;border-color:var(--primary);}

.index-summary{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;}
.index-card{background:var(--bg);border-radius:var(--radius);padding:16px 20px;display:flex;align-items:center;gap:16px;border:1px solid var(--border);}
.index-label{font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:3px;}
.index-value{font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:700;color:#111;}
.index-change{font-size:0.8rem;font-weight:600;margin-top:2px;}
.up{color:var(--red);}
.dn{color:var(--green);}

/* chart canvas */
.chart-wrap{background:#fff;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:20px;padding:16px;}
.chart-label{font-size:0.72rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
canvas{width:100%!important;display:block;}

.stocks-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}
.stock-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:14px;cursor:pointer;transition:all 0.15s;}
.stock-card:hover{border-color:var(--primary);box-shadow:0 2px 12px rgba(0,82,204,0.08);}
.stock-card.selected{border-color:var(--primary);background:#EDF2FF;}
.stock-ticker{font-family:'Montserrat',sans-serif;font-size:0.78rem;font-weight:700;color:var(--primary);margin-bottom:2px;}
.stock-name{font-size:0.72rem;color:var(--muted);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.stock-price{font-family:'Montserrat',sans-serif;font-size:0.92rem;font-weight:700;color:#111;}
.stock-chg{font-size:0.72rem;font-weight:600;margin-top:1px;}
.mini-canvas{display:block;width:100%;margin-top:6px;}

/* ── MAIN CONTENT ── */
.content-section{background:var(--bg);padding:40px 0;}
.content-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:1fr 300px;gap:28px;}

/* featured */
.featured{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:grid;grid-template-columns:1fr 260px;cursor:pointer;margin-bottom:20px;transition:box-shadow 0.15s;}
.featured:hover{box-shadow:0 4px 20px rgba(0,0,0,0.07);}
.featured-body{padding:28px;}
.f-cat{font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;}
.f-title{font-size:1.15rem;font-weight:700;line-height:1.4;margin-bottom:10px;}
.f-sum{font-size:0.83rem;color:var(--sub);line-height:1.75;margin-bottom:14px;}
.f-meta{font-size:0.72rem;color:var(--muted);display:flex;align-items:center;gap:10px;}
.featured-img{background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:3rem;overflow:hidden;}
.featured-img img{width:100%;height:100%;object-fit:cover;}

/* post grid */
.post-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.pc{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:box-shadow 0.15s;}
.pc:hover{box-shadow:0 4px 16px rgba(0,0,0,0.07);}
.pc-thumb{height:140px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:2rem;overflow:hidden;}
.pc-thumb img{width:100%;height:100%;object-fit:cover;}
.pc-body{padding:14px;}
.pc-cat{font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:5px;}
.pc-title{font-size:0.88rem;font-weight:700;line-height:1.4;margin-bottom:5px;}
.pc-sum{font-size:0.76rem;color:var(--sub);line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:8px;}
.pc-meta{font-size:0.7rem;color:var(--muted);display:flex;justify-content:space-between;align-items:center;}
.row-actions{display:flex;gap:5px;opacity:0;transition:opacity 0.15s;}
.pc:hover .row-actions,.featured:hover .f-act{opacity:1;}
.f-act{opacity:0;transition:opacity 0.15s;}
.btn-sm{background:#fff;border:1px solid var(--border);padding:4px 10px;font-size:0.68rem;cursor:pointer;border-radius:3px;color:var(--text);}
.btn-sm:hover{border-color:#aaa;}
.btn-del-sm{background:#fff;border:1px solid #fcc;color:var(--red);padding:4px 8px;font-size:0.68rem;cursor:pointer;border-radius:3px;}

/* sidebar */
.sidebar{display:flex;flex-direction:column;gap:16px;}
.side-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.side-head{padding:13px 16px;border-bottom:1px solid var(--border);font-size:0.8rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;}
.side-more{font-size:0.72rem;color:var(--primary);font-weight:400;cursor:pointer;}
.side-more:hover{text-decoration:underline;}
.side-row{padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:10px;align-items:flex-start;transition:background 0.1s;}
.side-row:last-child{border-bottom:none;}
.side-row:hover{background:#f5f8ff;}
.side-n{font-family:'Montserrat',sans-serif;font-size:0.9rem;font-weight:700;color:var(--border);width:22px;flex-shrink:0;padding-top:1px;}
.side-t{font-size:0.78rem;font-weight:500;line-height:1.4;margin-bottom:2px;}
.side-m{font-size:0.68rem;color:var(--muted);}
.cat-chips{padding:12px 16px;display:flex;flex-wrap:wrap;gap:7px;}
.cat-chip{padding:5px 11px;border-radius:50px;font-size:0.73rem;font-weight:500;border:1px solid var(--border);color:var(--sub);cursor:pointer;background:#fff;transition:all 0.15s;}
.cat-chip:hover{border-color:var(--primary);color:var(--primary);}
.cat-chip.active{background:var(--primary);color:#fff;border-color:var(--primary);}

/* detail */
.detail-page{max-width:780px;margin:0 auto;padding:40px 24px;}
.detail-back{font-size:0.78rem;color:var(--primary);cursor:pointer;margin-bottom:20px;display:inline-flex;align-items:center;gap:4px;}
.detail-back:hover{text-decoration:underline;}
.detail-cat{font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;}
.detail-title{font-size:1.6rem;font-weight:700;line-height:1.3;margin-bottom:10px;}
.detail-meta{font-size:0.75rem;color:var(--muted);padding-bottom:20px;border-bottom:1px solid var(--border);margin-bottom:24px;display:flex;align-items:center;gap:10px;}
.detail-img{width:100%;max-height:400px;object-fit:cover;border-radius:var(--radius);margin-bottom:24px;}
.detail-body{font-size:0.95rem;line-height:1.9;color:#222;}

/* modal */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:#fff;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;border-radius:var(--radius);}
.modal-head{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;}
.modal-title{font-size:0.95rem;font-weight:700;}
.modal-x{background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);padding:2px 6px;line-height:1;}
.modal-x:hover{color:#111;}
.modal-body{padding:22px;}
.modal-foot{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;}
.fg{margin-bottom:14px;}
.fg label{display:block;font-size:0.72rem;font-weight:500;color:var(--sub);margin-bottom:5px;}
.fg input,.fg textarea,.fg select{width:100%;border:1px solid var(--border);padding:9px 12px;font-size:0.84rem;font-family:'Noto Sans KR',sans-serif;color:#111;outline:none;border-radius:var(--radius);transition:border-color 0.15s;resize:vertical;background:#fff;}
.fg input:focus,.fg textarea:focus,.fg select:focus{border-color:var(--primary);}
.fg input::placeholder,.fg textarea::placeholder{color:#bbb;}

/* empty */
.empty{text-align:center;padding:60px 0;color:var(--muted);}

/* footer */
footer{border-top:1px solid var(--border);padding:24px;text-align:center;font-size:0.75rem;color:var(--muted);}
footer b{color:var(--primary);}

@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fade{animation:fadeIn 0.3s ease both;}
`;

// ─── Mini sparkline ───────────────────────────────────────────────────────────
function Sparkline({ candles, color="#0052CC", width=100, height=32 }) {
  const ref = useRef();
  useEffect(()=>{
    const c = ref.current; if(!c) return;
    const ctx = c.getContext('2d');
    const pts = candles.slice(-30);
    const vals = pts.map(p=>p.c);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const pad = 2;
    const scaleX = (width-pad*2)/(pts.length-1);
    const scaleY = mx===mn ? 0 : (height-pad*2)/(mx-mn);
    ctx.clearRect(0,0,width,height);
    ctx.beginPath();
    pts.forEach((p,i)=>{
      const x = pad + i*scaleX;
      const y = pad + (mx-p.c)*scaleY;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke();
  },[candles,color]);
  return <canvas ref={ref} width={width} height={height} className="mini-canvas" style={{height:height+'px'}} />;
}

// ─── Main chart ───────────────────────────────────────────────────────────────
function MainChart({ candles, color="#0052CC", label="" }) {
  const ref = useRef();
  useEffect(()=>{
    const c = ref.current; if(!c) return;
    const ctx = c.getContext('2d');
    const W=c.offsetWidth||800, H=200;
    c.width=W; c.height=H;
    const pts = candles;
    const vals = pts.map(p=>p.c);
    const mn = Math.min(...vals)*0.998, mx = Math.max(...vals)*1.002;
    const padL=50, padR=16, padT=16, padB=28;
    const W2=W-padL-padR, H2=H-padT-padB;
    ctx.clearRect(0,0,W,H);
    // grid
    ctx.strokeStyle='#f0f0f0'; ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=padT+H2*(1-i/4);
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
      const val=mn+(mx-mn)*(i/4);
      ctx.fillStyle='#aaa'; ctx.font='10px Montserrat,monospace'; ctx.textAlign='right';
      ctx.fillText(val>=1000?Math.round(val).toLocaleString():val.toFixed(2),padL-5,y+3);
    }
    // x labels
    const step=Math.floor(pts.length/6);
    pts.forEach((p,i)=>{
      if(i%step===0){
        const x=padL+W2*(i/(pts.length-1));
        ctx.fillStyle='#aaa'; ctx.font='9px Noto Sans KR,sans-serif'; ctx.textAlign='center';
        ctx.fillText(p.d.slice(5),x,H-6);
      }
    });
    // fill
    const grad=ctx.createLinearGradient(0,padT,0,H-padB);
    grad.addColorStop(0,color+'33'); grad.addColorStop(1,color+'00');
    ctx.beginPath();
    pts.forEach((p,i)=>{
      const x=padL+W2*(i/(pts.length-1));
      const y=padT+H2*(1-(p.c-mn)/(mx-mn));
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.lineTo(padL+W2,H-padB); ctx.lineTo(padL,H-padB); ctx.closePath();
    ctx.fillStyle=grad; ctx.fill();
    // line
    ctx.beginPath();
    pts.forEach((p,i)=>{
      const x=padL+W2*(i/(pts.length-1));
      const y=padT+H2*(1-(p.c-mn)/(mx-mn));
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke();
  },[candles,color]);
  return <canvas ref={ref} style={{width:'100%',height:'200px',display:'block'}} />;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [posts,setPosts]     = useState([]);
  const [profile,setProfile] = useState(DEF_PROFILE);
  const [activeCat,setCat]   = useState("all");
  const [modal,setModal]     = useState(null);
  const [editing,setEditing] = useState(null);
  const [detail,setDetail]   = useState(null);
  const [loading,setLoading] = useState(true);
  const [market,setMarket]   = useState("sp500"); // 'sp500'|'kospi'
  const [selStock,setSelStock] = useState(0);
  const [form,setForm] = useState({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});
  const [prForm,setPrForm] = useState({...DEF_PROFILE});
  const imgRef=useRef(); const avatarRef=useRef();

  useEffect(()=>{
    (async()=>{
      const [p,ps]=await Promise.all([load(K.profile),load(K.posts)]);
      if(p) setProfile(p);
      setPosts(ps||DEF_POSTS);
      setLoading(false);
    })();
  },[]);

  const filtered = activeCat==="all" ? posts : posts.filter(p=>p.cat===activeCat);
  const pinned = filtered.find(p=>p.pinned)||filtered[0];
  const rest = filtered.filter(p=>p!==pinned);
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  const stocks = market==="sp500" ? SP500_DATA : KOSPI_DATA;
  const indexCandles = market==="sp500" ? SP500_INDEX : KOSPI_INDEX;
  const cur = stocks[selStock];
  const curLast = cur.candles[cur.candles.length-1].c;
  const curPrev = cur.candles[cur.candles.length-2].c;
  const curChg = ((curLast-curPrev)/curPrev*100).toFixed(2);
  const idxLast = indexCandles[indexCandles.length-1].c;
  const idxPrev = indexCandles[indexCandles.length-2].c;
  const idxChg = ((idxLast-idxPrev)/idxPrev*100).toFixed(2);

  const savePost = async()=>{
    const today=new Date().toISOString().slice(0,10);
    const u = editing
      ? posts.map(p=>p.id===editing.id?{...p,...form}:p)
      : [{id:Date.now(),...form,date:today},...posts];
    setPosts(u); await save(K.posts,u);
    setModal(null); setEditing(null);
    setForm({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});
  };
  const delPost=async(id)=>{ const u=posts.filter(p=>p.id!==id); setPosts(u); await save(K.posts,u); if(detail?.id===id){setDetail(null);} };
  const openEdit=p=>{ setEditing(p); setForm({title:p.title,summary:p.summary,cat:p.cat,body:p.body||"",img:p.img||"",pinned:p.pinned||false}); setModal('write'); };
  const saveProfile=async()=>{ setProfile(prForm); await save(K.profile,prForm); setModal(null); };
  const handleImg=async e=>{ const f=e.target.files[0]; if(!f)return; setForm({...form,img:await toB64(f)}); };
  const handleAvatar=async e=>{ const f=e.target.files[0]; if(!f)return; const u={...profile,avatar:await toB64(f)}; setProfile(u); await save(K.profile,u); };

  const EMO={insight:'💡',inspiration:'✨',career:'💼',study:'📚',daily:'☀️',photo:'📷'};

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888'}}>불러오는 중...</div>;

  return (
    <>
      <style>{CSS}</style>

      {/* ── TOPBAR ── */}
      <header className="topbar">
        <div className="topbar-inner">
          <a className="logo" onClick={()=>{setDetail(null);setModal(null);setCat("all");}}>
            <span className="logo-dot"/>dlwnsleejun
          </a>
          <nav className="nav-links">
            {CATS.map(c=>(
              <button key={c.id} className={`nav-btn ${activeCat===c.id?'active':''}`}
                onClick={()=>{setCat(c.id);setDetail(null);}}>
                {c.label}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <button className="btn-outline" onClick={()=>{setPrForm({...profile});setModal('profile');}}>프로필</button>
            <button className="btn-write" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});setModal('write');}}>+ 글쓰기</button>
          </div>
        </div>
      </header>

      {/* ── DETAIL ── */}
      {detail && !modal && (
        <div className="fade" style={{background:'#fff',minHeight:'100vh'}}>
          <div className="detail-page">
            <div className="detail-back" onClick={()=>setDetail(null)}>← 목록으로 돌아가기</div>
            <div className="detail-cat" style={{color:CAT[detail.cat]?.color}}>{CAT[detail.cat]?.label}</div>
            <h1 className="detail-title">{detail.title}</h1>
            <div className="detail-meta">
              <span>{fmtDate(detail.date)}</span>
              <button className="btn-sm" onClick={()=>openEdit(detail)}>수정</button>
              <button className="btn-del-sm" onClick={()=>delPost(detail.id)}>삭제</button>
            </div>
            {detail.img && <img className="detail-img" src={detail.img} alt=""/>}
            <div className="detail-body">{detail.body||detail.summary}</div>
          </div>
        </div>
      )}

      {!detail && (<>

        {/* ── HERO ── */}
        <section className="hero-section">
          <div className="hero-inner">
            <div>
              <div className="hero-eyebrow">www.dlwnsleejun.com</div>
              <h1 className="hero-title">나의 생각과<br/>기록을 담는<br/><span>공간</span></h1>
              <p className="hero-sub">{profile.bio}</p>
              <div className="hero-actions">
                <button className="btn-write" style={{padding:'10px 24px',fontSize:'0.85rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});setModal('write');}}>+ 새 글 작성</button>
                <button className="btn-outline" style={{padding:'10px 18px',fontSize:'0.85rem'}} onClick={()=>{setPrForm({...profile});setModal('profile');}}>프로필 편집</button>
              </div>
              <div className="hero-stats">
                {CATS.slice(1).map(c=>(
                  <div className="h-stat" key={c.id} style={{cursor:'pointer'}} onClick={()=>setCat(c.id)}>
                    <div className="h-stat-n">{posts.filter(p=>p.cat===c.id).length}</div>
                    <div className="h-stat-l">{c.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hero-right">
              <div className="hero-profile-card">
                <div className="hero-avatar" onClick={()=>avatarRef.current.click()}>
                  {profile.avatar?<img src={profile.avatar} alt=""/>:profile.name[0]?.toUpperCase()}
                  <div className="hero-avatar-ov">변경</div>
                  <input ref={avatarRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleAvatar}/>
                </div>
                <div className="hero-avatar-name">{profile.name}</div>
                <div className="hero-avatar-tag">{profile.tagline}</div>
                <div className="hero-avatar-bio">{profile.bio}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STOCK SECTION ── */}
        <section className="stock-section">
          <div className="stock-inner">
            <div className="section-head">
              <div className="section-title">
                <span className="section-title-dot"/>
                마켓 인사이트
                <span style={{fontSize:'0.72rem',color:'var(--muted)',fontFamily:'Noto Sans KR',fontWeight:400,marginLeft:4}}>시뮬레이션 데이터</span>
              </div>
              <div className="stock-tabs">
                <button className={`stock-tab ${market==='sp500'?'active':''}`} onClick={()=>{setMarket('sp500');setSelStock(0);}}>S&P 500</button>
                <button className={`stock-tab ${market==='kospi'?'active':''}`} onClick={()=>{setMarket('kospi');setSelStock(0);}}>KOSPI</button>
              </div>
            </div>

            {/* index summary */}
            <div className="index-summary">
              <div className="index-card">
                <div>
                  <div className="index-label">{market==='sp500'?'S&P 500 Index':'KOSPI Index'}</div>
                  <div className="index-value">{market==='sp500'?idxLast.toFixed(0):Math.round(idxLast).toLocaleString()}</div>
                  <div className={`index-change ${parseFloat(idxChg)>=0?'up':'dn'}`}>{parseFloat(idxChg)>=0?'▲':'▼'} {Math.abs(idxChg)}%</div>
                </div>
              </div>
              <div className="index-card">
                <div>
                  <div className="index-label">선택 종목: {cur.ticker}</div>
                  <div className="index-value">{market==='sp500'?'$':''}{curLast>=1000?Math.round(curLast).toLocaleString():curLast.toFixed(2)}{market==='kospi'?'원':''}</div>
                  <div className={`index-change ${parseFloat(curChg)>=0?'up':'dn'}`}>{parseFloat(curChg)>=0?'▲':'▼'} {Math.abs(curChg)}%</div>
                </div>
              </div>
            </div>

            {/* main chart */}
            <div className="chart-wrap">
              <div className="chart-label">{cur.name} ({cur.ticker}) — 최근 90일</div>
              <MainChart key={`${market}-${selStock}`} candles={cur.candles} color={cur.color} />
            </div>

            {/* stock grid */}
            <div className="stocks-grid">
              {stocks.map((s,i)=>{
                const last=s.candles[s.candles.length-1].c;
                const prev=s.candles[s.candles.length-2].c;
                const chg=((last-prev)/prev*100).toFixed(2);
                const up=parseFloat(chg)>=0;
                return (
                  <div key={s.ticker} className={`stock-card ${selStock===i?'selected':''}`} onClick={()=>setSelStock(i)}>
                    <div className="stock-ticker" style={{color:s.color}}>{s.ticker}</div>
                    <div className="stock-name">{s.name}</div>
                    <div className="stock-price">{market==='sp500'?'$':''}{last>=1000?Math.round(last).toLocaleString():last.toFixed(2)}</div>
                    <div className={`stock-chg ${up?'up':'dn'}`}>{up?'▲':'▼'} {Math.abs(chg)}%</div>
                    <Sparkline candles={s.candles} color={up?'#DE350B':'#00875A'} width={120} height={28}/>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── POSTS ── */}
        <section className="content-section">
          <div className="content-inner fade">
            <div>
              {pinned && (
                <div className="featured" onClick={()=>setDetail(pinned)}>
                  <div className="featured-body">
                    <div className="f-cat" style={{color:CAT[pinned.cat]?.color}}>{CAT[pinned.cat]?.label}</div>
                    <div className="f-title">{pinned.title}</div>
                    <div className="f-sum">{pinned.summary}</div>
                    <div className="f-meta">
                      <span>{fmtDate(pinned.date)}</span>
                      <span className="f-act" onClick={e=>e.stopPropagation()} style={{display:'flex',gap:5}}>
                        <button className="btn-sm" onClick={()=>openEdit(pinned)}>수정</button>
                        <button className="btn-del-sm" onClick={()=>delPost(pinned.id)}>삭제</button>
                      </span>
                    </div>
                  </div>
                  <div className="featured-img">{pinned.img?<img src={pinned.img} alt=""/>:EMO[pinned.cat]}</div>
                </div>
              )}
              {rest.length>0?(
                <div className="post-grid">
                  {rest.map(p=>(
                    <div key={p.id} className="pc" onClick={()=>setDetail(p)}>
                      <div className="pc-thumb">{p.img?<img src={p.img} alt=""/>:EMO[p.cat]}</div>
                      <div className="pc-body">
                        <div className="pc-cat" style={{color:CAT[p.cat]?.color}}>{CAT[p.cat]?.label}</div>
                        <div className="pc-title">{p.title}</div>
                        <div className="pc-sum">{p.summary}</div>
                        <div className="pc-meta">
                          <span>{fmtDate(p.date)}</span>
                          <div className="row-actions" onClick={e=>e.stopPropagation()}>
                            <button className="btn-sm" onClick={()=>openEdit(p)}>수정</button>
                            <button className="btn-del-sm" onClick={()=>delPost(p.id)}>삭제</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ):!pinned&&<div className="empty"><div style={{fontSize:'2rem',marginBottom:10}}>📝</div><div>아직 글이 없어요. 첫 번째 글을 작성해보세요!</div></div>}
            </div>

            {/* sidebar */}
            <aside className="sidebar">
              <div className="side-card">
                <div style={{padding:'18px 16px',textAlign:'center',borderBottom:'1px solid var(--border)'}}>
                  <div style={{width:52,height:52,borderRadius:'50%',background:'var(--primary)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontWeight:700,fontSize:'1.2rem',color:'#fff',overflow:'hidden'}}>
                    {profile.avatar?<img src={profile.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:profile.name[0]?.toUpperCase()}
                  </div>
                  <div style={{fontWeight:700,fontSize:'0.9rem',marginBottom:2}}>{profile.name}</div>
                  <div style={{fontSize:'0.75rem',color:'var(--muted)'}}>{profile.tagline}</div>
                </div>
                <div style={{padding:'14px 16px'}}>
                  <div style={{fontSize:'0.75rem',color:'var(--sub)',lineHeight:1.65}}>{profile.bio}</div>
                </div>
              </div>

              <div className="side-card">
                <div className="side-head">최근 게시글 <span className="side-more" onClick={()=>setCat("all")}>전체보기</span></div>
                {recent.map((p,i)=>(
                  <div key={p.id} className="side-row" onClick={()=>setDetail(p)}>
                    <div className="side-n">{String(i+1).padStart(2,'0')}</div>
                    <div>
                      <div className="side-t">{p.title}</div>
                      <div className="side-m" style={{color:CAT[p.cat]?.color}}>{CAT[p.cat]?.label} · {fmtDate(p.date)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="side-card">
                <div className="side-head">카테고리</div>
                <div className="cat-chips">
                  {CATS.slice(1).map(c=>(
                    <button key={c.id} className={`cat-chip ${activeCat===c.id?'active':''}`}
                      style={activeCat===c.id?{}:{}}
                      onClick={()=>setCat(c.id)}>
                      {c.label} <span style={{fontWeight:700,color:activeCat===c.id?'#fff':c.color}}>{posts.filter(p=>p.cat===c.id).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </>)}

      <footer><b>dlwnsleejun.com</b> — 나만의 기록 공간</footer>

      {/* WRITE MODAL */}
      {modal==='write'&&(
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editing?'글 수정':'새 글 작성'}</div>
              <button className="modal-x" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="fg"><label>카테고리</label>
                <select value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})}>
                  {CATS.slice(1).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="fg"><label>제목</label><input type="text" value={form.title} placeholder="제목을 입력하세요" onChange={e=>setForm({...form,title:e.target.value})}/></div>
              <div className="fg"><label>요약</label><textarea rows={2} value={form.summary} placeholder="한 줄 요약" onChange={e=>setForm({...form,summary:e.target.value})}/></div>
              <div className="fg"><label>본문</label><textarea rows={6} value={form.body} placeholder="내용을 자유롭게 작성하세요" onChange={e=>setForm({...form,body:e.target.value})}/></div>
              <div className="fg">
                <label>대표 이미지 (선택)</label>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <button className="btn-outline" style={{padding:'6px 12px',fontSize:'0.76rem'}} onClick={()=>imgRef.current.click()}>파일 선택</button>
                  {form.img&&<span style={{fontSize:'0.72rem',color:'var(--green)'}}>✓ 업로드됨</span>}
                </div>
                {form.img&&<img src={form.img} alt="" style={{width:'100%',maxHeight:140,objectFit:'cover',marginTop:8,borderRadius:4}}/>}
                <input ref={imgRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImg}/>
              </div>
              <div className="fg" style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="checkbox" id="pin" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})} style={{width:'auto',margin:0}}/>
                <label htmlFor="pin" style={{margin:0,cursor:'pointer',fontSize:'0.82rem'}}>대표 글로 상단에 고정</label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-outline" onClick={()=>setModal(null)}>취소</button>
              <button className="btn-write" onClick={savePost} style={{opacity:form.title?1:0.4}} disabled={!form.title}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* PROFILE MODAL */}
      {modal==='profile'&&(
        <div className="modal-bg" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">프로필 편집</div>
              <button className="modal-x" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {[['name','이름'],['tagline','한 줄 소개'],['bio','상세 소개']].map(([k,lb])=>(
                <div className="fg" key={k}><label>{lb}</label><input type="text" value={prForm[k]} onChange={e=>setPrForm({...prForm,[k]:e.target.value})}/></div>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn-outline" onClick={()=>setModal(null)}>취소</button>
              <button className="btn-write" onClick={saveProfile}>저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
