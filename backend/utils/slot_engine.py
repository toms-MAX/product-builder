"""
slot_engine.py — 템플릿 × 단어 조합 엔진
==========================================
DB에서 슬롯별 단어를 꺼내 문장 틀을 채움.
DB 단어가 부족하면 내장 기본 단어풀로 폴백.
AI 없이 완전 동작.

SLOT_MAP / FORM_COLUMN은 ontology.py에서 임포트 — 이 파일에서 직접 수정 금지.
"""

import json
import random
import sqlite3
import sys
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(_ROOT))

from backend.core.ontology import SLOT_MAP, FORM_COLUMN  # noqa: E402


# ── 내장 기본 단어풀 (AI 완전 먹통 + DB 비어있을 때 폴백) ──────
# grade: 1=중1 … 4=고1 … 7=수능 / 각 난도마다 단어 포함 (난도 간 중복 허용)
FALLBACK_WORDS = {
    "SUBJECT_PERSON": [
        # 중1~중2
        {"word": "teacher",       "meaning_ko": "선생님",       "grade": 1},
        {"word": "student",       "meaning_ko": "학생",         "grade": 1},
        {"word": "doctor",        "meaning_ko": "의사",         "grade": 1},
        {"word": "nurse",         "meaning_ko": "간호사",       "grade": 1},
        {"word": "cook",          "meaning_ko": "요리사",       "grade": 1},
        {"word": "farmer",        "meaning_ko": "농부",         "grade": 2},
        {"word": "police officer","meaning_ko": "경찰관",       "grade": 2},
        {"word": "firefighter",   "meaning_ko": "소방관",       "grade": 2},
        # 중3~고1
        {"word": "scientist",     "meaning_ko": "과학자",       "grade": 3},
        {"word": "engineer",      "meaning_ko": "엔지니어",     "grade": 3},
        {"word": "journalist",    "meaning_ko": "기자",         "grade": 3},
        {"word": "designer",      "meaning_ko": "디자이너",     "grade": 4},
        {"word": "architect",     "meaning_ko": "건축가",       "grade": 4},
        {"word": "professor",     "meaning_ko": "교수",         "grade": 4},
        {"word": "writer",        "meaning_ko": "작가",         "grade": 4},
        # 고2~고3
        {"word": "researcher",    "meaning_ko": "연구원",       "grade": 5},
        {"word": "counselor",     "meaning_ko": "상담사",       "grade": 5},
        {"word": "entrepreneur",  "meaning_ko": "기업가",       "grade": 5},
        {"word": "diplomat",      "meaning_ko": "외교관",       "grade": 6},
        {"word": "archaeologist", "meaning_ko": "고고학자",     "grade": 6},
        # 수능
        {"word": "philosopher",   "meaning_ko": "철학자",       "grade": 7},
        {"word": "neurologist",   "meaning_ko": "신경과학자",   "grade": 7},
        {"word": "anthropologist","meaning_ko": "인류학자",     "grade": 7},
        {"word": "astronomer",    "meaning_ko": "천문학자",     "grade": 8},
    ],
    "SUBJECT_THING": [
        # 중1~중2
        {"word": "book",          "meaning_ko": "책",           "grade": 1},
        {"word": "pen",           "meaning_ko": "펜",           "grade": 1},
        {"word": "bag",           "meaning_ko": "가방",         "grade": 1},
        {"word": "phone",         "meaning_ko": "전화기",       "grade": 1},
        {"word": "chair",         "meaning_ko": "의자",         "grade": 2},
        {"word": "table",         "meaning_ko": "탁자",         "grade": 2},
        # 중3~고1
        {"word": "computer",      "meaning_ko": "컴퓨터",       "grade": 3},
        {"word": "camera",        "meaning_ko": "카메라",       "grade": 3},
        {"word": "device",        "meaning_ko": "장치",         "grade": 4},
        {"word": "report",        "meaning_ko": "보고서",       "grade": 4},
        {"word": "instrument",    "meaning_ko": "도구",         "grade": 4},
        {"word": "machine",       "meaning_ko": "기계",         "grade": 4},
        # 고2~고3
        {"word": "equipment",     "meaning_ko": "장비",         "grade": 5},
        {"word": "apparatus",     "meaning_ko": "기구",         "grade": 5},
        {"word": "artifact",      "meaning_ko": "유물",         "grade": 6},
        {"word": "gadget",        "meaning_ko": "장치",         "grade": 6},
        {"word": "mechanism",     "meaning_ko": "메커니즘",     "grade": 6},
        # 수능
        {"word": "phenomenon",    "meaning_ko": "현상",         "grade": 7},
        {"word": "infrastructure","meaning_ko": "기반시설",     "grade": 7},
        {"word": "specimen",      "meaning_ko": "표본",         "grade": 7},
        {"word": "algorithm",     "meaning_ko": "알고리즘",     "grade": 8},
    ],
    "OBJECT_THING": [
        # 중1~중2
        {"word": "task",          "meaning_ko": "과제",         "grade": 1},
        {"word": "plan",          "meaning_ko": "계획",         "grade": 1},
        {"word": "letter",        "meaning_ko": "편지",         "grade": 1},
        {"word": "message",       "meaning_ko": "메시지",       "grade": 2},
        {"word": "gift",          "meaning_ko": "선물",         "grade": 2},
        # 중3~고1
        {"word": "report",        "meaning_ko": "보고서",       "grade": 3},
        {"word": "document",      "meaning_ko": "문서",         "grade": 3},
        {"word": "project",       "meaning_ko": "프로젝트",     "grade": 4},
        {"word": "problem",       "meaning_ko": "문제",         "grade": 4},
        {"word": "goal",          "meaning_ko": "목표",         "grade": 4},
        {"word": "result",        "meaning_ko": "결과",         "grade": 4},
        # 고2~고3
        {"word": "experiment",    "meaning_ko": "실험",         "grade": 5},
        {"word": "proposal",      "meaning_ko": "제안",         "grade": 5},
        {"word": "contract",      "meaning_ko": "계약",         "grade": 6},
        {"word": "hypothesis",    "meaning_ko": "가설",         "grade": 6},
        # 수능
        {"word": "methodology",   "meaning_ko": "방법론",       "grade": 7},
        {"word": "paradigm",      "meaning_ko": "패러다임",     "grade": 7},
        {"word": "framework",     "meaning_ko": "체계",         "grade": 8},
    ],
    "OBJECT_PERSON": [
        {"word": "student",       "meaning_ko": "학생",         "grade": 1},
        {"word": "child",         "meaning_ko": "아이",         "grade": 1},
        {"word": "friend",        "meaning_ko": "친구",         "grade": 2},
        {"word": "patient",       "meaning_ko": "환자",         "grade": 3},
        {"word": "colleague",     "meaning_ko": "동료",         "grade": 4},
        {"word": "client",        "meaning_ko": "고객",         "grade": 5},
        {"word": "candidate",     "meaning_ko": "후보",         "grade": 6},
        {"word": "participant",   "meaning_ko": "참가자",       "grade": 7},
    ],
    "VERB_GENERAL": [
        # 중1~중2
        {"word": "read",      "verb_past": "read",       "verb_pp": "read",       "verb_ing": "reading",       "grade": 1},
        {"word": "write",     "verb_past": "wrote",      "verb_pp": "written",    "verb_ing": "writing",       "grade": 1},
        {"word": "eat",       "verb_past": "ate",        "verb_pp": "eaten",      "verb_ing": "eating",        "grade": 1},
        {"word": "make",      "verb_past": "made",       "verb_pp": "made",       "verb_ing": "making",        "grade": 1},
        {"word": "use",       "verb_past": "used",       "verb_pp": "used",       "verb_ing": "using",         "grade": 2},
        {"word": "help",      "verb_past": "helped",     "verb_pp": "helped",     "verb_ing": "helping",       "grade": 2},
        {"word": "send",      "verb_past": "sent",       "verb_pp": "sent",       "verb_ing": "sending",       "grade": 2},
        # 중3~고1
        {"word": "finish",    "verb_past": "finished",   "verb_pp": "finished",   "verb_ing": "finishing",     "grade": 3},
        {"word": "complete",  "verb_past": "completed",  "verb_pp": "completed",  "verb_ing": "completing",    "grade": 3},
        {"word": "prepare",   "verb_past": "prepared",   "verb_pp": "prepared",   "verb_ing": "preparing",     "grade": 3},
        {"word": "submit",    "verb_past": "submitted",  "verb_pp": "submitted",  "verb_ing": "submitting",    "grade": 4},
        {"word": "review",    "verb_past": "reviewed",   "verb_pp": "reviewed",   "verb_ing": "reviewing",     "grade": 4},
        {"word": "improve",   "verb_past": "improved",   "verb_pp": "improved",   "verb_ing": "improving",     "grade": 4},
        {"word": "achieve",   "verb_past": "achieved",   "verb_pp": "achieved",   "verb_ing": "achieving",     "grade": 4},
        {"word": "support",   "verb_past": "supported",  "verb_pp": "supported",  "verb_ing": "supporting",    "grade": 4},
        # 고2~고3
        {"word": "accomplish",   "verb_past": "accomplished",  "verb_pp": "accomplished",  "verb_ing": "accomplishing",  "grade": 5},
        {"word": "investigate",  "verb_past": "investigated",  "verb_pp": "investigated",  "verb_ing": "investigating",  "grade": 5},
        {"word": "demonstrate",  "verb_past": "demonstrated",  "verb_pp": "demonstrated",  "verb_ing": "demonstrating",  "grade": 5},
        {"word": "implement",    "verb_past": "implemented",   "verb_pp": "implemented",   "verb_ing": "implementing",   "grade": 6},
        {"word": "evaluate",     "verb_past": "evaluated",     "verb_pp": "evaluated",     "verb_ing": "evaluating",     "grade": 6},
        {"word": "establish",    "verb_past": "established",   "verb_pp": "established",   "verb_ing": "establishing",   "grade": 6},
        # 수능
        {"word": "contemplate",  "verb_past": "contemplated",  "verb_pp": "contemplated",  "verb_ing": "contemplating",  "grade": 7},
        {"word": "perceive",     "verb_past": "perceived",     "verb_pp": "perceived",     "verb_ing": "perceiving",     "grade": 7},
        {"word": "alleviate",    "verb_past": "alleviated",    "verb_pp": "alleviated",    "verb_ing": "alleviating",    "grade": 7},
        {"word": "substantiate", "verb_past": "substantiated", "verb_pp": "substantiated", "verb_ing": "substantiating","grade": 8},
        {"word": "perpetuate",   "verb_past": "perpetuated",   "verb_pp": "perpetuated",   "verb_ing": "perpetuating",  "grade": 8},
    ],
    "VERB_PAST": [
        {"word": "read",         "grade": 1}, {"word": "wrote",       "grade": 1},
        {"word": "made",         "grade": 1}, {"word": "used",        "grade": 2},
        {"word": "helped",       "grade": 2}, {"word": "sent",        "grade": 2},
        {"word": "finished",     "grade": 3}, {"word": "completed",   "grade": 3},
        {"word": "prepared",     "grade": 3}, {"word": "submitted",   "grade": 4},
        {"word": "improved",     "grade": 4}, {"word": "achieved",    "grade": 4},
        {"word": "accomplished", "grade": 5}, {"word": "investigated","grade": 5},
        {"word": "demonstrated", "grade": 5}, {"word": "implemented", "grade": 6},
        {"word": "evaluated",    "grade": 6}, {"word": "established", "grade": 6},
        {"word": "contemplated", "grade": 7}, {"word": "perceived",   "grade": 7},
        {"word": "alleviated",   "grade": 7}, {"word": "substantiated","grade": 8},
    ],
    "VERB_PP": [
        {"word": "read",         "grade": 1}, {"word": "written",     "grade": 1},
        {"word": "made",         "grade": 1}, {"word": "used",        "grade": 2},
        {"word": "helped",       "grade": 2}, {"word": "sent",        "grade": 2},
        {"word": "finished",     "grade": 3}, {"word": "completed",   "grade": 3},
        {"word": "prepared",     "grade": 3}, {"word": "submitted",   "grade": 4},
        {"word": "improved",     "grade": 4}, {"word": "achieved",    "grade": 4},
        {"word": "accomplished", "grade": 5}, {"word": "investigated","grade": 5},
        {"word": "demonstrated", "grade": 5}, {"word": "implemented", "grade": 6},
        {"word": "evaluated",    "grade": 6}, {"word": "established", "grade": 6},
        {"word": "contemplated", "grade": 7}, {"word": "perceived",   "grade": 7},
        {"word": "alleviated",   "grade": 7}, {"word": "substantiated","grade": 8},
    ],
    "VERB_ING": [
        {"word": "reading",        "grade": 1}, {"word": "writing",      "grade": 1},
        {"word": "making",         "grade": 1}, {"word": "using",        "grade": 2},
        {"word": "helping",        "grade": 2}, {"word": "sending",      "grade": 2},
        {"word": "finishing",      "grade": 3}, {"word": "completing",   "grade": 3},
        {"word": "preparing",      "grade": 3}, {"word": "submitting",   "grade": 4},
        {"word": "improving",      "grade": 4}, {"word": "achieving",    "grade": 4},
        {"word": "accomplishing",  "grade": 5}, {"word": "investigating","grade": 5},
        {"word": "demonstrating",  "grade": 5}, {"word": "implementing", "grade": 6},
        {"word": "evaluating",     "grade": 6}, {"word": "establishing", "grade": 6},
        {"word": "contemplating",  "grade": 7}, {"word": "perceiving",   "grade": 7},
        {"word": "alleviating",    "grade": 7}, {"word": "substantiating","grade": 8},
    ],
    "ADJ_POSITIVE": [
        # 중1~중2
        {"word": "good",        "meaning_ko": "좋은",         "grade": 1},
        {"word": "happy",       "meaning_ko": "행복한",       "grade": 1},
        {"word": "kind",        "meaning_ko": "친절한",       "grade": 1},
        {"word": "fast",        "meaning_ko": "빠른",         "grade": 1},
        {"word": "smart",       "meaning_ko": "똑똑한",       "grade": 2},
        {"word": "brave",       "meaning_ko": "용감한",       "grade": 2},
        # 중3~고1
        {"word": "careful",     "meaning_ko": "조심스러운",   "grade": 3},
        {"word": "creative",    "meaning_ko": "창의적인",     "grade": 3},
        {"word": "diligent",    "meaning_ko": "부지런한",     "grade": 4},
        {"word": "brilliant",   "meaning_ko": "훌륭한",       "grade": 4},
        {"word": "confident",   "meaning_ko": "자신감 있는",  "grade": 4},
        {"word": "efficient",   "meaning_ko": "효율적인",     "grade": 4},
        # 고2~고3
        {"word": "significant", "meaning_ko": "중요한",       "grade": 5},
        {"word": "innovative",  "meaning_ko": "혁신적인",     "grade": 5},
        {"word": "resilient",   "meaning_ko": "회복력 있는",  "grade": 6},
        {"word": "versatile",   "meaning_ko": "다재다능한",   "grade": 6},
        {"word": "rigorous",    "meaning_ko": "엄격한",       "grade": 6},
        # 수능
        {"word": "pragmatic",   "meaning_ko": "실용적인",     "grade": 7},
        {"word": "tenacious",   "meaning_ko": "끈질긴",       "grade": 7},
        {"word": "meticulous",  "meaning_ko": "꼼꼼한",       "grade": 7},
        {"word": "perspicacious","meaning_ko": "통찰력 있는", "grade": 8},
    ],
    "ADV_MANNER": [
        # 중1~중2
        {"word": "well",           "meaning_ko": "잘",           "grade": 1},
        {"word": "fast",           "meaning_ko": "빠르게",       "grade": 1},
        {"word": "hard",           "meaning_ko": "열심히",       "grade": 1},
        {"word": "quietly",        "meaning_ko": "조용히",       "grade": 2},
        {"word": "slowly",         "meaning_ko": "천천히",       "grade": 2},
        # 중3~고1
        {"word": "carefully",      "meaning_ko": "조심스럽게",   "grade": 3},
        {"word": "quickly",        "meaning_ko": "빠르게",       "grade": 3},
        {"word": "seriously",      "meaning_ko": "진지하게",     "grade": 4},
        {"word": "actively",       "meaning_ko": "적극적으로",   "grade": 4},
        {"word": "successfully",   "meaning_ko": "성공적으로",   "grade": 4},
        {"word": "diligently",     "meaning_ko": "부지런히",     "grade": 4},
        # 고2~고3
        {"word": "effectively",    "meaning_ko": "효과적으로",   "grade": 5},
        {"word": "significantly",  "meaning_ko": "상당히",       "grade": 5},
        {"word": "consistently",   "meaning_ko": "일관되게",     "grade": 6},
        {"word": "systematically", "meaning_ko": "체계적으로",   "grade": 6},
        {"word": "independently",  "meaning_ko": "독립적으로",   "grade": 6},
        # 수능
        {"word": "rigorously",     "meaning_ko": "엄격하게",     "grade": 7},
        {"word": "meticulously",   "meaning_ko": "꼼꼼하게",     "grade": 7},
        {"word": "pragmatically",  "meaning_ko": "실용적으로",   "grade": 8},
        {"word": "comprehensively","meaning_ko": "포괄적으로",   "grade": 8},
    ],
    "NOUN_ABSTRACT": [
        # 중1~중2
        {"word": "love",           "meaning_ko": "사랑",         "grade": 1},
        {"word": "hope",           "meaning_ko": "희망",         "grade": 1},
        {"word": "dream",          "meaning_ko": "꿈",           "grade": 1},
        {"word": "joy",            "meaning_ko": "기쁨",         "grade": 2},
        {"word": "trust",          "meaning_ko": "신뢰",         "grade": 2},
        # 중3~고1
        {"word": "success",        "meaning_ko": "성공",         "grade": 3},
        {"word": "freedom",        "meaning_ko": "자유",         "grade": 3},
        {"word": "courage",        "meaning_ko": "용기",         "grade": 4},
        {"word": "patience",       "meaning_ko": "인내",         "grade": 4},
        {"word": "knowledge",      "meaning_ko": "지식",         "grade": 4},
        {"word": "justice",        "meaning_ko": "정의",         "grade": 4},
        # 고2~고3
        {"word": "integrity",      "meaning_ko": "청렴함",       "grade": 5},
        {"word": "innovation",     "meaning_ko": "혁신",         "grade": 5},
        {"word": "sustainability", "meaning_ko": "지속가능성",   "grade": 6},
        {"word": "ambiguity",      "meaning_ko": "모호함",       "grade": 6},
        {"word": "resilience",     "meaning_ko": "회복력",       "grade": 6},
        # 수능
        {"word": "consciousness",  "meaning_ko": "의식",         "grade": 7},
        {"word": "perception",     "meaning_ko": "인식",         "grade": 7},
        {"word": "paradigm",       "meaning_ko": "패러다임",     "grade": 7},
        {"word": "epistemology",   "meaning_ko": "인식론",       "grade": 8},
        {"word": "metaphor",       "meaning_ko": "은유",         "grade": 8},
    ],
    "PLACE": [
        # 중1~중2
        {"word": "school",         "meaning_ko": "학교",         "grade": 1},
        {"word": "home",           "meaning_ko": "집",           "grade": 1},
        {"word": "park",           "meaning_ko": "공원",         "grade": 1},
        {"word": "market",         "meaning_ko": "시장",         "grade": 2},
        {"word": "hospital",       "meaning_ko": "병원",         "grade": 2},
        # 중3~고1
        {"word": "library",        "meaning_ko": "도서관",       "grade": 3},
        {"word": "museum",         "meaning_ko": "박물관",       "grade": 3},
        {"word": "laboratory",     "meaning_ko": "실험실",       "grade": 4},
        {"word": "university",     "meaning_ko": "대학교",       "grade": 4},
        {"word": "community",      "meaning_ko": "지역사회",     "grade": 4},
        # 고2 이상
        {"word": "institution",    "meaning_ko": "기관",         "grade": 5},
        {"word": "environment",    "meaning_ko": "환경",         "grade": 5},
        {"word": "civilization",   "meaning_ko": "문명",         "grade": 6},
        {"word": "hemisphere",     "meaning_ko": "반구",         "grade": 7},
    ],
    "ADJ_COMPARATIVE": [
        {"word": "better",   "grade": 1}, {"word": "faster",   "grade": 1},
        {"word": "easier",   "grade": 2}, {"word": "harder",   "grade": 2},
        {"word": "smarter",  "grade": 3}, {"word": "cleaner",  "grade": 3},
        {"word": "stronger", "grade": 4}, {"word": "longer",   "grade": 4},
        {"word": "more significant", "grade": 5},
        {"word": "more effective",   "grade": 5},
        {"word": "more resilient",   "grade": 6},
        {"word": "more comprehensive","grade": 7},
    ],
    "ADJ_SUPERLATIVE": [
        {"word": "best",      "grade": 1}, {"word": "fastest",  "grade": 1},
        {"word": "easiest",   "grade": 2}, {"word": "hardest",  "grade": 2},
        {"word": "smartest",  "grade": 3}, {"word": "strongest","grade": 4},
        {"word": "most significant",  "grade": 5},
        {"word": "most effective",    "grade": 5},
        {"word": "most resilient",    "grade": 6},
        {"word": "most comprehensive","grade": 7},
    ],
    "CONJUNCTION": [
        {"word": "and",      "grade": 1}, {"word": "but",      "grade": 1},
        {"word": "or",       "grade": 1}, {"word": "so",       "grade": 2},
        {"word": "because",  "grade": 2}, {"word": "although", "grade": 3},
        {"word": "however",  "grade": 3}, {"word": "therefore","grade": 4},
        {"word": "moreover", "grade": 5}, {"word": "whereas",  "grade": 6},
        {"word": "nevertheless","grade": 7},
    ],
    "MODAL": [
        {"word": "can",      "grade": 1}, {"word": "will",     "grade": 1},
        {"word": "must",     "grade": 2}, {"word": "should",   "grade": 2},
        {"word": "may",      "grade": 3}, {"word": "might",    "grade": 3},
        {"word": "could",    "grade": 3}, {"word": "would",    "grade": 4},
        {"word": "ought to", "grade": 5}, {"word": "had better","grade": 5},
        {"word": "used to",  "grade": 5},
    ],
}

# SLOT_MAP, FORM_COLUMN → backend/core/ontology.py 참조


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

            cat = cond.get("category")
            if cat:
                if isinstance(cat, list):
                    placeholders = ",".join("?" * len(cat))
                    clauses.append(f"category IN ({placeholders})")
                    params.extend(cat)
                else:
                    clauses.append("category = ?")
                    params.append(cat)

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
        """슬롯에 맞는 단어 1개 반환 (DB 우선, 폴백은 레벨별 내장 단어풀)."""
        exclude = exclude or set()

        db_words = self._fetch_from_db(slot, grade_num, exclude)
        if db_words:
            return random.choice(db_words)

        # 폴백: 레벨 범위(±1) 내 내장 단어풀 우선, 없으면 전체 풀
        all_fallback = FALLBACK_WORDS.get(slot, [])
        grade_min = max(1, grade_num - 1)
        grade_max = min(8, grade_num + 1)
        level_match = [
            w for w in all_fallback
            if w["word"] not in exclude
            and grade_min <= w.get("grade", grade_num) <= grade_max
        ]
        fallback = level_match or [w for w in all_fallback if w["word"] not in exclude]
        if fallback:
            return random.choice(fallback)

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
