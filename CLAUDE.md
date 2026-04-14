# CLAUDE CODE 프로젝트 컨텍스트
# 이 파일을 Claude Code에게 먼저 읽히세요: "CLAUDE.md 파일을 읽고 프로젝트를 파악해줘"

---

## 🎯 프로젝트 한 줄 요약

**"영어 교재 PDF를 DB로 바꾸고, DB로 무한한 문제를 만들고, 강사의 시간을 아껴주고, 월 9,900원을 받는다"**

---

## 👤 대표님 정보

- 현직 영어 강사 (학원 근무 중)
- 시중 영어 문법 교재 + 단어책 다수 PDF 보유
- 문제 퀄리티 검수 가능 (현장 경험)
- 목표: 1인 AI 에이전트 기반 에듀테크 창업 → 디지털 노마드

---

## 🏗️ 서비스 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | 영어 문법 문제은행 |
| 타겟 | 영어 학원 강사 |
| 가격 | 월 9,900원 구독 |
| 목표 구독자 | 200~300명 |
| 목표 순이익 | 월 200~300만원 |
| 무료체험 | 2~3일 + 커스텀 레이아웃 락인 |
| 계정 보안 | 기기 2개까지 허용 + 동시접속 1개 제한 |

---

## 💡 핵심 철학 (절대 흔들리지 않는 원칙)

1. **데이터가 자산, AI는 배달부**
   - DB에 있는 것만 나온다 → 검수 에너지 절감
   - AI는 "DB에서 어떤 단어를 꺼낼지" 선택만 담당

2. **코드 75% + AI 25% 구조**
   - 어떤 AI를 써도 출력 품질은 동일
   - 좋은 AI = 처리 속도만 빠름
   - AI 먹통 시 → 폴백으로 서비스 무중단

3. **DB가 쌓일수록 AI 의존도 자동 감소**
   - 프로토타입: AI 의존도 70%
   - 1년 후: AI 의존도 8%

4. **상대방의 시간을 아껴주고, 그 대가를 받는다**
   - 강사 1인 월 10~15시간 절약
   - 그 가치를 9,900원에 판다

---

## 🤖 AI 에이전트 3팀 구조

```
대표님 (CEO + 검수자)
├── ⚙️ 개발팀 에이전트  ← 지금 구축 중
├── 📣 마케팅팀 에이전트 (개발 안정 후)
└── 💳 결제·운영팀 에이전트 (유료 전환 시)
```

### ⚙️ 개발팀 에이전트 (현재 집중)

```
DOC-IN   → PDF/이미지를 DB로 자료화 (지금 만들 것)
GEN      → DB 템플릿 × 단어 → 문제 생성
BUILD    → 문제 → 커스텀 시험지 PDF 출력
REVIEW   → 검수 대기열 분류 및 리포트
```

---

## 🗄️ DB 구조 (SQLite → Google Drive 동기화)

### 테이블 1: words (단어 DB)
```sql
CREATE TABLE words (
    word_id     TEXT PRIMARY KEY,
    word        TEXT NOT NULL,
    pos         TEXT,        -- noun/verb/adjective/adverb
    level       TEXT,        -- 중1/중2/중3/고1/고2/고3/수능/수능고급
    grade_num   INTEGER,     -- 1~8 (비교용)
    meaning_ko  TEXT,
    meaning_en  TEXT,
    synonyms    TEXT,        -- JSON 배열
    antonyms    TEXT,        -- JSON 배열
    example     TEXT,
    category    TEXT,        -- 사람/직업|사물|장소|행동|감정|추상개념 등
    source_book TEXT,
    verb_past   TEXT,
    verb_pp     TEXT,
    verb_ing    TEXT,
    noun_plural TEXT,
    adj_comp    TEXT,
    adj_super   TEXT,
    verified    INTEGER DEFAULT 0  -- 0:대기 1:검수완료
);
```

### 테이블 2: templates (문장 틀 DB)
```sql
CREATE TABLE templates (
    template_id   TEXT PRIMARY KEY,
    grammar_point TEXT NOT NULL,  -- 현재완료/수동태/관계사/가정법 등
    level_min     INTEGER DEFAULT 1,
    level_max     INTEGER DEFAULT 8,
    stem_template TEXT NOT NULL,  -- {SLOT_NAME} 포함 문장 틀
    q_type        TEXT,           -- fill_in_blank/multiple_choice/error_correction 등
    answer_slot   TEXT,
    wrong_slots   TEXT,           -- JSON 배열
    verified      INTEGER DEFAULT 1,
    note          TEXT
);
```

