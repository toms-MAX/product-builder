"""
seed_words.py — 단어 빠른 입력 도구
=====================================
AI 없이 단어를 DB에 바로 넣는 두 가지 방법:

1. 내장 단어 100개 삽입 (즉시 사용 가능)
   python backend/db/seed_words.py --builtin

2. CSV 파일에서 읽기
   python backend/db/seed_words.py --csv data/my_words.csv

CSV 형식 (헤더 필수):
   word,meaning_ko,pos,level,category,verb_past,verb_pp,verb_ing
   accomplish,성취하다,verb,고1,행동,accomplished,accomplished,accomplishing

   필수: word, meaning_ko
   선택: pos(기본 noun), level(기본 고1), 나머지 모두 선택
"""

import argparse
import csv
import sqlite3
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.doc_agent import ensure_db, save_word

DB_PATH    = ROOT / "backend" / "db" / "qbank.db"
SCHEMA_SQL = ROOT / "backend" / "db" / "schema.sql"

LEVEL_TO_GRADE = {
    "중1": 1, "중2": 2, "중3": 3,
    "고1": 4, "고2": 5, "고3": 6,
    "수능": 7, "수능고급": 8,
}

# ── 내장 단어 100개 ─────────────────────────────────────
# (word, meaning_ko, pos, level, category, verb_past, verb_pp, verb_ing)
BUILTIN_WORDS = [
    # ── 중1~중2 기초 명사 (사람/직업) ──
    ("teacher",    "선생님",      "noun",      "중1", "사람/직업", None, None, None),
    ("student",    "학생",        "noun",      "중1", "사람/직업", None, None, None),
    ("doctor",     "의사",        "noun",      "중1", "사람/직업", None, None, None),
    ("friend",     "친구",        "noun",      "중1", "사람/직업", None, None, None),
    ("family",     "가족",        "noun",      "중1", "사람/직업", None, None, None),

    # ── 중1~중2 기초 명사 (사물) ──
    ("book",       "책",          "noun",      "중1", "사물",     None, None, None),
    ("computer",   "컴퓨터",      "noun",      "중1", "사물",     None, None, None),
    ("phone",      "전화기",      "noun",      "중1", "사물",     None, None, None),
    ("school",     "학교",        "noun",      "중1", "장소",     None, None, None),
    ("house",      "집",          "noun",      "중1", "장소",     None, None, None),

    # ── 중1~중2 기초 동사 ──
    ("study",      "공부하다",    "verb",      "중1", "행동",     "studied",    "studied",    "studying"),
    ("read",       "읽다",        "verb",      "중1", "행동",     "read",       "read",       "reading"),
    ("write",      "쓰다",        "verb",      "중1", "행동",     "wrote",      "written",    "writing"),
    ("play",       "놀다/연주하다","verb",     "중1", "행동",     "played",     "played",     "playing"),
    ("work",       "일하다",      "verb",      "중1", "행동",     "worked",     "worked",     "working"),
    ("help",       "돕다",        "verb",      "중1", "행동",     "helped",     "helped",     "helping"),
    ("make",       "만들다",      "verb",      "중1", "행동",     "made",       "made",       "making"),
    ("give",       "주다",        "verb",      "중1", "행동",     "gave",       "given",      "giving"),
    ("take",       "가져가다",    "verb",      "중1", "행동",     "took",       "taken",      "taking"),
    ("come",       "오다",        "verb",      "중1", "행동",     "came",       "come",       "coming"),

    # ── 중2~중3 형용사 ──
    ("happy",      "행복한",      "adjective", "중1", None, None, None, None),
    ("sad",        "슬픈",        "adjective", "중1", None, None, None, None),
    ("good",       "좋은",        "adjective", "중1", None, None, None, None),
    ("bad",        "나쁜",        "adjective", "중1", None, None, None, None),
    ("kind",       "친절한",      "adjective", "중2", None, None, None, None),
    ("brave",      "용감한",      "adjective", "중2", None, None, None, None),
    ("smart",      "똑똑한",      "adjective", "중2", None, None, None, None),
    ("beautiful",  "아름다운",    "adjective", "중2", None, None, None, None),
    ("important",  "중요한",      "adjective", "중2", None, None, None, None),
    ("different",  "다른",        "adjective", "중2", None, None, None, None),

    # ── 중3 명사 ──
    ("report",     "보고서",      "noun",      "중3", "사물",     None, None, None),
    ("project",    "프로젝트",    "noun",      "중3", "사물",     None, None, None),
    ("problem",    "문제",        "noun",      "중3", "추상개념", None, None, None),
    ("answer",     "답",          "noun",      "중3", "추상개념", None, None, None),
    ("plan",       "계획",        "noun",      "중3", "추상개념", None, None, None),

    # ── 중3 동사 ──
    ("finish",     "끝내다",      "verb",      "중3", "행동",     "finished",   "finished",   "finishing"),
    ("start",      "시작하다",    "verb",      "중3", "행동",     "started",    "started",    "starting"),
    ("choose",     "선택하다",    "verb",      "중3", "행동",     "chose",      "chosen",     "choosing"),
    ("bring",      "가져오다",    "verb",      "중3", "행동",     "brought",    "brought",    "bringing"),
    ("build",      "세우다/짓다", "verb",      "중3", "행동",     "built",      "built",      "building"),
    ("send",       "보내다",      "verb",      "중3", "행동",     "sent",       "sent",       "sending"),
    ("spend",      "쓰다/보내다", "verb",      "중3", "행동",     "spent",      "spent",      "spending"),
    ("learn",      "배우다",      "verb",      "중3", "행동",     "learned",    "learned",    "learning"),
    ("teach",      "가르치다",    "verb",      "중3", "행동",     "taught",     "taught",     "teaching"),
    ("find",       "찾다/발견하다","verb",     "중3", "행동",     "found",      "found",      "finding"),

    # ── 고1 명사 ──
    ("environment","환경",        "noun",      "고1", "추상개념", None, None, None),
    ("society",    "사회",        "noun",      "고1", "추상개념", None, None, None),
    ("culture",    "문화",        "noun",      "고1", "추상개념", None, None, None),
    ("education",  "교육",        "noun",      "고1", "추상개념", None, None, None),
    ("experience", "경험",        "noun",      "고1", "추상개념", None, None, None),

    # ── 고1 동사 ──
    ("achieve",    "달성하다",    "verb",      "고1", "행동",     "achieved",   "achieved",   "achieving"),
    ("complete",   "완료하다",    "verb",      "고1", "행동",     "completed",  "completed",  "completing"),
    ("prepare",    "준비하다",    "verb",      "고1", "행동",     "prepared",   "prepared",   "preparing"),
    ("submit",     "제출하다",    "verb",      "고1", "행동",     "submitted",  "submitted",  "submitting"),
    ("review",     "검토하다",    "verb",      "고1", "행동",     "reviewed",   "reviewed",   "reviewing"),
    ("develop",    "개발하다",    "verb",      "고1", "행동",     "developed",  "developed",  "developing"),
    ("improve",    "개선하다",    "verb",      "고1", "행동",     "improved",   "improved",   "improving"),
    ("increase",   "증가하다",    "verb",      "고1", "행동",     "increased",  "increased",  "increasing"),
    ("reduce",     "줄이다",      "verb",      "고1", "행동",     "reduced",    "reduced",    "reducing"),
    ("solve",      "해결하다",    "verb",      "고1", "행동",     "solved",     "solved",     "solving"),

    # ── 고1 형용사 ──
    ("creative",   "창의적인",    "adjective", "고1", None, None, None, None),
    ("diligent",   "부지런한",    "adjective", "고1", None, None, None, None),
    ("confident",  "자신감 있는", "adjective", "고1", None, None, None, None),
    ("careful",    "조심스러운",  "adjective", "고1", None, None, None, None),
    ("successful", "성공적인",    "adjective", "고1", None, None, None, None),

    # ── 고1 부사 ──
    ("carefully",  "조심스럽게",  "adverb",    "고1", None, None, None, None),
    ("quickly",    "빠르게",      "adverb",    "고1", None, None, None, None),
    ("quietly",    "조용히",      "adverb",    "고1", None, None, None, None),
    ("seriously",  "진지하게",    "adverb",    "고1", None, None, None, None),
    ("successfully","성공적으로", "adverb",    "고1", None, None, None, None),

    # ── 고2 동사 ──
    ("accomplish", "성취하다",    "verb",      "고2", "행동",     "accomplished","accomplished","accomplishing"),
    ("acquire",    "습득하다",    "verb",      "고2", "행동",     "acquired",   "acquired",   "acquiring"),
    ("analyze",    "분석하다",    "verb",      "고2", "행동",     "analyzed",   "analyzed",   "analyzing"),
    ("contribute", "기여하다",    "verb",      "고2", "행동",     "contributed","contributed","contributing"),
    ("establish",  "설립하다",    "verb",      "고2", "행동",     "established","established","establishing"),
    ("maintain",   "유지하다",    "verb",      "고2", "행동",     "maintained", "maintained", "maintaining"),
    ("overcome",   "극복하다",    "verb",      "고2", "행동",     "overcame",   "overcome",   "overcoming"),
    ("promote",    "촉진하다",    "verb",      "고2", "행동",     "promoted",   "promoted",   "promoting"),
    ("recognize",  "인식하다",    "verb",      "고2", "행동",     "recognized", "recognized", "recognizing"),
    ("transform",  "변환하다",    "verb",      "고2", "행동",     "transformed","transformed","transforming"),

    # ── 고2 명사 (추상개념) ──
    ("success",    "성공",        "noun",      "고2", "추상개념", None, None, None),
    ("freedom",    "자유",        "noun",      "고2", "추상개념", None, None, None),
    ("knowledge",  "지식",        "noun",      "고2", "추상개념", None, None, None),
    ("courage",    "용기",        "noun",      "고2", "추상개념", None, None, None),
    ("patience",   "인내",        "noun",      "고2", "추상개념", None, None, None),

    # ── 고3 동사 ──
    ("demonstrate","증명하다",    "verb",      "고3", "행동",     "demonstrated","demonstrated","demonstrating"),
    ("implement",  "실행하다",    "verb",      "고3", "행동",     "implemented","implemented","implementing"),
    ("investigate","조사하다",    "verb",      "고3", "행동",     "investigated","investigated","investigating"),
    ("negotiate",  "협상하다",    "verb",      "고3", "행동",     "negotiated", "negotiated", "negotiating"),
    ("participate","참여하다",    "verb",      "고3", "행동",     "participated","participated","participating"),

    # ── 고3 형용사 ──
    ("significant","중요한/상당한","adjective","고3", None, None, None, None),
    ("substantial","상당한",      "adjective", "고3", None, None, None, None),
    ("efficient",  "효율적인",    "adjective", "고3", None, None, None, None),
    ("innovative", "혁신적인",    "adjective", "고3", None, None, None, None),
    ("fundamental","근본적인",    "adjective", "고3", None, None, None, None),

    # ── 수능 동사 ──
    ("alleviate",  "완화하다",    "verb",      "수능", "행동",    "alleviated", "alleviated", "alleviating"),
    ("contemplate","숙고하다",    "verb",      "수능", "행동",    "contemplated","contemplated","contemplating"),
    ("elaborate",  "자세히 설명하다","verb",   "수능", "행동",    "elaborated", "elaborated", "elaborating"),
    ("facilitate", "용이하게 하다","verb",     "수능", "행동",    "facilitated","facilitated","facilitating"),
    ("perceive",   "인식하다/감지하다","verb", "수능", "행동",    "perceived",  "perceived",  "perceiving"),

    # ── 수능 형용사 ──
    ("ambiguous",  "모호한",      "adjective", "수능", None, None, None, None),
    ("profound",   "심오한",      "adjective", "수능", None, None, None, None),
    ("tangible",   "유형의/실질적인","adjective","수능",None, None, None, None),
    ("inherent",   "내재된",      "adjective", "수능", None, None, None, None),
    ("predominant","지배적인",    "adjective", "수능", None, None, None, None),
]


