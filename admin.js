/* ── 설정 ────────────────────────────────────────────── */
const API_BASE  = window.location.origin;
const ADMIN_KEY = 'admin_auth';
const ADMIN_PW  = 'admin1234'; // 변경하려면 이 값을 수정하세요

/* ── 인증 ────────────────────────────────────────────── */
function checkLogin() {
  if (sessionStorage.getItem(ADMIN_KEY) === '1') {
    showMain();
  } else {
    document.getElementById('login-gate').style.display = 'flex';
  }
}

function doLogin() {
  const pw = document.getElementById('pw-input').value;
  const err = document.getElementById('login-error');
  if (pw === ADMIN_PW) {
    sessionStorage.setItem(ADMIN_KEY, '1');
    err.textContent = '';
    showMain();
  } else {
    err.textContent = '비밀번호가 틀렸습니다.';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
  }
}

function doLogout() {
  sessionStorage.removeItem(ADMIN_KEY);
  location.reload();
}

function showMain() {
  document.getElementById('login-gate').style.display = 'none';
  document.getElementById('main-layout').style.display = 'flex';
  loadDashboard();
}

/* ── 유틸 ────────────────────────────────────────────── */
async function apiFetch(url, options = {}) {
  try {
    const r    = await fetch(API_BASE + url, options);
    const text = await r.text();
    if (!text.trim()) throw new Error('빈 응답');
    return JSON.parse(text);
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('서버에 연결할 수 없습니다.');
    }
    throw e;
  }
}

