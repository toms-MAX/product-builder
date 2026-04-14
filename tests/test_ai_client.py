"""
tests/test_ai_client.py — AIClient 폴백 동작 테스트
API 키 없이도 모든 테스트가 통과해야 함.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.utils.ai_client import AIClient


def make_client():
    """API 키 없는 클라이언트 (폴백 모드)"""
    return AIClient(api_key=None)


# ── 1. read_image ──────────────────────────────────────
def test_read_image_missing_file():
    client = make_client()
    result = client.read_image("nonexistent.png")
    assert result == "", f"expected '', got {result!r}"


def test_read_image_no_api():
    client = make_client()
    assert not client.available
    result = client.read_image("any_path.jpg")
    assert isinstance(result, str)


# ── 2. classify_level ─────────────────────────────────
def test_classify_level_fallback():
    client = make_client()
    result = client.classify_level("accomplish")
    assert result == "중2"


def test_classify_level_empty():
    client = make_client()
    result = client.classify_level("")
    assert result == "중2"


def test_classify_level_returns_valid_string():
    client = make_client()
    result = client.classify_level("serendipity")
    valid = {"중1","중2","중3","고1","고2","고3","수능","수능고급"}
    assert result in valid, f"invalid level: {result}"


# ── 3. classify_pos ───────────────────────────────────
def test_classify_pos_fallback():
    client = make_client()
    result = client.classify_pos("run")
    assert result == "noun"


def test_classify_pos_empty():
    client = make_client()
    result = client.classify_pos("")
    assert result == "noun"


def test_classify_pos_returns_valid():
    client = make_client()
    result = client.classify_pos("beautiful")
    assert result in {"noun", "verb", "adjective", "adverb"}


# ── 4. score_quality ──────────────────────────────────
def test_score_quality_fallback():
    client = make_client()
    score = client.score_quality("She ___ the project yesterday.", ["completed", "complete"], "completed")
    assert score == 8


def test_score_quality_empty_stem():
    client = make_client()
    score = client.score_quality("")
    assert score == 8


def test_score_quality_range():
    client = make_client()
    score = client.score_quality("Test sentence.")
    assert 1 <= score <= 10, f"score out of range: {score}"


# ── 5. select_combo ───────────────────────────────────
def test_select_combo_fallback_first_word():
    client = make_client()
    candidates = {
        "SUBJECT_PERSON": ["teacher", "doctor"],
        "VERB_PP": ["completed", "finished"],
    }
    result = client.select_combo("{SUBJECT_PERSON} has {VERB_PP} the task.", candidates)
    assert result["SUBJECT_PERSON"] == "teacher"
    assert result["VERB_PP"] == "completed"


def test_select_combo_empty_candidates():
    client = make_client()
    result = client.select_combo("template", {})
    assert result == {}


def test_select_combo_returns_all_slots():
    client = make_client()
    candidates = {
        "SUBJECT_PERSON": ["student"],
        "OBJECT_THING":   ["book", "report"],
    }
    result = client.select_combo("{SUBJECT_PERSON} read {OBJECT_THING}.", candidates)
    assert "SUBJECT_PERSON" in result
    assert "OBJECT_THING" in result


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
