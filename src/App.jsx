import { useState, useEffect, useRef, useCallback } from "react";

// ─── Supabase Config ──────────────────────────────────────────────────────────
// ⚠️  【필수】 아래 두 줄을 본인의 Supabase 실제 값으로 교체하세요
// Supabase 대시보드 → Settings → API 에서 확인
const SUPA_URL = "https://uxqbfbjniweabkecfhjp.supabase.co"; // ← 실제 Project URL
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cWJmYmpuaXdlYWJrZWNmaGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTYyMjQsImV4cCI6MjA5MzY3MjIyNH0.b9_xAWctaWOB8n4fOuopfKqj-2GC-GHTQp2fXpRn0TE"; // ← 실제 anon public key
const OWNER_ID = "dlwnsleejun"; // 고정값, 변경 금지

// ── 작성자 인증 PIN (배포 전 원하는 숫자/문자로 변경) ──
const OWNER_PIN = "351224"; // ← 여기를 원하는 인증번호로 변경하세요

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
// owner PK 단일행 테이블 전용 저장 — resolution=merge-duplicates 대신
// GET으로 존재 확인 → 있으면 PATCH / 없으면 POST (훨씬 안정적)
async function dbSaveOwner(table, owner, data) {
  const base = `${SUPA_URL}/rest/v1/${table}`;
  const h = H();
  try {
    const checkR = await fetch(`${base}?owner=eq.${owner}&limit=1`, { headers: h });
    if(!checkR.ok) {
      const t = await checkR.text();
      console.error(`[dbSaveOwner] GET failed (${table}):`, t);
      return { ok: false, error: t };
    }
    const exists = (await checkR.json()).length > 0;
    const r = await fetch(exists ? `${base}?owner=eq.${owner}` : base, {
      method: exists ? 'PATCH' : 'POST',
      headers: h,
      body: JSON.stringify(exists ? { data } : { owner, data })
    });
    if(!r.ok) {
      const t = await r.text();
      console.error(`[dbSaveOwner] ${exists?'PATCH':'POST'} failed (${table}):`, t);
      return { ok: false, error: t };
    }
    return { ok: true };
  } catch(e) {
    console.error('[dbSaveOwner]', e);
    return { ok: false, error: e.message };
  }
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

// ─── 리치 텍스트 에디터 컴포넌트 ─────────────────────────────────────────────
const HIGHLIGHT_COLORS = [
  { bg:'#FFFF00', name:'노랑' },
  { bg:'#ADFF2F', name:'연두' },
  { bg:'#FFB6C1', name:'분홍' },
  { bg:'#ADD8E6', name:'하늘' },
  { bg:'#E8D5FF', name:'보라' },
];

function RichEditor({ value, onChange, placeholder }) {
  const ref = useRef(null);
  useEffect(()=>{
    if(ref.current) ref.current.innerHTML = value || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd, val=null) => {
    ref.current.focus();
    document.execCommand(cmd, false, val);
    onChange(ref.current.innerHTML);
  };

  return (
    <div>
      <div className="editor-toolbar">
        {/* 서식 */}
        <button className="editor-btn" title="굵게 (Ctrl+B)"    onMouseDown={e=>{e.preventDefault();exec('bold');}}>          <b>B</b></button>
        <button className="editor-btn" title="기울임 (Ctrl+I)"  onMouseDown={e=>{e.preventDefault();exec('italic');}}>        <i style={{fontStyle:'italic'}}>I</i></button>
        <button className="editor-btn" title="밑줄 (Ctrl+U)"    onMouseDown={e=>{e.preventDefault();exec('underline');}}>     <u>U</u></button>
        <button className="editor-btn" title="취소선"            onMouseDown={e=>{e.preventDefault();exec('strikeThrough');}}> <s>S</s></button>
        <div className="editor-sep"/>
        {/* 글자 크기 */}
        <select title="글자 크기"
          style={{border:'1px solid #dee2e6',borderRadius:4,padding:'4px 5px',fontSize:'0.78rem',cursor:'pointer',background:'#fff',color:'#333'}}
          onMouseDown={e=>e.stopPropagation()}
          onChange={e=>{ if(e.target.value) exec('fontSize', e.target.value); e.target.value=''; }}>
          <option value="">크기▾</option>
          <option value="2">작게</option>
          <option value="3">보통</option>
          <option value="5">크게</option>
          <option value="6">아주 크게</option>
        </select>
        <div className="editor-sep"/>
        {/* 형광펜 */}
        <span style={{fontSize:'0.72rem',color:'#888',marginRight:2,userSelect:'none'}}>형광펜</span>
        {HIGHLIGHT_COLORS.map(h=>(
          <button key={h.bg} title={h.name}
            onMouseDown={e=>{ e.preventDefault(); exec('hiliteColor', h.bg); }}
            style={{width:20,height:20,background:h.bg,border:'1.5px solid #ccc',borderRadius:3,cursor:'pointer',padding:0,flexShrink:0}}/>
        ))}
        <button title="형광펜 지우기"
          onMouseDown={e=>{ e.preventDefault(); exec('hiliteColor','transparent'); }}
          style={{width:20,height:20,background:'#fff',border:'1.5px solid #ccc',borderRadius:3,cursor:'pointer',padding:0,flexShrink:0,
                  backgroundImage:'repeating-linear-gradient(45deg,#ccc,#ccc 2px,#fff 2px,#fff 6px)'}}/>
        <div className="editor-sep"/>
        {/* 정렬 */}
        <button className="editor-btn" title="왼쪽 정렬"   onMouseDown={e=>{e.preventDefault();exec('justifyLeft');}}>◀</button>
        <button className="editor-btn" title="가운데 정렬" onMouseDown={e=>{e.preventDefault();exec('justifyCenter');}}>☰</button>
        <button className="editor-btn" title="오른쪽 정렬" onMouseDown={e=>{e.preventDefault();exec('justifyRight');}}>▶</button>
        <div className="editor-sep"/>
        {/* 목록 */}
        <button className="editor-btn" title="• 목록"     onMouseDown={e=>{e.preventDefault();exec('insertUnorderedList');}}>• 목록</button>
        <button className="editor-btn" title="번호 목록"  onMouseDown={e=>{e.preventDefault();exec('insertOrderedList');}}>① 목록</button>
        <div className="editor-sep"/>
        {/* 블록 스타일 */}
        <button className="editor-btn" style={{fontWeight:700,fontSize:'0.82rem'}} title="제목(H2)" onMouseDown={e=>{e.preventDefault();exec('formatBlock','h2');}}>H2</button>
        <button className="editor-btn" style={{fontWeight:600,fontSize:'0.78rem'}} title="소제목(H3)" onMouseDown={e=>{e.preventDefault();exec('formatBlock','h3');}}>H3</button>
        <button className="editor-btn" style={{fontSize:'0.78rem'}} title="본문으로 되돌리기" onMouseDown={e=>{e.preventDefault();exec('formatBlock','p');}}>본문</button>
      </div>
      {/* 에디터 본문 영역 */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="editor-content"
        data-placeholder={placeholder||"내용을 작성하세요..."}
        onInput={e=>onChange(e.currentTarget.innerHTML)}
        onPaste={e=>{
          e.preventDefault();
          // 클립보드에서 plain text만 삽입 (외부 HTML 스타일 오염 방지)
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          onChange(ref.current.innerHTML);
        }}
      />
    </div>
  );
}

// ─── AI Market Data (Anthropic API + Web Search) ──────────────────────────────
// Yahoo Finance CORS 문제 해결: Claude API가 웹검색으로 실시간 데이터 수집
// ─── 투자 포트폴리오 기본 데이터 (원화 기준, Supabase에 없을 때 fallback) ─────
const DEFAULT_PORTFOLIO = {
  updatedAt: "2026년 5월 28일",
  thesis: "AI 인프라 집중 + 글로벌 분산 + 현금 방어. 변동성 높은 시장에서 핵심 성장주는 무게중심을 유지하되, ETF로 리스크를 분산하고 단기 채권으로 현금 흐름을 확보한다.",
  items: [
    { label:"NVDA",       krw:1800000, color:"#76b900", desc:"AI 인프라 왕. 데이터센터 GPU 독점적 지위" },
    { label:"QQQ",        krw:1500000, color:"#0052CC", desc:"나스닥 100 ETF. 빅테크 전체에 베팅하며 개별종목 리스크 분산" },
    { label:"MSFT",       krw:1200000, color:"#00a4ef", desc:"Azure + Copilot. 클라우드·AI 양쪽 다 먹는 현금창출 기계" },
    { label:"VOO",        krw:1200000, color:"#1565C0", desc:"S&P500 ETF. 나머지 포지션의 변동성을 완충하는 앵커" },
    { label:"AMZN",       krw:1000000, color:"#FF9900", desc:"AWS 재가속 + 광고 성장. 소매 마진 개선 사이클 진입" },
    { label:"PLTR",       krw:800000,  color:"#8c1aff", desc:"정부·기업 AI 데이터 플랫폼. 흑자 전환 후 성장 가속" },
    { label:"BRK.B",      krw:800000,  color:"#8B6914", desc:"버핏의 포트폴리오를 통째로 소유. 하락장 방어 + 복리 기계" },
    { label:"단기채권/예금", krw:1700000, color:"#78909C", desc:"SHV + 예금. 기회 올 때 즉시 투입할 실탄" },
  ]
};

// 원화 포맷 헬퍼
const fmtKrw = (v) => {
  if(v >= 100000000) return `${(v/100000000).toFixed(1)}억`;
  if(v >= 10000)     return `${Math.round(v/10000)}만원`;
  return `${v.toLocaleString()}원`;
};
const fmtKrwFull = (v) => `${v.toLocaleString()}원`;

function InvestPortfolio({ requireAuth }) {
  const isMobile = useIsMobile();
  const authWrap = requireAuth || ((fn)=>fn());
  // ── 포트폴리오 (Supabase 연동) ──
  const [pf, setPf]         = useState(DEFAULT_PORTFOLIO);
  const [pfLoaded, setPfLoaded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft]   = useState(null);
  const [saving, setSaving] = useState(false);

  // ── 차트 ──
  const [hovered, setHovered]   = useState(null);
  const [chartReady, setChartReady] = useState(false);
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  // ── 일일 시장 메모 ──
  const [notes, setNotes]       = useState([]);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0,10));
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLoaded, setNoteLoaded] = useState(false);

  // Chart.js 로드
  useEffect(()=>{
    if(window.Chart){ setChartReady(true); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    s.onload = () => setChartReady(true);
    document.head.appendChild(s);
  }, []);

  // 초기 데이터 로드
  useEffect(()=>{
    (async ()=>{
      // 포트폴리오
      try {
        const row = await dbGet('dlwns_portfolio', `owner=eq.${OWNER_ID}`);
        if(row && row.data && (row.data.items||[]).length > 0) setPf(row.data);
      } catch(e){ console.warn('pf load', e); }
      setPfLoaded(true);

      // 일일 메모 — owner 단일 행에 notes 배열 전체를 저장하는 방식
      try {
        const row = await dbGet('dlwns_market_notes', `owner=eq.${OWNER_ID}`);
        if(row && row.data && Array.isArray(row.data.notes)){
          setNotes(row.data.notes.slice().sort((a,b)=>b.date.localeCompare(a.date)));
        }
      } catch(e){ console.warn('notes load', e); }
      setNoteLoaded(true);
    })();
  }, []);

  // 차트 렌더링
  useEffect(()=>{
    if(!chartReady || !canvasRef.current || !pfLoaded) return;
    const total = pf.items.reduce((s,i)=>s+i.krw, 0) || 1;
    if(chartRef.current) chartRef.current.destroy();
    chartRef.current = new window.Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: pf.items.map(i=>i.label),
        datasets:[{
          data: pf.items.map(i=>+(i.krw/total*100).toFixed(1)),
          backgroundColor: pf.items.map(i=>i.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverOffset: 10,
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'60%',
        plugins:{
          legend:{display:false},
          tooltip:{ callbacks:{ label: ctx=>`${ctx.label}  ${ctx.parsed.toFixed(1)}%  (${fmtKrw(pf.items[ctx.dataIndex].krw)})` } }
        },
        onHover:(_,els)=>setHovered(els.length>0 ? els[0].index : null)
      }
    });
    return ()=>{ if(chartRef.current){ chartRef.current.destroy(); chartRef.current=null; } };
  }, [chartReady, pfLoaded, pf]);

  const totalKrw  = pf.items.reduce((s,i)=>s+i.krw, 0);
  const hItem     = hovered!==null ? pf.items[hovered] : null;
  const hPct      = hItem ? +(hItem.krw/totalKrw*100).toFixed(1) : 0;

  // ── 편집 ──
  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(pf))); setEditMode(true); };
  const cancelEdit = () => { setEditMode(false); setDraft(null); };
  const updateItem = (i,k,v) => {
    const items = [...draft.items];
    items[i] = {...items[i], [k]: k==='krw' ? Number(v)||0 : v };
    setDraft({...draft, items});
  };
  const addItem = () => setDraft({...draft, items:[...draft.items, {label:'새 종목', krw:0, color:'#888888', desc:''}]});
  const removeItem = (i) => setDraft({...draft, items: draft.items.filter((_,j)=>j!==i)});
  const saveEdit = async () => {
    setSaving(true);
    const now = new Date();
    const next = {...draft, updatedAt:`${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`};
    const result = await dbSaveOwner('dlwns_portfolio', OWNER_ID, next);
    if(result.ok){ setPf(next); setEditMode(false); setDraft(null); }
    else {
      let msg = '포트폴리오 저장 실패\n\n';
      try { const p=JSON.parse(result.error); msg += p.message||result.error; }
      catch { msg += result.error||'알 수 없는 오류'; }
      alert(msg);
    }
    setSaving(false);
  };

  // ── 일일 메모 ──
  const saveNote = async () => {
    if(!noteText.trim()) return;
    setNoteSaving(true);
    const newNote = { id: Date.now(), date: noteDate, text: noteText.trim() };
    const merged  = [newNote, ...notes].slice(0, 30);
    const result  = await dbSaveOwner('dlwns_market_notes', OWNER_ID, { notes: merged });
    if(result.ok){
      setNotes(merged);
      setNoteText('');
    } else {
      // 실제 Supabase 에러 메시지 표시 (원인 파악용)
      let msg = '메모 저장 실패\n\n';
      try {
        const parsed = JSON.parse(result.error);
        if(parsed.message) msg += parsed.message;
        else msg += result.error;
      } catch { msg += result.error || '알 수 없는 오류'; }
      msg += '\n\n※ dlwns_market_notes 테이블이 Supabase에 생성되어 있는지, RLS 정책이 설정되어 있는지 확인하세요.';
      alert(msg);
    }
    setNoteSaving(false);
  };
  const delNote = async (id) => {
    if(!confirm('이 메모를 삭제할까요?')) return;
    const merged = notes.filter(n=>n.id!==id);
    await dbSaveOwner('dlwns_market_notes', OWNER_ID, { notes: merged });
    setNotes(merged);
  };

  return (
    <div style={{padding:'32px 0'}}>

      {/* ─── 헤더 ─── */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap'}}>
        <h2 style={{fontSize:'1.3rem',fontWeight:800,color:'#1B5E20'}}>💼 내 포트폴리오</h2>
        <span style={{fontSize:'0.72rem',background:'#e8f5e9',color:'#2e7d32',padding:'3px 10px',borderRadius:20,fontWeight:600}}>
          총 {fmtKrwFull(totalKrw)}
        </span>
        {!editMode && (
          <button onClick={()=>authWrap(startEdit)}
            style={{marginLeft:'auto',fontSize:'0.78rem',padding:'5px 14px',background:'#fff',border:'1px solid #1B5E20',color:'#1B5E20',borderRadius:6,cursor:'pointer',fontWeight:600}}>
            ✏️ 편집
          </button>
        )}
      </div>
      <div style={{fontSize:'0.78rem',color:'var(--muted)',marginBottom:12}}>
        마지막 수정: {pf.updatedAt}
      </div>

      {/* ─── 편집 모드 ─── */}
      {editMode && draft && (
        <div style={{background:'#fffde7',border:'2px solid #fbc02d',borderRadius:10,padding:18,marginBottom:24}}>
          <div style={{fontWeight:700,fontSize:'0.88rem',marginBottom:10,color:'#5d4037'}}>📝 포트폴리오 편집</div>
          <div style={{marginBottom:12}}>
            <label style={{display:'block',fontSize:'0.74rem',fontWeight:600,marginBottom:4,color:'var(--sub)'}}>투자 철학</label>
            <textarea value={draft.thesis} onChange={e=>setDraft({...draft,thesis:e.target.value})} rows={2}
              style={{width:'100%',padding:8,borderRadius:6,border:'1px solid #ddd',fontSize:'0.82rem',fontFamily:'inherit',resize:'vertical'}}/>
          </div>
          <div style={{fontSize:'0.74rem',fontWeight:600,marginBottom:6,color:'var(--sub)'}}>
            종목 ({draft.items.length}개 · 합계 {fmtKrwFull(draft.items.reduce((s,i)=>s+i.krw,0))})
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
            {draft.items.map((it,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:isMobile?'34px 1fr 28px':'34px 90px 130px 1fr 28px',gap:6,alignItems:'flex-start',flexWrap:'wrap'}}>
                <input type="color" value={it.color} onChange={e=>updateItem(i,'color',e.target.value)}
                  style={{width:34,height:30,border:'1px solid #ddd',borderRadius:4,padding:1,cursor:'pointer'}}/>
                {isMobile ? (
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <input value={it.label} onChange={e=>updateItem(i,'label',e.target.value)} placeholder="종목"
                      style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                    <input type="number" value={it.krw} onChange={e=>updateItem(i,'krw',e.target.value)}
                      placeholder="투자금액(원)" min={0}
                      style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                    {it.krw>0&&<div style={{fontSize:'0.62rem',color:'#888'}}>{fmtKrw(it.krw)}</div>}
                    <input value={it.desc} onChange={e=>updateItem(i,'desc',e.target.value)} placeholder="투자 근거"
                      style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                  </div>
                ) : (
                  <>
                    <input value={it.label} onChange={e=>updateItem(i,'label',e.target.value)} placeholder="종목"
                      style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                    <div style={{position:'relative'}}>
                      <input type="number" value={it.krw} onChange={e=>updateItem(i,'krw',e.target.value)}
                        placeholder="투자금액(원)" min={0}
                        style={{width:'100%',padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                      {it.krw>0&&<div style={{fontSize:'0.62rem',color:'#888',marginTop:1}}>{fmtKrw(it.krw)}</div>}
                    </div>
                    <input value={it.desc} onChange={e=>updateItem(i,'desc',e.target.value)} placeholder="투자 근거"
                      style={{padding:'5px 7px',border:'1px solid #ddd',borderRadius:4,fontSize:'0.78rem'}}/>
                  </>
                )}
                <button onClick={()=>removeItem(i)}
                  style={{background:'transparent',border:'none',color:'#c62828',cursor:'pointer',fontSize:'1rem',lineHeight:1,paddingTop:6}}>×</button>
              </div>
            ))}
          </div>
          <button onClick={addItem}
            style={{fontSize:'0.78rem',padding:'5px 12px',background:'#fff',border:'1px dashed #999',borderRadius:6,cursor:'pointer',marginBottom:14}}>
            + 종목 추가
          </button>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={cancelEdit}
              style={{fontSize:'0.8rem',padding:'7px 16px',background:'#fff',border:'1px solid #ccc',borderRadius:6,cursor:'pointer'}}>
              취소
            </button>
            <button onClick={saveEdit} disabled={saving}
              style={{fontSize:'0.8rem',padding:'7px 16px',background:'#1B5E20',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600,opacity:saving?0.6:1}}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* ─── 투자 철학 ─── */}
      {!editMode && (
        <p style={{fontSize:'0.83rem',color:'var(--sub)',lineHeight:1.7,marginBottom:24,padding:'10px 14px',background:'#f9fbe7',borderRadius:8,borderLeft:'3px solid #827717'}}>
          {pf.thesis}
        </p>
      )}

      {/* ─── 차트 + 종목 리스트 ─── */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?20:28,alignItems:'start'}}>
        {/* 도넛 차트 */}
        <div>
          <div style={{position:'relative',width:'100%',height:280}}>
            <canvas ref={canvasRef} role="img" aria-label="포트폴리오 도넛 차트"/>
            <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',pointerEvents:'none',minWidth:90}}>
              {hItem ? (
                <>
                  <div style={{fontSize:'1.3rem',fontWeight:800,color:hItem.color}}>{hPct}%</div>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text)'}}>{hItem.label}</div>
                  <div style={{fontSize:'0.68rem',color:'var(--muted)',marginTop:2}}>{fmtKrw(hItem.krw)}</div>
                </>
              ) : (
                <>
                  <div style={{fontSize:'1.1rem',fontWeight:800,color:'#1B5E20'}}>{fmtKrw(totalKrw)}</div>
                  <div style={{fontSize:'0.7rem',color:'var(--muted)',marginTop:2}}>총 투자금</div>
                </>
              )}
            </div>
          </div>
          {/* 총합 요약 */}
          <div style={{marginTop:8,padding:'10px 14px',background:'#f1f8e9',borderRadius:8,fontSize:'0.8rem',color:'#2e7d32',fontWeight:600,textAlign:'center'}}>
            총 투자금 {fmtKrwFull(totalKrw)}
          </div>
        </div>

        {/* 종목 리스트 */}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {pf.items.map((item,i)=>{
            const pct = totalKrw>0 ? +(item.krw/totalKrw*100).toFixed(1) : 0;
            const isHov = hovered===i;
            return (
              <div key={i}
                onMouseEnter={()=>{ setHovered(i); if(chartRef.current){chartRef.current.data.datasets[0].hoverOffset=12;chartRef.current.update();} }}
                onMouseLeave={()=>{ setHovered(null); if(chartRef.current) chartRef.current.update(); }}
                style={{padding:'8px 12px',borderRadius:8,cursor:'default',background:isHov?'#f1f8e9':'#fafafa',border:`1px solid ${isHov?'#a5d6a7':'transparent'}`,transition:'all 0.15s'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:item.color,flexShrink:0}}/>
                  <span style={{fontWeight:700,fontSize:'0.84rem',color:item.color,flex:1}}>{item.label}</span>
                  <span style={{fontWeight:700,fontSize:'0.82rem',color:'var(--text)'}}>{pct}%</span>
                </div>
                {/* 금액 + 비율 바 */}
                <div style={{marginTop:5,marginLeft:18}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:'var(--muted)',marginBottom:4}}>
                    <span>{fmtKrwFull(item.krw)}</span>
                  </div>
                  <div style={{height:4,background:'#e0e0e0',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:item.color,borderRadius:2,transition:'width 0.3s'}}/>
                  </div>
                </div>
                {isHov && item.desc && (
                  <div style={{fontSize:'0.71rem',color:'var(--muted)',marginTop:5,marginLeft:18,lineHeight:1.5}}>{item.desc}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── 일일 시장 메모 ─── */}
      <div style={{marginTop:36,paddingTop:28,borderTop:'1px solid var(--border)'}}>
        <h3 style={{fontSize:'1rem',fontWeight:700,marginBottom:4,color:'#1B5E20'}}>📝 일일 시장 메모</h3>
        <p style={{fontSize:'0.75rem',color:'var(--muted)',marginBottom:14,lineHeight:1.6}}>
          매일의 시장 관찰·결정·복기를 기록합니다. 투자 일지는 장기 수익률을 만듭니다.
        </p>

        {/* 입력 영역 */}
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20,padding:'14px',background:'#f9fbe7',borderRadius:8,border:'1px solid #e6ee9c'}}>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <input type="date" value={noteDate} onChange={e=>setNoteDate(e.target.value)}
              style={{padding:'6px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.82rem'}}/>
            <span style={{fontSize:'0.75rem',color:'var(--muted)'}}>날짜 선택 후 내용 입력</span>
          </div>
          <textarea
            value={noteText}
            onChange={e=>setNoteText(e.target.value)}
            placeholder="오늘 시장에서 무엇을 봤고, 어떤 결정을 했고, 무엇을 배웠는지 자유롭게 기록하세요..."
            rows={4}
            style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:6,fontSize:'0.85rem',fontFamily:'inherit',resize:'vertical',boxSizing:'border-box'}}
          />
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={()=>authWrap(saveNote)} disabled={noteSaving||!noteText.trim()}
              style={{padding:'7px 20px',background:noteText.trim()?'#1B5E20':'#bbb',color:'#fff',border:'none',borderRadius:6,cursor:noteText.trim()?'pointer':'not-allowed',fontWeight:600,fontSize:'0.85rem'}}>
              {noteSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>

        {/* 메모 목록 */}
        {!noteLoaded ? (
          <div style={{fontSize:'0.8rem',color:'var(--muted)',padding:'16px',textAlign:'center'}}>불러오는 중…</div>
        ) : notes.length === 0 ? (
          <div style={{fontSize:'0.8rem',color:'var(--muted)',padding:'20px',background:'#fafafa',borderRadius:8,textAlign:'center'}}>
            아직 메모가 없습니다. 오늘의 첫 메모를 남겨보세요.
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {notes.map(n=>(
              <div key={n.id} style={{padding:'12px 14px',background:'#fff',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:'0.74rem',fontWeight:700,color:'#827717',background:'#fff9c4',padding:'2px 8px',borderRadius:10}}>{n.date}</span>
                  <button onClick={()=>delNote(n.id)}
                    style={{background:'transparent',border:'none',color:'#bbb',cursor:'pointer',fontSize:'0.9rem',lineHeight:1}}>×</button>
                </div>
                <div style={{fontSize:'0.85rem',color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{marginTop:24,fontSize:'0.68rem',color:'#bbb',borderTop:'1px solid var(--border)',paddingTop:10}}>
        ⚠️ 투자 참고용 포트폴리오입니다. 실제 투자 결정은 본인의 판단으로 하세요.
      </div>
    </div>
  );
}

// ─── 모바일 감지 훅 ────────────────────────────────────────────────────────────
function useIsMobile() {
  const [m, setM] = useState(()=>typeof window!=='undefined'&&window.innerWidth<=768);
  useEffect(()=>{
    const fn = ()=>setM(window.innerWidth<=768);
    window.addEventListener('resize', fn);
    return ()=>window.removeEventListener('resize', fn);
  }, []);
  return m;
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
*,*::before,*::after{box-sizing:border-box;}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}
img,video{max-width:100%;height:auto;}
/* iOS Safari에서 input 포커스 시 자동 확대 방지 */
input,textarea,select{font-size:16px;}
/* 탭 클릭 딜레이 제거 */
a,button,[role=button]{touch-action:manipulation;}
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
.detail-body h1{font-size:1.8rem;font-weight:700;line-height:1.3;margin:20px 0 10px;}
.detail-body h2{font-size:1.45rem;font-weight:700;line-height:1.35;margin:16px 0 8px;}
.detail-body h3{font-size:1.15rem;font-weight:700;margin:12px 0 6px;}
.detail-body p{margin:0;min-height:1.6em;}
.detail-body strong,.detail-body b{font-weight:700;}
.detail-body em,.detail-body i{font-style:italic;}
.detail-body u{text-decoration:underline;}
.detail-body s{text-decoration:line-through;}
.detail-body mark{padding:1px 3px;border-radius:2px;}
.detail-body ul{list-style:disc;padding-left:24px;margin:6px 0;}
.detail-body ol{list-style:decimal;padding-left:24px;margin:6px 0;}
.detail-body li{margin:2px 0;}
/* ── 전체화면 글쓰기 에디터 ── */
.editor-overlay{position:fixed;inset:0;background:#fff;z-index:400;display:flex;flex-direction:column;overflow:hidden;}
.editor-topbar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;}
.editor-topbar-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0;flex-wrap:wrap;}
.editor-topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.editor-back-btn{background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:4px;line-height:1;}
.editor-back-btn:hover{background:#f0f0f0;color:#111;}
.editor-scroll{flex:1;overflow-y:auto;}
.editor-inner{max-width:720px;margin:0 auto;padding:28px 28px 120px;}
.editor-title-input{display:block;width:100%;border:none;outline:none;font-size:1.85rem;font-weight:700;line-height:1.3;font-family:'Noto Sans KR',sans-serif;color:#111;padding:0;margin-bottom:8px;resize:none;background:transparent;overflow:hidden;}
.editor-title-input::placeholder{color:#ccc;}
.editor-summary-input{display:block;width:100%;border:none;outline:none;font-size:1rem;line-height:1.6;color:var(--muted);font-family:'Noto Sans KR',sans-serif;padding:0;margin-bottom:18px;resize:none;background:transparent;}
.editor-summary-input::placeholder{color:#ccc;}
.editor-divider{border:none;border-top:1px solid var(--border);margin:18px 0;}
.editor-toolbar{display:flex;align-items:center;gap:2px;padding:6px 10px;background:#f8f9fa;border:1px solid var(--border);border-radius:8px;flex-wrap:wrap;gap:3px;margin-bottom:0px;position:sticky;top:0;z-index:5;}
.editor-btn{background:none;border:none;padding:5px 9px;cursor:pointer;font-size:0.85rem;border-radius:4px;color:#333;font-weight:500;line-height:1.2;transition:background 0.1s;white-space:nowrap;}
.editor-btn:hover{background:#e2e6ea;}
.editor-sep{width:1px;height:18px;background:#dee2e6;margin:0 2px;flex-shrink:0;}
.editor-content{min-height:420px;outline:none;font-size:0.98rem;line-height:2;color:#222;font-family:'Noto Sans KR',sans-serif;padding:16px 0 0;}
.editor-content:empty:before{content:attr(data-placeholder);color:#bbb;pointer-events:none;display:block;}
.editor-content h1{font-size:1.8rem;font-weight:700;line-height:1.3;margin:16px 0 8px;}
.editor-content h2{font-size:1.45rem;font-weight:700;line-height:1.35;margin:12px 0 6px;}
.editor-content h3{font-size:1.15rem;font-weight:700;margin:10px 0 4px;}
.editor-content p{margin:0;min-height:1.6em;}
.editor-content mark{padding:1px 3px;border-radius:2px;}
.editor-content ul{list-style:disc;padding-left:24px;margin:4px 0;}
.editor-content ol{list-style:decimal;padding-left:24px;margin:4px 0;}
.editor-content li{margin:2px 0;}
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

/* ══════════════════════════════════════════════════════════
   📱 MOBILE RESPONSIVE  (max-width: 768px)
══════════════════════════════════════════════════════════ */
@media (max-width:768px){
  /* ── 헤더 ── */
  .header-inner{padding:0 14px;height:auto;flex-wrap:wrap;gap:0;min-height:52px;}
  .header-logo{font-size:1rem;padding:14px 0;}
  .nav{order:3;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-top:1px solid var(--border);padding:2px 0;}
  .nav::-webkit-scrollbar{display:none;}
  .nav-item{padding:10px 10px;font-size:0.78rem;white-space:nowrap;}
  .header-actions{gap:5px;padding:10px 0;}
  .btn.btn-primary{padding:6px 12px;font-size:0.8rem;}

  /* ── 히어로 ── */
  .hero{padding:36px 0 44px;min-height:auto;}
  .hero-inner{grid-template-columns:1fr;gap:28px;padding:0 16px;text-align:center;}
  .hero-title{font-size:1.8rem;}
  .hero-sub{font-size:0.85rem;}
  .hero-actions{justify-content:center;flex-wrap:wrap;}
  .hero-card{display:none;}

  /* ── 통계 바 ── */
  .stats-inner{grid-template-columns:repeat(3,1fr);padding:0 14px;}
  .stat-num{font-size:1.3rem;}
  .stat-label{font-size:0.68rem;}

  /* ── 메인 컨텐츠 ── */
  .content-inner{grid-template-columns:1fr;padding:0 14px;gap:24px;}
  .sidebar{display:none;}
  .section-head{padding:0 14px;}

  /* ── 피쳐드 카드 ── */
  .featured{grid-template-columns:1fr;}
  .f-img{height:200px;}

  /* ── 포스트 그리드 ── */
  .posts-grid{grid-template-columns:1fr;}
  .posts-grid-3{grid-template-columns:1fr 1fr;}

  /* ── 카테고리 히어로 ── */
  .cat-hero-inner{padding:0 14px;}
  .cat-hero-stats{flex-wrap:wrap;gap:8px;}
  .cat-stat{flex:1;min-width:80px;padding:9px 12px;}
  .cat-stat-num{font-size:1.3rem;}
  .subcat-tabs{padding:0 14px;}

  /* ── 달력 ── */
  .calendar-inner{padding:0 14px;}
  .cal-header{padding:12px 0 8px;}
  .cal-cell{min-height:46px;padding:2px 3px;font-size:0.68rem;}
  .cal-ev{font-size:0.58rem;padding:1px 3px;}

  /* ── 글 상세 ── */
  .detail-page{padding:28px 16px 48px;}
  .detail-title{font-size:1.45rem;}
  .detail-meta{font-size:0.72rem;flex-wrap:wrap;gap:6px;}
  .detail-body{font-size:0.93rem;line-height:1.9;}
  .detail-body h1{font-size:1.5rem;}
  .detail-body h2{font-size:1.2rem;}
  .detail-body h3{font-size:1.05rem;}

  /* ── 전체화면 글쓰기 에디터 ── */
  .editor-inner{padding:18px 14px 100px;}
  .editor-title-input{font-size:1.45rem;}
  .editor-topbar{padding:6px 10px;gap:5px;}
  .editor-back-btn{font-size:0.85rem;padding:4px 6px;}
  .editor-toolbar{overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:5px 8px;gap:2px;}
  .editor-toolbar::-webkit-scrollbar{display:none;}
  .editor-btn{padding:5px 7px;font-size:0.8rem;}
  .editor-content{font-size:0.93rem;}

  /* ── 음악 플레이어 바 ── */
  .music-player-bar{padding:8px 12px;gap:10px;}
  .music-player-info .music-title{font-size:0.8rem;}
  .music-player-btns{gap:6px;}
  .music-player-btn{width:30px;height:30px;font-size:0.7rem;}
  .music-player-btn.main{width:36px;height:36px;}

  /* ── 음악 리스트 ── */
  .music-item{padding:10px 12px;gap:10px;}
  .music-thumb{width:44px;height:44px;}
  .music-thumb-placeholder{width:44px;height:44px;}
  .music-title{font-size:0.85rem;}

  /* ── 야구 그리드 ── */
  .baseball-grid{grid-template-columns:1fr;}

  /* ── 모달 ── */
  .modal{max-height:95vh;border-radius:12px 12px 0 0;}
  .modal-body{padding:14px 18px;}
  .modal-foot{padding:12px 18px;}

  /* ── confirm 모달 ── */
  .confirm-modal{padding:24px 20px;}
  .confirm-modal-desc{font-size:0.85rem;}

  /* ── 달력 모달 ── */
  .cal-modal{width:calc(100vw - 32px)!important;max-width:100%!important;}

  /* ── 기타 ── */
  body.has-player{padding-bottom:64px;}
  .video-embed{margin-bottom:16px;}
  .pc-actions,.f-actions{opacity:1!important;}
}

@media (max-width:480px){
  .posts-grid-3{grid-template-columns:1fr;}
  .stats-inner{grid-template-columns:repeat(2,1fr);}
  .hero-title{font-size:1.55rem;}
  .cat-hero-stats .cat-stat:last-child{flex-basis:100%;}
}`;

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
  // Comments state
  const [comments,setComments] = useState({}); // postId -> [{id,nick,body,date}]
  const [commentNick,setCommentNick] = useState('');
  const [commentBody,setCommentBody] = useState('');
  // Music drag-n-drop
  const [dragIdx,setDragIdx] = useState(null);
  // DB 진단 모달
  const [dbDiag,setDbDiag] = useState(null); // null | {rows, raw}

  // ── 작성자 인증 (sessionStorage: 새로고침 유지, 탭 닫으면 초기화) ───────────
  const [isAuthed,   setIsAuthed]   = useState(()=>sessionStorage.getItem('dlwns_auth')==='1');
  const [pinModal,   setPinModal]   = useState(false);
  const [pinInput,   setPinInput]   = useState('');
  const [pinError,   setPinError]   = useState('');
  const [pendingAct, setPendingAct] = useState(null);

  const requireAuth = (action) => {
    if(isAuthed){ action(); return; }
    setPendingAct(()=>action);
    setPinInput(''); setPinError('');
    setPinModal(true);
  };
  const submitPin = () => {
    if(pinInput === OWNER_PIN){
      sessionStorage.setItem('dlwns_auth','1');
      setIsAuthed(true);
      setPinModal(false);
      setPinInput(''); setPinError('');
      if(pendingAct){ pendingAct(); setPendingAct(null); }
    } else {
      setPinError('인증번호가 올바르지 않습니다.');
      setPinInput('');
    }
  };
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
    // images 배열이 있으면 img(카드뷰 썸네일)를 첫 번째 이미지로 동기화
    const syncedImg = (form.images && form.images.length > 0)
      ? form.images[0]
      : form.img;
    const syncedForm = { ...form, img: syncedImg };
    const newPost = editing
      ? {...posts.find(p=>p.id===editing.id), ...syncedForm}
      : {id:Date.now(),...syncedForm,date:today};
    const u = editing
      ? posts.map(p=>p.id===editing.id?newPost:p)
      : [newPost,...posts];
    setPosts(u); postsRef.current=u;
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

  const requestEdit   = (p)        => requireAuth(()=>setConfirmAction({type:'edit',   data:p}));
  const requestDelete = (id,title) => requireAuth(()=>setConfirmAction({type:'delete', data:{id,title}}));
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
    const newImgs = await Promise.all(files.map(f=>toB64(f)));
    setForm(prev=>{
      const merged = [...(prev.images||[]), ...newImgs];
      // img(대표) = 첫 번째 이미지로 동기화 (카드뷰 호환)
      return {...prev, images: merged, img: merged[0] || prev.img};
    });
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
  const catInfo = CAT[activeCat] || { label: activeCat, color: '#666', desc: '' };
  const subcats = !isAll ? SUBCATS[activeCat]||[] : [];
  const catFiltered = isAll ? posts : posts.filter(p=>p.cat===activeCat);
  const filtered = activeSub==="all" ? catFiltered : catFiltered.filter(p=>p.subcat===activeSub);
  const pinned = isAll ? (filtered.find(p=>p.pinned)||filtered[0]) : null;
  const rest = pinned ? filtered.filter(p=>p!==pinned) : filtered;
  const recent = [...posts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  const stocks = [];

  // ── 설정 드롭다운 ─────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();

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
                    onClick={()=>{ setSettingsOpen(false); requireAuth(()=>{ setPrForm({...profile}); setModal('profile'); }); }}>
                    <span>👤</span> 프로필 편집
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-primary" onClick={()=>requireAuth(()=>{setEditing(null);setForm({title:"",summary:"",cat:isAll?"insight":activeCat==='invest'?"insight":activeCat,subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');})}>+ 글쓰기</button>
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
          {/* 이미지 표시: images 배열 우선, 없으면 img 단일 fallback */}
          {(()=>{
            const imgs = (detail.images && detail.images.length > 0)
              ? detail.images
              : (detail.img ? [detail.img] : []);
            if(imgs.length === 0) return null;
            if(imgs.length === 1) return <img className="detail-img" src={imgs[0]} alt=""/>;
            return (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8,marginBottom:24}}>
                {imgs.map((src,i)=>(
                  <img key={i} src={src} alt="" style={{width:'100%',aspectRatio:'4/3',objectFit:'cover',borderRadius:8,display:'block'}}/>
                ))}
              </div>
            );
          })()}
          <div className="detail-body">
            {/<[a-z][\s\S]*>/i.test(detail.body||'')
              ? <div dangerouslySetInnerHTML={{__html: detail.body}}/>
              : (detail.body||detail.summary).split('\n').map((line,i)=>(
                  line.trim()==='' ? <br key={i}/> : <p key={i} style={{margin:0,minHeight:'1.4em'}}>{line}</p>
                ))
            }
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
                <button className="btn btn-lg btn-white" onClick={()=>requireAuth(()=>{setEditing(null);setForm({title:"",summary:"",cat:"insight",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');})}>{'+ 새 글 작성'}</button>
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
                        onClick={()=>{ if(c.cur){ requireAuth(()=>{ setCalModalDate(c.key); setCalNewText(""); setCalNewColor("#0052CC"); }); } }}
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
            activeCat==='invest' ? (
              /* ── INVEST PORTFOLIO VIEW ── */
              <div style={{gridColumn:'1/-1'}}>
                <InvestPortfolio requireAuth={requireAuth} />
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
                    <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>requireAuth(()=>{setEditing(null);setForm({title:"",summary:"",cat:"music",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');})}>+ 음악 추가</button>
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
                    <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>requireAuth(()=>{setEditing(null);setForm({title:"",summary:"",cat:"baseball",subcat:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');})}>+ 야구 기록 추가</button>
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
                <button className="btn btn-primary" style={{padding:'12px 28px',fontSize:'0.88rem'}} onClick={()=>requireAuth(()=>{setEditing(null);setForm({title:"",summary:"",cat:activeCat,subcat:activeSub!=="all"?activeSub:"all",body:"",img:"",images:[],pinned:false,videoUrl:""});setModal('write');})}>+ 첫 글 작성하기</button>
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
    {/* ── WRITE MODAL: 음악 전용 (소형 모달 유지) ── */}
    {modal==='write' && form.cat==='music' && (
      <div className="modal-bg" onClick={()=>setModal(null)}>
        <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:'1.2rem'}}>🎵</span>
                {editing?'음악 수정':'음악 추가'}
              </div>
              <button className="modal-x" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
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
        </div>
      </div>
    )}

    {/* ── 전체화면 글쓰기 에디터 (음악 제외) ── */}
    {modal==='write' && form.cat!=='music' && (
      <div className="editor-overlay">
        {/* 상단 바 */}
        <div className="editor-topbar">
          <div className="editor-topbar-left">
            <button className="editor-back-btn" onClick={()=>setModal(null)} title="닫기">✕ 닫기</button>
            <div className="editor-sep" style={{height:20}}/>
            <select value={form.cat} style={{border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px',fontSize:'0.8rem',cursor:'pointer',background:'#fff',maxWidth:isMobile?90:200}}
              onChange={e=>setForm({...form,cat:e.target.value,subcat:"all"})}>
              {CATS.slice(1).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {!isMobile && (
              <select value={form.subcat} style={{border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px',fontSize:'0.8rem',cursor:'pointer',background:'#fff'}}
                onChange={e=>setForm({...form,subcat:e.target.value})}>
                {(SUBCATS[form.cat]||[]).map(s=><option key={s.id||s} value={s.id||s}>{s.label||s}</option>)}
              </select>
            )}
          </div>
          <div className="editor-topbar-right">
            <label style={{display:'flex',alignItems:'center',gap:5,fontSize:'0.8rem',cursor:'pointer',color:'var(--muted)'}}>
              <input type="checkbox" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})} style={{width:'auto',margin:0}}/>
              고정
            </label>
            <button className="btn btn-outline" style={{padding:'6px 14px',fontSize:'0.82rem'}} onClick={()=>setModal(null)}>취소</button>
            <button className="btn btn-primary" style={{padding:'6px 16px',fontSize:'0.82rem',opacity:form.title?1:0.4}}
              onClick={savePost} disabled={!form.title}>
              {editing ? '수정 저장' : '게시하기'}
            </button>
          </div>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="editor-scroll">
          <div className="editor-inner">
            {/* 카테고리 뱃지 (미리보기) */}
            <div style={{marginBottom:12}}>
              <span style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.08em',color:CATS.find(c=>c.id===form.cat)?.color||'#666',textTransform:'uppercase'}}>
                {CATS.find(c=>c.id===form.cat)?.label||form.cat}
                {form.subcat && form.subcat!=='all' && form.subcat!=='전체' ? ` · ${form.subcat}` : ''}
              </span>
            </div>

            {/* 제목 */}
            <textarea className="editor-title-input" rows={1} placeholder="제목을 입력하세요"
              value={form.title}
              onChange={e=>{ setForm({...form,title:e.target.value}); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
              onFocus={e=>{ e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
            />

            {/* 요약 */}
            <textarea className="editor-summary-input" rows={1} placeholder="한 줄 요약 (선택)"
              value={form.summary}
              onChange={e=>{ setForm({...form,summary:e.target.value}); e.target.style.height='auto'; e.target.style.height=e.target.scrollHeight+'px'; }}
            />

            {/* 유튜브 링크 */}
            <div style={{marginBottom:14}}>
              <input type="text" value={form.videoUrl} placeholder="🎬 유튜브 링크 (선택) — 본문 위에 영상이 표시됩니다"
                style={{width:'100%',border:'none',borderBottom:'1px dashed var(--border)',outline:'none',padding:'6px 0',fontSize:'0.85rem',color:'var(--sub)',background:'transparent',fontFamily:'inherit'}}
                onChange={e=>setForm({...form,videoUrl:e.target.value})}/>
            </div>

            {/* 사진 업로드 */}
            <div style={{marginBottom:14}}>
              <button className="btn btn-outline" style={{fontSize:'0.78rem',padding:'5px 12px'}}
                onClick={()=>imgRef.current.click()}>
                📷 사진 추가
              </button>
              {(form.images||[]).length>0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:6,marginTop:8}}>
                  {(form.images||[]).map((src,i)=>(
                    <div key={i} style={{position:'relative'}}>
                      <img src={src} alt="" style={{width:'100%',height:90,objectFit:'cover',borderRadius:6,display:'block'}}/>
                      <button onClick={()=>setForm(prev=>{
                          const nextImgs = prev.images.filter((_,j)=>j!==i);
                          return {...prev, images:nextImgs, img:nextImgs[0]||''};
                        })}
                        style={{position:'absolute',top:3,right:3,background:'rgba(0,0,0,0.6)',color:'#fff',border:'none',borderRadius:'50%',width:20,height:20,fontSize:'0.7rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {(form.images||[]).length===0 && form.img && (
                <img src={form.img} alt="" style={{width:'100%',maxHeight:200,objectFit:'cover',marginTop:8,borderRadius:8}}/>
              )}
              <input ref={imgRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={handleImg}/>
            </div>

            <hr className="editor-divider"/>

            {/* 리치 텍스트 에디터 */}
            <RichEditor
              value={form.body}
              onChange={v=>setForm(prev=>({...prev,body:v}))}
              placeholder="내용을 작성하세요..."
            />
          </div>
        </div>
      </div>
    )}

    {/* ── PIN 인증 모달 ── */}
    {pinModal&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
           onClick={()=>{setPinModal(false);setPendingAct(null);}}>
        <div onClick={e=>e.stopPropagation()}
             style={{background:'#fff',borderRadius:14,padding:32,width:'100%',maxWidth:340,boxShadow:'0 8px 32px rgba(0,0,0,0.18)'}}>
          <div style={{textAlign:'center',marginBottom:20}}>
            <div style={{fontSize:'2rem',marginBottom:8}}>🔒</div>
            <div style={{fontSize:'1.05rem',fontWeight:700,color:'#111'}}>작성자 인증</div>
            <div style={{fontSize:'0.8rem',color:'var(--muted)',marginTop:4}}>인증번호를 입력하면 이 세션에서는<br/>다시 묻지 않습니다.</div>
          </div>
          <input
            type="password"
            value={pinInput}
            onChange={e=>{setPinInput(e.target.value);setPinError('');}}
            onKeyDown={e=>e.key==='Enter'&&submitPin()}
            placeholder="인증번호 입력"
            autoFocus
            style={{display:'block',width:'100%',padding:'12px 14px',border:`2px solid ${pinError?'#e53935':'#ddd'}`,borderRadius:8,fontSize:'1.1rem',outline:'none',textAlign:'center',letterSpacing:'0.2em',marginBottom:10,boxSizing:'border-box',fontFamily:'monospace'}}
          />
          {pinError&&(
            <div style={{fontSize:'0.8rem',color:'#e53935',textAlign:'center',marginBottom:10}}>{pinError}</div>
          )}
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setPinModal(false);setPendingAct(null);setPinInput('');setPinError('');}}
              style={{flex:1,padding:'10px',background:'#fff',border:'1px solid #ddd',borderRadius:8,cursor:'pointer',fontSize:'0.9rem',color:'var(--muted)'}}>
              취소
            </button>
            <button onClick={submitPin} disabled={!pinInput}
              style={{flex:2,padding:'10px',background:pinInput?'var(--primary)':'#bbb',color:'#fff',border:'none',borderRadius:8,cursor:pinInput?'pointer':'not-allowed',fontSize:'0.9rem',fontWeight:700}}>
              확인
            </button>
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