function toast(msg, type = 'inf') {
  const wrap = document.getElementById('toast-wrap');
  const el   = document.createElement('div');
  el.className  = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ── 네비게이션 ──────────────────────────────────────── */
function nav(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  document.querySelector(`.nav-item[data-nav="${id}"]`).classList.add('active');

  if (id === 'dashboard') loadDashboard();
  if (id === 'words')     { wmOffset = 0; wmLoad(); }
  if (id === 'questions') { qmOffset = 0; qmLoad(); }
  if (id === 'janitor')   janitorHealth();
  if (id === 'airev')     { loadAiReport(); loadAiFlags('words'); }
}

/* ── 대시보드 ────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const [stats, health, aiRep] = await Promise.all([
      apiFetch('/api/stats'),
      apiFetch('/api/janitor/health'),
      apiFetch('/api/ai-review/report'),
    ]);
    document.getElementById('server-status').textContent = '🟢 온라인';

    document.getElementById('dash-words').textContent            = stats.words;
    document.getElementById('dash-words-pending').textContent    = stats.words_pending;
    document.getElementById('dash-questions').textContent        = stats.questions;
    document.getElementById('dash-questions-pending').textContent= stats.questions_pending;
    document.getElementById('dash-templates').textContent        = stats.templates;

    renderJanitorHealthCard(health, 'dash-janitor');
    renderAiReportCard(aiRep, 'dash-ai');
  } catch (e) {
    document.getElementById('server-status').textContent = '🔴 오프라인';
    toast(e.message, 'err');
  }
}

/* ── 재니터 헬스 렌더 ────────────────────────────────── */
function renderJanitorHealthCard(h, targetId) {
  const gradeClass = { A: 'grade-A', B: 'grade-B', C: 'grade-C', D: 'grade-D' }[h.grade] || 'grade-C';
  const wPct = h.words_total ? Math.round(h.words_verified / h.words_total * 100) : 0;
  const qPct = h.q_total     ? Math.round(h.q_verified     / h.q_total     * 100) : 0;

  const issues = [];
  if (h.dup_count)        issues.push({ cls: 'ib-bad',  text: `중복 단어 ${h.dup_count}개` });
  if (h.incomplete_count) issues.push({ cls: 'ib-warn', text: `미완성 단어 ${h.incomplete_count}개` });
  if (!issues.length)     issues.push({ cls: 'ib-ok',   text: '이슈 없음' });

  const html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <span class="grade-badge ${gradeClass}">${h.grade || '?'}</span>
      <div>
        <div style="font-size:13px;font-weight:700;">DB 건강 등급</div>
        <div style="font-size:11px;color:var(--gray-500);">단어 ${wPct}% 검수 · 문제 ${qPct}% 검수</div>
      </div>
    </div>
    <div class="issue-list">
      ${issues.map(i => `<div class="issue-item"><span class="issue-badge ${i.cls}">${i.cls === 'ib-ok' ? '✓' : '!'}</span><span>${i.text}</span></div>`).join('')}
    </div>`;
  document.getElementById(targetId).innerHTML = html;
}

/* ── AI 리포트 렌더 ──────────────────────────────────── */
function renderAiReportCard(r, targetId) {
  const w = r.words     || {};
  const q = r.questions || {};
  const avail = r.ai_available ? '<span style="color:var(--success);">AI 연결됨</span>' : '<span style="color:var(--warning);">AI 오프라인 (규칙 기반)</span>';
  const html = `
    <div style="font-size:12px;color:var(--gray-500);margin-bottom:10px;">${avail}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      <div style="background:var(--gray-50);border-radius:7px;padding:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px;">단어 스캔 (${w.scanned||0}개)</div>
        <div style="font-size:12px;">자동승인 <strong>${w.auto_approve||0}</strong> · 수동 <strong>${w.manual||0}</strong> · 플래그 <strong style="color:var(--danger);">${w.flag||0}</strong></div>
      </div>
      <div style="background:var(--gray-50);border-radius:7px;padding:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:6px;">문제 스캔 (${q.scanned||0}개)</div>
        <div style="font-size:12px;">자동승인 <strong>${q.auto_approve||0}</strong> · 수동 <strong>${q.manual||0}</strong> · 플래그 <strong style="color:var(--danger);">${q.flag||0}</strong></div>
      </div>
    </div>`;
  document.getElementById(targetId).innerHTML = html;
}

/* ── 단어 관리 ───────────────────────────────────────── */
let wmItems = [], wmOffset = 0, wmTotal = 0, wmHasMore = false;

const POS_LABEL = { noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사' };
const LEVELS    = ['중1','중2','중3','고1','고2','고3','수능','수능고급'];

async function wmLoad() {
  wmOffset = 0;
  await _wmFetch();
}

async function _wmFetch() {
  document.getElementById('wm-list').innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>불러오는 중...</p></div>';
  const level    = document.getElementById('wm-level').value;
  const pos      = document.getElementById('wm-pos').value;
  const verified = document.getElementById('wm-verified').value;
  const limit    = parseInt(document.getElementById('wm-limit').value) || 50;

  const p = new URLSearchParams({ limit, offset: wmOffset });
  if (level)           p.set('level', level);
  if (pos)             p.set('pos', pos);
  if (verified !== '') p.set('verified', verified);

  try {
    const d = await apiFetch(`/api/review/list/words?${p}`);
    wmItems   = d.items   || [];
    wmTotal   = d.total   ?? 0;
    wmHasMore = d.has_more ?? false;
    _renderWmList(wmItems);
    _updateWmPager(limit);

    const rep = await apiFetch('/api/review/report');
    const s   = rep.words || {};
    document.getElementById('wm-total').textContent    = wmTotal;
    document.getElementById('wm-pending').textContent  = s.pending  ?? '-';
    document.getElementById('wm-approved').textContent = s.approved ?? '-';
    _updateSelCount('wm-sel-count', '.wm-chk');
  } catch (e) { toast('단어 로드 실패: ' + e.message, 'err'); }
}

function _renderWmList(items) {
  const wrap = document.getElementById('wm-list');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty"><div class="e-icon">🎉</div><p>조건에 맞는 항목이 없습니다.</p></div>';
    return;
  }
  const rows = items.map(r => {
    const vi = r.verified ? '<span style="color:var(--success);font-size:11px;">완료</span>'
                          : '<span style="color:var(--warning);font-size:11px;">대기</span>';
    return `
    <tr data-id="${r.id}">
      <td><input type="checkbox" class="wm-chk" data-id="${r.id}" style="accent-color:var(--primary);" onchange="_updateSelCount('wm-sel-count','.wm-chk')"></td>
      <td><strong>${r.word}</strong></td>
      <td><span class="pos-badge">${POS_LABEL[r.pos] || r.pos || '-'}</span></td>
      <td><span class="lv-badge">${r.level || '-'}</span></td>
      <td style="font-size:13px;">${r.meaning_ko || ''}</td>
      <td style="font-size:11px;color:var(--gray-400);">${r.source_book || ''}</td>
      <td>${vi}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="openWmEdit('${r.id}','${r.pos||'noun'}','${r.level||'고1'}',\`${(r.meaning_ko||'').replace(/`/g,"'")}\`,'${r.category||''}')">편집</button></td>
    </tr>
    <tr id="wm-edit-${r.id}" style="display:none;">
      <td colspan="8">
        <div class="inline-edit">
          <div class="edit-fields">
            <div class="edit-field"><label>레벨</label>
              <select id="wef-lv-${r.id}">${LEVELS.map(l=>`<option>${l}</option>`).join('')}</select>
            </div>
            <div class="edit-field"><label>품사</label>
              <select id="wef-pos-${r.id}">
                <option value="noun">명사</option><option value="verb">동사</option>
                <option value="adjective">형용사</option><option value="adverb">부사</option>
              </select>
            </div>
            <div class="edit-field" style="flex:2;"><label>뜻 (한국어)</label>
              <input type="text" id="wef-mean-${r.id}" style="width:100%;">
            </div>
            <div class="edit-field"><label>카테고리</label>
              <select id="wef-cat-${r.id}">
                <option value="">-</option>
                <option>사람/직업</option><option>사물</option><option>장소</option>
                <option>행동</option><option>감정</option><option>추상개념</option>
                <option>음식</option><option>동물</option><option>자연</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn btn-primary btn-sm" onclick="saveWmEdit('${r.id}')">저장</button>
            <button class="btn btn-ghost btn-sm"   onclick="closeWmEdit('${r.id}')">취소</button>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          <th style="width:32px;"></th>
          <th>단어</th><th>품사</th><th>레벨</th><th>뜻</th><th>출처</th><th>상태</th><th style="width:54px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _updateWmPager(limit) {
  const pg   = document.getElementById('wm-pager');
  const info = document.getElementById('wm-page-info');
  const pageNum = Math.floor(wmOffset / limit) + 1;
  const total   = Math.ceil(wmTotal / limit);
  info.textContent = `${pageNum} / ${total} 페이지 (총 ${wmTotal}개)`;
  document.getElementById('wm-prev').disabled = wmOffset === 0;
  document.getElementById('wm-next').disabled = !wmHasMore;
  pg.style.display = wmTotal > limit ? 'flex' : 'none';
}

function wmPage(dir) {
  const limit = parseInt(document.getElementById('wm-limit').value) || 50;
  wmOffset = Math.max(0, wmOffset + dir * limit);
  _wmFetch();
}

function openWmEdit(id, pos, level, meaning, category) {
  const row = document.getElementById(`wm-edit-${id}`);
  if (row.style.display !== 'none') { closeWmEdit(id); return; }
  document.getElementById(`wef-lv-${id}`).value   = level;
  document.getElementById(`wef-pos-${id}`).value  = pos;
  document.getElementById(`wef-mean-${id}`).value = meaning;
  document.getElementById(`wef-cat-${id}`).value  = category;
  row.style.display = '';
}

function closeWmEdit(id) {
  const row = document.getElementById(`wm-edit-${id}`);
  if (row) row.style.display = 'none';
}

async function saveWmEdit(id) {
  const fields = {
    level:      document.getElementById(`wef-lv-${id}`).value,
    pos:        document.getElementById(`wef-pos-${id}`).value,
    meaning_ko: document.getElementById(`wef-mean-${id}`).value.trim(),
    category:   document.getElementById(`wef-cat-${id}`).value || null,
  };
  try {
    const d = await apiFetch(`/api/words/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (d.error) { toast(d.error, 'err'); return; }
    toast('저장 완료', 'ok');
    closeWmEdit(id);
    _wmFetch();
  } catch (e) { toast('저장 실패: ' + e.message, 'err'); }
}

function wmSelectAll(val) {
  document.querySelectorAll('.wm-chk').forEach(c => c.checked = val);
  _updateSelCount('wm-sel-count', '.wm-chk');
}

function _getChecked(selector) {
  return [...document.querySelectorAll(selector + ':checked')].map(c => c.dataset.id);
}

function _updateSelCount(countId, selector) {
  const n = document.querySelectorAll(selector + ':checked').length;
  document.getElementById(countId).textContent = `${n}개 선택`;
}

async function wmApprove() {
  const ids = _getChecked('.wm-chk');
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  const d = await apiFetch('/api/review/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'words', ids }),
  });
  toast(`${d.updated}개 승인 완료`, 'ok');
  _wmFetch();
}

async function wmReject() {
  const ids = _getChecked('.wm-chk');
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  if (!confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) return;
  const d = await apiFetch('/api/review/reject', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'words', ids }),
  });
  toast(`${d.deleted}개 삭제 완료`, 'err');
  _wmFetch();
}

async function wmBulkLevel() {
  const ids   = _getChecked('.wm-chk');
  const level = document.getElementById('wm-bulk-level').value;
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  if (!level)      { toast('레벨을 선택해주세요.', 'err'); return; }
  const d = await apiFetch('/api/review/bulk-level', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'words', ids, level }),
  });
  if (d.error) { toast(d.error, 'err'); return; }
  toast(`${d.updated}개 → ${level} 변경 완료`, 'ok');
  document.getElementById('wm-bulk-level').value = '';
  _wmFetch();
}

/* ── 문제 관리 ───────────────────────────────────────── */
let qmItems = [], qmOffset = 0, qmTotal = 0, qmHasMore = false;

async function qmLoad() {
  qmOffset = 0;
  await _qmFetch();
}

async function _qmFetch() {
  document.getElementById('qm-list').innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>불러오는 중...</p></div>';
  const level    = document.getElementById('qm-level').value;
  const verified = document.getElementById('qm-verified').value;
  const limit    = parseInt(document.getElementById('qm-limit').value) || 50;

  const p = new URLSearchParams({ limit, offset: qmOffset });
  if (level)           p.set('level', level);
  if (verified !== '') p.set('verified', verified);

  try {
    const d = await apiFetch(`/api/review/list/questions?${p}`);
    qmItems   = d.items   || [];
    qmTotal   = d.total   ?? 0;
    qmHasMore = d.has_more ?? false;
    _renderQmList(qmItems);
    _updateQmPager(limit);

    const rep = await apiFetch('/api/review/report');
    const s   = rep.questions || {};
    document.getElementById('qm-total').textContent    = qmTotal;
    document.getElementById('qm-pending').textContent  = s.pending  ?? '-';
    document.getElementById('qm-approved').textContent = s.approved ?? '-';
    _updateSelCount('qm-sel-count', '.qm-chk');
  } catch (e) { toast('문제 로드 실패: ' + e.message, 'err'); }
}

function _renderQmList(items) {
  const wrap = document.getElementById('qm-list');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty"><div class="e-icon">🎉</div><p>조건에 맞는 항목이 없습니다.</p></div>';
    return;
  }
  const rows = items.map(r => {
    const sc = r.quality_score ?? 0;
    const scClass = sc <= 5 ? 's-urgent' : sc <= 7 ? 's-normal' : 's-good';
    const choices = (() => {
      try { return (JSON.parse(r.choices || '[]')).join(' / '); } catch { return r.choices || ''; }
    })();
    return `<tr data-id="${r.id}">
      <td><input type="checkbox" class="qm-chk" data-id="${r.id}" style="accent-color:var(--primary);" onchange="_updateSelCount('qm-sel-count','.qm-chk')"></td>
      <td><span class="q-badge fib">${r.q_type || ''}</span></td>
      <td><span class="lv-badge">${r.level || ''}</span></td>
      <td style="max-width:320px;font-size:13px;">${r.stem}</td>
      <td style="font-size:12px;color:var(--gray-500);">${choices}</td>
      <td style="font-size:13px;font-weight:600;">${r.answer || ''}</td>
      <td><span class="score-badge ${scClass}">${sc}점</span></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="rtable">
        <thead><tr>
          <th style="width:32px;"></th>
          <th>유형</th><th>레벨</th><th style="min-width:260px;">문제</th>
          <th>선택지</th><th>정답</th><th>점수</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _updateQmPager(limit) {
  const pg   = document.getElementById('qm-pager');
  const info = document.getElementById('qm-page-info');
  const pageNum = Math.floor(qmOffset / limit) + 1;
  const total   = Math.ceil(qmTotal / limit);
  info.textContent = `${pageNum} / ${total} 페이지 (총 ${qmTotal}개)`;
  document.getElementById('qm-prev').disabled = qmOffset === 0;
  document.getElementById('qm-next').disabled = !qmHasMore;
  pg.style.display = qmTotal > limit ? 'flex' : 'none';
}

function qmPage(dir) {
  const limit = parseInt(document.getElementById('qm-limit').value) || 50;
  qmOffset = Math.max(0, qmOffset + dir * limit);
  _qmFetch();
}

function qmSelectAll(val) {
  document.querySelectorAll('.qm-chk').forEach(c => c.checked = val);
  _updateSelCount('qm-sel-count', '.qm-chk');
}

async function qmApprove() {
  const ids = _getChecked('.qm-chk');
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  const d = await apiFetch('/api/review/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'questions', ids }),
  });
  toast(`${d.updated}개 승인 완료`, 'ok');
  _qmFetch();
}

async function qmReject() {
  const ids = _getChecked('.qm-chk');
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  if (!confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) return;
  const d = await apiFetch('/api/review/reject', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'questions', ids }),
  });
  toast(`${d.deleted}개 삭제 완료`, 'err');
  _qmFetch();
}

