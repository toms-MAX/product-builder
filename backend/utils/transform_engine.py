"""
transform_engine.py — 저작권 안전 문제 변환 엔진
================================================
원본 교재 문제의 어휘를 DB 단어로 교체 → 새 문장, 같은 문법 구조.

교체 대상: 명사(주어·목적어), 일반 동사
유지 대상: 조동사, 전치사, 접속사, 관사, 관계사, 부사(already/just 등)
"""

import json
import random
import re
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
import sys

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.core.ontology import LEVEL_TO_GRADE

# ── 유지할 문법어 목록 ────────────────────────────────────────
GRAMMAR_WORDS: frozenset[str] = frozenset({
    # be 동사 · 조동사
    "am","is","are","was","were","be","been","being",
    "has","have","had",
    "will","would","shall","should","may","might","can","could","must","ought",
    "do","does","did",
    # 전치사
    "in","on","at","to","for","with","by","from","of","about","into","onto",
    "upon","since","until","during","before","after","between","through",
    "over","under","across","along","within","without","against","toward",
    "towards","despite","except","among","beyond","behind","beside","below",
    # 접속사
    "and","but","or","so","yet","nor","for",
    "because","although","though","if","unless","when","while",
    "after","before","since","until","as","once","whether","than",
    "that","which","who","whom","whose","where","wherever","whenever",
    # 관사
    "the","a","an",
    # 대명사
    "i","you","he","she","it","we","they",
    "me","him","her","us","them","myself","yourself","himself","herself",
    "my","your","his","its","our","their",
    "this","that","these","those","something","nothing","anything","everything",
    "someone","anyone","everyone","no","one","each","both","all","any","some",
    # 현재완료·진행 시제 신호 부사 (문법 포인트의 단서 → 유지)
    "already","just","yet","never","ever","recently","still","always","often",
    "sometimes","usually","frequently","seldom","hardly","barely","scarcely",
    # 빈도·정도 부사
    "not","no","very","too","so","quite","rather","enough","almost","nearly",
    "more","most","less","least","even","only","also","too","either","neither",
    # 시간·장소 부사
    "here","there","now","then","today","yesterday","tomorrow","soon","ago",
    "once","twice","again","always","never","long",
    # 의문사
    "how","what","when","where","why","whose",
    # 숫자·서수
    "one","two","three","four","five","six","seven","eight","nine","ten",
    "first","second","third","fourth","fifth",
})

# DB 형태 컬럼 매핑
FORM_COL = {
    "pp":   "verb_pp",
    "past": "verb_past",
    "ing":  "verb_ing",
    "base": "word",
}


# ── 동사 형태 감지 ────────────────────────────────────────────
def _detect_verb_form(word: str, prev_word: str) -> str:
    """
    동사 형태 감지.
    반환: "base" | "past" | "pp" | "ing"
    """
    prev = prev_word.lower().rstrip(".,;")

    if word.lower().endswith("ing"):
        return "ing"

    # 조동사 뒤 → p.p. 또는 base
    if prev in {"has", "have", "had", "is", "are", "was", "were",
                "be", "been", "being", "get", "got", "gotten",
                "was", "were", "is", "are", "been", "being"}:
        return "pp"

    if word.lower().endswith("ed"):
        return "past"

    return "base"


# ── 교체 가능 토큰 식별 ───────────────────────────────────────
def _swappable_tokens(stem: str) -> list[dict]:
    """
    stem에서 교체 가능한 위치 반환.
    반환: [{"word": str, "clean": str, "idx": int, "pos": str, "form": str}, ...]
    """
    tokens = stem.split()
    result = []

    for i, token in enumerate(tokens):
        # 빈칸은 절대 교체 안 함
        if "_____" in token:
            continue

        # 구두점 제거 후 원어 추출
        clean = re.sub(r"[^a-zA-Z'-]", "", token).lower()
        if not clean or len(clean) < 3:
            continue

        # 문법어 제외
        if clean in GRAMMAR_WORDS:
            continue

        # 숫자·기호로만 된 경우
        if not re.search(r"[a-zA-Z]", clean):
            continue

        # 품사 추측
        prev = re.sub(r"[^a-zA-Z]", "", tokens[i - 1]).lower() if i > 0 else ""
        next_ = re.sub(r"[^a-zA-Z]", "", tokens[i + 1]).lower() if i < len(tokens) - 1 else ""

        pos = _guess_pos(clean, prev, next_, i == 0)
        if pos is None:
            continue

        form = "base"
        if pos == "verb":
            form = _detect_verb_form(token, prev)

        result.append({
            "token": token,    # 원문 토큰 (구두점 포함 가능)
            "clean": clean,    # 소문자 알파벳만
            "idx":   i,
            "pos":   pos,
            "form":  form,
        })

    return result


