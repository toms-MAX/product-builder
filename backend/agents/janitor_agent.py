"""
janitor_agent.py — JANITOR 에이전트 (DB 진단 + 자동 수리 + 건강 리포트)
=========================================================================
DB 문제를 자동 탐지하고 고치고 보고한다.

탐지 항목:
  - 중복 단어 (같은 word 값)
  - 필드 누락 (pos, meaning_ko 없음)
  - 문제 stem 비어있음 / answer 없음 / choices JSON 파손
  - 템플릿 미지원 슬롯 사용
  - 저품질 미검수 문제 (score <= 4)

사용법:
    python backend/agents/janitor_agent.py --scan
    python backend/agents/janitor_agent.py --fix
    python backend/agents/janitor_agent.py --health
    python backend/agents/janitor_agent.py --full    # scan + fix + health
"""

import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.doc_agent import ensure_db
from backend.core.ontology import SLOT_MAP

DB_PATH = ROOT / "backend" / "db" / "qbank.db"
LOW_QUALITY_THRESHOLD = 4  # quality_score <= 이 값이면 저품질


class JanitorAgent:
    def __init__(self, db_path=None):
        self.db_path = Path(db_path) if db_path else DB_PATH

    def _connect(self) -> sqlite3.Connection:
        ensure_db(self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ──────────────────────────────────────────────────
    # SCAN: 문제 탐지
    # ──────────────────────────────────────────────────

    def scan_duplicate_words(self) -> list[dict]:
        """같은 word(대소문자 무시) 중복 탐지."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT word,
                       COUNT(*) AS cnt,
                       GROUP_CONCAT(word_id, ',') AS ids
                FROM words
                GROUP BY LOWER(TRIM(word))
                HAVING cnt > 1
            """).fetchall()
            return [
                {
                    "type":  "duplicate_word",
                    "word":  r["word"],
                    "count": r["cnt"],
                    "ids":   r["ids"].split(","),
                }
                for r in rows
            ]
        finally:
            conn.close()

    def scan_incomplete_words(self) -> list[dict]:
        """pos 또는 meaning_ko 누락 단어 탐지."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT word_id, word, pos, meaning_ko
                FROM words
                WHERE (pos IS NULL OR TRIM(pos) = '')
                   OR (meaning_ko IS NULL OR TRIM(meaning_ko) = '')
            """).fetchall()
            issues = []
            for r in rows:
                missing = []
                if not (r["pos"] and r["pos"].strip()):
                    missing.append("pos")
                if not (r["meaning_ko"] and r["meaning_ko"].strip()):
                    missing.append("meaning_ko")
                issues.append({
                    "type":           "incomplete_word",
                    "word_id":        r["word_id"],
                    "word":           r["word"],
                    "missing_fields": missing,
                })
            return issues
        finally:
            conn.close()

    def scan_broken_questions(self) -> list[dict]:
        """stem 비어있거나 answer 없거나 choices JSON 파손 문제 탐지."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT question_id, stem, answer, choices, q_type
                FROM questions
            """).fetchall()
            issues = []
            for r in rows:
                problems = []
                if not (r["stem"] and r["stem"].strip()):
                    problems.append("empty_stem")
                if not (r["answer"] and r["answer"].strip()):
                    problems.append("empty_answer")
                if r["choices"]:
                    try:
                        c = json.loads(r["choices"])
                        if not isinstance(c, list):
                            problems.append("choices_not_list")
                    except (json.JSONDecodeError, TypeError):
                        problems.append("choices_json_error")
                if problems:
                    issues.append({
                        "type":         "broken_question",
                        "question_id":  r["question_id"],
                        "q_type":       r["q_type"],
                        "problems":     problems,
                        "stem_preview": (r["stem"] or "")[:60],
                    })
            return issues
        finally:
            conn.close()

    def scan_broken_templates(self) -> list[dict]:
        """stem_template에 SLOT_MAP에 없는 슬롯이 있는 템플릿 탐지."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT template_id, grammar_point, stem_template FROM templates"
            ).fetchall()
        finally:
            conn.close()

        valid_slots = set(SLOT_MAP.keys())
        issues = []
        for r in rows:
            tmpl = r["stem_template"] or ""
            slots = set(re.findall(r"\{([A-Z_]+)\}", tmpl))
            unknown = slots - valid_slots
            if unknown:
                issues.append({
                    "type":          "unknown_slots",
                    "template_id":   r["template_id"],
                    "grammar_point": r["grammar_point"],
                    "unknown_slots": list(unknown),
                    "stem_preview":  tmpl[:60],
                })
        return issues

    def scan_low_quality_questions(self) -> list[dict]:
        """quality_score <= LOW_QUALITY_THRESHOLD 이고 미검수인 문제 탐지."""
        conn = self._connect()
        try:
            rows = conn.execute("""
                SELECT question_id, grammar_point, level, q_type, quality_score, stem
                FROM questions
                WHERE verified = 0 AND quality_score <= ?
                ORDER BY quality_score ASC
            """, [LOW_QUALITY_THRESHOLD]).fetchall()
            return [
                {
                    "type":          "low_quality",
                    "question_id":   r["question_id"],
                    "quality_score": r["quality_score"],
                    "grammar_point": r["grammar_point"],
                    "level":         r["level"],
                    "stem_preview":  (r["stem"] or "")[:60],
                }
                for r in rows
            ]
        finally:
            conn.close()

    def scan_all(self) -> dict:
        """전체 스캔. 모든 문제 유형 포함한 결과 딕셔너리 반환."""
        duplicates  = self.scan_duplicate_words()
        incomplete  = self.scan_incomplete_words()
        broken_q    = self.scan_broken_questions()
        broken_tmpl = self.scan_broken_templates()
        low_quality = self.scan_low_quality_questions()

        return {
            "scanned_at":             datetime.now().isoformat(),
            "duplicate_words":        {"count": len(duplicates),  "items": duplicates},
            "incomplete_words":       {"count": len(incomplete),   "items": incomplete},
            "broken_questions":       {"count": len(broken_q),     "items": broken_q},
            "broken_templates":       {"count": len(broken_tmpl),  "items": broken_tmpl},
            "low_quality_questions":  {"count": len(low_quality),  "items": low_quality},
            "total_issues": (
                len(duplicates) + len(incomplete) +
                len(broken_q)   + len(broken_tmpl) + len(low_quality)
            ),
        }

    # ──────────────────────────────────────────────────
    # FIX: 자동 수리
    # ──────────────────────────────────────────────────

    def fix_duplicate_words(self, duplicates: list[dict]) -> int:
        """중복 단어 중 첫 번째(가장 오래된) ID 유지, 나머지 삭제."""
        if not duplicates:
            return 0
        conn = self._connect()
        total = 0
        try:
            for dup in duplicates:
                to_delete = dup["ids"][1:]
                if to_delete:
                    placeholders = ",".join("?" * len(to_delete))
                    conn.execute(
                        f"DELETE FROM words WHERE word_id IN ({placeholders})",
                        to_delete,
                    )
                    total += len(to_delete)
            conn.commit()
        finally:
            conn.close()
        return total

    def fix_broken_questions(self, broken: list[dict]) -> int:
        """stem 비어있거나 choices JSON 파손된 문제 삭제."""
        to_delete = [
            i["question_id"] for i in broken
            if "empty_stem" in i["problems"] or "choices_json_error" in i["problems"]
        ]
        if not to_delete:
            return 0
        conn = self._connect()
        try:
            placeholders = ",".join("?" * len(to_delete))
            conn.execute(
                f"DELETE FROM questions WHERE question_id IN ({placeholders})",
                to_delete,
            )
            conn.commit()
            return conn.execute("SELECT changes()").fetchone()[0]
        finally:
            conn.close()

    def fix_all(self, scan_result: dict) -> dict:
        """스캔 결과를 바탕으로 자동 수리 가능한 항목 처리."""
        dup_removed = self.fix_duplicate_words(
            scan_result["duplicate_words"]["items"]
        )
        q_removed = self.fix_broken_questions(
            scan_result["broken_questions"]["items"]
        )
        return {
            "fixed_at":               datetime.now().isoformat(),
            "duplicate_words_removed":   dup_removed,
            "broken_questions_removed":  q_removed,
        }

    # ──────────────────────────────────────────────────
    # HEALTH: DB 건강 리포트
    # ──────────────────────────────────────────────────

    def health_report(self) -> dict:
        """DB 전체 통계 + 건강 등급 (A/B/C/D)."""
        conn = self._connect()
        try:
            words_total    = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
            words_verified = conn.execute("SELECT COUNT(*) FROM words WHERE verified=1").fetchone()[0]
            q_total        = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
            q_verified     = conn.execute("SELECT COUNT(*) FROM questions WHERE verified=1").fetchone()[0]
            tmpl_total     = conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0]
            avg_score_row  = conn.execute(
                "SELECT AVG(quality_score) FROM questions WHERE verified=0"
            ).fetchone()[0]
            avg_score = float(avg_score_row) if avg_score_row else 0.0

            level_dist = {
                row["level"] or "미분류": row["cnt"]
                for row in conn.execute(
                    "SELECT level, COUNT(*) AS cnt FROM words GROUP BY level"
                ).fetchall()
            }
            grammar_dist = {
                row["grammar_point"] or "미분류": row["cnt"]
                for row in conn.execute(
                    """SELECT grammar_point, COUNT(*) AS cnt FROM questions
                       GROUP BY grammar_point ORDER BY cnt DESC LIMIT 10"""
                ).fetchall()
            }
            # 중복 단어 빠른 카운트
            dup_count = conn.execute("""
                SELECT COUNT(*) FROM (
                    SELECT 1 FROM words GROUP BY LOWER(TRIM(word)) HAVING COUNT(*) > 1
                )
            """).fetchone()[0]
            # 미완성 단어 빠른 카운트
            incomplete_count = conn.execute("""
                SELECT COUNT(*) FROM words
                WHERE (pos IS NULL OR TRIM(pos) = '')
                   OR (meaning_ko IS NULL OR TRIM(meaning_ko) = '')
            """).fetchone()[0]
        finally:
            conn.close()

        w_rate = round(words_verified / words_total * 100, 1) if words_total else 0
        q_rate = round(q_verified / q_total * 100, 1) if q_total else 0
        grade, grade_desc = _compute_grade(words_total, words_verified,
                                           q_total, q_verified, avg_score,
                                           dup_count, incomplete_count)

        return {
            "report_at": datetime.now().isoformat(),
            "words": {
                "total":              words_total,
                "verified":           words_verified,
                "pending":            words_total - words_verified,
                "verification_rate":  f"{w_rate}%",
                "duplicates":         dup_count,
                "incomplete":         incomplete_count,
                "level_distribution": level_dist,
            },
            "questions": {
                "total":               q_total,
                "verified":            q_verified,
                "pending":             q_total - q_verified,
                "verification_rate":   f"{q_rate}%",
                "avg_quality_score":   round(avg_score, 1),
                "grammar_distribution": grammar_dist,
            },
            "templates":     {"total": tmpl_total},
            "health_grade":  grade,
            "health_detail": grade_desc,
        }


# ── 건강 등급 계산 ─────────────────────────────────────

def _compute_grade(wt, wv, qt, qv, avg_score, dup_cnt, incomplete_cnt) -> tuple[str, str]:
    score = 100
    details = []

    if wt > 0:
        w_rate = wv / wt
        if w_rate < 0.3:
            score -= 25; details.append(f"단어 검수율 낮음 ({w_rate:.0%})")
        elif w_rate < 0.6:
            score -= 10; details.append(f"단어 검수율 보통 ({w_rate:.0%})")

    if qt > 0:
        q_rate = qv / qt
        if q_rate < 0.2:
            score -= 25; details.append(f"문제 검수율 낮음 ({q_rate:.0%})")
        elif q_rate < 0.5:
            score -= 10; details.append(f"문제 검수율 보통 ({q_rate:.0%})")

    if avg_score > 0:
        if avg_score < 6:
            score -= 20; details.append(f"평균 품질 점수 낮음 ({avg_score:.1f})")
        elif avg_score < 7.5:
            score -= 8; details.append(f"평균 품질 점수 보통 ({avg_score:.1f})")

    if dup_cnt > 0:
        score -= min(15, dup_cnt * 2)
        details.append(f"중복 단어 {dup_cnt}건")

    if incomplete_cnt > 0:
        score -= min(10, incomplete_cnt)
        details.append(f"미완성 단어 {incomplete_cnt}건")

    if score >= 85:
        grade = "A (우수)"
    elif score >= 70:
        grade = "B (양호)"
    elif score >= 50:
        grade = "C (보통)"
    else:
        grade = "D (주의)"

    return grade, ("; ".join(details) if details else "이상 없음")


# ── 출력 헬퍼 ─────────────────────────────────────────

def _print_scan(result: dict):
    total = result["total_issues"]
    icon = "✅" if total == 0 else "⚠️"
    print(f"\n{'='*58}")
    print(f"  JANITOR 스캔 결과  {icon}  총 {total}건")
    print(f"  {result['scanned_at']}")
    print(f"{'='*58}")

    sections = [
        ("중복 단어",           "duplicate_words",       "🔁"),
        ("미완성 단어",         "incomplete_words",      "📝"),
        ("파손 문제",           "broken_questions",      "💥"),
        ("미지원 슬롯 템플릿",  "broken_templates",      "🔧"),
        ("저품질 미검수 문제",  "low_quality_questions", "📉"),
    ]
    for label, key, icon in sections:
        cnt = result[key]["count"]
        flag = "⚠️" if cnt > 0 else "✅"
        print(f"  {flag} {label}: {cnt}건")
        if cnt > 0:
            for item in result[key]["items"][:3]:
                if key == "duplicate_words":
                    print(f"       {item['word']}  ({item['count']}개 중복)")
                elif key == "incomplete_words":
                    print(f"       {item['word']:20} 누락: {', '.join(item['missing_fields'])}")
                elif key == "broken_questions":
                    print(f"       {item['stem_preview']}  [{', '.join(item['problems'])}]")
                elif key == "broken_templates":
                    print(f"       {item['grammar_point']}  미지원 슬롯: {item['unknown_slots']}")
                elif key == "low_quality_questions":
                    print(f"       [{item['quality_score']}점] {item['stem_preview']}")
            if cnt > 3:
                print(f"       ... 외 {cnt-3}건")
    print()


def _print_fix(fixed: dict):
    print(f"\n{'='*58}")
    print(f"  JANITOR 자동 수리 완료")
    print(f"  {fixed['fixed_at']}")
    print(f"{'='*58}")
    print(f"  🗑  중복 단어 삭제:   {fixed['duplicate_words_removed']}개")
    print(f"  🗑  파손 문제 삭제:   {fixed['broken_questions_removed']}개")
    note = "  ℹ  수동 수리 필요: 미완성 단어, 저품질 문제, 미지원 슬롯"
    print(note)
    print()


def _print_health(rep: dict):
    grade = rep["health_grade"]
    grade_icon = {"A": "🟢", "B": "🟡", "C": "🟠", "D": "🔴"}.get(grade[0], "⬜")
    print(f"\n{'='*58}")
    print(f"  JANITOR 건강 리포트  {grade_icon} {grade}")
    print(f"  {rep['report_at']}")
    print(f"{'='*58}")

    w = rep["words"]
    q = rep["questions"]
    t = rep["templates"]

    print(f"\n  [단어]")
    print(f"  전체: {w['total']}개  |  검수완료: {w['verified']}개 ({w['verification_rate']})")
    print(f"  대기: {w['pending']}개  |  중복: {w['duplicates']}건  |  미완성: {w['incomplete']}건")
    if w["level_distribution"]:
        levels = "  ".join(f"{lv}:{cnt}" for lv, cnt in
                           sorted(w["level_distribution"].items()))
        print(f"  레벨 분포: {levels}")

    print(f"\n  [문제]")
    print(f"  전체: {q['total']}개  |  검수완료: {q['verified']}개 ({q['verification_rate']})")
    print(f"  대기: {q['pending']}개  |  평균 품질: {q['avg_quality_score']}점")
    if q["grammar_distribution"]:
        top = list(q["grammar_distribution"].items())[:5]
        print(f"  상위 문법: " + "  ".join(f"{gp}:{cnt}" for gp, cnt in top))

    print(f"\n  [템플릿]  전체: {t['total']}개")
    print(f"\n  ✦ 상세: {rep['health_detail']}")
    print()


# ── CLI ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="JANITOR 에이전트 — DB 진단·수리·리포트")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--scan",   action="store_true", help="전체 문제 스캔")
    group.add_argument("--fix",    action="store_true", help="스캔 후 자동 수리")
    group.add_argument("--health", action="store_true", help="DB 건강 리포트")
    group.add_argument("--full",   action="store_true", help="scan + fix + health 전부")
    args = parser.parse_args()

    agent = JanitorAgent()

    if args.scan:
        result = agent.scan_all()
        _print_scan(result)

    elif args.fix:
        result = agent.scan_all()
        _print_scan(result)
        fixed = agent.fix_all(result)
        _print_fix(fixed)

    elif args.health:
        rep = agent.health_report()
        _print_health(rep)

    elif args.full:
        result = agent.scan_all()
        _print_scan(result)
        fixed = agent.fix_all(result)
        _print_fix(fixed)
        rep = agent.health_report()
        _print_health(rep)


if __name__ == "__main__":
    main()
