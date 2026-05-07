import { useState, useEffect, useRef, useCallback } from "react";

// ─── Supabase Config ──────────────────────────────────────────────────────────
// ⚠️  【필수】 아래 두 줄을 본인의 Supabase 실제 값으로 교체하세요
// Supabase 대시보드 → Settings → API 에서 확인
const SUPA_URL = "https://uxqbfbjniweabkecfhjp.supabase.co"; // ← 실제 Project URL
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cWJmYmpuaXdlYWJrZWNmaGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTYyMjQsImV4cCI6MjA5MzY3MjIyNH0.b9_xAWctaWOB8n4fOuopfKqj-2GC-GHTQp2fXpRn0TE"; // ← 실제 anon public key
const OWNER_ID = "dlwnsleejun"; // 고정값, 변경 금지

// ─── Supabase REST helpers ────────────────────────────────────────────────────
const H = () => ({
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "return=representation",
});

async function dbGet(table, filter = "") {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}&limit=1`, { headers: H() });
    if(!r.ok) return null;
    const arr = await r.json();
    return arr[0] || null;
  } catch { return null; }
}
async function dbGetAll(table, filter = "") {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}&order=created_at.asc&limit=1000`, { headers: H() });
    if(!r.ok) return null;
    return r.json();
  } catch { return null; }
}
async function dbUpsert(table, data) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...H(), "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(data)
    });
    if(!r.ok) { console.error("upsert error:", await r.text()); return null; }
    return r.json();
  } catch(e) { console.error(e); return null; }
}
async function dbDelete(table, filter) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
      method: "DELETE", headers: H()
    });
    return r.ok;
  } catch { return false; }
}

// ─── Migration: 이전 localStorage 데이터 읽기용 ───────────────────────────────
function loadLocal(key) {
  try { const v=localStorage.getItem(key); return v?JSON.parse(v):null; } catch { return null; }
}
const OLD_LS_KEYS = ["dlwns-posts6","dlwns-posts5","dlwns-posts4","dlwns-posts3","dlwns-posts2","dlwns-posts1","dlwns-posts"];
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
  { id:"daily",       label:"하루기록",    color:"#DE350B", desc:"일기와 오늘의 사진을 기록합니다" },
  { id:"baseball",    label:"야구",        color:"#1565C0", desc:"야구 직관 기록과 사진을 담습니다" },
  { id:"music",       label:"뮤직",        color:"#E91E8C", desc:"좋아하는 음악을 플레이리스트로 담습니다" },
];
const CAT = Object.fromEntries(CATS.map(c=>[c.id,c]));

