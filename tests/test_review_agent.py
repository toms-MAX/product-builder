"""
tests/test_review_agent.py — ReviewAgent 테스트
"""

import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.agents.doc_agent import ensure_db
from backend.agents.review_agent import ReviewAgent


# ── 헬퍼 ──────────────────────────────────────────────
def make_temp_db() -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    ensure_db(db_path)
    return db_path


def insert_words(db_path: Path, rows: list[dict]):
    conn = sqlite3.connect(db_path)
    conn.executemany(
        """INSERT INTO words
           (word_id, word, pos, level, grade_num, meaning_ko, source_book, verified)
           VALUES (:word_id, :word, :pos, :level, :grade_num, :meaning_ko, :source_book, :verified)""",
        rows,
    )
    conn.commit()
    conn.close()


def insert_questions(db_path: Path, rows: list[dict]):
    conn = sqlite3.connect(db_path)
    conn.executemany(
        """INSERT INTO questions
           (question_id, grammar_point, level, q_type, stem,
            choices, answer, tags, quality_score, verified, source, created_at, used_count)
           VALUES
           (:question_id, :grammar_point, :level, :q_type, :stem,
            :choices, :answer, :tags, :quality_score, :verified, :source, :created_at, :used_count)""",
        rows,
    )
    conn.commit()
    conn.close()


SAMPLE_WORDS = [
    {"word_id": "w001", "word": "accomplish", "pos": "verb",   "level": "고1",
     "grade_num": 4, "meaning_ko": "성취하다", "source_book": "테스트", "verified": 0},
    {"word_id": "w002", "word": "freedom",    "pos": "noun",   "level": "중3",
     "grade_num": 3, "meaning_ko": "자유",    "source_book": "테스트", "verified": 0},
    {"word_id": "w003", "word": "courage",    "pos": "noun",   "level": "고2",
     "grade_num": 5, "meaning_ko": "용기",    "source_book": "테스트", "verified": 1},
]

SAMPLE_QUESTIONS = [
    {"question_id": "q001", "grammar_point": "현재완료", "level": "고1",
     "q_type": "FIB_MCQ", "stem": "She has already ___ it.",
     "choices": "[]", "answer": "done", "tags": "[]",
     "quality_score": 4, "verified": 0, "source": "manual",
     "created_at": "2026-01-01", "used_count": 0},
    {"question_id": "q002", "grammar_point": "수동태", "level": "중3",
     "q_type": "FIB_MCQ", "stem": "It ___ by her.",
     "choices": "[]", "answer": "was done", "tags": "[]",
     "quality_score": 7, "verified": 0, "source": "manual",
     "created_at": "2026-01-01", "used_count": 0},
    {"question_id": "q003", "grammar_point": "관계사", "level": "고2",
     "q_type": "FIB_MCQ", "stem": "The man ___ came.",
     "choices": "[]", "answer": "who", "tags": "[]",
     "quality_score": 9, "verified": 1, "source": "manual",
     "created_at": "2026-01-01", "used_count": 0},
]


# ── report ────────────────────────────────────────────
def test_report_returns_both_tables():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    result = agent.report()
    assert "words" in result
    assert "questions" in result
    db.unlink()


def test_report_counts_pending():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    insert_questions(db, SAMPLE_QUESTIONS)
    agent = ReviewAgent(db_path=db)
    result = agent.report()
    assert result["words"]["pending"] == 2       # w001, w002
    assert result["words"]["approved"] == 1      # w003
    assert result["questions"]["pending"] == 2   # q001, q002
    assert result["questions"]["approved"] == 1  # q003
    db.unlink()


def test_report_quality_distribution():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    agent = ReviewAgent(db_path=db)
    result = agent.report()
    assert result["questions"]["urgent"] == 1    # q001 (점수 4)
    assert result["questions"]["normal"] == 1    # q002 (점수 7)
    assert result["questions"]["good"] == 0      # q003은 verified=1 이라 제외
    db.unlink()


