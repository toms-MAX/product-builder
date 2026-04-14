#!/usr/bin/env python3
"""
harness.py — Claude Code 하네스 에이전트 실행기
================================================
이 스크립트가 에이전트의 뇌 역할을 합니다.
태스크 큐를 읽고, 실행하고, 결과를 검증하고, 보고합니다.

사용법:
    python harness.py              # 다음 태스크 자동 실행
    python harness.py --task 001   # 특정 태스크 실행
    python harness.py --status     # 현재 상태 확인
    python harness.py --verify     # 전체 파일 검증
"""

import os
import sys
import json
import sqlite3
import subprocess
from pathlib import Path
from datetime import datetime


# ── 태스크 정의 ────────────────────────────────────────

TASKS = {
    "001": {
        "name": "qbank.json 구조 파악 및 SQLite 마이그레이션",
        "files_to_create": [
            "backend/db/schema.sql",
            "backend/db/migrate.py",
            "backend/db/qbank.db",
        ],
        "verify_cmd": "python backend/db/migrate.py --dry-run",
    },
    "002": {
        "name": "AI 클라이언트 (Gemini 추상화)",
        "files_to_create": [
            "backend/utils/ai_client.py",
        ],
        "verify_cmd": "python -c \"from backend.utils.ai_client import AIClient; print('OK')\"",
    },
    "003": {
        "name": "슬롯 엔진 (템플릿×단어 조합)",
        "files_to_create": [
            "backend/utils/slot_engine.py",
        ],
        "verify_cmd": "python -c \"from backend.utils.slot_engine import SlotEngine; print('OK')\"",
    },
    "004": {
        "name": "DOC-IN 에이전트 (PDF→DB 자료화)",
        "files_to_create": [
            "backend/agents/doc_agent.py",
        ],
        "verify_cmd": "python -c \"from backend.agents.doc_agent import DocAgent; print('OK')\"",
    },
    "005": {
        "name": "GEN 에이전트 (문제 생성)",
        "files_to_create": [
            "backend/agents/gen_agent.py",
        ],
        "verify_cmd": "python -c \"from backend.agents.gen_agent import GenAgent; print('OK')\"",
    },
    "006": {
        "name": "BUILD 에이전트 (시험지 PDF 출력)",
        "files_to_create": [
            "backend/agents/build_agent.py",
        ],
        "verify_cmd": "python -c \"from backend.agents.build_agent import BuildAgent; print('OK')\"",
    },
    "007": {
        "name": "REVIEW 에이전트 (검수 대기열 분류 및 리포트)",
        "files_to_create": [
            "backend/agents/review_agent.py",
        ],
        "verify_cmd": "python -c \"from backend.agents.review_agent import ReviewAgent; print('OK')\"",
    },
}


# ── 상태 파일 ──────────────────────────────────────────

STATUS_FILE = ".harness_status.json"

def load_status():
    if Path(STATUS_FILE).exists():
        with open(STATUS_FILE) as f:
            return json.load(f)
    return {"completed": [], "last_run": None}

def save_status(status):
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2, ensure_ascii=False)


# ── 검증 함수 ──────────────────────────────────────────

def verify_files(task_id):
    """태스크에서 생성해야 할 파일들이 존재하는지 확인"""
    task = TASKS.get(task_id)
    if not task:
        return False, f"태스크 {task_id} 없음"

    missing = []
    for f in task.get("files_to_create", []):
        if not Path(f).exists():
            missing.append(f)

    if missing:
        return False, f"누락된 파일: {missing}"
    return True, "모든 파일 존재"


def verify_db():
    """SQLite DB 상태 확인"""
    db_path = "backend/db/qbank.db"
    if not Path(db_path).exists():
        return {"status": "없음", "words": 0, "templates": 0, "questions": 0}

    conn = sqlite3.connect(db_path)
    result = {}
    try:
        result["words"]     = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        result["templates"] = conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0]
        result["questions"] = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        result["status"]    = "정상"
    except Exception as e:
        result["status"] = f"에러: {e}"
    finally:
        conn.close()
    return result


# ── 리포트 출력 ────────────────────────────────────────

def print_header():
    print("\n" + "="*55)
    print("  🤖 영어 문제은행 하네스 에이전트")
    print("="*55)

