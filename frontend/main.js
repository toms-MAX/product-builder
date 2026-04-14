/* ── API 기본 설정 ──────────────────────────────────── */
const API = {
  stats:          () => fetch('/api/stats').then(r => r.json()),
  docIn:    (fd)  => fetch('/api/doc-in',  { method:'POST', body: fd }).then(r => r.json()),
  gen:      (d)   => fetch('/api/gen',     { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  build:    (d)   => fetch('/api/build',   { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(d) }).then(r => r.json()),
  download: (fn)  => window.open(`/api/build/download/${fn}`),
  review: {
    report:  ()        => fetch('/api/review/report').then(r => r.json()),
    list:    (t,lim)   => fetch(`/api/review/list/${t}?limit=${lim||50}`).then(r => r.json()),
    approve: (t, ids)  => fetch('/api/review/approve', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({table:t, ids}) }).then(r => r.json()),
    reject:  (t, ids)  => fetch('/api/review/reject',  { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({table:t, ids}) }).then(r => r.json()),
  }
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
  if (id === 'review')    loadReview('words');
}

/* ── 대시보드 ────────────────────────────────────────── */
async function loadStats() {
  try {
    const d = await API.stats();
    document.getElementById('stat-words').textContent     = d.words;
    document.getElementById('stat-templates').textContent = d.templates;
    document.getElementById('stat-questions').textContent = d.questions;
    document.getElementById('stat-wp').textContent        = d.words_pending;
    document.getElementById('stat-qp').textContent        = d.questions_pending;
  } catch {
    toast('서버에 연결할 수 없습니다.', 'err');
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
  const prog = document.getElementById('doc-progress');
  const res  = document.getElementById('doc-result');
  btn.disabled = true;
  prog.style.display = 'block';
  animateProgress('doc-fill', 'doc-prog-text', '처리 중...');
  res.style.display = 'none';

  try {
    const d = await API.docIn(fd);
    prog.style.display = 'none';
    if (d.error) {
      res.className = 'result-box result-error';
      res.innerHTML = `❌ ${d.error}`;
    } else {
      res.className = 'result-box result-success';
      res.innerHTML = `✅ 완료 — 총 <strong>${d.total}</strong>개 중 <strong>${d.saved}</strong>개 저장 / ${d.skipped}개 중복 / ${d.low_quality}개 검수필요`;
      updateStatBadges(d.db);
      toast(`${d.saved}개 단어 저장 완료`, 'ok');
    }
    res.style.display = 'block';
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
  const grammar = document.getElementById('gen-grammar').value.trim();
  const level   = document.getElementById('gen-level').value;
  const count   = parseInt(document.getElementById('gen-count').value) || 5;
  if (!grammar) { toast('문법 포인트를 입력해주세요.', 'err'); return; }

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
let reviewTable = 'words';
let reviewItems = [];

async function loadReview(table) {
  reviewTable = table;
  document.querySelectorAll('.rev-tab').forEach(t => t.classList.toggle('active', t.dataset.table === table));
  document.getElementById('review-list').innerHTML =
    '<div class="empty"><div class="e-icon">⏳</div><p>불러오는 중...</p></div>';

  try {
    const d = await API.review.list(table, 50);
    reviewItems = d.items || [];
    renderReview(reviewItems, table);

    const rep = await API.review.report();
    const s   = rep[table] || {};
    document.getElementById('rev-total').textContent   = s.total   ?? '-';
    document.getElementById('rev-pending').textContent = s.pending  ?? '-';
    document.getElementById('rev-approved').textContent= s.approved ?? '-';
    if (table === 'questions') {
      document.getElementById('rev-score-wrap').style.display = 'block';
      document.getElementById('rev-urgent').textContent = s.urgent ?? 0;
      document.getElementById('rev-normal').textContent = s.normal ?? 0;
      document.getElementById('rev-good').textContent   = s.good   ?? 0;
    } else {
      document.getElementById('rev-score-wrap').style.display = 'none';
    }
  } catch (e) {
    toast('검수 데이터 로드 실패', 'err');
  }
}

function renderReview(items, table) {
  const wrap = document.getElementById('review-list');
  if (!items.length) {
    wrap.innerHTML = '<div class="empty"><div class="e-icon">🎉</div><p>검수 대기 항목이 없습니다!</p></div>';
    return;
  }

  const isQ = table === 'questions';
  const rows = items.map(r => {
    const id = r.id;
    const scoreVal = r.quality_score;
    const scoreClass = scoreVal <= 5 ? 's-urgent' : scoreVal <= 7 ? 's-normal' : 's-good';
    const scoreBadge = isQ
      ? `<span class="score-badge ${scoreClass}">${scoreVal}점</span>` : '';

    if (isQ) {
      return `<tr>
        <td><input type="checkbox" class="rev-chk" data-id="${id}" style="accent-color:var(--primary)"></td>
        <td><span class="q-badge fib">${r.q_type || ''}</span></td>
        <td style="max-width:300px;">${r.stem}</td>
        <td>${r.answer || ''}</td>
        <td>${r.level || ''}</td>
        <td>${scoreBadge}</td>
      </tr>`;
    } else {
      return `<tr>
        <td><input type="checkbox" class="rev-chk" data-id="${id}" style="accent-color:var(--primary)"></td>
        <td><strong>${r.word}</strong></td>
        <td>${r.pos || ''}</td>
        <td>${r.level || ''}</td>
        <td>${r.meaning_ko || ''}</td>
        <td>${r.source_book || ''}</td>
      </tr>`;
    }
  }).join('');

  const head = isQ
    ? `<tr><th></th><th>유형</th><th>문제</th><th>정답</th><th>레벨</th><th>점수</th></tr>`
    : `<tr><th></th><th>단어</th><th>품사</th><th>레벨</th><th>뜻</th><th>출처</th></tr>`;

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="rtable">
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
  loadReview(reviewTable);
}

async function doReject() {
  const ids = getCheckedIds();
  if (!ids.length) { toast('항목을 선택해주세요.', 'err'); return; }
  if (!confirm(`선택한 ${ids.length}개를 삭제하시겠습니까?`)) return;
  const d = await API.review.reject(reviewTable, ids);
  toast(`${d.deleted}개 삭제 완료`, 'err');
  updateStatBadges(d.db);
  loadReview(reviewTable);
}

function selectAllReview(val) {
  document.querySelectorAll('.rev-chk').forEach(c => c.checked = val);
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
