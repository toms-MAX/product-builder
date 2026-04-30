/* ── API 기본 설정 ──────────────────────────────────── */

const API_BASE = 'https://product-builder.onrender.com';

// 안전한 fetch: 응답이 JSON이 아니거나 서버 없을 때 에러 객체 반환
async function safeFetch(url, options = {}) {
  try {
    const r = await fetch(url, options);
    const text = await r.text();
    if (!text || !text.trim()) throw new Error('서버 응답이 비어 있습니다. 로컬 서버가 실행 중인지 확인해주세요.');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('서버에 연결할 수 없습니다. 로컬에서 python backend/app.py 를 실행해주세요.');
    }
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error('서버에 연결할 수 없습니다. 로컬에서 python backend/app.py 를 실행해주세요.');
    }
    throw e;
  }
}

const API = {
  stats:          () => safeFetch(`${API_BASE}/api/stats`),
  docIn:    (fd)  => safeFetch(`${API_BASE}/api/doc-in`,  { method:'POST', body: fd }),
  gen:      (d)   => safeFetch(`${API_BASE}/api/gen`,     { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) }),
  build:    (d)   => safeFetch(`${API_BASE}/api/build`,   { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) }),
  download: (fn)  => window.open(`${API_BASE}/api/build/download/${fn}`),
  review: {
    report:  ()        => safeFetch(`${API_BASE}/api/review/report`),
    list:    (t,lim)   => safeFetch(`${API_BASE}/api/review/list/${t}?limit=${lim||50}`),
    approve: (t, ids)  => safeFetch(`${API_BASE}/api/review/approve`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({table:t, ids}) }),
    reject:  (t, ids)  => safeFetch(`${API_BASE}/api/review/reject`,  { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({table:t, ids}) }),
  },
  wordUpdate: (id, fields) => safeFetch(`${API_BASE}/api/words/${id}`, {
    method: 'PATCH', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(fields),
  }),
};

/* ── 토스트 ──────────────────────────────────────────── */
function toast(msg, type = 'inf') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
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
  if (id === 'dashboard') loadStats();
  if (id === 'review')    { reviewOffset = 0; loadReview(); }
}

/* ── 대시보드 ────────────────────────────────────────── */
async function loadStats() {
  try {
    const d = await API.stats();
    document.getElementById('stat-words').textContent     = d.words;
    document.getElementById('stat-templates').textContent = d.templates;
    document.getElementById('stat-questions').textContent = d.questions;
    document.getElementById('stat-wp').textContent        = d.words_pending;
    document.getElementById('server-status').textContent  = '🟢 온라인';
    document.getElementById('stat-qp').textContent        = d.questions_pending;
  } catch (e) {
    document.getElementById('server-status').textContent = '🔴 오프라인';
    toast(e.message, 'err');
  }
}

/* ── DOC-IN ──────────────────────────────────────────── */
let docFile = null;

function initDocIn() {
  const zone  = document.getElementById('doc-zone');
  const input = document.getElementById('doc-file-input');
  const label = document.getElementById('doc-file-label');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) setDocFile(e.dataTransfer.files[0], label);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) setDocFile(input.files[0], label);
  });
}

function setDocFile(file, label) {
  docFile = file;
  label.textContent = `📄 ${file.name}`;
}

