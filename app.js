// ============ 유틸 ============
window.__main=true;
document.getElementById('loading').innerHTML='불러오는 중… <span style="font-size:11px;opacity:.5">(v9 · 3 메인 스크립트 실행)</span>';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pd=s=>{const m=String(s||'').match(/(\d{4})-(\d{2})-(\d{2})/);return m?new Date(+m[1],m[2]-1,+m[3]):null};
const ds=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const md=s=>s?`${+s.slice(5,7)}/${+s.slice(8,10)}`:'';
const DOW='일월화수목금토';
const dow=s=>DOW[pd(s).getDay()];
const isWork=d=>d.getDay()%6!==0;
const addWork=(d,n)=>{d=new Date(d);while(n>0){d.setDate(d.getDate()+1);if(isWork(d))n--;}return d};
const nextWork=d=>addWork(d,1);
const workdays=(a,b)=>{let n=0;for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))if(isWork(d))n++;return Math.max(n,1)};
const won=n=>n?Number(n).toLocaleString():'0';
const man=n=>n>=10000?(Math.round(n/10000*10)/10)+'만':won(n);
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),1800)};
const TYPES=[['공정 끝','✅'],['공정 시작','▶️'],['투입','👷'],['현장 점검','🔍'],['특이사항','⚠️'],['고객 대화','💬']];
const ACTIVE=['계약','시공중','AS'];

// ============ 서버 호출 (GAS 없으면 로컬 목업) ============
function api(fn,...args){
  return new Promise((res,rej)=>{
    if(window.google&&google.script){google.script.run.withSuccessHandler(res).withFailureHandler(e=>{rej(e);toast('오류: '+(e.message||e))})[fn](...args);}
    else MOCK[fn](...args).then(res,rej);
  });
}

// ============ 상태 ============
let D=null;
const S={view:'cal',ym:'',day:'',site:null,tab:'기록',filter:'전체'};
async function load(){
  $('#loading').innerHTML='불러오는 중… <span style="font-size:11px;opacity:.5">(v9 · 4 서버 호출 중 · google.script '+(window.google&&google.script?'있음':'없음')+')</span>';
  const wd=setTimeout(()=>{if(!D)$('#loading').innerHTML='<div style="padding:24px;text-align:center"><b>서버 응답이 없습니다 (20초)</b><br><br><span style="font-size:13px">Apps Script 편집기 왼쪽 ⏱ 실행 기록에서 getData 오류를 확인하거나, 배포가 새 버전인지 확인하세요</span><br><br><button class="save" style="width:auto;padding:10px 20px" onclick="location.reload()">다시 시도</button></div>'},20000);
  try{let r=await api('getData');D=typeof r==='string'?JSON.parse(r):r;clearTimeout(wd);}catch(e){clearTimeout(wd);$('#loading').innerHTML='<div style="padding:24px;text-align:center"><b>불러오기 실패</b><br><br><span style="font-size:13px">'+esc(e.message||e)+'</span><br><br><button class="save" style="width:auto;padding:10px 20px" onclick="location.reload()">다시 시도</button></div>';return;}D.records.sort((a,b)=>a.일시<b.일시?1:-1);if(!S.ym){S.ym=D.today.slice(0,7);S.day=D.today;}$('#loading').style.display='none';render();}
const siteById=id=>D.sites.find(s=>s.현장ID===id);
const teamById=id=>D.teams.find(t=>t.팀ID===id);
const procsOf=id=>D.procs.filter(p=>p.현장ID===id).sort((a,b)=>a.순번-b.순번);
const liveOf=id=>procsOf(id).filter(p=>p.상태!=='제외');
const dated=p=>p.시작&&p.끝&&p.상태!=='제외';
const activeSites=()=>D.sites.filter(s=>ACTIVE.includes(s.상태));
const curProc=(id,day)=>liveOf(id).find(p=>dated(p)&&p.시작<=day&&day<=p.끝)||liveOf(id).find(p=>p.상태==='진행')||liveOf(id).find(p=>p.상태!=='완료');
const late=p=>dated(p)&&p.끝<D.today&&p.상태!=='완료';
const thumb=id=>id.startsWith('data:')?id:`https://drive.google.com/thumbnail?id=${id}&sz=w600`;

// ============ 렌더 ============
function render(){
  const v=S.view;
  $('#nav').innerHTML=[['cal','📅','달력'],['sites','🏠','현장'],['teams','👷','외주팀']].map(([k,i,n])=>`<div class="${(v===k||(k==='sites'&&v==='site'))?'on':''}" onclick="go('${k}')"><b>${i}</b>${n}</div>`).join('');
  ({cal:renderCal,sites:renderSites,site:renderSite,teams:renderTeams})[v]();
}
function go(v,id){S.view=v;if(id)S.site=id;if(v==='site'){S.tab='기록';S.filter='전체';}render();$('#main').scrollTop=0;}

