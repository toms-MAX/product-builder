#!/usr/bin/env python3
"""
migrate.py — questions.json → SQLite 마이그레이션
사용법:
    python backend/db/migrate.py           # 실제 마이그레이션
    python backend/db/migrate.py --dry-run # 변환 결과만 출력, DB 저장 안 함
"""

import json
import sqlite3
import sys
from pathlib import Path

# ── 경로 설정 ──────────────────────────────────────────
ROOT       = Path(__file__).parent.parent.parent
DATA_FILE  = ROOT / "questions.json"
SCHEMA_SQL = Path(__file__).parent / "schema.sql"
DB_PATH    = Path(__file__).parent / "qbank.db"

# ── difficulty → (level, grade_num) 매핑 ──────────────
DIFFICULTY_MAP = {
    "middle_school_1st_grade": ("중1", 1),
    "middle_school_2nd_grade": ("중2", 2),
    "middle_school_3rd_grade": ("중3", 3),
    "high_school_1st_grade":   ("고1", 4),
    "high_school_2nd_grade":   ("고2", 5),
    "high_school_3rd_grade":   ("고3", 6),
    "csat":                    ("수능", 7),
    "csat_advanced":           ("수능고급", 8),
}

# ── format → q_type 매핑 ──────────────────────────────
FORMAT_MAP = {
    "multiple_choice": "FIB_MCQ",
    "short_answer":    "FIB_SA",
    "error_correction":"ERR_CORR",
    "fill_in_blank":   "FIB_MCQ",
}


def load_source():
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"데이터 파일 없음: {DATA_FILE}")
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def convert_to_templates(data):
    """questions.json 항목을 templates 테이블 레코드로 변환"""
    rows = []
    for item in data:
        meta    = item.get("meta", {})
        pattern = item.get("pattern", {})

        difficulty = meta.get("difficulty", "")
        level_str, grade_num = DIFFICULTY_MAP.get(difficulty, ("중2", 2))

        q_type = FORMAT_MAP.get(pattern.get("format", ""), "FIB_MCQ")

        # 어법 오류 유형은 ERR_ID로 재분류
        if meta.get("skill") == "error_identification":
            q_type = "ERR_ID"

        row = {
            "template_id":   meta.get("problem_id"),
            "grammar_point": meta.get("question_type_ko") or meta.get("skill", ""),
            "level_min":     grade_num,
            "level_max":     grade_num + 1,
            "stem_template": pattern.get("question_template", ""),
            "q_type":        q_type,
            "answer_slot":   None,
            "wrong_slots":   None,
            "verified":      1,
            "note":          pattern.get("trap_concept"),
        }
        rows.append(row)
    return rows


def init_db(conn):
    with open(SCHEMA_SQL, encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()


def insert_templates(conn, rows):
    conn.executemany(
        """
        INSERT OR REPLACE INTO templates
          (template_id, grammar_point, level_min, level_max,
           stem_template, q_type, answer_slot, wrong_slots, verified, note)
        VALUES
          (:template_id, :grammar_point, :level_min, :level_max,
           :stem_template, :q_type, :answer_slot, :wrong_slots, :verified, :note)
        """,
        rows,
    )
    conn.commit()


def print_preview(rows):
    print(f"\n{'─'*55}")
    print(f"  변환 결과 미리보기 (총 {len(rows)}개 템플릿)")
    print(f"{'─'*55}")
    for r in rows:
        print(f"  [{r['q_type']}] {r['template_id']}")
        print(f"        문법포인트: {r['grammar_point']}")
        print(f"        레벨범위:   {r['level_min']}~{r['level_max']}")
        print(f"        템플릿:     {r['stem_template'][:60]}...")
        print()


def main():
    dry_run = "--dry-run" in sys.argv

    print("="*55)
    print("  migrate.py — questions.json → SQLite")
    print("="*55)

    data = load_source()
    print(f"\n  소스: {DATA_FILE}  ({len(data)}개 항목)")

    rows = convert_to_templates(data)
    print_preview(rows)

    if dry_run:
        print("  [DRY-RUN] DB 저장 건너뜀\n")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        init_db(conn)
        insert_templates(conn, rows)

        word_count     = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        template_count = conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0]
        question_count = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    finally:
        conn.close()

    print(f"  단어 {word_count}개, 템플릿 {template_count}개, 완성문제 {question_count}개 마이그레이션 완료")
    print(f"  저장 위치: {DB_PATH}\n")


if __name__ == "__main__":
    main()
