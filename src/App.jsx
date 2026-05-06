import { useState, useEffect, useRef } from "react";

// ─── storage helpers ──────────────────────────────────────────────────────────
const K = { diary:"dlwns-diary2", photos:"dlwns-photos2", career:"dlwns-career2", profile:"dlwns-profile2" };

// storage functions using localStorage
async function load(key) {
  try { const val = localStorage.getItem(key); return val ? JSON.parse(val) : null; }
  catch { return null; }
}
async function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const toBase64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(f);
});

const DEF_PROFILE = { name: "dlwns", tagline: "기록하는 사람", bio: "일상, 생각, 그리고 순간들.", heroImg: "" };
const DEF_DIARY   = [{ id:1, date:"2026-05-04", title:"첫 번째 기록", content:"오늘부터 이 공간에 나의 이야기를 담기 시작했다.", mood:"✦" }];
const DEF_CAREER  = [
  { id:1, year:"2024", title:"현재 포지션", org:"회사명", desc:"지금 하고 있는 일을 여기에 적어보세요." },
  { id:2, year:"2022", title:"이전 포지션", org:"이전 회사", desc:"이전에 했던 일을 정리해보세요." },
];
const MOODS = ["✦","◆","●","▲","★","◎","♦","✿","⊕","◉"];
const PAGES = [
  { id:"home",   label:"Home",   glyph:"○" },
  { id:"일기",    label:"일기",   glyph:"◇" },
  { id:"사진",    label:"사진",   glyph:"□" },
  { id:"커리어",  label:"커리어",  glyph:"△" },
  { id:"기타",    label:"기타",   glyph:"◁" },
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300;1,600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root { --black:#0a0a0a; --white:#f5f5f3; --gray:#666; --light:#ccc; --sidebar:220px; }
body { font-family:'Archivo',sans-serif; background:var(--black); color:var(--white); min-height:100vh; }

.layout { display:flex; min-height:100vh; }

/* SIDEBAR */
.sidebar {
  position:fixed; left:0; top:0; bottom:0;
  width:var(--sidebar);
  background:var(--black);
  border-right:1px solid #181818;
  display:flex; flex-direction:column;
  z-index:50;
}
.sb-logo { padding:40px 28px 36px; border-bottom:1px solid #181818; }
.sb-url { font-size:0.58rem; letter-spacing:0.2em; text-transform:uppercase; color:#333; margin-bottom:10px; }
.sb-name { font-family:'Cormorant Garamond',serif; font-size:2rem; font-weight:600; line-height:1; color:var(--white); }
.sb-name em { font-style:italic; font-weight:300; color:var(--gray); }

.sb-nav { flex:1; padding:36px 0; display:flex; flex-direction:column; gap:1px; }

.nav-btn {
  display:flex; align-items:center; gap:14px;
  padding:13px 28px;
  cursor:pointer; transition:all 0.18s;
  position:relative; border:none; background:none;
  width:100%; text-align:left;
}
.nav-btn::after {
  content:''; position:absolute;
  left:0; top:0; bottom:0; width:2px;
  background:var(--white); transform:scaleY(0);
  transition:transform 0.2s;
}
.nav-btn:hover::after, .nav-btn.act::after { transform:scaleY(1); }
.nav-btn.act { background:#0f0f0f; }
.nav-btn:hover { background:#0d0d0d; }

.nav-g { font-size:0.65rem; color:#333; width:12px; text-align:center; transition:color 0.18s; }
.nav-btn.act .nav-g, .nav-btn:hover .nav-g { color:var(--white); }
.nav-l { font-size:0.75rem; letter-spacing:0.14em; text-transform:uppercase; font-weight:400; color:#555; transition:color 0.18s; }
.nav-btn.act .nav-l, .nav-btn:hover .nav-l { color:var(--white); }
.nav-n { margin-left:auto; font-size:0.62rem; color:#2a2a2a; font-family:'Cormorant Garamond',serif; }

.sb-foot { padding:24px 28px; border-top:1px solid #181818; }
.sb-copy { font-size:0.56rem; letter-spacing:0.1em; color:#222; text-transform:uppercase; }

/* MAIN */
.main { margin-left:var(--sidebar); flex:1; min-height:100vh; }

/* HERO */
.hero { display:grid; grid-template-rows:1fr auto; min-height:100vh; }
.hero-top { display:grid; grid-template-columns:1fr 1fr; min-height:calc(100vh - 110px); }
.hero-txt {
  display:flex; flex-direction:column; justify-content:flex-end;
  padding:72px 56px; border-right:1px solid #181818;
}
.h-eye { font-size:0.6rem; letter-spacing:0.22em; text-transform:uppercase; color:#333; margin-bottom:28px; }
.h-title {
  font-family:'Cormorant Garamond',serif;
  font-size:clamp(3rem,5vw,6rem);
  font-weight:300; line-height:1.0; letter-spacing:-1px;
  margin-bottom:36px;
}
.h-title em { font-style:italic; font-weight:300; color:var(--gray); display:block; }
.h-bio { font-size:0.86rem; color:#555; line-height:1.9; max-width:300px; margin-bottom:44px; font-weight:300; letter-spacing:0.02em; }
.h-acts { display:flex; gap:10px; }

.btn-p {
  background:var(--white); color:var(--black); border:none;
  padding:11px 26px; font-family:'Archivo',sans-serif;
  font-size:0.7rem; letter-spacing:0.14em; text-transform:uppercase;
  font-weight:500; cursor:pointer; transition:background 0.18s;
}
.btn-p:hover { background:var(--light); }

.btn-g {
  background:transparent; color:#555; border:1px solid #1e1e1e;
  padding:11px 22px; font-family:'Archivo',sans-serif;
  font-size:0.7rem; letter-spacing:0.14em; text-transform:uppercase;
  font-weight:400; cursor:pointer; transition:all 0.18s;
}
.btn-g:hover { border-color:#444; color:var(--white); }
.btn-sm { padding:8px 16px !important; font-size:0.66rem !important; }

.btn-d {
  background:transparent; color:#444; border:1px solid #1c1c1c;
  padding:7px 13px; font-size:0.66rem; letter-spacing:0.08em;
  text-transform:uppercase; cursor:pointer; font-family:'Archivo',sans-serif;
  transition:all 0.18s;
}
.btn-d:hover { color:#ff4444; border-color:#ff4444; }

.hero-img { position:relative; overflow:hidden; background:#0d0d0d; }
.hero-img img { width:100%; height:100%; object-fit:cover; display:block; filter:grayscale(15%); }
.hero-img-tag {
  position:absolute; bottom:28px; right:28px;
  font-family:'Cormorant Garamond',serif; font-style:italic;
  font-size:0.82rem; color:rgba(245,245,243,0.3); letter-spacing:0.04em;
}
.hero-up {
  width:100%; height:100%; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:14px;
  cursor:pointer; transition:background 0.18s;
}
.hero-up:hover { background:#111; }
.up-g { font-size:1.8rem; color:#1e1e1e; }
.up-l { font-size:0.65rem; letter-spacing:0.18em; text-transform:uppercase; color:#2a2a2a; }

.hero-bot { display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid #181818; }
.h-stat { padding:26px 36px; border-right:1px solid #181818; }
.h-stat:last-child { border-right:none; }
.h-stat-n { font-family:'Cormorant Garamond',serif; font-size:1.9rem; font-weight:600; letter-spacing:-1px; }
.h-stat-l { font-size:0.6rem; letter-spacing:0.16em; text-transform:uppercase; color:var(--gray); margin-top:3px; }

/* PAGE */
.pg-head {
  padding:56px 56px 40px;
  border-bottom:1px solid #181818;
  display:flex; align-items:flex-end; justify-content:space-between;
}
.pg-title { font-family:'Cormorant Garamond',serif; font-size:2.8rem; font-weight:300; letter-spacing:-0.3px; }
.pg-title em {
  font-style:normal; font-size:0.6rem; letter-spacing:0.2em;
  text-transform:uppercase; color:#333; display:block; margin-bottom:8px;
  font-family:'Archivo',sans-serif;
}
.pg-body { padding:40px 56px; }

/* DIARY */
.d-list { display:flex; flex-direction:column; }
.d-row {
  display:grid; grid-template-columns:88px 1fr auto;
  gap:36px; align-items:start;
  padding:32px 0; border-bottom:1px solid #111;
  transition:all 0.15s; position:relative;
}
.d-row:hover { background:#0d0d0d; margin:0 -24px; padding:32px 24px; }
.d-date { text-align:right; padding-top:2px; }
.d-day { font-family:'Cormorant Garamond',serif; font-size:2.5rem; font-weight:300; line-height:1; color:var(--white); }
.d-mon { font-size:0.58rem; letter-spacing:0.16em; text-transform:uppercase; color:#444; margin-top:3px; }
.d-sym { font-size:0.75rem; color:#2a2a2a; margin-top:10px; }
.d-t { font-family:'Cormorant Garamond',serif; font-size:1.35rem; font-weight:400; margin-bottom:8px; }
.d-c { font-size:0.83rem; color:#555; line-height:1.85; font-weight:300; max-width:540px; }
.d-acts { display:flex; flex-direction:column; gap:7px; opacity:0; transition:opacity 0.18s; }
.d-row:hover .d-acts { opacity:1; }

/* PHOTOS */
.ph-grid { columns:3; column-gap:10px; }
.ph-item { break-inside:avoid; margin-bottom:10px; overflow:hidden; position:relative; background:#0d0d0d; cursor:pointer; }
.ph-item img { width:100%; display:block; transition:transform 0.45s,filter 0.25s; filter:grayscale(10%); }
.ph-item:hover img { transform:scale(1.04); filter:grayscale(0%); }
.ph-ov {
  position:absolute; inset:0;
  background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 55%);
  opacity:0; transition:opacity 0.28s;
  display:flex; align-items:flex-end; padding:16px;
}
.ph-item:hover .ph-ov { opacity:1; }
.ph-cap { font-size:0.75rem; color:rgba(245,245,243,0.75); letter-spacing:0.05em; font-weight:300; }
.ph-del {
  position:absolute; top:8px; right:8px;
  background:rgba(0,0,0,0.65); color:#555; border:none;
  width:26px; height:26px; font-size:0.75rem; cursor:pointer;
  opacity:0; transition:opacity 0.18s; display:flex; align-items:center; justify-content:center;
}
.ph-item:hover .ph-del { opacity:1; }
.ph-del:hover { color:#ff4444; }
.ph-add {
  break-inside:avoid; margin-bottom:10px; height:180px;
  border:1px dashed #1c1c1c; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:10px;
  cursor:pointer; background:transparent; transition:border-color 0.18s;
  font-family:'Archivo',sans-serif; color:#2a2a2a; width:100%;
}
.ph-add:hover { border-color:#333; color:#444; }
.ph-add span { font-size:0.64rem; letter-spacing:0.14em; text-transform:uppercase; }

/* CAREER */
.c-list { display:flex; flex-direction:column; }
.c-row {
  display:grid; grid-template-columns:88px 1fr auto;
  gap:36px; align-items:start;
  padding:36px 0; border-bottom:1px solid #111;
  transition:all 0.15s;
}
.c-row:hover { background:#0d0d0d; margin:0 -24px; padding:36px 24px; }
.c-yr { font-family:'Cormorant Garamond',serif; font-size:0.95rem; font-weight:300; color:#444; text-align:right; padding-top:4px; }
.c-t { font-family:'Cormorant Garamond',serif; font-size:1.4rem; font-weight:400; margin-bottom:4px; }
.c-o { font-size:0.68rem; letter-spacing:0.14em; text-transform:uppercase; color:#444; margin-bottom:12px; }
.c-d { font-size:0.83rem; color:#555; line-height:1.8; font-weight:300; max-width:480px; }
.c-acts { display:flex; flex-direction:column; gap:7px; opacity:0; transition:opacity 0.18s; }
.c-row:hover .c-acts { opacity:1; }

/* ETC */
.etc-g { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:#181818; border:1px solid #181818; }
.etc-c { background:var(--black); padding:44px 36px; transition:background 0.18s; }
.etc-c:hover { background:#0d0d0d; }
.etc-ic { font-size:1.2rem; color:#222; margin-bottom:20px; }
.etc-t { font-family:'Cormorant Garamond',serif; font-size:1.35rem; font-weight:400; margin-bottom:8px; }
.etc-d { font-size:0.8rem; color:#555; line-height:1.78; font-weight:300; }
.etc-tag { margin-top:20px; font-size:0.58rem; letter-spacing:0.2em; text-transform:uppercase; color:#222; }

/* MODAL */
.mb { position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:200; display:flex; align-items:center; justify-content:center; padding:28px; backdrop-filter:blur(6px); }
.mo { background:#0c0c0c; border:1px solid #1e1e1e; width:100%; max-width:540px; max-height:90vh; overflow-y:auto; padding:44px; position:relative; }
.mo-t { font-family:'Cormorant Garamond',serif; font-size:1.9rem; font-weight:300; margin-bottom:32px; }
.mo-x { position:absolute; top:20px; right:20px; background:none; border:none; color:#444; font-size:1.1rem; cursor:pointer; line-height:1; padding:4px 8px; }
.mo-x:hover { color:var(--white); }

.fg { margin-bottom:20px; }
.fg label { display:block; font-size:0.6rem; letter-spacing:0.18em; text-transform:uppercase; color:#444; font-weight:400; margin-bottom:6px; }
.fg input, .fg textarea {
  width:100%; background:#111; border:1px solid #1e1e1e;
  padding:11px 14px; font-family:'Archivo',sans-serif;
  font-size:0.86rem; color:var(--white); outline:none;
  transition:border-color 0.18s; resize:vertical; font-weight:300;
}
.fg input:focus, .fg textarea:focus { border-color:#333; }
.fg input::placeholder, .fg textarea::placeholder { color:#2a2a2a; }

.mood-row { display:flex; gap:7px; flex-wrap:wrap; }
.m-btn {
  width:34px; height:34px; background:#111; border:1px solid #1e1e1e;
  color:#444; cursor:pointer; font-size:0.85rem;
  display:flex; align-items:center; justify-content:center; transition:all 0.14s;
}
.m-btn.sel { border-color:var(--white); color:var(--white); background:#1a1a1a; }
.m-btn:hover { border-color:#333; }

.f-acts { display:flex; gap:10px; margin-top:32px; }

/* LIGHTBOX */
.lb { position:fixed; inset:0; background:rgba(0,0,0,0.97); z-index:300; display:flex; align-items:center; justify-content:center; }
.lb img { max-width:90vw; max-height:90vh; object-fit:contain; }
.lb-x { position:absolute; top:24px; right:32px; color:#444; background:none; border:none; font-size:1.5rem; cursor:pointer; font-weight:300; }
.lb-x:hover { color:var(--white); }

::-webkit-scrollbar { width:3px; }
::-webkit-scrollbar-track { background:var(--black); }
::-webkit-scrollbar-thumb { background:#1e1e1e; }

@keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
.fu  { animation:fadeUp 0.45s ease both; }
.fu1 { animation:fadeUp 0.45s 0.08s ease both; }
.fu2 { animation:fadeUp 0.45s 0.16s ease both; }
.fu3 { animation:fadeUp 0.45s 0.24s ease both; }
.fu4 { animation:fadeUp 0.45s 0.32s ease both; }
`;

export default function DlwnsSite() {
  const [page, setPage]     = useState("home");
  const [profile, setProfile] = useState(DEF_PROFILE);
  const [diary, setDiary]   = useState([]);
  const [photos, setPhotos] = useState([]);
  const [career, setCareer] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal]   = useState(null);
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const [dF, setDF] = useState({ title:"", content:"", mood:"✦", date: new Date().toISOString().slice(0,10) });
  const [pF, setPF] = useState({ src:"", caption:"" });
  const [cF, setCF] = useState({ year:"", title:"", org:"", desc:"" });
  const [prF, setPrF] = useState({ ...DEF_PROFILE });

  const heroRef  = useRef();
  const photoRef = useRef();

  useEffect(() => {
    (async () => {
      const [p,d,ph,c] = await Promise.all([load(K.profile),load(K.diary),load(K.photos),load(K.career)]);
      if (p) setProfile(p);
      setDiary(d || DEF_DIARY);
      setPhotos(ph || []);
      setCareer(c || DEF_CAREER);
      setLoading(false);
    })();
  }, []);

  const saveDiary = async () => {
    const u = editing ? diary.map(x=>x.id===editing.id?{...x,...dF}:x) : [{id:Date.now(),...dF},...diary];
    setDiary(u); await save(K.diary,u);
    setModal(null); setEditing(null);
    setDF({title:"",content:"",mood:"✦",date:new Date().toISOString().slice(0,10)});
  };
  const delDiary = async id => { const u=diary.filter(x=>x.id!==id); setDiary(u); await save(K.diary,u); };

  const handlePhotoFile = async e => {
    const f=e.target.files[0]; if(!f) return;
    setPF({...pF, src: await toBase64(f)});
  };
  const savePhoto = async () => {
    if(!pF.src) return;
    const u=[{id:Date.now(),...pF},...photos];
    setPhotos(u); await save(K.photos,u);
    setModal(null); setPF({src:"",caption:""});
  };
  const delPhoto = async id => { const u=photos.filter(x=>x.id!==id); setPhotos(u); await save(K.photos,u); };

  const saveCareer = async () => {
    const u = editing ? career.map(x=>x.id===editing.id?{...x,...cF}:x) : [{id:Date.now(),...cF},...career];
    setCareer(u); await save(K.career,u);
    setModal(null); setEditing(null); setCF({year:"",title:"",org:"",desc:""});
  };
  const delCareer = async id => { const u=career.filter(x=>x.id!==id); setCareer(u); await save(K.career,u); };

  const saveProfile = async () => { setProfile(prF); await save(K.profile,prF); setModal(null); };

  const handleHeroImg = async e => {
    const f=e.target.files[0]; if(!f) return;
    const u={...profile, heroImg: await toBase64(f)};
    setProfile(u); await save(K.profile,u);
  };

  const openEditDiary  = item => { setEditing(item); setDF({title:item.title,content:item.content,mood:item.mood,date:item.date}); setModal('diary'); };
  const openEditCareer = item => { setEditing(item); setCF({year:item.year,title:item.title,org:item.org,desc:item.desc}); setModal('career'); };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0a0a0a',color:'#222',fontFamily:'serif',letterSpacing:'0.2em',fontSize:'0.7rem',textTransform:'uppercase'}}>
      Loading
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="layout">

        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="sb-url">www.dlwns.me</div>
            <div className="sb-name">dl<em>wns</em></div>
          </div>
          <nav className="sb-nav">
            {PAGES.map(p => (
              <button key={p.id} className={`nav-btn ${page===p.id?'act':''}`} onClick={()=>setPage(p.id)}>
                <span className="nav-g">{p.glyph}</span>
                <span className="nav-l">{p.label}</span>
                {p.id==='일기'   && <span className="nav-n">{String(diary.length).padStart(2,'0')}</span>}
                {p.id==='사진'   && <span className="nav-n">{String(photos.length).padStart(2,'0')}</span>}
                {p.id==='커리어' && <span className="nav-n">{String(career.length).padStart(2,'0')}</span>}
              </button>
            ))}
          </nav>
          <div className="sb-foot">
            <div className="sb-copy">© 2026 www.dlwns.me</div>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="main">

          {/* HOME */}
          {page==='home' && (
            <div className="hero fu">
              <div className="hero-top">
                <div className="hero-txt">
                  <p className="h-eye fu1">Personal Space — www.dlwns.me</p>
                  <h1 className="h-title fu2">
                    {profile.name}
                    <em>{profile.tagline}</em>
                  </h1>
                  <p className="h-bio fu3">{profile.bio}</p>
                  <div className="h-acts fu4">
                    <button className="btn-p" onClick={()=>setPage('일기')}>일기 보기</button>
                    <button className="btn-g" onClick={()=>{setPrF({...profile});setModal('profile');}}>프로필 편집</button>
                  </div>
                </div>
                <div className="hero-img">
                  {profile.heroImg ? (
                    <>
                      <img src={profile.heroImg} alt="hero"/>
                      <div className="hero-img-tag">{profile.name}</div>
                      <button className="btn-g btn-sm" style={{position:'absolute',bottom:24,right:24,background:'rgba(0,0,0,0.5)'}} onClick={()=>heroRef.current.click()}>변경</button>
                    </>
                  ) : (
                    <div className="hero-up" onClick={()=>heroRef.current.click()}>
                      <div className="up-g">⊕</div>
                      <div className="up-l">대표 사진 업로드</div>
                    </div>
                  )}
                  <input ref={heroRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleHeroImg}/>
                </div>
              </div>
              <div className="hero-bot">
                {[{n:diary.length,l:'일기'},{n:photos.length,l:'사진'},{n:career.length,l:'커리어'}].map(s=>(
                  <div className="h-stat" key={s.l}>
                    <div className="h-stat-n">{String(s.n).padStart(2,'0')}</div>
                    <div className="h-stat-l">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 일기 */}
          {page==='일기' && (
            <div className="fu">
              <div className="pg-head">
                <div className="pg-title"><em>Personal Archive</em>일기</div>
                <button className="btn-p btn-sm" onClick={()=>{setEditing(null);setDF({title:"",content:"",mood:"✦",date:new Date().toISOString().slice(0,10)});setModal('diary');}}>+ 새 일기</button>
              </div>
              <div className="pg-body">
                <div className="d-list">
                  {diary.map(item => {
                    const d=new Date(item.date);
                    return (
                      <div className="d-row" key={item.id}>
                        <div className="d-date">
                          <div className="d-day">{String(d.getDate()).padStart(2,'0')}</div>
                          <div className="d-mon">{d.toLocaleString('ko-KR',{month:'short'})} {d.getFullYear()}</div>
                          <div className="d-sym">{item.mood}</div>
                        </div>
                        <div>
                          <div className="d-t">{item.title}</div>
                          <div className="d-c">{item.content}</div>
                        </div>
                        <div className="d-acts">
                          <button className="btn-g btn-sm" onClick={()=>openEditDiary(item)}>수정</button>
                          <button className="btn-d" onClick={()=>delDiary(item.id)}>삭제</button>
                        </div>
                      </div>
                    );
                  })}
                  {diary.length===0 && <p style={{color:'#2a2a2a',fontSize:'0.78rem',letterSpacing:'0.12em',padding:'60px 0',textAlign:'center'}}>첫 일기를 써보세요</p>}
                </div>
              </div>
            </div>
          )}

          {/* 사진 */}
          {page==='사진' && (
            <div className="fu">
              <div className="pg-head">
                <div className="pg-title"><em>Moments</em>사진</div>
                <button className="btn-p btn-sm" onClick={()=>setModal('photo')}>+ 사진 추가</button>
              </div>
              <div className="pg-body">
                <div className="ph-grid">
                  {photos.map(p=>(
                    <div className="ph-item" key={p.id}>
                      <img src={p.src} alt={p.caption} onClick={()=>setLightbox(p.src)}/>
                      <div className="ph-ov" onClick={()=>setLightbox(p.src)}>
                        {p.caption && <span className="ph-cap">{p.caption}</span>}
                      </div>
                      <button className="ph-del" onClick={()=>delPhoto(p.id)}>✕</button>
                    </div>
                  ))}
                  <button className="ph-add" onClick={()=>setModal('photo')}>
                    <span style={{fontSize:'1.2rem',color:'#1e1e1e'}}>+</span>
                    <span>사진 추가</span>
                  </button>
                </div>
                {photos.length===0 && <p style={{color:'#2a2a2a',fontSize:'0.78rem',letterSpacing:'0.12em',padding:'40px 0',textAlign:'center'}}>첫 번째 사진을 업로드해보세요</p>}
              </div>
            </div>
          )}

          {/* 커리어 */}
          {page==='커리어' && (
            <div className="fu">
              <div className="pg-head">
                <div className="pg-title"><em>Work & Experience</em>커리어</div>
                <button className="btn-p btn-sm" onClick={()=>{setEditing(null);setCF({year:"",title:"",org:"",desc:""});setModal('career');}}>+ 추가</button>
              </div>
              <div className="pg-body">
                <div className="c-list">
                  {career.map(item=>(
                    <div className="c-row" key={item.id}>
                      <div className="c-yr">{item.year}</div>
                      <div>
                        <div className="c-t">{item.title}</div>
                        <div className="c-o">{item.org}</div>
                        <div className="c-d">{item.desc}</div>
                      </div>
                      <div className="c-acts">
                        <button className="btn-g btn-sm" onClick={()=>openEditCareer(item)}>수정</button>
                        <button className="btn-d" onClick={()=>delCareer(item.id)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 기타 */}
          {page==='기타' && (
            <div className="fu">
              <div className="pg-head">
                <div className="pg-title"><em>Miscellaneous</em>기타</div>
              </div>
              <div className="pg-body">
                <div className="etc-g">
                  {[
                    {ic:"◎",t:"독서 기록",d:"읽은 책들을 기록하고 생각을 남겨보세요."},
                    {ic:"♩",t:"플레이리스트",d:"요즘 듣는 음악들과 그 순간의 감정."},
                    {ic:"◈",t:"여행 기록",d:"다녀온 곳, 보고 싶은 곳들의 기록."},
                    {ic:"◇",t:"아이디어 노트",d:"스치는 생각들을 빠르게 적어두는 공간."},
                  ].map(c=>(
                    <div className="etc-c" key={c.t}>
                      <div className="etc-ic">{c.ic}</div>
                      <div className="etc-t">{c.t}</div>
                      <div className="etc-d">{c.d}</div>
                      <div className="etc-tag">Coming soon</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODALS */}
      {modal==='diary' && (
        <div className="mb" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <button className="mo-x" onClick={()=>setModal(null)}>✕</button>
            <div className="mo-t">{editing?'일기 수정':'새 일기'}</div>
            <div className="fg"><label>날짜</label><input type="date" value={dF.date} onChange={e=>setDF({...dF,date:e.target.value})}/></div>
            <div className="fg">
              <label>기호</label>
              <div className="mood-row">{MOODS.map(m=><button key={m} className={`m-btn ${dF.mood===m?'sel':''}`} onClick={()=>setDF({...dF,mood:m})}>{m}</button>)}</div>
            </div>
            <div className="fg"><label>제목</label><input type="text" value={dF.title} placeholder="오늘의 제목" onChange={e=>setDF({...dF,title:e.target.value})}/></div>
            <div className="fg"><label>내용</label><textarea rows={6} value={dF.content} placeholder="오늘 하루를 기록해보세요…" onChange={e=>setDF({...dF,content:e.target.value})}/></div>
            <div className="f-acts"><button className="btn-p" onClick={saveDiary}>저장</button><button className="btn-g" onClick={()=>setModal(null)}>취소</button></div>
          </div>
        </div>
      )}

      {modal==='photo' && (
        <div className="mb" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <button className="mo-x" onClick={()=>setModal(null)}>✕</button>
            <div className="mo-t">사진 추가</div>
            <div className="fg">
              <label>사진 선택</label>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <button className="btn-g btn-sm" onClick={()=>photoRef.current.click()}>파일 선택</button>
                {pF.src && <span style={{fontSize:'0.64rem',letterSpacing:'0.1em',color:'#444',textTransform:'uppercase'}}>완료</span>}
              </div>
              {pF.src && <img src={pF.src} alt="" style={{width:'100%',maxHeight:200,objectFit:'cover',marginTop:14,filter:'grayscale(10%)'}}/>}
              <input ref={photoRef} type="file" accept="image/*" style={{display:'none'}} onChange={handlePhotoFile}/>
            </div>
            <div className="fg"><label>캡션 (선택)</label><input type="text" value={pF.caption} placeholder="이 사진에 대해 한 마디" onChange={e=>setPF({...pF,caption:e.target.value})}/></div>
            <div className="f-acts">
              <button className="btn-p" onClick={savePhoto} style={{opacity:pF.src?1:0.35}}>저장</button>
              <button className="btn-g" onClick={()=>setModal(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {modal==='career' && (
        <div className="mb" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <button className="mo-x" onClick={()=>setModal(null)}>✕</button>
            <div className="mo-t">{editing?'수정':'커리어 추가'}</div>
            {[['year','연도'],['title','직함 / 역할'],['org','회사 / 기관']].map(([k,lb])=>(
              <div className="fg" key={k}><label>{lb}</label><input type="text" value={cF[k]} onChange={e=>setCF({...cF,[k]:e.target.value})}/></div>
            ))}
            <div className="fg"><label>설명</label><textarea rows={4} value={cF.desc} onChange={e=>setCF({...cF,desc:e.target.value})}/></div>
            <div className="f-acts"><button className="btn-p" onClick={saveCareer}>저장</button><button className="btn-g" onClick={()=>setModal(null)}>취소</button></div>
          </div>
        </div>
      )}

      {modal==='profile' && (
        <div className="mb" onClick={()=>setModal(null)}>
          <div className="mo" onClick={e=>e.stopPropagation()}>
            <button className="mo-x" onClick={()=>setModal(null)}>✕</button>
            <div className="mo-t">프로필 편집</div>
            {[['name','이름'],['tagline','한 줄 소개'],['bio','상세 소개']].map(([k,lb])=>(
              <div className="fg" key={k}><label>{lb}</label><input type="text" value={prF[k]} onChange={e=>setPrF({...prF,[k]:e.target.value})}/></div>
            ))}
            <div className="f-acts"><button className="btn-p" onClick={saveProfile}>저장</button><button className="btn-g" onClick={()=>setModal(null)}>취소</button></div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lb" onClick={()=>setLightbox(null)}>
          <button className="lb-x" onClick={()=>setLightbox(null)}>✕</button>
          <img src={lightbox} alt="" onClick={e=>e.stopPropagation()}/>
        </div>
      )}
    </>
  );
}