def print_status():
    print_header()
    status = load_status()
    completed = status.get("completed", [])

    print(f"\n📋 태스크 현황")
    print("-"*40)
    for tid, task in TASKS.items():
        icon = "✅" if tid in completed else "⬜"
        print(f"  {icon} TASK-{tid}: {task['name']}")

    print(f"\n🗄️ DB 현황")
    print("-"*40)
    db_status = verify_db()
    print(f"  상태:     {db_status.get('status', '없음')}")
    print(f"  단어:     {db_status.get('words', 0)}개")
    print(f"  템플릿:   {db_status.get('templates', 0)}개")
    print(f"  완성문제: {db_status.get('questions', 0)}개")

    # 다음 태스크
    remaining = [t for t in TASKS if t not in completed]
    if remaining:
        next_task = remaining[0]
        print(f"\n🚀 다음 태스크")
        print("-"*40)
        print(f"  TASK-{next_task}: {TASKS[next_task]['name']}")
        print(f"\n  실행 명령어:")
        print(f"  python harness.py --task {next_task}")
    else:
        print("\n🎉 모든 태스크 완료!")

    print()


def print_verify():
    print_header()
    print("\n🔍 전체 파일 검증")
    print("-"*40)

    all_ok = True
    for tid, task in TASKS.items():
        ok, msg = verify_files(tid)
        icon = "✅" if ok else "❌"
        print(f"  {icon} TASK-{tid}: {msg}")
        if not ok:
            all_ok = False

    print(f"\n🗄️ DB 검증")
    print("-"*40)
    db = verify_db()
    print(f"  상태: {db.get('status')}")
    print(f"  단어: {db.get('words', 0)}개 {'✅' if db.get('words', 0) > 0 else '⚠️ 비어있음'}")

    print()
    return all_ok


def run_task(task_id):
    """특정 태스크 실행 및 검증"""
    print_header()
    task = TASKS.get(task_id)
    if not task:
        print(f"❌ 태스크 {task_id}를 찾을 수 없습니다.")
        return False

    print(f"\n▶ TASK-{task_id}: {task['name']}")
    print(f"  시작: {datetime.now().strftime('%H:%M:%S')}")
    print()

    # 필요한 디렉토리 생성
    for f in task.get("files_to_create", []):
        Path(f).parent.mkdir(parents=True, exist_ok=True)

    print("📌 이 태스크에서 생성해야 할 파일:")
    for f in task.get("files_to_create", []):
        exists = "✅ 이미 있음" if Path(f).exists() else "⬜ 생성 필요"
        print(f"   {exists} — {f}")

    print()
    print("💬 Claude Code에게 전달할 지시:")
    print("-"*40)
    print(generate_task_prompt(task_id))
    print("-"*40)

    return True