// ---- 달력 ----
function renderCal(){
  const [y,m]=S.ym.split('-').map(Number);
  $('#hd').innerHTML=`<div class="row"><span class="d">${y}년 ${m}월</span><span><button onclick="moveMonth(-1)">‹</button> <button onclick="moveMonth(0)">오늘</button> <button onclick="moveMonth(1)">›</button></span></div>
  <div class="legend">${activeSites().map(s=>`<span style="background:${s.색}">${esc(s.고객명)} ${esc(s.평형||'')}</span>`).join('')||'<span style="background:#999">현장 없음</span>'}</div>`;
  const first=new Date(y,m-1,1).getDay(), days=new Date(y,m,0).getDate();
  let g='';for(let i=0;i<first;i++)g+='<div class="day blank"></div>';
  for(let d=1;d<=days;d++){
    const ds_=`${S.ym}-${String(d).padStart(2,'0')}`, w=(first+d-1)%7;
    let bars='';
    D.sites.forEach(s=>{
      const evs=[];if(s.착공일===ds_)evs.push('착공');if(s.준공예정===ds_)evs.push('준공');if(s.계약일===ds_&&['상담','계약'].includes(s.상태))evs.push(s.상태);
      evs.forEach(e=>bars+=`<div class="b ev" style="border-color:${s.색};color:${s.색}">${e}</div>`);
      if(w===0||w===6)return;
      const p=liveOf(s.현장ID).find(p=>dated(p)&&p.시작<=ds_&&ds_<=p.끝);if(!p)return;
      const pos=p.시작===p.끝?'':p.시작===ds_?'start':p.끝===ds_?'end':'cont';
      bars+=`<div class="b ${pos} ${(p.시작===ds_||w===1)?'lbl':''}" style="background:${s.색}">${esc(p.공정.split('(')[0])}</div>`;
    });
    g+=`<div class="day ${w===0?'sun off':w===6?'sat off':''} ${ds_===D.today?'today':''} ${ds_===S.day?'sel':''}" onclick="pickDay('${ds_}')"><div class="n">${d}</div>${bars}</div>`;
  }
  $('#main').innerHTML=`<div class="cal"><div class="wd">${[...'일월화수목금토'].map(c=>`<span>${c}</span>`).join('')}</div><div class="grid">${g}</div></div>${dayPanel()}`;
}
function moveMonth(n){if(n===0){S.ym=D.today.slice(0,7);S.day=D.today;}else{const [y,m]=S.ym.split('-').map(Number);const d=new Date(y,m-1+n,1);S.ym=ds(d).slice(0,7);S.day=S.ym+'-01';}render();}
function pickDay(d){S.day=d;render();}
function dayPanel(){
  const day=S.day;
  const rows=D.sites.map(s=>{
    const p=liveOf(s.현장ID).find(p=>dated(p)&&p.시작<=day&&day<=p.끝);
    const evs=[];if(s.착공일===day)evs.push('착공 · 📷 비포 촬영');if(s.준공예정===day)evs.push('준공예정 · 📷 애프터 촬영');if(s.계약일===day)evs.push(s.상태==='상담'?'상담':'계약');
    if(!p&&!evs.length)return '';
    const recs=D.records.filter(r=>r.현장ID===s.현장ID&&r.일시.slice(0,10)===day);
    const lt=p&&late(p)?`<span class="tag red">지연</span>`:'';
    return `<div class="site" onclick="go('site','${s.현장ID}')"><i style="background:${s.색}"></i><div style="flex:1"><div class="t">${esc(s.고객명)} ${esc(s.평형||'')} · ${p?esc(p.공정):evs[0]} ${lt}</div>
      <div class="s">${[p&&p.담당팀?esc(teamName(p.담당팀)):'',p?`${md(p.시작)}~${md(p.끝)}`:'',recs.length?`기록 ${recs.length}`:'',...(p?evs:[])].filter(Boolean).join(' · ')}</div></div></div>`;
  }).join('');
  return `<h2>${+day.slice(8)}일 ${dow(day)}${day===D.today?' · 오늘':''}</h2><div class="card">${rows||'<div class="empty">이 날 공정 없음</div>'}</div>`;
}
const teamName=id=>{const t=teamById(id);return t?t.팀명:id};

// ---- 현장 목록 ----
function renderSites(){
  $('#hd').innerHTML=`<div class="row"><span class="d">현장</span><button onclick="openSiteForm()">＋ 새 현장</button></div>`;
  const order=s=>({시공중:0,계약:1,AS:2,상담:3,준공:4,취소:5}[s.상태]??9);
  const list=[...D.sites].sort((a,b)=>order(a)-order(b)||(b.착공일||'').localeCompare(a.착공일||''));
  $('#main').innerHTML=list.map(s=>{
    const ps=liveOf(s.현장ID),done=ps.filter(p=>p.상태==='완료').length,cp=curProc(s.현장ID,D.today),lt=ps.filter(late).length,nodate=ps.filter(p=>!p.시작).length;
    return `<div class="card" onclick="go('site','${s.현장ID}')"><div class="row"><div><div class="t"><i class="dot" style="background:${s.색}"></i>${esc(s.고객명)} ${esc(s.평형||'')}</div><div class="s">${esc(s.주소||'')}</div></div><span class="tag ${s.상태==='시공중'?'':s.상태==='준공'?'green':'gray'}">${s.상태}</span></div>
      ${ps.length?`<div class="bar"><i style="width:${Math.round(done/ps.length*100)}%"></i></div><div class="s" style="margin-top:6px">${done}/${ps.length} 공정 · ${cp?esc(cp.공정):'완료'} · 준공 ${md(s.준공예정)||'미정'} ${lt?`<span class="tag red">지연 ${lt}</span>`:''}${nodate?`<span class="tag gray">일정 미정 ${nodate}</span>`:''}</div>`:``}</div>`;
  }).join('')||'<div class="empty">현장을 추가하세요</div>';
}