def _guess_pos(word: str, prev: str, next_: str, is_first: bool) -> str | None:
    """
    문맥으로 품사 추측 (보수적 접근 — 확실한 경우만 교체).
    반환: "noun" | "verb" | None (불확실 → 교체 안 함)
    """
    # -ly 부사, -er/-or 비교급/동사 → 교체 안 함 (오분류 위험)
    if word.endswith("ly"):
        return None
    if word.endswith(("er", "or")) and len(word) <= 7:
        return None  # faster, harder, better 등 비교급 차단

    # ① 조동사 바로 뒤 → 동사 (가장 신뢰도 높음)
    if prev in {"has","have","had","is","are","was","were","will","would",
                "can","could","should","must","may","might","shall",
                "be","been","being","do","does","did","to"}:
        return "verb"

    # ② 관사·소유격 바로 뒤 → 명사
    if prev in {"the","a","an","my","your","his","her","its","our","their",
                "this","that","these","those","some","any","each","every","no"}:
        return "noun"

    # ③ 명사 접미사 (명확한 것만)
    if re.search(r"(tion|sion|ness|ment|ity|ship|ist|ism|ance|ence|ture)$", word):
        return "noun"

    # ④ 동사형 접미사 (-ed, -ing)
    if word.endswith("ed") or word.endswith("ing"):
        return "verb"

    # ⑤ 문장 첫 단어 대문자 → 명사(고유명사 포함)
    if is_first:
        return "noun"

    # 그 외: 교체하지 않음 (오분류 방지)
    return None


# ── DB에서 교체어 조회 ────────────────────────────────────────
def _fetch_replacement(pos: str, form: str, grade_num: int,
                       db_path: Path, used: set[str]) -> str | None:
    """DB에서 교체어 1개 반환. 없으면 None."""
    col = FORM_COL.get(form, "word")
    gmin = max(1, grade_num - 1)
    gmax = min(8, grade_num + 1)

    # 명사: 사람/직업 or 사물/행동 카테고리 우선
    if pos == "noun":
        cats = ("'사람/직업','사물','행동','추상개념'")
        query = f"""
            SELECT word FROM words
            WHERE pos='noun' AND verified=1
              AND grade_num BETWEEN ? AND ?
              AND category IN ({cats})
            ORDER BY RANDOM()
            LIMIT 20
        """
        params: list = [gmin, gmax]
    elif pos == "verb":
        query = f"""
            SELECT {col} AS w FROM words
            WHERE pos='verb' AND verified=1
              AND grade_num BETWEEN ? AND ?
              AND {col} IS NOT NULL AND {col} != ''
            ORDER BY RANDOM()
            LIMIT 20
        """
        params = [gmin, gmax]
    elif pos == "adjective":
        query = """
            SELECT word FROM words
            WHERE pos='adjective' AND verified=1
              AND grade_num BETWEEN ? AND ?
            ORDER BY RANDOM()
            LIMIT 20
        """
        params = [gmin, gmax]
    else:
        return None

    try:
        conn = sqlite3.connect(db_path)
        rows = conn.execute(query, params).fetchall()
        conn.close()
    except Exception:
        return None

    candidates = [r[0] for r in rows if r[0] and r[0].lower() not in used]
    return random.choice(candidates) if candidates else None


# ── 보기 유형 분류 ────────────────────────────────────────────
def _classify_choices(choices: list[str]) -> str:
    """
    보기 유형 분류.
    반환:
      "grammar_fixed"  — 모두 문법어 (has/have/had/is/was…)
      "verb_forms"     — 같은 동사의 활용형 (finish/finished/finishing/finishes)
      "sentences"      — 영어 문장 (ERR_ID)
      "unknown"        — 그 외
    """
    if not choices:
        return "unknown"

    # 모두 문법어?
    if all(c.strip().lower() in GRAMMAR_WORDS for c in choices):
        return "grammar_fixed"

    # 모두 문장 (3단어 이상)?
    if all(len(c.split()) >= 4 for c in choices):
        return "sentences"

    # 모두 단어이고 어근이 비슷하면 verb_forms
    if all(len(c.split()) == 1 for c in choices):
        # 첫 5글자 기준으로 어근 유사도 확인
        roots = set(c.lower()[:5] for c in choices)
        if len(roots) <= 2:
            return "verb_forms"

    return "unknown"


