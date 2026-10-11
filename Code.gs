/**
 * 최고집 현장OS — Apps Script 백엔드
 * 설치: 최고집 계정 새 시트 → Apps Script 에 이 Code.gs 만 붙여넣기 → 웹앱 배포(실행 나·액세스 모든 사용자) → setupKey 실행 → 로그의 접속 링크를 폰에서 열기. 화면(index.html)은 깃허브 Pages
 *       → 배포 > 웹 앱 (실행: 나, 액세스: 나만) → URL을 폰 홈 화면에 추가
 * 시트가 DB. 자동 판단 없음 — 날짜·상태는 대표님이 바꾸고, 뒤 공정 밀기·주말 건너뛰기만 계산.
 */
var TZ = 'Asia/Seoul';
var SHEETS = {
  현장: ['현장ID', '고객명', '연락처', '주소', '평형', '계약금액', '계약일', '착공일', '준공예정', '상태', '색', '메모', '공개키'], // 공개키 = 고객 리포트 링크 토큰 (비우면 링크 꺼짐)
  공정: ['현장ID', '순번', '공정', '담당팀', '시작', '끝', '상태', '메모'],
  외주팀: ['팀ID', '팀명', '공종', '대표자', '연락처', '단가유형', '단가', '계좌', '메모'],
  기록: ['ID', '일시', '현장ID', '유형', '내용', '상세', '사진', '팀ID', '공수', '금액', '공정', '지급', '단가'],
  기준: ['순번', '공정', '기본소요일', '공종'],
  사업일정: ['ID', '제목', '반복', '월', '일', '날짜', '시작', '메모', '완료'], // 현장과 별개인 대표님 사업 일정. 반복=한번/매월/매년, 월은 '1,4,7,10'처럼 여러 달 가능, 완료=끝낸 회차(yyyymmdd,)
  할일: ['ID', '현장ID', '현장', '일자', '할일', '완료'] // 시트에 직접 적을 땐 현장(고객명)·일자·할일만. ID·현장ID는 앱이 채워 연결함
};
var LX_PROCESS = [
  ['실측·설계확정', 1, '설계'], ['철거', 2, '철거'], ['설비(배관·전기배선)', 2, '설비'], ['창호(샷시)', 1, '창호'],
  ['목공(천장·벽체·몰딩)', 3, '목공'], ['타일(욕실·현관·주방)', 3, '타일'], ['욕실 도기·수전', 1, '욕실'], ['도장', 2, '도장'],
  ['필름(문·몰딩)', 2, '필름'], ['바닥(마루·장판)', 2, '바닥'], ['도배', 2, '도배'], ['주방가구', 1, '주방'],
  ['붙박이장·중문·도어', 1, '가구'], ['조명·전기 마감', 1, '전기'], ['실리콘·준공청소', 1, '청소'], ['고객 검수·입주', 1, '검수']
];
var LISTS = {
  현장상태: ['상담', '계약', '시공중', '준공', 'AS', '취소'],
  점검항목: [], // 처음엔 비어 있음. 대표님이 앱에서 ＋로 추가한 목록은 스크립트 속성 CHK 에 저장
  색: ['#D9487A', '#4C8DF5', '#2FA86A', '#F2994A', '#9B51E0', '#1ABC9C']
};
var DATE_COLS = { 현장: ['계약일', '착공일', '준공예정'], 공정: ['시작', '끝'], 기록: ['일시'], 할일: ['일자'], 사업일정: ['날짜', '시작'] };
// 처음 한 번 넣는 기본 사업 일정 (12월 결산 법인 기준, 세무사 확인 후 지우거나 고치면 됨)
var BIZ_DEFAULT = [
  ['부가세 신고·납부', '매년', '1,4,7,10', 25, '분기마다. 소규모 법인은 4·10월에 고지서로 납부만 할 수 있음'],
  ['법인세 신고·납부', '매년', '3', 31, '12월 결산 기준'],
  ['법인 지방소득세 신고·납부', '매년', '4', 30, '12월 결산 기준 (위택스)'],
  ['법인세 중간예납', '매년', '8', 31, '12월 결산 기준'],
  ['원천세 신고·납부', '매월', '', 10, '급여·일당·3.3% 지급한 달의 다음 달. 반기납부 승인이면 1·7월'],
  ['4대보험 납부', '매월', '', 10, '직원이 있을 때']
];

var APP_URL = 'https://yeschoi8889-sudo.github.io/guswkdrhdtkrhksfl/'; // 화면(index.html)이 올라간 깃허브 주소

