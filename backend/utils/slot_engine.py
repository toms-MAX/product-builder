"""
slot_engine.py — 템플릿 × 단어 조합 엔진
==========================================
DB에서 슬롯별 단어를 꺼내 문장 틀을 채움.
DB 단어가 부족하면 내장 기본 단어풀로 폴백.
AI 없이 완전 동작.
"""

import json
import random
import sqlite3
from pathlib import Path


# ── 내장 기본 단어풀 (AI 완전 먹통 + DB 비어있을 때 폴백) ──────
FALLBACK_WORDS = {
    "SUBJECT_PERSON": [
        {"word": "teacher",  "meaning_ko": "선생님"},
        {"word": "student",  "meaning_ko": "학생"},
        {"word": "doctor",   "meaning_ko": "의사"},
        {"word": "engineer", "meaning_ko": "엔지니어"},
        {"word": "writer",   "meaning_ko": "작가"},
    ],
    "SUBJECT_THING": [
        {"word": "book",     "meaning_ko": "책"},
        {"word": "computer", "meaning_ko": "컴퓨터"},
        {"word": "report",   "meaning_ko": "보고서"},
        {"word": "project",  "meaning_ko": "프로젝트"},
        {"word": "letter",   "meaning_ko": "편지"},
    ],
    "OBJECT_THING": [
        {"word": "task",     "meaning_ko": "과제"},
        {"word": "plan",     "meaning_ko": "계획"},
        {"word": "report",   "meaning_ko": "보고서"},
        {"word": "message",  "meaning_ko": "메시지"},
        {"word": "document", "meaning_ko": "문서"},
    ],
    "VERB_GENERAL": [
        {"word": "finish",   "verb_past": "finished",   "verb_pp": "finished",   "verb_ing": "finishing"},
        {"word": "complete", "verb_past": "completed",  "verb_pp": "completed",  "verb_ing": "completing"},
        {"word": "prepare",  "verb_past": "prepared",   "verb_pp": "prepared",   "verb_ing": "preparing"},
        {"word": "submit",   "verb_past": "submitted",  "verb_pp": "submitted",  "verb_ing": "submitting"},
        {"word": "review",   "verb_past": "reviewed",   "verb_pp": "reviewed",   "verb_ing": "reviewing"},
    ],
    "VERB_PAST": [
        {"word": "finished"},
        {"word": "completed"},
        {"word": "prepared"},
        {"word": "submitted"},
        {"word": "reviewed"},
    ],
    "VERB_PP": [
        {"word": "finished"},
        {"word": "completed"},
        {"word": "prepared"},
        {"word": "submitted"},
        {"word": "reviewed"},
    ],
    "VERB_ING": [
        {"word": "finishing"},
        {"word": "completing"},
        {"word": "preparing"},
        {"word": "submitting"},
        {"word": "reviewing"},
    ],
    "ADJ_POSITIVE": [
        {"word": "careful",    "meaning_ko": "조심스러운"},
        {"word": "brilliant",  "meaning_ko": "훌륭한"},
        {"word": "diligent",   "meaning_ko": "부지런한"},
        {"word": "creative",   "meaning_ko": "창의적인"},
        {"word": "confident",  "meaning_ko": "자신감 있는"},
    ],
    "ADV_MANNER": [
        {"word": "carefully",   "meaning_ko": "조심스럽게"},
        {"word": "quickly",     "meaning_ko": "빠르게"},
        {"word": "quietly",     "meaning_ko": "조용히"},
        {"word": "seriously",   "meaning_ko": "진지하게"},
        {"word": "successfully","meaning_ko": "성공적으로"},
    ],
    "NOUN_ABSTRACT": [
        {"word": "success",    "meaning_ko": "성공"},
        {"word": "freedom",    "meaning_ko": "자유"},
        {"word": "knowledge",  "meaning_ko": "지식"},
        {"word": "courage",    "meaning_ko": "용기"},
        {"word": "patience",   "meaning_ko": "인내"},
    ],
}

# ── SLOT_MAP: 슬롯명 → DB 조회 조건 ───────────────────
SLOT_MAP = {
    "SUBJECT_PERSON": {"pos": "noun",      "category": "사람/직업"},
    "SUBJECT_THING":  {"pos": "noun",      "category": "사물"},
    "OBJECT_THING":   {"pos": "noun",      "category": None},
    "VERB_GENERAL":   {"pos": "verb",      "form": "base"},
    "VERB_PAST":      {"pos": "verb",      "form": "verb_past"},
    "VERB_PP":        {"pos": "verb",      "form": "verb_pp"},
    "VERB_ING":       {"pos": "verb",      "form": "verb_ing"},
    "ADJ_POSITIVE":   {"pos": "adjective", "category": None},
    "ADV_MANNER":     {"pos": "adverb",    "category": None},
    "NOUN_ABSTRACT":  {"pos": "noun",      "category": "추상개념"},
}

# form → DB 컬럼명
FORM_COLUMN = {
    "verb_past": "verb_past",
    "verb_pp":   "verb_pp",
    "verb_ing":  "verb_ing",
}


