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
  { id:"invest",      label:"투자",        color:"#1B5E20", desc:"포트폴리오와 투자 기록을 담습니다" },
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
  invest:      [{ id:"all",label:"전체" }],
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
// ─── 투자 포트폴리오 데이터 (매주 업데이트 예정) ─────────────────────────────
// Last updated: 2026-05-08
const PORTFOLIO = {
  updatedAt: "2026년 5월 8일",
  thesis: "AI 인프라 집중 + 글로벌 분산 + 현금 방어. 변동성 높은 시장에서 핵심 성장주는 무게중심을 유지하되, ETF로 리스크를 분산하고 단기 채권으로 현금 흐름을 확보한다.",
  items: [
    { label:"NVDA",      pct:18, color:"#76b900", desc:"AI 인프라 왕. 데이터센터 GPU 독점적 지위 — 사이클 최정점에서도 해자가 가장 뚜렷한 단일종목" },
    { label:"QQQ",       pct:15, color:"#0052CC", desc:"나스닥 100 ETF. 빅테크 전체에 베팅하면서 개별종목 리스크 분산. 장기 복리의 핵심 엔진" },
    { label:"MSFT",      pct:12, color:"#00a4ef", desc:"Azure + Copilot 조합. 클라우드·AI 양쪽 다 먹는 현금창출 기계. 가장 안정적인 성장주" },
    { label:"AMZN",      pct:10, color:"#FF9900", desc:"AWS 재가속 + 광고 성장. 소매 마진 개선 사이클 진입 — 지금이 가장 저평가된 빅테크" },
    { label:"VOO",       pct:12, color:"#1565C0", desc:"S&P500 ETF. 시장 전체를 저비용으로 소유. 나머지 포지션의 변동성을 완충하는 앵커" },
    { label:"PLTR",      pct:8,  color:"#8c1aff", desc:"정부·기업 AI 데이터 플랫폼. 흑자 전환 후 성장 가속. 가장 높은 업사이드가 남은 중형주" },
    { label:"BRK.B",     pct:8,  color:"#8B6914", desc:"버핏의 포트폴리오를 통째로 소유. 하락장 방어 + 복리 기계. 현금보다 낫다" },
    { label:"단기채권/예금",pct:17, color:"#78909C", desc:"SHV(초단기 국채 ETF) + 예금. 연 5% 수익 확보하며 기회 올 때 즉시 투입할 실탄 유지" },
  ]
};

// ─── 리밸런싱 체크리스트 기본 항목 ─────────────────────────────────────────────
const DEFAULT_REBALANCE_ITEMS = [
  "보유 종목 중 -10% 이상 하락한 종목 점검",
  "보유 종목 중 +20% 이상 상승한 종목 익절 여부 검토",
  "이번 주 빅테크 실적 발표 일정 확인 (NVDA, MSFT, AMZN 등)",
  "이번 주 FOMC / 주요 경제 지표 발표 일정 확인 (CPI, PCE, 고용)",
  "포트폴리오 비율이 목표 대비 ±3%p 이상 어긋났는지 확인",
  "현금/단기채권 비중이 15% 이상 유지되는지 확인",
  "추가 매수할 종목이 있다면 그 근거(테마/실적/밸류에이션) 정리",
  "지난 주 일일 메모를 다시 읽고 의사결정 패턴 복기",
  "다음 주 환율(USD/KRW), 유가, 금리 흐름 체크",
];

// 주 시작일 (월요일) 구하기
function getWeekStart(d = new Date()) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