async function submitDocIn() {
  if (!docFile) { toast('파일을 선택해주세요.', 'err'); return; }
  const level = document.getElementById('doc-level').value;
  const book  = document.getElementById('doc-book').value.trim() || '미분류';

  const fd = new FormData();
  fd.append('file', docFile);
  fd.append('level', level);
  fd.append('book_title', book);

  const btn  = document.getElementById('doc-btn');
  const fill = document.getElementById('doc-fill');
  const text = document.getElementById('doc-prog-text');
  const prog = document.getElementById('doc-progress');
  const res  = document.getElementById('doc-result');

  btn.disabled = true;
  prog.style.display = 'block';
  fill.style.width = '0%';
  text.textContent = '파일 업로드 중...';
  res.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE}/api/doc-in/stream`, { method: 'POST', body: fd });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE는 "\n\n"으로 메시지 구분
      const parts = buffer.split('\n\n');
      buffer = parts.pop();  // 마지막 불완전 조각 보관

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        let event;
        try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }

        if (event.type === 'step') {
          // 단계 표시: 1~3단계는 25/50/75%, 4단계(완료)는 100%
          const stepPct = Math.round((event.step / event.total_steps) * 100);
          fill.style.width = stepPct + '%';
          text.textContent = `[${event.step}/${event.total_steps}] ${event.message}`;

        } else if (event.type === 'progress') {
          fill.style.width = event.pct + '%';
          text.textContent = `처리 중... ${event.current}/${event.total} (${event.pct}%)`;

        } else if (event.type === 'done') {
          fill.style.width = '100%';
          prog.style.display = 'none';
          const d = event.stats;
          res.className = 'result-box result-success';
          res.innerHTML  = `✅ 완료 — 총 <strong>${d.total}</strong>개 중 <strong>${d.saved}</strong>개 저장 / ${d.skipped}개 중복 / ${d.low_quality}개 검수필요`;
          res.style.display = 'block';
          if (event.db) updateStatBadges(event.db);
          toast(`${d.saved}개 단어 저장 완료`, 'ok');

        } else if (event.type === 'error') {
          prog.style.display = 'none';
          res.className = 'result-box result-error';
          res.innerHTML = `❌ ${event.message}`;
          res.style.display = 'block';
        }
      }
    }
  } catch (e) {
    prog.style.display = 'none';
    res.className = 'result-box result-error';
    res.innerHTML = `❌ 오류: ${e.message}`;
    res.style.display = 'block';
  }
  btn.disabled = false;
}

/* ── GEN ─────────────────────────────────────────────── */
let genResults = [];

async function submitGen() {
  const grammar = document.getElementById('gen-grammar').value;
  const level   = document.getElementById('gen-level').value;
  const count   = parseInt(document.getElementById('gen-count').value) || 5;
  if (!grammar) { toast('문법 포인트를 선택해주세요.', 'err'); return; }

  const btn = document.getElementById('gen-btn');
  btn.disabled = true;
  document.getElementById('gen-result-area').innerHTML =
    '<div class="empty"><div class="e-icon">⏳</div><p>생성 중...</p></div>';

  try {
    const d = await API.gen({ grammar_point: grammar, level, count });
    if (d.error) { toast(d.error, 'err'); renderGenEmpty(); return; }
    genResults = d.questions;
    renderGenQuestions(genResults);
    updateStatBadges(d.db);
    toast(`${genResults.length}개 문제 생성 완료`, 'ok');
  } catch (e) {
    toast('생성 실패: ' + e.message, 'err');
    renderGenEmpty();
  }
  btn.disabled = false;
}

function renderGenEmpty() {
  document.getElementById('gen-result-area').innerHTML =
    '<div class="empty"><div class="e-icon">📭</div><p>생성된 문제가 없습니다.</p></div>';
}

function renderGenQuestions(questions) {
  const area = document.getElementById('gen-result-area');
  if (!questions.length) { renderGenEmpty(); return; }

  const bar = `
    <div class="select-bar">
      <span>총 <strong>${questions.length}</strong>개 생성됨</span>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="selectAllGen(true)">전체선택</button>
        <button class="btn btn-ghost btn-sm" onclick="selectAllGen(false)">선택해제</button>
        <button class="btn btn-primary btn-sm" onclick="sendToBuild()">📋 시험지 만들기</button>
      </div>
    </div>`;

  const cards = questions.map((q, i) => {
    const choices = (q.choices || []).map(c =>
      `<span class="q-choice${c === q.answer ? ' correct' : ''}">${c}</span>`
    ).join('');
    const badgeClass = q.q_type?.includes('ERR') ? 'err' : q.q_type?.includes('SA') ? 'sa' : 'fib';
    return `
      <div class="q-card" id="qcard-${i}" onclick="toggleGenCard(${i})">
        <div class="q-card-top">
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="checkbox" class="q-check" id="qchk-${i}" onchange="event.stopPropagation()">
            <span class="q-badge ${badgeClass}">${q.q_type || 'FIB_MCQ'}</span>
            <span class="q-badge">${q.level}</span>
          </div>
          <span class="q-meta">${q.source || ''}</span>
        </div>
        <div class="q-stem">${q.stem}</div>
        ${choices ? `<div class="q-choices">${choices}</div>` : ''}
        <div class="q-meta">${q.grammar_point} · ID: ${q.question_id?.slice(0,8)}...</div>
      </div>`;
  }).join('');

  area.innerHTML = bar + `<div class="q-list">${cards}</div>`;
}

function toggleGenCard(i) {
  const chk = document.getElementById(`qchk-${i}`);
  const card = document.getElementById(`qcard-${i}`);
  chk.checked = !chk.checked;
  card.classList.toggle('selected', chk.checked);
}

function selectAllGen(val) {
  genResults.forEach((_, i) => {
    document.getElementById(`qchk-${i}`).checked = val;
    document.getElementById(`qcard-${i}`).classList.toggle('selected', val);
  });
}

function sendToBuild() {
  const ids = genResults
    .filter((_, i) => document.getElementById(`qchk-${i}`)?.checked)
    .map(q => q.question_id);
  if (!ids.length) { toast('문제를 선택해주세요.', 'err'); return; }
  sessionStorage.setItem('build_ids', JSON.stringify(ids));
  nav('build');
  loadBuildPreview(ids);
}

/* ── BUILD ───────────────────────────────────────────── */
async function loadBuildPreview(ids) {
  if (!ids) {
    const stored = sessionStorage.getItem('build_ids');
    ids = stored ? JSON.parse(stored) : [];
  }
  document.getElementById('build-count').textContent = ids.length;
  document.getElementById('build-ids-hidden').value  = JSON.stringify(ids);
}

async function submitBuild() {
  const ids = JSON.parse(document.getElementById('build-ids-hidden').value || '[]');
  if (!ids.length) { toast('문제를 먼저 선택해주세요. (GEN 탭에서 문제 생성 후 시험지 만들기)', 'err'); return; }

  const config = {
    question_ids:  ids,
    academy_name:  document.getElementById('build-academy').value.trim(),
    title:         document.getElementById('build-title').value.trim() || '영어 문법 테스트',
    show_answers:  document.getElementById('build-answers').checked,
    layout:        document.getElementById('build-layout').value,
  };

  const btn = document.getElementById('build-btn');
  btn.disabled = true;

  try {
    const d = await API.build(config);
    if (d.error) { toast(d.error, 'err'); return; }
    toast(`시험지 생성 완료 (${d.format})`, 'ok');
    document.getElementById('build-download-area').innerHTML = `
      <div class="result-box result-success" style="display:flex;align-items:center;justify-content:space-between;">
        <span>✅ <strong>${d.filename}</strong> 생성 완료</span>
        <button class="btn btn-primary btn-sm" onclick="API.download('${d.filename}')">⬇ 다운로드</button>
      </div>`;
  } catch (e) {
    toast('빌드 실패: ' + e.message, 'err');
  }
  btn.disabled = false;
}

/* ── REVIEW ──────────────────────────────────────────── */
let reviewTable  = 'words';
let reviewItems  = [];
let reviewOffset = 0;
let reviewTotal  = 0;
let reviewHasMore = false;

const POS_LABEL = { noun: '명사', verb: '동사', adjective: '형용사', adverb: '부사' };
const LEVELS    = ['중1','중2','중3','고1','고2','고3','수능','수능고급'];

function switchRevTab(table) {
  reviewTable  = table;
  reviewOffset = 0;
  document.querySelectorAll('.rev-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.table === table));
  // 문제탭에서는 품사 필터 숨김
  document.getElementById('rev-pos-wrap').style.display =
    table === 'words' ? '' : 'none';
  applyRevFilter();
}

async function applyRevFilter() {
  reviewOffset = 0;
  await loadReview();
}

async function loadReview() {
  document.getElementById('review-list').innerHTML =
    '<div class="empty"><div class="e-icon">⏳</div><p>불러오는 중...</p></div>';

  const level    = document.getElementById('rev-filter-level').value;
  const pos      = document.getElementById('rev-filter-pos').value;
  const verified = document.getElementById('rev-filter-verified').value;
  const limit    = parseInt(document.getElementById('rev-filter-limit').value) || 50;

  const params = new URLSearchParams({ limit, offset: reviewOffset });
  if (level)              params.set('level', level);
  if (pos)                params.set('pos', pos);
  if (verified !== '')    params.set('verified', verified);

  try {
    const d = await safeFetch(`${API_BASE}/api/review/list/${reviewTable}?${params}`);
    reviewItems  = d.items  || [];
    reviewTotal  = d.total  ?? 0;
    reviewHasMore = d.has_more ?? false;
    renderReview(reviewItems, reviewTable);
    updateRevPagination(limit);

    // 현황 숫자는 report API (필터 무관한 전체 통계)
    const rep = await API.review.report();
    const s   = rep[reviewTable] || {};
    document.getElementById('rev-total').textContent    = reviewTotal;
    document.getElementById('rev-pending').textContent  = s.pending  ?? '-';
    document.getElementById('rev-approved').textContent = s.approved ?? '-';
    updateSelCount();
  } catch (e) {
    toast('검수 데이터 로드 실패: ' + e.message, 'err');
  }
}

function updateRevPagination(limit) {
  const pg   = document.getElementById('rev-pagination');
  const info = document.getElementById('rev-page-info');
  const prev = document.getElementById('rev-prev');
  const next = document.getElementById('rev-next');

  const pageNum = Math.floor(reviewOffset / limit) + 1;
  const total   = Math.ceil(reviewTotal / limit);
  info.textContent = `${pageNum} / ${total} 페이지 (총 ${reviewTotal}개)`;
  prev.disabled = reviewOffset === 0;
  next.disabled = !reviewHasMore;
  pg.style.display = reviewTotal > limit ? 'flex' : 'none';
}

function revPage(dir) {
  const limit = parseInt(document.getElementById('rev-filter-limit').value) || 50;
  reviewOffset = Math.max(0, reviewOffset + dir * limit);
  loadReview();
}

function renderReview(items, table) {
  const wrap = document.getElementById('review-list');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty"><div class="e-icon">🎉</div><p>조건에 맞는 항목이 없습니다.</p></div>';
    return;
  }

  const isQ = table === 'questions';
  const rows = items.map(r => buildRevRow(r, isQ)).join('');

  const head = isQ
    ? `<tr><th style="width:32px"></th><th>유형</th><th>레벨</th><th style="min-width:260px">문제</th><th>정답</th><th>점수</th><th style="width:50px"></th></tr>`
    : `<tr><th style="width:32px"></th><th style="min-width:90px">단어</th><th>품사</th><th>레벨</th><th style="min-width:120px">뜻</th><th>출처</th><th style="width:50px"></th></tr>`;

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="rtable">
        <thead>${head}</thead>
        <tbody id="rev-tbody">${rows}</tbody>
      </table>
    </div>`;

  // 체크박스 변경 시 선택 수 갱신
  wrap.querySelectorAll('.rev-chk').forEach(c =>
    c.addEventListener('change', updateSelCount));
}

