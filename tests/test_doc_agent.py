"""
tests/test_doc_agent.py — DocAgent 테스트
PyMuPDF, Gemini API 없이도 모든 테스트가 통과해야 함.
"""

import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.agents.doc_agent import (
    DocAgent,
    parse_words_from_text,
    parse_meaning_from_line,
    save_word,
    ensure_db,
)


# ── 헬퍼 ──────────────────────────────────────────────
def make_temp_db() -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    ensure_db(db_path)
    return db_path


def make_txt_file(content: str) -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".txt", mode="w",
                                      encoding="utf-8", delete=False)
    tmp.write(content)
    tmp.close()
    return Path(tmp.name)


# ── parse_words_from_text ─────────────────────────────
def test_parse_words_dash_format():
    words = parse_words_from_text("accomplish - 성취하다\nbeautiful - 아름다운")
    assert "accomplish" in words
    assert "beautiful" in words


def test_parse_words_colon_format():
    words = parse_words_from_text("freedom: 자유\ncourage: 용기")
    assert "freedom" in words
    assert "courage" in words


def test_parse_words_standalone():
    words = parse_words_from_text("teacher\nstudent\ndoctor")
    assert "teacher" in words
    assert "student" in words


def test_parse_words_no_duplicates():
    words = parse_words_from_text("run - 달리다\nrun - 달리기")
    assert words.count("run") == 1


def test_parse_words_ignores_korean():
    words = parse_words_from_text("안녕하세요\n학교\n선생님")
    assert words == []


def test_parse_words_ignores_numbers():
    words = parse_words_from_text("123\n456\nabc123")
    assert words == []


# ── parse_meaning_from_line ───────────────────────────
def test_parse_meaning_dash():
    m = parse_meaning_from_line("accomplish - 성취하다, 달성하다")
    assert m == "성취하다, 달성하다"


def test_parse_meaning_colon():
    m = parse_meaning_from_line("freedom: 자유")
    assert m == "자유"


def test_parse_meaning_no_pattern():
    m = parse_meaning_from_line("just a plain line")
    assert m == ""


# ── save_word / ensure_db ─────────────────────────────
def test_ensure_db_creates_tables():
    db_path = make_temp_db()
    conn = sqlite3.connect(db_path)
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()}
    conn.close()
    assert "words" in tables
    assert "templates" in tables
    assert "questions" in tables
    db_path.unlink()


def test_save_word_inserts():
    db_path = make_temp_db()
    conn = sqlite3.connect(db_path)
    record = {
        "word_id": "test-001", "word": "accomplish", "pos": "verb",
        "level": "고1", "grade_num": 4, "meaning_ko": "성취하다",
        "meaning_en": None, "synonyms": None, "antonyms": None,
        "example": None, "category": None, "source_book": "테스트",
        "verb_past": None, "verb_pp": None, "verb_ing": None,
        "noun_plural": None, "adj_comp": None, "adj_super": None,
        "verified": 0,
    }
    result = save_word(conn, record)
    conn.commit()
    conn.close()
    assert result is True
    db_path.unlink()


def test_save_word_no_duplicate():
    db_path = make_temp_db()
    conn = sqlite3.connect(db_path)
    record = {
        "word_id": "test-002", "word": "freedom", "pos": "noun",
        "level": "중3", "grade_num": 3, "meaning_ko": "자유",
        "meaning_en": None, "synonyms": None, "antonyms": None,
        "example": None, "category": None, "source_book": "테스트",
        "verb_past": None, "verb_pp": None, "verb_ing": None,
        "noun_plural": None, "adj_comp": None, "adj_super": None,
        "verified": 0,
    }
    save_word(conn, record)
    conn.commit()
    # 같은 word_id 다시 저장 → INSERT OR IGNORE → False
    result2 = save_word(conn, record)
    conn.commit()
    conn.close()
    assert result2 is False
    db_path.unlink()


# ── DocAgent.process (txt 파일로 통합 테스트) ─────────
def test_process_txt_file():
    content = "accomplish - 성취하다\nfreedom - 자유\ncourage - 용기\n"
    txt_path = make_txt_file(content)
    db_path = make_temp_db()

    agent = DocAgent(db_path=db_path)
    stats = agent.process(str(txt_path), level="고1", book_title="테스트교재")

    assert stats["total"] >= 3
    assert stats["saved"] >= 3
    assert stats["skipped"] == 0

    txt_path.unlink()
    db_path.unlink()


def test_process_missing_file():
    db_path = make_temp_db()
    agent = DocAgent(db_path=db_path)
    stats = agent.process("nonexistent_file.txt", level="고1", book_title="테스트")
    assert stats["total"] == 0
    assert stats["saved"] == 0
    db_path.unlink()


def test_process_empty_file():
    txt_path = make_txt_file("")
    db_path = make_temp_db()
    agent = DocAgent(db_path=db_path)
    stats = agent.process(str(txt_path), level="중2", book_title="빈파일")
    assert stats["saved"] == 0
    txt_path.unlink()
    db_path.unlink()


def test_process_deduplication():
    content = "run - 달리다\nrun - 뛰다\nrun - 운영하다\n"
    txt_path = make_txt_file(content)
    db_path = make_temp_db()
    agent = DocAgent(db_path=db_path)
    stats = agent.process(str(txt_path), level="중1", book_title="중복테스트")
    assert stats["saved"] == 1  # run은 한 번만 저장
    txt_path.unlink()
    db_path.unlink()


def test_process_words_in_db():
    content = "patience - 인내\nwisdom - 지혜\n"
    txt_path = make_txt_file(content)
    db_path = make_temp_db()
    agent = DocAgent(db_path=db_path)
    agent.process(str(txt_path), level="고2", book_title="고급단어")

    conn = sqlite3.connect(db_path)
    words = {r[0] for r in conn.execute("SELECT word FROM words").fetchall()}
    conn.close()
    assert "patience" in words
    assert "wisdom" in words

    txt_path.unlink()
    db_path.unlink()


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