// ---- 현장 상세 ----
function renderSite(){
  const s=siteById(S.site);if(!s)return go('sites');
  const ps=liveOf(s.현장ID),done=ps.filter(p=>p.상태==='완료').length,cp=curProc(s.현장ID,D.today);
  const labor=D.records.filter(r=>r.현장ID===s.현장ID&&r.유형==='투입').reduce((a,r)=>a+(+r.금액||0),0);
  $('#hd').innerHTML=`<div class="row"><div><div class="d"><span onclick="go('sites')" style="opacity:.7">‹</span> ${esc(s.고객명)} ${esc(s.평형||'')}</div><div class="sub">${esc(s.주소||'')} ${s.연락처?'· '+esc(s.연락처):''}</div></div><button onclick="openSiteForm('${s.현장ID}')">정보</button></div>`;
  let body=`<div class="card" style="margin-top:10px"><div class="row"><span class="t">진척 ${ps.length?Math.round(done/ps.length*100):0}%</span><span class="s">${done}/${ps.length} 공정 · <span class="tag ${s.상태==='시공중'?'':'gray'}">${s.상태}</span></span></div><div class="bar"><i style="width:${ps.length?done/ps.length*100:0}%"></i></div>
    <div class="kv"><div><small>계약금액</small><b>${s.계약금액?man(+s.계약금액):'—'}</b></div><div><small>노무비 누계</small><b>${man(labor)}</b></div><div><small>지금 공정</small><b style="font-size:12px">${cp?esc(cp.공정.split('(')[0]):'—'}</b></div></div>
    <div class="note">📷 비포 ${md(s.착공일)||'—'} · 애프터 ${md(s.준공예정)||'—'} (준공 당일)</div></div>
    <div class="tabs"><span class="${S.tab==='기록'?'on':''}" onclick="S.tab='기록';render()">기록</span><span class="${S.tab==='공정'?'on':''}" onclick="S.tab='공정';render()">공정 ${ps.filter(late).length?'⚠️':''}</span></div>`;
  body+=S.tab==='기록'?timeline(s):procList(s);
  $('#main').innerHTML=body;
}
function timeline(s){
  const all=D.records.filter(r=>r.현장ID===s.현장ID);
  const f=S.filter, list=f==='전체'?all:all.filter(r=>r.유형===f);
  const chips=['전체',...TYPES.map(t=>t[0])].map(t=>`<span class="${f===t?'on':''}" onclick="S.filter='${t}';render()">${t}</span>`).join('');
  if(!list.length)return `<div class="chips">${chips}</div><div class="empty">기록 없음. 아래 ＋ 기록</div>`;
  const groups={};list.forEach(r=>{(groups[r.일시.slice(0,10)]=groups[r.일시.slice(0,10)]||[]).push(r)});
  return `<div class="chips">${chips}</div>`+Object.keys(groups).sort().reverse().map(d=>{
    const p=liveOf(s.현장ID).find(p=>dated(p)&&p.시작<=d&&d<=p.끝);
    return `<h2>${md(d)} ${dow(d)}${p?' · '+esc(p.공정.split('(')[0]):''}</h2><div class="card tl">${groups[d].map(r=>recHtml(r)).join('')}</div>`;}).join('');
}
function recHtml(r){
  const ico=Object.fromEntries(TYPES)[r.유형]||'•';
  const pics=r.사진?`<div class="pics">${String(r.사진).split('|').filter(Boolean).map(id=>`<img src="${thumb(id)}" onclick="event.stopPropagation();openPhoto('${id}')">`).join('')}</div>`:'';
  const sub=r.유형==='투입'?` · ${esc(teamName(r.팀ID))} ${r.단가?won(r.단가)+'×':''}${r.공수} · ${won(r.금액)}원${r.지급?' ✓지급':''}`:'';
  return `<div class="ev ${r.유형.replace(' ','')}" onclick="openRecordEdit('${r.ID}')"><div class="k">${r.일시.slice(11)} · ${ico} ${esc(r.유형)}${esc(sub)}</div><div class="bd">${esc(r.내용)}</div>${r.상세?`<div class="dt ${r.유형==='고객 대화'?'kakao':''}">${esc(r.상세)}</div>`:''}${pics}</div>`;
}
function procList(s){
  const ps=procsOf(s.현장ID);
  if(!ps.length)return `<div class="empty">공정이 없습니다</div>`;
  const nodate=ps.filter(p=>p.상태!=='제외'&&!p.시작).length;
  return `<div style="margin:0 12px 8px;display:flex;gap:8px"><button class="save" style="margin:0;flex:1" onclick="openSchedule('${s.현장ID}')">📅 일정 잡기${nodate?` · 미정 ${nodate}`:''}</button><button class="save" style="margin:0;width:auto;background:var(--plum)" onclick="openAddProc('${s.현장ID}')">＋ 공정</button></div>
    <div class="card pl">${ps.map(p=>`<div class="row" onclick="openProc('${s.현장ID}',${p.순번})" style="${p.상태==='제외'?'opacity:.4':''}"><span style="display:flex;align-items:center;min-width:0"><i class="dot ${p.상태==='완료'?'g':p.상태==='진행'?'r':late(p)?'x':''}"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.순번} ${esc(p.공정)}</span></span>
    <span class="s" style="white-space:nowrap">${p.상태==='제외'?'제외':p.시작?`${p.담당팀?esc(teamName(p.담당팀))+' · ':''}${md(p.시작)}${p.시작!==p.끝?'~'+md(p.끝):''}`:'<span style="color:#bbb">날짜 없음</span>'} ${late(p)?'<span class="tag red">지연</span>':p.상태==='진행'?'<span class="tag">진행</span>':''}</span></div>`).join('')}</div>
    <div class="note" style="margin:0 16px">공정을 누르면 상태·담당팀·날짜를 바꿀 수 있고, 끝 날짜를 바꾸면 뒤 공정이 같이 밀립니다.</div>`;
}

// ---- 일정 잡기: 공정별 시작~끝을 대표님이 직접 ----
const SC={rows:[]};
function openSchedule(siteId){
  SC.site=siteId;SC.rows=procsOf(siteId).map(p=>({순번:p.순번,공정:p.공정,시작:p.시작||'',끝:p.끝||'',상태:p.상태}));
  drawSchedule();
}
function drawSchedule(){
  const s=siteById(SC.site);
  openSheet(`<div class="row"><div class="t">일정 잡기 · ${esc(s.고객명)}</div><span class="s">끝 비우면 하루</span></div>
    <div class="note">시작을 넣으면 다음 공정 시작이 그 다음 근무일로 미리 채워집니다. 전부 고칠 수 있고, 안 하는 공정은 ✕.</div>
    <div class="pl" style="margin-top:6px">${SC.rows.map((r,i)=>`<div class="row" style="padding:7px 0;gap:6px;${r.상태==='제외'?'opacity:.4':''}">
      <span style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.순번} ${esc(r.공정.split('(')[0])}</span>
      <input type="date" class="in" style="width:118px;padding:8px 4px;font-size:12px" value="${r.시작}" ${r.상태==='제외'?'disabled':''} onchange="scSet(${i},'시작',this.value)">
      <input type="date" class="in" style="width:118px;padding:8px 4px;font-size:12px" value="${r.끝}" ${r.상태==='제외'?'disabled':''} onchange="scSet(${i},'끝',this.value)">
      <span style="width:22px;text-align:center;color:#999" onclick="scToggle(${i})">${r.상태==='제외'?'＋':'✕'}</span></div>`).join('')}</div>
    <div class="note" id="sc_sum">${scSummary()}</div>
    <button class="save" onclick="saveSchedule()">저장</button>
    <button class="ghost" onclick="openAddProc('${s.현장ID}')">＋ 공정 추가 (목록에 없는 공정)</button>
    <button class="ghost" onclick="scStandard()">LX 표준 소요일로 초안 채우기 (${s.착공일?md(s.착공일)+'부터':'착공일 필요'})</button>`);
}
function scSet(i,k,v){
  const r=SC.rows[i];r[k]=v;
  if(k==='시작'&&v&&(!r.끝||r.끝<v))r.끝=v;
  if(k==='끝'&&v&&r.시작&&r.시작>v)r.시작=v;
  if(k==='끝'&&v){const n=SC.rows.slice(i+1).find(x=>x.상태!=='제외');if(n&&!n.시작){n.시작=ds(nextWork(pd(v)));n.끝=n.끝||n.시작;}}
  drawSchedule();
}
function scToggle(i){const r=SC.rows[i];r.상태=r.상태==='제외'?'예정':'제외';drawSchedule();}
function scSummary(){const live=SC.rows.filter(r=>r.상태!=='제외'),ends=live.filter(r=>r.끝).map(r=>r.끝).sort();return `공정 ${live.length}개 · 날짜 없는 공정 ${live.filter(r=>!r.시작).length} · 준공예정 ${ends.length?md(ends[ends.length-1]):'미정'}`;}
function scStandard(){
  const s=siteById(SC.site);if(!s.착공일)return toast('현장 정보에 착공일을 먼저 넣으세요');
  let d=pd(s.착공일);if(!isWork(d))d=nextWork(d);
  SC.rows.forEach(r=>{if(r.상태==='제외'||r.상태==='완료')return;const dur=D.base.procs.find(b=>b.공정===r.공정)?.기본소요일||1;const st=new Date(d),en=addWork(st,dur-1);r.시작=ds(st);r.끝=ds(en);d=nextWork(en);});
  drawSchedule();
}
function openAddProc(siteId){
  const ps=procsOf(siteId);
  openSheet(`<div class="t">공정 추가</div><label class="l">공정 이름 *</label><input class="in" id="ap_name" placeholder="예: 탄성코트, 줄눈, 방충망">
    <label class="l">어디 뒤에</label><select class="in" id="ap_after">${opt(ps,ps.length?ps[ps.length-1].순번:'',p=>p.순번+' '+p.공정+' 뒤',p=>p.순번)}<option value="">맨 앞</option></select>
    <label class="l">시작 · 끝 (선택, 나중에 일정 잡기에서도 됨)</label><div style="display:flex;gap:6px"><input type="date" class="in" id="ap_s"><input type="date" class="in" id="ap_e"></div>
    <button class="save" onclick="saveAddProc('${siteId}')">추가</button>`);
}
async function saveAddProc(siteId){
  const name=val('ap_name');if(!name)return toast('공정 이름을 쓰세요');
  const seq=await api('addProc',siteId,name,val('ap_after'));
  if(val('ap_s'))await api('updateProc',siteId,seq,{시작:val('ap_s'),끝:val('ap_e')||val('ap_s')});
  closeSheet();toast(name+' 추가됨');await load();if(S.view==='site'){S.tab='공정';render();}
}
async function saveSchedule(){
  const rows=SC.rows.map(r=>({순번:r.순번,시작:r.시작,끝:r.끝||r.시작,상태:r.상태}));
  await api('saveSchedule',SC.site,rows);closeSheet();toast('일정 저장됨');await load();
}