/* ── 재니터 ──────────────────────────────────────────── */
async function janitorHealth() {
  const el = document.getElementById('janitor-health');
  el.innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>로드 중...</p></div>';
  try {
    const h = await apiFetch('/api/janitor/health');
    renderJanitorHealthCard(h, 'janitor-health');
  } catch (e) { toast('헬스 로드 실패: ' + e.message, 'err'); }
}

async function janitorScan() {
  const el = document.getElementById('janitor-health');
  el.innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>스캔 중...</p></div>';
  try {
    const d = await apiFetch('/api/janitor/scan');
    const items = [
      { label: '중복 단어',      cnt: d.duplicate_words },
      { label: '미완성 단어',    cnt: d.incomplete_words },
      { label: '손상된 문제',    cnt: d.broken_questions },
      { label: '손상된 템플릿',  cnt: d.broken_templates },
      { label: '저품질 문제',    cnt: d.low_quality_questions },
    ];
    const rows = items.map(i => {
      const cls = i.cnt > 0 ? (i.cnt > 10 ? 'ib-bad' : 'ib-warn') : 'ib-ok';
      const sym = i.cnt > 0 ? '!' : '✓';
      return `<div class="issue-item"><span class="issue-badge ${cls}">${sym}</span><span>${i.label}: <strong>${i.cnt}</strong>개</span></div>`;
    }).join('');
    el.innerHTML = `
      <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px;">
        스캔 완료 · 총 이슈 <strong style="color:${d.total_issues > 0 ? 'var(--danger)' : 'var(--success)'};">${d.total_issues}</strong>개
      </div>
      <div class="issue-list">${rows}</div>`;
    toast(`스캔 완료 — 이슈 ${d.total_issues}개`, d.total_issues > 0 ? 'inf' : 'ok');
  } catch (e) { toast('스캔 실패: ' + e.message, 'err'); }
}