class SlotEngine:
    """
    DB에서 슬롯별 단어를 꺼내 템플릿을 채우는 엔진.
    단어가 부족하면 FALLBACK_WORDS로 자동 대체.
    """

    def __init__(self, db_path: str | Path | None = None):
        if db_path is None:
            db_path = Path(__file__).parent.parent / "db" / "qbank.db"
        self.db_path = Path(db_path)

    def _connect(self) -> sqlite3.Connection | None:
        if self.db_path.exists():
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            return conn
        return None

    # ── DB 단어 조회 ───────────────────────────────────
    def _fetch_from_db(self, slot: str, grade_num: int, exclude: set[str]) -> list[dict]:
        cond = SLOT_MAP.get(slot, {})
        conn = self._connect()
        if not conn:
            return []

        try:
            clauses = ["verified = 1"]
            params: list = []

            if cond.get("pos"):
                clauses.append("pos = ?")
                params.append(cond["pos"])

            if cond.get("category"):
                clauses.append("category = ?")
                params.append(cond["category"])

            # 레벨 범위: ±1 허용
            clauses.append("grade_num BETWEEN ? AND ?")
            params.extend([max(1, grade_num - 1), min(8, grade_num + 1)])

            where = " AND ".join(clauses)
            rows = conn.execute(
                f"SELECT * FROM words WHERE {where}", params
            ).fetchall()

            results = []
            for r in rows:
                w = dict(r)
                form = cond.get("form")
                if form and form in FORM_COLUMN:
                    w["word"] = w.get(FORM_COLUMN[form]) or w["word"]
                if w["word"] not in exclude:
                    results.append(w)
            return results
        finally:
            conn.close()

    # ── 슬롯별 단어 1개 선택 ──────────────────────────
    def pick_word(self, slot: str, grade_num: int = 4,
                  exclude: set[str] | None = None) -> dict:
        """슬롯에 맞는 단어 1개 반환 (DB 우선, 폴백은 내장 단어풀)."""
        exclude = exclude or set()

        db_words = self._fetch_from_db(slot, grade_num, exclude)
        if db_words:
            return random.choice(db_words)

        # 폴백: 내장 단어풀
        fallback = [w for w in FALLBACK_WORDS.get(slot, [])
                    if w["word"] not in exclude]
        if fallback:
            return random.choice(fallback)

        # 최후 폴백: 빈 단어
        return {"word": f"[{slot}]", "meaning_ko": ""}

    # ── 템플릿 채우기 ─────────────────────────────────
    def fill_template(self, template_str: str, grade_num: int = 4) -> dict:
        """
        {SLOT_NAME} 형태의 템플릿을 단어로 채움.

        반환:
          {
            "stem":    완성된 문장,
            "slots":   {"SLOT_NAME": {"word": ..., "meaning_ko": ...}, ...},
          }
        """
        import re
        slot_names = re.findall(r"\{([A-Z_]+)\}", template_str)

        slots: dict[str, dict] = {}
        used_words: set[str] = set()
        stem = template_str

        for slot in slot_names:
            word_info = self.pick_word(slot, grade_num, exclude=used_words)
            slots[slot] = word_info
            used_words.add(word_info["word"])
            stem = stem.replace(f"{{{slot}}}", word_info["word"], 1)

        return {"stem": stem, "slots": slots}

    # ── 보기 셔플 + 정답 위치 재계산 ──────────────────
    def shuffle_choices(self, choices: list[str],
                        correct_answer: str) -> tuple[list[str], int]:
        """
        보기를 무작위로 섞고 정답의 새 인덱스(0-based)를 반환.

        반환: (섞인 보기 리스트, 정답 인덱스)
        """
        if correct_answer not in choices:
            shuffled = choices[:]
            random.shuffle(shuffled)
            return shuffled, -1

        shuffled = choices[:]
        random.shuffle(shuffled)
        return shuffled, shuffled.index(correct_answer)

    # ── 오답 보기 생성 ────────────────────────────────
    def make_choices(self, correct_word: str, slot: str,
                     grade_num: int = 4, count: int = 4) -> tuple[list[str], int]:
        """
        정답 포함 보기 count개를 생성하고 셔플.

        반환: (보기 리스트, 정답 인덱스)
        """
        distractors: list[str] = []
        used = {correct_word}
        need = count - 1  # 정답 1개 포함이므로 오답은 count-1개

        # DB 또는 폴백에서 오답 수집
        db_words = self._fetch_from_db(slot, grade_num, exclude=used)
        for w in db_words:
            if w["word"] not in used:
                distractors.append(w["word"])
                used.add(w["word"])
            if len(distractors) >= need:
                break

        # 부족하면 내장 단어풀에서 추가
        if len(distractors) < need:
            for w in FALLBACK_WORDS.get(slot, []):
                if w["word"] not in used:
                    distractors.append(w["word"])
                    used.add(w["word"])
                if len(distractors) >= need:
                    break

        choices = [correct_word] + distractors[:need]
        return self.shuffle_choices(choices, correct_word)
