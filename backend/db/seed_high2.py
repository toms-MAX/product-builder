"""
seed_high2.py — 고등학교 필수 영단어 50개 추가 시드 스크립트
=========================================================
고등학교 필수 영단어 50개를 words 테이블에 추가합니다.
"""

import sqlite3
import sys
import uuid
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.doc_agent import ensure_db, save_word
from backend.core.ontology import LEVEL_TO_GRADE

DB_PATH = ROOT / "backend" / "db" / "qbank.db"

# (word, meaning_ko, pos, level, category, verb_past, verb_pp, verb_ing, adj_comp, adj_super)
WORDS_DATA = [
    # ── 고1 (grade_num: 4) ─────────────────────────
    ("participate", "참여하다", "verb", "고1", "행동", "participated", "participated", "participating", None, None),
    ("observe", "관찰하다", "verb", "고1", "행동", "observed", "observed", "observing", None, None),
    ("express", "표현하다", "verb", "고1", "행동", "expressed", "expressed", "expressing", None, None),
    ("protect", "보호하다", "verb", "고1", "행동", "protected", "protected", "protecting", None, None),
    ("influence", "영향을 주다", "verb", "고1", "추상개념", "influenced", "influenced", "influencing", None, None),
    ("creative", "창의적인", "adjective", "고1", "추상개념", None, None, None, "more creative", "most creative"),
    ("potential", "잠재적인", "adjective", "고1", "추상개념", None, None, None, "more potential", "most potential"),
    ("sensitive", "민감한", "adjective", "고1", "감정", None, None, None, "more sensitive", "most sensitive"),
    ("frequent", "빈번한", "adjective", "고1", "추상개념", None, None, None, "more frequent", "most frequent"),
    ("responsible", "책임 있는", "adjective", "고1", "추상개념", None, None, None, "more responsible", "most responsible"),
    ("adventure", "모험", "noun", "고1", "행동", None, None, None, None, None),
    ("community", "지역사회", "noun", "고1", "사람", None, None, None, None, None),
    ("generation", "세대", "noun", "고1", "사람", None, None, None, None, None),
    ("invention", "발명", "noun", "고1", "사물", None, None, None, None, None),
    ("material", "재료", "noun", "고1", "사물", None, None, None, None, None),

    # ── 고2 (grade_num: 5) ─────────────────────────
    ("accomplish", "성취하다", "verb", "고2", "행동", "accomplished", "accomplished", "accomplishing", None, None),
    ("investigate", "조사하다", "verb", "고2", "행동", "investigated", "investigated", "investigating", None, None),
    ("transform", "변형시키다", "verb", "고2", "행동", "transformed", "transformed", "transforming", None, None),
    ("recognize", "인식하다", "verb", "고2", "추상개념", "recognized", "recognized", "recognizing", None, None),
    ("interpret", "해석하다", "verb", "고2", "추상개념", "interpreted", "interpreted", "interpreting", None, None),
    ("substantial", "상당한", "adjective", "고2", "추상개념", None, None, None, "more substantial", "most substantial"),
    ("efficient", "효율적인", "adjective", "고2", "추상개념", None, None, None, "more efficient", "most efficient"),
    ("accurate", "정확한", "adjective", "고2", "추상개념", None, None, None, "more accurate", "most accurate"),
    ("consistent", "일관된", "adjective", "고2", "추상개념", None, None, None, "more consistent", "most consistent"),
    ("confident", "자신감 있는", "adjective", "고2", "감정", None, None, None, "more confident", "most confident"),
    ("perspective", "관점", "noun", "고2", "추상개념", None, None, None, None, None),
    ("innovation", "혁신", "noun", "고2", "추상개념", None, None, None, None, None),
    ("evidence", "증거", "noun", "고2", "추상개념", None, None, None, None, None),
    ("philosophy", "철학", "noun", "고2", "추상개념", None, None, None, None, None),
    ("technique", "기법", "noun", "고2", "사물", None, None, None, None, None),

    # ── 고3 (grade_num: 6) ─────────────────────────
    ("demonstrate", "입증하다", "verb", "고3", "행동", "demonstrated", "demonstrated", "demonstrating", None, None),
    ("facilitate", "용이하게 하다", "verb", "고3", "행동", "facilitated", "facilitated", "facilitating", None, None),
    ("contemplate", "심사숙고하다", "verb", "고3", "행동", "contemplated", "contemplated", "contemplating", None, None),
    ("manipulate", "조종하다", "verb", "고3", "행동", "manipulated", "manipulated", "manipulating", None, None),
    ("advocate", "지지하다", "verb", "고3", "행동", "advocated", "advocated", "advocating", None, None),
    ("fundamental", "근본적인", "adjective", "고3", "추상개념", None, None, None, "more fundamental", "most fundamental"),
    ("sophisticated", "세련된", "adjective", "고3", "추상개념", None, None, None, "more sophisticated", "most sophisticated"),
    ("comprehensive", "포괄적인", "adjective", "고3", "추상개념", None, None, None, "more comprehensive", "most comprehensive"),
    ("ambiguous", "모호한", "adjective", "고3", "추상개념", None, None, None, "more ambiguous", "most ambiguous"),
    ("inevitable", "피할 수 없는", "adjective", "고3", "추상개념", None, None, None, "more inevitable", "most inevitable"),
    ("infrastructure", "기반시설", "noun", "고3", "사물", None, None, None, None, None),
    ("hypothesis", "가설", "noun", "고3", "추상개념", None, None, None, None, None),
    ("paradigm", "패러다임", "noun", "고3", "추상개념", None, None, None, None, None),
    ("metaphor", "은유", "noun", "고3", "추상개념", None, None, None, None, None),
    ("phenomenon", "현상", "noun", "고3", "추상개념", None, None, None, None, None),

    # ── 추가 5개 (수준 조절) ──
    ("substitute", "대체하다", "verb", "고2", "행동", "substituted", "substitute", "substituting", None, None),
    ("sustainable", "지속 가능한", "adjective", "고2", "추상개념", None, None, None, "more sustainable", "most sustainable"),
    ("integrity", "진실성", "noun", "고3", "추상개념", None, None, None, None, None),
    ("diversity", "다양성", "noun", "고1", "추상개념", None, None, None, None, None),
    ("estimate", "추정하다", "verb", "고1", "행동", "estimated", "estimated", "estimating", None, None),
]

def seed_high2():
    ensure_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    saved = skipped = 0

    print(f"\n  [SEED] 고등학교 필수 영단어 50개 삽입 중...")

    for row in WORDS_DATA:
        word, meaning_ko, pos, level, category, vp, vpp, ving, ac, asu = row
        grade_num = LEVEL_TO_GRADE.get(level, 4)
        record = {
            "word_id":     str(uuid.uuid4()),
            "word":        word,
            "pos":         pos,
            "level":       level,
            "grade_num":   grade_num,
            "meaning_ko":  meaning_ko,
            "meaning_en":  None,
            "synonyms":    None,
            "antonyms":    None,
            "example":     None,
            "category":    category,
            "source_book": "고교필수50_2",
            "verb_past":   vp,
            "verb_pp":     vpp,
            "verb_ing":    ving,
            "noun_plural": None,
            "adj_comp":    ac,
            "adj_super":   asu,
            "verified":    0,   # 검수 전 상태로 삽입
        }
        ok = save_word(conn, record)
        if ok:
            saved += 1
        else:
            skipped += 1

    conn.commit()
    conn.close()
    print(f"  완료! (저장: {saved}, 건너뜀: {skipped})")

if __name__ == "__main__":
    seed_high2()