async function janitorDetail() {
  const el = document.getElementById('janitor-detail');
  el.innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>상세 스캔 중...</p></div>';
  try {
    const d = await apiFetch('/api/janitor/scan/detail');
    const sections = [
      { key: 'duplicate_words',        label: '중복 단어' },
      { key: 'incomplete_words',       label: '미완성 단어' },
      { key: 'broken_questions',       label: '손상된 문제' },
      { key: 'broken_templates',       label: '손상된 템플릿' },
      { key: 'low_quality_questions',  label: '저품질 문제' },
    ];
    const html = sections.map(s => {
      const sec  = d[s.key] || {};
      const cnt  = sec.count || 0;
      const items = (sec.items || []).slice(0, 5);
      const preview = items.length
        ? `<div style="margin-top:6px;font-size:11.5px;color:var(--gray-500);">${items.map(i => JSON.stringify(i)).map(t => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:600px;">${t}</div>`).join('')}${sec.count > 5 ? `<div style="color:var(--gray-400);">...외 ${sec.count - 5}개</div>` : ''}</div>`
        : '';
      const cls = cnt > 0 ? (cnt > 10 ? 'ib-bad' : 'ib-warn') : 'ib-ok';
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span class="issue-badge ${cls}">${cnt > 0 ? cnt : '✓'}</span>
            <strong style="font-size:13px;">${s.label}</strong>
          </div>
          ${preview}
        </div>`;
    }).join('');
    el.innerHTML = html || '<div class="empty"><div class="e-icon">🎉</div><p>이슈 없음</p></div>';
  } catch (e) { toast('상세 스캔 실패: ' + e.message, 'err'); }
}