// ---- 외주팀 ----
function renderTeams(){
  $('#hd').innerHTML=`<div class="row"><span class="d">외주팀 · ${+S.ym.slice(5)}월</span><span><button onclick="moveMonth(-1)">‹</button> <button onclick="moveMonth(1)">›</button> <button onclick="openTeamForm()">＋ 팀</button></span></div>`;
  const recs=D.records.filter(r=>r.유형==='투입'&&r.일시.slice(0,7)===S.ym);
  const total=recs.reduce((a,r)=>a+(+r.금액||0),0), paid=recs.filter(r=>r.지급).reduce((a,r)=>a+(+r.금액||0),0);
  let h=`<div class="card" style="background:var(--plum);color:#fff;margin-top:10px"><div class="row"><span>${+S.ym.slice(5)}월 노무비</span><b style="font-size:18px">${man(total)}</b></div><div class="s" style="color:#fff;opacity:.75">지급 ${man(paid)} · 미지급 ${man(total-paid)}</div></div>`;
  h+=D.teams.map(t=>{
    const rs=recs.filter(r=>r.팀ID===t.팀ID), gs=rs.reduce((a,r)=>a+(+r.공수||0),0), amt=rs.reduce((a,r)=>a+(+r.금액||0),0), pd_=rs.filter(r=>r.지급).reduce((a,r)=>a+(+r.금액||0),0);
    const sites=[...new Set(rs.map(r=>siteById(r.현장ID)?.고객명).filter(Boolean))].join('·');
    return `<div class="card" onclick="openTeamForm('${t.팀ID}')"><div class="row"><div><div class="t">${esc(t.팀명)} <span class="s" style="display:inline">${esc(t.공종)}</span></div><div class="s">${[t.대표자?esc(t.대표자):'',t.연락처?esc(t.연락처):'',sites?esc(sites):''].filter(Boolean).join(' · ')||'기록 없음'}</div></div>${amt?`<span class="tag ${amt===pd_?'green':'red'}">${amt===pd_?'지급완료':'미지급 '+man(amt-pd_)}</span>`:''}</div>
      ${rs.length?`<div class="kv"><div><small>공수</small><b>${gs}</b></div><div><small>금액</small><b>${man(amt)}</b></div><div><small>지급</small><b>${man(pd_)}</b></div></div>`:''}</div>`;
  }).join('')||'<div class="empty">팀을 추가하세요. 투입 기록에 팀이 필요합니다</div>';
  $('#main').innerHTML=h;
}

// ============ 시트 ============
function openSheet(html){$('#sheet').innerHTML='<div class="h"></div>'+html;$('#sheet').classList.add('on');$('#dim').classList.add('on');$('#fab').style.display='none';}
function closeSheet(){$('#sheet').classList.remove('on');$('#dim').classList.remove('on');$('#fab').style.display='';PH.length=0;}
$('#dim').onclick=closeSheet;
const opt=(list,val,label=x=>x,value=x=>x,blank)=>(blank?`<option value="">${blank}</option>`:'')+list.map(x=>`<option value="${esc(value(x))}" ${value(x)==val?'selected':''}>${esc(label(x))}</option>`).join('');
const val=id=>$('#'+id)?.value?.trim()||'';

// ---- 사진 ----
const PH=[]; // {name,b64,url}
function photoBtns(){return `<div class="pics" id="pics">${PH.map(p=>`<img src="${p.url}">`).join('')}<div class="add" onclick="$('#cam').click()">📷</div><div class="add" onclick="$('#alb').click()">🖼</div></div>
  <input type="file" id="cam" accept="image/*" capture="environment" hidden onchange="addPhotos(this.files)"><input type="file" id="alb" accept="image/*" multiple hidden onchange="addPhotos(this.files)">`;}
async function addPhotos(files){
  for(const f of files){const url=await resize(f);PH.push({name:f.name||'photo.jpg',b64:url.split(',')[1],url});}
  const el=$('#pics');if(el)el.outerHTML=photoBtns().split('<input')[0];
}
function resize(file){return new Promise(res=>{const img=new Image();img.onload=()=>{const M=1600,r=Math.min(1,M/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*r);c.height=Math.round(img.height*r);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.8));URL.revokeObjectURL(img.src)};img.src=URL.createObjectURL(file);});}
function openPhoto(id){window.open(id.startsWith('data:')?id:`https://drive.google.com/file/d/${id}/view`,'_blank');}

