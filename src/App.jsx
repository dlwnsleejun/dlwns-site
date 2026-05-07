import { useState, useEffect, useRef, useCallback } from "react";

// ─── Storage (localStorage) ───────────────────────────────────────────────────
const K = { posts:"dlwns-posts5", profile:"dlwns-profile4", stocks:"dlwns-stocks1", calendar:"dlwns-calendar1" };

function load(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch(e) {
    // 용량 초과(이미지 등) 시 이미지 제외하고 재시도
    if(e.name === 'QuotaExceededError' && key === K.profile) {
      try { localStorage.setItem(key, JSON.stringify({...val, avatar:""})); } catch {}
    }
    console.warn('저장 용량 초과:', e);
  }
}
const toB64 = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });

// ─── Browser History ──────────────────────────────────────────────────────────
function pushState(state) {
  const p = new URLSearchParams();
  if (state.cat && state.cat !== "all") p.set("cat", state.cat);
  if (state.subcat) p.set("sub", state.subcat);
  if (state.postId) p.set("post", String(state.postId));
  const s = p.toString() ? "?" + p.toString() : "";
  window.history.pushState(state, "", window.location.pathname + s);
}
function readState() {
  const p = new URLSearchParams(window.location.search);
  return { cat: p.get("cat")||"all", subcat: p.get("sub")||null, postId: p.get("post")?Number(p.get("post")):null };
}

// ─── Categories & Subcategories ───────────────────────────────────────────────
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

const SUBCATS = {
  insight:     [{ id:"all",label:"전체" },{ id:"it",label:"AI" },{ id:"economy",label:"경제" },{ id:"society",label:"사회" },{ id:"etc",label:"기타" }],
  inspiration: [{ id:"all",label:"전체" },{ id:"video",label:"유튜브/쇼츠" },{ id:"reels",label:"인스타 릴스" },{ id:"book",label:"도서" },{ id:"design",label:"디자인" }],
  career:      [{ id:"all",label:"전체" },{ id:"job",label:"취업/이직" },{ id:"project",label:"프로젝트" },{ id:"cert",label:"자격증" },{ id:"etc",label:"기타" }],
  study:       [{ id:"all",label:"전체" },{ id:"english",label:"영어" },{ id:"japanese",label:"일본어" },{ id:"adsp",label:"ADSP" },{ id:"logistics",label:"물류관리사" },{ id:"etc",label:"기타" }],
  daily:       [{ id:"all",label:"전체" },{ id:"morning",label:"아침" },{ id:"food",label:"먹거리" },{ id:"weekend",label:"주말" },{ id:"etc",label:"기타" }],
  photo:       [{ id:"all",label:"전체" },{ id:"daily",label:"일상" },{ id:"travel",label:"여행" },{ id:"food",label:"음식" },{ id:"etc",label:"기타" }],
};

// YouTube / Instagram URL 파싱
function parseVideoUrl(url) {
  if (!url) return null;
  if (url.includes("youtube.com/watch") || url.includes("youtu.be")) {
    const m = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return m ? { type:"youtube", id:m[1] } : null;
  }
  if (url.includes("youtube.com/shorts")) {
    const m = url.match(/shorts\/([^?/]+)/);
    return m ? { type:"shorts", id:m[1] } : null;
  }
  if (url.includes("instagram.com")) return { type:"instagram", url };
  return { type:"link", url };
}

const DEF_PROFILE = { name:"dlwnsleejun", tagline:"기록하는 사람", bio:"", avatar:"" };
const DEF_POSTS = [
  { id:1, cat:"insight", subcat:"it", title:"AI 시대, 개인이 갖춰야 할 역량", summary:"앞으로의 시대에는 어떤 능력이 중요해질까?", date:"2026-05-04", img:"", pinned:true, body:"AI의 발전은 단순 반복 업무를 대체하고 있다." },
  { id:2, cat:"study",   subcat:"adsp", title:"React 18 주요 변경사항", summary:"Concurrent Features와 useTransition.", date:"2026-05-03", img:"", pinned:false, body:"React 18의 가장 주목할 변화." },
  { id:3, cat:"daily",   subcat:"morning", title:"오늘도 커피 한 잔과 함께", summary:"아침 루틴을 바꾸고 집중력 향상.", date:"2026-05-02", img:"", pinned:false, body:"작은 습관이 하루를 바꾼다." },
  { id:4, cat:"career",  subcat:"project", title:"첫 사이드 프로젝트 회고", summary:"혼자 만든 첫 프로젝트에서 배운 것들.", date:"2026-05-01", img:"", pinned:false, body:"기술보다 기획이 먼저였다." },
  { id:5, cat:"inspiration", subcat:"video", title:"디터 람스의 좋은 디자인 10원칙", summary:"단순함이란 본질만 남기는 것.", date:"2026-04-30", img:"", pinned:false, body:"Less but better.", videoUrl:"https://www.youtube.com/watch?v=0oEl9OOuuI0" },
  { id:6, cat:"photo",   subcat:"travel", title:"을지로, 오래된 골목의 감성", summary:"우연히 들어간 골목의 사진들.", date:"2026-04-29", img:"", pinned:false, body:"낡음이 주는 온기." },
];

function fmtDate(s){ const d=new Date(s); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }

// 오늘 날짜 문자열 (한국어)
function getTodayKr() {
  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// ─── Stock Data ───────────────────────────────────────────────────────────────
const PERIODS = [
  { id:"1w", label:"1주",  days:7   },
  { id:"1m", label:"1달",  days:30  },
  { id:"6m", label:"6달",  days:182 },
  { id:"1y", label:"1년",  days:365 },
];

// 날짜 문자열 기반 seed → 같은 날 항상 같은 값 보장
function seededRand(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0x100000000;
  };
}
function dateSeed(dateStr, extra=0) {
  return dateStr.replace(/-/g,'').split('').reduce((a,c,i)=>((a<<5)-a+c.charCodeAt(0)*31*(i+1)),extra);
}

function genCandles(base, vol, days=365) {
  const data=[]; let price=base;
  const now=new Date(); now.setHours(0,0,0,0);
  for(let i=days;i>=0;i--){
    const d=new Date(now); d.setDate(d.getDate()-i);
    if(d.getDay()===0||d.getDay()===6) continue;
    const dateStr = d.toISOString().slice(0,10);
    // 날짜 + 기준가 조합으로 seed → 항상 같은 값
    const rand = seededRand(dateSeed(dateStr, Math.round(base)));
    const change = (rand()-0.48)*vol;
    const open = price;
    const close = +(price*(1+change/100)).toFixed(2);
    const high  = +(Math.max(open,close)*(1+rand()*vol*0.003)).toFixed(2);
    const low   = +(Math.min(open,close)*(1-rand()*vol*0.003)).toFixed(2);
    data.push({ d:dateStr, o:open, h:high, l:low, c:close });
    price=close;
  }
  return data;
}
function sliceByCalendarDays(candles, calendarDays) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - calendarDays);
  return candles.filter(c => new Date(c.d) >= cutoff);
}
const SP500_STOCKS = [
  { ticker:"NVDA", name:"NVIDIA",    base:875,  vol:3.2, color:"#76b900" },
  { ticker:"GOOGL",name:"Alphabet",  base:168,  vol:2.1, color:"#4285F4" },
  { ticker:"AAPL", name:"Apple",     base:195,  vol:1.8, color:"#999999" },
  { ticker:"MSFT", name:"Microsoft", base:385,  vol:1.9, color:"#00a4ef" },
  { ticker:"AMZN", name:"Amazon",    base:192,  vol:2.4, color:"#FF9900" },
  { ticker:"META", name:"Meta",      base:578,  vol:2.6, color:"#0866FF" },
  { ticker:"TSLA", name:"Tesla",     base:248,  vol:4.1, color:"#cc0000" },
  { ticker:"BRK",  name:"Berkshire", base:418,  vol:1.2, color:"#8B6914" },
  { ticker:"LLY",  name:"Eli Lilly", base:792,  vol:2.3, color:"#c0392b" },
  { ticker:"JPM",  name:"JPMorgan",  base:228,  vol:1.7, color:"#1A4080" },
];
const KOSPI_STOCKS = [
  { ticker:"005930",name:"삼성전자",  base:58000, vol:2.4, color:"#1428A0" },
  { ticker:"000660",name:"SK하이닉스",base:192000,vol:3.1, color:"#EA001E" },
  { ticker:"005380",name:"현대차",    base:24500, vol:2.2, color:"#002C5F" },
  { ticker:"051910",name:"LG화학",    base:31500, vol:2.8, color:"#A50034" },
  { ticker:"035420",name:"NAVER",     base:19800, vol:2.3, color:"#03C75A" },
  { ticker:"000270",name:"기아",      base:10800, vol:2.1, color:"#556B7D" },
  { ticker:"068270",name:"셀트리온",  base:18500, vol:3.4, color:"#0099CC" },
  { ticker:"035720",name:"카카오",    base:3850,  vol:3.8, color:"#B8A000" },
  { ticker:"028260",name:"삼성물산",  base:14200, vol:1.9, color:"#446090" },
  { ticker:"003550",name:"LG",        base:6800,  vol:1.8, color:"#A50034" },
];
const SP500_DATA  = SP500_STOCKS.map(s=>({ ...s, candles:genCandles(s.base,s.vol) }));
const KOSPI_DATA  = KOSPI_STOCKS.map(s=>({ ...s, candles:genCandles(s.base,s.vol) }));
function genIndexCandles(stocks){
  const len=stocks[0].candles.length;
  return Array.from({length:len},(_,i)=>({ d:stocks[0].candles[i].d, c:stocks.reduce((s,st)=>s+st.candles[i].c/stocks.length,0) }));
}
const SP500_INDEX = genIndexCandles(SP500_DATA);
const KOSPI_INDEX = genIndexCandles(KOSPI_DATA);