function buildRevRow(r, isQ) {
  const id = r.id;
  if (isQ) {
    const sc = r.quality_score;
    const scClass = sc <= 5 ? 's-urgent' : sc <= 7 ? 's-normal' : 's-good';
    return `<tr data-id="${id}">
      <td><input type="checkbox" class="rev-chk" data-id="${id}" style="accent-color:var(--primary)"></td>
      <td><span class="q-badge fib">${r.q_type || ''}</span></td>
      <td><span class="lv-badge">${r.level || ''}</span></td>
      <td style="max-width:300px;font-size:13px;">${r.stem}</td>
      <td style="font-size:13px;">${r.answer || ''}</td>
      <td><span class="score-badge ${scClass}">${sc}점</span></td>
      <td></td>
    </tr>`;
  } else {
    const verIcon = r.verified ? '<span style="color:var(--success);font-size:11px;">완료</span>'
                               : '<span style="color:var(--warning);font-size:11px;">대기</span>';
    return `
    <tr data-id="${id}" class="rev-word-row">
      <td><input type="checkbox" class="rev-chk" data-id="${id}" style="accent-color:var(--primary)"></td>
      <td><strong>${r.word}</strong></td>
      <td><span class="pos-badge">${POS_LABEL[r.pos] || r.pos || '-'}</span></td>
      <td><span class="lv-badge">${r.level || '-'}</span></td>
      <td style="font-size:13px;">${r.meaning_ko || ''}</td>
      <td style="font-size:11px;color:var(--gray-400);">${r.source_book || ''}</td>
      <td><button class="btn btn-ghost btn-xs" onclick="openWordEdit('${id}','${r.word}','${r.pos||'noun'}','${r.level||'고1'}',\`${(r.meaning_ko||'').replace(/`/g,"'")}\`,'${r.category||''}')">편집</button></td>
    </tr>
    <tr id="edit-row-${id}" class="edit-expanded" style="display:none;">
      <td colspan="7">
        <div class="inline-edit">
          <div class="edit-fields">
            <div class="edit-field">
              <label>레벨</label>
              <select id="ef-level-${id}">${LEVELS.map(l=>`<option>${l}</option>`).join('')}</select>
            </div>
            <div class="edit-field">
              <label>품사</label>
              <select id="ef-pos-${id}">
                <option value="noun">명사</option>
                <option value="verb">동사</option>
                <option value="adjective">형용사</option>
                <option value="adverb">부사</option>
              </select>
            </div>
            <div class="edit-field" style="flex:2">
              <label>뜻 (한국어)</label>
              <input type="text" id="ef-meaning-${id}" style="width:100%">
            </div>
            <div class="edit-field">
              <label>카테고리</label>
              <select id="ef-cat-${id}">
                <option value="">-</option>
                <option>사람/직업</option><option>사물</option><option>장소</option>
                <option>행동</option><option>감정</option><option>추상개념</option>
                <option>음식</option><option>동물</option><option>자연</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn btn-primary btn-sm" onclick="saveWordEdit('${id}')">저장</button>
            <button class="btn btn-ghost btn-sm"   onclick="closeWordEdit('${id}')">취소</button>
          </div>
        </div>
      </td>
    </tr>`;
  }
}