# ── DB 삽입 ────────────────────────────────────────────

def seed_builtin(db_path: Path, source_book: str = "내장기본단어") -> dict:
    ensure_db(db_path)
    conn = sqlite3.connect(db_path)
    saved = skipped = 0

    for row in BUILTIN_WORDS:
        word, meaning_ko, pos, level, category, vp, vpp, ving = row
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
            "source_book": source_book,
            "verb_past":   vp,
            "verb_pp":     vpp,
            "verb_ing":    ving,
            "noun_plural": None,
            "adj_comp":    None,
            "adj_super":   None,
            "verified":    1,   # 이미 검수된 기본 단어
        }
        ok = save_word(conn, record)
        if ok:
            saved += 1
        else:
            skipped += 1

    conn.commit()
    conn.close()
    return {"saved": saved, "skipped": skipped, "total": len(BUILTIN_WORDS)}


def seed_from_csv(csv_path: Path, db_path: Path) -> dict:
    """
    CSV 파일에서 단어 읽기.

    필수 컬럼: word, meaning_ko
    선택 컬럼: pos, level, category, source_book,
               verb_past, verb_pp, verb_ing
    """
    if not csv_path.exists():
        print(f"  [오류] 파일 없음: {csv_path}")
        return {"saved": 0, "skipped": 0, "total": 0}

    ensure_db(db_path)
    conn = sqlite3.connect(db_path)
    saved = skipped = total = 0

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            word = row.get("word", "").strip().lower()
            if not word:
                skipped += 1
                continue

            level     = row.get("level", "고1").strip() or "고1"
            grade_num = LEVEL_TO_GRADE.get(level, 4)

            record = {
                "word_id":     str(uuid.uuid4()),
                "word":        word,
                "pos":         row.get("pos",         "noun").strip() or "noun",
                "level":       level,
                "grade_num":   grade_num,
                "meaning_ko":  row.get("meaning_ko",  "").strip() or None,
                "meaning_en":  row.get("meaning_en",  "").strip() or None,
                "synonyms":    None,
                "antonyms":    None,
                "example":     row.get("example",     "").strip() or None,
                "category":    row.get("category",    "").strip() or None,
                "source_book": row.get("source_book", "CSV입력").strip() or "CSV입력",
                "verb_past":   row.get("verb_past",   "").strip() or None,
                "verb_pp":     row.get("verb_pp",     "").strip() or None,
                "verb_ing":    row.get("verb_ing",    "").strip() or None,
                "noun_plural": row.get("noun_plural", "").strip() or None,
                "adj_comp":    row.get("adj_comp",    "").strip() or None,
                "adj_super":   row.get("adj_super",   "").strip() or None,
                "verified":    int(row.get("verified", 0)),
            }

            ok = save_word(conn, record)
            if ok:
                saved += 1
            else:
                skipped += 1

    conn.commit()
    conn.close()
    return {"saved": saved, "skipped": skipped, "total": total}