// ─── CSS ──────────────────────────────────────────────────────────────────────
const HERO_BG = null;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Montserrat:wght@600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--primary:#0052CC;--text:#111;--sub:#444;--muted:#777;--border:#e0e0e0;--bg:#f7f8fa;--white:#fff;--red:#DE350B;--green:#00875A;--radius:8px;}
body{font-family:'Noto Sans KR',sans-serif;color:var(--text);background:var(--white);font-size:14px;line-height:1.6;}
button{font-family:'Noto Sans KR',sans-serif;}
.header{background:#fff;border-bottom:1px solid var(--border);position:sticky;top:0;z-index:200;}
.header-inner{max-width:1280px;margin:0 auto;display:flex;align-items:center;height:64px;padding:0 32px;gap:32px;}
.logo{font-family:'Montserrat',sans-serif;font-weight:800;font-size:1.3rem;color:#111;cursor:pointer;letter-spacing:-0.5px;}
.nav{display:flex;gap:0;flex:1;}
.nav-link{padding:10px 16px;font-size:0.85rem;font-weight:500;color:var(--muted);background:none;border:none;cursor:pointer;transition:all 0.15s;border-radius:4px;}
.nav-link:hover{color:var(--text);background:#f5f5f5;}
.nav-link.active{color:var(--primary);font-weight:700;}
.header-actions{display:flex;gap:8px;margin-left:auto;}
.btn{padding:9px 18px;font-size:0.82rem;font-weight:500;border-radius:var(--radius);cursor:pointer;border:none;transition:all 0.15s;}
.btn-outline{background:#fff;color:var(--text);border:1px solid var(--border);}
.btn-outline:hover{border-color:#999;}
.btn-primary{background:var(--primary);color:#fff;}
.btn-primary:hover{background:#0043A8;}
/* ── HERO ── */
.hero{position:relative;overflow:hidden;padding:80px 0 100px;min-height:420px;display:flex;align-items:center;}
.hero-bg{position:absolute;inset:0;background:linear-gradient(135deg,#0a1628 0%,#0052CC 100%);background-size:cover;background-position:center 60%;filter:brightness(1);}
.hero-inner{max-width:1280px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:1fr 340px;gap:60px;align-items:center;position:relative;z-index:1;}
.hero-content h1{font-family:'Montserrat',sans-serif;font-size:clamp(2rem,3.5vw,3.2rem);font-weight:800;color:#fff;line-height:1.15;margin-bottom:20px;letter-spacing:-1px;white-space:nowrap;}
.hero-actions{display:flex;gap:12px;}
.btn-lg{padding:14px 32px;font-size:0.92rem;font-weight:600;}
.btn-white{background:#fff;color:var(--primary);}
.btn-white:hover{background:#f0f0f0;}
.btn-outline-white{background:transparent;color:#fff;border:2px solid rgba(255,255,255,0.5);}
.btn-outline-white:hover{border-color:#fff;background:rgba(255,255,255,0.1);}
.hero-card{background:rgba(255,255,255,0.12);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.25);border-radius:12px;padding:28px;box-shadow:0 8px 32px rgba(0,0,0,0.3);}
.hero-avatar{width:72px;height:72px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:700;color:#fff;margin:0 auto 14px;overflow:hidden;cursor:pointer;position:relative;border:2px solid rgba(255,255,255,0.4);}
.hero-avatar img{width:100%;height:100%;object-fit:cover;}
.hero-avatar-ov{position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#fff;opacity:0;transition:opacity 0.2s;}
.hero-avatar:hover .hero-avatar-ov{opacity:1;}
.hero-card-name{font-size:1rem;font-weight:700;text-align:center;color:#fff;margin-bottom:3px;}
.hero-card-tag{font-size:0.8rem;color:rgba(255,255,255,0.65);text-align:center;}
/* ── STATS BAR ── */
.stats-bar{background:#fff;border-bottom:1px solid var(--border);}
.stats-inner{max-width:1280px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:repeat(6,1fr);}
.stat{padding:22px 16px;border-right:1px solid var(--border);text-align:center;cursor:pointer;transition:background 0.15s;}
.stat:last-child{border-right:none;}
.stat:hover{background:#f9f9f9;}
.stat-num{font-family:'Montserrat',sans-serif;font-size:1.8rem;font-weight:700;color:var(--primary);line-height:1;margin-bottom:5px;}
.stat-label{font-size:0.72rem;color:var(--muted);font-weight:500;}
/* ── CATEGORY HERO ── */
.cat-hero{background:#fff;border-bottom:1px solid var(--border);padding:48px 0 0;}
.cat-hero-inner{max-width:1280px;margin:0 auto;padding:0 32px;}
.cat-hero-title{font-family:'Montserrat',sans-serif;font-size:2.2rem;font-weight:800;margin-bottom:8px;letter-spacing:-1px;}
.cat-hero-desc{font-size:0.95rem;color:var(--sub);margin-bottom:20px;}
.cat-hero-stats{display:flex;gap:14px;margin-bottom:24px;}
.cat-stat{display:flex;align-items:center;gap:10px;padding:11px 18px;background:var(--bg);border-radius:var(--radius);border:1px solid var(--border);}
.cat-stat-num{font-family:'Montserrat',sans-serif;font-size:1.3rem;font-weight:700;line-height:1;}
.cat-stat-label{font-size:0.72rem;color:var(--muted);}
/* ── SUBCATEGORY TABS ── */
.subcat-tabs{display:flex;gap:0;border-top:1px solid var(--border);overflow-x:auto;}
.subcat-tabs::-webkit-scrollbar{display:none;}
.subcat-tab{padding:13px 20px;font-size:0.82rem;font-weight:500;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;white-space:nowrap;transition:all 0.15s;margin-bottom:-1px;}
.subcat-tab:hover{color:var(--text);}
.subcat-tab.active{font-weight:700;border-bottom-color:currentColor;}
/* ── STOCK ── */

/* ── CALENDAR ── */
.calendar-section{background:#fff;padding:48px 0 0;border-bottom:1px solid var(--border);}
.calendar-inner{max-width:1280px;margin:0 auto;padding:0 32px;}
.cal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 0 12px;}
.cal-month{font-family:'Montserrat',sans-serif;font-size:1.6rem;font-weight:700;color:#111;}
.cal-year{font-size:0.88rem;color:var(--muted);margin-left:8px;font-weight:500;}
.cal-nav{display:flex;gap:6px;}
.cal-btn{background:#fff;border:1px solid var(--border);border-radius:6px;padding:5px 12px;cursor:pointer;font-size:0.8rem;font-weight:600;color:var(--text);transition:all 0.12s;}
.cal-btn:hover{border-color:#aaa;}
.cal-today-btn{background:#f5f5f5;border:1px solid var(--border);border-radius:6px;padding:5px 12px;cursor:pointer;font-size:0.78rem;font-weight:600;color:var(--sub);transition:all 0.12s;}
.cal-today-btn:hover{border-color:#aaa;background:#eee;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);}
.cal-dow{text-align:center;padding:8px 4px;font-size:0.7rem;font-weight:700;color:var(--muted);}
.cal-dow:first-child{color:#DE350B;}
.cal-dow:last-child{color:#0052CC;}
.cal-cell{min-height:80px;padding:5px 4px 4px;border-top:1px solid #f0f0f0;border-right:1px solid #f0f0f0;cursor:pointer;transition:background 0.12s;position:relative;}
.cal-cell:nth-child(7n){border-right:none;}
.cal-cell.other-month{background:#fafafa;}
.cal-cell.other-month .cal-day{color:#ccc;}
.cal-cell.today .cal-day-inner{background:#111;color:#fff;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;}
.cal-cell:not(.other-month):hover{background:#f8f9ff;}
.cal-day{text-align:right;font-size:0.75rem;font-weight:600;color:#333;margin-bottom:3px;line-height:1;}
.cal-cell:nth-child(7n+1) .cal-day{color:#DE350B;}
.cal-cell:nth-child(7n) .cal-day{color:#0052CC;}
.cal-events{display:flex;flex-direction:column;gap:2px;}
.cal-ev{font-size:0.62rem;font-weight:600;padding:1px 5px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:3px;}
.cal-ev-x{font-size:0.6rem;opacity:0.6;cursor:pointer;flex-shrink:0;margin-left:auto;}
.cal-ev-x:hover{opacity:1;}
.cal-more{font-size:0.6rem;color:var(--muted);padding:1px 4px;}
.cal-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;display:flex;align-items:center;justify-content:center;}
.cal-modal{background:#fff;border-radius:10px;padding:24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.2);}
.cal-modal-title{font-weight:700;font-size:0.95rem;margin-bottom:4px;}
.cal-modal-date{font-size:0.75rem;color:var(--muted);margin-bottom:14px;}
.cal-modal-inp{width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 11px;font-size:0.84rem;outline:none;margin-bottom:10px;font-family:'Noto Sans KR',sans-serif;}
.cal-modal-inp:focus{border-color:var(--primary);}
.cal-colors{display:flex;gap:7px;margin-bottom:14px;}
.cal-color-dot{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:border-color 0.12s;}
.cal-color-dot.sel{border-color:#111;}
.cal-modal-btns{display:flex;gap:8px;justify-content:flex-end;}
.confirm-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:500;display:flex;align-items:center;justify-content:center;}
.confirm-modal{background:#fff;border-radius:10px;padding:24px;width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.2);}
.confirm-modal-title{font-weight:700;font-size:0.95rem;margin-bottom:8px;}
.confirm-modal-desc{font-size:0.83rem;color:var(--sub);margin-bottom:18px;line-height:1.6;}
.confirm-modal-btns{display:flex;gap:8px;justify-content:flex-end;}
.stock-section{background:var(--bg);padding:56px 0;border-bottom:1px solid var(--border);}
.stock-inner{max-width:1280px;margin:0 auto;padding:0 32px;}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;}
.section-title{font-family:'Montserrat',sans-serif;font-size:1.35rem;font-weight:700;color:#111;}
.section-sub{font-size:0.78rem;color:var(--muted);margin-top:3px;}
.market-tabs{display:flex;gap:8px;}
.market-tab{padding:8px 20px;font-size:0.82rem;font-weight:600;border:2px solid var(--border);background:#fff;color:var(--text);cursor:pointer;border-radius:var(--radius);transition:all 0.15s;}
.market-tab.active{background:var(--primary);color:#fff;border-color:var(--primary);}
.period-tabs{display:flex;gap:6px;}
.period-tab{padding:5px 13px;font-size:0.78rem;font-weight:600;border:1px solid var(--border);background:#fff;color:var(--muted);cursor:pointer;border-radius:var(--radius);transition:all 0.15s;}
.period-tab:hover{border-color:#aaa;color:var(--text);}
.period-tab.active{background:var(--text);color:#fff;border-color:var(--text);}
.index-cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;}
.index-card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;}
.index-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;}
.idx-info h3{font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:5px;}
.idx-val{font-family:'Montserrat',sans-serif;font-size:1.7rem;font-weight:700;color:#111;}
.idx-chg{font-size:0.85rem;font-weight:600;margin-top:3px;}
.idx-dates{font-size:0.68rem;color:var(--muted);margin-top:6px;display:flex;gap:8px;}
.up{color:var(--red);}
.dn{color:var(--green);}
.chart-box{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:22px;margin-bottom:22px;}
.chart-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.chart-info{display:flex;align-items:baseline;gap:10px;}
.chart-price-big{font-family:'Montserrat',sans-serif;font-size:1.4rem;font-weight:700;color:#111;}
.chart-chg-big{font-size:0.85rem;font-weight:600;}
.chart-range-label{font-size:0.7rem;color:var(--muted);}
canvas{width:100%!important;display:block;}
.stocks-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;}
.stock-card{background:#fff;border:2px solid var(--border);border-radius:var(--radius);padding:14px;cursor:pointer;transition:all 0.2s;}
.stock-card:hover{border-color:var(--primary);box-shadow:0 4px 16px rgba(0,82,204,0.1);}
.stock-card.selected{border-color:var(--primary);background:#EDF2FF;}
.stock-ticker{font-family:'Montserrat',sans-serif;font-size:0.8rem;font-weight:700;margin-bottom:2px;}
.stock-name{font-size:0.72rem;color:var(--muted);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.stock-price{font-family:'Montserrat',sans-serif;font-size:0.95rem;font-weight:700;color:#111;}
.stock-chg{font-size:0.72rem;font-weight:600;margin-top:1px;}
.mini-canvas{display:block;width:100%;margin-top:6px;}
/* ── CONTENT ── */
.content-section{background:#fff;padding:56px 0;}
.content-inner{max-width:1280px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:1fr 310px;gap:36px;}
.content-full{max-width:1280px;margin:0 auto;padding:0 32px;}
.featured{background:#fff;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;display:grid;grid-template-columns:1fr 280px;cursor:pointer;margin-bottom:24px;transition:all 0.2s;}
.featured:hover{border-color:var(--primary);box-shadow:0 4px 20px rgba(0,0,0,0.08);}
.featured-body{padding:28px;}
.f-cat{font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;}
.f-title{font-size:1.2rem;font-weight:700;line-height:1.35;margin-bottom:10px;}
.f-sum{font-size:0.88rem;color:var(--sub);line-height:1.75;margin-bottom:14px;}
.f-meta{font-size:0.72rem;color:var(--muted);display:flex;gap:10px;align-items:center;}
.featured-img{background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:3.5rem;overflow:hidden;}
.featured-img img{width:100%;height:100%;object-fit:cover;}
.posts-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.posts-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.post-card{background:#fff;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:all 0.2s;}
.post-card:hover{border-color:var(--primary);box-shadow:0 4px 14px rgba(0,0,0,0.08);}
.pc-thumb{height:150px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:2.2rem;overflow:hidden;position:relative;}
.pc-thumb img{width:100%;height:100%;object-fit:cover;}
.video-badge{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:#fff;font-size:0.62rem;font-weight:700;padding:3px 7px;border-radius:3px;letter-spacing:0.05em;}
.pc-body{padding:14px;}
.pc-cat{font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:5px;}
.pc-sub{font-size:0.65rem;color:var(--muted);margin-bottom:5px;}
.pc-title{font-size:0.9rem;font-weight:700;line-height:1.4;margin-bottom:5px;}
.pc-sum{font-size:0.78rem;color:var(--sub);line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:8px;}
.pc-meta{font-size:0.7rem;color:var(--muted);display:flex;justify-content:space-between;align-items:center;}
.pc-actions{display:flex;gap:5px;opacity:0;transition:opacity 0.15s;}
.post-card:hover .pc-actions,.featured:hover .f-actions{opacity:1;}
.f-actions{opacity:0;transition:opacity 0.15s;}
/* ── VIDEO EMBED ── */
.video-embed{width:100%;aspect-ratio:16/9;border-radius:var(--radius);overflow:hidden;margin-bottom:22px;background:#000;}
.video-embed iframe{width:100%;height:100%;border:none;}
.video-link-card{display:flex;align-items:center;gap:12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px 18px;margin-bottom:22px;cursor:pointer;transition:border-color 0.15s;}
.video-link-card:hover{border-color:var(--primary);}
.video-link-icon{font-size:1.8rem;flex-shrink:0;}
.video-link-type{font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px;}
.video-link-url{font-size:0.8rem;color:var(--primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* ── SIDEBAR ── */
.sidebar{display:flex;flex-direction:column;gap:18px;}
.side-box{background:#fff;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.side-head{padding:14px 18px;border-bottom:1px solid var(--border);font-size:0.83rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;}
.side-more{font-size:0.72rem;color:var(--primary);font-weight:500;cursor:pointer;}
.side-more:hover{text-decoration:underline;}
.side-item{padding:12px 18px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:10px;align-items:flex-start;transition:background 0.12s;}
.side-item:last-child{border-bottom:none;}
.side-item:hover{background:#f8f9fa;}
.side-n{font-family:'Montserrat',sans-serif;font-size:0.95rem;font-weight:700;color:var(--border);width:22px;flex-shrink:0;padding-top:1px;}
.side-t{font-size:0.8rem;font-weight:600;line-height:1.4;margin-bottom:2px;}
.side-m{font-size:0.68rem;color:var(--muted);}
.profile-box{padding:22px 18px;text-align:center;}
.profile-mini-avatar{width:56px;height:56px;border-radius:50%;background:var(--bg);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;overflow:hidden;}
.profile-mini-avatar img{width:100%;height:100%;object-fit:cover;}
.profile-mini-name{font-weight:700;font-size:0.9rem;margin-bottom:3px;}
.profile-mini-tag{font-size:0.75rem;color:var(--muted);}
.cat-box{padding:14px 18px;display:flex;flex-wrap:wrap;gap:7px;}
.cat-chip{padding:5px 12px;border-radius:50px;font-size:0.73rem;font-weight:500;border:2px solid var(--border);color:var(--sub);cursor:pointer;background:#fff;transition:all 0.15s;}
.cat-chip:hover{border-color:var(--primary);color:var(--primary);}
.cat-chip.active{background:var(--primary);color:#fff;border-color:var(--primary);}
/* ── DETAIL ── */
.detail-page{max-width:840px;margin:0 auto;padding:56px 32px;background:#fff;min-height:100vh;}
.detail-back{font-size:0.78rem;color:var(--primary);cursor:pointer;margin-bottom:22px;display:inline-flex;align-items:center;gap:4px;font-weight:500;}
.detail-back:hover{text-decoration:underline;}
.detail-cat{font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;}
.detail-title{font-size:1.9rem;font-weight:700;line-height:1.3;margin-bottom:10px;}
.detail-meta{font-size:0.76rem;color:var(--muted);padding-bottom:22px;border-bottom:1px solid var(--border);margin-bottom:24px;display:flex;gap:10px;align-items:center;}
.detail-img{width:100%;max-height:420px;object-fit:cover;border-radius:var(--radius);margin-bottom:24px;}
.detail-body{font-size:0.98rem;line-height:2;color:#222;}
.btn-sm{background:#fff;border:1px solid var(--border);padding:5px 11px;font-size:0.68rem;cursor:pointer;border-radius:4px;color:var(--text);font-weight:500;}
.btn-sm:hover{border-color:#999;}
.btn-del-sm{background:#fff;border:1px solid #fcc;color:var(--red);padding:5px 9px;font-size:0.68rem;cursor:pointer;border-radius:4px;font-weight:500;}
/* ── MODAL ── */
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:#fff;width:100%;max-width:580px;max-height:92vh;overflow-y:auto;border-radius:var(--radius);}
.modal-head{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;}
.modal-title{font-size:0.95rem;font-weight:700;}
.modal-x{background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);padding:2px 6px;line-height:1;}
.modal-x:hover{color:#111;}
.modal-body{padding:22px;}
.modal-foot{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;}
.fg{margin-bottom:14px;}
.fg label{display:block;font-size:0.73rem;font-weight:600;color:var(--sub);margin-bottom:5px;}
.fg input,.fg textarea,.fg select{width:100%;border:1px solid var(--border);padding:9px 12px;font-size:0.84rem;font-family:'Noto Sans KR',sans-serif;color:#111;outline:none;border-radius:var(--radius);transition:border-color 0.15s;resize:vertical;background:#fff;}
.fg input:focus,.fg textarea:focus,.fg select:focus{border-color:var(--primary);}
.video-hint{font-size:0.72rem;color:var(--muted);margin-top:4px;}
footer{border-top:1px solid var(--border);padding:28px;text-align:center;font-size:0.75rem;color:var(--muted);background:var(--bg);}
footer b{color:var(--primary);}
.empty{text-align:center;padding:72px 0;color:var(--muted);}
.empty-icon{font-size:3rem;margin-bottom:14px;opacity:0.3;}
.empty-title{font-size:1.05rem;font-weight:600;margin-bottom:7px;}
.empty-desc{font-size:0.85rem;margin-bottom:22px;}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fade{animation:fadeIn 0.3s ease both;}
`;

// ─── Charts ───────────────────────────────────────────────────────────────────
function Sparkline({ candles, color, width=120, height=32 }) {
  const ref = useRef();
  useEffect(()=>{
    const c=ref.current; if(!c) return;
    const ctx=c.getContext('2d');
    const pts=candles.slice(-30);
    if(pts.length < 2) return;
    const vals=pts.map(p=>p.c);
    const mn=Math.min(...vals), mx=Math.max(...vals);
    if(mn===mx) return;
    const pad=2, sx=(width-pad*2)/(pts.length-1), sy=(height-pad*2)/(mx-mn);
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
    const ctx=c.getContext('2d');
    const W=c.offsetWidth||900, H=220;
    c.width=W; c.height=H;
    // 방어 코드 - 데이터 부족 시 안전하게 처리
    if(!candles || candles.length < 2) {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle='#ccc'; ctx.font='14px sans-serif'; ctx.textAlign='center';
      ctx.fillText('데이터가 부족합니다', W/2, H/2);
      return;
    }
    const pts=candles, vals=pts.map(p=>p.c);
    const mnRaw=Math.min(...vals), mxRaw=Math.max(...vals);
    const mn = mnRaw===mxRaw ? mnRaw*0.995 : mnRaw*0.998;
    const mx = mnRaw===mxRaw ? mxRaw*1.005 : mxRaw*1.002;
    const pL=60,pR=20,pT=20,pB=32, W2=W-pL-pR, H2=H-pT-pB;
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#f0f0f0'; ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=pT+H2*(1-i/4); ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(W-pR,y); ctx.stroke();
      const val=mn+(mx-mn)*(i/4);
      ctx.fillStyle='#999'; ctx.font='11px Montserrat,monospace'; ctx.textAlign='right';
      ctx.fillText(val>=1000?Math.round(val).toLocaleString():val.toFixed(2),pL-6,y+4);
    }
    const step=Math.max(1,Math.floor(pts.length/6));
    pts.forEach((p,i)=>{ if(i%step===0){ const x=pL+W2*(i/(pts.length-1)); ctx.fillStyle='#aaa'; ctx.font='10px sans-serif'; ctx.textAlign='center'; ctx.fillText(p.d.slice(5),x,H-8); } });
    // gradient fill
    const grad=ctx.createLinearGradient(0,pT,0,H-pB);
    // color가 짧은 hex(#xxx)면 full hex로 변환
    let fc = color;
    if(/^#[0-9a-fA-F]{3}$/.test(fc)) { fc='#'+[...fc.slice(1)].map(x=>x+x).join(''); }
    grad.addColorStop(0,fc+'33'); grad.addColorStop(1,fc+'00');
    ctx.beginPath();
    pts.forEach((p,i)=>{ const x=pL+W2*(i/(pts.length-1)), y=pT+H2*(1-(p.c-mn)/(mx-mn)); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.lineTo(pL+W2,H-pB); ctx.lineTo(pL,H-pB); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
    ctx.beginPath();
    pts.forEach((p,i)=>{ const x=pL+W2*(i/(pts.length-1)), y=pT+H2*(1-(p.c-mn)/(mx-mn)); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.strokeStyle=fc; ctx.lineWidth=2.5; ctx.stroke();
  },[candles,color]);
  return <canvas ref={ref} style={{width:'100%',height:'220px',display:'block'}} />;
}

// ─── Index Card Mini Chart (야후 파이낸스 스타일) ─────────────────────────────
function IndexMiniChart({ candles, up }) {
  const ref = useRef();
  const color = up ? '#DE350B' : '#00875A';
  useEffect(()=>{
    const c = ref.current; if(!c) return;
    const ctx = c.getContext('2d');
    const W = c.offsetWidth||320, H = 72;
    c.width = W; c.height = H;
    if(!candles||candles.length<2){ ctx.clearRect(0,0,W,H); return; }
    const vals = candles.map(p=>p.c);
    const mnRaw = Math.min(...vals), mxRaw = Math.max(...vals);
    const mn = mnRaw===mxRaw ? mnRaw*0.995 : mnRaw;
    const mx = mnRaw===mxRaw ? mxRaw*1.005 : mxRaw;
    const pL=2, pR=2, pT=4, pB=4;
    const W2=W-pL-pR, H2=H-pT-pB;
    ctx.clearRect(0,0,W,H);
    // gradient fill
    const grad = ctx.createLinearGradient(0,pT,0,H-pB);
    grad.addColorStop(0, color+'55');
    grad.addColorStop(1, color+'00');
    ctx.beginPath();
    candles.forEach((p,i)=>{
      const x=pL+W2*(i/(candles.length-1));
      const y=pT+H2*(1-(p.c-mn)/(mx-mn));
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.lineTo(pL+W2,H-pB); ctx.lineTo(pL,H-pB); ctx.closePath();
    ctx.fillStyle=grad; ctx.fill();
    // line
    ctx.beginPath();
    candles.forEach((p,i)=>{
      const x=pL+W2*(i/(candles.length-1));
      const y=pT+H2*(1-(p.c-mn)/(mx-mn));
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
    // current price dot
    const lastX = pL+W2;
    const lastY = pT+H2*(1-(candles[candles.length-1].c-mn)/(mx-mn));
    ctx.beginPath(); ctx.arc(lastX,lastY,3.5,0,Math.PI*2);
    ctx.fillStyle=color; ctx.fill();
  },[candles,up]);
  return <canvas ref={ref} style={{width:'100%',height:'72px',display:'block'}}/>;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [posts,setPosts]      = useState([]);
  const [profile,setProfile]  = useState(DEF_PROFILE);
  const [activeCat,setCatRaw] = useState("all");
  const [activeSub,setSubRaw] = useState("all");
  const [detail,setDetailRaw] = useState(null);
  const [modal,setModal]      = useState(null);
  const [editing,setEditing]  = useState(null);
  const [loading,setLoading]  = useState(true);
  const [market,setMarket]    = useState("sp500");
  const [selStock,setSelStock]= useState(0);
  const [period,setPeriod]    = useState("1w");
  const [form,setForm]        = useState({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});
  const [prForm,setPrForm]    = useState({...DEF_PROFILE});
  // Calendar state
  const [calEvents,setCalEvents] = useState({});
  const [calYear,setCalYear]   = useState(()=>new Date().getFullYear());
  const [calMonth,setCalMonth] = useState(()=>new Date().getMonth());
  const [calModalDate,setCalModalDate] = useState(null);
  const [calNewText,setCalNewText]   = useState("");
  const [calNewColor,setCalNewColor] = useState("#0052CC");
  // Confirm dialog state
  const [confirmAction,setConfirmAction] = useState(null); // {type:'edit'|'delete', data}
  // All posts mode (날짜별 묶음)
  const [showAllMode,setShowAllMode] = useState(false);
  const imgRef=useRef(); const avatarRef=useRef();
  const postsRef=useRef([]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navToCat = useCallback((cat, sub="all") => {
    setCatRaw(cat); setSubRaw(sub); setDetailRaw(null); setShowAllMode(false);
    pushState({ cat, subcat: sub!=="all"?sub:null, postId:null });
    window.scrollTo({ top:0, behavior:"smooth" });
  }, []);
  const navToPost = useCallback((post) => {
    setDetailRaw(post);
    pushState({ cat:activeCat, subcat:activeSub!=="all"?activeSub:null, postId:post.id });
    window.scrollTo({ top:0, behavior:"smooth" });
  }, [activeCat, activeSub]);

  useEffect(() => {
    const handlePop = (e) => {
      const s = e.state || readState();
      setCatRaw(s.cat||"all"); setSubRaw(s.subcat||"all");
      if(s.postId) { const f=postsRef.current.find(p=>p.id===s.postId); setDetailRaw(f||null); }
      else setDetailRaw(null);
      window.scrollTo({ top:0, behavior:"smooth" });
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(()=>{
    const p  = load(K.profile);
    const ps = load(K.posts);
    const cal = load(K.calendar);
    if(p) setProfile(p);
    if(cal) setCalEvents(cal);
    const loaded = ps||DEF_POSTS;
    setPosts(loaded); postsRef.current = loaded;
    const init = readState();
    setCatRaw(init.cat); setSubRaw(init.subcat||"all");
    if(init.postId) { const f=loaded.find(p=>p.id===init.postId); if(f) setDetailRaw(f); }
    window.history.replaceState({ cat:init.cat, subcat:init.subcat, postId:init.postId }, "", window.location.href);
    setLoading(false);
  }, []);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const savePost = () => {
    const today=new Date().toISOString().slice(0,10);
    const u = editing
      ? posts.map(p=>p.id===editing.id?{...p,...form}:p)
      : [{id:Date.now(),...form,date:today},...posts];
    setPosts(u); postsRef.current=u; save(K.posts,u);
    setModal(null); setEditing(null);
    setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});
  };
  const delPost = (id) => {
    const u=posts.filter(p=>p.id!==id); setPosts(u); postsRef.current=u; save(K.posts,u);
    if(detail?.id===id) { setDetailRaw(null); window.history.back(); }
  };

  // ── Calendar helpers ────────────────────────────────────────────────────────
  const saveCalEvent = () => {
    if(!calNewText.trim()||!calModalDate) return;
    const updated = {...calEvents};
    if(!updated[calModalDate]) updated[calModalDate]=[];
    updated[calModalDate] = [...updated[calModalDate], {text:calNewText.trim(), color:calNewColor}];
    setCalEvents(updated); save(K.calendar, updated);
    setCalNewText(""); setCalModalDate(null);
  };
  const delCalEvent = (date, idx) => {
    const updated = {...calEvents};
    updated[date] = updated[date].filter((_,i)=>i!==idx);
    if(!updated[date].length) delete updated[date];
    setCalEvents(updated); save(K.calendar, updated);
    setConfirmAction(null);
  };
  const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); };
  const goToday   = () => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); };

  // ── Confirm-dialog wrappers ─────────────────────────────────────────────────
  const requestEdit   = (p) => setConfirmAction({type:'edit',   data:p});
  const requestDelete = (id,title) => setConfirmAction({type:'delete', data:{id,title}});
  const confirmEdit   = () => { openEdit(confirmAction.data); setConfirmAction(null); };
  const confirmDelete = () => { delPost(confirmAction.data.id); setConfirmAction(null); };
  const openEdit = p => {
    setEditing(p);
    setForm({title:p.title,summary:p.summary,cat:p.cat,subcat:p.subcat||"all",body:p.body||"",img:p.img||"",images:p.images||[],pinned:p.pinned||false,videoUrl:p.videoUrl||""});
    setModal('write');
  };
  const saveProfile = () => { setProfile(prForm); save(K.profile,prForm); setModal(null); };
  const handleImg = async e => {
    const files = Array.from(e.target.files);
    if(!files.length) return;
    if(form.cat === 'photo') {
      // 오늘의 사진: 여러 장
      const newImgs = await Promise.all(files.map(f=>toB64(f)));
      setForm(prev=>({...prev, images:[...(prev.images||[]),...newImgs]}));
    } else {
      // 다른 카테고리: 대표 이미지 1장
      const b64 = await toB64(files[0]);
      setForm(prev=>({...prev, img:b64}));
    }
  };
  const handleAvatar = async e => {
    const f=e.target.files[0]; if(!f)return;
    const b64 = await toB64(f);
    const u = {...profile, avatar:b64};
    setProfile(u); save(K.profile, u);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const EMO={insight:'💡',inspiration:'✨',career:'💼',study:'📚',daily:'☀️',photo:'📷'};
  const isAll = activeCat==="all";
  const catInfo = CAT[activeCat];
  const subcats = !isAll ? SUBCATS[activeCat]||[] : [];
  const catFiltered = isAll ? posts : posts.filter(p=>p.cat===activeCat);
  const filtered = activeSub==="all" ? catFiltered : catFiltered.filter(p=>p.subcat===activeSub);
  const pinned = isAll ? (filtered.find(p=>p.pinned)||filtered[0]) : null;
  const rest = pinned ? filtered.filter(p=>p!==pinned) : filtered;
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  const stocks = market==="sp500" ? SP500_DATA : KOSPI_DATA;
  const idxAll = market==="sp500" ? SP500_INDEX : KOSPI_INDEX;
  const cur = stocks[selStock];
  const periodDays = PERIODS.find(p=>p.id===period)?.days||7;
  const curCandles = sliceByCalendarDays(cur.candles, periodDays);
  const idxSliced  = sliceByCalendarDays(idxAll, periodDays);
  const curLast  = curCandles.length ? curCandles[curCandles.length-1].c : cur.candles[cur.candles.length-1].c;
  const curFirst = curCandles.length > 1 ? curCandles[0].c : curLast;
  const curChg   = ((curLast-curFirst)/curFirst*100).toFixed(2);
  const idxLast  = idxSliced.length ? idxSliced[idxSliced.length-1].c : idxAll[idxAll.length-1].c;
  const idxFirst = idxSliced.length > 1 ? idxSliced[0].c : idxLast;
  const idxChg   = ((idxLast-idxFirst)/idxFirst*100).toFixed(2);

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888'}}>불러오는 중...</div>;

  // ── Video render helper ─────────────────────────────────────────────────────
  const renderVideo = (post) => {
    const v = parseVideoUrl(post.videoUrl);
    if(!v) return null;
    if(v.type==='youtube'||v.type==='shorts') return (
      <div className="video-embed">
        <iframe src={`https://www.youtube.com/embed/${v.id}`} allowFullScreen title={post.title}/>
      </div>
    );
    return (
      <a href={v.url} target="_blank" rel="noreferrer" className="video-link-card" onClick={e=>e.stopPropagation()}>
        <div className="video-link-icon">{v.type==='instagram'?'📸':'🔗'}</div>
        <div>
          <div className="video-link-type">{v.type==='instagram'?'Instagram Reels':'외부 링크'}</div>
          <div className="video-link-url">{v.url}</div>
        </div>
      </a>
    );
  };

  const subcatLabel = (p) => {
    const subs = SUBCATS[p.cat]||[];
    const s = subs.find(s=>s.id===p.subcat);
    return s && s.id!=='all' ? s.label : null;
  };

  return (<>
    <style>{CSS}</style>

    {/* ── HEADER ── */}
    <header className="header">
      <div className="header-inner">
        <span className="logo" onClick={()=>{navToCat("all");setShowAllMode(false);}}>dlwnsleejun</span>
        <nav className="nav">
          {CATS.map(c=><button key={c.id} className={`nav-link ${activeCat===c.id&&!detail?'active':''}`} onClick={()=>navToCat(c.id)}>{c.label}</button>)}
        </nav>
        <div className="header-actions">
          <span style={{fontSize:'0.78rem',color:'var(--muted)',fontWeight:500,marginRight:4}}>{getTodayKr()}</span>
          <button className="btn btn-outline" onClick={()=>{setPrForm({...profile});setModal('profile');}}>프로필</button>
          <button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:isAll?"insight":activeCat,subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>+ 글쓰기</button>
        </div>
      </div>
    </header>

    {/* ── DETAIL ── */}
    {detail && !modal && (
      <div className="fade">
        <div className="detail-page">
          <div className="detail-back" onClick={()=>window.history.back()}>← 뒤로가기</div>
          <div className="detail-cat" style={{color:CAT[detail.cat]?.color}}>{CAT[detail.cat]?.label}{subcatLabel(detail)?` · ${subcatLabel(detail)}`:''}</div>
          <h1 className="detail-title">{detail.title}</h1>
          <div className="detail-meta">
            <span>{fmtDate(detail.date)}</span>
            <button className="btn-sm" onClick={()=>requestEdit(detail)}>수정</button>
            <button className="btn-del-sm" onClick={()=>requestDelete(detail.id,detail.title)}>삭제</button>
          </div>
          {detail.videoUrl && renderVideo(detail)}
          {detail.cat==='photo' && (detail.images||[]).length>0 ? (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8,marginBottom:22}}>
              {(detail.images||[]).map((src,i)=>(
                <img key={i} src={src} alt="" style={{width:'100%',height:200,objectFit:'cover',borderRadius:6,display:'block'}}/>
              ))}
            </div>
          ) : detail.img ? <img className="detail-img" src={detail.img} alt=""/> : null}
          <div className="detail-body">
            {(detail.body||detail.summary).split(/\n+/).filter(s=>s.trim()).map((para,i)=>(
              <p key={i} style={{marginBottom:'1.2em'}}>{para}</p>
            ))}
          </div>
        </div>
      </div>
    )}

    {!detail && (<>
      {/* ── HERO ── */}
      {isAll && (
        <section className="hero" style={{background:"linear-gradient(135deg,#0a1628 0%,#0052CC 50%,#004494 100%)"}}>
          <div className="hero-bg" style={{backgroundImage:HERO_BG?`url(${HERO_BG})`:'none'}}/>
          <div className="hero-inner">
            <div className="hero-content">
              <h1>이준 기록집</h1>
              <div className="hero-actions" style={{marginTop:24}}>
                <button className="btn btn-lg btn-white" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>+ 새 글 작성</button>
                <button className="btn btn-lg btn-outline-white" onClick={()=>{navToCat("all");setShowAllMode(true);}}>전체 글 보기</button>
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-avatar" onClick={()=>avatarRef.current.click()}>
                {profile.avatar?<img src={profile.avatar} alt=""/>:profile.name[0]?.toUpperCase()}
                <div className="hero-avatar-ov">변경</div>
                <input ref={avatarRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleAvatar}/>
              </div>
              <div className="hero-card-name">{profile.name}</div>
              <div className="hero-card-tag">{profile.tagline}</div>
            </div>
          </div>
        </section>
      )}

      {/* ── CATEGORY HERO ── */}
      {!isAll && catInfo && (
        <section className="cat-hero">
          <div className="cat-hero-inner">
            <h1 className="cat-hero-title" style={{color:catInfo.color}}>{catInfo.label}</h1>
            <p className="cat-hero-desc">{catInfo.desc}</p>
            <div className="cat-hero-stats">
              <div className="cat-stat">
                <div>
                  <div className="cat-stat-num" style={{color:catInfo.color}}>{catFiltered.length}</div>
                  <div className="cat-stat-label">총 게시물</div>
                </div>
              </div>
              {catFiltered.length>0&&(
                <div className="cat-stat">
                  <div>
                    <div className="cat-stat-num" style={{color:catInfo.color}}>
                      {fmtDate([...catFiltered].sort((a,b)=>b.date.localeCompare(a.date))[0].date).slice(0,7)}
                    </div>
                    <div className="cat-stat-label">최근 업데이트</div>
                  </div>
                </div>
              )}
            </div>
            {/* ── 서브카테고리 탭 ── */}
            {subcats.length>0&&(
              <div className="subcat-tabs">
                {subcats.map(s=>(
                  <button key={s.id}
                    className={`subcat-tab ${activeSub===s.id?'active':''}`}
                    style={activeSub===s.id?{color:catInfo.color}:{}}
                    onClick={()=>{ setSubRaw(s.id); pushState({cat:activeCat,subcat:s.id!=="all"?s.id:null,postId:null}); }}>
                    {s.label}
                    <span style={{marginLeft:4,fontSize:'0.68rem',opacity:0.6}}>
                      {s.id==="all"?catFiltered.length:catFiltered.filter(p=>p.subcat===s.id).length}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── STATS BAR ── */}
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


      {/* ── CALENDAR ── */}
      {isAll && (
        <section className="calendar-section">
          <div className="calendar-inner" style={{paddingBottom:32}}>
            <div className="section-head" style={{marginBottom:16}}>
              <div><div className="section-title">📅 일정 캘린더</div><div className="section-sub">날짜를 클릭해 일정을 추가하세요</div></div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button className="cal-today-btn" onClick={goToday}>TODAY</button>
                <button className="cal-btn" onClick={prevMonth}>‹</button>
                <span style={{fontFamily:"'Montserrat',sans-serif",fontWeight:700,fontSize:'1rem',minWidth:80,textAlign:'center'}}>{calYear}년 {calMonth+1}월</span>
                <button className="cal-btn" onClick={nextMonth}>›</button>
              </div>
            </div>
            {/* Day of week header */}
            <div className="cal-grid">
              {['일','월','화','수','목','금','토'].map(d=><div key={d} className="cal-dow">{d}</div>)}
            </div>
            {/* Calendar cells */}
            {(()=>{
              const firstDay = new Date(calYear, calMonth, 1).getDay();
              const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
              const prevDays = new Date(calYear, calMonth, 0).getDate();
              const today = new Date(); const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
              const cells = [];
              // prev month days
              for(let i=0;i<firstDay;i++) cells.push({day:prevDays-firstDay+1+i, cur:false, key:null});
              // current month
              for(let d=1;d<=daysInMonth;d++){
                const key=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                cells.push({day:d,cur:true,key});
              }
              // next month
              let n=1; while(cells.length%7!==0) cells.push({day:n++,cur:false,key:null});
              return (
                <div className="cal-grid">
                  {cells.map((c,i)=>{
                    const evs = c.key?(calEvents[c.key]||[]):[];
                    const isToday = c.key===todayStr;
                    return (
                      <div key={i}
                        className={`cal-cell${!c.cur?' other-month':''}${isToday?' today':''}`}
                        onClick={()=>{ if(c.cur){ setCalModalDate(c.key); setCalNewText(""); setCalNewColor("#0052CC"); } }}
                      >
                        <div className="cal-day">
                          {isToday ? <span className="cal-day-inner">{c.day}</span> : c.day}
                        </div>
                        <div className="cal-events">
                          {evs.slice(0,3).map((ev,ei)=>(
                            <div key={ei} className="cal-ev" style={{background:ev.color+'22',color:ev.color,borderLeft:`3px solid ${ev.color}`}}>
                              <span style={{overflow:'hidden',textOverflow:'ellipsis',flex:1}}>{ev.text}</span>
                              <span className="cal-ev-x" onClick={e=>{e.stopPropagation();setConfirmAction({type:'calDel',data:{date:c.key,idx:ei}});}}>×</span>
                            </div>
                          ))}
                          {evs.length>3&&<div className="cal-more">+{evs.length-3}개</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* ── STOCK ── */}
      {isAll && (
        <section className="stock-section">
          <div className="stock-inner">
            <div className="section-head">
              <div><div className="section-title">마켓 인사이트</div><div className="section-sub">시뮬레이션 데이터</div></div>
              <div className="market-tabs">
                <button className={`market-tab ${market==='sp500'?'active':''}`} onClick={()=>{setMarket('sp500');setSelStock(0);}}>S&P 500</button>
                <button className={`market-tab ${market==='kospi'?'active':''}`} onClick={()=>{setMarket('kospi');setSelStock(0);}}>KOSPI</button>
              </div>
            </div>
            <div className="index-cards">
              {/* S&P500 or KOSPI 인덱스 카드 */}
              <div className="index-card">
                <div className="index-card-top">
                  <div className="idx-info">
                    <h3>{market==='sp500'?'S&P 500':'KOSPI'} Index</h3>
                    <div className="idx-val">{market==='sp500'?idxLast.toFixed(0):Math.round(idxLast).toLocaleString()}</div>
                    <div className={`idx-chg ${parseFloat(idxChg)>=0?'up':'dn'}`}>
                      {parseFloat(idxChg)>=0?'▲':'▼'} {Math.abs(idxChg)}%
                      <span style={{fontWeight:400,fontSize:'0.75rem',color:'var(--muted)',marginLeft:6}}>{PERIODS.find(p=>p.id===period)?.label} 기준</span>
                    </div>
                  </div>
                </div>
                <IndexMiniChart
                  key={`idx-${market}-${period}`}
                  candles={idxSliced}
                  up={parseFloat(idxChg)>=0}
                />
                <div className="idx-dates">
                  <span>{idxSliced[0]?.d||''}</span>
                  <span style={{marginLeft:'auto'}}>{idxSliced[idxSliced.length-1]?.d||''}</span>
                </div>
              </div>
              {/* 선택 종목 카드 */}
              <div className="index-card">
                <div className="index-card-top">
                  <div className="idx-info">
                    <h3>{cur.name} ({cur.ticker})</h3>
                    <div className="idx-val">{market==='sp500'?'$':''}{curLast>=1000?Math.round(curLast).toLocaleString():curLast.toFixed(2)}{market==='kospi'?'원':''}</div>
                    <div className={`idx-chg ${parseFloat(curChg)>=0?'up':'dn'}`}>
                      {parseFloat(curChg)>=0?'▲':'▼'} {Math.abs(curChg)}%
                      <span style={{fontWeight:400,fontSize:'0.75rem',color:'var(--muted)',marginLeft:6}}>{PERIODS.find(p=>p.id===period)?.label} 기준</span>
                    </div>
                  </div>
                </div>
                <IndexMiniChart
                  key={`cur-${market}-${selStock}-${period}`}
                  candles={curCandles}
                  up={parseFloat(curChg)>=0}
                />
                <div className="idx-dates">
                  <span>{curCandles[0]?.d||''}</span>
                  <span style={{marginLeft:'auto'}}>{curCandles[curCandles.length-1]?.d||''}</span>
                </div>
              </div>
            </div>
            <div className="chart-box">
              <div className="chart-header">
                <div className="chart-info">
                  <span style={{fontWeight:700,fontSize:'0.88rem'}}>{cur.name} ({cur.ticker})</span>
                  <span className={`chart-chg-big ${parseFloat(curChg)>=0?'up':'dn'}`}>{parseFloat(curChg)>=0?'▲':'▼'} {Math.abs(curChg)}%</span>
                  <span className="chart-range-label">{PERIODS.find(p=>p.id===period)?.label} 기준</span>
                </div>
                <div className="period-tabs">
                  {PERIODS.map(p=><button key={p.id} className={`period-tab ${period===p.id?'active':''}`} onClick={()=>setPeriod(p.id)}>{p.label}</button>)}
                </div>
              </div>
              <MainChart key={`${market}-${selStock}-${period}`} candles={curCandles} color={cur.color}/>
            </div>
            <div className="stocks-grid">
              {stocks.map((s,i)=>{
                const last=s.candles[s.candles.length-1].c, prev=s.candles[s.candles.length-2].c;
                const chg=((last-prev)/prev*100).toFixed(2), up=parseFloat(chg)>=0;
                return (<div key={s.ticker} className={`stock-card ${selStock===i?'selected':''}`} onClick={()=>setSelStock(i)}>
                  <div className="stock-ticker" style={{color:s.color}}>{s.ticker}</div>
                  <div className="stock-name">{s.name}</div>
                  <div className="stock-price">{market==='sp500'?'$':''}{last>=1000?Math.round(last).toLocaleString():last.toFixed(2)}</div>
                  <div className={`stock-chg ${up?'up':'dn'}`}>{up?'▲':'▼'} {Math.abs(chg)}%</div>
                  <Sparkline candles={s.candles} color={up?'#DE350B':'#00875A'} width={130} height={28}/>
                </div>);
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── CONTENT ── */}
      <section className="content-section">
        <div className={isAll?"content-inner fade":"content-full fade"}>
          {isAll ? (
            <>
              {/* 전체 글 보기 모드 - 날짜별 묶음 */}
              {showAllMode ? (
                <div style={{gridColumn:'1/-1'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
                    <h2 style={{fontFamily:"'Montserrat',sans-serif",fontSize:'1.2rem',fontWeight:700}}>전체 글 보기</h2>
                    <span style={{fontSize:'0.78rem',color:'var(--muted)'}}>총 {posts.length}개 · 날짜별 최신순</span>
                    <button className="btn btn-outline" style={{padding:'5px 12px',fontSize:'0.75rem',marginLeft:'auto'}} onClick={()=>setShowAllMode(false)}>← 홈으로</button>
                  </div>
                  {(()=>{
                    const grouped={};
                    [...posts].sort((a,b)=>b.date.localeCompare(a.date)).forEach(p=>{
                      if(!grouped[p.date]) grouped[p.date]=[];
                      grouped[p.date].push(p);
                    });
                    const dates=Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
                    if(!dates.length) return <div className="empty"><div className="empty-icon">📝</div><div className="empty-title">아직 작성된 글이 없어요</div></div>;
                    return dates.map(date=>(
                      <div key={date} style={{marginBottom:32}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                          <span style={{fontFamily:"'Montserrat',sans-serif",fontSize:'0.88rem',fontWeight:700,color:'var(--sub)'}}>{fmtDate(date)}</span>
                          <div style={{flex:1,height:1,background:'var(--border)'}}/>
                          <span style={{fontSize:'0.7rem',color:'var(--muted)'}}>{grouped[date].length}개</span>
                        </div>
                        <div className="posts-grid">
                          {grouped[date].map(p=>(
                            <div key={p.id} className="post-card" onClick={()=>navToPost(p)}>
                              <div className="pc-thumb">{p.img?<img src={p.img} alt=""/>:EMO[p.cat]}{p.videoUrl&&<div className="video-badge">▶ VIDEO</div>}</div>
                              <div className="pc-body">
                                <div className="pc-cat" style={{color:CAT[p.cat]?.color}}>{CAT[p.cat]?.label}</div>
                                <div className="pc-title">{p.title}</div>
                                <div className="pc-sum">{p.summary}</div>
                                <div className="pc-meta"><span>{fmtDate(p.date)}</span>
                                  <div className="pc-actions" onClick={e=>e.stopPropagation()}>
                                    <button className="btn-sm" onClick={()=>requestEdit(p)}>수정</button>
                                    <button className="btn-del-sm" onClick={()=>requestDelete(p.id,p.title)}>삭제</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
              <div>
                {pinned&&(
                  <div className="featured" onClick={()=>navToPost(pinned)}>
                    <div className="featured-body">
                      <div className="f-cat" style={{color:CAT[pinned.cat]?.color}}>{CAT[pinned.cat]?.label}</div>
                      <div className="f-title">{pinned.title}</div>
                      <div className="f-sum">{pinned.summary}</div>
                      <div className="f-meta"><span>{fmtDate(pinned.date)}</span>
                        <div className="f-actions" onClick={e=>e.stopPropagation()} style={{display:'flex',gap:5}}>
                          <button className="btn-sm" onClick={()=>requestEdit(pinned)}>수정</button>
                          <button className="btn-del-sm" onClick={()=>requestDelete(pinned.id,pinned.title)}>삭제</button>
                        </div>
                      </div>
                    </div>
                    <div className="featured-img">
                      {pinned.cat==='photo'&&(pinned.images||[]).length>0?(
                        <img src={pinned.images[0]} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      ):pinned.img?<img src={pinned.img} alt=""/>:EMO[pinned.cat]}
                      {pinned.videoUrl&&<div className="video-badge">▶ VIDEO</div>}
                    </div>
                  </div>
                )}
                {rest.length>0&&(
                  <div className="posts-grid">
                    {rest.map(p=>(
                      <div key={p.id} className="post-card" onClick={()=>navToPost(p)}>
                        <div className="pc-thumb">
                          {p.img?<img src={p.img} alt=""/>:EMO[p.cat]}
                          {p.videoUrl&&<div className="video-badge">▶ VIDEO</div>}
                        </div>
                        <div className="pc-body">
                          <div className="pc-cat" style={{color:CAT[p.cat]?.color}}>{CAT[p.cat]?.label}</div>
                          <div className="pc-title">{p.title}</div>
                          <div className="pc-sum">{p.summary}</div>
                          <div className="pc-meta"><span>{fmtDate(p.date)}</span>
                            <div className="pc-actions" onClick={e=>e.stopPropagation()}>
                              <button className="btn-sm" onClick={()=>requestEdit(p)}>수정</button>
                              <button className="btn-del-sm" onClick={()=>requestDelete(p.id,p.title)}>삭제</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!pinned&&rest.length===0&&<div className="empty">📝<br/><br/>첫 번째 글을 작성해보세요!</div>}
              </div>
              )}
              <aside className="sidebar">
                <div className="side-box">
                  <div className="profile-box">
                    <div className="profile-mini-avatar">{profile.avatar?<img src={profile.avatar} alt=""/>:profile.name[0]?.toUpperCase()}</div>
                    <div className="profile-mini-name">{profile.name}</div>
                    <div className="profile-mini-tag">{profile.tagline}</div>
                  </div>
                </div>
                <div className="side-box">
                  <div className="side-head">최근 게시글<span className="side-more" onClick={()=>navToCat("all")}>전체보기</span></div>
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
                    <div className="pc-thumb">
                      {p.img?<img src={p.img} alt=""/>:EMO[p.cat]}
                      {p.videoUrl&&<div className="video-badge">▶ VIDEO</div>}
                    </div>
                    <div className="pc-body">
                      <div className="pc-cat" style={{color:catInfo.color}}>{catInfo.label}</div>
                      {subcatLabel(p)&&<div className="pc-sub">{subcatLabel(p)}</div>}
                      <div className="pc-title">{p.title}</div>
                      <div className="pc-sum">{p.summary}</div>
                      <div className="pc-meta"><span>{fmtDate(p.date)}</span>
                        <div className="pc-actions" onClick={e=>e.stopPropagation()}>
                          <button className="btn-sm" onClick={()=>requestEdit(p)}>수정</button>
                          <button className="btn-del-sm" onClick={()=>requestDelete(p.id,p.title)}>삭제</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon">{EMO[activeCat]}</div>
                <div className="empty-title">
                  {activeSub!=="all" ? `${subcats.find(s=>s.id===activeSub)?.label} 글이 아직 없어요` : `아직 ${catInfo.label}에 글이 없어요`}
                </div>
                <div className="empty-desc">첫 번째 글을 작성해보세요!</div>
                <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:activeCat,subcat:activeSub!=="all"?activeSub:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>+ 첫 글 작성하기</button>
              </div>
            )
          )}
        </div>
      </section>
    </>)}


    {/* ── CALENDAR ADD EVENT MODAL ── */}
    {calModalDate&&(
      <div className="cal-modal-bg" onClick={()=>setCalModalDate(null)}>
        <div className="cal-modal" onClick={e=>e.stopPropagation()}>
          <div className="cal-modal-title">📅 일정 추가</div>
          <div className="cal-modal-date">{calModalDate}</div>
          <input className="cal-modal-inp" placeholder="일정 내용을 입력하세요"
            value={calNewText} onChange={e=>setCalNewText(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&saveCalEvent()} autoFocus/>
          <div className="cal-colors">
            {["#0052CC","#6554C0","#00875A","#FF8B00","#DE350B","#008DA6","#111111"].map(c=>(
              <div key={c} className={`cal-color-dot${calNewColor===c?' sel':''}`}
                style={{background:c}} onClick={()=>setCalNewColor(c)}/>
            ))}
          </div>
          <div className="cal-modal-btns">
            <button className="btn btn-outline" style={{padding:'7px 14px',fontSize:'0.78rem'}} onClick={()=>setCalModalDate(null)}>취소</button>
            <button className="btn btn-primary" style={{padding:'7px 14px',fontSize:'0.78rem'}} onClick={saveCalEvent} disabled={!calNewText.trim()}>추가</button>
          </div>
        </div>
      </div>
    )}

    {/* ── CONFIRM DIALOG ── */}
    {confirmAction&&(
      <div className="confirm-modal-bg" onClick={()=>setConfirmAction(null)}>
        <div className="confirm-modal" onClick={e=>e.stopPropagation()}>
          {confirmAction.type==='edit'&&<>
            <div className="confirm-modal-title">✏️ 글 수정</div>
            <div className="confirm-modal-desc">이 글을 수정하시겠습니까?<br/><b>"{confirmAction.data.title}"</b></div>
            <div className="confirm-modal-btns">
              <button className="btn btn-outline" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={()=>setConfirmAction(null)}>취소</button>
              <button className="btn btn-primary" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={confirmEdit}>수정하기</button>
            </div>
          </>}
          {confirmAction.type==='delete'&&<>
            <div className="confirm-modal-title">🗑 글 삭제</div>
            <div className="confirm-modal-desc">이 글을 삭제하시겠습니까?<br/>삭제된 글은 복구할 수 없습니다.<br/><b>"{confirmAction.data.title}"</b></div>
            <div className="confirm-modal-btns">
              <button className="btn btn-outline" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={()=>setConfirmAction(null)}>취소</button>
              <button className="btn" style={{padding:'8px 14px',fontSize:'0.8rem',background:'var(--red)',color:'#fff'}} onClick={confirmDelete}>삭제하기</button>
            </div>
          </>}
          {confirmAction.type==='calDel'&&<>
            <div className="confirm-modal-title">🗓 일정 삭제</div>
            <div className="confirm-modal-desc">이 일정을 삭제하시겠습니까?</div>
            <div className="confirm-modal-btns">
              <button className="btn btn-outline" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={()=>setConfirmAction(null)}>취소</button>
              <button className="btn" style={{padding:'8px 14px',fontSize:'0.8rem',background:'var(--red)',color:'#fff'}} onClick={()=>delCalEvent(confirmAction.data.date,confirmAction.data.idx)}>삭제하기</button>
            </div>
          </>}
        </div>
      </div>
    )}

    <footer><b>dlwnsleejun.com</b> — 이준 기록집</footer>

    {/* ── WRITE MODAL ── */}
    {modal==='write'&&(
      <div className="modal-bg" onClick={()=>setModal(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head"><div className="modal-title">{editing?'글 수정':'새 글 작성'}</div><button className="modal-x" onClick={()=>setModal(null)}>✕</button></div>
          <div className="modal-body">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div className="fg"><label>카테고리</label>
                <select value={form.cat} onChange={e=>setForm({...form,cat:e.target.value,subcat:"all"})}>
                  {CATS.slice(1).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="fg"><label>서브카테고리</label>
                <select value={form.subcat} onChange={e=>setForm({...form,subcat:e.target.value})}>
                  {(SUBCATS[form.cat]||[]).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="fg"><label>제목</label><input type="text" value={form.title} placeholder="제목을 입력하세요" onChange={e=>setForm({...form,title:e.target.value})}/></div>
            <div className="fg"><label>요약</label><textarea rows={2} value={form.summary} placeholder="한 줄 요약" onChange={e=>setForm({...form,summary:e.target.value})}/></div>
            <div className="fg"><label>본문</label><textarea rows={5} value={form.body} placeholder="내용을 작성하세요" onChange={e=>setForm({...form,body:e.target.value})}/></div>
            {(form.cat==='inspiration') && (
              <div className="fg">
                <label>영상 URL (유튜브 / 쇼츠 / 인스타 릴스)</label>
                <input type="text" value={form.videoUrl} placeholder="https://www.youtube.com/watch?v=... 또는 https://www.instagram.com/reel/..." onChange={e=>setForm({...form,videoUrl:e.target.value})}/>
                <div className="video-hint">유튜브, 유튜브 쇼츠, 인스타그램 릴스 링크를 입력하세요</div>
              </div>
            )}
            <div className="fg">
              <label>대표 이미지</label>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <button className="btn btn-outline" style={{padding:'7px 12px',fontSize:'0.76rem'}} onClick={()=>imgRef.current.click()}>{form.cat==="photo"?"사진 여러 장 선택":"파일 선택"}</button>
                {form.img&&<span style={{fontSize:'0.7rem',color:'var(--green)'}}>✓ 업로드됨</span>}
              </div>
              {form.cat==='photo'&&(form.images||[]).length>0&&(
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:8}}>
                  {(form.images||[]).map((src,i)=>(
                    <div key={i} style={{position:'relative'}}>
                      <img src={src} alt="" style={{width:'100%',height:70,objectFit:'cover',borderRadius:4,display:'block'}}/>
                      <button onClick={()=>setForm(prev=>({...prev,images:prev.images.filter((_,j)=>j!==i)}))}
                        style={{position:'absolute',top:2,right:2,background:'rgba(0,0,0,0.6)',color:'#fff',border:'none',borderRadius:'50%',width:18,height:18,fontSize:'0.6rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {form.cat!=='photo'&&form.img&&<img src={form.img} alt="" style={{width:'100%',maxHeight:140,objectFit:'cover',marginTop:8,borderRadius:6}}/>}
              <input ref={imgRef} type="file" accept="image/*" multiple={form.cat==='photo'} style={{display:'none'}} onChange={handleImg}/>
            </div>
            <div className="fg" style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="checkbox" id="pin" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})} style={{width:'auto',margin:0}}/>
              <label htmlFor="pin" style={{margin:0,cursor:'pointer',fontSize:'0.83rem'}}>대표 글로 고정 (전체 페이지)</label>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-outline" onClick={()=>setModal(null)}>취소</button>
            <button className="btn btn-primary" onClick={savePost} disabled={!form.title} style={{opacity:form.title?1:0.4}}>저장</button>
          </div>
        </div>
      </div>
    )}

    {/* ── PROFILE MODAL ── */}
    {modal==='profile'&&(
      <div className="modal-bg" onClick={()=>setModal(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
          <div className="modal-head"><div className="modal-title">프로필 편집</div><button className="modal-x" onClick={()=>setModal(null)}>✕</button></div>
          <div className="modal-body">
            {[['name','이름'],['tagline','한 줄 소개']].map(([k,lb])=>(
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