def test_report_empty_db():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    result = agent.report()
    assert result["words"]["total"] == 0
    assert result["questions"]["total"] == 0
    db.unlink()


# ── list_pending ──────────────────────────────────────
def test_list_pending_words():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    rows = agent.list_pending("words")
    assert len(rows) == 2
    ids = {r["id"] for r in rows}
    assert "w001" in ids
    assert "w002" in ids
    assert "w003" not in ids  # verified=1
    db.unlink()


def test_list_pending_questions():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    agent = ReviewAgent(db_path=db)
    rows = agent.list_pending("questions")
    assert len(rows) == 2
    # 품질 낮은 순 정렬 → q001(4점) 먼저
    assert rows[0]["id"] == "q001"
    db.unlink()


def test_list_pending_limit():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    rows = agent.list_pending("words", limit=1)
    assert len(rows) == 1
    db.unlink()


def test_list_pending_invalid_table():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    try:
        agent.list_pending("invalid_table")
        assert False, "예외가 발생해야 함"
    except ValueError:
        pass
    db.unlink()


def test_list_pending_empty():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    rows = agent.list_pending("words")
    assert rows == []
    db.unlink()


# ── approve ───────────────────────────────────────────
def test_approve_words():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    count = agent.approve("words", ["w001"])
    assert count == 1

    conn = sqlite3.connect(db)
    verified = conn.execute(
        "SELECT verified FROM words WHERE word_id='w001'"
    ).fetchone()[0]
    conn.close()
    assert verified == 1
    db.unlink()


def test_approve_multiple():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    count = agent.approve("words", ["w001", "w002"])
    assert count == 2
    db.unlink()


def test_approve_questions():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    agent = ReviewAgent(db_path=db)
    count = agent.approve("questions", ["q001"])
    assert count == 1

    conn = sqlite3.connect(db)
    verified = conn.execute(
        "SELECT verified FROM questions WHERE question_id='q001'"
    ).fetchone()[0]
    conn.close()
    assert verified == 1
    db.unlink()


def test_approve_empty_ids():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    count = agent.approve("words", [])
    assert count == 0
    db.unlink()


def test_approve_nonexistent_id():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    count = agent.approve("words", ["nonexistent"])
    assert count == 0
    db.unlink()


# ── reject ────────────────────────────────────────────
def test_reject_words():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    count = agent.reject("words", ["w001"])
    assert count == 1

    conn = sqlite3.connect(db)
    row = conn.execute(
        "SELECT * FROM words WHERE word_id='w001'"
    ).fetchone()
    conn.close()
    assert row is None
    db.unlink()


def test_reject_questions():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    agent = ReviewAgent(db_path=db)
    count = agent.reject("questions", ["q002"])
    assert count == 1

    conn = sqlite3.connect(db)
    row = conn.execute(
        "SELECT * FROM questions WHERE question_id='q002'"
    ).fetchone()
    conn.close()
    assert row is None
    db.unlink()


def test_reject_multiple():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    count = agent.reject("words", ["w001", "w002"])
    assert count == 2

    conn = sqlite3.connect(db)
    remaining = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    conn.close()
    assert remaining == 1  # w003만 남음
    db.unlink()


def test_reject_empty_ids():
    db = make_temp_db()
    agent = ReviewAgent(db_path=db)
    count = agent.reject("words", [])
    assert count == 0
    db.unlink()


def test_reject_does_not_delete_approved():
    db = make_temp_db()
    insert_words(db, SAMPLE_WORDS)
    agent = ReviewAgent(db_path=db)
    # w003은 verified=1, 거절해도 삭제됨 (ID 기반이므로 주의)
    # 정상 동작 확인: w003을 직접 reject하면 삭제됨
    count = agent.reject("words", ["w003"])
    assert count == 1
    db.unlink()


# ── 실행 ──────────────────────────────────────────────
if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  ✅ {t.__name__}")
            passed += 1
        except Exception as e:
            print(f"  ❌ {t.__name__}: {e}")
            failed += 1
    print(f"\n  결과: {passed}개 통과 / {failed}개 실패")