// ---- ＋ 기록 ----
const R={site:null,type:null,follow:true,gs:1,checks:{}};
$('#fab').onclick=()=>openRecord();
function openRecord(type,site){
  const sites=activeSites();if(!sites.length)return toast('먼저 현장을 추가하세요');
  R.site=site||(S.view==='site'?S.site:null)||sites[0].현장ID;R.type=type||R.type||'특이사항';R.follow=true;R.gs=1;R.checks={};
  drawRecord();
}
function drawRecord(){
  const s=siteById(R.site), ps=liveOf(R.site), cp=curProc(R.site,D.today);
  let f='';
  if(R.type==='공정 끝'){const def=ps.find(p=>p.상태==='진행')||ps.find(p=>p.상태!=='완료');f=`<label class="l">끝난 공정</label><select class="in" id="r_proc">${opt(ps.filter(p=>p.상태!=='완료'),def?.순번,p=>p.순번+' '+p.공정+(p.시작?' ('+md(p.시작)+'~'+md(p.끝)+')':''),p=>p.순번)}</select>`;}
  if(R.type==='공정 시작'){const def=ps.find(p=>p.상태==='진행')||ps.find(p=>p.상태!=='완료');f=`<label class="l">오늘 ${md(D.today)} 시작하는 공정</label><select class="in" id="r_proc" onchange="shiftPreview()">${opt(ps.filter(p=>p.상태!=='완료'),def?.순번,p=>p.순번+' '+p.공정,p=>p.순번)}</select>
    <label class="l">끝나는 날짜 (직접 선택)</label><input type="date" class="in" id="r_date" value="" min="${D.today}" onchange="shiftPreview()">
    <div class="tog ${R.follow?'on':''}" onclick="R.follow=!R.follow;this.classList.toggle('on');shiftPreview()"><span>뒤 공정 같이 밀기</span><i></i></div><div class="note" id="r_prev"></div>`;}
  if(R.type==='투입'){f=`<label class="l">팀</label><select class="in" id="r_team" onchange="if(this.value==='__new'){R.back=true;openTeamForm();return}">${opt(D.teams,cp?.담당팀||'',t=>t.팀명+(t.공종?' · '+t.공종:''),t=>t.팀ID)}<option value="__new">＋ 새 팀 추가…</option></select>
    <label class="l">일당 (원)</label><input class="in" id="r_rate" inputmode="numeric" placeholder="예: 250000" oninput="calcAmt()">
    <label class="l">공수 (인원 × 일)</label><div class="seg" id="r_gs">${[0.5,1,2,3].map(g=>`<span class="${R.gs===g?'on':''}" onclick="setGs(${g})">${g}</span>`).join('')}<input class="in" id="r_gs_in" inputmode="decimal" placeholder="직접" style="flex:1;padding:10px 6px;text-align:center" oninput="setGs(+this.value,true)"></div>
    <label class="l">금액 (일당 × 공수 자동, 고칠 수 있음)</label><input class="in" id="r_amt" inputmode="numeric"><label class="l">공정</label><select class="in" id="r_proc">${opt(ps,cp?.순번,p=>p.공정,p=>p.순번,'—')}</select>`;}
  if(R.type==='현장 점검')f=`<label class="l">확인 항목 (눌러서 ✓)</label><div class="chips" id="r_chk">${D.base.lists.점검항목.map(c=>`<span class="${R.checks[c]?'on':''}" onclick="R.checks['${c}']=!R.checks['${c}'];this.classList.toggle('on')">${c}</span>`).join('')}</div>`;
  const txtLabel={'공정 끝':'메모 (선택)','공정 시작':'메모 (선택)','투입':'메모 (선택)','현장 점검':'보류·문제 (선택)','특이사항':'한 줄로','고객 대화':'제목 한 줄'}[R.type];
  openSheet(`<div class="chips">${activeSites().map(x=>`<span class="${x.현장ID===R.site?'on':''}" onclick="R.site='${x.현장ID}';drawRecord()">${esc(x.고객명)}</span>`).join('')}</div>
    <div class="types">${TYPES.map(([t,i])=>`<span class="${R.type===t?'on':''}" onclick="R.type='${t}';drawRecord()"><em>${i}</em>${t}</span>`).join('')}</div>
    ${f}<label class="l">${txtLabel}</label>${R.type==='고객 대화'?`<input class="in" id="r_text" placeholder="예: 욕실 타일 색상 확정"><label class="l">카톡 대화 (복사해서 붙여넣기, 캡처는 📷·🖼 로 사진 첨부)</label><textarea class="in" id="r_detail" placeholder="카톡에서 대화 복사 → 여기 붙여넣기"></textarea>`:`<input class="in" id="r_text" placeholder="${R.type==='특이사항'?'예: 욕실 타일 3박스 부족':''}">`}
    ${photoBtns()}
    ${R.type!=='고객 대화'?`<div class="more" onclick="$('#r_detail').style.display='block';this.style.display='none'"><span>자세히 쓰기 (원인·조치·금액)</span><span>⌄</span></div><textarea class="in" id="r_detail" style="display:none;margin-top:8px"></textarea>`:''}
    <button class="save" id="r_save" onclick="saveRecord()">저장</button>`);
  if(R.type==='투입')calcAmt();
}
function setGs(g,typed){R.gs=g||0;$$('#r_gs span').forEach(e=>e.classList.toggle('on',!typed&&+e.textContent===g));if(!typed)$('#r_gs_in').value='';calcAmt();}
function calcAmt(){const rate=+val('r_rate').replace(/\D/g,'');$('#r_amt').value=rate&&R.gs?Math.round(rate*R.gs):'';}
function simShift(siteId,seq,newEnd,follow,newStart){ // 서버 shiftProc 과 같은 계산 (미리보기·목업용)
  const ps=procsOf(siteId).map(p=>({...p}));const t=ps.find(p=>+p.순번===+seq);if(!t)return null;
  if(!newEnd||!(newStart||t.시작))return null;let end=pd(newEnd),start=pd(newStart||t.시작);if(end<start)start=end;t.시작=ds(start);t.끝=ds(end);let cursor=end,moved=0;
  if(follow)ps.filter(p=>+p.순번>+seq&&dated(p)&&p.상태!=='완료').forEach(p=>{const dur=workdays(pd(p.시작),pd(p.끝));const st=nextWork(cursor),en=addWork(st,dur-1);if(ds(st)!==p.시작||ds(en)!==p.끝){p.시작=ds(st);p.끝=ds(en);moved++;}cursor=en;});
  return {procs:ps,moved,준공예정:ps.filter(dated).map(p=>p.끝).sort().pop()||''};
}
function shiftPreview(){
  const s=siteById(R.site),r=simShift(R.site,val('r_proc'),val('r_date'),R.follow,D.today);if(!r){$('#r_prev').textContent='';return;}
  const conf=[];r.procs.filter(p=>p.담당팀).forEach(p=>D.procs.filter(q=>q.현장ID!==R.site&&q.담당팀===p.담당팀&&q.시작<=p.끝&&p.시작<=q.끝).forEach(q=>conf.push(`${teamName(p.담당팀)} ${md(p.시작)} ${siteById(q.현장ID)?.고객명}과 겹침`)));
  $('#r_prev').innerHTML=`${md(D.today)} ~ ${md(val('r_date'))} · 뒤 공정 ${r.moved}개 이동 · 준공예정 ${md(s.준공예정)} → <b>${md(r.준공예정)}</b> · 📷 애프터 ${md(r.준공예정)}${conf.length?`<div class="note warn" style="margin-top:6px">⚠️ ${[...new Set(conf)].join('<br>')}</div>`:''}`;
}
async function saveRecord(){
  const r={현장ID:R.site,유형:R.type,내용:val('r_text'),상세:val('r_detail'),사진:'',팀ID:'',공수:'',금액:'',공정:'',지급:'',단가:''};
  const ps=procsOf(R.site),pr=ps.find(p=>+p.순번===+val('r_proc'));
  if(R.type==='공정 끝'){if(!pr)return toast('공정을 고르세요');r.공정=pr.공정;r._seq=pr.순번;r.내용=r.내용||`${pr.공정} 완료`;}
  if(R.type==='공정 시작'){if(!pr||!val('r_date'))return toast('공정과 끝나는 날짜를 고르세요');r.공정=pr.공정;r._seq=pr.순번;r._newEnd=val('r_date');r._follow=R.follow;r.내용=r.내용||'';}
  if(R.type==='투입'){if(!val('r_team')||val('r_team')==='__new')return toast('팀을 고르세요');if(!R.gs)return toast('공수를 넣으세요');r.팀ID=val('r_team');r.단가=+val('r_rate').replace(/\D/g,'')||'';r.공수=R.gs;r.금액=+val('r_amt').replace(/\D/g,'')||'';r.공정=pr?.공정||'';r.내용=r.내용||`${teamName(r.팀ID)} ${R.gs}공수`+(r.금액?' · '+won(r.금액)+'원':'');}
  if(R.type==='현장 점검'){const ok=Object.keys(R.checks).filter(k=>R.checks[k]);r.내용=(ok.length?ok.join(' ✓ ')+' ✓':'')+(r.내용?(ok.length?' · ':'')+'보류: '+r.내용:'');if(!r.내용)return toast('항목을 체크하세요');}
  if((R.type==='특이사항'||R.type==='고객 대화')&&!r.내용&&!r.상세&&!PH.length)return toast('내용을 쓰세요');
  $('#r_save').disabled=true;$('#r_save').textContent='저장 중…';
  try{await api('addRecord',r,PH.map(p=>({name:p.name,b64:p.b64})));closeSheet();toast('저장됨');await load();}
  catch(e){$('#r_save').disabled=false;$('#r_save').textContent='저장';}
}

