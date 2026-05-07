"""
ontology.py — 영어 문제은행 마스터 온톨로지
=============================================
이 파일이 프로그램의 방향을 정의합니다.
새 개념을 추가할 때는 반드시 이 파일에 먼저 등록해야 합니다.

핵심 원칙 (절대 변경 불가):
  1. DB에 있는 것만 나온다 — AI가 문장을 만들지 않는다
  2. AI는 선택만 한다 — 생성·작성은 AI 역할이 아니다
  3. AI 없이도 동작한다 — 폴백 구조 필수
"""

from typing import Literal

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 레벨 시스템
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

LEVELS: list[str] = ["중1", "중2", "중3", "고1", "고2", "고3", "수능", "수능고급"]

LEVEL_TO_GRADE: dict[str, int] = {level: i + 1 for i, level in enumerate(LEVELS)}
GRADE_TO_LEVEL: dict[int, str] = {v: k for k, v in LEVEL_TO_GRADE.items()}
VALID_LEVELS: set[str] = set(LEVELS)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 품사 (Part of Speech)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VALID_POS: set[str] = {"noun", "verb", "adjective", "adverb"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 단어 카테고리
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VALID_CATEGORIES: set[str] = {
    "사람/직업",
    "사물",
    "장소",
    "행동",
    "감정",
    "추상개념",
    "음식",
    "동물",
    "자연",
    "신체",
    "시간",
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 슬롯 시스템 — 슬롯명 → DB 조회 조건 (단일 진실 공급원)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# category 값이 list이면 IN 쿼리, str이면 = 쿼리, None이면 조건 없음
# form 값은 FORM_COLUMN 참조

SLOT_MAP: dict[str, dict] = {
    "SUBJECT_PERSON": {"pos": "noun", "category": "사람/직업"},
    "SUBJECT_THING":  {"pos": "noun", "category": "사물"},
    "OBJECT_THING":   {"pos": "noun", "category": "사물"},   # 추상개념 제거 → 직접목적어로 자연스러운 사물만
    "OBJECT_PERSON":  {"pos": "noun", "category": "사람/직업"},
    "VERB_GENERAL":   {"pos": "verb", "form": "base"},
    "VERB_PAST":      {"pos": "verb", "form": "verb_past"},
    "VERB_PP":        {"pos": "verb", "form": "verb_pp"},
    "VERB_ING":       {"pos": "verb", "form": "verb_ing"},
    "ADJ_POSITIVE":   {"pos": "adjective", "category": None},
    "ADJ_COMPARATIVE":{"pos": "adjective", "form": "adj_comp"},
    "ADJ_SUPERLATIVE":{"pos": "adjective", "form": "adj_super"},
    "ADV_MANNER":     {"pos": "adverb",    "category": None},
    "NOUN_ABSTRACT":  {"pos": "noun",      "category": "추상개념"},
    "PLACE":          {"pos": "noun",      "category": "장소"},
    "CONJUNCTION":    {"pos": "adverb",    "category": None},
    "MODAL":          {"pos": "verb",      "category": None},
}

VALID_SLOTS: set[str] = set(SLOT_MAP.keys())

# DB 컬럼명 매핑 (form → 컬럼)
FORM_COLUMN: dict[str, str] = {
    "verb_past": "verb_past",
    "verb_pp":   "verb_pp",
    "verb_ing":  "verb_ing",
    "adj_comp":  "adj_comp",
    "adj_super": "adj_super",
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 문제 유형 (단계별 구현 일정 포함)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q_TYPES: dict[str, dict] = {
    # 1단계 — 베타용 (현재 구현)
    "FIB_MCQ":  {"desc": "빈칸에 들어갈 말 (객관식)",         "phase": 1},
    "ERR_ID":   {"desc": "어법상 틀린 것",                     "phase": 1},
    "FIB_SA":   {"desc": "빈칸 채우기 (단답)",                 "phase": 1},
    "WORDFORM": {"desc": "어형 변화",                          "phase": 1},
    # 2단계 — 정식 런칭
    "PARA":     {"desc": "밑줄 친 부분과 바꿔쓸 수 있는 것",  "phase": 2},
    "TRANS":    {"desc": "문장 전환 (서술형)",                 "phase": 2},
    "ERR_CORR": {"desc": "틀린 부분 찾아 고치기 (서술형)",    "phase": 2},
    "DIAL":     {"desc": "대화문 완성",                        "phase": 2},
    # 3단계 — 수능 특화
    "ORDER":    {"desc": "글의 순서 배열",                     "phase": 3},
    "INSERT":   {"desc": "문장이 들어갈 위치",                 "phase": 3},
    "MIX_GV":   {"desc": "어법+어휘 복합",                     "phase": 3},
    "SUMM":     {"desc": "요약문 완성",                        "phase": 3},
}

VALID_Q_TYPES: set[str] = set(Q_TYPES.keys())


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 문법 포인트 (영어명 + 단계)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GRAMMAR_POINTS: dict[str, dict] = {
    # 시제
    "현재시제":       {"en": "Simple Present",          "phase": 1},
    "과거시제":       {"en": "Simple Past",             "phase": 1},
    "미래시제":       {"en": "Simple Future",           "phase": 1},
    "현재진행":       {"en": "Present Progressive",     "phase": 1},
    "과거진행":       {"en": "Past Progressive",        "phase": 1},
    "현재완료":       {"en": "Present Perfect",         "phase": 1},
    "과거완료":       {"en": "Past Perfect",            "phase": 2},
    # 조동사/법
    "조동사":         {"en": "Modal Verbs",             "phase": 1},
    "가정법과거":     {"en": "Subjunctive Past",        "phase": 2},
    "가정법과거완료": {"en": "Subjunctive Past Perfect","phase": 2},
    # 준동사
    "to부정사":       {"en": "Infinitive",              "phase": 1},
    "동명사":         {"en": "Gerund",                  "phase": 1},
    "분사":           {"en": "Participle",              "phase": 1},
    # 태 / 관계사 / 접속사
    "수동태":         {"en": "Passive Voice",           "phase": 1},
    "관계사":         {"en": "Relative Clause",         "phase": 1},
    "접속사":         {"en": "Conjunction",             "phase": 1},
    # 비교
    "원급비교":       {"en": "Positive Degree",         "phase": 1},
    "비교급":         {"en": "Comparative",             "phase": 1},
    "최상급":         {"en": "Superlative",             "phase": 1},
    # 어휘
    "어휘_형용사":    {"en": "Adjective Vocabulary",    "phase": 1},
    "어휘_동사":      {"en": "Verb Vocabulary",         "phase": 2},
    "어휘_명사":      {"en": "Noun Vocabulary",         "phase": 2},
    # 문장 구조
    "간접의문문":     {"en": "Indirect Question",       "phase": 2},
    "도치":           {"en": "Inversion",               "phase": 3},
    "강조":           {"en": "Emphasis",                "phase": 3},
    # 독해 유형 (Phase 2-3 — 수능 특화)
    "빈칸 추론":           {"en": "Blank Inference",          "phase": 3},
    "주제 파악":           {"en": "Main Topic",               "phase": 3},
    "주제문 쓰기 (서술형)":{"en": "Topic Sentence Writing",   "phase": 3},
    "밑줄 친 구절 의미 추론": {"en": "Phrase Meaning Inference", "phase": 3},
    "어법상 틀린 것 고르기":  {"en": "Grammar Error Identification", "phase": 2},
}

VALID_GRAMMAR_POINTS: set[str] = set(GRAMMAR_POINTS.keys())


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# AI 사용 원칙 (이 목록 밖의 역할은 AI에게 요청 금지)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AI_ALLOWED_ROLES: set[str] = {
    "read_image",       # 이미지 OCR
    "classify_level",   # 레벨 분류
    "classify_pos",     # 품사 분류
    "score_quality",    # 품질 점수 (숫자 반환)
    "select_combo",     # 조합 선택 (후보 중 선택)
}

# AI가 절대 해서는 안 되는 역할
AI_FORBIDDEN_ROLES: set[str] = {
    "generate_sentence",
    "write_question",
    "create_text",
    "make_distractor",
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 품질 / 서비스 파라미터
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MIN_QUALITY_SCORE: int   = 7   # verified=1이 되려면 이 점수 이상
AUTO_VERIFY_THRESHOLD: int = 9  # 이 점수 이상이면 검수 없이 자동 통과

MAX_DEVICES_PER_USER: int     = 2
MAX_CONCURRENT_SESSIONS: int  = 1
SUBSCRIPTION_PRICE_KRW: int   = 9_900


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 검증 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import re as _re


def validate_word(row: dict) -> list[str]:
    """words 테이블 레코드 온톨로지 검증. 위반 목록 반환 (빈 리스트 = OK)."""
    errors: list[str] = []
    word = row.get("word", "")

    if not row.get("word"):
        errors.append("word 필드 누락")
    if row.get("pos") and row["pos"] not in VALID_POS:
        errors.append(f"pos '{row['pos']}' 정의 없음")
    if row.get("level") and row["level"] not in LEVEL_TO_GRADE:
        errors.append(f"level '{row['level']}' 정의 없음")
    if row.get("category") and row["category"] not in VALID_CATEGORIES:
        errors.append(f"category '{row['category']}' 정의 없음")
    return errors


def validate_template(row: dict) -> list[str]:
    """templates 테이블 레코드 온톨로지 검증."""
    errors: list[str] = []

    gp = row.get("grammar_point", "")
    if gp not in VALID_GRAMMAR_POINTS:
        errors.append(f"grammar_point '{gp}' 정의 없음")

    qt = row.get("q_type", "")
    if qt not in VALID_Q_TYPES:
        errors.append(f"q_type '{qt}' 정의 없음")

    stem = row.get("stem_template", "")
    for slot in _re.findall(r"\{([A-Z_]+)\}", stem):
        if slot not in VALID_SLOTS:
            errors.append(f"슬롯 '{{{slot}}}' 정의 없음")

    answer_slot = row.get("answer_slot")
    if answer_slot and answer_slot not in VALID_SLOTS:
        errors.append(f"answer_slot '{answer_slot}' 정의 없음")

    return errors


def validate_question(row: dict) -> list[str]:
    """questions 테이블 레코드 온톨로지 검증."""
    errors: list[str] = []

    gp = row.get("grammar_point", "")
    if gp and gp not in VALID_GRAMMAR_POINTS:
        errors.append(f"grammar_point '{gp}' 정의 없음")

    qt = row.get("q_type", "")
    if qt and qt not in VALID_Q_TYPES:
        errors.append(f"q_type '{qt}' 정의 없음")

    level = row.get("level", "")
    if level and level not in LEVEL_TO_GRADE:
        errors.append(f"level '{level}' 정의 없음")

    return errors