def generate_task_prompt(task_id):
    """Claude Code에게 전달할 태스크별 프롬프트 생성"""

    prompts = {
        "001": """
TASK-001 실행합니다.

1. data/qbank.json 파일을 읽어서 현재 데이터 구조를 파악해줘.
2. backend/db/schema.sql 파일을 만들어줘.
   (words, templates, questions 3개 테이블, CLAUDE.md의 스키마 그대로)
3. backend/db/migrate.py 파일을 만들어줘.
   - qbank.json 데이터를 읽어서 새 스키마에 맞게 변환
   - backend/db/qbank.db 로 저장
   - 실행 후 "단어 N개, 문제 N개 마이그레이션 완료" 출력
4. migrate.py 실행해서 qbank.db 만들어줘.
5. 완료 후 DB에 몇 개 들어갔는지 확인해줘.
""",
        "002": """
TASK-002 실행합니다.

backend/utils/ai_client.py 파일을 만들어줘.

요구사항:
- Gemini 무료 API 사용 (google-generativeai 패키지)
- CLAUDE.md에 정의된 5개 메서드만 구현
  (read_image, classify_level, classify_pos, score_quality, select_combo)
- API 실패 시 기본값 반환하는 폴백 처리 필수
- 환경변수 GEMINI_API_KEY 로 키 관리
- 각 메서드에 AI 없이도 동작하는 폴백 포함

테스트 코드도 tests/test_ai_client.py 에 작성해줘.
""",
        "003": """
TASK-003 실행합니다.

backend/utils/slot_engine.py 파일을 만들어줘.

요구사항:
- CLAUDE.md의 SLOT_MAP 그대로 구현
- SlotEngine 클래스: DB에서 슬롯별 단어 조회
- fill_template(template_str, grade_num) 메서드
- shuffle_choices(choices, correct_answer) → 보기 순서 셔플 + 정답 재계산
- AI 없이 완전 동작해야 함
- 단어 부족 시 내장 기본 단어풀로 폴백

테스트 코드도 tests/test_slot_engine.py 에 작성해줘.
""",
        "004": """
TASK-004 실행합니다.

backend/agents/doc_agent.py 파일을 만들어줘.

요구사항:
DocAgent 클래스 구현:
- process(file_path, level, book_title) → 파일 처리 후 DB 저장
- PDF 텍스트 추출: PyMuPDF 사용
- 이미지/스캔: ai_client.read_image() 사용
- 자동 태깅: ai_client.classify_level(), classify_pos()
- 품질 검사: score < 7 이면 verified=0, needs_review=True
- DB 저장: backend/db/qbank.db
- 처리 완료 후 요약 리포트 출력

실행 예시:
python backend/agents/doc_agent.py --file data/sample.pdf --level 고1 --book "수능단어"

테스트 코드도 tests/test_doc_agent.py 에 작성해줘.
""",
        "005": """
TASK-005 실행합니다.

backend/agents/gen_agent.py 파일을 만들어줘.

요구사항:
GenAgent 클래스 구현:
- generate(grammar_point, level, count) → 문제 리스트 반환
- 4단계 폴백 구조 반드시 구현:
  1순위: DB 검수완료 캐시 (verified=1)
  2순위: 템플릿 × DB 단어 조합 (AI 없음)
  3순위: AI 조합 선택 (ai_client.select_combo)
  4순위: 내장 기본 단어풀
- 중복 문제 방지: exclude_ids 파라미터
- 결과를 questions 테이블에 저장

실행 예시:
python backend/agents/gen_agent.py --grammar 현재완료 --level 고1 --count 5
""",
        "006": """
TASK-006 실행합니다.

backend/agents/build_agent.py 파일을 만들어줘.

요구사항:
BuildAgent 클래스 구현:
- build(question_ids, config) → PDF 파일 생성
- config 파라미터:
  academy_name: 학원명
  title: 시험지 제목
  logo_path: 로고 이미지 경로 (없으면 텍스트만)
  show_answers: 정답 표시 여부
  layout: "1col" or "2col"
- ReportLab 사용 (pip install reportlab)
- 한글 폰트 처리 (나눔고딕 또는 시스템 폰트)
- 출력 파일: output/시험지_YYYYMMDD_HHMMSS.pdf

실행 예시:
python backend/agents/build_agent.py --ids q1,q2,q3 --academy "민준영어" --title "문법 테스트"
""",
        "007": """
TASK-007 실행합니다.

backend/agents/review_agent.py 파일을 만들어줘.

요구사항:
ReviewAgent 클래스 구현:
- report() → 검수 현황 전체 출력 (단어/문제 대기 수, 품질 분포)
- list_pending(table, limit) → 대기 항목 목록 반환
- approve(table, ids) → verified=1 로 업데이트
- reject(table, ids) → DB에서 삭제

CLI:
python backend/agents/review_agent.py --report
python backend/agents/review_agent.py --list words
python backend/agents/review_agent.py --list questions
python backend/agents/review_agent.py --approve words:id1,id2
python backend/agents/review_agent.py --reject questions:id1

테스트 코드도 tests/test_review_agent.py 에 작성해줘.
""",
    }

    return prompts.get(task_id, f"TASK-{task_id}를 CLAUDE.md 기준으로 구현해줘.")


# ── 메인 ───────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if not args or "--status" in args:
        print_status()

    elif "--verify" in args:
        ok = print_verify()
        sys.exit(0 if ok else 1)

    elif "--task" in args:
        idx = args.index("--task")
        if idx + 1 < len(args):
            task_id = args[idx + 1].zfill(3)
            run_task(task_id)
        else:
            print("❌ 태스크 번호를 지정해주세요. 예: python harness.py --task 001")

    elif "--complete" in args:
        idx = args.index("--complete")
        if idx + 1 < len(args):
            task_id = args[idx + 1].zfill(3)
            status = load_status()
            if task_id not in status["completed"]:
                status["completed"].append(task_id)
                status["last_run"] = datetime.now().isoformat()
                save_status(status)
                print(f"✅ TASK-{task_id} 완료 처리됨")
            else:
                print(f"ℹ️ TASK-{task_id} 이미 완료됨")
            print_status()

    else:
        print_status()


if __name__ == "__main__":
    main()