### 테이블 3: questions (완성문제 캐시)
```sql
CREATE TABLE questions (
    question_id   TEXT PRIMARY KEY,
    grammar_point TEXT,
    level         TEXT,
    q_type        TEXT,
    stem          TEXT NOT NULL,
    choices       TEXT,   -- JSON 배열
    answer        TEXT,
    explanation   TEXT,
    tags          TEXT,   -- JSON 배열
    quality_score INTEGER DEFAULT 8,
    verified      INTEGER DEFAULT 0,
    source        TEXT,
    created_at    TEXT,
    used_count    INTEGER DEFAULT 0
);
```

---

## 🔄 문제 생성 우선순위 (4단계 폴백)

```python
# AI 없이도 동작하는 구조
1순위: DB 검수완료 캐시 → AI 0%, 즉시 출력
2순위: 템플릿 × 단어 DB 조합 → AI 0%, 코드로 처리
3순위: AI가 조합만 선택 → AI 5%, 단어는 DB에서
4순위: 내장 기본 단어풀 → AI 0%, AI 완전 먹통 대비
```

---

## 📐 문제 유형 체계 (18종)

### 1단계 우선 구현 (베타용)
- `FIB_MCQ` — 빈칸에 들어갈 말 (객관식)
- `ERR_ID` — 어법상 틀린 것
- `FIB_SA` — 빈칸 채우기 (단답)
- `WORDFORM` — 어형 변화

### 2단계 (정식 런칭)
- `PARA` — 밑줄 친 부분과 바꿔쓸 수 있는 것
- `TRANS` — 문장 전환 (서술형)
- `ERR_CORR` — 틀린 부분 찾아 고치기 (서술형)
- `DIAL` — 대화문 완성

### 3단계 (수능 특화)
- `ORDER` — 글의 순서 배열
- `INSERT` — 문장이 들어갈 위치
- `MIX_GV` — 어법+어휘 복합
- `SUMM` — 요약문 완성

---

## 🔌 슬롯 시스템 (단어 교체 방식)

```python
# 문장 틀에서 {SLOT_NAME} 위치에 DB 단어 삽입
SLOT_MAP = {
    "SUBJECT_PERSON": pos="noun", category="사람/직업",
    "SUBJECT_THING":  pos="noun", category="사물",
    "OBJECT_THING":   pos="noun",
    "VERB_GENERAL":   pos="verb", form="base",
    "VERB_PAST":      pos="verb", form="verb_past",
    "VERB_PP":        pos="verb", form="verb_pp",
    "VERB_ING":       pos="verb", form="verb_ing",
    "ADJ_POSITIVE":   pos="adjective",
    "ADV_MANNER":     pos="adverb",
    "NOUN_ABSTRACT":  pos="noun", category="추상개념",
}

# 예시
# 템플릿: "{SUBJECT_PERSON} has already {VERB_PP} {OBJECT_THING}."
# DB 단어 투입 →
# "The teacher has already completed the report."
```

---

## 📄 DOC-IN 에이전트 명세 (지금 만들 것)

### 역할
"어떤 문서든 받아서, DB가 읽을 수 있는 형태로 바꾼다"

### 처리 파이프라인
```
1. 입력 감지     → 파일 형식 판별 (PDF/이미지/텍스트) [코드]
2. 텍스트 추출   → PyMuPDF or Vision [코드+AI]
3. 구조 분석     → 단어책 vs 문법교재 판별 [AI]
4. 태깅          → 레벨/문법포인트/품사 자동 부착 [AI]
5. 품질 사전검사 → 불완전 항목 필터 [코드]
6. DB 저장       → SQLite 저장 + 리포트 [코드]
```

### AI 사용 원칙
```python
# AI에게는 절대 문장 생성을 시키지 않는다
# AI 역할은 오직:
# - 이미지 읽기 (Vision)
# - 분류 판단 (레벨/품사)
# - 조합 선택 (어느 단어가 자연스러운지)
# - 품질 점수 (1~10 숫자만 반환)

# 프롬프트 예시 (품질 검사)
prompt = """
영어 문법 문제 품질을 1-10으로만 평가하세요.
문제: {stem}
선택지: {choices}
정답: {answer}
숫자 하나만 반환 (예: 8)
"""
# → 토큰 5개면 충분 → Gemini 무료로도 가능
```

### 출력 JSON 표준 스키마
```json
{
  "word_id": "UUID",
  "word": "accomplish",
  "pos": "verb",
  "level": "고1",
  "grade_num": 4,
  "meaning_ko": "성취하다, 달성하다",
  "meaning_en": "to succeed in doing",
  "synonyms": ["achieve", "attain"],
  "antonyms": ["fail"],
  "example": "She accomplished her goal.",
  "category": "행동",
  "source_book": "수능필수영단어 고1",
  "forms": {
    "verb_past": "accomplished",
    "verb_pp": "accomplished",
    "verb_ing": "accomplishing"
  },
  "verified": 0,
  "quality_score": 9,
  "needs_review": false
}
```

