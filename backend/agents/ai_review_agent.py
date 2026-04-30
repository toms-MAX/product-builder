"""
ai_review_agent.py — AI 검수 에이전트 (자동 품질 평가 + 분류)
============================================================
검수 대기 중인 단어/문제에 AI 품질 점수를 자동 부여하고,
고품질 항목은 자동 승인, 저품질은 플래그 처리.

사용법:
    python backend/agents/ai_review_agent.py --scan-words
    python backend/agents/ai_review_agent.py --scan-questions
    python backend/agents/ai_review_agent.py --auto-approve --threshold 9
    python backend/agents/ai_review_agent.py --report
"""

import argparse
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.doc_agent import ensure_db
from backend.utils.ai_client import AIClient

DB_PATH = ROOT / "backend" / "db" / "qbank.db"

AUTO_APPROVE_THRESHOLD = 9  # quality_score >= 9 → 자동 승인 가능
AUTO_REJECT_THRESHOLD  = 3  # quality_score <= 3 → 플래그


class AIReviewAgent:
    def __init__(self, db_path=None, ai_client=None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.ai = ai_client or AIClient()

    def _connect(self) -> sqlite3.Connection:
        ensure_db(self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ── 단어 AI 검수 ─────────────────────────────────
    def scan_words(self, limit: int = 100) -> list[dict]:
        """미검수 단어 품질 평가. AI 없이도 코드 기반으로 동작."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT word_id, word, pos, level, meaning_ko, meaning_en,
                       example, synonyms, antonyms
                FROM words
                WHERE verified = 0
                LIMIT ?
            """, [limit]).fetchall()
            words = [dict(r) for r in rows]
        finally:
            conn.close()

        return [self._assess_word(w) for w in words]

    def _assess_word(self, word: dict) -> dict:
        """단어 품질 평가. 필드 완성도 기반 + AI 보조."""
        issues = []
        score = 10

        if not word.get("pos"):
            issues.append("품사 없음")
            score -= 3
        if not word.get("meaning_ko"):
            issues.append("한국어 뜻 없음")
            score -= 4
        if not word.get("meaning_en"):
            issues.append("영어 뜻 없음")
            score -= 1
        if not word.get("example"):
            issues.append("예문 없음")
            score -= 1
        if not word.get("level"):
            issues.append("레벨 없음")
            score -= 1

        # AI 보조 점수 (available 시 평균 반영)
        if self.ai.available and word.get("meaning_ko") and word.get("word"):
            ai_score = self.ai.score_quality(
                stem=f"{word['word']}: {word['meaning_ko']}",
            )
            score = (score + ai_score) // 2

        score = max(1, score)
        auto_action = _auto_action(score, issues)

        return {**word, "quality_score": score, "issues": issues, "auto_action": auto_action}

    # ── 문제 AI 검수 ─────────────────────────────────
    def scan_questions(self, limit: int = 100) -> list[dict]:
        """미검수 문제 품질 재평가. AI 가용 시 점수 갱신."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT question_id, grammar_point, level, q_type,
                       stem, choices, answer, quality_score
                FROM questions
                WHERE verified = 0
                LIMIT ?
            """, [limit]).fetchall()
            questions = [dict(r) for r in rows]
        finally:
            conn.close()

        results = []
        for q in questions:
            choices = _parse_choices(q.get("choices"))

            new_score = (
                self.ai.score_quality(stem=q["stem"], choices=choices or None, answer=q["answer"])
                if self.ai.available
                else q["quality_score"]
            )

            issues = []
            if "_____" not in (q["stem"] or ""):
                issues.append("빈칸 마커 없음")
            if not choices and q["q_type"] in ("FIB_MCQ", "ERR_ID"):
                issues.append("선택지 없음")
            if not q.get("answer"):
                issues.append("정답 없음")

            results.append({
                **q,
                "new_quality_score": new_score,
                "issues":            issues,
                "auto_action":       _auto_action(new_score, issues),
            })

        return results

    # ── DB 품질 점수 갱신 ────────────────────────────
    def update_quality_scores(self, question_results: list[dict]) -> int:
        """scan_questions 결과를 바탕으로 DB quality_score 업데이트."""
        if not question_results:
            return 0
        conn = self._connect()
        try:
            for q in question_results:
                new_score = q.get("new_quality_score", q.get("quality_score", 8))
                conn.execute(
                    "UPDATE questions SET quality_score=? WHERE question_id=?",
                    [new_score, q["question_id"]],
                )
            conn.commit()
            return len(question_results)
        finally:
            conn.close()

    # ── 자동 승인: 문제 ──────────────────────────────
    def auto_approve_questions(self, threshold: int = AUTO_APPROVE_THRESHOLD) -> int:
        """quality_score >= threshold + 빈칸/정답 모두 있는 문제 자동 승인."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT question_id, stem, choices, answer, quality_score
                FROM questions
                WHERE verified = 0 AND quality_score >= ?
            """, [threshold]).fetchall()

            to_approve = []
            for r in rows:
                if "_____" not in (r["stem"] or ""):
                    continue
                if not r["answer"]:
                    continue
                choices = _parse_choices(r["choices"])
                if not choices and r["quality_score"] < 9:
                    continue
                to_approve.append(r["question_id"])

            if to_approve:
                placeholders = ",".join("?" * len(to_approve))
                conn.execute(
                    f"UPDATE questions SET verified=1 WHERE question_id IN ({placeholders})",
                    to_approve,
                )
                conn.commit()
            return len(to_approve)
        finally:
            conn.close()

    # ── 자동 승인: 단어 ──────────────────────────────
    def auto_approve_words(self) -> int:
        """pos + meaning_ko + level 모두 있는 단어 자동 승인."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT word_id FROM words
                WHERE verified = 0
                  AND pos IS NOT NULL AND pos != ''
                  AND meaning_ko IS NOT NULL AND meaning_ko != ''
                  AND level IS NOT NULL AND level != ''
            """).fetchall()
            ids = [r["word_id"] for r in rows]
            if ids:
                placeholders = ",".join("?" * len(ids))
                conn.execute(
                    f"UPDATE words SET verified=1 WHERE word_id IN ({placeholders})",
                    ids,
                )
                conn.commit()
            return len(ids)
        finally:
            conn.close()

    # ── AI 검수 리포트 ───────────────────────────────
    def report(self) -> dict:
        """미검수 항목 전체 요약 리포트."""
        scan_w = self.scan_words(limit=200)
        scan_q = self.scan_questions(limit=200)

        def summarize(items, score_key="quality_score"):
            scores = [i.get(score_key, 0) for i in items]
            return {
                "scanned":      len(items),
                "auto_approve": sum(1 for i in items if i["auto_action"] == "auto_approve"),
                "manual":       sum(1 for i in items if i["auto_action"] == "manual"),
                "flag":         sum(1 for i in items if i["auto_action"] == "flag"),
                "avg_score":    round(sum(scores) / len(scores), 1) if scores else 0,
            }

        return {
            "report_at":    datetime.now().isoformat(),
            "ai_available": self.ai.available,
            "words":        summarize(scan_w),
            "questions":    summarize(scan_q, score_key="new_quality_score"),
            "flagged_words": [
                {"word_id": w["word_id"], "word": w["word"], "issues": w["issues"]}
                for w in scan_w if w["auto_action"] == "flag"
            ],
            "flagged_questions": [
                {"question_id": q["question_id"], "stem": (q["stem"] or "")[:60],
                 "issues": q["issues"], "score": q["new_quality_score"]}
                for q in scan_q if q["auto_action"] == "flag"
            ],
        }