# ── CLI ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="단어 빠른 입력 도구 (AI 없음, 즉시 DB 저장)"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--builtin", action="store_true",
                       help=f"내장 단어 {len(BUILTIN_WORDS)}개 즉시 삽입 (AI 불필요)")
    group.add_argument("--csv",     type=str, metavar="FILE",
                       help="CSV 파일에서 읽기 (word,meaning_ko 필수 컬럼)")
    parser.add_argument("--db",     type=str, default=str(DB_PATH),
                       help="DB 경로 (기본값: backend/db/qbank.db)")
    args = parser.parse_args()

    db_path = Path(args.db)
    print(f"\n{'='*50}")
    print("  단어 빠른 입력 도구 (AI 없음)")
    print(f"{'='*50}")
    print(f"  DB: {db_path}")

    if args.builtin:
        print(f"  모드: 내장 단어 {len(BUILTIN_WORDS)}개 삽입")
        print()
        stats = seed_builtin(db_path)
    else:
        csv_path = Path(args.csv)
        print(f"  모드: CSV 파일 읽기 — {csv_path}")
        print()
        stats = seed_from_csv(csv_path, db_path)

    print(f"{'─'*50}")
    print(f"  완료!")
    print(f"  총 처리:  {stats['total']}개")
    print(f"  DB 저장:  {stats['saved']}개  (verified=1)")
    print(f"  중복 건너뜀: {stats['skipped']}개")
    print()

    # DB 현황 출력
    conn = sqlite3.connect(db_path)
    words = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    v1    = conn.execute("SELECT COUNT(*) FROM words WHERE verified=1").fetchone()[0]
    conn.close()
    print(f"  현재 DB: 총 {words}개 단어 (검수완료 {v1}개)")
    print()


if __name__ == "__main__":
    main()