// 고객 리포트 페이지(r.html)에 보이는 회사 정보. 글자만 고치면 됨
var REPORT = { 회사: '최고집', 소개: 'LX 인테리어 · 최고집', 유튜브: 'https://www.youtube.com/@choegojib', 유튜브문구: '최고집 유튜브에서 인테리어 꿀팁 보기', 워터마크: '예스초이 - LX하우시스 (최고집)' };
var REPORT_TYPES = { '고객 보고': 1, '현장 점검': 1, '제품 선택': 1, '공정 시작': 1, '공정 끝': 1 }; // 고객에게 보이는 기록 종류. 특이사항·고객 대화·투입·할 일은 안 보임

// 웹앱 배포: 실행 = 나, 액세스 = 모든 사용자. 대신 접속 키(API_KEY)가 없으면 아무것도 돌려주지 않음.
// GET ?s=공개키 → 그 현장의 고객 리포트 데이터(JSON). 공개키는 현장별 무작위 12자, 앱에서 켜고 끔
function doGet(e) {
  var s = e && e.parameter && e.parameter.s;
  if (!s) return ContentService.createTextOutput('최고집 현장OS API');
  var out; try { out = report_(String(s)); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
/** 고객에게 보여도 되는 것만 추림: 이름·평형·착공·준공예정·공정(팀·메모 제외)·사진·제품 선택 내용. 연락처·금액·점검 메모·특이사항은 안 나감 */
function report_(token) {
  var site = rows_('현장').filter(function (o) { return o.공개키 && String(o.공개키) === token; })[0];
  if (!site) return { ok: false, error: '링크가 꺼져 있거나 잘못된 링크입니다' };
  var procs = rows_('공정').filter(function (o) { return o.현장ID === site.현장ID && o.상태 !== '제외'; })
    .sort(function (a, b) { return a.순번 - b.순번; }).map(function (o) { return { 순번: +o.순번, 공정: o.공정, 시작: o.시작 || '', 끝: o.끝 || '', 상태: o.상태 }; });
  var recs = rows_('기록').filter(function (o) { return o.현장ID === site.현장ID && REPORT_TYPES[o.유형]; }).map(function (o) {
    var media = String(o.사진 || '').split('|').filter(function (x) { return x && x.indexOf('data:') !== 0; }).map(function (x) {
      var id = mediaId_(x), v = String(x).indexOf('v:') === 0, tag = (String(x).split('~')[1] || '');
      return v ? { v: 1, tag: tag, src: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w800', href: 'https://drive.google.com/file/d/' + id + '/view' }
        : { tag: tag, src: 'https://lh3.googleusercontent.com/d/' + id + '=s1600' }; // 사진은 올릴 때 '링크 아는 사람' 공개라 바로 보임. 영상은 드라이브에서 재생
    });
    var cap = o.유형 === '고객 보고' ? String(o.상세 || '').split('|') : []; media.forEach(function (m, i) { m.cap = cap[i] || ''; }); // 고객 보고: 사진마다 찍은 이름(철거 전 모습 등)
    return { 일시: o.일시, 유형: o.유형, 공정: o.공정 || '', 내용: (o.유형 === '제품 선택' || o.유형 === '고객 보고') ? o.내용 : '', media: media };
  }).sort(function (a, b) { return a.일시 < b.일시 ? 1 : -1; });
  return { ok: true, today: dstr_(new Date()), brand: REPORT,
    site: { 고객명: site.고객명, 평형: site.평형, 착공일: site.착공일 || '', 준공예정: site.준공예정 || '', 상태: site.상태 }, procs: procs, recs: recs };
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!key || req.key !== key) throw new Error('unauthorized');
    var fn = API[req.fn]; if (!fn) throw new Error('no such function');
    var lock = LockService.getScriptLock();
    var nolock = req.fn === 'getData' || req.fn === 'videoChunk' || req.fn === 'videoStart'; // 영상 조각은 시트를 안 건드려서 다른 기록 저장을 막지 않음
    if (!nolock) lock.waitLock(30000); // 쓰기는 한 번에 하나씩 (기기 두 대 동시 전송 대비)
    try { out = { ok: true, data: fn.apply(null, req.args || []) }; } finally { if (!nolock) lock.releaseLock(); }
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

var EXEC_URL = 'https://script.google.com/macros/s/AKfycbw9Q4257TIOLBqGPeNHGViaDsAH9s_WFgL5yxJq_OMHoCHamzS9Be5nIudzY24tyWwPEg/exec'; // 배포 후 '웹 앱 URL'(…/exec 로 끝남)을 여기에 붙여넣고 setupKey 를 다시 실행. 편집기에서는 구글이 /dev 주소만 알려줘서 직접 적어야 함

/** 접속 키 만들고 로그에 찍음. 배포 후 1회 실행. 키가 샜으면 resetKey 실행 후 새 링크로 다시 연결 */
function setupKey() {
  setup();
  var p = PropertiesService.getScriptProperties(), key = p.getProperty('API_KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); p.setProperty('API_KEY', key); }
  var url = EXEC_URL || ScriptApp.getService().getUrl();
  if (!/\/exec$/.test(url)) {
    Logger.log('⚠ 서버 주소가 /exec 가 아닙니다 (' + url + ').\n배포 화면의 "웹 앱 URL" 을 위쪽 EXEC_URL 에 붙여넣고 setupKey 를 다시 실행하세요.\n\n접속 키(참고): ' + key);
    return;
  }
  Logger.log('접속 링크 (폰에서 이 링크를 열기. 남에게 보내지 말 것):\n' + APP_URL + '?api=' + encodeURIComponent(url) + '&k=' + key + '\n\n접속 키: ' + key + '\n서버 주소: ' + url);
}
function resetKey() { PropertiesService.getScriptProperties().deleteProperty('API_KEY'); setupKey(); }

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (n) {
    var sh = ss.getSheetByName(n) || ss.insertSheet(n), h = SHEETS[n];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#F3E5F5');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  var base = ss.getSheetByName('기준');
  if (base.getLastRow() < 2) base.getRange(2, 1, LX_PROCESS.length, 4).setValues(LX_PROCESS.map(function (p, i) { return [i + 1, p[0], p[1], p[2]]; }));
  var col = 6;
  Object.keys(LISTS).forEach(function (k) {
    base.getRange(1, col).setValue(k).setFontWeight('bold');
    base.getRange(2, col, LISTS[k].length, 1).setValues(LISTS[k].map(function (v) { return [v]; }));
    col++;
  });
  ss.getSheetByName('기록').getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
  ss.getSheetByName('공정').getRange('E:F').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName('현장').getRange('G:I').setNumberFormat('yyyy-mm-dd');
  ss.getSheetByName('현장').getRange('M:M').setNumberFormat('@'); // 공개키는 글자로 (숫자·지수로 바뀌면 링크가 안 맞음)
  ss.getSheetByName('할일').getRange('D:D').setNumberFormat('yyyy-mm-dd');
  var bz = ss.getSheetByName('사업일정'); bz.getRange('F:G').setNumberFormat('yyyy-mm-dd'); bz.getRange('D:D').setNumberFormat('@');
  if (bz.getLastRow() < 2) { var today = dstr_(new Date()); appendMany_('사업일정', BIZ_DEFAULT.map(function (b, i) { return { ID: 'B' + (i + 1), 제목: b[0], 반복: b[1], 월: b[2], 일: b[3], 날짜: '', 시작: today, 메모: b[4], 완료: '' }; })); }
}

// ---------- 시트 I/O ----------
function sh_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function fmt_(v, dt) { return (v instanceof Date) ? Utilities.formatDate(v, TZ, dt ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') : v; }
function toDate_(s) { if (!s) return ''; if (s instanceof Date) return s; var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : s; }
function rows_(n) {
  var sh = sh_(n), h = SHEETS[n], last = sh.getLastRow();
  if (last < 2) return [];
  var dc = DATE_COLS[n] || [];
  return sh.getRange(2, 1, last - 1, h.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = dc.indexOf(k) >= 0 ? fmt_(r[j], n === '기록') : r[j]; });
    return o;
  }).filter(function (o) { return o[n === '할일' ? '할일' : h[0]] !== ''; }); // 할일은 ID 없이 직접 적은 줄도 읽음
}
function toRow_(n, o) { var dc = DATE_COLS[n] || []; return SHEETS[n].map(function (k) { var v = o[k] === undefined || o[k] === null ? '' : o[k]; return dc.indexOf(k) >= 0 ? toDate_(v) : v; }); }
function append_(n, o) { sh_(n).appendRow(toRow_(n, o)); return o; }
function appendMany_(n, list) { if (!list.length) return; var sh = sh_(n); sh.getRange(sh.getLastRow() + 1, 1, list.length, SHEETS[n].length).setValues(list.map(function (o) { return toRow_(n, o); })); }
function patch_(n, match, p) {
  var h = SHEETS[n], dc = DATE_COLS[n] || [];
  rows_(n).filter(match).forEach(function (o) {
    Object.keys(p).forEach(function (k) {
      var c = h.indexOf(k); if (c < 0) return;
      sh_(n).getRange(o._row, c + 1).setValue(dc.indexOf(k) >= 0 ? toDate_(p[k]) : p[k]);
    });
  });
}
function remove_(n, match) { rows_(n).filter(match).reverse().forEach(function (o) { sh_(n).deleteRow(o._row); }); }

// ---------- 날짜 ----------
// ponytail: 주말만 제외. 공휴일은 기준 탭에 '공휴일' 목록 두고 여기서 같이 빼면 됨
function isWork_(d) { return d.getDay() % 6 !== 0; }
function addWork_(d, n) { d = new Date(d); while (n > 0) { d.setDate(d.getDate() + 1); if (isWork_(d)) n--; } return d; }
function nextWork_(d) { return addWork_(d, 1); }
function workdays_(a, b) { a = new Date(a); b = new Date(b); var n = 0; for (var d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (isWork_(d)) n++; return Math.max(n, 1); }
function dstr_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }

// ---------- API ----------
function getData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (Object.keys(SHEETS).some(function (n) { return !ss.getSheetByName(n); }) || sh_('현장').getLastColumn() < SHEETS.현장.length) setup(); // 탭 없거나 열(공개키)이 없으면 자동 초기화
  return JSON.stringify({ // 문자열로 넘김 — 객체 직렬화 문제(Date 등)로 조용히 멈추는 것 방지
    today: dstr_(new Date()),
    sites: rows_('현장'), procs: rows_('공정'), teams: rows_('외주팀'), records: rows_('기록'), todos: todos_(), biz: rows_('사업일정').map(function (o) { delete o._row; o.월 = String(o.월); return o; }),
    base: { procs: rows_('기준'), lists: Object.assign({}, LISTS, { 점검항목: checks_() }) }
  });
}

// 할 일: 현장ID로 연결. 앱에서 적거나 시트 '할일' 탭에 직접 적음(현장=고객명). 읽을 때마다 ID·현장ID·현장 이름을 맞춰 줌
function todos_() {
  var sites = rows_('현장'), sh = sh_('할일');
  return rows_('할일').map(function (o) {
    var s = sites.filter(function (x) { return o.현장ID ? x.현장ID === o.현장ID : x.고객명 === o.현장; })[0] || sites.filter(function (x) { return x.고객명 === o.현장; })[0];
    if (!o.ID) { o.ID = 'D' + Date.now() + '-' + o._row; sh.getRange(o._row, 1).setValue(o.ID); }
    if (s && (o.현장ID !== s.현장ID || o.현장 !== s.고객명)) sh.getRange(o._row, 2, 1, 2).setValues([[s.현장ID, s.고객명]]);
    return { ID: o.ID, 현장ID: s ? s.현장ID : '', 현장: s ? s.고객명 : o.현장, 일자: o.일자, 할일: o.할일, 완료: o.완료 };
  });
}
// 완료 체크 = 그 현장 기록에 자동 남김 (ID 'rt-할일ID', 체크 풀면 기록도 사라짐)
function todoRec_(t, when) {
  var rid = 'rt-' + t.ID, has = rows_('기록').some(function (o) { return o.ID === rid; });
  if (t.완료) {
    if (!has) append_('기록', { ID: rid, 일시: when || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'), 현장ID: t.현장ID, 유형: '할 일', 내용: '✓ ' + t.할일 });
    else patch_('기록', function (o) { return o.ID === rid; }, { 현장ID: t.현장ID, 내용: '✓ ' + t.할일 });
  } else if (has) remove_('기록', function (o) { return o.ID === rid; });
}
function addTodo(t) {
  t.ID = t.ID || ('D' + Date.now());
  if (rows_('할일').some(function (o) { return o.ID === t.ID; })) return t.ID;
  var s = rows_('현장').filter(function (x) { return x.현장ID === t.현장ID; })[0];
  if (!s) throw new Error('현장이 없는 할 일');
  t.현장 = s.고객명; append_('할일', t); if (t.완료) todoRec_(t); return t.ID;
}
function updateTodo(id, p) {
  var when = p._t; delete p._t;
  if (p.현장ID) { var s = rows_('현장').filter(function (x) { return x.현장ID === p.현장ID; })[0]; if (s) p.현장 = s.고객명; }
  patch_('할일', function (o) { return o.ID === id; }, p);
  var t = todos_().filter(function (o) { return o.ID === id; })[0];
  if (t && t.현장ID) todoRec_(t, when);
}
function deleteTodo(id) { remove_('할일', function (o) { return o.ID === id; }); remove_('기록', function (o) { return o.ID === 'rt-' + id; }); }

function checks_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CHK') || '[]'); } catch (e) { return []; } }
function setChecks(list) { PropertiesService.getScriptProperties().setProperty('CHK', JSON.stringify((list || []).map(String).filter(Boolean))); }

function addBiz(b) { b.ID = b.ID || ('B' + Date.now()); if (rows_('사업일정').some(function (o) { return o.ID === b.ID; })) return b.ID; append_('사업일정', b); return b.ID; }
function updateBiz(id, p) { patch_('사업일정', function (o) { return o.ID === id; }, p); }
function deleteBiz(id) { remove_('사업일정', function (o) { return o.ID === id; }); }

function addSite(s) {
  if (s._replace) { remove_('현장', function (o) { return o.현장ID === s.현장ID; }); delete s._replace; } // 착공일 뒤늦게 넣을 때
  var sites = rows_('현장');
  s.현장ID = s.현장ID || ('S' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + (sites.length + 1));
  if (sites.some(function (x) { return x.현장ID === s.현장ID; })) { updateSite(s.현장ID, s); return s.현장ID; } // 재전송 → 갱신만
  var used = sites.filter(function (x) { return ['준공', '취소'].indexOf(x.상태) < 0; }).map(function (x) { return x.색; });
  s.색 = s.색 || LISTS.색.filter(function (c) { return used.indexOf(c) < 0; })[0] || LISTS.색[sites.length % LISTS.색.length];
  s.상태 = s.상태 || '계약';
  // 공정은 순서만 깔고 날짜는 비움 — 대표님이 '일정 잡기'에서 직접 정함
  var procs = LX_PROCESS.map(function (p, i) { return { 현장ID: s.현장ID, 순번: i + 1, 공정: p[0], 담당팀: '', 시작: '', 끝: '', 상태: '예정', 메모: '' }; });
  append_('현장', s);
  appendMany_('공정', procs);
  return s.현장ID;
}
function deleteSite(id) { ['기록', '할일', '공정', '현장'].forEach(function (n) { remove_(n, function (o) { return o.현장ID === id; }); }); } // 드라이브 사진·영상은 남김
function updateSite(id, p) { patch_('현장', function (o) { return o.현장ID === id; }, p); }

/** 일정 잡기 저장. rows=[{순번,시작,끝,상태}] — 상태 '제외'면 달력·진척에서 빠짐 */
function saveSchedule(siteId, rows) {
  rows.forEach(function (r) { updateProc(siteId, r.순번, { 시작: r.시작 || '', 끝: r.끝 || '', 상태: r.상태 || '예정' }); });
  var ends = rows.filter(function (r) { return r.끝 && r.상태 !== '제외'; }).map(function (r) { return r.끝; }).sort();
  updateSite(siteId, { 준공예정: ends.length ? ends[ends.length - 1] : '' });
}
/** 선택 기능: 착공일부터 LX 기본 소요일로 초안 채우기 (제외·완료 공정은 건너뜀). 이후 대표님이 수정 */
function applyStandardDates(siteId, startDate) {
  var d = toDate_(startDate); if (!isWork_(d)) d = nextWork_(d);
  var base = rows_('기준'), rows = [];
  rows_('공정').filter(function (o) { return o.현장ID === siteId; }).sort(function (a, b) { return a.순번 - b.순번; }).forEach(function (o) {
    if (o.상태 === '제외' || o.상태 === '완료') { rows.push({ 순번: o.순번, 시작: o.시작, 끝: o.끝, 상태: o.상태 }); return; }
    var dur = (base.filter(function (b) { return b.공정 === o.공정; })[0] || {}).기본소요일 || 1;
    var st = new Date(d), en = addWork_(st, dur - 1);
    rows.push({ 순번: o.순번, 시작: dstr_(st), 끝: dstr_(en), 상태: '예정' });
    d = nextWork_(en);
  });
  saveSchedule(siteId, rows);
}

/** 공정 추가: afterSeq 뒤에 끼움(없으면 맨 끝). 뒤 공정 순번 +1 */
function addProc(siteId, name, afterSeq, extra) { // extra: {담당팀, 시작, 끝} — 공정이 같은 기간에 겹쳐도 됨
  var ps = rows_('공정').filter(function (o) { return o.현장ID === siteId; });
  var max = ps.reduce(function (m, o) { return Math.max(m, +o.순번); }, 0);
  var seq = afterSeq ? +afterSeq + 1 : max + 1;
  var x = extra || {}, st = x.시작 || '', en = st ? (x.끝 || st) : '';
  var dup = ps.filter(function (o) { return o.공정 === name && (o.담당팀 || '') === (x.담당팀 || '') && (o.시작 || '') === st && (o.끝 || '') === en; })[0];
  if (dup) return +dup.순번; // 같은 공정(이름·팀·날짜)이 이미 있음 → 재전송으로 보고 무시
  ps.filter(function (o) { return +o.순번 >= seq; }).sort(function (a, b) { return b.순번 - a.순번; })
    .forEach(function (o) { sh_('공정').getRange(o._row, 2).setValue(+o.순번 + 1); });
  var row = { 현장ID: siteId, 순번: seq, 공정: name, 담당팀: '', 시작: '', 끝: '', 상태: '예정', 메모: '' };
  if (extra) { if (extra.담당팀) row.담당팀 = extra.담당팀; if (extra.시작) { row.시작 = extra.시작; row.끝 = extra.끝 || extra.시작; } }
  append_('공정', row);
  if (row.끝) { var site = rows_('현장').filter(function (s) { return s.현장ID === siteId; })[0]; if (site && (!site.준공예정 || site.준공예정 < row.끝)) patch_('현장', function (o) { return o.현장ID === siteId; }, { 준공예정: row.끝 }); }
  return seq;
}
function deleteProc(siteId, seq) { remove_('공정', function (o) { return o.현장ID === siteId && +o.순번 === +seq; }); }

function updateProc(siteId, seq, p) { patch_('공정', function (o) { return o.현장ID === siteId && +o.순번 === +seq; }, p); }

/** 끝 날짜 변경. follow=true면 뒤 공정을 같은 길이로 이어 붙이고 현장 준공예정도 갱신 */
function shiftWork_(d, n) { d = new Date(d); var sg = n < 0 ? -1 : 1; n = Math.abs(n); while (n > 0) { d.setDate(d.getDate() + sg); if (isWork_(d)) n--; } return d; }
// 끝 날짜를 바꾸면, 원래 끝보다 뒤에 시작하는 공정을 바뀐 근무일 수만큼 평행 이동 (겹쳐 둔 공정·간격은 그대로)
function shiftProc(siteId, seq, newEnd, follow, newStart) {
  var ps = rows_('공정').filter(function (o) { return o.현장ID === siteId; });
  var t = ps.filter(function (o) { return +o.순번 === +seq; })[0]; if (!t) throw new Error('공정 없음');
  var oldEnd = t.끝, end = toDate_(newEnd), start = toDate_(newStart || t.시작 || newEnd);
  if (end < start) start = end;
  updateProc(siteId, seq, { 시작: dstr_(start), 끝: dstr_(end) });
  var moved = 0;
  if (follow && oldEnd) {
    var oe = toDate_(oldEnd), delta = end > oe ? workdays_(shiftWork_(oe, 1), end) : end < oe ? -workdays_(shiftWork_(end, 1), oe) : 0;
    if (delta) ps.filter(function (o) { return +o.순번 !== +seq && o.상태 !== '완료' && o.상태 !== '제외' && o.시작 && o.끝 && o.시작 > oldEnd; }).forEach(function (o) {
      updateProc(siteId, o.순번, { 시작: dstr_(shiftWork_(toDate_(o.시작), delta)), 끝: dstr_(shiftWork_(toDate_(o.끝), delta)) }); moved++;
    });
  }
  var lastEnd = rows_('공정').filter(function (o) { return o.현장ID === siteId && o.끝 && o.상태 !== '제외'; }).map(function (o) { return o.끝; }).sort().pop() || '';
  updateSite(siteId, { 준공예정: lastEnd });
  return { oldEnd: oldEnd, newEnd: dstr_(end), moved: moved, 준공예정: lastEnd };
}

/** 기록 저장. photos = [{name, b64}] → 드라이브 현장OS/<현장>/<날짜>/ */
function addRecord(r, photos) {
  r.ID = r.ID || Utilities.getUuid().slice(0, 8);
  if (rows_('기록').some(function (x) { return x.ID === r.ID; })) return r.ID; // 재전송 → 무시
  r.일시 = r.일시 || Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var site = rows_('현장').filter(function (s) { return s.현장ID === r.현장ID; })[0];
  if (photos && photos.length) {
    var f = folder_(['현장OS', (site ? site.현장ID + '_' + site.고객명 : r.현장ID), r.일시.slice(0, 10)]);
    r.사진 = photos.map(function (p) {
      var file = f.createFile(Utilities.newBlob(Utilities.base64Decode(p.b64), 'image/jpeg', p.name || 'photo.jpg'));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // 폰 사파리에서 썸네일 보이게. 링크 아는 사람만
      return file.getId();
    }).concat(r.사진 ? String(r.사진).split('|') : []).join('|'); // 구분자 | (data URL 의 , 와 충돌 방지)
  }
  if (r.유형 === '투입' && !r.금액 && r.단가) r.금액 = (+r.공수 || 0) * (+r.단가 || 0);
  if (r.유형 === '공정 끝' && r.공정) { // 끝난 날 = 실제 끝 (늦으면 follow 일 때 뒤 공정 이동, 일찍 끝나면 날짜만 당김)
    if (r._newEnd) { var cur = rows_('공정').filter(function (o) { return o.현장ID === r.현장ID && +o.순번 === +r._seq; })[0]; if (cur && cur.끝 !== r._newEnd) shiftProc(r.현장ID, r._seq, r._newEnd, r._follow === true && r._newEnd > cur.끝); }
    updateProc(r.현장ID, r._seq, { 상태: '완료' });
  }
  if (r.유형 === '공정 연장' && r._seq && r._newEnd) {
    var rs = shiftProc(r.현장ID, r._seq, r._newEnd, r._follow !== false);
    r.내용 = String(r.공정).split('(')[0] + ' 끝 ' + rs.newEnd.slice(5).replace('-', '/') + '로 연장' + (rs.moved ? ' · 뒤 공정 ' + rs.moved + '개 이동' : '');
  }
  if ((r.유형 === '공정 시작' || r.유형 === '날짜 변경') && r._seq && r._newEnd) { // 시작 = 기록한 날, 끝 = 고른 날, 상태 진행
    var res = shiftProc(r.현장ID, r._seq, r._newEnd, r._follow !== false, r.일시.slice(0, 10));
    updateProc(r.현장ID, r._seq, { 상태: '진행' });
    r.내용 = r.공정 + ' ' + r.일시.slice(5, 10).replace('-', '/') + ' ~ ' + res.newEnd.slice(5).replace('-', '/') + (res.moved ? ' · 뒤 공정 ' + res.moved + '개 이동' : '') + (r.내용 ? ' · ' + r.내용 : '');
  }
  delete r._seq; delete r._newEnd; delete r._follow;
  append_('기록', r);
  return r.ID;
}
/** 사진 1장 원본 업로드 → 드라이브 현장OS/<현장>/<날짜>/, 기록 행 사진 열에 ID 추가. 같은 요청이 다시 와도(재전송) 파일 이름으로 찾아 재사용 */
function addPhoto(recordId, p) {
  var rec = rows_('기록').filter(function (x) { return x.ID === recordId; })[0];
  var site = rec && rows_('현장').filter(function (s) { return s.현장ID === rec.현장ID; })[0];
  var day = rec ? String(rec.일시).slice(0, 10) : dstr_(new Date());
  var f = folder_(['현장OS', site ? site.현장ID + '_' + site.고객명 : '기타', day]);
  var mime = p.mime || 'image/jpeg', ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  var name = (rec ? String(rec.일시).replace(/[^0-9]/g, '').slice(0, 12) + '_' + rec.유형 : day) + '_' + recordId + '_' + (p.idx || 1) + '.' + ext;
  var it = f.getFilesByName(name), file = it.hasNext() ? it.next() : f.createFile(Utilities.newBlob(Utilities.base64Decode(p.b64), mime, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var id = file.getId();
  if (rec && String(rec.사진 || '').indexOf(id) < 0) patch_('기록', function (o) { return o.ID === recordId; }, { 사진: (rec.사진 ? rec.사진 + '|' : '') + id + (p.tag ? '~' + p.tag : '') }); // tag: 고객 보고 실측=비포, 검수=애프터
  return id;
}
// ---------- 영상: 폰 → (3MB 조각) → 서버 → 드라이브 이어올리기 ----------
function videoStart(recordId, p) {
  var rec = rows_('기록').filter(function (o) { return o.ID === recordId; })[0];
  if (!rec) throw new Error('기록이 아직 서버에 없음');
  var site = rows_('현장').filter(function (s) { return s.현장ID === rec.현장ID; })[0];
  var f = folder_(['현장OS', (site ? site.현장ID + '_' + site.고객명 : rec.현장ID), String(rec.일시).slice(0, 10)]);
  var ext = (String(p.name || '').match(/\.[A-Za-z0-9]+$/) || ['.mp4'])[0].toLowerCase();
  var name = String(rec.일시).replace(/\D/g, '').slice(0, 12) + '_영상_' + recordId + '_' + p.idx + ext;
  var it = f.getFilesByName(name);
  if (it.hasNext()) return { exists: true, fileId: it.next().getId() }; // 이미 올라간 파일(재시도)
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post', contentType: 'application/json; charset=UTF-8',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': p.mime || 'video/mp4', 'X-Upload-Content-Length': String(p.size) },
    payload: JSON.stringify({ name: name, parents: [f.getId()] }), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('영상 올리기 준비 실패 ' + res.getResponseCode() + ' ' + String(res.getContentText()).slice(0, 120));
  var h = res.getHeaders();
  return { url: h['Location'] || h['location'] };
}
function videoChunk(url, offset, total, b64) {
  var bytes = Utilities.base64Decode(b64);
  var res = UrlFetchApp.fetch(url, {
    method: 'put', contentType: 'application/octet-stream', followRedirects: false, muteHttpExceptions: true,
    headers: { 'Content-Range': 'bytes ' + offset + '-' + (offset + bytes.length - 1) + '/' + total }, payload: bytes
  });
  var c = res.getResponseCode();
  if (c === 200 || c === 201) return { done: true, fileId: JSON.parse(res.getContentText()).id };
  if (c === 308) { var h = res.getHeaders(), r = h['Range'] || h['range']; return { done: false, next: r ? parseInt(String(r).split('-')[1], 10) + 1 : 0 }; }
  throw new Error('영상 올리기 실패 ' + c);
}
function videoDone(recordId, fileId) { // 기록의 사진 칸에 'v:파일ID' 로 연결 (재전송해도 한 번만)
  DriveApp.getFileById(fileId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var rec = rows_('기록').filter(function (o) { return o.ID === recordId; })[0]; if (!rec) return;
  var ids = rec.사진 ? String(rec.사진).split('|').filter(Boolean) : [], tag = 'v:' + fileId;
  if (ids.map(mediaId_).indexOf(fileId) < 0) { ids.push(tag); patch_('기록', function (o) { return o.ID === recordId; }, { 사진: ids.join('|') }); }
}

// ---- 사진·영상 관리: 사진 칸 항목 = 파일ID · v:영상ID, 뒤에 ~비포/~애프터 ----
function mediaId_(x) { var r = String(x).split('~')[0]; return r.indexOf('v:') === 0 ? r.slice(2) : r; }
function deleteMedia(recordId, id) { // 기록에서 빼고 드라이브 휴지통으로 (30일 안 복원 가능)
  var rec = rows_('기록').filter(function (o) { return o.ID === recordId; })[0];
  if (rec) patch_('기록', function (o) { return o.ID === recordId; }, { 사진: String(rec.사진 || '').split('|').filter(function (x) { return x && mediaId_(x) !== id; }).join('|') });
  if (id && id.indexOf('data:') !== 0) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} } // 이미 지워졌으면 무시
}
function tagMedia(recordId, id, tag) {
  var rec = rows_('기록').filter(function (o) { return o.ID === recordId; })[0]; if (!rec) return;
  var a = String(rec.사진 || '').split('|').filter(Boolean).map(function (x) { return mediaId_(x) !== id ? x : String(x).split('~')[0] + (tag ? '~' + tag : ''); });
  patch_('기록', function (o) { return o.ID === recordId; }, { 사진: a.join('|') });
}
function siteFolder(siteId) { var s = rows_('현장').filter(function (o) { return o.현장ID === siteId; })[0]; return folder_(['현장OS', s ? s.현장ID + '_' + s.고객명 : siteId]).getUrl(); }

function updateRecord(id, p) { patch_('기록', function (o) { return o.ID === id; }, p); }
function deleteRecord(id) { remove_('기록', function (o) { return o.ID === id; }); }

function addTeam(t) { t.팀ID = t.팀ID || ('T' + (rows_('외주팀').length + 1)); if (rows_('외주팀').some(function (x) { return x.팀ID === t.팀ID; })) { updateTeam(t.팀ID, t); return t.팀ID; } append_('외주팀', t); return t.팀ID; }
function updateTeam(id, p) { patch_('외주팀', function (o) { return o.팀ID === id; }, p); }

function folder_(path) {
  var f = DriveApp.getRootFolder();
  path.forEach(function (n) { var it = f.getFoldersByName(n); f = it.hasNext() ? it.next() : f.createFolder(n); });
  return f;
}

var API = { getData: getData, addSite: addSite, updateSite: updateSite, deleteSite: deleteSite, updateProc: updateProc, shiftProc: shiftProc, saveSchedule: saveSchedule,
  addProc: addProc, deleteProc: deleteProc, addRecord: addRecord, addPhoto: addPhoto, updateRecord: updateRecord, deleteRecord: deleteRecord, addTeam: addTeam, updateTeam: updateTeam, addTodo: addTodo, updateTodo: updateTodo, deleteTodo: deleteTodo, videoStart: videoStart, videoChunk: videoChunk, videoDone: videoDone, addBiz: addBiz, updateBiz: updateBiz, deleteBiz: deleteBiz, setChecks: setChecks, deleteMedia: deleteMedia, tagMedia: tagMedia, siteFolder: siteFolder };