# ── 핵심: 단일 문제 변환 ──────────────────────────────────────
def transform_question(question: dict, db_path: Path) -> dict | None:
    """
    원본 추출 문제 → 저작권 안전 버전.

    반환: questions 테이블에 바로 INSERT 가능한 dict (verified=0)
          변환 불가 시 None
    """
    raw_stem     = question.get("raw_stem", "").strip()
    choices      = question.get("choices", [])
    answer_idx   = int(question.get("answer_idx") or 0)
    grammar_point = question.get("grammar_point")
    level        = question.get("level", "고1")
    source_book  = question.get("source_book", "교재")
    answer_hint  = question.get("answer")  # AI 제안 정답

    if not raw_stem or len(choices) < 2:
        return None

    grade_num     = LEVEL_TO_GRADE.get(level, 4)
    choice_type   = _classify_choices(choices)

    # ── 보기 유형별 처리 ──────────────────────────────────────
    new_stem    = raw_stem
    new_choices = list(choices)
    new_answer  = answer_hint or (choices[answer_idx] if 0 <= answer_idx < len(choices) else "")

    if choice_type == "grammar_fixed":
        # 보기는 문법어 → 그대로 유지, stem 어휘만 교체
        new_stem = _swap_vocab_in_stem(raw_stem, grade_num, db_path)

    elif choice_type == "verb_forms":
        # 보기가 같은 동사의 활용형 → 새 동사로 통째 교체
        original_answer_form = choices[answer_idx].strip().lower() if 0 <= answer_idx < len(choices) else ""
        new_verb_set = _replace_verb_choices(choices, answer_idx, grade_num, db_path)
        if new_verb_set:
            new_choices = new_verb_set["choices"]
            new_answer  = new_verb_set["answer"]
            # stem에서도 원래 보기 단어들 제거 후 stem 어휘 교체
            new_stem = _swap_vocab_in_stem(raw_stem, grade_num, db_path,
                                           exclude_words=set(c.lower() for c in choices))
        else:
            new_stem = _swap_vocab_in_stem(raw_stem, grade_num, db_path)

    elif choice_type == "sentences":
        # ERR_ID: 각 문장에서 어휘 교체 (오류 패턴은 유지)
        new_choices = _swap_vocab_in_choices_sentences(choices, grade_num, db_path)
        new_answer  = new_choices[answer_idx] if 0 <= answer_idx < len(new_choices) else new_choices[0]

    else:
        # unknown: stem만 교체, 보기 유지
        new_stem = _swap_vocab_in_stem(raw_stem, grade_num, db_path)

    # 변환 실패 시 원본 유지 (최소한 stem이 바뀌었는지 확인)
    if new_stem == raw_stem and new_choices == choices:
        return None  # 아무것도 못 바꿨으면 변환 실패

    # questions 테이블 레코드 생성
    return {
        "question_id":   str(uuid.uuid4()),
        "grammar_point": grammar_point,
        "level":         level,
        "q_type":        _infer_q_type(choice_type, raw_stem),
        "stem":          new_stem,
        "choices":       json.dumps(new_choices, ensure_ascii=False),
        "answer":        new_answer,
        "explanation":   None,
        "tags":          json.dumps([grammar_point or "미분류", level, "pdf추출"],
                                    ensure_ascii=False),
        "quality_score": 7,
        "verified":      0,
        "source":        f"pdf:{source_book}",
        "created_at":    datetime.now().isoformat(),
        "used_count":    0,
    }


def _infer_q_type(choice_type: str, stem: str) -> str:
    if choice_type == "sentences":
        return "ERR_ID"
    if "_____" in stem:
        return "FIB_MCQ"
    return "FIB_MCQ"