// ---- 기록 수정 ----
function openRecordEdit(id){
  const r=D.records.find(x=>x.ID===id);if(!r)return;PH.length=0;
  openSheet(`<div class="t">${esc(r.유형)} · ${r.일시}</div><label class="l">내용</label><input class="in" id="e_text" value="${esc(r.내용)}"><label class="l">상세</label><textarea class="in" id="e_detail">${esc(r.상세)}</textarea>
    ${r.유형==='투입'?`<label class="l">금액</label><input class="in" id="e_amt" inputmode="numeric" value="${r.금액}"><div class="tog ${r.지급?'on':''}" id="e_paid" onclick="this.classList.toggle('on')"><span>지급 완료</span><i></i></div>`:''}
    ${r.사진?`<div class="pics">${String(r.사진).split('|').filter(Boolean).map(i=>`<img src="${thumb(i)}" onclick="openPhoto('${i}')">`).join('')}</div>`:''}
    <label class="l">사진 추가</label>${photoBtns()}
    <button class="save" onclick="saveRecordEdit('${id}')">저장</button><button class="ghost danger" onclick="delRecord('${id}')">이 기록 삭제</button>`);
}
async function saveRecordEdit(id){
  const r=D.records.find(x=>x.ID===id);const p={내용:val('e_text'),상세:val('e_detail')};
  if(r.유형==='투입'){p.금액=+val('e_amt').replace(/\D/g,'')||'';p.지급=$('#e_paid').classList.contains('on')?'지급':'';}
  if(PH.length){await api('addRecord',{ID:id+'p',일시:r.일시,현장ID:r.현장ID,유형:r.유형,내용:'(사진 추가) '+r.내용,상세:'',사진:''},PH.map(x=>({name:x.name,b64:x.b64})));}
  await api('updateRecord',id,p);closeSheet();toast('수정됨');await load();
}
async function delRecord(id){if(!confirm('삭제할까요?'))return;await api('deleteRecord',id);closeSheet();toast('삭제됨');await load();}

// ---- 공정 편집 ----
function openProc(siteId,seq){
  const p=procsOf(siteId).find(x=>+x.순번===+seq);R.follow=true;
  openSheet(`<div class="t">${p.순번} ${esc(p.공정)}</div><div class="s">${p.시작?md(p.시작)+' ~ '+md(p.끝):'날짜 없음'} · ${p.상태}${late(p)?' · <b style="color:var(--red)">지연</b>':''}</div>
    <label class="l">상태</label><div class="seg" id="p_st">${['예정','진행','완료','보류','제외'].map(s=>`<span class="${p.상태===s?'on':''}" onclick="$$('#p_st span').forEach(e=>e.classList.toggle('on',e===this))">${s}</span>`).join('')}</div>
    <label class="l">담당팀</label><select class="in" id="p_team">${opt(D.teams,p.담당팀,t=>t.팀명+' · '+t.공종,t=>t.팀ID,'— 없음')}</select>
    <label class="l">시작</label><input type="date" class="in" id="p_start" value="${p.시작}">
    <label class="l">끝</label><input type="date" class="in" id="p_end" value="${p.끝}" onchange="procPreview('${siteId}',${seq})">
    <div class="tog on" id="p_follow" onclick="R.follow=!R.follow;this.classList.toggle('on');procPreview('${siteId}',${seq})"><span>끝 날짜 바꾸면 뒤 공정 같이 밀기</span><i></i></div><div class="note" id="p_prev"></div>
    <button class="save" onclick="saveProc('${siteId}',${seq},'${p.끝}')">저장</button><button class="ghost danger" onclick="if(confirm('이 공정을 지울까요?')){api('deleteProc','${siteId}',${seq}).then(()=>{closeSheet();load()})}">공정 삭제</button>`);
}
function procPreview(siteId,seq){const s=siteById(siteId),r=simShift(siteId,seq,val('p_end'),R.follow);if(r)$('#p_prev').textContent=`뒤 공정 ${r.moved}개 이동 · 준공예정 ${md(s.준공예정)} → ${md(r.준공예정)}`;}
async function saveProc(siteId,seq,oldEnd){
  const st=$('#p_st .on')?.textContent, p={상태:st,담당팀:val('p_team'),시작:val('p_start')};
  await api('updateProc',siteId,seq,p);
  if(val('p_end')!==oldEnd){if(oldEnd&&val('p_end'))await api('shiftProc',siteId,seq,val('p_end'),R.follow);else await api('updateProc',siteId,seq,{끝:val('p_end')});}
  closeSheet();toast('저장됨');await load();
}

