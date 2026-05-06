import { useState, useEffect, useRef, useCallback } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────────
const K = { posts:"dlwns-posts4", profile:"dlwns-profile4" };
async function load(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function save(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {} }
const toB64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });

// ─── 브라우저 히스토리 헬퍼 ───────────────────────────────────────────────────
// state를 URL에 저장하고 뒤로가기/앞으로가기를 지원
function pushState(state) {
  const params = new URLSearchParams();
  if (state.cat && state.cat !== "all") params.set("cat", state.cat);
  if (state.postId) params.set("post", String(state.postId));
  const search = params.toString() ? "?" + params.toString() : "";
  window.history.pushState(state, "", window.location.pathname + search);
}

function readState() {
  const params = new URLSearchParams(window.location.search);
  return {
    cat: params.get("cat") || "all",
    postId: params.get("post") ? Number(params.get("post")) : null,
  };
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const CATS = [
  { id:"all",         label:"전체" },
  { id:"insight",     label:"인사이트",    color:"#0052CC", desc:"생각과 아이디어를 정리합니다" },
  { id:"inspiration", label:"인스퍼레이션",color:"#6554C0", desc:"영감을 주는 것들을 기록합니다" },
  { id:"career",      label:"커리어",      color:"#00875A", desc:"직무와 성장에 관한 이야기" },
  { id:"study",       label:"스터디",      color:"#FF8B00", desc:"배움을 정리하고 공유합니다" },
  { id:"daily",       label:"하루기록",    color:"#DE350B", desc:"일상의 소소한 순간들" },
  { id:"photo",       label:"오늘의 사진", color:"#008DA6", desc:"렌즈로 담은 순간들" },
];
const CAT = Object.fromEntries(CATS.map(c=>[c.id,c]));

const DEF_PROFILE = { name:"dlwnsleejun", tagline:"기록하는 사람", bio:"일상, 생각, 그리고 순간들을 기록합니다.", avatar:"" };
const DEF_POSTS = [
  { id:1, cat:"insight",     title:"AI 시대, 개인이 갖춰야 할 역량",    summary:"앞으로의 시대에는 어떤 능력이 중요해질까?", date:"2026-05-04", img:"", pinned:true, body:"AI의 발전은 단순 반복 업무를 대체하고 있다." },
  { id:2, cat:"study",       title:"React 18 주요 변경사항 정리",       summary:"Concurrent Features와 useTransition.", date:"2026-05-03", img:"", pinned:false, body:"React 18의 가장 주목할 변화." },
  { id:3, cat:"daily",       title:"오늘도 커피 한 잔과 함께",           summary:"아침 루틴을 바꾸고 집중력 향상.", date:"2026-05-02", img:"", pinned:false, body:"작은 습관이 하루를 바꾼다." },
  { id:4, cat:"career",      title:"첫 사이드 프로젝트 회고",            summary:"혼자 만든 첫 프로젝트에서 배운 것들.", date:"2026-05-01", img:"", pinned:false, body:"기술보다 기획이 먼저였다." },
  { id:5, cat:"inspiration", title:"디터 람스의 좋은 디자인 10원칙",    summary:"단순함이란 본질만 남기는 것.", date:"2026-04-30", img:"", pinned:false, body:"Less but better." },
  { id:6, cat:"photo",       title:"을지로, 오래된 골목의 감성",         summary:"우연히 들어간 골목의 사진들.", date:"2026-04-29", img:"", pinned:false, body:"낡음이 주는 온기." },
];

function fmtDate(s){ const d=new Date(s); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }

// ─── Stock Data ───────────────────────────────────────────────────────────────
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
const SP500_DATA = SP500_STOCKS.map(s=>({ ...s, candles:genCandles(s.base,s.vol) }));
const KOSPI_DATA = KOSPI_STOCKS.map(s=>({ ...s, candles:genCandles(s.base,s.vol) }));
function genIndexCandles(stocks){
  const len=stocks[0].candles.length;
  return Array.from({length:len},(_,i)=>({ d:stocks[0].candles[i].d, c:stocks.reduce((s,st)=>s+st.candles[i].c/stocks.length,0) }));
}
const SP500_INDEX = genIndexCandles(SP500_DATA);
const KOSPI_INDEX = genIndexCandles(KOSPI_DATA);

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Montserrat:wght@600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--primary:#0052CC;--text:#111;--sub:#444;--muted:#777;--border:#e0e0e0;--bg:#f7f8fa;--white:#fff;--red:#DE350B;--green:#00875A;--radius:8px;}
body{font-family:'Noto Sans KR',sans-serif;color:var(--text);background:var(--white);font-size:14px;line-height:1.6;}
button{font-family:'Noto Sans KR',sans-serif;}
.header{background:#fff;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200;}
.header-inner{max-width:1280px;margin:0 auto;display:flex;align-items:center;height:64px;padding:0 32px;gap:40px;}
.logo{font-family:'Montserrat',sans-serif;font-weight:800;font-size:1.3rem;color:#111;cursor:pointer;letter-spacing:-0.5px;}
.nav{display:flex;gap:0;flex:1;}
.nav-link{padding:10px 18px;font-size:0.85rem;font-weight:500;color:var(--muted);background:none;border:none;cursor:pointer;transition:all 0.15s;border-radius:4px;}
.nav-link:hover{color:var(--text);background:#f5f5f5;}
.nav-link.active{color:var(--primary);font-weight:700;}
.header-actions{display:flex;gap:8px;margin-left:auto;}
.btn{padding:9px 18px;font-size:0.82rem;font-weight:500;border-radius:var(--radius);cursor:pointer;border:none;transition:all 0.15s;}
.btn-outline{background:#fff;color:var(--text);border:1px solid var(--border);}
.btn-outline:hover{border-color:#999;}
.btn-primary{background:var(--primary);color:#fff;}
.btn-primary:hover{background:#0043A8;}
.hero{background:linear-gradient(135deg,#0052CC 0%,#0066FF 50%,#3385FF 100%);padding:80px 0 100px;position:relative;overflow:hidden;}
.hero::before{content:'';position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 15l15 15-15 15-15-15z' fill='%23fff' opacity='0.03'/%3E%3C/svg%3E");}
.hero-inner{max-width:1280px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:1fr 380px;gap:60px;align-items:center;position:relative;z-index:1;}
.hero-content h1{font-family:'Montserrat',sans-serif;font-size:clamp(2.2rem,4vw,3.8rem);font-weight:800;color:#fff;line-height:1.2;margin-bottom:20px;letter-spacing:-1px;}
.hero-content h1 span{opacity:0.8;}
.hero-content p{font-size:1.05rem;color:rgba(255,255,255,0.85);line-height:1.8;margin-bottom:32px;}
.hero-actions{display:flex;gap:12px;}
.btn-lg{padding:14px 32px;font-size:0.92rem;font-weight:600;}
.btn-white{background:#fff;color:var(--primary);}
.btn-white:hover{background:#f0f0f0;}
.btn-outline-white{background:transparent;color:#fff;border:2px solid rgba(255,255,255,0.5);}
.btn-outline-white:hover{border-color:#fff;background:rgba(255,255,255,0.1);}
.hero-card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.15);}
.hero-avatar{width:80px;height:80px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;color:#fff;margin:0 auto 16px;overflow:hidden;cursor:pointer;position:relative;}
.hero-avatar img{width:100%;height:100%;object-fit:cover;}
.hero-avatar-ov{position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#fff;opacity:0;transition:opacity 0.2s;}
.hero-avatar:hover .hero-avatar-ov{opacity:1;}
.hero-card h2{font-size:1.15rem;font-weight:700;text-align:center;margin-bottom:4px;}
.hero-card p{font-size:0.82rem;color:var(--muted);text-align:center;margin-bottom:20px;}
.hero-card-bio{font-size:0.85rem;color:var(--sub);line-height:1.75;padding-top:20px;border-top:1px solid var(--border);}
.cat-hero{background:#fff;border-bottom:1px solid var(--border);padding:52px 0;}
.cat-hero-inner{max-width:1280px;margin:0 auto;padding:0 32px;}
.cat-hero-eyebrow{font-size:0.75rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;}
.cat-hero-title{font-family:'Montserrat',sans-serif;font-size:2.4rem;font-weight:800;margin-bottom:10px;letter-spacing:-1px;}
.cat-hero-desc{font-size:1rem;color:var(--sub);margin-bottom:22px;}
.cat-hero-stats{display:flex;gap:16px;}
.cat-stat{display:flex;align-items:center;gap:10px;padding:12px 20px;background:var(--bg);border-radius:var(--radius);border:1px solid var(--border);}
.cat-stat-num{font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:700;line-height:1;}
.cat-stat-label{font-size:0.75rem;color:var(--muted);margin-top:2px;}
.stats-bar{background:#fff;border-bottom:1px solid var(--border);}
.stats-inner{max-width:1280px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:repeat(6,1fr);}
.stat{padding:24px 20px;border-right:1px solid var(--border);text-align:center;cursor:pointer;transition:background 0.15s;}
.stat:last-child{border-right:none;}
.stat:hover{background:#f9f9f9;}
.stat-num{font-family:'Montserrat',sans-serif;font-size:2rem;font-weight:700;color:var(--primary);line-height:1;margin-bottom:6px;}
.stat-label{font-size:0.75rem;color:var(--muted);font-weight:500;}
.stock-section{background:var(--bg);padding:60px 0;border-bottom:1px solid var(--border);}
.stock-inner{max-width:1280px;margin:0 auto;padding:0 32px;}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;}
.section-title{font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:700;color:#111;}
.section-sub{font-size:0.8rem;color:var(--muted);margin-top:4px;}
.market-tabs{display:flex;gap:8px;}
.market-tab{padding:8px 20px;font-size:0.82rem;font-weight:600;border:2px solid var(--border);background:#fff;color:var(--text);cursor:pointer;border-radius:var(--radius);transition:all 0.15s;}
.market-tab.active{background:var(--primary);color:#fff;border-color:var(--primary);}
.index-cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;}
.index-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;}
.idx-info h3{font-size:0.75rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.idx-val{font-family:'Montserrat',sans-serif;font-size:1.8rem;font-weight:700;color:#111;}
.idx-chg{font-size:0.88rem;font-weight:600;margin-top:4px;}
.up{color:var(--red);}
.dn{color:var(--green);}
.chart-box{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:24px;}
.chart-label{font-size:0.78rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:16px;}
canvas{width:100%!important;display:block;}
.stocks-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;}
.stock-card{background:#fff;border:2px solid var(--border);border-radius:var(--radius);padding:16px;cursor:pointer;transition:all 0.2s;}
.stock-card:hover{border-color:var(--primary);box-shadow:0 4px 16px rgba(0,82,204,0.1);}
.stock-card.selected{border-color:var(--primary);background:#EDF2FF;}
.stock-ticker{font-family:'Montserrat',sans-serif;font-size:0.82rem;font-weight:700;margin-bottom:2px;}
.stock-name{font-size:0.75rem;color:var(--muted);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.stock-price{font-family:'Montserrat',sans-serif;font-size:1rem;font-weight:700;color:#111;}
.stock-chg{font-size:0.75rem;font-weight:600;margin-top:2px;}
.mini-canvas{display:block;width:100%;margin-top:8px;}
.content-section{background:#fff;padding:60px 0;}
.content-inner{max-width:1280px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:1fr 320px;gap:40px;}
.content-full{max-width:1280px;margin:0 auto;padding:0 32px;}
.featured{background:#fff;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;display:grid;grid-template-columns:1fr 300px;cursor:pointer;margin-bottom:28px;transition:all 0.2s;}
.featured:hover{border-color:var(--primary);box-shadow:0 6px 24px rgba(0,0,0,0.08);}
.featured-body{padding:32px;}
.f-cat{font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;}
.f-title{font-size:1.3rem;font-weight:700;line-height:1.35;margin-bottom:12px;}
.f-sum{font-size:0.9rem;color:var(--sub);line-height:1.75;margin-bottom:16px;}
.f-meta{font-size:0.75rem;color:var(--muted);display:flex;gap:10px;align-items:center;}
.featured-img{background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:4rem;overflow:hidden;}
.featured-img img{width:100%;height:100%;object-fit:cover;}
.posts-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.posts-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.post-card{background:#fff;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:all 0.2s;}
.post-card:hover{border-color:var(--primary);box-shadow:0 4px 16px rgba(0,0,0,0.08);}
.pc-thumb{height:160px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:2.5rem;overflow:hidden;}
.pc-thumb img{width:100%;height:100%;object-fit:cover;}
.pc-body{padding:16px;}
.pc-cat{font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;}
.pc-title{font-size:0.92rem;font-weight:700;line-height:1.4;margin-bottom:6px;}
.pc-sum{font-size:0.8rem;color:var(--sub);line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:10px;}
.pc-meta{font-size:0.72rem;color:var(--muted);display:flex;justify-content:space-between;align-items:center;}
.pc-actions{display:flex;gap:6px;opacity:0;transition:opacity 0.15s;}
.post-card:hover .pc-actions,.featured:hover .f-actions{opacity:1;}
.f-actions{opacity:0;transition:opacity 0.15s;}
.sidebar{display:flex;flex-direction:column;gap:20px;}
.side-box{background:#fff;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.side-head{padding:16px 20px;border-bottom:1px solid var(--border);font-size:0.85rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;}
.side-more{font-size:0.75rem;color:var(--primary);font-weight:500;cursor:pointer;}
.side-more:hover{text-decoration:underline;}
.side-item{padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:12px;align-items:flex-start;transition:background 0.12s;}
.side-item:last-child{border-bottom:none;}
.side-item:hover{background:#f8f9fa;}
.side-n{font-family:'Montserrat',sans-serif;font-size:1rem;font-weight:700;color:var(--border);width:24px;flex-shrink:0;padding-top:2px;}
.side-t{font-size:0.82rem;font-weight:600;line-height:1.4;margin-bottom:3px;}
.side-m{font-size:0.7rem;color:var(--muted);}
.profile-box{padding:24px 20px;text-align:center;}
.profile-mini-avatar{width:64px;height:64px;border-radius:50%;background:var(--bg);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;overflow:hidden;}
.profile-mini-avatar img{width:100%;height:100%;object-fit:cover;}
.profile-mini-name{font-weight:700;font-size:0.95rem;margin-bottom:4px;}
.profile-mini-tag{font-size:0.78rem;color:var(--muted);}
.cat-box{padding:16px 20px;display:flex;flex-wrap:wrap;gap:8px;}
.cat-chip{padding:6px 14px;border-radius:50px;font-size:0.75rem;font-weight:500;border:2px solid var(--border);color:var(--sub);cursor:pointer;background:#fff;transition:all 0.15s;}
.cat-chip:hover{border-color:var(--primary);color:var(--primary);}
.cat-chip.active{background:var(--primary);color:#fff;border-color:var(--primary);}
.detail-page{max-width:860px;margin:0 auto;padding:60px 32px;background:#fff;min-height:100vh;}
.detail-back{font-size:0.8rem;color:var(--primary);cursor:pointer;margin-bottom:24px;display:inline-flex;align-items:center;gap:4px;font-weight:500;}
.detail-back:hover{text-decoration:underline;}
.detail-cat{font-size:0.7rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;}
.detail-title{font-size:2rem;font-weight:700;line-height:1.3;margin-bottom:12px;}
.detail-meta{font-size:0.78rem;color:var(--muted);padding-bottom:24px;border-bottom:1px solid var(--border);margin-bottom:28px;display:flex;gap:12px;align-items:center;}
.detail-img{width:100%;max-height:440px;object-fit:cover;border-radius:var(--radius);margin-bottom:28px;}
.detail-body{font-size:1rem;line-height:2;color:#222;}
.btn-sm{background:#fff;border:1px solid var(--border);padding:5px 12px;font-size:0.7rem;cursor:pointer;border-radius:4px;color:var(--text);font-weight:500;}
.btn-sm:hover{border-color:#999;}
.btn-del-sm{background:#fff;border:1px solid #fcc;color:var(--red);padding:5px 10px;font-size:0.7rem;cursor:pointer;border-radius:4px;font-weight:500;}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:#fff;width:100%;max-width:580px;max-height:92vh;overflow-y:auto;border-radius:var(--radius);}
.modal-head{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;}
.modal-title{font-size:1rem;font-weight:700;}
.modal-x{background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--muted);padding:2px 6px;line-height:1;}
.modal-x:hover{color:#111;}
.modal-body{padding:24px;}
.modal-foot{padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;}
.fg{margin-bottom:16px;}
.fg label{display:block;font-size:0.75rem;font-weight:600;color:var(--sub);margin-bottom:6px;}
.fg input,.fg textarea,.fg select{width:100%;border:1px solid var(--border);padding:10px 14px;font-size:0.85rem;font-family:'Noto Sans KR',sans-serif;color:#111;outline:none;border-radius:var(--radius);transition:border-color 0.15s;resize:vertical;background:#fff;}
.fg input:focus,.fg textarea:focus,.fg select:focus{border-color:var(--primary);}
footer{border-top:1px solid var(--border);padding:32px;text-align:center;font-size:0.78rem;color:var(--muted);background:var(--bg);}
footer b{color:var(--primary);}
.empty{text-align:center;padding:80px 0;color:var(--muted);}
.empty-icon{font-size:3.5rem;margin-bottom:16px;opacity:0.3;}
.empty-title{font-size:1.1rem;font-weight:600;margin-bottom:8px;}
.empty-desc{font-size:0.88rem;margin-bottom:24px;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.fade{animation:fadeIn 0.3s ease both;}
`;

// ─── Charts ───────────────────────────────────────────────────────────────────
function Sparkline({ candles, color, width=120, height=32 }) {
  const ref = useRef();
  useEffect(()=>{
    const c=ref.current; if(!c) return;
    const ctx=c.getContext('2d');
    const pts=candles.slice(-30), vals=pts.map(p=>p.c);
    const mn=Math.min(...vals), mx=Math.max(...vals), pad=2;
    const sx=(width-pad*2)/(pts.length-1), sy=mx===mn?0:(height-pad*2)/(mx-mn);
    ctx.clearRect(0,0,width,height); ctx.beginPath();
    pts.forEach((p,i)=>{ const x=pad+i*sx, y=pad+(mx-p.c)*sy; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle=color; ctx.lineWidth=1.8; ctx.stroke();
  },[candles,color]);
  return <canvas ref={ref} width={width} height={height} className="mini-canvas" style={{height:height+'px'}} />;
}
function MainChart({ candles, color }) {
  const ref = useRef();
  useEffect(()=>{
    const c=ref.current; if(!c) return;
    const ctx=c.getContext('2d'), W=c.offsetWidth||900, H=220;
    c.width=W; c.height=H;
    const pts=candles, vals=pts.map(p=>p.c);
    const mn=Math.min(...vals)*0.998, mx=Math.max(...vals)*1.002;
    const pL=60,pR=20,pT=20,pB=32, W2=W-pL-pR, H2=H-pT-pB;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#f0f0f0'; ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=pT+H2*(1-i/4); ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(W-pR,y); ctx.stroke();
      const val=mn+(mx-mn)*(i/4);
      ctx.fillStyle='#999'; ctx.font='11px Montserrat'; ctx.textAlign='right';
      ctx.fillText(val>=1000?Math.round(val).toLocaleString():val.toFixed(2),pL-6,y+4);
    }
    const step=Math.floor(pts.length/7);
    pts.forEach((p,i)=>{ if(i%step===0){ const x=pL+W2*(i/(pts.length-1)); ctx.fillStyle='#aaa'; ctx.font='10px sans-serif'; ctx.textAlign='center'; ctx.fillText(p.d.slice(5),x,H-8); } });
    const grad=ctx.createLinearGradient(0,pT,0,H-pB);
    grad.addColorStop(0,color+'33'); grad.addColorStop(1,color+'00');
    ctx.beginPath();
    pts.forEach((p,i)=>{ const x=pL+W2*(i/(pts.length-1)), y=pT+H2*(1-(p.c-mn)/(mx-mn)); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.lineTo(pL+W2,H-pB); ctx.lineTo(pL,H-pB); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
    ctx.beginPath();
    pts.forEach((p,i)=>{ const x=pL+W2*(i/(pts.length-1)), y=pT+H2*(1-(p.c-mn)/(mx-mn)); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.stroke();
  },[candles,color]);
  return <canvas ref={ref} style={{width:'100%',height:'220px',display:'block'}} />;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [posts,setPosts]     = useState([]);
  const [profile,setProfile] = useState(DEF_PROFILE);
  const [activeCat,setCatRaw]= useState("all");
  const [detail,setDetailRaw]= useState(null);
  const [modal,setModal]     = useState(null);
  const [editing,setEditing] = useState(null);
  const [loading,setLoading] = useState(true);
  const [market,setMarket]   = useState("sp500");
  const [selStock,setSelStock]= useState(0);
  const [form,setForm]       = useState({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});
  const [prForm,setPrForm]   = useState({...DEF_PROFILE});
  const imgRef=useRef(); const avatarRef=useRef();
  const postsRef = useRef([]);

  // ── 히스토리를 쌓는 네비게이션 함수들 ────────────────────────────────────
  const navToCat = useCallback((cat) => {
    setCatRaw(cat);
    setDetailRaw(null);
    pushState({ cat, postId: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navToPost = useCallback((post) => {
    setDetailRaw(post);
    pushState({ cat: activeCat, postId: post.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeCat]);

  const navBack = useCallback(() => {
    setDetailRaw(null);
    // pushState 없이 — 뒤로가기가 자동으로 이전 URL로 복원
  }, []);

  // ── 브라우저 뒤로가기 / 앞으로가기 처리 ─────────────────────────────────
  useEffect(() => {
    const handlePop = (e) => {
      const state = e.state || readState();
      const cat = state.cat || "all";
      const postId = state.postId || null;
      setCatRaw(cat);
      if (postId) {
        const found = postsRef.current.find(p => p.id === postId);
        setDetailRaw(found || null);
      } else {
        setDetailRaw(null);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  // ── 초기 로드 ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      const [p,ps] = await Promise.all([load(K.profile), load(K.posts)]);
      if(p) setProfile(p);
      const loaded = ps || DEF_POSTS;
      setPosts(loaded);
      postsRef.current = loaded;

      // URL에 이미 상태가 있으면 복원 (직접 링크, 새로고침 등)
      const init = readState();
      setCatRaw(init.cat);
      if(init.postId) {
        const found = loaded.find(p => p.id === init.postId);
        if(found) setDetailRaw(found);
      }
      // 최초 진입 시 현재 상태를 히스토리에 등록
      window.history.replaceState(
        { cat: init.cat, postId: init.postId },
        "",
        window.location.href
      );
      setLoading(false);
    })();
  }, []);

  const savePost = async () => {
    const today = new Date().toISOString().slice(0,10);
    const u = editing
      ? posts.map(p => p.id===editing.id ? {...p,...form} : p)
      : [{id:Date.now(),...form,date:today}, ...posts];
    setPosts(u); postsRef.current = u;
    await save(K.posts, u);
    setModal(null); setEditing(null);
    setForm({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});
  };
  const delPost = async(id) => {
    const u = posts.filter(p=>p.id!==id);
    setPosts(u); postsRef.current = u;
    await save(K.posts, u);
    if(detail?.id===id) navBack();
  };
  const openEdit = p => { setEditing(p); setForm({title:p.title,summary:p.summary,cat:p.cat,body:p.body||"",img:p.img||"",pinned:p.pinned||false}); setModal('write'); };
  const saveProfile = async() => { setProfile(prForm); await save(K.profile,prForm); setModal(null); };
  const handleImg = async e => { const f=e.target.files[0]; if(!f)return; setForm({...form,img:await toB64(f)}); };
  const handleAvatar = async e => { const f=e.target.files[0]; if(!f)return; const u={...profile,avatar:await toB64(f)}; setProfile(u); await save(K.profile,u); };

  const EMO = {insight:'💡',inspiration:'✨',career:'💼',study:'📚',daily:'☀️',photo:'📷'};
  const isAll = activeCat==="all";
  const catInfo = CAT[activeCat];
  const filtered = isAll ? posts : posts.filter(p=>p.cat===activeCat);
  const pinned = isAll ? (filtered.find(p=>p.pinned)||filtered[0]) : null;
  const rest = pinned ? filtered.filter(p=>p!==pinned) : filtered;
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const stocks = market==="sp500" ? SP500_DATA : KOSPI_DATA;
  const idxCandles = market==="sp500" ? SP500_INDEX : KOSPI_INDEX;
  const cur = stocks[selStock];
  const curLast=cur.candles[cur.candles.length-1].c, curPrev=cur.candles[cur.candles.length-2].c;
  const curChg=((curLast-curPrev)/curPrev*100).toFixed(2);
  const idxLast=idxCandles[idxCandles.length-1].c, idxPrev=idxCandles[idxCandles.length-2].c;
  const idxChg=((idxLast-idxPrev)/idxPrev*100).toFixed(2);

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888'}}>불러오는 중...</div>;

  return (<>
    <style>{CSS}</style>

    {/* HEADER */}
    <header className="header">
      <div className="header-inner">
        <span className="logo" onClick={()=>navToCat("all")}>dlwnsleejun</span>
        <nav className="nav">
          {CATS.map(c=><button key={c.id} className={`nav-link ${activeCat===c.id&&!detail?'active':''}`} onClick={()=>navToCat(c.id)}>{c.label}</button>)}
        </nav>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={()=>{setPrForm({...profile});setModal('profile');}}>프로필</button>
          <button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:isAll?"insight":activeCat,body:"",img:"",pinned:false});setModal('write');}}>+ 글쓰기</button>
        </div>
      </div>
    </header>

    {/* DETAIL */}
    {detail && !modal && (
      <div className="fade">
        <div className="detail-page">
          <div className="detail-back" onClick={()=>{ window.history.back(); }}>← 뒤로가기</div>
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
      {/* HERO */}
      {isAll && (
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-content">
              <h1>나의 생각과 기록을<br/><span>담는 공간</span></h1>
              <p>일상, 인사이트, 그리고 배움을 기록하며 성장하는 개인 블로그입니다.</p>
              <div className="hero-actions">
                <button className="btn btn-lg btn-white" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",body:"",img:"",pinned:false});setModal('write');}}>+ 새 글 작성</button>
                <button className="btn btn-lg btn-outline-white" onClick={()=>navToCat("all")}>전체 글 보기</button>
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-avatar" onClick={()=>avatarRef.current.click()}>
                {profile.avatar?<img src={profile.avatar} alt=""/>:profile.name[0]?.toUpperCase()}
                <div className="hero-avatar-ov">변경</div>
                <input ref={avatarRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleAvatar}/>
              </div>
              <h2>{profile.name}</h2>
              <p>{profile.tagline}</p>
              <div className="hero-card-bio">{profile.bio}</div>
            </div>
          </div>
        </section>
      )}

      {/* CATEGORY HERO */}
      {!isAll && catInfo && (
        <section className="cat-hero">
          <div className="cat-hero-inner">
            <div className="cat-hero-eyebrow" style={{color:catInfo.color}}>{catInfo.label}</div>
            <h1 className="cat-hero-title" style={{color:catInfo.color}}>{catInfo.label}</h1>
            <p className="cat-hero-desc">{catInfo.desc}</p>
            <div className="cat-hero-stats">
              <div className="cat-stat">
                <div>
                  <div className="cat-stat-num" style={{color:catInfo.color}}>{filtered.length}</div>
                  <div className="cat-stat-label">총 게시물</div>
                </div>
              </div>
              {filtered.length>0&&(
                <div className="cat-stat">
                  <div>
                    <div className="cat-stat-num" style={{color:catInfo.color}}>{fmtDate(filtered.sort((a,b)=>b.date.localeCompare(a.date))[0].date).slice(0,7)}</div>
                    <div className="cat-stat-label">최근 업데이트</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* STATS BAR */}
      {isAll && (
        <div className="stats-bar">
          <div className="stats-inner">
            {CATS.slice(1).map(c=>(
              <div className="stat" key={c.id} onClick={()=>navToCat(c.id)}>
                <div className="stat-num">{posts.filter(p=>p.cat===c.id).length}</div>
                <div className="stat-label">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STOCK SECTION */}
      {isAll && (
        <section className="stock-section">
          <div className="stock-inner">
            <div className="section-head">
              <div><div className="section-title">마켓 인사이트</div><div className="section-sub">시뮬레이션 데이터 (90일)</div></div>
              <div className="market-tabs">
                <button className={`market-tab ${market==='sp500'?'active':''}`} onClick={()=>{setMarket('sp500');setSelStock(0);}}>S&P 500</button>
                <button className={`market-tab ${market==='kospi'?'active':''}`} onClick={()=>{setMarket('kospi');setSelStock(0);}}>KOSPI</button>
              </div>
            </div>
            <div className="index-cards">
              <div className="index-card"><div className="idx-info"><h3>{market==='sp500'?'S&P 500':'KOSPI'} Index</h3><div className="idx-val">{market==='sp500'?idxLast.toFixed(0):Math.round(idxLast).toLocaleString()}</div><div className={`idx-chg ${parseFloat(idxChg)>=0?'up':'dn'}`}>{parseFloat(idxChg)>=0?'▲':'▼'} {Math.abs(idxChg)}%</div></div></div>
              <div className="index-card"><div className="idx-info"><h3>선택: {cur.ticker}</h3><div className="idx-val">{market==='sp500'?'$':''}{curLast>=1000?Math.round(curLast).toLocaleString():curLast.toFixed(2)}{market==='kospi'?'원':''}</div><div className={`idx-chg ${parseFloat(curChg)>=0?'up':'dn'}`}>{parseFloat(curChg)>=0?'▲':'▼'} {Math.abs(curChg)}%</div></div></div>
            </div>
            <div className="chart-box"><div className="chart-label">{cur.name} ({cur.ticker}) — 최근 90일</div><MainChart key={`${market}-${selStock}`} candles={cur.candles} color={cur.color}/></div>
            <div className="stocks-grid">
              {stocks.map((s,i)=>{
                const last=s.candles[s.candles.length-1].c, prev=s.candles[s.candles.length-2].c;
                const chg=((last-prev)/prev*100).toFixed(2), up=parseFloat(chg)>=0;
                return (<div key={s.ticker} className={`stock-card ${selStock===i?'selected':''}`} onClick={()=>setSelStock(i)}>
                  <div className="stock-ticker" style={{color:s.color}}>{s.ticker}</div>
                  <div className="stock-name">{s.name}</div>
                  <div className="stock-price">{market==='sp500'?'$':''}{last>=1000?Math.round(last).toLocaleString():last.toFixed(2)}</div>
                  <div className={`stock-chg ${up?'up':'dn'}`}>{up?'▲':'▼'} {Math.abs(chg)}%</div>
                  <Sparkline candles={s.candles} color={up?'#DE350B':'#00875A'} width={140} height={32}/>
                </div>);
              })}
            </div>
          </div>
        </section>
      )}

      {/* CONTENT */}
      <section className="content-section">
        <div className={isAll?"content-inner fade":"content-full fade"}>
          {isAll ? (
            <>
              <div>
                {pinned&&(
                  <div className="featured" onClick={()=>navToPost(pinned)}>
                    <div className="featured-body">
                      <div className="f-cat" style={{color:CAT[pinned.cat]?.color}}>{CAT[pinned.cat]?.label}</div>
                      <div className="f-title">{pinned.title}</div>
                      <div className="f-sum">{pinned.summary}</div>
                      <div className="f-meta"><span>{fmtDate(pinned.date)}</span>
                        <div className="f-actions" onClick={e=>e.stopPropagation()} style={{display:'flex',gap:6}}>
                          <button className="btn-sm" onClick={()=>openEdit(pinned)}>수정</button>
                          <button className="btn-del-sm" onClick={()=>delPost(pinned.id)}>삭제</button>
                        </div>
                      </div>
                    </div>
                    <div className="featured-img">{pinned.img?<img src={pinned.img} alt=""/>:EMO[pinned.cat]}</div>
                  </div>
                )}
                {rest.length>0&&(
                  <div className="posts-grid">
                    {rest.map(p=>(
                      <div key={p.id} className="post-card" onClick={()=>navToPost(p)}>
                        <div className="pc-thumb">{p.img?<img src={p.img} alt=""/>:EMO[p.cat]}</div>
                        <div className="pc-body">
                          <div className="pc-cat" style={{color:CAT[p.cat]?.color}}>{CAT[p.cat]?.label}</div>
                          <div className="pc-title">{p.title}</div>
                          <div className="pc-sum">{p.summary}</div>
                          <div className="pc-meta"><span>{fmtDate(p.date)}</span>
                            <div className="pc-actions" onClick={e=>e.stopPropagation()}>
                              <button className="btn-sm" onClick={()=>openEdit(p)}>수정</button>
                              <button className="btn-del-sm" onClick={()=>delPost(p.id)}>삭제</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!pinned&&rest.length===0&&<div className="empty">📝<br/><br/>첫 번째 글을 작성해보세요!</div>}
              </div>
              <aside className="sidebar">
                <div className="side-box">
                  <div className="profile-box">
                    <div className="profile-mini-avatar">{profile.avatar?<img src={profile.avatar} alt=""/>:profile.name[0]?.toUpperCase()}</div>
                    <div className="profile-mini-name">{profile.name}</div>
                    <div className="profile-mini-tag">{profile.tagline}</div>
                  </div>
                </div>
                <div className="side-box">
                  <div className="side-head">최근 게시글 <span className="side-more" onClick={()=>navToCat("all")}>전체보기</span></div>
                  {recent.map((p,i)=>(
                    <div key={p.id} className="side-item" onClick={()=>navToPost(p)}>
                      <div className="side-n">{String(i+1).padStart(2,'0')}</div>
                      <div><div className="side-t">{p.title}</div><div className="side-m" style={{color:CAT[p.cat]?.color}}>{CAT[p.cat]?.label} · {fmtDate(p.date)}</div></div>
                    </div>
                  ))}
                </div>
                <div className="side-box">
                  <div className="side-head">카테고리</div>
                  <div className="cat-box">
                    {CATS.slice(1).map(c=>(
                      <button key={c.id} className={`cat-chip ${activeCat===c.id?'active':''}`} onClick={()=>navToCat(c.id)}>
                        {c.label} <span style={{fontWeight:700}}>{posts.filter(p=>p.cat===c.id).length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </>
          ) : (
            filtered.length>0 ? (
              <div className="posts-grid-3">
                {filtered.map(p=>(
                  <div key={p.id} className="post-card" onClick={()=>navToPost(p)}>
                    <div className="pc-thumb">{p.img?<img src={p.img} alt=""/>:EMO[p.cat]}</div>
                    <div className="pc-body">
                      <div className="pc-cat" style={{color:catInfo.color}}>{catInfo.label}</div>
                      <div className="pc-title">{p.title}</div>
                      <div className="pc-sum">{p.summary}</div>
                      <div className="pc-meta"><span>{fmtDate(p.date)}</span>
                        <div className="pc-actions" onClick={e=>e.stopPropagation()}>
                          <button className="btn-sm" onClick={()=>openEdit(p)}>수정</button>
                          <button className="btn-del-sm" onClick={()=>delPost(p.id)}>삭제</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon">{EMO[activeCat]}</div>
                <div className="empty-title">아직 {catInfo.label}에 글이 없어요</div>
                <div className="empty-desc">첫 번째 글을 작성해보세요!</div>
                <button className="btn btn-primary btn-lg" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:activeCat,body:"",img:"",pinned:false});setModal('write');}}>+ 첫 글 작성하기</button>
              </div>
            )
          )}
        </div>
      </section>
    </>)}

    <footer><b>dlwnsleejun.com</b> — 나만의 기록 공간</footer>

    {/* WRITE MODAL */}
    {modal==='write'&&(
      <div className="modal-bg" onClick={()=>setModal(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head"><div className="modal-title">{editing?'글 수정':'새 글 작성'}</div><button className="modal-x" onClick={()=>setModal(null)}>✕</button></div>
          <div className="modal-body">
            <div className="fg"><label>카테고리</label><select value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})}>{CATS.slice(1).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="fg"><label>제목</label><input type="text" value={form.title} placeholder="제목을 입력하세요" onChange={e=>setForm({...form,title:e.target.value})}/></div>
            <div className="fg"><label>요약</label><textarea rows={2} value={form.summary} placeholder="한 줄 요약" onChange={e=>setForm({...form,summary:e.target.value})}/></div>
            <div className="fg"><label>본문</label><textarea rows={6} value={form.body} placeholder="내용을 작성하세요" onChange={e=>setForm({...form,body:e.target.value})}/></div>
            <div className="fg">
              <label>대표 이미지</label>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <button className="btn btn-outline" style={{padding:'8px 14px',fontSize:'0.78rem'}} onClick={()=>imgRef.current.click()}>파일 선택</button>
                {form.img&&<span style={{fontSize:'0.72rem',color:'var(--green)'}}>✓ 업로드됨</span>}
              </div>
              {form.img&&<img src={form.img} alt="" style={{width:'100%',maxHeight:160,objectFit:'cover',marginTop:10,borderRadius:6}}/>}
              <input ref={imgRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImg}/>
            </div>
            <div className="fg" style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="checkbox" id="pin" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})} style={{width:'auto',margin:0}}/>
              <label htmlFor="pin" style={{margin:0,cursor:'pointer',fontSize:'0.85rem'}}>대표 글로 고정 (전체 페이지)</label>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-outline" onClick={()=>setModal(null)}>취소</button>
            <button className="btn btn-primary" onClick={savePost} disabled={!form.title} style={{opacity:form.title?1:0.4}}>저장</button>
          </div>
        </div>
      </div>
    )}

    {/* PROFILE MODAL */}
    {modal==='profile'&&(
      <div className="modal-bg" onClick={()=>setModal(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head"><div className="modal-title">프로필 편집</div><button className="modal-x" onClick={()=>setModal(null)}>✕</button></div>
          <div className="modal-body">
            {[['name','이름'],['tagline','한 줄 소개'],['bio','상세 소개']].map(([k,lb])=>(
              <div className="fg" key={k}><label>{lb}</label><input type="text" value={prForm[k]} onChange={e=>setPrForm({...prForm,[k]:e.target.value})}/></div>
            ))}
          </div>
          <div className="modal-foot">
            <button className="btn btn-outline" onClick={()=>setModal(null)}>취소</button>
            <button className="btn btn-primary" onClick={saveProfile}>저장</button>
          </div>
        </div>
      </div>
    )}
  </>);
}