# ── 내부 헬퍼 ─────────────────────────────────────────

def _parse_choices(raw) -> list:
    if not raw:
        return []
    try:
        c = json.loads(raw)
        return c if isinstance(c, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _auto_action(score: int, issues: list) -> str:
    if score >= AUTO_APPROVE_THRESHOLD and not issues:
        return "auto_approve"
    if score <= AUTO_REJECT_THRESHOLD:
        return "flag"
    return "manual"


# ── 출력 헬퍼 ─────────────────────────────────────────

def _print_report(rep: dict):
    print(f"\n{'='*58}")
    print(f"  AI 검수 에이전트 — 자동 평가 리포트")
    print(f"  AI 사용: {'✅' if rep['ai_available'] else '❌ (코드 기반 폴백)'}")
    print(f"  {rep['report_at']}")
    print(f"{'='*58}")

    for label, key in [("단어 (words)", "words"), ("문제 (questions)", "questions")]:
        s = rep[key]
        print(f"\n  [{label}]  검수 대기: {s['scanned']}개")
        print(f"  {'─'*40}")
        print(f"  🟢 자동승인 가능: {s['auto_approve']}개  (score ≥ {AUTO_APPROVE_THRESHOLD})")
        print(f"  🟡 수동 검토:     {s['manual']}개")
        print(f"  🔴 플래그:        {s['flag']}개  (score ≤ {AUTO_REJECT_THRESHOLD})")
        print(f"  평균 품질 점수:   {s['avg_score']}")

    if rep["flagged_words"]:
        print(f"\n  🔴 플래그 단어:")
        for w in rep["flagged_words"][:10]:
            print(f"    {w['word']:20} — {', '.join(w['issues'])}")

    if rep["flagged_questions"]:
        print(f"\n  🔴 플래그 문제:")
        for q in rep["flagged_questions"][:10]:
            print(f"    [{q['score']}점] {q['stem']} — {', '.join(q['issues'])}")
    print()


def _print_scan(items: list, kind: str):
    if not items:
        print(f"\n  검수 대기 {kind} 없음\n")
        return
    print(f"\n  AI 검수 결과 — {kind} ({len(items)}개)")
    print(f"  {'─'*55}")
    for i in items[:20]:
        action_icon = {"auto_approve": "🟢", "manual": "🟡", "flag": "🔴"}.get(
            i.get("auto_action", "manual"), "⬜"
        )
        if kind == "words":
            score = i.get("quality_score", "?")
            print(f"  {action_icon} [{score:>2}] {i.get('word','?'):20} "
                  f"[{i.get('pos','?'):10}] {i.get('level','?')}")
            if i.get("issues"):
                print(f"       ⚠ {', '.join(i['issues'])}")
        else:
            score = i.get("new_quality_score", "?")
            print(f"  {action_icon} [{score:>2}] {(i.get('stem') or '')[:55]}")
            if i.get("issues"):
                print(f"       ⚠ {', '.join(i['issues'])}")
    if len(items) > 20:
        print(f"  ... 외 {len(items)-20}개")
    print()


# ── CLI ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI 검수 에이전트 — 자동 품질 평가")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--scan-words",     action="store_true", help="미검수 단어 AI 평가")
    group.add_argument("--scan-questions", action="store_true", help="미검수 문제 AI 평가")
    group.add_argument("--auto-approve",   action="store_true", help="고품질 항목 자동 승인")
    group.add_argument("--report",         action="store_true", help="전체 AI 검수 리포트")
    parser.add_argument("--threshold", type=int, default=AUTO_APPROVE_THRESHOLD,
                        help=f"자동 승인 최소 점수 (기본: {AUTO_APPROVE_THRESHOLD})")
    parser.add_argument("--limit", type=int, default=50, help="스캔 최대 수 (기본: 50)")
    args = parser.parse_args()

    agent = AIReviewAgent()
    print(f"\n  AI 클라이언트: {'✅ Gemini 연결됨' if agent.ai.available else '❌ 폴백 모드'}")

    if args.scan_words:
        items = agent.scan_words(limit=args.limit)
        _print_scan(items, "단어")

    elif args.scan_questions:
        items = agent.scan_questions(limit=args.limit)
        updated = agent.update_quality_scores(items)
        _print_scan(items, "문제")
        print(f"  DB quality_score {updated}개 갱신 완료\n")

    elif args.auto_approve:
        w_cnt = agent.auto_approve_words()
        q_cnt = agent.auto_approve_questions(threshold=args.threshold)
        print(f"\n  ✅ 단어 자동 승인: {w_cnt}개")
        print(f"  ✅ 문제 자동 승인: {q_cnt}개  (점수 ≥ {args.threshold})\n")

    elif args.report:
        rep = agent.report()
        _print_report(rep)


if __name__ == "__main__":
    main()
