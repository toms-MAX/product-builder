"""
review_agent.py — REVIEW 에이전트 (검수 대기열 분류 및 리포트)
==============================================================
대표님이 직접 단어·문제를 승인/거절하는 검수 인터페이스.

사용법:
    python backend/agents/review_agent.py --report
    python backend/agents/review_agent.py --list words
    python backend/agents/review_agent.py --list questions
    python backend/agents/review_agent.py --approve words:id1,id2
    python backend/agents/review_agent.py --reject questions:id1
"""

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.doc_agent import ensure_db

DB_PATH = ROOT / "backend" / "db" / "qbank.db"

# 품질 점수 구간
GRADE_URGENT = (1, 5)   # 🔴 긴급
GRADE_NORMAL = (6, 7)   # 🟡 보통
GRADE_GOOD   = (8, 10)  # 🟢 양호

VALID_TABLES = {"words", "questions"}


class ReviewAgent:
    def __init__(self, db_path: Path | str | None = None):
        self.db_path = Path(db_path) if db_path else DB_PATH

    def _connect(self) -> sqlite3.Connection:
        ensure_db(self.db_path)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ── 검수 현황 리포트 ──────────────────────────────
    def report(self) -> dict:
        """
        전체 검수 현황 반환.
        {
          "words":     {"total", "pending", "approved", "urgent", "normal", "good"},
          "questions": {"total", "pending", "approved", "urgent", "normal", "good"},
        }
        """
        conn = self._connect()
        result = {}
        try:
            for table in ("words", "questions"):
                score_col = "quality_score" if table == "questions" else None

                total    = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                pending  = conn.execute(
                    f"SELECT COUNT(*) FROM {table} WHERE verified=0"
                ).fetchone()[0]
                approved = total - pending

                if score_col:
                    urgent = conn.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE verified=0 "
                        f"AND {score_col} BETWEEN ? AND ?", GRADE_URGENT
                    ).fetchone()[0]
                    normal = conn.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE verified=0 "
                        f"AND {score_col} BETWEEN ? AND ?", GRADE_NORMAL
                    ).fetchone()[0]
                    good = conn.execute(
                        f"SELECT COUNT(*) FROM {table} WHERE verified=0 "
                        f"AND {score_col} BETWEEN ? AND ?", GRADE_GOOD
                    ).fetchone()[0]
                else:
                    urgent = normal = good = 0

                result[table] = {
                    "total": total, "pending": pending, "approved": approved,
                    "urgent": urgent, "normal": normal, "good": good,
                }
        finally:
            conn.close()
        return result

    # ── 대기 목록 조회 ────────────────────────────────
    def list_pending(self, table: str, limit: int = 20) -> list[dict]:
        """
        검수 대기(verified=0) 항목 반환. 품질 낮은 순 정렬.
        table: "words" or "questions"
        """
        if table not in VALID_TABLES:
            raise ValueError(f"유효하지 않은 테이블: {table}")

        conn = self._connect()
        try:
            if table == "questions":
                rows = conn.execute(
                    """
                    SELECT question_id AS id, grammar_point, level, q_type,
                           stem, answer, quality_score, source, created_at
                    FROM questions
                    WHERE verified = 0
                    ORDER BY quality_score ASC, created_at ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT word_id AS id, word, pos, level, meaning_ko,
                           source_book, verified
                    FROM words
                    WHERE verified = 0
                    ORDER BY word ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    # ── 승인 ──────────────────────────────────────────
    def approve(self, table: str, ids: list[str]) -> int:
        """
        항목을 verified=1 로 업데이트.
        반환: 업데이트된 행 수
        """
        if table not in VALID_TABLES:
            raise ValueError(f"유효하지 않은 테이블: {table}")
        if not ids:
            return 0

        id_col = "word_id" if table == "words" else "question_id"
        placeholders = ",".join("?" * len(ids))
        conn = self._connect()
        try:
            conn.execute(
                f"UPDATE {table} SET verified=1 WHERE {id_col} IN ({placeholders})",
                ids,
            )
            conn.commit()
            return conn.execute("SELECT changes()").fetchone()[0]
        finally:
            conn.close()

    # ── 거절(삭제) ────────────────────────────────────
    def reject(self, table: str, ids: list[str]) -> int:
        """
        항목을 DB에서 삭제.
        반환: 삭제된 행 수
        """
        if table not in VALID_TABLES:
            raise ValueError(f"유효하지 않은 테이블: {table}")
        if not ids:
            return 0

        id_col = "word_id" if table == "words" else "question_id"
        placeholders = ",".join("?" * len(ids))
        conn = self._connect()
        try:
            conn.execute(
                f"DELETE FROM {table} WHERE {id_col} IN ({placeholders})",
                ids,
            )
            conn.commit()
            return conn.execute("SELECT changes()").fetchone()[0]
        finally:
            conn.close()


# ── 출력 헬퍼 ─────────────────────────────────────────

def print_report(stats: dict):
    print(f"\n{'='*55}")
    print(f"  REVIEW 에이전트 — 검수 현황 리포트")
    print(f"{'='*55}")

    for table, s in stats.items():
        label = "단어 (words)" if table == "words" else "문제 (questions)"
        print(f"\n  [{label}]")
        print(f"  {'─'*40}")
        print(f"  전체:     {s['total']}개")
        print(f"  검수완료: {s['approved']}개  ✅")
        print(f"  대기중:   {s['pending']}개  ⏳")
        if table == "questions" and s["pending"] > 0:
            print(f"    🔴 긴급 (1~5점):  {s['urgent']}개")
            print(f"    🟡 보통 (6~7점):  {s['normal']}개")
            print(f"    🟢 양호 (8~10점): {s['good']}개")
    print()


def print_pending(rows: list[dict], table: str):
    if not rows:
        print(f"\n  대기 항목 없음 ({table})\n")
        return

    print(f"\n  검수 대기 목록 — {table} ({len(rows)}개)")
    print(f"  {'─'*55}")

    if table == "questions":
        for r in rows:
            score = r.get("quality_score", "?")
            flag = "🔴" if score <= 5 else ("🟡" if score <= 7 else "🟢")
            print(f"  {flag} [{r['q_type']:10}] {r['id'][:8]}...  점수:{score}")
            print(f"     {r['stem'][:60]}")
            print(f"     정답: {r.get('answer','?')}  |  레벨: {r.get('level','?')}")
            print()
    else:
        for r in rows:
            print(f"  ⏳  {r['id'][:8]}...  "
                  f"{r['word']:20} [{r.get('pos','?'):10}] "
                  f"{r.get('level','?')}  {r.get('meaning_ko','')}")
    print()


# ── CLI ───────────────────────────────────────────────

def _parse_table_ids(arg: str) -> tuple[str, list[str]]:
    """'words:id1,id2' 형태를 (table, [id1, id2]) 로 파싱."""
    if ":" not in arg:
        print(f"  [오류] 형식: <table>:<id1,id2>  예) words:abc123,def456")
        sys.exit(1)
    table, ids_str = arg.split(":", 1)
    ids = [i.strip() for i in ids_str.split(",") if i.strip()]
    return table.strip(), ids


def main():
    parser = argparse.ArgumentParser(description="REVIEW 에이전트 — 검수 대기열 관리")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--report",  action="store_true",
                       help="검수 현황 전체 리포트")
    group.add_argument("--list",    metavar="TABLE",
                       choices=["words", "questions"],
                       help="대기 목록 출력 (words / questions)")
    group.add_argument("--approve", metavar="TABLE:IDS",
                       help="승인: words:id1,id2 또는 questions:id1")
    group.add_argument("--reject",  metavar="TABLE:IDS",
                       help="거절(삭제): words:id1 또는 questions:id1,id2")
    parser.add_argument("--limit",  type=int, default=20,
                        help="--list 최대 표시 수 (기본값: 20)")
    args = parser.parse_args()

    agent = ReviewAgent()

    if args.report:
        stats = agent.report()
        print_report(stats)

    elif args.list:
        rows = agent.list_pending(args.list, limit=args.limit)
        print_pending(rows, args.list)

    elif args.approve:
        table, ids = _parse_table_ids(args.approve)
        count = agent.approve(table, ids)
        print(f"\n  ✅ {count}개 승인 완료 ({table})\n")

    elif args.reject:
        table, ids = _parse_table_ids(args.reject)
        count = agent.reject(table, ids)
        print(f"\n  🗑️  {count}개 삭제 완료 ({table})\n")


if __name__ == "__main__":
    main()