// ─── 내 보유 종목 (매수 기록 + 현재가 수동 입력 + 가격 히스토리) ─────────────
function MyHoldings() {
  // ── 상태 ──
  const [trades, setTrades]       = useState([]);   // 매수 거래 목록
  const [prices, setPrices]       = useState([]);   // 가격 히스토리 (모든 날짜의 모든 종목)
  const [loaded, setLoaded]       = useState(false);

  // ── 모달 상태 ──
  const [tradeModal, setTradeModal] = useState(null); // null | {mode:'add'|'edit', data}
  const [priceModal, setPriceModal] = useState(null); // null | {ticker, date, price}
  const [expanded, setExpanded]     = useState({});   // { ticker: bool }

  // 초기 로드
  useEffect(()=>{
    (async ()=>{
      try{
        const tr = await dbGetAll('dlwns_holdings', `owner=eq.${OWNER_ID}`);
        if(tr) setTrades(tr.map(r=>r.data).filter(Boolean));
      } catch(e){ console.warn('trades load fail', e); }
      try{
        const pr = await dbGetAll('dlwns_prices', `owner=eq.${OWNER_ID}`);
        if(pr) setPrices(pr.map(r=>r.data).filter(Boolean));
      } catch(e){ console.warn('prices load fail', e); }
      setLoaded(true);
    })();
  },[]);

  // ── 매수 거래 CRUD ──
  const saveTrade = async (data, isEdit) => {
    const id = isEdit ? data.id : Date.now();
    const payload = {
      trade_id: id,
      owner: OWNER_ID,
      data: {
        id,
        ticker: data.ticker.trim().toUpperCase(),
        buyDate: data.buyDate,
        buyPrice: Number(data.buyPrice),
        quantity: Number(data.quantity),
        note: (data.note || '').trim(),
      }
    };
    const r = await dbUpsert('dlwns_holdings', payload);
    if(r){
      if(isEdit){
        setTrades(trades.map(t=>t.id===id?payload.data:t));
      } else {
        setTrades([...trades, payload.data]);
      }
      setTradeModal(null);
    } else {
      alert('매수 기록 저장 실패. dlwns_holdings 테이블이 생성되었는지 확인하세요.');
    }
  };
  const delTrade = async (id) => {
    if(!confirm('이 매수 기록을 삭제할까요?')) return;
    const ok = await dbDelete('dlwns_holdings', `trade_id=eq.${id}`);
    if(ok) setTrades(trades.filter(t=>t.id!==id));
  };

  // ── 가격 기록 (현재가 입력) ──
  // 같은 종목+같은 날짜는 덮어쓰기. price_id는 hash(ticker+date)로 고정 (간단히 ticker_date 기반)
  const savePrice = async ({ticker, date, price}) => {
    if(!ticker || !date || !price) return;
    const tk = ticker.trim().toUpperCase();
    const priceNum = Number(price);
    // (ticker, date) 조합으로 ID 생성 — 같은 날 재입력 시 덮어쓰기
    const idStr = `${tk}_${date.replace(/-/g,'')}`;
    // bigint로 변환: 영문은 charCode 합산, 숫자는 그대로 → 안전한 양의 정수
    let id = 0;
    for(let i=0; i<idStr.length; i++){ id = (id * 31 + idStr.charCodeAt(i)) % Number.MAX_SAFE_INTEGER; }
    const payload = {
      price_id: id,
      owner: OWNER_ID,
      data: { ticker: tk, date, price: priceNum }
    };
    const r = await dbUpsert('dlwns_prices', payload);
    if(r){
      // 기존 동일 (ticker,date) 제거 후 추가
      const filtered = prices.filter(p=>!(p.ticker===tk && p.date===date));
      setPrices([...filtered, payload.data]);
      setPriceModal(null);
    } else {
      alert('가격 저장 실패. dlwns_prices 테이블이 생성되었는지 확인하세요.');
    }
  };

  // ── 종목별 집계 ──
  // trades를 ticker별로 묶기
  const byTicker = {};
  trades.forEach(t=>{
    if(!byTicker[t.ticker]) byTicker[t.ticker] = { ticker:t.ticker, trades:[], totalQty:0, totalCost:0 };
    byTicker[t.ticker].trades.push(t);
    byTicker[t.ticker].totalQty  += t.quantity;
    byTicker[t.ticker].totalCost += t.buyPrice * t.quantity;
  });

  // 각 ticker별 최신 가격
  const latestPrice = (ticker) => {
    const arr = prices.filter(p=>p.ticker===ticker).sort((a,b)=>b.date.localeCompare(a.date));
    return arr[0] || null;
  };

  // 가격 히스토리 (해당 ticker, 날짜 오름차순)
  const priceHistory = (ticker) =>
    prices.filter(p=>p.ticker===ticker).sort((a,b)=>a.date.localeCompare(b.date));

  // 전체 요약
  let summary = { invested:0, current:0, gain:0, gainPct:0 };
  Object.values(byTicker).forEach(grp=>{
    const last = latestPrice(grp.ticker);
    summary.invested += grp.totalCost;
    if(last){
      summary.current += last.price * grp.totalQty;
    } else {
      summary.current += grp.totalCost; // 가격 미입력 시 매수가로 간주
    }
  });
  summary.gain = summary.current - summary.invested;
  summary.gainPct = summary.invested > 0 ? (summary.gain / summary.invested * 100) : 0;

  const gainColor = (v) => v > 0 ? '#c62828' : v < 0 ? '#1565C0' : '#666'; // 한국식: 빨강=상승, 파랑=하락
  const fmtMoney = (v) => `$${v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtPct   = (v) => `${v>=0?'+':''}${v.toFixed(2)}%`;

  if(!loaded){
    return <div style={{padding:'40px 0',textAlign:'center',fontSize:'0.85rem',color:'var(--muted)'}}>보유 종목 로딩 중...</div>;
  }

  const tickers = Object.keys(byTicker).sort();

  return (
    <div style={{marginTop:36,padding:'20px 0',borderTop:'1px solid var(--border)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
        <h3 style={{fontSize:'1.05rem',fontWeight:700,color:'#1B5E20'}}>📊 내 보유 종목</h3>
        <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>{tickers.length}개 종목 · {trades.length}건 매수</span>
        <button onClick={()=>setTradeModal({mode:'add',data:{ticker:'',buyDate:new Date().toISOString().slice(0,10),buyPrice:'',quantity:'',note:''}})}
                style={{marginLeft:'auto',fontSize:'0.78rem',padding:'5px 12px',background:'#1B5E20',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>
          + 매수 기록
        </button>
      </div>
      <p style={{fontSize:'0.75rem',color:'var(--muted)',marginBottom:14}}>매수 내역과 현재가를 직접 입력합니다. 매일 가격을 한 번씩 기록하면 종목별 추이 그래프가 그려집니다.</p>

      {/* ─── 전체 요약 ─── */}
      {trades.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:18,padding:'14px 16px',background:'#f1f8e9',borderRadius:10}}>
          <div>
            <div style={{fontSize:'0.7rem',color:'var(--muted)',marginBottom:2}}>총 투자금</div>
            <div style={{fontSize:'1.05rem',fontWeight:700,color:'var(--text)'}}>{fmtMoney(summary.invested)}</div>
          </div>
          <div>
            <div style={{fontSize:'0.7rem',color:'var(--muted)',marginBottom:2}}>현재 평가</div>
            <div style={{fontSize:'1.05rem',fontWeight:700,color:'var(--text)'}}>{fmtMoney(summary.current)}</div>
          </div>
          <div>
            <div style={{fontSize:'0.7rem',color:'var(--muted)',marginBottom:2}}>평가 손익</div>
            <div style={{fontSize:'1.05rem',fontWeight:700,color:gainColor(summary.gain)}}>
              {summary.gain>=0?'+':''}{fmtMoney(summary.gain).replace('$','')}{summary.gain>=0?' $':' $'}
            </div>
          </div>
          <div>
            <div style={{fontSize:'0.7rem',color:'var(--muted)',marginBottom:2}}>수익률</div>
            <div style={{fontSize:'1.05rem',fontWeight:700,color:gainColor(summary.gain)}}>{fmtPct(summary.gainPct)}</div>
          </div>
        </div>
      )}

      {/* ─── 종목별 카드 ─── */}
      {tickers.length === 0 ? (
        <div style={{fontSize:'0.82rem',color:'var(--muted)',padding:'30px',background:'#fafafa',borderRadius:8,textAlign:'center'}}>
          아직 매수 기록이 없습니다. 우측 상단 <strong>"+ 매수 기록"</strong> 버튼으로 첫 종목을 추가해보세요.
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {tickers.map(tk=>{
            const grp = byTicker[tk];
            const avgPrice = grp.totalCost / grp.totalQty;
            const lp = latestPrice(tk);
            const cur = lp ? lp.price * grp.totalQty : null;
            const gain = cur !== null ? (cur - grp.totalCost) : null;
            const gainPct = cur !== null ? (gain / grp.totalCost * 100) : null;
            const history = priceHistory(tk);
            const isExp = !!expanded[tk];
            return (
              <div key={tk} style={{border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px',background:'#fff'}}>
                {/* 종목 헤더 */}
                <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}}>
                  <span style={{fontSize:'1.05rem',fontWeight:800,color:'#1B5E20'}}>{tk}</span>
                  <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>{grp.totalQty}주 · 평단 ${avgPrice.toFixed(2)}</span>
                  <button onClick={()=>setPriceModal({ticker:tk,date:new Date().toISOString().slice(0,10),price:lp?String(lp.price):''})}
                          style={{marginLeft:'auto',fontSize:'0.74rem',padding:'4px 10px',background:'#fff',border:'1px solid #1B5E20',color:'#1B5E20',borderRadius:6,cursor:'pointer',fontWeight:600}}>
                    💵 현재가 입력
                  </button>
                </div>
                {/* 종목 지표 */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))',gap:8,marginBottom:10}}>
                  <div>
                    <div style={{fontSize:'0.68rem',color:'var(--muted)'}}>매수 총액</div>
                    <div style={{fontSize:'0.88rem',fontWeight:700}}>{fmtMoney(grp.totalCost)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.68rem',color:'var(--muted)'}}>현재가</div>
                    <div style={{fontSize:'0.88rem',fontWeight:700}}>{lp ? `$${lp.price.toFixed(2)}` : '—'}</div>
                    {lp && <div style={{fontSize:'0.62rem',color:'var(--muted)'}}>{lp.date}</div>}
                  </div>
                  <div>
                    <div style={{fontSize:'0.68rem',color:'var(--muted)'}}>평가금</div>
                    <div style={{fontSize:'0.88rem',fontWeight:700}}>{cur !== null ? fmtMoney(cur) : '—'}</div>
                  </div>
                  <div>
                    <div style={{fontSize:'0.68rem',color:'var(--muted)'}}>손익 / 수익률</div>
                    {gain !== null ? (
                      <div style={{fontSize:'0.88rem',fontWeight:700,color:gainColor(gain)}}>
                        {gain>=0?'+':''}{gain.toFixed(2)} $ · {fmtPct(gainPct)}
                      </div>
                    ) : <div style={{fontSize:'0.88rem',color:'var(--muted)'}}>가격 미입력</div>}
                  </div>
                </div>
                {/* 가격 추이 그래프 (간단한 SVG 라인) */}
                {history.length >= 2 && <PriceSparkline history={history} avgPrice={avgPrice}/>}
                {history.length === 1 && (
                  <div style={{fontSize:'0.7rem',color:'var(--muted)',padding:'8px',background:'#fafafa',borderRadius:6,marginTop:4}}>
                    가격 기록 1개. 매일 한 번씩 입력하면 추이 그래프가 그려집니다.
                  </div>
                )}
                {/* 펼치기: 매수 내역 + 가격 히스토리 */}
                <button onClick={()=>setExpanded({...expanded,[tk]:!isExp})}
                        style={{marginTop:8,fontSize:'0.72rem',background:'transparent',border:'none',color:'#1B5E20',cursor:'pointer',padding:0,fontWeight:600}}>
                  {isExp ? '▲ 접기' : '▼ 매수 내역 / 가격 기록 보기'}
                </button>
                {isExp && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px dashed var(--border)'}}>
                    <div style={{fontSize:'0.74rem',fontWeight:700,marginBottom:6,color:'var(--sub)'}}>매수 내역 ({grp.trades.length}건)</div>
                    <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12}}>
                      {grp.trades.sort((a,b)=>a.buyDate.localeCompare(b.buyDate)).map(t=>(
                        <div key={t.id} style={{display:'flex',gap:8,alignItems:'center',fontSize:'0.75rem',padding:'5px 8px',background:'#fafafa',borderRadius:5}}>
                          <span style={{color:'var(--muted)'}}>{t.buyDate}</span>
                          <span style={{fontWeight:600}}>${t.buyPrice.toFixed(2)} × {t.quantity}주</span>
                          <span style={{color:'var(--muted)'}}>= ${(t.buyPrice*t.quantity).toFixed(2)}</span>
                          {t.note && <span style={{color:'var(--muted)',fontStyle:'italic',flex:1}}>· {t.note}</span>}
                          <button onClick={()=>setTradeModal({mode:'edit',data:t})} style={{marginLeft:'auto',background:'transparent',border:'none',color:'#1565C0',cursor:'pointer',fontSize:'0.72rem'}}>수정</button>
                          <button onClick={()=>delTrade(t.id)} style={{background:'transparent',border:'none',color:'#c62828',cursor:'pointer',fontSize:'0.88rem'}}>×</button>
                        </div>
                      ))}
                    </div>
                    {history.length > 0 && (
                      <>
                        <div style={{fontSize:'0.74rem',fontWeight:700,marginBottom:6,color:'var(--sub)'}}>가격 기록 ({history.length}일)</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                          {history.slice().reverse().slice(0,30).map((p,i)=>(
                            <div key={i} style={{fontSize:'0.7rem',padding:'3px 8px',background:'#f1f8e9',borderRadius:4}}>
                              <span style={{color:'var(--muted)'}}>{p.date}</span> <strong>${p.price.toFixed(2)}</strong>
                            </div>
                          ))}
                          {history.length > 30 && <span style={{fontSize:'0.7rem',color:'var(--muted)'}}>...외 {history.length-30}건</span>}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── 매수 기록 추가/수정 모달 ─── */}
      {tradeModal && (
        <TradeModal
          mode={tradeModal.mode}
          initial={tradeModal.data}
          onSave={(data)=>saveTrade(data, tradeModal.mode==='edit')}
          onClose={()=>setTradeModal(null)}
        />
      )}

      {/* ─── 현재가 입력 모달 ─── */}
      {priceModal && (
        <PriceModal
          initial={priceModal}
          onSave={savePrice}
          onClose={()=>setPriceModal(null)}
        />
      )}
    </div>
  );
}

// ─── 가격 추이 sparkline (SVG, 의존성 없음) ──────────────────────────────────
function PriceSparkline({ history, avgPrice }) {
  if(history.length < 2) return null;
  const w = 600, h = 80, padX = 8, padY = 10;
  const prices = history.map(p=>p.price);
  const min = Math.min(...prices, avgPrice);
  const max = Math.max(...prices, avgPrice);
  const range = max - min || 1;
  const xAt = (i) => padX + (i/(history.length-1)) * (w - padX*2);
  const yAt = (v) => padY + (1 - (v-min)/range) * (h - padY*2);
  const linePath = history.map((p,i)=>`${i===0?'M':'L'}${xAt(i).toFixed(1)},${yAt(p.price).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xAt(history.length-1).toFixed(1)},${h-padY} L${xAt(0).toFixed(1)},${h-padY} Z`;
  const lastPrice = prices[prices.length-1];
  const trendUp = lastPrice >= prices[0];
  const stroke = trendUp ? '#c62828' : '#1565C0';
  const fill   = trendUp ? 'rgba(198,40,40,0.08)' : 'rgba(21,101,192,0.08)';
  const avgY = yAt(avgPrice);
  return (
    <div style={{marginTop:6,position:'relative'}}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width:'100%',height:60,display:'block'}}>
        <path d={areaPath} fill={fill}/>
        <path d={linePath} stroke={stroke} strokeWidth="2" fill="none"/>
        <line x1={padX} y1={avgY} x2={w-padX} y2={avgY} stroke="#999" strokeWidth="1" strokeDasharray="4 3"/>
        <text x={w-padX-2} y={avgY-2} fontSize="10" fill="#666" textAnchor="end">평단 ${avgPrice.toFixed(2)}</text>
        <circle cx={xAt(history.length-1)} cy={yAt(lastPrice)} r="3" fill={stroke}/>
      </svg>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.62rem',color:'var(--muted)',marginTop:2}}>
        <span>{history[0].date} ${prices[0].toFixed(2)}</span>
        <span>{history[history.length-1].date} ${lastPrice.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── 매수 기록 모달 ──────────────────────────────────────────────────────────
function TradeModal({ mode, initial, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const valid = f.ticker.trim() && f.buyDate && Number(f.buyPrice) > 0 && Number(f.quantity) > 0;
  const update = (k,v) => setF({...f,[k]:v});
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:12,padding:24,maxWidth:420,width:'100%'}}>
        <h3 style={{fontSize:'1.05rem',fontWeight:700,marginBottom:14,color:'#1B5E20'}}>{mode==='edit'?'매수 기록 수정':'+ 새 매수 기록'}</h3>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>종목 (티커, 예: NVDA)</label>
            <input value={f.ticker} onChange={e=>update('ticker',e.target.value.toUpperCase())} autoFocus
                   style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem',textTransform:'uppercase'}}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>매수일</label>
            <input type="date" value={f.buyDate} onChange={e=>update('buyDate',e.target.value)}
                   style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem'}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>매수가 ($)</label>
              <input type="number" step="0.01" min="0" value={f.buyPrice} onChange={e=>update('buyPrice',e.target.value)} placeholder="850.50"
                     style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem'}}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>수량 (주)</label>
              <input type="number" step="0.0001" min="0" value={f.quantity} onChange={e=>update('quantity',e.target.value)} placeholder="2"
                     style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem'}}/>
            </div>
          </div>
          <div>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>메모 (선택)</label>
            <input value={f.note} onChange={e=>update('note',e.target.value)} placeholder="매수 이유..."
                   style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.85rem'}}/>
          </div>
          {f.buyPrice && f.quantity && (
            <div style={{fontSize:'0.78rem',color:'var(--muted)',padding:'6px 10px',background:'#f9fbe7',borderRadius:5}}>
              총 매수금: ${(Number(f.buyPrice)*Number(f.quantity)).toFixed(2)}
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <button onClick={onClose} style={{padding:'8px 16px',background:'#fff',border:'1px solid #ccc',borderRadius:6,cursor:'pointer',fontSize:'0.85rem'}}>취소</button>
          <button onClick={()=>onSave(f)} disabled={!valid} style={{padding:'8px 16px',background:valid?'#1B5E20':'#bbb',color:'#fff',border:'none',borderRadius:6,cursor:valid?'pointer':'not-allowed',fontSize:'0.85rem',fontWeight:600}}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ─── 현재가 입력 모달 ────────────────────────────────────────────────────────
function PriceModal({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const valid = f.ticker.trim() && f.date && Number(f.price) > 0;
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:12,padding:24,maxWidth:380,width:'100%'}}>
        <h3 style={{fontSize:'1.05rem',fontWeight:700,marginBottom:6,color:'#1B5E20'}}>💵 현재가 입력</h3>
        <p style={{fontSize:'0.75rem',color:'var(--muted)',marginBottom:14}}>증권사 앱이나 야후 파이낸스에서 가격을 확인하고 입력하세요. 같은 날짜에 다시 입력하면 덮어쓰기됩니다.</p>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>종목</label>
            <input value={f.ticker} onChange={e=>setF({...f,ticker:e.target.value.toUpperCase()})}
                   style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem',textTransform:'uppercase',background:'#f5f5f5'}} readOnly={!!initial.ticker}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>날짜</label>
            <input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}
                   style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem'}}/>
          </div>
          <div>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>가격 ($)</label>
            <input type="number" step="0.01" min="0" value={f.price} onChange={e=>setF({...f,price:e.target.value})} autoFocus placeholder="920.30"
                   style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.9rem'}}/>
          </div>
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18}}>
          <button onClick={onClose} style={{padding:'8px 16px',background:'#fff',border:'1px solid #ccc',borderRadius:6,cursor:'pointer',fontSize:'0.85rem'}}>취소</button>
          <button onClick={()=>onSave(f)} disabled={!valid} style={{padding:'8px 16px',background:valid?'#1B5E20':'#bbb',color:'#fff',border:'none',borderRadius:6,cursor:valid?'pointer':'not-allowed',fontSize:'0.85rem',fontWeight:600}}>저장</button>
        </div>
      </div>
    </div>
  );
}

function InvestPortfolio() {
  // ── 포트폴리오 상태 (DB 동기화) ──
  const [portfolio, setPortfolio] = useState(PORTFOLIO);
  const [pfLoaded, setPfLoaded]   = useState(false);
  const [editMode, setEditMode]   = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  // ── 차트 ──
  const [hovered, setHovered]               = useState(null);
  const [canvasMounted, setCanvasMounted]   = useState(false);
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  // ── 일일 시장 메모 ──
  const [notes, setNotes]       = useState([]);
  const [noteText, setNoteText] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0,10));
  const [noteSaving, setNoteSaving] = useState(false);

  // ── 주간 리밸런싱 체크리스트 ──
  const weekStart = getWeekStart();
  const [rebItems, setRebItems]     = useState([]); // [{text, custom}]
  const [rebChecks, setRebChecks]   = useState({}); // { idx: true/false }
  const [rebAddText, setRebAddText] = useState('');
  const today = new Date();
  const isSunday = today.getDay() === 0;

  // Chart.js CDN 로드
  useEffect(()=>{
    if(!window.Chart){
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload=()=>setCanvasMounted(true);
      document.head.appendChild(s);
    } else setCanvasMounted(true);
  },[]);

  // 초기 데이터 로드 (포트폴리오 + 메모 + 체크리스트)
  useEffect(()=>{
    (async ()=>{
      // 1. 포트폴리오
      try{
        const pfRow = await dbGet('dlwns_portfolio', `owner=eq.${OWNER_ID}`);
        if(pfRow && pfRow.data && pfRow.data.items && pfRow.data.items.length > 0){
          setPortfolio(pfRow.data);
        }
      } catch(e){ console.warn('portfolio load fail', e); }
      setPfLoaded(true);

      // 2. 일일 메모 (최근 14일)
      try{
        const noteRows = await dbGetAll('dlwns_market_notes', `owner=eq.${OWNER_ID}`);
        if(noteRows){
          const sorted = noteRows
            .map(r => r.data)
            .filter(d => d && d.date)
            .sort((a,b) => b.date.localeCompare(a.date))
            .slice(0, 14);
          setNotes(sorted);
        }
      } catch(e){ console.warn('notes load fail', e); }

      // 3. 리밸런싱 체크리스트
      try{
        const rebRow = await dbGet('dlwns_rebalance', `owner=eq.${OWNER_ID}`);
        if(rebRow && rebRow.data){
          const d = rebRow.data;
          // 새 주가 시작되면 체크 상태 초기화
          if(d.weekStart === weekStart){
            setRebItems(d.items || DEFAULT_REBALANCE_ITEMS.map(t=>({text:t, custom:false})));
            setRebChecks(d.checks || {});
          } else {
            // 사용자 추가 항목은 유지, 체크만 초기화
            const customItems = (d.items || []).filter(it=>it.custom);
            setRebItems([...DEFAULT_REBALANCE_ITEMS.map(t=>({text:t,custom:false})), ...customItems]);
            setRebChecks({});
          }
        } else {
          setRebItems(DEFAULT_REBALANCE_ITEMS.map(t=>({text:t,custom:false})));
        }
      } catch(e){
        console.warn('rebalance load fail', e);
        setRebItems(DEFAULT_REBALANCE_ITEMS.map(t=>({text:t,custom:false})));
      }
    })();
  },[]);

  // 차트 그리기/업데이트
  useEffect(()=>{
    if(!canvasMounted || !canvasRef.current || !pfLoaded) return;
    if(chartRef.current){ chartRef.current.destroy(); }
    chartRef.current = new window.Chart(canvasRef.current,{
      type:'doughnut',
      data:{
        labels: portfolio.items.map(i=>i.label),
        datasets:[{
          data: portfolio.items.map(i=>i.pct),
          backgroundColor: portfolio.items.map(i=>i.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverOffset: 8,
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{ legend:{display:false}, tooltip:{
          callbacks:{ label: ctx=>`${ctx.label}  ${ctx.parsed}%` }
        }},
        onHover:(_,els)=>{ setHovered(els.length>0?els[0].index:null); }
      }
    });
    return ()=>{ if(chartRef.current){ chartRef.current.destroy(); chartRef.current=null; } };
  },[canvasMounted, pfLoaded, portfolio]);

  const hItem = hovered!==null ? portfolio.items[hovered] : null;
  const total = portfolio.items.reduce((s,i)=>s+i.pct,0);

  // ── 포트폴리오 편집 ──
  const startEdit = () => {
    setEditDraft(JSON.parse(JSON.stringify(portfolio)));
    setEditMode(true);
  };
  const cancelEdit = () => { setEditMode(false); setEditDraft(null); };
  const saveEdit = async () => {
    if(!editDraft) return;
    const sum = editDraft.items.reduce((s,i)=>s+Number(i.pct||0),0);
    if(sum !== 100){
      if(!confirm(`비율 합계가 ${sum}%입니다 (100% 권장). 그래도 저장할까요?`)) return;
    }
    const now = new Date();
    const dateStr = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;
    const next = { ...editDraft, updatedAt: dateStr, items: editDraft.items.map(i=>({...i, pct:Number(i.pct)})) };
    const r = await dbUpsert('dlwns_portfolio', { owner: OWNER_ID, data: next });
    if(r){
      setPortfolio(next);
      setEditMode(false);
      setEditDraft(null);
    } else {
      alert('저장 실패. Supabase 연결을 확인해주세요.');
    }
  };
  const updateDraftItem = (idx, key, val) => {
    const items = [...editDraft.items];
    items[idx] = { ...items[idx], [key]: val };
    setEditDraft({...editDraft, items});
  };
  const addDraftItem = () => {
    setEditDraft({...editDraft, items:[...editDraft.items, {label:'새 종목', pct:0, color:'#888888', desc:''}]});
  };
  const removeDraftItem = (idx) => {
    setEditDraft({...editDraft, items: editDraft.items.filter((_,i)=>i!==idx)});
  };
  const updateThesis = (v) => setEditDraft({...editDraft, thesis: v});

  // ── 일일 메모 저장 ──
  const saveNote = async () => {
    if(!noteText.trim()) return;
    setNoteSaving(true);
    const noteId = Date.now();
    const payload = {
      note_id: noteId,
      owner: OWNER_ID,
      data: { id: noteId, date: noteDate, text: noteText.trim(), createdAt: new Date().toISOString() }
    };
    const r = await dbUpsert('dlwns_market_notes', payload);
    if(r){
      setNotes([payload.data, ...notes].slice(0,14));
      setNoteText('');
    } else {
      alert('메모 저장 실패');
    }
    setNoteSaving(false);
  };
  const delNote = async (id) => {
    if(!confirm('이 메모를 삭제할까요?')) return;
    const ok = await dbDelete('dlwns_market_notes', `note_id=eq.${id}`);
    if(ok) setNotes(notes.filter(n=>n.id!==id));
  };

  // ── 리밸런싱 체크리스트 ──
  const saveRebalance = async (items, checks) => {
    const payload = { owner: OWNER_ID, data: { weekStart, items, checks } };
    await dbUpsert('dlwns_rebalance', payload);
  };
  const toggleCheck = (idx) => {
    const next = { ...rebChecks, [idx]: !rebChecks[idx] };
    setRebChecks(next);
    saveRebalance(rebItems, next);
  };
  const addRebItem = () => {
    if(!rebAddText.trim()) return;
    const next = [...rebItems, { text: rebAddText.trim(), custom: true }];
    setRebItems(next);
    setRebAddText('');
    saveRebalance(next, rebChecks);
  };
  const removeRebItem = (idx) => {
    if(!rebItems[idx].custom) return;
    const next = rebItems.filter((_,i)=>i!==idx);
    const nextChecks = {};
    Object.keys(rebChecks).forEach(k=>{
      const ki = Number(k);
      if(ki < idx) nextChecks[ki] = rebChecks[k];
      else if(ki > idx) nextChecks[ki-1] = rebChecks[k];
    });
    setRebItems(next);
    setRebChecks(nextChecks);
    saveRebalance(next, nextChecks);
  };

  const checkedCount = rebItems.reduce((s,_,i)=>s+(rebChecks[i]?1:0),0);

  return (
    <div style={{padding:'32px 0'}}>
      {/* ─── 헤더 ─── */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6,flexWrap:'wrap'}}>
        <h2 style={{fontSize:'1.3rem',fontWeight:800,color:'#1B5E20'}}>💼 AI 시대의 포트폴리오</h2>
        <span style={{fontSize:'0.72rem',background:'#e8f5e9',color:'#2e7d32',padding:'3px 10px',borderRadius:20,fontWeight:600}}>$10,000 기준</span>
        {!editMode && (
          <button onClick={startEdit} style={{marginLeft:'auto',fontSize:'0.78rem',padding:'5px 12px',background:'#fff',border:'1px solid #1B5E20',color:'#1B5E20',borderRadius:6,cursor:'pointer',fontWeight:600}}>✏️ 편집</button>
        )}
      </div>
      <div style={{fontSize:'0.8rem',color:'var(--muted)',marginBottom:4}}>업데이트: {portfolio.updatedAt}</div>

      {/* ─── 편집 모드 ─── */}
      {editMode ? (
        <div style={{background:'#fffde7',border:'2px solid #fbc02d',borderRadius:10,padding:18,marginBottom:24}}>
          <div style={{fontSize:'0.85rem',fontWeight:700,marginBottom:10,color:'#5d4037'}}>📝 포트폴리오 편집</div>
          <div style={{marginBottom:14}}>
            <label style={{display:'block',fontSize:'0.75rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>투자 철학 (thesis)</label>
            <textarea value={editDraft.thesis} onChange={e=>updateThesis(e.target.value)} rows={3} style={{width:'100%',padding:8,borderRadius:6,border:'1px solid #ddd',fontSize:'0.82rem',fontFamily:'inherit',resize:'vertical'}}/>
          </div>
          <div style={{fontSize:'0.75rem',fontWeight:600,marginBottom:6,color:'var(--sub)'}}>종목 ({editDraft.items.length}개 · 합계 {editDraft.items.reduce((s,i)=>s+Number(i.pct||0),0)}%)</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
            {editDraft.items.map((it,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'36px 110px 60px 1fr 30px',gap:6,alignItems:'center'}}>
                <input type="color" value={it.color} onChange={e=>updateDraftItem(i,'color',e.target.value)} style={{width:36,height:30,border:'1px solid #ddd',borderRadius:4,padding:1,cursor:'pointer'}}/>
                <input value={it.label} onChange={e=>updateDraftItem(i,'label',e.target.value)} placeholder="종목명" style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                <input type="number" value={it.pct} onChange={e=>updateDraftItem(i,'pct',e.target.value)} placeholder="%" min={0} max={100} style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem',textAlign:'right'}}/>
                <input value={it.desc} onChange={e=>updateDraftItem(i,'desc',e.target.value)} placeholder="투자 근거 (간단히)" style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                <button onClick={()=>removeDraftItem(i)} style={{background:'transparent',border:'none',color:'#c62828',cursor:'pointer',fontSize:'1rem'}}>×</button>
              </div>
            ))}
          </div>
          <button onClick={addDraftItem} style={{fontSize:'0.78rem',padding:'5px 12px',background:'#fff',border:'1px dashed #999',borderRadius:6,cursor:'pointer',marginBottom:14}}>+ 종목 추가</button>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={cancelEdit} style={{fontSize:'0.8rem',padding:'7px 16px',background:'#fff',border:'1px solid #ccc',borderRadius:6,cursor:'pointer'}}>취소</button>
            <button onClick={saveEdit} style={{fontSize:'0.8rem',padding:'7px 16px',background:'#1B5E20',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>저장</button>
          </div>
        </div>
      ) : (
        <p style={{fontSize:'0.83rem',color:'var(--sub)',lineHeight:1.7,marginBottom:28,maxWidth:640,padding:'10px 14px',background:'#f9fbe7',borderRadius:8,borderLeft:'3px solid #827717'}}>
          {portfolio.thesis}
        </p>
      )}

      {/* ─── 차트 + 종목 리스트 ─── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,alignItems:'start'}}>
        <div style={{position:'relative'}}>
          <div style={{position:'relative',width:'100%',height:280}}>
            <canvas ref={canvasRef} role="img" aria-label="포트폴리오 도넛 차트"/>
            <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',pointerEvents:'none'}}>
              {hItem ? (
                <>
                  <div style={{fontSize:'1.4rem',fontWeight:800,color:hItem.color}}>{hItem.pct}%</div>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text)'}}>{hItem.label}</div>
                  <div style={{fontSize:'0.68rem',color:'var(--muted)'}}>${(10000*hItem.pct/100).toFixed(0)}</div>
                </>
              ) : (
                <>
                  <div style={{fontSize:'1.5rem',fontWeight:800,color:'#1B5E20'}}>$10K</div>
                  <div style={{fontSize:'0.72rem',color:'var(--muted)'}}>포트폴리오</div>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {portfolio.items.map((item,i)=>(
            <div key={i}
              onMouseEnter={()=>{ setHovered(i); if(chartRef.current){chartRef.current.data.datasets[0].hoverOffset=12;chartRef.current.update();} }}
              onMouseLeave={()=>{ setHovered(null); if(chartRef.current){chartRef.current.update();} }}
              style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:8,cursor:'default',background:hovered===i?'#f1f8e9':'transparent',transition:'background 0.15s'}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:item.color,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontWeight:700,fontSize:'0.82rem',color:item.color}}>{item.label}</span>
                  <span style={{fontWeight:700,fontSize:'0.82rem',color:'var(--text)'}}>{item.pct}%</span>
                </div>
                {hovered===i && <div style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:3,lineHeight:1.5}}>{item.desc}</div>}
              </div>
            </div>
          ))}
          {total !== 100 && (
            <div style={{fontSize:'0.7rem',color:'#e65100',marginTop:4,padding:'4px 8px',background:'#fff3e0',borderRadius:4}}>
              ⚠️ 비율 합계: {total}% (100%가 아닙니다)
            </div>
          )}
        </div>
      </div>

      {/* ─── 내 보유 종목 (매수 기록 + 현재가 수동 입력) ─── */}
      <MyHoldings />

      {/* ─── 일일 시장 메모 ─── */}
      <div style={{marginTop:36,padding:'20px 0',borderTop:'1px solid var(--border)'}}>
        <h3 style={{fontSize:'1.05rem',fontWeight:700,marginBottom:4,color:'#1B5E20'}}>📝 일일 시장 메모</h3>
        <p style={{fontSize:'0.75rem',color:'var(--muted)',marginBottom:14}}>매일의 시장 관찰·결정·복기를 기록합니다. 좋은 투자자는 자기만의 일지를 씁니다.</p>
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          <input type="date" value={noteDate} onChange={e=>setNoteDate(e.target.value)} style={{padding:'7px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.82rem'}}/>
          <textarea
            value={noteText}
            onChange={e=>setNoteText(e.target.value)}
            placeholder="오늘 시장에서 무엇을 봤고, 어떤 결정을 했고, 무엇을 배웠는지..."
            rows={3}
            style={{flex:1,minWidth:240,padding:'7px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.85rem',fontFamily:'inherit',resize:'vertical'}}/>
          <button onClick={saveNote} disabled={noteSaving||!noteText.trim()} style={{padding:'7px 16px',background:noteText.trim()?'#1B5E20':'#bbb',color:'#fff',border:'none',borderRadius:6,cursor:noteText.trim()?'pointer':'not-allowed',fontWeight:600,fontSize:'0.85rem',alignSelf:'flex-start'}}>
            {noteSaving?'저장중...':'저장'}
          </button>
        </div>
        {notes.length === 0 ? (
          <div style={{fontSize:'0.8rem',color:'var(--muted)',padding:'14px',background:'#fafafa',borderRadius:8,textAlign:'center'}}>아직 메모가 없습니다. 오늘의 첫 메모를 남겨보세요.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {notes.map(n=>(
              <div key={n.id} style={{padding:'10px 14px',background:'#f9fbe7',borderRadius:8,borderLeft:'3px solid #827717'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:'0.72rem',fontWeight:700,color:'#827717'}}>{n.date}</span>
                  <button onClick={()=>delNote(n.id)} style={{background:'transparent',border:'none',color:'#999',cursor:'pointer',fontSize:'0.9rem'}}>×</button>
                </div>
                <div style={{fontSize:'0.85rem',color:'var(--text)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 주간 리밸런싱 체크리스트 ─── */}
      <div style={{marginTop:36,padding:'20px 0',borderTop:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4,flexWrap:'wrap'}}>
          <h3 style={{fontSize:'1.05rem',fontWeight:700,color:'#1B5E20'}}>✅ 주간 리밸런싱 체크리스트</h3>
          <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>이번 주 ({weekStart}~) · {checkedCount}/{rebItems.length}</span>
          {isSunday && <span style={{fontSize:'0.7rem',background:'#fff3e0',color:'#e65100',padding:'3px 10px',borderRadius:20,fontWeight:600}}>🔔 일요일 — 리밸런싱 점검일</span>}
        </div>
        <p style={{fontSize:'0.75rem',color:'var(--muted)',marginBottom:14}}>월요일에 자동으로 체크가 초기화됩니다. 사용자 추가 항목은 다음 주에도 유지됩니다.</p>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
          {rebItems.map((it,i)=>(
            <label key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:rebChecks[i]?'#e8f5e9':'#fafafa',borderRadius:6,cursor:'pointer',transition:'background 0.15s'}}>
              <input type="checkbox" checked={!!rebChecks[i]} onChange={()=>toggleCheck(i)} style={{width:16,height:16,cursor:'pointer'}}/>
              <span style={{flex:1,fontSize:'0.85rem',color:rebChecks[i]?'#888':'var(--text)',textDecoration:rebChecks[i]?'line-through':'none'}}>{it.text}</span>
              {it.custom && <button onClick={(e)=>{e.preventDefault();removeRebItem(i);}} style={{background:'transparent',border:'none',color:'#999',cursor:'pointer',fontSize:'0.9rem'}}>×</button>}
            </label>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <input
            value={rebAddText}
            onChange={e=>setRebAddText(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addRebItem();}}}
            placeholder="나만의 체크 항목 추가..."
            style={{flex:1,padding:'7px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.82rem'}}/>
          <button onClick={addRebItem} disabled={!rebAddText.trim()} style={{padding:'7px 14px',background:rebAddText.trim()?'#1B5E20':'#bbb',color:'#fff',border:'none',borderRadius:6,cursor:rebAddText.trim()?'pointer':'not-allowed',fontWeight:600,fontSize:'0.82rem'}}>추가</button>
        </div>
      </div>

      <div style={{marginTop:24,fontSize:'0.68rem',color:'#bbb',borderTop:'1px solid var(--border)',paddingTop:10}}>
        ⚠️ 투자 참고용 포트폴리오입니다. 실제 투자 결정은 본인의 판단으로 하세요. 매일의 메모와 주간 점검이 장기 수익률을 만듭니다.
      </div>
    </div>
  );
}

// ─── 홈 할일 + 위클리 플래너 (로컬 저장) ──────────────────────────────────────
function usePersist(key, init) {
  const [val,setVal] = useState(()=>{ try{ const v=localStorage.getItem(key); return v?JSON.parse(v):init; }catch{return init;} });
  const set = useCallback(v=>{ setVal(v); try{localStorage.setItem(key,JSON.stringify(v));}catch{} },[key]);
  return [val,set];
}

const WEEK_DAYS = ['월','화','수','목','금','토','일'];
const HOURS = Array.from({length:18},(_,i)=>i+6); // 6~23시

function TodoPlanner() {
  const todayKey = new Date().toISOString().slice(0,10);
  const [todos,   setTodos]   = usePersist(`dlwns-todo-${todayKey}`, []);
  const [weekly,  setWeekly]  = usePersist('dlwns-weekly', Object.fromEntries(WEEK_DAYS.map(d=>[d,{}])));
  const [newTodo, setNewTodo] = useState('');
  const [view,    setView]    = useState('todo'); // 'todo' | 'weekly'
  const [editCell,setEditCell]= useState(null); // {day,hour}
  const [cellVal, setCellVal] = useState('');

  const addTodo = () => {
    if(!newTodo.trim()) return;
    setTodos([...todos,{id:Date.now(),text:newTodo.trim(),done:false}]);
    setNewTodo('');
  };
  const toggleTodo = id => setTodos(todos.map(t=>t.id===id?{...t,done:!t.done}:t));
  const delTodo    = id => setTodos(todos.filter(t=>t.id!==id));

  const startEdit = (day,hour) => {
    setEditCell({day,hour});
    setCellVal(weekly[day]?.[hour]||'');
  };
  const saveCell = () => {
    if(!editCell) return;
    const {day,hour} = editCell;
    const updated = {...weekly,[day]:{...weekly[day],[hour]:cellVal}};
    setWeekly(updated);
    setEditCell(null); setCellVal('');
  };

  return (
    <section className="stock-section">
      <div className="stock-inner">
        <div className="section-head" style={{marginBottom:16}}>
          <div className="section-title">오늘 & 이번 주</div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>setView('todo')}
              style={{padding:'5px 14px',borderRadius:20,fontSize:'0.78rem',fontWeight:600,cursor:'pointer',border:`1.5px solid ${view==='todo'?'#0052CC':'var(--border)'}`,background:view==='todo'?'#0052CC':'#fff',color:view==='todo'?'#fff':'var(--muted)',transition:'all 0.15s'}}>
              📋 할일
            </button>
            <button onClick={()=>setView('weekly')}
              style={{padding:'5px 14px',borderRadius:20,fontSize:'0.78rem',fontWeight:600,cursor:'pointer',border:`1.5px solid ${view==='weekly'?'#0052CC':'var(--border)'}`,background:view==='weekly'?'#0052CC':'#fff',color:view==='weekly'?'#fff':'var(--muted)',transition:'all 0.15s'}}>
              📅 위클리
            </button>
          </div>
        </div>

        {view==='todo' && (
          <div>
            {/* 입력 */}
            <div style={{display:'flex',gap:8,marginBottom:20}}>
              <input value={newTodo} onChange={e=>setNewTodo(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addTodo()}
                placeholder="오늘 할 일을 입력하세요..."
                style={{flex:1,padding:'9px 14px',borderRadius:8,border:'1.5px solid var(--border)',fontSize:'0.85rem',outline:'none',fontFamily:'inherit',background:'#fafafa'}}/>
              <button onClick={addTodo}
                style={{padding:'9px 18px',borderRadius:8,background:'#0052CC',color:'#fff',border:'none',fontSize:'0.82rem',fontWeight:700,cursor:'pointer'}}>
                추가
              </button>
            </div>
            {/* 할일 목록 */}
            {todos.length===0 ? (
              <div style={{textAlign:'center',padding:'32px 0',color:'var(--muted)',fontSize:'0.85rem'}}>
                {'오늘의 할 일을 추가해보세요 ✍️'}
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {todos.map(t=>(
                  <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,background:t.done?'#f5f5f5':'#fff',border:'1px solid var(--border)',transition:'all 0.15s'}}>
                    <div onClick={()=>toggleTodo(t.id)} style={{width:18,height:18,borderRadius:4,border:`2px solid ${t.done?'#0052CC':'#ccc'}`,background:t.done?'#0052CC':'transparent',flexShrink:0,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {t.done && <span style={{color:'#fff',fontSize:'11px',fontWeight:900}}>✓</span>}
                    </div>
                    <span style={{flex:1,fontSize:'0.85rem',color:t.done?'var(--muted)':'var(--text)',textDecoration:t.done?'line-through':'none'}}>{t.text}</span>
                    <button onClick={()=>delTodo(t.id)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:'14px',padding:'0 2px',lineHeight:1}}>✕</button>
                  </div>
                ))}
                <div style={{fontSize:'0.72rem',color:'var(--muted)',textAlign:'right',marginTop:4}}>
                  {todos.filter(t=>t.done).length}/{todos.length} 완료
                </div>
              </div>
            )}
          </div>
        )}

        {view==='weekly' && (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.72rem',tableLayout:'fixed',minWidth:560}}>
              <thead>
                <tr>
                  <th style={{width:36,padding:'6px 4px',color:'var(--muted)',fontWeight:500,borderBottom:'2px solid var(--border)',textAlign:'center'}}></th>
                  {WEEK_DAYS.map(d=>(
                    <th key={d} style={{padding:'8px 4px',fontWeight:700,color:'var(--text)',borderBottom:'2px solid var(--border)',textAlign:'center',fontSize:'0.78rem'}}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(h=>(
                  <tr key={h} style={{borderBottom:'1px solid #f0f0f0'}}>
                    <td style={{padding:'4px',color:'var(--muted)',textAlign:'center',fontWeight:500,fontSize:'0.68rem',verticalAlign:'top',paddingTop:6}}>{h}</td>
                    {WEEK_DAYS.map(d=>{
                      const val = weekly[d]?.[h]||'';
                      const isEditing = editCell?.day===d&&editCell?.hour===h;
                      return (
                        <td key={d} style={{padding:'2px',verticalAlign:'top',minHeight:28}}>
                          {isEditing ? (
                            <input autoFocus value={cellVal} onChange={e=>setCellVal(e.target.value)}
                              onBlur={saveCell} onKeyDown={e=>{if(e.key==='Enter')saveCell();if(e.key==='Escape'){setEditCell(null);setCellVal('');}}}
                              style={{width:'100%',padding:'3px 5px',fontSize:'0.7rem',border:'1.5px solid #0052CC',borderRadius:4,outline:'none',fontFamily:'inherit',background:'#f0f5ff'}}/>
                          ) : (
                            <div onClick={()=>startEdit(d,h)}
                              style={{width:'100%',minHeight:26,padding:'3px 5px',borderRadius:4,fontSize:'0.7rem',color:'var(--text)',cursor:'text',background:val?'#e8f0fe':'transparent',border:'1px solid transparent',transition:'all 0.1s',lineHeight:1.4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}
                              onMouseEnter={e=>{ if(!val) e.currentTarget.style.background='#f5f5f5'; }}
                              onMouseLeave={e=>{ if(!val) e.currentTarget.style.background='transparent'; }}>
                              {val||''}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{fontSize:'0.68rem',color:'var(--muted)',marginTop:8,textAlign:'right'}}>{'셀을 클릭해서 바로 입력하세요'}</div>
          </div>
        )}
      </div>
    </section>
  );
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

// ─── Market Chart (구글 파이낸스 스타일, 외부 API 불필요) ──────────────────────
function genIntraday(last, pct, n) {
  const open = last / (1 + pct);
  const pts = [open];
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    const trend = open + (last - open) * (t + Math.sin(t * Math.PI * 2) * 0.15);
    const noise = (Math.random() - 0.5) * Math.abs(last - open) * 0.3;
    pts.push(parseFloat((trend + noise).toFixed(2)));
  }
  pts[pts.length - 1] = last;
  return pts;
}
function genRandom(last, n, minPct, maxPct) {
  const pts = [];
  let v = last / (1 + minPct + (maxPct - minPct) * Math.random());
  for (let i = 0; i < n - 1; i++) {
    v = v * (1 + (Math.random() - 0.45) * 0.025);
    pts.push(parseFloat(v.toFixed(2)));
  }
  pts.push(last);
  return pts;
}
function genSeries(last, dailyPcts, days, ppd) {
  const all = [];
  let cur = last;
  for (let d = days - 1; d >= 0; d--) {
    const dayOpen = cur / (1 + (dailyPcts[days - 1 - d] || 0));
    const dayEnd = cur;
    for (let p = 0; p < ppd; p++) {
      const t = p / (ppd - 1);
      all.push(parseFloat((dayOpen + (dayEnd - dayOpen) * t + (Math.random() - 0.5) * Math.abs(dayEnd - dayOpen) * 0.3).toFixed(2)));
    }
    cur = dayOpen;
  }
  all.reverse();
  all[all.length - 1] = last;
  return all;
}
function intraLabels(n) {
  const l = [];
  for (let i = 0; i < n; i++) {
    const m = 9 * 60 + 30 + Math.round(i * (6.5 * 60) / (n - 1));
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    l.push(h + ':' + mm);
  }
  return l;
}
function mLabels(n, months) {
  const mn = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const now = new Date();
  const l = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.round((n - 1 - i) / (n - 1) * months * 30));
    l.push(months <= 1 ? (d.getMonth()+1)+'/'+d.getDate() : mn[d.getMonth()]);
  }
  return l;
}

const MKT_DATA = {
  sp500: {
    name:'S&P 500', lastPrice:5728.90,
    '1D':{ pts:null, labels:null, open:5664.70 },
    '5D':{ pts:null, labels:['월','화','수','목','금'], open:5620.10 },
    '1M':{ pts:null, labels:null, open:5570.33 },
    '6M':{ pts:null, labels:null, open:4892.10 },
    '1Y':{ pts:null, labels:null, open:4693.45 },
    high52:5848.42, low52:4103.78, mktcap:'$50.2T',
    pcts:{'1D':0.0113,'5D':0.0194,'1M':0.0283,'6M':0.172,'1Y':0.221}
  },
  kospi: {
    name:'KOSPI', lastPrice:2556.61,
    '1D':{ pts:null, labels:null, open:2534.40 },
    '5D':{ pts:null, labels:['월','화','수','목','금'], open:2510.20 },
    '1M':{ pts:null, labels:null, open:2493.80 },
    '6M':{ pts:null, labels:null, open:2298.34 },
    '1Y':{ pts:null, labels:null, open:2403.67 },
    high52:2677.37, low52:2169.68, mktcap:'₩1,976조',
    pcts:{'1D':0.0087,'5D':0.0185,'1M':0.0251,'6M':0.112,'1Y':0.063}
  }
};
// 데이터 초기화
function initMktData() {
  ['sp500','kospi'].forEach(idx => {
    const d = MKT_DATA[idx];
    const last = d.lastPrice;
    d['1D'].pts  = genIntraday(last, d.pcts['1D'], 78);
    d['1D'].labels = intraLabels(78);
    d['5D'].pts  = genSeries(last, [0.002,-0.008,0.015,-0.003,d.pcts['1D']], 5, 8);
    d['1M'].pts  = genRandom(last, 22, -0.03, d.pcts['1M']+0.02);
    d['1M'].labels = mLabels(22, 1);
    d['6M'].pts  = genRandom(last, 26, -0.05, d.pcts['6M']+0.03);
    d['6M'].labels = mLabels(26, 6);
    d['1Y'].pts  = genRandom(last, 52, -0.10, d.pcts['1Y']+0.05);
    d['1Y'].labels = mLabels(52, 12);
  });
}
initMktData();

// Chart.js 동적 로드 (CDN)
if (!window.__chartjsLoaded) {
  window.__chartjsLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  document.head.appendChild(s);
}

function MarketSection() {
  const [idx, setIdx] = useState('sp500');
  const [period, setPeriod] = useState('1D');
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const d   = MKT_DATA[idx];
  const pd  = d[period];
  const pts = pd.pts || [];
  const first = pts[0] || d.lastPrice;
  const last  = pts[pts.length - 1] || d.lastPrice;
  const chg   = last - first;
  const chgPct = first ? (chg / first * 100) : 0;
  const up    = chg >= 0;
  const upColor  = '#0f9d58';
  const dnColor  = '#d93025';
  const lineColor = up ? upColor : dnColor;
  const sign  = chg >= 0 ? '+' : '';

  const PERIODS = [
    {id:'1D', label:'1일'},{id:'5D', label:'5일'},{id:'1M', label:'1달'},
    {id:'6M', label:'6달'},{id:'1Y', label:'1년'}
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pts.length) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const mn = Math.min(...pts) - (Math.max(...pts) - Math.min(...pts)) * 0.05;
    const mx = Math.max(...pts) + (Math.max(...pts) - Math.min(...pts)) * 0.05;
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const gridC = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const tickC = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.38)';
    chartRef.current = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: pts.map((_,i)=>i),
        datasets: [{
          data: pts, borderColor: lineColor, borderWidth: 1.8,
          pointRadius: 0, pointHoverRadius: 4,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2,
          tension: 0.35, fill: true,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 170);
            g.addColorStop(0, lineColor + '28');
            g.addColorStop(1, lineColor + '00');
            return g;
          }
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode:'index', intersect:false },
        plugins: { legend:{display:false}, tooltip:{
          callbacks:{
            label: ctx => {
              const v = ctx.raw;
              const c = v - first;
              const p = (c/first*100);
              const s = c>=0?'+':'';
              return `${v.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})}  ${s}${c.toFixed(2)} (${s}${p.toFixed(2)}%)`;
            },
            title: ctx => pd.labels?.[ctx[0].dataIndex] || ''
          },
          backgroundColor: isDark?'rgba(30,30,30,0.95)':'rgba(255,255,255,0.97)',
          titleColor: isDark?'#aaa':'#666',
          bodyColor: isDark?'#fff':'#111',
          borderColor: isDark?'rgba(255,255,255,0.15)':'rgba(0,0,0,0.12)',
          borderWidth: 1, padding: 10, cornerRadius: 6,
        }},
        scales: {
          x: { display: false },
          y: {
            display: true, position:'right', min:mn, max:mx,
            grid: { color:gridC, drawBorder:false },
            ticks: { color:tickC, font:{size:11}, maxTicksLimit:5,
              callback: v => v>=1000 ? Math.round(v).toLocaleString('ko-KR') : v.toFixed(2)
            },
            border: { display:false }
          }
        }
      }
    });
    return () => { if(chartRef.current){ chartRef.current.destroy(); chartRef.current=null; } };
  }, [idx, period]);

  const xIdxs = pts.length > 4 ? [0, Math.floor(pts.length/4), Math.floor(pts.length/2), Math.floor(pts.length*3/4), pts.length-1] : [];
  const stats = [
    { label:'시작가', val: first.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}) },
    { label:'52주 최고', val: d.high52.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}) },
    { label:'52주 최저', val: d.low52.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}) },
    { label:'시가총액', val: d.mktcap },
  ];
  const pLabel = {  '1D':'오늘','5D':'5일간','1M':'1달간','6M':'6달간','1Y':'1년간' };

  return (
    <section className="stock-section">
      <div className="stock-inner">
        {/* 탭 */}
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:20}}>
          {['sp500','kospi'].map(k=>(
            <button key={k} onClick={()=>{setIdx(k);setPeriod('1D');}}
              style={{padding:'10px 20px',fontSize:'0.82rem',fontWeight:500,cursor:'pointer',border:'none',borderBottom:`2px solid ${idx===k?'#1a73e8':'transparent'}`,background:'none',color:idx===k?'#1a73e8':'var(--muted)',transition:'all 0.15s'}}>
              {k==='sp500'?'S&P 500':'KOSPI'}
            </button>
          ))}
        </div>
        {/* 헤더 */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:4}}>
          <div>
            <div style={{fontSize:'0.72rem',color:'var(--muted)',marginBottom:6,letterSpacing:'0.02em'}}>{d.name}</div>
            <div style={{fontSize:'2rem',fontWeight:400,color:'var(--text)',letterSpacing:'-0.5px',lineHeight:1,fontFamily:'Montserrat, sans-serif'}}>
              {last.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
              <span style={{fontSize:'0.8rem',fontWeight:600,color:up?upColor:dnColor}}>
                {sign}{chg.toFixed(2)} ({sign}{chgPct.toFixed(2)}%)
              </span>
              <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>{pLabel[period]}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:2}}>
            {PERIODS.map(p=>(
              <button key={p.id} onClick={()=>setPeriod(p.id)}
                style={{padding:'5px 10px',fontSize:'0.72rem',fontWeight:500,cursor:'pointer',borderRadius:4,background:period===p.id?'var(--bg)':'none',border:'none',color:period===p.id?'var(--text)':'var(--muted)',transition:'all 0.12s'}}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* 차트 */}
        <div style={{position:'relative',width:'100%',height:180,margin:'16px 0 4px'}}>
          <canvas ref={canvasRef} role="img" aria-label={`${d.name} 주가 지수 차트`}/>
        </div>
        {/* x축 레이블 */}
        <div style={{display:'flex',justifyContent:'space-between',padding:'0 2px',marginBottom:16}}>
          {xIdxs.map((i,n)=>(
            <span key={n} style={{fontSize:'0.68rem',color:'var(--muted)'}}>{pd.labels?.[i]||''}</span>
          ))}
        </div>
        {/* 통계 */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderTop:'1px solid var(--border)'}}>
          {stats.map(s=>(
            <div key={s.label} style={{padding:'12px 0',borderRight:'1px solid var(--border)','&:lastChild':{borderRight:'none'}}}>
              <div style={{fontSize:'0.68rem',color:'var(--muted)',marginBottom:3}}>{s.label}</div>
              <div style={{fontSize:'0.8rem',fontWeight:500,color:'var(--text)'}}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:'0.68rem',color:'#bbb',marginTop:10}}>
          💡 시뮬레이션 데이터 · 실제 투자 판단에 활용하지 마세요
        </div>
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
  const [form,setForm]        = useState({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});
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
  // Comments state
  const [comments,setComments] = useState({}); // postId -> [{id,nick,body,date}]
  const [commentNick,setCommentNick] = useState('');
  const [commentBody,setCommentBody] = useState('');
  // Music drag-n-drop
  const [dragIdx,setDragIdx] = useState(null);
  // DB 진단 모달
  const [dbDiag,setDbDiag] = useState(null); // null | {rows, raw}
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
  // 임시저장(draft) / 정식저장(published) 두 가지 모드
  const requestSavePost = (asDraft) => {
    if(!form.title) return;
    setConfirmAction({type: asDraft?'saveDraft':'savePost', data:{asDraft}});
  };
  const savePost = async (asDraft=false) => {
    const today=new Date().toISOString().slice(0,10);
    // images가 있으면 img는 대표 이미지로 동기화 (옛 카드뷰 호환)
    const main = (form.images && form.images.length>0)
      ? (form.images[form.mainIdx] || form.images[0])
      : form.img;
    const status = asDraft ? 'draft' : 'published';
    const newPost = editing
      ? {...posts.find(p=>p.id===editing.id), ...form, img: main, status}
      : {id:Date.now(),...form,img:main,date:today,status};
    const u = editing
      ? posts.map(p=>p.id===editing.id?newPost:p)
      : [newPost,...posts];
    setPosts(u); postsRef.current=u;
    // Supabase 저장
    await dbUpsert("dlwns_posts", { post_id: newPost.id, owner: OWNER_ID, data: newPost });
    setModal(null); setEditing(null);
    setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});
  };
  const confirmSave = () => {
    const asDraft = confirmAction.data.asDraft;
    setConfirmAction(null);
    savePost(asDraft);
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
    setForm({title:p.title,summary:p.summary,cat:p.cat,subcat:p.subcat||"all",body:p.body||"",img:p.img||"",images:p.images||[],pinned:p.pinned||false,videoUrl:p.videoUrl||"",mainIdx:Number.isInteger(p.mainIdx)?p.mainIdx:0});
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
    // 모든 카테고리에서 다중 이미지 지원 (음악 제외 - 음악은 별도 폼이라 영향 없음)
    const newImgs = await Promise.all(files.map(f=>toB64(f)));
    setForm(prev=>{
      const merged = [...(prev.images||[]), ...newImgs];
      // 옛 img 단일 필드는 호환을 위해 첫 사진으로 갱신
      const mIdx = Number.isInteger(prev.mainIdx) ? prev.mainIdx : 0;
      const main = merged[mIdx] || merged[0] || '';
      return {...prev, images: merged, img: main};
    });
    // 같은 파일 다시 선택 가능하도록 input 리셋
    e.target.value = '';
  };
  const handleAvatar = async e => {
    const f=e.target.files[0]; if(!f)return;
    const b64 = await toB64(f);
    const u = {...profile, avatar:b64};
    setProfile(u);
    await dbUpsert("dlwns_profile", { owner: OWNER_ID, data: u });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const EMO={insight:'💡',inspiration:'✨',career:'💼',study:'📚',invest:'💰',daily:'☀️',baseball:'⚾',music:'🎵'};
  const isAll = activeCat==="all";
  const catInfo = CAT[activeCat];
  const subcats = !isAll ? SUBCATS[activeCat]||[] : [];
  // 임시저장 글은 메인 피드/카테고리에서 숨김 (편집/이어쓰기 용도로만)
  const publicPosts = posts.filter(p => p.status !== 'draft');
  const drafts      = posts.filter(p => p.status === 'draft');
  const catFiltered = isAll ? publicPosts : publicPosts.filter(p=>p.cat===activeCat);
  const filtered = activeSub==="all" ? catFiltered : catFiltered.filter(p=>p.subcat===activeSub);
  const pinned = isAll ? (filtered.find(p=>p.pinned)||filtered[0]) : null;
  const rest = pinned ? filtered.filter(p=>p!==pinned) : filtered;
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  const stocks = [];

  // ── 설정 드롭다운 ─────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888'}}>불러오는 중...</div>;

  // ── Video render helper ─────────────────────────────────────────────────────
  // 대표 이미지 헬퍼: 새 글은 images[mainIdx] || images[0], 옛 글은 img
  const mainImg = (p) => {
    if(p.images && p.images.length > 0){
      const idx = Number.isInteger(p.mainIdx) ? p.mainIdx : 0;
      return p.images[idx] || p.images[0] || '';
    }
    return p.img || '';
  };

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
          {/* 설정 드롭다운 */}
          <div style={{position:'relative'}}>
            <button className="btn btn-outline" style={{fontSize:'0.78rem',padding:'6px 14px'}}
              onClick={()=>setSettingsOpen(v=>!v)}>
              ⚙️ 설정
            </button>
            {settingsOpen && (
              <>
                <div style={{position:'fixed',inset:0,zIndex:299}} onClick={()=>setSettingsOpen(false)}/>
                <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:'#fff',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 4px 20px rgba(0,0,0,0.10)',zIndex:300,minWidth:160,overflow:'hidden'}}>
                  <button style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 16px',background:'none',border:'none',fontSize:'0.83rem',cursor:'pointer',color:'var(--text)',textAlign:'left'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                    onMouseLeave={e=>e.currentTarget.style.background='none'}
                    onClick={async ()=>{
                      setSettingsOpen(false);
                      const choice = window.confirm("📤 내보내기(확인) / 📥 가져오기(취소)");
                      if(choice) exportData();
                      else document.getElementById('import-file').click();
                    }}>
                    <span>💾</span> 백업 / 복구
                  </button>
                  <div style={{height:1,background:'var(--border)',margin:'0 12px'}}/>
                  <button style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 16px',background:'none',border:'none',fontSize:'0.83rem',cursor:'pointer',color:'#00875A',textAlign:'left'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                    onMouseLeave={e=>e.currentTarget.style.background='none'}
                    onClick={async ()=>{
                      setSettingsOpen(false);
                      const rows = await dbGetAll("dlwns_posts", `owner=eq.${OWNER_ID}`);
                      setDbDiag({ rows: rows || [] });
                    }}>
                    <span>🔍</span> DB 진단
                  </button>
                  <div style={{height:1,background:'var(--border)',margin:'0 12px'}}/>
                  <button style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'11px 16px',background:'none',border:'none',fontSize:'0.83rem',cursor:'pointer',color:'var(--text)',textAlign:'left'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                    onMouseLeave={e=>e.currentTarget.style.background='none'}
                    onClick={()=>{ setSettingsOpen(false); setPrForm({...profile}); setModal('profile'); }}>
                    <span>👤</span> 프로필 편집
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:isAll?"insight":activeCat==='invest'?"insight":activeCat,subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});setModal('write');}}>+ 글쓰기</button>
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
          {/* 이미지 표시: images 배열이 있으면 그리드, 없으면 단일 img 호환 */}
          {(() => {
            const imgs = (detail.images && detail.images.length > 0) ? detail.images : (detail.img ? [detail.img] : []);
            if(imgs.length === 0) return null;
            // 대표 사진을 맨 앞으로
            const mIdx = Number.isInteger(detail.mainIdx) ? detail.mainIdx : 0;
            const ordered = imgs.length > 1
              ? [imgs[mIdx], ...imgs.filter((_,i)=>i!==mIdx)]
              : imgs;
            if(ordered.length === 1){
              // 사진 한 장: 화면 가득 (기존 detail-img 스타일과 동일하게)
              return <img className="detail-img" src={ordered[0]} alt=""/>;
            }
            // 여러 장: 4분할 그리드 (한 장당 화면의 25%)
            return (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8,marginBottom:24}}>
                {ordered.map((src,i)=>(
                  <img key={i} src={src} alt="" style={{width:'100%',aspectRatio:'1/1',objectFit:'cover',borderRadius:6,display:'block'}}/>
                ))}
              </div>
            );
          })()}
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
                <button className="btn btn-lg btn-white" onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});setModal('write');}}>{'+ 새 글 작성'}</button>
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
              <div className="cat-stat" style={{cursor:'pointer'}}
                   onClick={()=>{
                     setEditing(null);
                     setForm({title:"",summary:"",cat:activeCat==='invest'?"insight":activeCat,subcat:activeSub!=="all"?activeSub:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});
                     setModal('write');
                   }}>
                <div>
                  <div className="cat-stat-num" style={{color:catInfo.color,fontSize:'1.6rem'}}>+</div>
                  <div className="cat-stat-label">글쓰기</div>
                </div>
              </div>
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

      {/* ── TODO + WEEKLY (마켓 인사이트 대체) ── */}
      {isAll && <TodoPlanner />}

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
                              <div className="pc-thumb">{mainImg(p)?<img src={mainImg(p)} alt=""/>:EMO[p.cat]}{p.videoUrl&&<div className="video-badge">▶ VIDEO</div>}</div>
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
                      {mainImg(pinned)?<img src={mainImg(pinned)} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:EMO[pinned.cat]}
                      {pinned.videoUrl&&<div className="video-badge">▶ VIDEO</div>}
                    </div>
                  </div>
                )}
                {rest.length>0&&(
                  <div className="posts-grid">
                    {rest.map(p=>(
                      <div key={p.id} className="post-card" onClick={()=>navToPost(p)}>
                        <div className="pc-thumb">
                          {mainImg(p)?<img src={mainImg(p)} alt=""/>:EMO[p.cat]}
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
            activeCat==='invest' ? (
              /* ── INVEST PORTFOLIO VIEW ── */
              <div style={{gridColumn:'1/-1'}}>
                <InvestPortfolio />
              </div>
            ) : activeCat==='music' ? (
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
                    <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"music",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});setModal('write');}}>+ 음악 추가</button>
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
                        {mainImg(p) ? (
                          <div style={{aspectRatio:'3/2',overflow:'hidden',background:'#111'}}>
                            <img src={mainImg(p)} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
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
                    <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:"baseball",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});setModal('write');}}>+ 야구 기록 추가</button>
                  </div>
                )}
              </div>
            ) : filtered.length>0 ? (
              <div className="posts-grid-3">
                {filtered.map(p=>(
                  <div key={p.id} className="post-card" onClick={()=>navToPost(p)}>
                    <div className="pc-thumb">
                      {mainImg(p)?<img src={mainImg(p)} alt=""/>:EMO[p.cat]}
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
                <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>{setEditing(null);setForm({title:"",summary:"",cat:activeCat,subcat:activeSub!=="all"?activeSub:"all",body:"",img:"",images:[],pinned:false,videoUrl:"",mainIdx:0});setModal('write');}}>+ 첫 글 작성하기</button>
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
          {confirmAction.type==='savePost'&&<>
            <div className="confirm-modal-title">💾 글 저장</div>
            <div className="confirm-modal-desc">이 글을 저장하시겠습니까?<br/><b>"{form.title}"</b><br/><span style={{fontSize:'0.78rem',color:'var(--muted)'}}>저장하면 모든 사람에게 공개됩니다.</span></div>
            <div className="confirm-modal-btns">
              <button className="btn btn-outline" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={()=>setConfirmAction(null)}>취소</button>
              <button className="btn btn-primary" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={confirmSave}>저장하기</button>
            </div>
          </>}
          {confirmAction.type==='saveDraft'&&<>
            <div className="confirm-modal-title">🗒️ 임시 저장</div>
            <div className="confirm-modal-desc">이 글을 임시저장하시겠습니까?<br/><b>"{form.title}"</b><br/><span style={{fontSize:'0.78rem',color:'var(--muted)'}}>임시저장 글은 공개되지 않으며, 글쓰기 모달에서 이어쓸 수 있습니다.</span></div>
            <div className="confirm-modal-btns">
              <button className="btn btn-outline" style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={()=>setConfirmAction(null)}>취소</button>
              <button className="btn btn-primary" style={{padding:'8px 14px',fontSize:'0.8rem',background:'#827717',borderColor:'#827717'}} onClick={confirmSave}>임시저장</button>
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
              {/* 임시저장 알림 (수정 모드 아닐 때만) */}
              {!editing && drafts.length > 0 && (
                <div style={{background:'#fffde7',border:'1px solid #fbc02d',borderRadius:8,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <span style={{fontSize:'0.82rem',color:'#5d4037',flex:1,minWidth:200}}>🗒️ 임시저장 글 <b>{drafts.length}개</b>가 있습니다. 이어쓰시겠습니까?</span>
                  <select style={{padding:'5px 8px',fontSize:'0.78rem',border:'1px solid #ddd',borderRadius:5,maxWidth:240}} onChange={e=>{
                    const v = e.target.value;
                    if(!v) return;
                    const d = drafts.find(p=>String(p.id)===v);
                    if(d){ openEdit(d); }
                    e.target.value = '';
                  }}>
                    <option value="">— 이어쓸 글 선택 —</option>
                    {drafts.map(d=><option key={d.id} value={d.id}>{d.title || '(제목 없음)'} · {d.date}</option>)}
                  </select>
                </div>
              )}
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
              <div className="fg">
                <label>유튜브 영상 링크 (선택)</label>
                <input type="text" value={form.videoUrl} placeholder="https://www.youtube.com/watch?v=... 또는 쇼츠/인스타 릴스" onChange={e=>setForm({...form,videoUrl:e.target.value})}/>
                <div className="video-hint">입력하면 글 본문 위에 영상이 임베드되어 바로 재생 가능합니다.</div>
              </div>
              <div className="fg">
                <label>사진 (여러 장 가능 · 대표 사진은 별표 ⭐로 선택)</label>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <button className="btn btn-outline" style={{padding:'7px 12px',fontSize:'0.76rem'}} onClick={()=>imgRef.current.click()}>
                    + 사진 추가
                  </button>
                  {(form.images||[]).length>0 && <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>{form.images.length}장 · 대표 #{(form.mainIdx||0)+1}</span>}
                </div>
                {(form.images||[]).length>0 && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:8}}>
                    {form.images.map((src,i)=>{
                      const isMain = i === (form.mainIdx||0);
                      return (
                        <div key={i} style={{position:'relative',border:isMain?'2px solid #FFB300':'2px solid transparent',borderRadius:6,overflow:'hidden'}}>
                          <img src={src} alt="" style={{width:'100%',height:80,objectFit:'cover',display:'block'}}/>
                          {/* 대표 사진 별표 */}
                          <button onClick={()=>setForm(prev=>({...prev,mainIdx:i}))}
                            title={isMain?'대표 사진':'대표 사진으로 설정'}
                            style={{position:'absolute',top:2,left:2,background:isMain?'#FFB300':'rgba(0,0,0,0.5)',color:'#fff',border:'none',borderRadius:'50%',width:22,height:22,fontSize:'0.7rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>
                            {isMain?'★':'☆'}
                          </button>
                          {/* 삭제 */}
                          <button onClick={()=>setForm(prev=>{
                            const nextImgs = prev.images.filter((_,j)=>j!==i);
                            let nextMain = prev.mainIdx||0;
                            if(i === nextMain) nextMain = 0;
                            else if(i < nextMain) nextMain -= 1;
                            return {...prev,images:nextImgs,mainIdx:Math.max(0,Math.min(nextMain,nextImgs.length-1))};
                          })}
                            style={{position:'absolute',top:2,right:2,background:'rgba(0,0,0,0.6)',color:'#fff',border:'none',borderRadius:'50%',width:20,height:20,fontSize:'0.65rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <input ref={imgRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleImg}/>
              </div>
              <div className="fg"><label>본문</label><textarea rows={6} value={form.body} placeholder="내용을 작성하세요" onChange={e=>setForm({...form,body:e.target.value})}/></div>
              <div className="fg" style={{display:'flex',gap:8,alignItems:'center'}}>
                <input type="checkbox" id="pin" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})} style={{width:'auto',margin:0}}/>
                <label htmlFor="pin" style={{margin:0,cursor:'pointer',fontSize:'0.83rem'}}>대표 글로 고정 (전체 페이지)</label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-outline" onClick={()=>setModal(null)}>취소</button>
              <button className="btn btn-outline" onClick={()=>requestSavePost(true)} disabled={!form.title} style={{opacity:form.title?1:0.4,borderColor:'#827717',color:'#827717'}}>🗒️ 임시저장</button>
              <button className="btn btn-primary" onClick={()=>requestSavePost(false)} disabled={!form.title} style={{opacity:form.title?1:0.4}}>저장</button>
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

    {/* ── DB 진단 모달 ── */}
    {dbDiag && (
      <div className="modal-bg" onClick={()=>setDbDiag(null)}>
        <div className="modal" style={{maxWidth:700}} onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <div className="modal-title">🔍 Supabase DB 진단 — 총 {dbDiag.rows.length}개 글</div>
            <button className="modal-x" onClick={()=>setDbDiag(null)}>✕</button>
          </div>
          <div className="modal-body" style={{padding:'14px 22px'}}>
            {dbDiag.rows.length === 0 ? (
              <div style={{color:'var(--red)',fontWeight:700,padding:'20px 0',textAlign:'center'}}>
                ⚠️ Supabase에 저장된 글이 없습니다.<br/>
                <span style={{fontSize:'0.8rem',fontWeight:400,color:'var(--muted)'}}>SUPA_KEY가 실제 anon key로 교체되었는지 확인하세요.</span>
              </div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.78rem'}}>
                <thead>
                  <tr style={{background:'var(--bg)',borderBottom:'2px solid var(--border)'}}>
                    <th style={{padding:'8px 10px',textAlign:'left',color:'var(--muted)'}}>ID</th>
                    <th style={{padding:'8px 10px',textAlign:'left',color:'var(--muted)'}}>카테고리</th>
                    <th style={{padding:'8px 10px',textAlign:'left',color:'var(--muted)'}}>서브카테고리</th>
                    <th style={{padding:'8px 10px',textAlign:'left',color:'var(--muted)'}}>제목</th>
                    <th style={{padding:'8px 10px',textAlign:'left',color:'var(--muted)'}}>날짜</th>
                    <th style={{padding:'8px 10px',textAlign:'left',color:'var(--muted)'}}>복구</th>
                  </tr>
                </thead>
                <tbody>
                  {dbDiag.rows.map((r,i)=>{
                    const p = r.data || {};
                    const inMemory = posts.find(pp=>pp.id===r.post_id);
                    const isStudyEtc = p.cat==='study' && p.subcat==='etc';
                    return (
                      <tr key={r.post_id} style={{borderBottom:'1px solid var(--border)',background:isStudyEtc?'#fffbe6':i%2===0?'#fff':'#fafafa'}}>
                        <td style={{padding:'7px 10px',fontFamily:'monospace',color:'var(--muted)',fontSize:'0.68rem'}}>{r.post_id}</td>
                        <td style={{padding:'7px 10px'}}>
                          <span style={{color:CAT[p.cat]?.color,fontWeight:700}}>{CAT[p.cat]?.label||p.cat}</span>
                        </td>
                        <td style={{padding:'7px 10px',color:'var(--sub)'}}>{p.subcat||'-'}</td>
                        <td style={{padding:'7px 10px',fontWeight:600,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title||'(제목없음)'}</td>
                        <td style={{padding:'7px 10px',color:'var(--muted)',fontSize:'0.72rem'}}>{p.date||'-'}</td>
                        <td style={{padding:'7px 10px'}}>
                          {!inMemory && (
                            <button className="btn-sm" style={{fontSize:'0.68rem',color:'var(--green)',borderColor:'#b3e6cc'}}
                              onClick={async ()=>{
                                const restored = {...p, id:r.post_id};
                                const u = [restored, ...posts];
                                setPosts(u); postsRef.current=u;
                                setDbDiag(prev=>({...prev})); // re-render
                              }}>복구</button>
                          )}
                          {inMemory && <span style={{color:'var(--muted)',fontSize:'0.68rem'}}>✓ 표시중</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div style={{marginTop:14,padding:'10px 12px',background:'#f0f7ff',borderRadius:6,fontSize:'0.75rem',color:'var(--sub)',lineHeight:1.7}}>
              💡 <b>스터디/기타 글이 보이는데 앱에 안 보인다면</b>: subcat 값이 다른 것입니다. 복구 버튼을 눌러 메모리에 올린 뒤 수정하세요.<br/>
              💡 <b>목록이 비어있다면</b>: GitHub의 SUPA_KEY를 실제 값으로 교체 후 다시 배포하세요.
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-outline" onClick={()=>setDbDiag(null)}>닫기</button>
          </div>
        </div>
      </div>
    )}
  </>);
}