const SUBCATS = {
  insight:     [{ id:"all",label:"전체" },{ id:"it",label:"AI" },{ id:"economy",label:"경제" },{ id:"society",label:"사회" },{ id:"etc",label:"기타" }],
  inspiration: [{ id:"all",label:"전체" },{ id:"video",label:"유튜브/쇼츠" },{ id:"reels",label:"인스타 릴스" },{ id:"book",label:"도서" },{ id:"design",label:"디자인" }],
  career:      [{ id:"all",label:"전체" },{ id:"job",label:"취업/이직" },{ id:"project",label:"프로젝트" },{ id:"cert",label:"자격증" },{ id:"etc",label:"기타" }],
  study:       [{ id:"all",label:"전체" },{ id:"english",label:"영어" },{ id:"japanese",label:"일본어" },{ id:"adsp",label:"ADSP" },{ id:"logistics",label:"물류관리사" },{ id:"book",label:"책" },{ id:"movie",label:"영화" },{ id:"etc",label:"기타" }],
  daily:       [{ id:"all",label:"전체" },{ id:"diary",label:"일기" },{ id:"photo",label:"오늘의 사진" }],
  baseball:    [{ id:"all",label:"전체" },{ id:"game",label:"경기 리뷰" },{ id:"practice",label:"훈련" },{ id:"etc",label:"기타" }],
  music:       [{ id:"all",label:"전체" }],
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
// DEF_POSTS 제거: 샘플 글이 자동으로 올라오는 문제 방지
// Supabase가 비어있거나 로드 실패 시 빈 배열 사용
const DEF_POSTS = [];

function fmtDate(s){ const d=new Date(s); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }

// 오늘 날짜 문자열 (한국어)
function getTodayKr() {
  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// ─── AI Market Data (Anthropic API + Web Search) ──────────────────────────────
// Yahoo Finance CORS 문제 해결: Claude API가 웹검색으로 실시간 데이터 수집
async function fetchMarketDataViaAI() {
  const today = new Date().toISOString().slice(0,10);
  const prompt = `오늘(${today}) 기준 실시간 주식 지수 데이터를 검색해줘.

다음 항목들의 현재가, 전일비(등락률%)를 JSON으로만 응답해. 설명 없이 JSON만.

{
  "sp500": { "price": 숫자, "change_pct": 숫자(%), "prev_close": 숫자 },
  "kospi": { "price": 숫자, "change_pct": 숫자(%), "prev_close": 숫자 },
  "nasdaq": { "price": 숫자, "change_pct": 숫자(%), "prev_close": 숫자 },
  "nvda": { "price": 숫자, "change_pct": 숫자(%), "name": "NVIDIA" },
  "aapl": { "price": 숫자, "change_pct": 숫자(%), "name": "Apple" },
  "tsla": { "price": 숫자, "change_pct": 숫자(%), "name": "Tesla" },
  "samsung": { "price": 숫자, "change_pct": 숫자(%), "name": "삼성전자" },
  "skhynix": { "price": 숫자, "change_pct": 숫자(%), "name": "SK하이닉스" },
  "updated_at": "실제 데이터 기준 시각(한국 기준)"
}

실제 오늘 시장 데이터를 웹에서 검색해서 정확한 수치로 채워줘.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error("API error");
  const data = await response.json();
  // content 블록에서 텍스트 추출
  const texts = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  // JSON 파싱
  const jsonMatch = texts.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]);
}

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

/* ── MUSIC PLAYLIST ── */
.music-playlist{display:flex;flex-direction:column;gap:0;}
.music-item{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.12s;border-radius:0;position:relative;}
.music-item:first-child{border-radius:8px 8px 0 0;}
.music-item:last-child{border-radius:0 0 8px 8px;border-bottom:none;}
.music-item:hover{background:#f8f9ff;}
.music-item.playing{background:#EAF2FF;}
.music-num{width:24px;text-align:center;font-size:0.75rem;color:var(--muted);font-family:'Montserrat',sans-serif;font-weight:600;flex-shrink:0;}
.music-thumb{width:56px;height:56px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#eee;}
.music-thumb-placeholder{width:56px;height:56px;border-radius:6px;background:linear-gradient(135deg,#E91E8C22,#E91E8C44);display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;}
.music-info{flex:1;min-width:0;}
.music-title{font-size:0.88rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.music-sub{font-size:0.72rem;color:var(--muted);margin-top:2px;}
.music-actions{display:flex;gap:5px;opacity:0;transition:opacity 0.12s;}
.music-item:hover .music-actions{opacity:1;}
.music-play-btn{width:36px;height:36px;border-radius:50%;background:#E91E8C;border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;flex-shrink:0;transition:transform 0.12s;}
.music-play-btn:hover{transform:scale(1.1);}
.music-play-btn.active{background:#0052CC;}
.music-section-header{display:flex;align-items:center;gap:12px;margin-bottom:0;padding:16px;background:#fafafa;border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;}
.music-section-header h3{font-size:0.9rem;font-weight:700;margin:0;}
.music-count{font-size:0.72rem;color:var(--muted);background:var(--border);padding:2px 8px;border-radius:10px;}
.music-player-bar{position:fixed;bottom:0;left:0;right:0;background:#111;color:#fff;padding:12px 24px;display:flex;align-items:center;gap:16px;z-index:300;box-shadow:0 -4px 20px rgba(0,0,0,0.3);}
.music-player-info{flex:1;min-width:0;}
.music-player-title{font-size:0.82rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.music-player-sub{font-size:0.68rem;color:#aaa;margin-top:2px;}
.music-player-btns{display:flex;gap:10px;align-items:center;}
.music-player-btn{background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;justify-content:center;transition:all 0.12s;}
.music-player-btn:hover{background:rgba(255,255,255,0.1);}
.music-player-btn.main{background:#E91E8C;border-color:#E91E8C;width:42px;height:42px;font-size:0.9rem;}
.music-close-btn{background:transparent;border:none;color:#aaa;cursor:pointer;font-size:1.1rem;padding:4px;}
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
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
/* ── BASEBALL PHOTOS ── */
.baseball-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:24px;}
.baseball-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block;}
/* ── COMMENT SECTION ── */
.comment-section{margin-top:48px;border-top:1px solid var(--border);padding-top:32px;}
.comment-item{padding:14px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:flex-start;}
.comment-avatar{width:36px;height:36px;border-radius:50%;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:700;flex-shrink:0;color:var(--primary);}
.comment-nick{font-weight:700;font-size:0.82rem;}
.comment-date{font-size:0.7rem;color:var(--muted);}
.comment-body{font-size:0.88rem;line-height:1.7;color:#333;white-space:pre-wrap;margin-top:4px;}
.comment-del{background:none;border:none;color:#ccc;cursor:pointer;font-size:0.8rem;flex-shrink:0;padding:2px 4px;}
.comment-del:hover{color:var(--red);}
.comment-form{margin-top:20px;background:var(--bg);border-radius:8px;padding:20px;border:1px solid var(--border);}
/* ── MUSIC DRAG ── */
.music-item.dragging{opacity:0.4;background:#f0f4ff;}
.music-item.drag-over{border-top:2px solid #E91E8C;}
.music-drag-handle{cursor:grab;color:var(--muted);font-size:0.9rem;padding:0 4px;opacity:0.5;flex-shrink:0;}
.music-drag-handle:hover{opacity:1;}
/* ── MUSIC PLAYER BAR BOTTOM ── */
body.has-player{padding-bottom:76px;}
`;

// ─── AI Market Widget Component ───────────────────────────────────────────────
function MarketTicker({ label, price, changePct, unit="", color="#0052CC" }) {
  const up = parseFloat(changePct) >= 0;
  const sign = up ? "▲" : "▼";
  const chgColor = up ? "#DE350B" : "#00875A";
  return (
    <div style={{background:'#fff',border:'2px solid var(--border)',borderRadius:10,padding:'16px 20px',display:'flex',flexDirection:'column',gap:6,flex:1,minWidth:140,transition:'border-color 0.2s'}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=color}
      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      <div style={{fontSize:'0.7rem',fontWeight:700,color:'var(--muted)',letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</div>
      <div style={{fontSize:'1.35rem',fontWeight:800,fontFamily:'Montserrat, sans-serif',color:'#111',lineHeight:1.1}}>
        {unit}{typeof price==='number' ? price.toLocaleString(undefined,{maximumFractionDigits:2}) : '—'}
      </div>
      <div style={{fontSize:'0.8rem',fontWeight:700,color:chgColor}}>
        {sign} {typeof changePct==='number' ? Math.abs(changePct).toFixed(2) : '0.00'}%
        <span style={{fontSize:'0.68rem',fontWeight:400,color:'var(--muted)',marginLeft:6}}>전일 대비</span>
      </div>
    </div>
  );
}

function AIMarketSection({ marketAI, marketLoading, marketError, onRefresh }) {
  const d = marketAI || {};
  return (
    <section className="stock-section">
      <div className="stock-inner">
        <div className="section-head">
          <div>
            <div className="section-title">마켓 인사이트</div>
            <div className="section-sub" style={{display:'flex',alignItems:'center',gap:6}}>
              {marketLoading ? (
                <><span style={{display:'inline-block',animation:'spin 1s linear infinite'}}>⏳</span> AI가 실시간 데이터를 검색 중...</>
              ) : marketError ? (
                '⚠️ 데이터 로드 실패'
              ) : d.updated_at ? (
                <><span style={{color:'#00875A'}}>✅</span> {d.updated_at} 기준 (AI 웹검색)</>
              ) : 'AI 웹검색으로 실시간 시세 조회'}
            </div>
          </div>
          <button className="btn btn-outline" style={{fontSize:'0.75rem',padding:'6px 14px',display:'flex',alignItems:'center',gap:6}}
            onClick={onRefresh} disabled={marketLoading}>
            <span style={{display:'inline-block',animation:marketLoading?'spin 1s linear infinite':'none'}}>🔄</span>
            {marketLoading ? '조회 중...' : '새로고침'}
          </button>
        </div>

        {marketLoading ? (
          <div style={{textAlign:'center',padding:'56px 0',color:'var(--muted)'}}>
            <div style={{fontSize:'2.5rem',marginBottom:16,display:'inline-block',animation:'spin 2s linear infinite'}}>🤖</div>
            <div style={{fontWeight:700,fontSize:'1rem',marginBottom:6}}>AI가 실시간 시장 데이터를 검색하고 있습니다</div>
            <div style={{fontSize:'0.78rem',color:'#bbb'}}>웹에서 S&P 500, KOSPI, 주요 종목 시세를 가져오는 중...</div>
          </div>
        ) : marketError ? (
          <div style={{textAlign:'center',padding:'48px 0',color:'var(--muted)',background:'#fafafa',borderRadius:8,border:'1px solid var(--border)'}}>
            <div style={{fontSize:'2rem',marginBottom:12}}>📡</div>
            <div style={{fontWeight:700,marginBottom:8}}>AI 검색 연결 실패</div>
            <div style={{fontSize:'0.78rem',lineHeight:1.8,color:'#999',marginBottom:16}}>
              네트워크 상태를 확인하고 새로고침 버튼을 눌러주세요.<br/>
              잠시 후 다시 시도하면 정상 작동합니다.
            </div>
            <button className="btn btn-primary" style={{fontSize:'0.8rem'}} onClick={onRefresh}>🔄 다시 시도</button>
          </div>
        ) : !d.sp500 ? (
          <div style={{textAlign:'center',padding:'48px 0',color:'var(--muted)'}}>
            <div style={{fontSize:'2rem',marginBottom:12}}>📊</div>
            <div style={{marginBottom:16}}>새로고침을 눌러 실시간 시장 데이터를 불러오세요</div>
            <button className="btn btn-primary" style={{fontSize:'0.8rem'}} onClick={onRefresh}>🤖 AI 시세 조회</button>
          </div>
        ) : (
          <>
            {/* 지수 섹션 */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--muted)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10}}>📈 주요 지수</div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                {d.sp500 && <MarketTicker label="S&P 500" price={d.sp500.price} changePct={d.sp500.change_pct} color="#0052CC"/>}
                {d.nasdaq && <MarketTicker label="NASDAQ" price={d.nasdaq.price} changePct={d.nasdaq.change_pct} color="#6554C0"/>}
                {d.kospi && <MarketTicker label="KOSPI" price={d.kospi.price} changePct={d.kospi.change_pct} color="#00875A"/>}
              </div>
            </div>
            {/* 개별 종목 섹션 */}
            <div style={{marginBottom:8}}>
              <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--muted)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10}}>🏢 주요 종목</div>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                {d.nvda && <MarketTicker label={d.nvda.name||"NVIDIA"} price={d.nvda.price} changePct={d.nvda.change_pct} unit="$" color="#76b900"/>}
                {d.aapl && <MarketTicker label={d.aapl.name||"Apple"} price={d.aapl.price} changePct={d.aapl.change_pct} unit="$" color="#555"/>}
                {d.tsla && <MarketTicker label={d.tsla.name||"Tesla"} price={d.tsla.price} changePct={d.tsla.change_pct} unit="$" color="#cc0000"/>}
                {d.samsung && <MarketTicker label={d.samsung.name||"삼성전자"} price={d.samsung.price} changePct={d.samsung.change_pct} color="#1428A0"/>}
                {d.skhynix && <MarketTicker label={d.skhynix.name||"SK하이닉스"} price={d.skhynix.price} changePct={d.skhynix.change_pct} color="#EA001E"/>}
              </div>
            </div>
            <div style={{fontSize:'0.7rem',color:'#bbb',marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)'}}>
              💡 Anthropic API + 웹검색으로 실시간 수집 · 투자 참고용으로만 활용하세요
            </div>
          </>
        )}
      </div>
    </section>
  );
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
  // Music player state
  const [nowPlaying,setNowPlaying] = useState(null); // {post, videoId}
  const [playerPaused,setPlayerPaused] = useState(false);
  // AI Market data state (Anthropic API + 웹검색)
  const [marketAI,setMarketAI]       = useState(null);   // AI가 가져온 시장 데이터
  const [marketLoading,setMarketLoading] = useState(false);
  const [marketError,setMarketError] = useState(false);
  // Comments state
  const [comments,setComments] = useState({}); // postId -> [{id,nick,body,date}]
  const [commentNick,setCommentNick] = useState('');
  const [commentBody,setCommentBody] = useState('');
  // Music drag-n-drop
  const [dragIdx,setDragIdx] = useState(null);
  const imgRef=useRef(); const avatarRef=useRef();
  const postsRef=useRef([]);
  const iframeRef=useRef();
  const contentRef=useRef(); // 전체 글 보기 스크롤 타겟

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
    // ── Supabase에서 데이터 로드 ──────────────────────────────
    setLoading(true);
    (async () => {
      let loaded = [];
      try {
        // 1. 글 로드
        const rows = await dbGetAll("dlwns_posts", `owner=eq.${OWNER_ID}`);
        if(rows && rows.length > 0) {
          // Supabase row → post 객체 변환
          loaded = rows.map(r => ({ ...r.data, id: r.post_id }));
        } else {
          // Supabase가 비어있으면 localStorage 마이그레이션 시도
          // ⚠️ 절대로 DEF_POSTS(샘플글)를 자동 저장하지 않음
          let lsPosts = null;
          for(const k of OLD_LS_KEYS) {
            const old = loadLocal(k);
            if(old && old.length > 0) { lsPosts = old; break; }
          }
          if(lsPosts && lsPosts.length > 0) {
            // localStorage 데이터를 Supabase로 마이그레이션
            for(const p of lsPosts) {
              await dbUpsert("dlwns_posts", { post_id: p.id, owner: OWNER_ID, data: p });
            }
            loaded = lsPosts;
          }
          // localStorage도 없으면 그냥 빈 배열 유지 (샘플글 자동저장 없음)
        }
        setPosts(loaded); postsRef.current = loaded;

        // 2. 프로필 로드
        const profRow = await dbGet("dlwns_profile", `owner=eq.${OWNER_ID}`);
        if(profRow) setProfile(profRow.data);
        else {
          const lsProf = loadLocal("dlwns-profile4") || loadLocal("dlwns-profile3");
          if(lsProf) { setProfile(lsProf); await dbUpsert("dlwns_profile", { owner: OWNER_ID, data: lsProf }); }
        }

        // 3. 캘린더 로드
        const calRow = await dbGet("dlwns_calendar", `owner=eq.${OWNER_ID}`);
        if(calRow) setCalEvents(calRow.data);
        else {
          const lsCal = loadLocal("dlwns-calendar1");
          if(lsCal) { setCalEvents(lsCal); await dbUpsert("dlwns_calendar", { owner: OWNER_ID, data: lsCal }); }
        }

        // 4. 댓글 로드
        const commRow = await dbGet("dlwns_comments", `owner=eq.${OWNER_ID}`);
        if(commRow) setComments(commRow.data || {});
      } catch(e) {
        console.error("Supabase 로드 실패:", e);
        // fallback: localStorage (샘플글 저장 없음)
        for(const k of OLD_LS_KEYS) {
          const old = loadLocal(k);
          if(old && old.length > 0) { loaded = old; setPosts(old); postsRef.current = old; break; }
        }
      } finally {
        setLoading(false);
      }
      // URL 상태 복원 (loaded 변수 사용)
      const init = readState();
      setCatRaw(init.cat); setSubRaw(init.subcat||"all");
      if(init.postId) { const f=loaded.find(p=>p.id===init.postId); if(f) setDetailRaw(f); }
      window.history.replaceState({ cat:init.cat, subcat:init.subcat, postId:init.postId }, "", window.location.href);
    })();
  }, []);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const savePost = async () => {
    const today=new Date().toISOString().slice(0,10);
    const newPost = editing
      ? {...posts.find(p=>p.id===editing.id), ...form}
      : {id:Date.now(),...form,date:today};
    const u = editing
      ? posts.map(p=>p.id===editing.id?newPost:p)
      : [newPost,...posts];
    setPosts(u); postsRef.current=u;
    // Supabase 저장
    await dbUpsert("dlwns_posts", { post_id: newPost.id, owner: OWNER_ID, data: newPost });
    setModal(null); setEditing(null);
    setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});
  };
  const delPost = async (id) => {
    const u=posts.filter(p=>p.id!==id); setPosts(u); postsRef.current=u;
    // Supabase 삭제
    await dbDelete("dlwns_posts", `post_id=eq.${id}&owner=eq.${OWNER_ID}`);
    if(detail?.id===id) { setDetailRaw(null); window.history.back(); }
  };

  // ── Calendar helpers ────────────────────────────────────────────────────────
  const saveCalEvent = async () => {
    if(!calNewText.trim()||!calModalDate) return;
    const updated = {...calEvents};
    if(!updated[calModalDate]) updated[calModalDate]=[];
    updated[calModalDate] = [...updated[calModalDate], {text:calNewText.trim(), color:calNewColor}];
    setCalEvents(updated);
    await dbUpsert("dlwns_calendar", { owner: OWNER_ID, data: updated });
    setCalNewText(""); setCalModalDate(null);
  };
  const delCalEvent = async (date, idx) => {
    const updated = {...calEvents};
    updated[date] = updated[date].filter((_,i)=>i!==idx);
    if(!updated[date].length) delete updated[date];
    setCalEvents(updated);
    await dbUpsert("dlwns_calendar", { owner: OWNER_ID, data: updated });
    setConfirmAction(null);
  };
  const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); };
  const goToday   = () => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); };

  // ── Data Backup (export/import) ──────────────────────────────────────────────
  const exportData = () => {
    const data = { posts, profile, calEvents, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dlwns-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };
  const importData = (e) => { // outer
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(data.posts && Array.isArray(data.posts)){
          setPosts(data.posts); postsRef.current=data.posts;
          for(const p of data.posts) {
            await dbUpsert("dlwns_posts", { post_id: p.id, owner: OWNER_ID, data: p });
          }
        }
        if(data.profile){
          setProfile(data.profile);
          await dbUpsert("dlwns_profile", { owner: OWNER_ID, data: data.profile });
        }
        if(data.calEvents){
          setCalEvents(data.calEvents);
          await dbUpsert("dlwns_calendar", { owner: OWNER_ID, data: data.calEvents });
        }
        alert('데이터가 복원되었습니다!');
      } catch{ alert('파일 형식이 올바르지 않습니다.'); }
    };
    reader.readAsText(file);
  };

  // ── AI Market Data Fetch ────────────────────────────────────────────────────
  const fetchAIMarket = async () => {
    setMarketLoading(true); setMarketError(false);
    try {
      const data = await fetchMarketDataViaAI();
      setMarketAI(data);
    } catch(e) {
      console.error("AI market fetch failed:", e);
      setMarketError(true);
    } finally {
      setMarketLoading(false);
    }
  };
  // 페이지 로드 시 자동으로 AI 마켓 데이터 가져오기
  useEffect(()=>{ fetchAIMarket(); }, []);

  // ── Comment helpers ────────────────────────────────────────────────────────
  const saveComment = async (postId) => {
    if(!commentNick.trim()||!commentBody.trim()) return;
    const newComment = { id:Date.now(), nick:commentNick.trim(), body:commentBody.trim(), date:new Date().toISOString().slice(0,10) };
    const updated = { ...comments, [postId]: [...(comments[postId]||[]), newComment] };
    setComments(updated);
    await dbUpsert("dlwns_comments", { owner: OWNER_ID, data: updated });
    setCommentBody('');
  };
  const delComment = async (postId, commentId) => {
    const updated = { ...comments, [postId]: (comments[postId]||[]).filter(c=>c.id!==commentId) };
    setComments(updated);
    await dbUpsert("dlwns_comments", { owner: OWNER_ID, data: updated });
  };

  // ── Music auto-next (via message event from iframe) ───────────────────────
  // YouTube iframe API로 자동 다음곡 (postMessage 방식)
  useEffect(()=>{
    const handler = (e) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        // YouTube Player State: 0 = ended
        if(data?.event==='onStateChange' && data?.info===0 && nowPlaying) {
          const musicPosts = postsRef.current.filter(p=>p.cat==='music');
          const idx = musicPosts.findIndex(p=>p.id===nowPlaying.post.id);
          const next = musicPosts[(idx+1)%musicPosts.length];
          if(next){const v=parseVideoUrl(next.videoUrl||'');setNowPlaying({post:next,videoId:v?.id});}
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return ()=>window.removeEventListener('message', handler);
  },[nowPlaying]);

  // ── Music drag-n-drop reorder ─────────────────────────────────────────────
  const handleMusicDragStart = (idx) => setDragIdx(idx);
  const handleMusicDragOver  = (e, idx) => { e.preventDefault(); };
  const handleMusicDrop      = async (dropIdx) => {
    if(dragIdx===null||dragIdx===dropIdx) { setDragIdx(null); return; }
    const musicPosts = posts.filter(p=>p.cat==='music');
    const others     = posts.filter(p=>p.cat!=='music');
    const reordered  = [...musicPosts];
    const [moved]    = reordered.splice(dragIdx,1);
    reordered.splice(dropIdx,0,moved);
    // assign new order field
    const now = Date.now();
    const updated = reordered.map((p,i)=>({...p, order: now+i}));
    const newAll = [...others, ...updated];
    setPosts(newAll); postsRef.current=newAll;
    for(const p of updated) await dbUpsert("dlwns_posts",{post_id:p.id,owner:OWNER_ID,data:p});
    setDragIdx(null);
  };

  const requestEdit   = (p) => setConfirmAction({type:'edit',   data:p});
  const requestDelete = (id,title) => setConfirmAction({type:'delete', data:{id,title}});
  const confirmEdit   = () => { openEdit(confirmAction.data); setConfirmAction(null); };
  const confirmDelete = () => { delPost(confirmAction.data.id); setConfirmAction(null); };
  const openEdit = p => {
    setEditing(p);
    setForm({title:p.title,summary:p.summary,cat:p.cat,subcat:p.subcat||"all",body:p.body||"",img:p.img||"",images:p.images||[],pinned:p.pinned||false,videoUrl:p.videoUrl||""});
    setModal('write');
  };
  const saveProfile = async () => {
    setProfile(prForm);
    await dbUpsert("dlwns_profile", { owner: OWNER_ID, data: prForm });
    setModal(null);
  };
  const handleImg = async e => {
    const files = Array.from(e.target.files);
    if(!files.length) return;
    if(form.subcat === 'photo' || form.cat === 'baseball') {
      // 오늘의 사진 & 야구: 여러 장
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
    setProfile(u);
    await dbUpsert("dlwns_profile", { owner: OWNER_ID, data: u });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const EMO={insight:'💡',inspiration:'✨',career:'💼',study:'📚',daily:'☀️',baseball:'⚾',music:'🎵'};
  const isAll = activeCat==="all";
  const catInfo = CAT[activeCat];
  const subcats = !isAll ? SUBCATS[activeCat]||[] : [];
  const catFiltered = isAll ? posts : posts.filter(p=>p.cat===activeCat);
  const filtered = activeSub==="all" ? catFiltered : catFiltered.filter(p=>p.subcat===activeSub);
  const pinned = isAll ? (filtered.find(p=>p.pinned)||filtered[0]) : null;
  const rest = pinned ? filtered.filter(p=>p!==pinned) : filtered;
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  const stocks = [];
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

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
          <input type="file" accept=".json" style={{display:'none'}} id="import-file" onChange={importData}/>
          <button className="btn btn-outline" style={{fontSize:'0.72rem',padding:'6px 10px'}} title="데이터 백업/복구"
            onClick={()=>{
              const choice = window.confirm("📤 내보내기(확인) / 📥 가져오기(취소)\n\n확인: 현재 데이터를 JSON 파일로 저장\n취소: JSON 파일에서 데이터 복원");
              if(choice) exportData();
              else document.getElementById('import-file').click();
            }}>💾 백업</button>
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
          {/* 야구 or 오늘의 사진: 대형 그리드 */}
          {(detail.cat==='baseball' || detail.subcat==='photo') && (detail.images||[]).length>0 ? (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12,marginBottom:24}}>
              {(detail.images||[]).map((src,i)=>(
                <img key={i} src={src} alt="" style={{width:'100%',aspectRatio:'4/3',objectFit:'cover',borderRadius:8,display:'block'}}/>
              ))}
            </div>
          ) : detail.img ? <img className="detail-img" src={detail.img} alt=""/> : null}
          <div className="detail-body">
            {(detail.body||detail.summary).split('\n').map((line,i)=>(
              line.trim()==='' ? <br key={i}/> : <p key={i} style={{margin:0,minHeight:'1.4em'}}>{line}</p>
            ))}
          </div>

          {/* comment section */}
          <div style={{marginTop:48,borderTop:'1px solid var(--border)',paddingTop:32}}>
            <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:20}}>
              {'💬 댓글 ' + (comments[detail.id]||[]).length + '개'}
            </h3>
            {(comments[detail.id]||[]).map(c=>(
              <div key={c.id} style={{padding:'14px 0',borderBottom:'1px solid var(--border)',display:'flex',gap:12,alignItems:'flex-start'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'var(--bg)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem',fontWeight:700,flexShrink:0,color:'var(--primary)'}}>
                  {(c.nick[0]||'?').toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:'0.82rem'}}>{c.nick}</span>
                    <span style={{fontSize:'0.7rem',color:'var(--muted)'}}>{c.date}</span>
                  </div>
                  <div style={{fontSize:'0.88rem',lineHeight:1.7,color:'#333'}}>{c.body}</div>
                </div>
                <button onClick={()=>delComment(detail.id,c.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:'0.8rem',padding:'2px 4px'}}>
                  {'×'}
                </button>
              </div>
            ))}
            {(comments[detail.id]||[]).length === 0 && (
              <div style={{color:'var(--muted)',fontSize:'0.85rem',padding:'16px 0',textAlign:'center'}}>
                {'아직 댓글이 없어요. 첫 번째 댓글을 남겨보세요!'}
              </div>
            )}
            <div style={{marginTop:20,background:'var(--bg)',borderRadius:8,padding:20,border:'1px solid var(--border)'}}>
              <div style={{display:'grid',gridTemplateColumns:'160px 1fr',gap:10,marginBottom:10}}>
                <input
                  type="text"
                  value={commentNick}
                  onChange={e=>setCommentNick(e.target.value)}
                  placeholder="닉네임"
                  style={{border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',fontSize:'0.84rem',outline:'none'}}
                />
                <div style={{fontSize:'0.72rem',color:'var(--muted)',display:'flex',alignItems:'center'}}>
                  {'누구든지 댓글을 남길 수 있어요'}
                </div>
              </div>
              <textarea
                rows={3}
                value={commentBody}
                onChange={e=>setCommentBody(e.target.value)}
                placeholder="댓글을 작성하세요..."
                style={{width:'100%',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',fontSize:'0.84rem',outline:'none',resize:'vertical',marginBottom:10}}
              />
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button
                  className="btn btn-primary"
                  onClick={()=>saveComment(detail.id)}
                  disabled={!(commentNick.trim() && commentBody.trim())}
                  style={{opacity:(commentNick.trim() && commentBody.trim()) ? 1 : 0.4}}
                >
                  {'댓글 등록'}
                </button>
              </div>
            </div>
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
                <button className="btn btn-lg btn-white" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>{'+ 새 글 작성'}</button>
                <button className="btn btn-lg btn-outline-white" onClick={()=>{
                  setShowAllMode(true);
                  setTimeout(()=>{
                    if(contentRef.current) {
                      contentRef.current.scrollIntoView({behavior:'smooth', block:'start'});
                    }
                  }, 80);
                }}>{'전체 글 보기'}</button>
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
                <span style={{fontFamily:'Montserrat, sans-serif',fontWeight:700,fontSize:'1rem',minWidth:80,textAlign:'center'}}>{calYear}년 {calMonth+1}월</span>
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

      {/* ── STOCK (AI Market) ── */}
      {isAll && (
        <AIMarketSection
          marketAI={marketAI}
          marketLoading={marketLoading}
          marketError={marketError}
          onRefresh={fetchAIMarket}
        />
      )}

      {/* ── CONTENT ── */}
      <section className="content-section" ref={contentRef}>
        <div className={isAll?"content-inner fade":"content-full fade"}>
          {isAll ? (
            <>
              {/* 전체 글 보기 모드 - 날짜별 묶음 */}
              {showAllMode ? (
                <div style={{gridColumn:'1/-1'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
                    <h2 style={{fontFamily:'Montserrat, sans-serif',fontSize:'1.2rem',fontWeight:700}}>전체 글 보기</h2>
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
                          <span style={{fontFamily:'Montserrat, sans-serif',fontSize:'0.88rem',fontWeight:700,color:'var(--sub)'}}>{fmtDate(date)}</span>
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
                      {pinned.subcat==='photo'&&(pinned.images||[]).length>0?(
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
            activeCat==='music' ? (
              /* ── MUSIC PLAYLIST VIEW ── */
              <div style={{gridColumn:'1/-1'}}>
                {filtered.length>0 ? (
                  <>
                    <div className="music-section-header">
                      <span style={{fontSize:'1.4rem'}}>🎵</span>
                      <h3>플레이리스트</h3>
                      <span className="music-count">{filtered.length}곡</span>
                    </div>
                    {/* 인라인 플레이어 */}
                    {nowPlaying&&(
                      <div style={{background:'#000',borderRadius:'0 0 0 0',overflow:'hidden',position:'relative',marginBottom:0}}>
                        <div style={{aspectRatio:'16/9',width:'100%'}}>
                          <iframe
                            key={nowPlaying.videoId}
                            ref={iframeRef}
                            src={`https://www.youtube.com/embed/${nowPlaying.videoId}?autoplay=1&rel=0&enablejsapi=1`}
                            style={{width:'100%',height:'100%',border:'none',display:'block'}}
                            allowFullScreen allow="autoplay; encrypted-media" title={nowPlaying.post.title}/>
                        </div>
                        <div style={{background:'#111',padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontSize:'1rem'}}>🎵</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:'0.85rem',fontWeight:700,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{nowPlaying.post.title}</div>
                            {nowPlaying.post.summary&&<div style={{fontSize:'0.72rem',color:'#aaa',marginTop:2}}>{nowPlaying.post.summary}</div>}
                          </div>
                          <div style={{display:'flex',gap:6}}>
                            <button style={{background:'transparent',border:'1px solid rgba(255,255,255,0.2)',color:'#fff',borderRadius:4,padding:'4px 10px',fontSize:'0.72rem',cursor:'pointer'}}
                              onClick={()=>{
                                const music=filtered;
                                const idx=music.findIndex(p=>p.id===nowPlaying.post.id);
                                const prev=music[(idx-1+music.length)%music.length];
                                if(prev){const v=parseVideoUrl(prev.videoUrl||'');setNowPlaying({post:prev,videoId:v?.id});}
                              }}>⏮ 이전</button>
                            <button style={{background:'transparent',border:'1px solid rgba(255,255,255,0.2)',color:'#fff',borderRadius:4,padding:'4px 10px',fontSize:'0.72rem',cursor:'pointer'}}
                              onClick={()=>{
                                const music=filtered;
                                const idx=music.findIndex(p=>p.id===nowPlaying.post.id);
                                const next=music[(idx+1)%music.length];
                                if(next){const v=parseVideoUrl(next.videoUrl||'');setNowPlaying({post:next,videoId:v?.id});}
                              }}>다음 ⏭</button>
                            <button style={{background:'transparent',border:'1px solid rgba(255,255,255,0.2)',color:'#aaa',borderRadius:4,padding:'4px 8px',fontSize:'0.72rem',cursor:'pointer'}}
                              onClick={()=>setNowPlaying(null)}>✕</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="music-playlist" style={{border:'1px solid var(--border)',borderTop:nowPlaying?'none':'1px solid var(--border)',borderRadius:nowPlaying?'0 0 8px 8px':'0 0 8px 8px',overflow:'hidden',marginBottom:24}}>
                      {filtered.sort((a,b)=>(a.order||a.id)-(b.order||b.id)).map((p,idx)=>{
                        const v=parseVideoUrl(p.videoUrl||'');
                        const isPlay=nowPlaying?.post.id===p.id;
                        const thumb=v?`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`:null;
                        return(
                          <div key={p.id}
                            className={`music-item${isPlay?' playing':''}${dragIdx===idx?' dragging':''}`}
                            draggable
                            onDragStart={()=>handleMusicDragStart(idx)}
                            onDragOver={e=>handleMusicDragOver(e,idx)}
                            onDrop={()=>handleMusicDrop(idx)}
                            onClick={()=>{const vv=parseVideoUrl(p.videoUrl||'');setNowPlaying({post:p,videoId:vv?.id});setPlayerPaused(false);}}>
                            <span className="music-drag-handle" title="드래그로 순서 변경">⠿</span>
                            <div className="music-num" style={{color:isPlay?'#E91E8C':'var(--muted)'}}>{isPlay?'♪':idx+1}</div>
                            {thumb?<img className="music-thumb" src={thumb} alt=""/>:
                              <div className="music-thumb-placeholder">🎵</div>}
                            <div className="music-info">
                              <div className="music-title" style={{color:isPlay?'#E91E8C':'var(--text)'}}>{p.title}</div>
                              <div className="music-sub">{p.summary||p.date}</div>
                            </div>
                            <div className="music-actions" onClick={e=>e.stopPropagation()}>
                              <button className="btn-sm" onClick={()=>requestEdit(p)}>수정</button>
                              <button className="btn-del-sm" onClick={()=>requestDelete(p.id,p.title)}>삭제</button>
                            </div>
                            <button className={`music-play-btn${isPlay?' active':''}`}
                              onClick={e=>{e.stopPropagation();const vv=parseVideoUrl(p.videoUrl||'');setNowPlaying({post:p,videoId:vv?.id});setPlayerPaused(false);}}>
                              {isPlay?'■':'▶'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ):(
                  <div className="empty">
                    <div className="empty-icon">🎵</div>
                    <div className="empty-title">플레이리스트가 비어있어요</div>
                    <div className="empty-desc">유튜브 링크와 함께 음악을 추가해보세요!</div>
                    <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"music",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>+ 음악 추가</button>
                  </div>
                )}
              </div>
            ) : activeCat==='baseball' ? (
              /* ── BASEBALL VIEW ── */
              <div style={{gridColumn:'1/-1'}}>
                {filtered.length>0 ? (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:20}}>
                    {filtered.map(p=>(
                      <div key={p.id} className="post-card" onClick={()=>navToPost(p)} style={{overflow:'hidden'}}>
                        {/* 야구: 첫 사진을 1/3 비율로 크게 */}
                        {(p.images||[]).length>0 ? (
                          <div style={{aspectRatio:'3/2',overflow:'hidden',background:'#111'}}>
                            <img src={p.images[0]} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                          </div>
                        ) : p.img ? (
                          <div style={{aspectRatio:'3/2',overflow:'hidden'}}>
                            <img src={p.img} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                          </div>
                        ) : (
                          <div style={{aspectRatio:'3/2',background:'#1565C022',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'3rem'}}>⚾</div>
                        )}
                        <div className="pc-body">
                          <div className="pc-cat" style={{color:'#1565C0'}}>야구</div>
                          {subcatLabel(p)&&<div className="pc-sub">{subcatLabel(p)}</div>}
                          <div className="pc-title">{p.title}</div>
                          <div className="pc-sum">{p.summary}</div>
                          {(p.images||[]).length>1&&<div style={{fontSize:'0.7rem',color:'var(--muted)',marginBottom:4}}>📷 사진 {p.images.length}장</div>}
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
                    <div className="empty-icon">⚾</div>
                    <div className="empty-title">야구 기록이 없어요</div>
                    <div className="empty-desc">직관 사진과 함께 야구 기록을 남겨보세요!</div>
                    <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"baseball",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>+ 야구 기록 추가</button>
                  </div>
                )}
              </div>
            ) : filtered.length>0 ? (
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
                  {activeSub!=="all" ? `${subcats.find(s=>s.id===activeSub)?.label} 글이 아직 없어요` : `아직 ${catInfo?.label}에 글이 없어요`}
                </div>
                <div className="empty-desc">첫 번째 글을 작성해보세요!</div>
                <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:activeCat,subcat:activeSub!=="all"?activeSub:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');}}>+ 첫 글 작성하기</button>
              </div>
            )
          )}
        </div>
      </section>
    </>)}

    {/* ── PERSISTENT BOTTOM MUSIC BAR ── */}
    {nowPlaying && (()=>{
      const musicPosts = posts.filter(p=>p.cat==='music').sort((a,b)=>(a.order||a.id)-(b.order||b.id));
      const curIdx = musicPosts.findIndex(p=>p.id===nowPlaying.post.id);
      const goPrev = () => { const p=musicPosts[(curIdx-1+musicPosts.length)%musicPosts.length]; if(p){const v=parseVideoUrl(p.videoUrl||'');setNowPlaying({post:p,videoId:v?.id});setPlayerPaused(false);} };
      const goNext = () => { const p=musicPosts[(curIdx+1)%musicPosts.length]; if(p){const v=parseVideoUrl(p.videoUrl||'');setNowPlaying({post:p,videoId:v?.id});setPlayerPaused(false);} };
      const thumb = nowPlaying.videoId ? `https://img.youtube.com/vi/${nowPlaying.videoId}/default.jpg` : null;
      return (
        <div className="music-player-bar">
          {/* 숨겨진 iframe: 화면 전환해도 음악 지속 */}
          {activeCat!=='music' && (
            <iframe
              key={nowPlaying.videoId}
              src={`https://www.youtube.com/embed/${nowPlaying.videoId}?autoplay=1&rel=0&enablejsapi=1${playerPaused?'&autoplay=0':''}`}
              style={{position:'absolute',width:0,height:0,opacity:0,pointerEvents:'none'}}
              allow="autoplay; encrypted-media"
              title="bg-player"/>
          )}
          {thumb&&<img src={thumb} alt="" style={{width:44,height:44,borderRadius:6,objectFit:'cover',flexShrink:0}}/>}
          <div className="music-player-info">
            <div className="music-player-title">🎵 {nowPlaying.post.title}</div>
            {nowPlaying.post.summary&&<div className="music-player-sub">{nowPlaying.post.summary}</div>}
          </div>
          <div className="music-player-btns">
            <button className="music-player-btn" onClick={goPrev} title="이전 곡">⏮</button>
            <button className="music-player-btn main" onClick={()=>{ if(activeCat!=='music') navToCat('music'); }} title="뮤직으로 이동">♫</button>
            <button className="music-player-btn" onClick={goNext} title="다음 곡">⏭</button>
          </div>
          <button className="music-close-btn" onClick={()=>setNowPlaying(null)} title="닫기">✕</button>
        </div>
      );
    })()}


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

          {/* ── 뮤직 전용 폼 ── */}
          {form.cat==='music' ? (<>
            <div className="modal-head">
              <div className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:'1.2rem'}}>🎵</span>
                {editing?'음악 수정':'음악 추가'}
              </div>
              <button className="modal-x" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* 유튜브 링크 미리보기 */}
              {(()=>{
                const v = parseVideoUrl(form.videoUrl||'');
                if(!v) return null;
                return (
                  <div style={{borderRadius:8,overflow:'hidden',marginBottom:4,background:'#000',aspectRatio:'16/9',width:'100%'}}>
                    <iframe
                      src={`https://www.youtube.com/embed/${v.id}?autoplay=0`}
                      style={{width:'100%',height:'100%',border:'none'}}
                      allowFullScreen title="미리보기"/>
                  </div>
                );
              })()}
              <div className="fg">
                <label style={{fontSize:'0.8rem',color:'var(--muted)'}}>유튜브 링크 <span style={{color:'#E91E8C'}}>*</span></label>
                <input type="text" value={form.videoUrl}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={e=>setForm({...form,videoUrl:e.target.value})}
                  style={{fontFamily:'monospace',fontSize:'0.82rem'}}
                  autoFocus/>
                {form.videoUrl && !parseVideoUrl(form.videoUrl) && (
                  <div style={{fontSize:'0.75rem',color:'#DE350B',marginTop:4}}>⚠️ 유효하지 않은 유튜브 링크입니다</div>
                )}
              </div>
              <div className="fg">
                <label style={{fontSize:'0.8rem',color:'var(--muted)'}}>곡 제목 <span style={{color:'#E91E8C'}}>*</span></label>
                <input type="text" value={form.title}
                  placeholder="노래 제목을 입력하세요"
                  onChange={e=>setForm({...form,title:e.target.value})}/>
              </div>
              <div className="fg">
                <label style={{fontSize:'0.8rem',color:'var(--muted)'}}>아티스트 / 메모 <span style={{color:'var(--muted)',fontWeight:400}}>(선택)</span></label>
                <input type="text" value={form.summary}
                  placeholder="아티스트명, 앨범, 메모..."
                  onChange={e=>setForm({...form,summary:e.target.value})}/>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={()=>setModal(null)}>취소</button>
              <button className="btn btn-primary"
                style={{background:'#E91E8C',borderColor:'#E91E8C',opacity:(form.title&&form.videoUrl&&parseVideoUrl(form.videoUrl))?1:0.4}}
                onClick={savePost}
                disabled={!form.title||!form.videoUrl||!parseVideoUrl(form.videoUrl)}>
                🎵 플레이리스트에 추가
              </button>
            </div>
          </>) : (<>

          {/* ── 일반 글쓰기 폼 ── */}
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
                  <button className="btn btn-outline" style={{padding:'7px 12px',fontSize:'0.76rem'}} onClick={()=>imgRef.current.click()}>
                    {(form.subcat==="photo"||form.cat==="baseball")?"사진 여러 장 선택":"파일 선택"}
                  </button>
                  {form.img&&<span style={{fontSize:'0.7rem',color:'var(--green)'}}>✓ 업로드됨</span>}
                </div>
                {(form.subcat==='photo'||form.cat==='baseball')&&(form.images||[]).length>0&&(
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
                {(form.subcat!=='photo'&&form.cat!=='baseball')&&form.img&&<img src={form.img} alt="" style={{width:'100%',maxHeight:140,objectFit:'cover',marginTop:8,borderRadius:6}}/>}
                <input ref={imgRef} type="file" accept="image/*" multiple={form.subcat==='photo'||form.cat==='baseball'} style={{display:'none'}} onChange={handleImg}/>
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
          </>)}

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
