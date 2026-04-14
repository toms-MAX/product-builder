"""
gen_agent.py — GEN 에이전트 (문제 생성)
=========================================
4단계 폴백 구조로 AI 없이도 완전 동작.

1순위: DB 검수완료 캐시 (verified=1)      → AI 0%
2순위: 템플릿 × DB 단어 조합              → AI 0%
3순위: AI가 조합 선택 (select_combo)      → AI 5%
4순위: 내장 기본 단어풀                   → AI 0%

사용법:
    python backend/agents/gen_agent.py --grammar 현재완료 --level 고1 --count 5
"""

import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.utils.ai_client import AIClient
from backend.utils.slot_engine import SlotEngine, FALLBACK_WORDS, SLOT_MAP
from backend.agents.doc_agent import ensure_db

DB_PATH = ROOT / "backend" / "db" / "qbank.db"

LEVEL_TO_GRADE = {
    "중1": 1, "중2": 2, "중3": 3,
    "고1": 4, "고2": 5, "고3": 6,
    "수능": 7, "수능고급": 8,
}


class GenAgent:
    def __init__(self, db_path: Path | str | None = None,
                 ai_client: AIClient | None = None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.ai = ai_client or AIClient()
        self.slot = SlotEngine(db_path=self.db_path)

    def _connect(self) -> sqlite3.Connection:
        ensure_db(self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ── 1순위: DB 검수완료 캐시 ───────────────────────
    def _from_cache(self, grammar_point: str, level: str,
                    count: int, exclude_ids: set[str]) -> list[dict]:
        """verified=1 인 완성 문제를 DB에서 바로 꺼냄."""
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT * FROM questions
                WHERE verified = 1
                  AND grammar_point = ?
                  AND level = ?
                  AND question_id NOT IN ({placeholders})
                ORDER BY used_count ASC, quality_score DESC
                LIMIT ?
                """.format(
                    placeholders=",".join("?" * len(exclude_ids)) if exclude_ids else "''"
                ),
                [grammar_point, level, *list(exclude_ids), count],
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ── 2순위: 템플릿 × DB/폴백 단어 (AI 없음) ────────
    def _from_template(self, grammar_point: str, level: str,
                       count: int, use_ai: bool = False) -> list[dict]:
        """템플릿을 슬롯 엔진으로 채워 문제 생성."""
        grade_num = LEVEL_TO_GRADE.get(level, 4)
        conn = self._connect()

        try:
            templates = conn.execute(
                """
                SELECT * FROM templates
                WHERE grammar_point LIKE ?
                  AND level_min <= ?
                  AND level_max >= ?
                  AND verified = 1
                """,
                [f"%{grammar_point}%", grade_num, grade_num],
            ).fetchall()
        finally:
            conn.close()

        if not templates:
            # 문법 포인트 무관하게 전체 템플릿에서 시도
            conn = self._connect()
            try:
                templates = conn.execute(
                    "SELECT * FROM templates WHERE verified = 1 LIMIT 10"
                ).fetchall()
            finally:
                conn.close()

        questions = []
        for tmpl in templates:
            if len(questions) >= count:
                break

            tmpl = dict(tmpl)
            stem_template = tmpl.get("stem_template", "")

            # {SLOT} 이 없으면 템플릿 그대로 stem 사용
            import re
            slots_in_tmpl = re.findall(r"\{([A-Z_]+)\}", stem_template)

            if not slots_in_tmpl:
                stem = stem_template
                slot_result = {}
            elif use_ai and self.ai.available:
                # 3순위: AI가 후보 중 조합 선택
                candidates = {}
                for slot in slots_in_tmpl:
                    words = self.slot._fetch_from_db(slot, grade_num, set())
                    candidates[slot] = [w["word"] for w in words] if words \
                        else [w["word"] for w in FALLBACK_WORDS.get(slot, [])]
                selected = self.ai.select_combo(stem_template, candidates)
                slot_result = selected
                stem = stem_template
                for s, w in selected.items():
                    stem = stem.replace(f"{{{s}}}", w)
            else:
                # 2순위: 코드로 직접 채움
                filled = self.slot.fill_template(stem_template, grade_num)
                stem = filled["stem"]
                slot_result = {k: v["word"] for k, v in filled["slots"].items()}

            # 오답 보기 생성 (answer_slot 기준)
            answer_slot = tmpl.get("answer_slot")
            answer_word = slot_result.get(answer_slot, "") if answer_slot else ""

            if answer_slot and answer_word:
                choices, answer_idx = self.slot.make_choices(
                    answer_word, answer_slot, grade_num, count=4
                )
                answer = choices[answer_idx] if answer_idx >= 0 else answer_word
            else:
                choices = []
                answer = answer_word or ""

            questions.append({
                "question_id":   str(uuid.uuid4()),
                "grammar_point": grammar_point,
                "level":         level,
                "q_type":        tmpl.get("q_type", "FIB_MCQ"),
                "stem":          stem,
                "choices":       json.dumps(choices, ensure_ascii=False),
                "answer":        answer,
                "explanation":   None,
                "tags":          json.dumps([grammar_point, level], ensure_ascii=False),
                "quality_score": 8,
                "verified":      0,
                "source":        f"template:{tmpl.get('template_id', '')}",
                "created_at":    datetime.now().isoformat(),
                "used_count":    0,
            })

        return questions

    # ── 4순위: 내장 기본 단어풀로 문제 생성 ──────────
    def _from_builtin(self, grammar_point: str, level: str, count: int) -> list[dict]:
        """DB·템플릿·AI 모두 없을 때 최후 폴백."""
        import random
        grade_num = LEVEL_TO_GRADE.get(level, 4)
        questions = []

        subjects = [w["word"] for w in FALLBACK_WORDS["SUBJECT_PERSON"]]
        verbs_pp = [w["word"] for w in FALLBACK_WORDS["VERB_PP"]]
        objects  = [w["word"] for w in FALLBACK_WORDS["OBJECT_THING"]]

        for _ in range(count):
            subj = random.choice(subjects)
            vpp  = random.choice(verbs_pp)
            obj  = random.choice(objects)
            stem = f"The {subj} has already _____ the {obj}."

            choices, idx = self.slot.make_choices(vpp, "VERB_PP", grade_num, count=4)
            answer = choices[idx] if idx >= 0 else vpp

            questions.append({
                "question_id":   str(uuid.uuid4()),
                "grammar_point": grammar_point,
                "level":         level,
                "q_type":        "FIB_MCQ",
                "stem":          stem,
                "choices":       json.dumps(choices, ensure_ascii=False),
                "answer":        answer,
                "explanation":   None,
                "tags":          json.dumps([grammar_point, level, "builtin"],
                                            ensure_ascii=False),
                "quality_score": 6,
                "verified":      0,
                "source":        "builtin",
                "created_at":    datetime.now().isoformat(),
                "used_count":    0,
            })

        return questions

    # ── DB 저장 ───────────────────────────────────────
    def _save_questions(self, questions: list[dict]):
        if not questions:
            return
        conn = self._connect()
        try:
            conn.executemany(
                """
                INSERT OR IGNORE INTO questions
                  (question_id, grammar_point, level, q_type, stem,
                   choices, answer, explanation, tags,
                   quality_score, verified, source, created_at, used_count)
                VALUES
                  (:question_id, :grammar_point, :level, :q_type, :stem,
                   :choices, :answer, :explanation, :tags,
                   :quality_score, :verified, :source, :created_at, :used_count)
                """,
                questions,
            )
            conn.commit()
        finally:
            conn.close()

    def _increment_used(self, question_ids: list[str]):
        if not question_ids:
            return
        conn = self._connect()
        try:
            conn.executemany(
                "UPDATE questions SET used_count = used_count + 1 WHERE question_id = ?",
                [(qid,) for qid in question_ids],
            )
            conn.commit()
        finally:
            conn.close()

    # ── 메인: 4단계 폴백 ──────────────────────────────
    def generate(self, grammar_point: str, level: str, count: int = 5,
                 exclude_ids: set[str] | None = None) -> list[dict]:
        """
        문제 count개 생성.
        반환: questions 테이블 레코드 리스트
        """
        exclude_ids = exclude_ids or set()
        result: list[dict] = []
        remaining = count

        print(f"\n  [GEN] {grammar_point} / {level} / {count}개 요청")

        # 1순위: DB 캐시
        cached = self._from_cache(grammar_point, level, remaining, exclude_ids)
        if cached:
            print(f"  [1순위] DB 캐시 {len(cached)}개")
            self._increment_used([q["question_id"] for q in cached])
            result.extend(cached)
            remaining -= len(cached)

        # 2순위: 템플릿 × 단어 (AI 없음)
        if remaining > 0:
            tmpl_q = self._from_template(grammar_point, level, remaining, use_ai=False)
            if tmpl_q:
                print(f"  [2순위] 템플릿 조합 {len(tmpl_q)}개")
                self._save_questions(tmpl_q)
                result.extend(tmpl_q)
                remaining -= len(tmpl_q)

        # 3순위: AI 조합 선택
        if remaining > 0 and self.ai.available:
            ai_q = self._from_template(grammar_point, level, remaining, use_ai=True)
            if ai_q:
                print(f"  [3순위] AI 조합 {len(ai_q)}개")
                self._save_questions(ai_q)
                result.extend(ai_q)
                remaining -= len(ai_q)

        # 4순위: 내장 기본 단어풀
        if remaining > 0:
            builtin_q = self._from_builtin(grammar_point, level, remaining)
            print(f"  [4순위] 내장 폴백 {len(builtin_q)}개")
            self._save_questions(builtin_q)
            result.extend(builtin_q)

        return result[:count]


# ── CLI ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="GEN 에이전트 — 문법 문제 생성")
    parser.add_argument("--grammar", required=True, help="문법 포인트 (예: 현재완료)")
    parser.add_argument("--level",   required=True,
                        choices=list(LEVEL_TO_GRADE.keys()), help="난이도 레벨")
    parser.add_argument("--count",   type=int, default=5, help="생성할 문제 수")
    args = parser.parse_args()

    agent = GenAgent()
    questions = agent.generate(args.grammar, args.level, args.count)

    print(f"\n{'='*55}")
    print(f"  생성 완료: {len(questions)}개")
    print(f"{'='*55}")
    for i, q in enumerate(questions, 1):
        choices = json.loads(q["choices"]) if q["choices"] else []
        print(f"\n  [{i}] {q['q_type']}  출처: {q['source']}")
        print(f"  {q['stem']}")
        for j, c in enumerate(choices):
            marker = "★" if c == q["answer"] else " "
            print(f"    {marker} {j+1}. {c}")
        if not choices:
            print(f"  정답: {q['answer']}")


if __name__ == "__main__":
    main()