---

## 🛠️ 현재 개발 환경

```
OS:           Windows
Python:       3.14.4 설치 완료
IDE:          Firebase Studio (터미널에서 Claude Code 사용)
AI:           Gemini 무료 API (프로토타입)
프론트:       HTML + JS + CSS
배포:         Cloudflare Pages
버전관리:     GitHub
DB:           SQLite (로컬) → Google Drive 동기화 예정
인프라:       Google Drive 5TB (구글 원 구독)
```

### 현재 프로젝트 파일
```
qmaker/
├── index.html
├── main.js
├── style.css
├── qbank.json   ← 기존 데이터 (마이그레이션 필요)
└── CLAUDE.md    ← 이 파일
```

### 목표 폴더 구조
```
qmaker/
├── frontend/
│   ├── index.html
│   ├── main.js
│   └── style.css
├── backend/
│   ├── agents/
│   │   ├── doc_agent.py    ← DOC-IN (1순위)
│   │   ├── gen_agent.py    ← GEN (2순위)
│   │   └── build_agent.py  ← BUILD (3순위)
│   ├── db/
│   │   ├── schema.sql
│   │   ├── qbank.db
│   │   └── migrate.py      ← qbank.json → SQLite
│   └── utils/
│       ├── pdf_parser.py
│       ├── ai_client.py    ← Gemini API 래퍼
│       └── slot_engine.py  ← 템플릿 × 단어 조합
├── data/
│   └── qbank.json
└── CLAUDE.md
```

---

## ⚠️ 절대 하지 말아야 할 것

```python
# ❌ AI에게 문장 전체 생성 시키기
response = ai.generate("현재완료 문제 만들어줘")

# ✅ AI는 선택만
response = ai.select("이 단어들 중 자연스러운 조합은?", candidates)

# ❌ AI 없으면 동작 안 하는 구조
if not ai_available:
    raise Exception("AI 필요")

# ✅ AI 없어도 동작
if not ai_available:
    return fallback_from_db()

# ❌ 원본 교재 문장 그대로 사용
question.stem = original_text

# ✅ 템플릿 + DB 단어 조합으로 새 문장
question.stem = fill_template(template, db_words)
```

---

## 📋 지금 당장 할 작업 (우선순위)

### TASK 1 (최우선)
```
qbank.json을 읽어서 내용을 파악하고
SQLite DB로 마이그레이션하는 스크립트 작성
파일 위치: backend/db/migrate.py
```

### TASK 2
```
backend/db/schema.sql 작성
(words, templates, questions 3개 테이블)
```

### TASK 3
```
backend/agents/doc_agent.py 작성
- PDF 텍스트 추출 (PyMuPDF)
- Gemini Vision으로 이미지 처리
- 자동 레벨/태그 분류
- SQLite 저장
```

### TASK 4
```
backend/utils/slot_engine.py 작성
- DB에서 슬롯별 단어 조회
- 템플릿에 단어 삽입
- 보기 생성 + 셔플
- AI 없이도 동작하는 구조
```

---

## 🔑 Gemini API 사용 원칙

```python
# 프로토타입: Gemini 무료 API
# 나중에: Claude API로 교체 가능한 구조로 설계

# ai_client.py를 추상화 레이어로 만들어서
# AI 모델 교체 시 이 파일만 수정하면 됨

class AIClient:
    def extract_text_from_image(self, image): ...
    def classify_level(self, text): ...
    def select_natural_combo(self, candidates): ...
    def score_quality(self, question): ...
    # 문장 생성 메서드는 존재하지 않음
```

---

## 📊 성공 기준

| 단계 | 기준 |
|---|---|
| 프로토타입 완료 | 단어 100개 DB 입력 + 문제 10개 자동 생성 + PDF 출력 1장 |
| 베타 오픈 | 단어 500개 + 템플릿 50개 + 베타 테스터 30명 |
| 정식 런칭 | 단어 2,000개 + 템플릿 300개 + 유료 구독자 200명 |
| 퇴사 기준 | 유료 200명 3개월 연속 + 월수익 현 강사 월급 80% 이상 |

---

## 💬 Claude Code에게 첫 번째 지시

```
이 CLAUDE.md 파일을 읽었으면
먼저 qbank.json 파일을 열어서 현재 데이터 구조를 파악해줘.
그 다음 backend/db/ 폴더를 만들고
schema.sql과 migrate.py를 작성해줘.
기존 qbank.json 데이터가 새 SQLite DB로 완전히 이전되어야 해.
```

---

*이 파일은 Claude Code와의 모든 작업 세션 시작 전에 읽혀야 합니다.*
*"CLAUDE.md를 읽고 현재 작업을 이어서 진행해줘" 라고 입력하면 됩니다.*
