"""
tests/test_build_agent.py — BuildAgent 테스트
ReportLab 없이 HTML 폴백으로 모든 테스트가 통과해야 함.
"""

import json
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.agents.doc_agent import ensure_db
from backend.agents.build_agent import BuildAgent, fetch_questions, _build_html


# ── 헬퍼 ──────────────────────────────────────────────
def make_temp_db() -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    ensure_db(db_path)
    return db_path


def make_temp_dir() -> Path:
    d = Path(tempfile.mkdtemp())
    return d


def insert_questions(db_path: Path, questions: list[dict]):
    conn = sqlite3.connect(db_path)
    conn.executemany(
        """
        INSERT INTO questions
          (question_id, grammar_point, level, q_type, stem,
           choices, answer, tags, quality_score, verified, source, created_at, used_count)
        VALUES
          (:question_id, :grammar_point, :level, :q_type, :stem,
           :choices, :answer, :tags, :quality_score, :verified, :source, :created_at, :used_count)
        """,
        questions,
    )
    conn.commit()
    conn.close()


SAMPLE_QUESTIONS = [
    {
        "question_id": "q001",
        "grammar_point": "현재완료",
        "level": "고1",
        "q_type": "FIB_MCQ",
        "stem": "She has already _____ the report.",
        "choices": json.dumps(["completed", "finishing", "prepare", "submits"]),
        "answer": "completed",
        "tags": '["현재완료","고1"]',
        "quality_score": 9,
        "verified": 1,
        "source": "manual",
        "created_at": "2026-01-01",
        "used_count": 0,
    },
    {
        "question_id": "q002",
        "grammar_point": "수동태",
        "level": "고1",
        "q_type": "FIB_MCQ",
        "stem": "The letter _____ by the teacher yesterday.",
        "choices": json.dumps(["was written", "write", "writing", "written"]),
        "answer": "was written",
        "tags": '["수동태","고1"]',
        "quality_score": 8,
        "verified": 1,
        "source": "manual",
        "created_at": "2026-01-01",
        "used_count": 0,
    },
    {
        "question_id": "q003",
        "grammar_point": "관계사",
        "level": "고2",
        "q_type": "FIB_MCQ",
        "stem": "The student _____ won the prize is my friend.",
        "choices": json.dumps(["who", "which", "whom", "whose"]),
        "answer": "who",
        "tags": '["관계사","고2"]',
        "quality_score": 9,
        "verified": 0,
        "source": "template",
        "created_at": "2026-01-01",
        "used_count": 0,
    },
]


# ── fetch_questions ───────────────────────────────────
def test_fetch_questions_by_ids():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    result = fetch_questions(db, ["q001", "q002"])
    assert len(result) == 2
    assert result[0]["question_id"] == "q001"
    db.unlink()


def test_fetch_questions_order_preserved():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    result = fetch_questions(db, ["q003", "q001"])
    assert result[0]["question_id"] == "q003"
    assert result[1]["question_id"] == "q001"
    db.unlink()


def test_fetch_questions_missing_id():
    db = make_temp_db()
    insert_questions(db, SAMPLE_QUESTIONS)
    result = fetch_questions(db, ["nonexistent"])
    assert result == []
    db.unlink()


def test_fetch_questions_no_db():
    result = fetch_questions(Path("nonexistent.db"), ["q001"])
    assert result == []


# ── _build_html ───────────────────────────────────────
def test_build_html_creates_file():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html(SAMPLE_QUESTIONS, {"title": "테스트"}, out)
    assert out.exists()
    out.unlink()


def test_build_html_contains_stem():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html(SAMPLE_QUESTIONS[:1], {"title": "테스트"}, out)
    content = out.read_text(encoding="utf-8")
    assert "She has already" in content
    out.unlink()


def test_build_html_shows_answers_when_enabled():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html(SAMPLE_QUESTIONS[:1], {"title": "T", "show_answers": True}, out)
    content = out.read_text(encoding="utf-8")
    assert "completed" in content
    out.unlink()


def test_build_html_hides_answers_by_default():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html(SAMPLE_QUESTIONS[:1], {"title": "T", "show_answers": False}, out)
    content = out.read_text(encoding="utf-8")
    assert "정답:" not in content
    out.unlink()


def test_build_html_2col_style():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html(SAMPLE_QUESTIONS, {"title": "T", "layout": "2col"}, out)
    content = out.read_text(encoding="utf-8")
    assert "column-count:2" in content
    out.unlink()


def test_build_html_academy_name():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html(SAMPLE_QUESTIONS[:1], {"title": "T", "academy_name": "민준영어"}, out)
    content = out.read_text(encoding="utf-8")
    assert "민준영어" in content
    out.unlink()


def test_build_html_empty_questions():
    out = Path(tempfile.mktemp(suffix=".html"))
    _build_html([], {"title": "빈 시험지"}, out)
    assert out.exists()
    content = out.read_text(encoding="utf-8")
    assert "0문제" in content
    out.unlink()


# ── BuildAgent.build ──────────────────────────────────
def test_build_creates_output_file():
    db  = make_temp_db()
    out = make_temp_dir()
    insert_questions(db, SAMPLE_QUESTIONS)

    agent = BuildAgent(db_path=db, output_dir=out)
    path = agent.build(["q001", "q002"], {"title": "테스트 시험지"})

    assert path.exists()
    assert path.suffix in (".pdf", ".html")
    db.unlink()


def test_build_output_in_correct_dir():
    db  = make_temp_db()
    out = make_temp_dir()
    insert_questions(db, SAMPLE_QUESTIONS)

    agent = BuildAgent(db_path=db, output_dir=out)
    path = agent.build(["q001"], {})

    assert path.parent == out
    db.unlink()


def test_build_filename_has_timestamp():
    db  = make_temp_db()
    out = make_temp_dir()
    insert_questions(db, SAMPLE_QUESTIONS)

    agent = BuildAgent(db_path=db, output_dir=out)
    path = agent.build(["q001"], {})

    assert "시험지_" in path.name
    db.unlink()


def test_build_no_questions_still_creates_file():
    db  = make_temp_db()
    out = make_temp_dir()

    agent = BuildAgent(db_path=db, output_dir=out)
    path = agent.build(["nonexistent_id"], {"title": "빈 시험지"})

    assert path.exists()
    db.unlink()


def test_build_all_config_options():
    db  = make_temp_db()
    out = make_temp_dir()
    insert_questions(db, SAMPLE_QUESTIONS)

    config = {
        "academy_name": "민준영어",
        "title":        "기말고사 대비",
        "show_answers": True,
        "layout":       "2col",
    }
    agent = BuildAgent(db_path=db, output_dir=out)
    path = agent.build(["q001", "q002", "q003"], config)

    assert path.exists()
    if path.suffix == ".html":
        content = path.read_text(encoding="utf-8")
        assert "민준영어" in content
        assert "기말고사 대비" in content
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
