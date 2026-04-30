"""
loader.py — YAML 템플릿 → DB 동기화
=====================================
backend/templates/*.yaml 파일을 읽어 DB의 templates 테이블에 동기화.

사용법:
    python -m backend.templates.loader                  # 동기화 실행
    python -m backend.templates.loader --dry-run        # 변경 사항만 확인
    python -m backend.templates.loader --validate       # 온톨로지 검증만
"""

import argparse
import re
import sqlite3
import sys
from pathlib import Path

def _load_yaml_module():
    """PyYAML을 가져옴 — nix 환경에서 경로 자동 탐색 포함."""
    try:
        import yaml
        return yaml
    except ImportError:
        pass
    # nix store 경로에서 pyyaml 탐색
    import glob
    for p in glob.glob("/nix/store/*-python3*-pyyaml-*/lib/python*/site-packages"):
        if p not in sys.path:
            sys.path.insert(0, p)
        try:
            import yaml
            return yaml
        except ImportError:
            continue
    print("PyYAML을 찾을 수 없습니다. requirements.txt에 pyyaml 추가 후 설치하세요.")
    sys.exit(1)

yaml = _load_yaml_module()

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.core.ontology import (
    VALID_GRAMMAR_POINTS,
    VALID_Q_TYPES,
    VALID_SLOTS,
    validate_template,
)

TEMPLATES_DIR = Path(__file__).parent
DB_PATH = ROOT / "backend" / "db" / "qbank.db"


# ── YAML 파싱 ─────────────────────────────────────────

def _load_yaml_file(path: Path) -> list[dict]:
    """YAML 파일 하나를 읽어 DB 레코드 리스트로 변환."""
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    grammar_point = data["grammar_point"]
    default_level_min = data.get("level_min", 1)
    default_level_max = data.get("level_max", 8)

    records = []
    for tmpl in data.get("templates", []):
        record = {
            "template_id":   tmpl["id"],
            "grammar_point": grammar_point,
            "level_min":     tmpl.get("level_min", default_level_min),
            "level_max":     tmpl.get("level_max", default_level_max),
            "stem_template": tmpl["stem"],
            "q_type":        tmpl.get("q_type", "FIB_MCQ"),
            "answer_slot":   tmpl.get("answer_slot"),
            "wrong_slots":   tmpl.get("wrong_slots"),
            "verified":      tmpl.get("verified", 1),
            "note":          tmpl.get("note"),
        }
        records.append(record)
    return records


def load_all_yaml() -> tuple[list[dict], list[str]]:
    """
    templates/ 아래 모든 *.yaml 파일을 읽어 레코드 + 오류 목록 반환.
    반환: (records, errors)
    """
    records: list[dict] = []
    errors:  list[str]  = []

    for yaml_path in sorted(TEMPLATES_DIR.glob("*.yaml")):
        try:
            file_records = _load_yaml_file(yaml_path)
            for r in file_records:
                violations = validate_template(r)
                if violations:
                    for v in violations:
                        errors.append(f"[{yaml_path.name}] {r['template_id']}: {v}")
                else:
                    records.append(r)
        except Exception as e:
            errors.append(f"[{yaml_path.name}] 파싱 오류: {e}")

    return records, errors


# ── DB 동기화 ─────────────────────────────────────────

def sync_to_db(records: list[dict], db_path: Path = DB_PATH,
               dry_run: bool = False) -> dict:
    """
    YAML에서 읽은 records를 DB templates 테이블에 동기화.

    전략:
      - YAML에 있는 template_id: UPSERT
      - YAML에 없는 template_id: 삭제 (단, UUID 형식 레거시 레코드 포함)

    반환: {"inserted": int, "updated": int, "deleted": int}
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    try:
        existing = {
            r["template_id"]: dict(r)
            for r in conn.execute("SELECT * FROM templates").fetchall()
        }
        yaml_ids = {r["template_id"] for r in records}

        inserted = updated = deleted = 0

        if not dry_run:
            # UPSERT
            for rec in records:
                if rec["template_id"] in existing:
                    conn.execute(
                        """
                        UPDATE templates SET
                          grammar_point=:grammar_point,
                          level_min=:level_min, level_max=:level_max,
                          stem_template=:stem_template, q_type=:q_type,
                          answer_slot=:answer_slot, wrong_slots=:wrong_slots,
                          verified=:verified, note=:note
                        WHERE template_id=:template_id
                        """,
                        rec,
                    )
                    updated += 1
                else:
                    conn.execute(
                        """
                        INSERT INTO templates
                          (template_id, grammar_point, level_min, level_max,
                           stem_template, q_type, answer_slot, wrong_slots,
                           verified, note)
                        VALUES
                          (:template_id, :grammar_point, :level_min, :level_max,
                           :stem_template, :q_type, :answer_slot, :wrong_slots,
                           :verified, :note)
                        """,
                        rec,
                    )
                    inserted += 1

            # 레거시 UUID 템플릿 삭제 (YAML에 없는 것)
            uuid_pattern = re.compile(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
            )
            for tid in existing:
                if tid not in yaml_ids and uuid_pattern.match(tid):
                    conn.execute("DELETE FROM templates WHERE template_id=?", (tid,))
                    deleted += 1

            conn.commit()
        else:
            # dry-run: 변경 사항만 계산
            for rec in records:
                if rec["template_id"] in existing:
                    updated += 1
                else:
                    inserted += 1
            uuid_pattern = re.compile(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
            )
            for tid in existing:
                if tid not in yaml_ids and uuid_pattern.match(tid):
                    deleted += 1

    finally:
        conn.close()

    return {"inserted": inserted, "updated": updated, "deleted": deleted}


# ── CLI ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="YAML 템플릿 → DB 동기화")
    parser.add_argument("--dry-run",  action="store_true", help="변경 없이 미리보기만")
    parser.add_argument("--validate", action="store_true", help="온톨로지 검증만")
    parser.add_argument("--db",       default=str(DB_PATH), help="DB 경로")
    args = parser.parse_args()

    records, errors = load_all_yaml()

    print(f"\n  YAML 파일 로드: {len(records)}개 템플릿")

    if errors:
        print(f"\n  [오류] 온톨로지 위반 {len(errors)}건:")
        for e in errors:
            print(f"    ✗ {e}")
    else:
        print("  [OK] 온톨로지 검증 통과")

    if args.validate:
        sys.exit(0 if not errors else 1)

    stats = sync_to_db(records, Path(args.db), dry_run=args.dry_run)

    mode = "[DRY-RUN]" if args.dry_run else "[실제 반영]"
    print(f"\n  {mode} 동기화 결과:")
    print(f"    신규: {stats['inserted']}개")
    print(f"    갱신: {stats['updated']}개")
    print(f"    삭제: {stats['deleted']}개 (레거시 UUID 템플릿)")
    print()

    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