# ── stem 어휘 교체 ────────────────────────────────────────────
def _swap_vocab_in_stem(stem: str, grade_num: int, db_path: Path,
                        exclude_words: set[str] | None = None) -> str:
    """stem 안의 교체 가능한 단어를 DB 단어로 교체."""
    tokens  = stem.split()
    swappable = _swappable_tokens(stem)

    if not swappable:
        return stem

    used: set[str] = set(exclude_words or [])
    # 기존 문장 단어들도 used에 추가 (중복 방지)
    used.update(t["clean"] for t in swappable)

    replacements: dict[int, str] = {}  # token_idx → new_word

    for sw in swappable:
        new_word = _fetch_replacement(sw["pos"], sw["form"], grade_num, db_path, used)
        if new_word:
            replacements[sw["idx"]] = new_word
            used.add(new_word.lower())

    if not replacements:
        return stem

    new_tokens = list(tokens)
    for idx, new_word in replacements.items():
        orig = tokens[idx]
        # 구두점 보존: 원본 토큰 끝 구두점이 있으면 붙임
        punct = ""
        if orig and orig[-1] in ".,;:!?":
            punct = orig[-1]
        new_tokens[idx] = new_word + punct

    return " ".join(new_tokens)


# ── verb_forms 보기 교체 ─────────────────────────────────────
def _replace_verb_choices(choices: list[str], answer_idx: int,
                          grade_num: int, db_path: Path) -> dict | None:
    """
    동사 활용형 보기를 새 동사의 활용형으로 교체.
    반환: {"choices": [...], "answer": str} 또는 None
    """
    gmin = max(1, grade_num - 1)
    gmax = min(8, grade_num + 1)

    try:
        conn = sqlite3.connect(db_path)
        rows = conn.execute("""
            SELECT word, verb_past, verb_pp, verb_ing
            FROM words
            WHERE pos='verb' AND verified=1
              AND grade_num BETWEEN ? AND ?
              AND verb_past IS NOT NULL AND verb_past != ''
              AND verb_pp   IS NOT NULL AND verb_pp   != ''
              AND verb_ing  IS NOT NULL AND verb_ing  != ''
            ORDER BY RANDOM()
            LIMIT 10
        """, [gmin, gmax]).fetchall()
        conn.close()
    except Exception:
        return None

    if not rows:
        return None

    base, past, pp, ing = random.choice(rows)
    third_sg = _third_sg(base)

    # 원본 보기의 형태를 감지하여 새 동사의 같은 형태로 교체
    form_map = {
        "base": base, "past": past, "pp": pp, "ing": ing, "3sg": third_sg
    }

    def _detect_form_from_word(w: str) -> str:
        w = w.lower().strip()
        if w.endswith("ing"):
            return "ing"
        if w.endswith("ed"):
            return "pp"
        if w.endswith(("s","es")) and not w.endswith("ss"):
            return "3sg"
        return "base"

    new_choices = []
    for c in choices:
        form = _detect_form_from_word(c)
        new_choices.append(form_map.get(form, base))

    new_answer = new_choices[answer_idx] if 0 <= answer_idx < len(new_choices) else new_choices[0]
    return {"choices": new_choices, "answer": new_answer}


def _third_sg(base: str) -> str:
    """기본형 → 3인칭 단수 현재형."""
    if base.endswith(("s","x","z","o")) or base.endswith(("ch","sh")):
        return base + "es"
    if base.endswith("y") and base[-2:-1] not in "aeiou":
        return base[:-1] + "ies"
    return base + "s"


# ── ERR_ID 보기 문장 어휘 교체 ───────────────────────────────
def _swap_vocab_in_choices_sentences(choices: list[str],
                                     grade_num: int, db_path: Path) -> list[str]:
    """ERR_ID 보기(문장 형태) 각각의 어휘 교체."""
    new_choices = []
    used: set[str] = set()

    for sentence in choices:
        new_sent = _swap_vocab_in_stem(sentence, grade_num, db_path, exclude_words=used)
        # 새로 쓴 단어들을 used에 등록 (다음 보기와 중복 방지)
        for tok in new_sent.split():
            clean = re.sub(r"[^a-zA-Z]", "", tok).lower()
            if clean:
                used.add(clean)
        new_choices.append(new_sent)

    return new_choices


# ── 배치 변환 ─────────────────────────────────────────────────
def transform_batch(questions: list[dict], db_path: Path) -> list[dict]:
    """
    여러 문제를 한 번에 변환.
    변환 실패한 문제는 결과에서 제외.
    반환: questions 테이블 레코드 리스트
    """
    results = []
    for q in questions:
        transformed = transform_question(q, db_path)
        if transformed:
            results.append(transformed)
    return results
