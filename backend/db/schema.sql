-- 영어 문법 문제은행 SQLite 스키마
-- CLAUDE.md 정의 기반

CREATE TABLE IF NOT EXISTS words (
    word_id     TEXT PRIMARY KEY,
    word        TEXT NOT NULL,
    pos         TEXT,           -- noun/verb/adjective/adverb
    level       TEXT,           -- 중1/중2/중3/고1/고2/고3/수능/수능고급
    grade_num   INTEGER,        -- 1~8 (비교용)
    meaning_ko  TEXT,
    meaning_en  TEXT,
    synonyms    TEXT,           -- JSON 배열
    antonyms    TEXT,           -- JSON 배열
    example     TEXT,
    category    TEXT,           -- 사람/직업|사물|장소|행동|감정|추상개념 등
    source_book TEXT,
    verb_past   TEXT,
    verb_pp     TEXT,
    verb_ing    TEXT,
    noun_plural TEXT,
    adj_comp    TEXT,
    adj_super   TEXT,
    verified    INTEGER DEFAULT 0  -- 0:대기 1:검수완료
);

CREATE TABLE IF NOT EXISTS templates (
    template_id   TEXT PRIMARY KEY,
    grammar_point TEXT NOT NULL,  -- 현재완료/수동태/관계사/가정법 등
    level_min     INTEGER DEFAULT 1,
    level_max     INTEGER DEFAULT 8,
    stem_template TEXT NOT NULL,  -- {SLOT_NAME} 포함 문장 틀
    q_type        TEXT,           -- FIB_MCQ/ERR_ID/FIB_SA/WORDFORM 등
    answer_slot     TEXT,
    wrong_slots     TEXT,           -- JSON 배열 (레거시 슬롯 기반)
    grammar_answer  TEXT,           -- 고정 문법 정답 (예: "has")
    grammar_choices TEXT,           -- JSON 배열, 정답 포함 전체 보기 (예: ["has","have","had","is"])
    verified      INTEGER DEFAULT 1,
    note          TEXT
);

CREATE TABLE IF NOT EXISTS questions (
    question_id   TEXT PRIMARY KEY,
    grammar_point TEXT,
    level         TEXT,
    q_type        TEXT,
    stem          TEXT NOT NULL,
    choices       TEXT,           -- JSON 배열
    answer        TEXT,
    explanation   TEXT,
    tags          TEXT,           -- JSON 배열
    quality_score INTEGER DEFAULT 8,
    verified      INTEGER DEFAULT 0,
    source        TEXT,
    created_at    TEXT,
    used_count    INTEGER DEFAULT 0
);