function openWordEdit(id, word, pos, level, meaning, category) {
  // 이미 열려있으면 닫기
  const editRow = document.getElementById(`edit-row-${id}`);
  if (editRow.style.display !== 'none') { closeWordEdit(id); return; }

  document.getElementById(`ef-level-${id}`).value   = level;
  document.getElementById(`ef-pos-${id}`).value     = pos;
  document.getElementById(`ef-meaning-${id}`).value = meaning;
  document.getElementById(`ef-cat-${id}`).value     = category;
  editRow.style.display = '';
}

function closeWordEdit(id) {
  const row = document.getElementById(`edit-row-${id}`);
  if (row) row.style.display = 'none';
}

async function saveWordEdit(id) {
  const fields = {
    level:      document.getElementById(`ef-level-${id}`).value,
    pos:        document.getElementById(`ef-pos-${id}`).value,
    meaning_ko: document.getElementById(`ef-meaning-${id}`).value.trim(),
    category:   document.getElementById(`ef-cat-${id}`).value || null,
  };
  try {
    const d = await safeFetch(`${API_BASE}/api/words/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (d.error) { toast(d.error, 'err'); return; }
    toast('저장 완료', 'ok');
    closeWordEdit(id);
    loadReview();  // 목록 새로고침
  } catch (e) {
    toast('저장 실패: ' + e.message, 'err');
  }
}

function updateSelCount() {
  const n = document.querySelectorAll('.rev-chk:checked').length;
  document.getElementById('rev-sel-count').textContent = `${n}개 선택`;
}

function getCheckedIds() {
  return [...document.querySelectorAll('.rev-chk:checked')].map(c => c.dataset.id);
}

async function doApprove() {
  const ids = getCheckedIds();
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  const d = await API.review.approve(reviewTable, ids);
  toast(`${d.updated}개 승인 완료`, 'ok');
  updateStatBadges(d.db);
  loadReview();
}

async function doReject() {
  const ids = getCheckedIds();
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  if (!confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) return;
  const d = await API.review.reject(reviewTable, ids);
  toast(`${d.deleted}개 삭제 완료`, 'err');
  updateStatBadges(d.db);
  loadReview();
}

async function doBulkLevel() {
  const ids   = getCheckedIds();
  const level = document.getElementById('rev-bulk-level').value;
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  if (!level)      { toast('레벨을 선택해주세요.', 'err'); return; }
  const d = await safeFetch(`${API_BASE}/api/review/bulk-level`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: reviewTable, ids, level }),
  });
  if (d.error) { toast(d.error, 'err'); return; }
  toast(`${d.updated}개 → ${level} 변경 완료`, 'ok');
  document.getElementById('rev-bulk-level').value = '';
  updateStatBadges(d.db);
  loadReview();
}

function selectAllReview(val) {
  document.querySelectorAll('.rev-chk').forEach(c => { c.checked = val; });
  updateSelCount();
}

/* ── 공통 헬퍼 ───────────────────────────────────────── */
function updateStatBadges(db) {
  if (!db) return;
  if (db.words     !== undefined) document.getElementById('stat-words').textContent     = db.words;
  if (db.templates !== undefined) document.getElementById('stat-templates').textContent = db.templates;
  if (db.questions !== undefined) document.getElementById('stat-questions').textContent = db.questions;
  if (db.words_pending !== undefined) document.getElementById('stat-wp').textContent    = db.words_pending;
  if (db.questions_pending !== undefined) document.getElementById('stat-qp').textContent= db.questions_pending;
}

function animateProgress(fillId, textId, msg) {
  const fill = document.getElementById(fillId);
  const text = document.getElementById(textId);
  if (text) text.textContent = msg;
  let w = 0;
  const iv = setInterval(() => {
    w = Math.min(w + Math.random() * 8, 90);
    fill.style.width = w + '%';
    if (w >= 90) clearInterval(iv);
  }, 200);
}

/* ── 초기화 ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // 네비게이션
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => nav(el.dataset.nav));
  });

  // DOC-IN 드롭존
  initDocIn();

  // 대시보드 로드
  loadStats();

  // 빌드 ID 초기화
  document.getElementById('build-ids-hidden').value = '[]';
});