// ---- 현장 추가/수정 ----
function openSiteForm(id){
  const s=id?siteById(id):{상태:'계약',계약일:D.today};
  openSheet(`<div class="t">${id?'현장 정보':'새 현장'}</div>
    <label class="l">고객명 *</label><input class="in" id="s_name" value="${esc(s.고객명||'')}" placeholder="예: 김○○ 세곡동">
    <label class="l">평형</label><input class="in" id="s_py" value="${esc(s.평형||'')}" placeholder="예: 32평">
    <label class="l">주소</label><input class="in" id="s_addr" value="${esc(s.주소||'')}">
    <label class="l">연락처</label><input class="in" id="s_tel" inputmode="tel" value="${esc(s.연락처||'')}">
    <label class="l">계약금액</label><input class="in" id="s_amt" inputmode="numeric" value="${s.계약금액||''}">
    <label class="l">상태</label><select class="in" id="s_st">${opt(D.base.lists.현장상태,s.상태)}</select>
    <label class="l">계약일</label><input type="date" class="in" id="s_c" value="${s.계약일||''}">
    <label class="l">착공일 (비포 촬영일 · 표준 초안 기준일)</label><input type="date" class="in" id="s_start" value="${s.착공일||''}">
    <label class="l">메모</label><textarea class="in" id="s_memo">${esc(s.메모||'')}</textarea>
    <button class="save" onclick="saveSite('${id||''}')">저장</button>`);
}
async function saveSite(id){
  const p={고객명:val('s_name'),평형:val('s_py'),주소:val('s_addr'),연락처:val('s_tel'),계약금액:+val('s_amt').replace(/\D/g,'')||'',상태:val('s_st'),계약일:val('s_c'),착공일:val('s_start'),메모:val('s_memo')};
  if(!p.고객명)return toast('고객명을 쓰세요');
  if(id)await api('updateSite',id,p);else{const nid=await api('addSite',p);closeSheet();toast('현장 추가됨 · 일정을 잡으세요');await load();S.site=nid;S.view='site';S.tab='공정';render();return;}
  closeSheet();toast('저장됨');await load();
}

// ---- 팀 ----
function openTeamForm(id){
  const t=id?teamById(id):{};
  openSheet(`<div class="t">${id?'팀 정보':'새 팀'}</div>
    <label class="l">팀명 *</label><input class="in" id="t_name" value="${esc(t.팀명||'')}" placeholder="예: 타일팀 박반장">
    <label class="l">공종</label><select class="in" id="t_kind">${opt(D.base.procs.map(p=>p.공종),t.공종,x=>x,x=>x,'—')}</select>
    <label class="l">대표자 · 연락처</label><input class="in" id="t_rep" value="${esc(t.대표자||'')}" placeholder="이름"><input class="in" id="t_tel" inputmode="tel" value="${esc(t.연락처||'')}" placeholder="010-" style="margin-top:6px">
    <label class="l">계좌</label><input class="in" id="t_acct" value="${esc(t.계좌||'')}">
    <button class="save" onclick="saveTeam('${id||''}')">저장</button>`);
}
async function saveTeam(id){
  const p={팀명:val('t_name'),공종:val('t_kind'),대표자:val('t_rep'),연락처:val('t_tel'),계좌:val('t_acct')};
  if(!p.팀명)return toast('팀명을 쓰세요');
  const nid=await api(id?'updateTeam':'addTeam',...(id?[id,p]:[p]));closeSheet();toast('저장됨');await load();if(R.back){R.back=false;openRecord('투입',R.site);if(nid)$('#r_team').value=nid;}
}

