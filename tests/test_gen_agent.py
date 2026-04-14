"""
tests/test_gen_agent.py — GenAgent 테스트
DB/AI 없이 폴백으로 모든 테스트가 통과해야 함.
"""

import json
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.agents.doc_agent import ensure_db
from backend.agents.gen_agent import GenAgent


# ── 헬퍼 ──────────────────────────────────────────────
def make_temp_db() -> Path:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_path = Path(tmp.name)
    ensure_db(db_path)
    return db_path


def make_agent(db_path: Path) -> GenAgent:
    return GenAgent(db_path=db_path, ai_client=None)


# ── generate 기본 동작 ────────────────────────────────
def test_generate_returns_list():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("현재완료", "고1", count=3)
    assert isinstance(result, list)
    db.unlink()


def test_generate_count_respected():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("수동태", "중3", count=3)
    assert len(result) == 3
    db.unlink()


def test_generate_question_fields():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("관계사", "고2", count=1)
    assert len(result) == 1
    q = result[0]
    required = {"question_id", "grammar_point", "level", "q_type",
                "stem", "choices", "answer", "created_at"}
    assert required.issubset(q.keys()), f"누락 필드: {required - q.keys()}"
    db.unlink()


def test_generate_level_correct():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("가정법", "수능", count=2)
    for q in result:
        assert q["level"] == "수능"
    db.unlink()


def test_generate_grammar_point_correct():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("현재완료", "고1", count=2)
    for q in result:
        assert q["grammar_point"] == "현재완료"
    db.unlink()


# ── 4순위 폴백 동작 확인 ──────────────────────────────
def test_generate_fallback_produces_stem():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("없는문법포인트XYZ", "고1", count=2)
    for q in result:
        assert q["stem"], "stem이 비어 있음"
    db.unlink()


def test_generate_fallback_source_builtin():
    db = make_temp_db()
    agent = make_agent(db)
    # 템플릿도 없고 캐시도 없는 상황 → 4순위 폴백
    result = agent.generate("없는문법포인트XYZ", "고3", count=2)
    for q in result:
        assert q["source"] in ("builtin", ) or q["source"].startswith("template:")
    db.unlink()


# ── 저장 및 중복 방지 ─────────────────────────────────
def test_generate_saves_to_db():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("현재완료", "고1", count=2)

    conn = sqlite3.connect(db)
    count = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    conn.close()
    assert count >= 1
    db.unlink()


def test_generate_exclude_ids():
    db = make_temp_db()
    agent = make_agent(db)

    # 1차 생성
    first = agent.generate("현재완료", "고1", count=3)
    first_ids = {q["question_id"] for q in first}

    # 2차 생성 시 1차 ID 제외
    second = agent.generate("현재완료", "고1", count=3, exclude_ids=first_ids)
    second_ids = {q["question_id"] for q in second}

    # 새로 생성된 문제는 이전 캐시 ID와 겹치면 안 됨
    # (캐시 문제는 exclude_ids로 걸러짐)
    overlap = first_ids & second_ids
    assert not overlap, f"중복 문제 발견: {overlap}"
    db.unlink()


# ── choices JSON 형식 ─────────────────────────────────
def test_generate_choices_valid_json():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("현재완료", "고1", count=2)
    for q in result:
        choices = json.loads(q["choices"])
        assert isinstance(choices, list)
    db.unlink()


def test_generate_answer_in_choices():
    db = make_temp_db()
    agent = make_agent(db)
    result = agent.generate("현재완료", "고1", count=3)
    for q in result:
        choices = json.loads(q["choices"])
        if choices and q["answer"]:
            assert q["answer"] in choices, \
                f"정답 '{q['answer']}' 이 보기에 없음: {choices}"
    db.unlink()


# ── 1순위: 캐시 문제 반환 ─────────────────────────────
def test_generate_uses_cache_first():
    db = make_temp_db()

    # 검수완료 문제를 수동으로 DB에 삽입
    conn = sqlite3.connect(db)
    conn.execute(
        """
        INSERT INTO questions
          (question_id, grammar_point, level, q_type, stem,
           choices, answer, tags, quality_score, verified, source, created_at, used_count)
        VALUES
          ('cached-001', '현재완료', '고1', 'FIB_MCQ',
           'She has already ___ the report.',
           '["completed","finishing","prepare","submits"]',
           'completed', '["현재완료","고1"]', 9, 1, 'manual', '2026-01-01', 0)
        """
    )
    conn.commit()
    conn.close()

    agent = make_agent(db)
    result = agent.generate("현재완료", "고1", count=1)
    assert result[0]["question_id"] == "cached-001"
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