async function janitorFix() {
  if (!confirm('DB를 자동 수리합니다. 중복 단어 제거 및 필드 정리가 실행됩니다. 계속할까요?')) return;
  const btn = document.getElementById('janitor-fix-btn');
  const log = document.getElementById('janitor-fix-log');
  btn.disabled = true;
  log.style.display = 'block';
  log.textContent = '수리 시작...\n';
  try {
    const d = await apiFetch('/api/janitor/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const lines = [];
    if (d.duplicate_words_removed  !== undefined) lines.push(`✓ 중복 단어 ${d.duplicate_words_removed}개 제거`);
    if (d.broken_questions_removed !== undefined) lines.push(`✓ 손상된 문제 ${d.broken_questions_removed}개 제거`);
    lines.push('');
    lines.push(`DB 상태: 단어 ${d.db?.words || '-'} · 문제 ${d.db?.questions || '-'}`);
    lines.push('수리 완료!');
    log.textContent = lines.join('\n');
    toast('자동 수리 완료', 'ok');
    janitorHealth();
  } catch (e) {
    log.textContent += `\n오류: ${e.message}`;
    toast('수리 실패: ' + e.message, 'err');
  }
  btn.disabled = false;
}

/* ── AI 검수 ─────────────────────────────────────────── */
let curFlagTab = 'words';

async function loadAiReport() {
  const el = document.getElementById('airev-report');
  el.innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>불러오는 중...</p></div>';
  try {
    const r = await apiFetch('/api/ai-review/report');
    renderAiReportCard(r, 'airev-report');
  } catch (e) { toast('AI 리포트 로드 실패: ' + e.message, 'err'); }
}

function switchFlagTab(table) {
  curFlagTab = table;
  document.getElementById('flag-tab-words').classList.toggle('active',     table === 'words');
  document.getElementById('flag-tab-questions').classList.toggle('active', table === 'questions');
  loadAiFlags(table);
}

async function loadAiFlags(table) {
  curFlagTab = table;
  const el = document.getElementById('airev-flags');
  el.innerHTML = '<div class="empty"><div class="e-icon">⏳</div><p>스캔 중 (최대 50개)...</p></div>';
  try {
    const d = await apiFetch(`/api/ai-review/scan/${table}?limit=50`);
    const flagged = (d.items || []).filter(i => i.auto_action === 'flag');
    if (!flagged.length) {
      el.innerHTML = '<div class="empty"><div class="e-icon">🎉</div><p>플래그된 항목이 없습니다.</p></div>';
      return;
    }
    const isW = table === 'words';
    const rows = flagged.map(i => {
      const issues = (i.issues || []).map(t => `<span class="issue-tag">${t}</span>`).join('');
      if (isW) {
        return `<tr>
          <td><strong>${i.word}</strong></td>
          <td><span class="pos-badge">${POS_LABEL[i.pos] || i.pos || '-'}</span></td>
          <td><span class="lv-badge">${i.level || '-'}</span></td>
          <td>${i.meaning_ko || ''}</td>
          <td>${issues}</td>
        </tr>`;
      } else {
        const sc = i.new_quality_score ?? i.quality_score ?? 0;
        const scClass = sc <= 5 ? 's-urgent' : sc <= 7 ? 's-normal' : 's-good';
        return `<tr>
          <td style="max-width:300px;font-size:13px;">${(i.stem||'').slice(0, 80)}...</td>
          <td><span class="lv-badge">${i.level || '-'}</span></td>
          <td><span class="score-badge ${scClass}">${sc}점</span></td>
          <td>${issues}</td>
        </tr>`;
      }
    }).join('');

    const head = isW
      ? `<tr><th>단어</th><th>품사</th><th>레벨</th><th>뜻</th><th>이슈</th></tr>`
      : `<tr><th style="min-width:200px;">문제</th><th>레벨</th><th>점수</th><th>이슈</th></tr>`;

    el.innerHTML = `
      <div style="font-size:13px;color:var(--gray-500);margin-bottom:10px;">플래그 ${flagged.length}개 / 스캔 ${d.count}개</div>
      <div class="table-wrap">
        <table class="flag-table"><thead>${head}</thead><tbody>${rows}</tbody></table>
      </div>`;
  } catch (e) { toast('플래그 로드 실패: ' + e.message, 'err'); }
}

async function aiAutoApprove() {
  const el = document.getElementById('airev-result');
  el.innerHTML = '';
  try {
    const d = await apiFetch('/api/ai-review/auto-approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    el.innerHTML = `
      <div class="result-box result-success">
        ✅ 자동 승인 완료 — 단어 <strong>${d.words_approved}</strong>개 · 문제 <strong>${d.questions_approved}</strong>개
      </div>`;
    toast(`자동 승인 완료 (단어 ${d.words_approved} + 문제 ${d.questions_approved})`, 'ok');
    loadAiReport();
    loadAiFlags(curFlagTab);
  } catch (e) {
    el.innerHTML = `<div class="result-box result-error">❌ ${e.message}</div>`;
    toast('자동 승인 실패: ' + e.message, 'err');
  }
}

/* ── PDF 추출 탭 ─────────────────────────────────────── */
let pdfFile       = null;
let pdfExtracted  = [];
const PDF_GP_LIST = [
  '현재완료','과거시제','현재시제','미래시제','현재진행','과거진행',
  '수동태','가정법과거','가정법과거완료','조동사','to부정사','동명사',
  '분사','관계사','접속사','원급비교','비교급','최상급','간접의문문',
];

function pdfDragOver(e)  { e.preventDefault(); document.getElementById('pdf-dropzone').classList.add('drag-over'); }
function pdfDragLeave(e) { document.getElementById('pdf-dropzone').classList.remove('drag-over'); }
function pdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdf-dropzone').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) _setPdfFile(e.dataTransfer.files[0]);
}
function pdfFileSelected(input) { if (input.files[0]) _setPdfFile(input.files[0]); }
function _setPdfFile(f) {
  pdfFile = f;
  document.getElementById('pdf-file-label').textContent = f.name;
  document.getElementById('pdf-file-name').style.display = 'flex';
  document.getElementById('pdf-extract-btn').disabled = false;
}

function _pdfStep(n) {
  [1,2,3].forEach(i => {
    const el = document.getElementById(`pdf-step-${i}`);
    el.className = 'pdf-step' + (i < n ? ' done' : i === n ? ' active' : '');
  });
}

async function pdfExtract() {
  if (!pdfFile) return;
  const btn    = document.getElementById('pdf-extract-btn');
  const status = document.getElementById('pdf-extract-status');
  btn.disabled = true; btn.textContent = '⏳ 추출 중...';
  status.textContent = '파일을 분석하고 있습니다...';

  try {
    const form = new FormData();
    form.append('file',       pdfFile);
    form.append('level',      document.getElementById('pdf-level').value);
    form.append('book_title', document.getElementById('pdf-book-title').value || pdfFile.name);

    const res = await fetch('/api/doc-in/extract-questions', { method: 'POST', body: form });
    const d   = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || '추출 실패');

    pdfExtracted = d.questions || [];
    status.textContent = '';
    btn.textContent = '🔍 문제 추출'; btn.disabled = false;

    if (pdfExtracted.length === 0) {
      status.textContent = '⚠️ 감지된 문제가 없습니다. 다른 파일을 시도해보세요.'; return;
    }

    _pdfStep(2);
    pdfRenderPreview();
    document.getElementById('pdf-preview-card').style.display = '';
    document.getElementById('pdf-preview-card').scrollIntoView({ behavior:'smooth', block:'start' });

  } catch (e) {
    status.textContent = '❌ ' + e.message;
    btn.textContent = '🔍 문제 추출'; btn.disabled = false;
  }
}

function pdfRenderPreview() {
  const list = document.getElementById('pdf-questions-list');
  document.getElementById('pdf-extract-count').textContent = `${pdfExtracted.length}개 감지됨`;
  const nums = ['①','②','③','④','⑤'];

  list.innerHTML = pdfExtracted.map((q, i) => {
    const gp     = q.grammar_point || '';
    const answer = q.answer || (q.choices?.[q.answer_idx ?? 0] ?? '');
    const gpOpts = ['', ...PDF_GP_LIST].map(g =>
      `<option value="${g}" ${g===gp?'selected':''}>${g||'(미분류)'}</option>`).join('');
    const choicesHtml = (q.choices||[]).map((c, ci) =>
      `<span class="pdf-q-choice ${c===answer||ci===(q.answer_idx??0)?'correct':''}">${nums[ci]||ci+1} ${c}</span>`
    ).join('');
    const stemHtml = (q.raw_stem||'').replace(/_____/g,
      '<u style="text-decoration:underline;text-decoration-color:#94a3b8;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</u>');
    return `
    <div class="pdf-q-item" id="pdf-q-${i}">
      <div class="pdf-q-header">
        <input type="checkbox" id="pdf-chk-${i}" checked onchange="pdfUpdateCount()">
        <label for="pdf-chk-${i}" style="font-weight:700;font-size:13px;cursor:pointer;">문제 ${i+1}</label>
        ${gp ? `<span class="badge badge-grammar">${gp}</span>` : ''}
        ${q.level ? `<span class="badge badge-level">${q.level}</span>` : ''}
        <button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:11px;"
                onclick="pdfToggleItem(${i})">제외</button>
      </div>
      <div class="pdf-q-stem">${stemHtml}</div>
      <div class="pdf-q-choices">${choicesHtml}</div>
      <div class="pdf-q-meta">
        <label>문법 포인트</label>
        <select id="pdf-gp-${i}">${gpOpts}</select>
        <label>정답</label>
        <input type="text" id="pdf-ans-${i}" value="${answer}" style="width:120px;" placeholder="정답">
      </div>
    </div>`;
  }).join('');
  pdfUpdateCount();
}

function pdfToggleItem(i) {
  const chk = document.getElementById(`pdf-chk-${i}`);
  chk.checked = !chk.checked;
  document.getElementById(`pdf-q-${i}`).classList.toggle('excluded', !chk.checked);
  pdfUpdateCount();
}
function pdfCheckAll(v) {
  pdfExtracted.forEach((_, i) => {
    document.getElementById(`pdf-chk-${i}`).checked = v;
    document.getElementById(`pdf-q-${i}`).classList.toggle('excluded', !v);
  });
  pdfUpdateCount();
}
function pdfUpdateCount() {
  const sel = pdfExtracted.filter((_, i) => document.getElementById(`pdf-chk-${i}`)?.checked).length;
  document.getElementById('pdf-selected-count').textContent = `${sel} / ${pdfExtracted.length}개 선택됨`;
}

async function pdfTransformSave() {
  const selected = pdfExtracted
    .map((q, i) => document.getElementById(`pdf-chk-${i}`)?.checked ? {
      ...q,
      grammar_point: document.getElementById(`pdf-gp-${i}`)?.value || q.grammar_point,
      answer:        document.getElementById(`pdf-ans-${i}`)?.value || q.answer,
    } : null)
    .filter(Boolean);

  if (!selected.length) { toast('선택된 문제가 없습니다.', 'err'); return; }

  const btn = document.querySelector('#pdf-preview-card .btn-primary');
  btn.disabled = true; btn.textContent = '⏳ 변환 중...';

  try {
    const res = await fetch('/api/doc-in/transform', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ questions: selected }),
    });
    const d = await res.json();
    if (!res.ok || !d.success) throw new Error(d.error || '변환 실패');

    _pdfStep(3);
    document.getElementById('pdf-result-card').style.display = '';
    document.getElementById('pdf-result-body').innerHTML = `
      <div class="rev-stat-row" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-val" style="color:var(--success);">${d.saved}</div><div class="stat-label">저장 완료</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--warning);">${d.skipped}</div><div class="stat-label">변환 실패·중복</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--primary);">${d.db?.questions_pending??'-'}</div><div class="stat-label">전체 검수 대기</div></div>
      </div>
      <p style="font-size:13px;color:var(--gray-500);">저장된 문제는 모두 <strong>미검수(verified=0)</strong> 상태입니다.<br>스와이프 검수에서 통과/미통과를 결정해주세요.</p>`;
    document.getElementById('pdf-result-card').scrollIntoView({ behavior:'smooth' });
    toast(`${d.saved}개 저장 완료!`, 'ok');
  } catch (e) {
    toast('저장 실패: ' + e.message, 'err');
    btn.disabled = false; btn.textContent = '✅ 선택 항목 변환 후 저장';
  }
}

function pdfReset() {
  pdfFile = null; pdfExtracted = [];
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('pdf-file-name').style.display  = 'none';
  document.getElementById('pdf-extract-btn').disabled     = true;
  document.getElementById('pdf-extract-btn').textContent  = '🔍 문제 추출';
  document.getElementById('pdf-extract-status').textContent = '';
  document.getElementById('pdf-preview-card').style.display = 'none';
  document.getElementById('pdf-result-card').style.display  = 'none';
  document.getElementById('pdf-questions-list').innerHTML = '';
  _pdfStep(1);
}

/* ── 초기화 ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => nav(el.dataset.nav));
  });
  checkLogin();
});