// ============ 로컬 목업 (GAS 밖에서 미리보기용) ============
const MOCK=(()=>{
  const today=ds(new Date());const T=pd(today);
  const dayOff=n=>ds(new Date(T.getFullYear(),T.getMonth(),T.getDate()+n));
  const LX=[['실측·설계확정',1,'설계'],['철거',2,'철거'],['설비(배관·전기배선)',2,'설비'],['창호(샷시)',1,'창호'],['목공(천장·벽체·몰딩)',3,'목공'],['타일(욕실·현관·주방)',3,'타일'],['욕실 도기·수전',1,'욕실'],['도장',2,'도장'],['필름(문·몰딩)',2,'필름'],['바닥(마루·장판)',2,'바닥'],['도배',2,'도배'],['주방가구',1,'주방'],['붙박이장·중문·도어',1,'가구'],['조명·전기 마감',1,'전기'],['실리콘·준공청소',1,'청소'],['고객 검수·입주',1,'검수']];
  const LISTS={현장상태:['상담','계약','시공중','준공','AS','취소'],점검항목:['방수','바닥 구배','전기 배선','설비 누수','창호 수평','마감 실리콘','청소 상태'],색:['#D9487A','#4C8DF5','#2FA86A','#F2994A','#9B51E0','#1ABC9C']};
  const db={sites:[],procs:[],teams:[{팀ID:'T1',팀명:'타일팀 박반장',공종:'타일',대표자:'박○○',연락처:'',계좌:''},{팀ID:'T2',팀명:'철거팀 최사장',공종:'철거',대표자:'최○○',연락처:'',계좌:''},{팀ID:'T3',팀명:'설비 이사장',공종:'설비',대표자:'',연락처:'',계좌:''},{팀ID:'T4',팀명:'목공 정사장',공종:'목공',대표자:'',연락처:'',계좌:''}],records:[]};
  const teamFor=k=>db.teams.find(t=>t.공종===k)?.팀ID||'';
  function addSite(s){s.현장ID=s.현장ID||'S'+(db.sites.length+1);const used=db.sites.filter(x=>ACTIVE.includes(x.상태)).map(x=>x.색);s.색=s.색||LISTS.색.find(c=>!used.includes(c))||LISTS.색[0];s.상태=s.상태||'계약';
    db.procs.push(...LX.map((p,i)=>({현장ID:s.현장ID,순번:i+1,공정:p[0],담당팀:teamFor(p[2]),시작:'',끝:'',상태:'예정',메모:''})));db.sites.push(s);return s.현장ID;}
  function saveSched(id,rows){rows.forEach(r=>Object.assign(db.procs.find(p=>p.현장ID===id&&+p.순번===+r.순번),{시작:r.시작,끝:r.끝,상태:r.상태}));const ends=rows.filter(r=>r.끝&&r.상태!=='제외').map(r=>r.끝).sort();db.sites.find(x=>x.현장ID===id).준공예정=ends.pop()||'';}
  function applyStd(id,start){let d=pd(start);if(!isWork(d))d=nextWork(d);const rows=db.procs.filter(p=>p.현장ID===id).sort((a,b)=>a.순번-b.순번).map(p=>{if(p.상태==='제외'||p.상태==='완료')return {순번:p.순번,시작:p.시작,끝:p.끝,상태:p.상태};const dur=LX.find(x=>x[0]===p.공정)[1];const st=new Date(d),en=addWork(st,dur-1);d=nextWork(en);return {순번:p.순번,시작:ds(st),끝:ds(en),상태:'예정'};});saveSched(id,rows);}
  // 시드: 현장 3개
  addSite({고객명:'김○○',평형:'32평',주소:'세곡동 ○○아파트 101동',연락처:'010-0000-0000',계약금액:48000000,계약일:dayOff(-20),착공일:dayOff(-9),상태:'시공중'});
  addSite({고객명:'이○○',평형:'25평',주소:'정자동 ○○',계약금액:32000000,계약일:dayOff(-10),착공일:dayOff(-3),상태:'시공중'});
  addSite({고객명:'박○○',평형:'33평',주소:'기흥 ○○',계약금액:52000000,계약일:dayOff(-40),착공일:dayOff(-25),상태:'시공중'});
  addSite({고객명:'분당 상담',평형:'28평',주소:'분당 ○○',계약일:dayOff(14),상태:'상담'});
  applyStd('S3',db.sites.find(s=>s.현장ID==='S3').착공일); // 기흥: 거의 끝난 현장, 일정 전부 입력된 상태
  saveSched('S1',[{순번:1,시작:dayOff(-9),끝:dayOff(-9),상태:'완료'},{순번:2,시작:dayOff(-8),끝:dayOff(-7),상태:'완료'},{순번:3,시작:dayOff(-6),끝:dayOff(-5),상태:'완료'},{순번:4,시작:dayOff(-2),끝:dayOff(-2),상태:'완료'},{순번:5,시작:dayOff(-1),끝:dayOff(3),상태:'진행'}]); // 세곡동: 5공정까지만 날짜 있음
  saveSched('S2',[{순번:1,시작:dayOff(-3),끝:dayOff(-3),상태:'완료'},{순번:2,시작:dayOff(-2),끝:dayOff(1),상태:'진행'}]);
  db.procs.filter(p=>p.현장ID==='S3'&&p.끝<today).forEach(p=>p.상태='완료');
  let rid=1;const rec=(o)=>db.records.push(Object.assign({ID:'r'+(rid++),상세:'',사진:'',팀ID:'',공수:'',금액:'',공정:'',지급:''},o));
  rec({일시:dayOff(-1)+' 09:10',현장ID:'S1',유형:'투입',내용:'타일팀 박반장 2공수',팀ID:'T1',공수:2,금액:500000,공정:'타일(욕실·현관·주방)'});
  rec({일시:dayOff(-1)+' 09:40',현장ID:'S1',유형:'특이사항',내용:'욕실 타일 3박스 부족, 내일 추가 입고',상세:'원인: 실측 때 현관 면적 누락\n조치: LX 추가 발주, 입고 내일 오전\n추가 비용: 자재 96,000원 (고객 안내 완료)'});
  rec({일시:dayOff(-2)+' 17:30',현장ID:'S1',유형:'고객 대화',내용:'욕실 타일 색상 최종 확정',상세:'[김○○] 그레이 말고 베이지로 바꿔도 될까요?\n[최고집] 네 가능합니다, 자재는 내일 아침 바꿔서 들어갑니다\n[김○○] 감사합니다 그걸로 해주세요'});
  rec({일시:dayOff(-2)+' 14:00',현장ID:'S1',유형:'현장 점검',내용:'방수 ✓ 바닥 구배 ✓ 전기 배선 ✓ · 보류: 콘센트 위치'});
  rec({일시:dayOff(-3)+' 18:10',현장ID:'S1',유형:'공정 끝',내용:'목공(천장·벽체·몰딩) 완료',공정:'목공(천장·벽체·몰딩)'});
  rec({일시:dayOff(-2)+' 08:50',현장ID:'S2',유형:'투입',내용:'철거팀 최사장 1공수',팀ID:'T2',공수:1,금액:300000,공정:'철거',지급:'지급'});
  const sleep=()=>new Promise(r=>setTimeout(r,120));
  const procOf=(id,seq)=>db.procs.find(p=>p.현장ID===id&&+p.순번===+seq);
  return {
    getData:async()=>{await sleep();return JSON.parse(JSON.stringify({today,sites:db.sites,procs:db.procs,teams:db.teams,records:db.records,base:{procs:LX.map((p,i)=>({순번:i+1,공정:p[0],기본소요일:p[1],공종:p[2]})),lists:LISTS}}))},
    addSite:async s=>{await sleep();return addSite(s)},
    saveSchedule:async(id,rows)=>{saveSched(id,rows)},
    addProc:async(id,name,after)=>{const ps=db.procs.filter(p=>p.현장ID===id);const seq=after?+after+1:ps.reduce((m,p)=>Math.max(m,+p.순번),0)+1;ps.filter(p=>+p.순번>=seq).forEach(p=>p.순번=+p.순번+1);db.procs.push({현장ID:id,순번:seq,공정:name,담당팀:'',시작:'',끝:'',상태:'예정',메모:''});return seq},
    deleteProc:async(id,seq)=>{db.procs=db.procs.filter(p=>!(p.현장ID===id&&+p.순번===+seq))},
    applyStandardDates:async(id,st)=>{applyStd(id,st)},
    updateSite:async(id,p)=>{Object.assign(db.sites.find(s=>s.현장ID===id),p)},
    updateProc:async(id,seq,p)=>{Object.assign(procOf(id,seq),p)},
    shiftProc:async(id,seq,end,follow,start)=>{const r=simShift(id,seq,end,follow,start);r.procs.forEach(p=>Object.assign(procOf(id,p.순번),p));db.sites.find(s=>s.현장ID===id).준공예정=r.준공예정;return r},
    addRecord:async(r,photos)=>{await sleep();r.ID=r.ID||'r'+(rid++);r.일시=r.일시||today+' '+new Date().toTimeString().slice(0,5);
      if(photos?.length)r.사진=photos.map(p=>'data:image/jpeg;base64,'+p.b64).join('|');
      if(r.유형==='투입'&&!r.금액&&r.단가)r.금액=(+r.공수||0)*(+r.단가||0);
      if(r.유형==='공정 끝'&&r._seq)procOf(r.현장ID,r._seq).상태='완료';
      if((r.유형==='공정 시작'||r.유형==='날짜 변경')&&r._seq){const res=await MOCK.shiftProc(r.현장ID,r._seq,r._newEnd,r._follow!==false,r.일시.slice(0,10));procOf(r.현장ID,r._seq).상태='진행';r.내용=`${r.공정} ${md(r.일시)} ~ ${md(r._newEnd)}${res.moved?' · 뒤 공정 '+res.moved+'개 이동':''}${r.내용?' · '+r.내용:''}`;}
      delete r._seq;delete r._newEnd;delete r._follow;db.records.push(r);return r.ID},
    updateRecord:async(id,p)=>{Object.assign(db.records.find(r=>r.ID===id),p)},
    deleteRecord:async id=>{db.records=db.records.filter(r=>r.ID!==id)},
    addTeam:async t=>{t.팀ID='T'+(db.teams.length+1);db.teams.push(t);return t.팀ID},
    updateTeam:async(id,p)=>{Object.assign(db.teams.find(t=>t.팀ID===id),p)}
  };
})();

load();
