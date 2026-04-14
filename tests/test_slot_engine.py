"""
tests/test_slot_engine.py — SlotEngine 테스트
DB 없이도 폴백 단어풀로 모든 테스트가 통과해야 함.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.utils.slot_engine import SlotEngine, FALLBACK_WORDS, SLOT_MAP


def make_engine():
    """DB 없는 엔진 (폴백 모드)"""
    return SlotEngine(db_path="nonexistent_db.db")


# ── pick_word ──────────────────────────────────────────
def test_pick_word_returns_dict():
    engine = make_engine()
    result = engine.pick_word("SUBJECT_PERSON", grade_num=4)
    assert isinstance(result, dict)
    assert "word" in result


def test_pick_word_uses_fallback_when_no_db():
    engine = make_engine()
    for slot in SLOT_MAP:
        result = engine.pick_word(slot, grade_num=4)
        assert result["word"], f"empty word for slot {slot}"


def test_pick_word_exclude():
    engine = make_engine()
    fallback_words = {w["word"] for w in FALLBACK_WORDS["SUBJECT_PERSON"]}
    # 폴백 단어풀 전부 제외하면 플레이스홀더 반환
    result = engine.pick_word("SUBJECT_PERSON", exclude=fallback_words)
    assert result["word"] == "[SUBJECT_PERSON]"


def test_pick_word_unknown_slot():
    engine = make_engine()
    result = engine.pick_word("UNKNOWN_SLOT", grade_num=4)
    assert result["word"] == "[UNKNOWN_SLOT]"


# ── fill_template ─────────────────────────────────────
def test_fill_template_replaces_slots():
    engine = make_engine()
    result = engine.fill_template("{SUBJECT_PERSON} has already {VERB_PP} {OBJECT_THING}.", grade_num=4)
    assert "stem" in result
    assert "{" not in result["stem"], f"unreplaced slot in: {result['stem']}"


def test_fill_template_no_slots():
    engine = make_engine()
    result = engine.fill_template("This is a plain sentence.", grade_num=3)
    assert result["stem"] == "This is a plain sentence."
    assert result["slots"] == {}


def test_fill_template_slots_dict():
    engine = make_engine()
    result = engine.fill_template("{SUBJECT_PERSON} is {ADJ_POSITIVE}.", grade_num=2)
    assert "SUBJECT_PERSON" in result["slots"]
    assert "ADJ_POSITIVE" in result["slots"]


def test_fill_template_no_duplicate_words():
    engine = make_engine()
    # 같은 슬롯 타입이 두 번 나와도 다른 단어가 와야 함
    result = engine.fill_template("{VERB_PP} and {VERB_PP} again.", grade_num=4)
    slots = list(result["slots"].values())
    if len(slots) >= 2:
        assert slots[0]["word"] != slots[1]["word"], "duplicate word used in same template"


# ── shuffle_choices ───────────────────────────────────
def test_shuffle_choices_answer_in_result():
    engine = make_engine()
    choices = ["completed", "finishing", "prepare", "submits"]
    shuffled, idx = engine.shuffle_choices(choices, "completed")
    assert shuffled[idx] == "completed"


def test_shuffle_choices_length_preserved():
    engine = make_engine()
    choices = ["a", "b", "c", "d", "e"]
    shuffled, idx = engine.shuffle_choices(choices, "b")
    assert len(shuffled) == 5
    assert 0 <= idx < 5


def test_shuffle_choices_answer_not_in_choices():
    engine = make_engine()
    shuffled, idx = engine.shuffle_choices(["a", "b", "c"], "z")
    assert idx == -1


def test_shuffle_choices_single_item():
    engine = make_engine()
    shuffled, idx = engine.shuffle_choices(["only"], "only")
    assert shuffled[idx] == "only"


# ── make_choices ──────────────────────────────────────
def test_make_choices_correct_in_result():
    engine = make_engine()
    choices, idx = engine.make_choices("completed", "VERB_PP", grade_num=4, count=4)
    assert "completed" in choices
    assert choices[idx] == "completed"


def test_make_choices_count():
    engine = make_engine()
    choices, idx = engine.make_choices("teacher", "SUBJECT_PERSON", grade_num=4, count=4)
    # 정답 1 + 오답 최대 4 = 최대 5개 (폴백 단어풀 크기에 따라 더 적을 수 있음)
    assert len(choices) >= 1
    assert choices[idx] == "teacher"


def test_make_choices_no_duplicates():
    engine = make_engine()
    choices, _ = engine.make_choices("teacher", "SUBJECT_PERSON", grade_num=4, count=4)
    assert len(choices) == len(set(choices)), "duplicate choices found"


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
