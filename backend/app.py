"""
app.py — Flask API 서버
========================
프론트엔드 ↔ 에이전트 4개를 연결하는 REST API.

실행:
    python backend/app.py
"""

import json
import os
import queue as queue_module
import sqlite3
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from flask import Flask, Response, jsonify, request, send_from_directory, send_file, stream_with_context
from flask_cors import CORS
from werkzeug.utils import secure_filename

from backend.agents.doc_agent       import DocAgent
from backend.agents.gen_agent       import GenAgent
from backend.agents.build_agent     import BuildAgent
from backend.agents.review_agent    import ReviewAgent
from backend.agents.ai_review_agent import AIReviewAgent
from backend.agents.janitor_agent   import JanitorAgent
from backend.agents.doc_agent       import ensure_db
from backend.utils.transform_engine import transform_batch

DB_PATH     = ROOT / "backend" / "db" / "qbank.db"
UPLOAD_DIR  = ROOT / "data" / "uploads"
OUTPUT_DIR  = ROOT / "output"
FRONTEND    = ROOT

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
ensure_db(DB_PATH)

app = Flask(__name__, static_folder=str(FRONTEND))
CORS(app)

ALLOWED_EXT = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"}


def _db_stats():
    conn = sqlite3.connect(DB_PATH)
    try:
        words     = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        templates = conn.execute("SELECT COUNT(*) FROM templates").fetchone()[0]
        questions = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        w_pending = conn.execute("SELECT COUNT(*) FROM words     WHERE verified=0").fetchone()[0]
        q_pending = conn.execute("SELECT COUNT(*) FROM questions WHERE verified=0").fetchone()[0]
        return {"words": words, "templates": templates, "questions": questions,
                "words_pending": w_pending, "questions_pending": q_pending}
    finally:
        conn.close()


# ── 프론트엔드 서빙 ───────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(FRONTEND, "index.html")

@app.route("/admin")
def admin():
    return send_from_directory(FRONTEND, "admin.html")

@app.route("/swipe")
def swipe():
    return send_from_directory(FRONTEND, "swipe.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(FRONTEND, path)


# ── 대시보드 ──────────────────────────────────────────
@app.route("/api/stats")
def api_stats():
    return jsonify(_db_stats())


# ── DOC-IN ────────────────────────────────────────────
@app.route("/api/doc-in", methods=["POST"])
def api_doc_in():
    if "file" not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400

    file  = request.files["file"]
    level = request.form.get("level", "고1")
    book  = request.form.get("book_title", "미분류")

    if not file.filename:
        return jsonify({"error": "파일명이 없습니다."}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error": f"지원하지 않는 파일 형식: {ext}"}), 400

    filename = secure_filename(file.filename)
    save_path = UPLOAD_DIR / filename
    file.save(str(save_path))

    try:
        agent = DocAgent(db_path=DB_PATH)
        stats = agent.process(str(save_path), level=level, book_title=book)
        return jsonify({
            "success": True,
            "total":   stats["total"],
            "saved":   stats["saved"],
            "skipped": stats["skipped"],
            "low_quality": stats["low_quality"],
            "db": _db_stats(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/doc-in/stream", methods=["POST"])
def api_doc_in_stream():
    """DOC-IN 처리 진행률을 Server-Sent Events로 실시간 스트리밍."""
    if "file" not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400

    file  = request.files["file"]
    level = request.form.get("level", "고1")
    book  = request.form.get("book_title", "미분류")

    if not file.filename:
        return jsonify({"error": "파일명이 없습니다."}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error": f"지원하지 않는 파일 형식: {ext}"}), 400

    filename  = secure_filename(file.filename)
    save_path = UPLOAD_DIR / filename
    file.save(str(save_path))

    q: queue_module.Queue = queue_module.Queue()

    def run():
        def on_progress(event: dict):
            # done 이벤트에는 db 통계 추가
            if event.get("type") == "done":
                event["db"] = _db_stats()
            q.put(event)

        try:
            agent = DocAgent(db_path=DB_PATH)
            agent.process(str(save_path), level=level, book_title=book,
                          progress_callback=on_progress)
        except Exception as e:
            q.put({"type": "error", "message": str(e)})

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    @stream_with_context
    def generate():
        while True:
            try:
                event = q.get(timeout=120)
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                if event.get("type") in ("done", "error"):
                    break
            except queue_module.Empty:
                yield "data: {\"type\": \"error\", \"message\": \"처리 시간 초과\"}\n\n"
                break

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",   # Nginx 버퍼링 비활성화
        },
    )


# ── DOC-IN: 문제 추출 ────────────────────────────────
@app.route("/api/doc-in/extract-questions", methods=["POST"])
def api_extract_questions():
    """PDF/이미지에서 문법 문제를 추출하여 반환 (DB 저장 없음)."""
    if "file" not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400

    file      = request.files["file"]
    level     = request.form.get("level", "고1")
    book      = request.form.get("book_title", "미분류")

    if not file.filename:
        return jsonify({"error": "파일명이 없습니다."}), 400

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return jsonify({"error": f"지원하지 않는 형식: {ext}"}), 400

    filename  = secure_filename(file.filename)
    save_path = UPLOAD_DIR / filename
    file.save(str(save_path))

    try:
        agent  = DocAgent(db_path=DB_PATH)
        result = agent.extract_questions(str(save_path), level=level, book_title=book)
        return jsonify({
            "success":  True,
            "total":    result["total"],
            "pages":    result["pages"],
            "ai_used":  result["ai_used"],
            "questions": result["questions"],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── DOC-IN: 변환 + DB 저장 ───────────────────────────
@app.route("/api/doc-in/transform", methods=["POST"])
def api_transform_questions():
    """
    추출된 원본 문제 목록을 저작권 안전 버전으로 변환하고 DB에 저장.

    요청 body:
      { "questions": [...extract_questions 결과...] }

    반환:
      { "saved": int, "skipped": int, "results": [...] }
    """
    data      = request.json or {}
    questions = data.get("questions", [])
    if not questions:
        return jsonify({"error": "questions 필드가 비어 있습니다."}), 400

    transformed = transform_batch(questions, DB_PATH)

    if not transformed:
        return jsonify({"saved": 0, "skipped": len(questions), "results": []}), 200

    # DB 저장
    conn = sqlite3.connect(DB_PATH)
    saved = 0
    try:
        for q in transformed:
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO questions
                         (question_id, grammar_point, level, q_type, stem,
                          choices, answer, explanation, tags,
                          quality_score, verified, source, created_at, used_count)
                       VALUES
                         (:question_id, :grammar_point, :level, :q_type, :stem,
                          :choices, :answer, :explanation, :tags,
                          :quality_score, :verified, :source, :created_at, :used_count)""",
                    q,
                )
                saved += 1
            except Exception:
                pass
        conn.commit()
    finally:
        conn.close()

    skipped = len(questions) - len(transformed)
    return jsonify({
        "success": True,
        "saved":   saved,
        "skipped": skipped + (len(transformed) - saved),
        "results": transformed,
        "db":      _db_stats(),
    })


# ── GEN ───────────────────────────────────────────────
@app.route("/api/gen", methods=["POST"])
def api_gen():
    data          = request.json or {}
    grammar_point = data.get("grammar_point", "현재완료")
    level         = data.get("level", "고1")
    count         = int(data.get("count", 5))
    exclude_ids   = set(data.get("exclude_ids", []))

    try:
        agent     = GenAgent(db_path=DB_PATH)
        questions = agent.generate(grammar_point, level, count, exclude_ids)
        result    = []
        for q in questions:
            result.append({
                "question_id":   q["question_id"],
                "grammar_point": q["grammar_point"],
                "level":         q["level"],
                "q_type":        q["q_type"],
                "stem":          q["stem"],
                "choices":       json.loads(q["choices"]) if q.get("choices") else [],
                "answer":        q["answer"],
                "quality_score": q.get("quality_score", 8),
                "source":        q.get("source", ""),
            })
        return jsonify({"success": True, "questions": result, "db": _db_stats()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── BUILD ─────────────────────────────────────────────
@app.route("/api/build", methods=["POST"])
def api_build():
    data = request.json or {}
    ids  = data.get("question_ids", [])
    if not ids:
        return jsonify({"error": "문제 ID가 없습니다."}), 400

    config = {
        "academy_name": data.get("academy_name", ""),
        "title":        data.get("title", "영어 문법 테스트"),
        "show_answers": data.get("show_answers", False),
        "layout":       data.get("layout", "1col"),
    }

    try:
        agent    = BuildAgent(db_path=DB_PATH, output_dir=OUTPUT_DIR)
        out_path = agent.build(ids, config)
        return jsonify({
            "success":  True,
            "filename": out_path.name,
            "format":   out_path.suffix.lstrip(".").upper(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/build/download/<filename>")
def api_download(filename):
    safe = secure_filename(filename)
    path = OUTPUT_DIR / safe
    if not path.exists():
        return jsonify({"error": "파일을 찾을 수 없습니다."}), 404
    return send_file(str(path), as_attachment=True)


# ── REVIEW ────────────────────────────────────────────
@app.route("/api/review/report")
def api_review_report():
    agent = ReviewAgent(db_path=DB_PATH)
    return jsonify(agent.report())


@app.route("/api/review/list/<table>")
def api_review_list(table):
    if table not in ("words", "questions"):
        return jsonify({"error": "잘못된 테이블"}), 400
    limit    = min(int(request.args.get("limit",  50)), 200)
    offset   = int(request.args.get("offset", 0))
    level    = request.args.get("level")  or None
    pos      = request.args.get("pos")    or None
    verified = request.args.get("verified")
    verified_int = int(verified) if verified is not None else 0

    agent  = ReviewAgent(db_path=DB_PATH)
    result = agent.list_filtered(
        table, level=level, pos=pos,
        verified=verified_int, limit=limit, offset=offset,
    )
    return jsonify(result)


@app.route("/api/words/<word_id>", methods=["PATCH"])
def api_word_update(word_id):
    """단어 개별 필드 수정."""
    data = request.json or {}
    agent = ReviewAgent(db_path=DB_PATH)
    ok    = agent.update_word(word_id, data)
    if not ok:
        return jsonify({"error": "수정할 필드가 없거나 단어를 찾을 수 없습니다."}), 400
    return jsonify({"success": True, "db": _db_stats()})


@app.route("/api/review/bulk-level", methods=["POST"])
def api_bulk_level():
    """선택 항목 레벨 일괄 변경."""
    data  = request.json or {}
    table = data.get("table", "words")
    ids   = data.get("ids", [])
    level = data.get("level", "")
    if not ids or not level:
        return jsonify({"error": "ids와 level이 필요합니다."}), 400
    agent = ReviewAgent(db_path=DB_PATH)
    count = agent.bulk_update_level(table, ids, level)
    return jsonify({"success": True, "updated": count, "db": _db_stats()})


@app.route("/api/review/approve", methods=["POST"])
def api_review_approve():
    data  = request.json or {}
    table = data.get("table", "words")
    ids   = data.get("ids", [])
    agent = ReviewAgent(db_path=DB_PATH)
    count = agent.approve(table, ids)
    return jsonify({"success": True, "updated": count, "db": _db_stats()})


@app.route("/api/review/reject", methods=["POST"])
def api_review_reject():
    data  = request.json or {}
    table = data.get("table", "words")
    ids   = data.get("ids", [])
    agent = ReviewAgent(db_path=DB_PATH)
    count = agent.reject(table, ids)
    return jsonify({"success": True, "deleted": count, "db": _db_stats()})


# ── AI REVIEW ────────────────────────────────────────
@app.route("/api/ai-review/report")
def api_ai_review_report():
    agent = AIReviewAgent(db_path=DB_PATH)
    return jsonify(agent.report())


@app.route("/api/ai-review/scan/<table>")
def api_ai_review_scan(table):
    if table not in ("words", "questions"):
        return jsonify({"error": "잘못된 테이블"}), 400
    limit = min(int(request.args.get("limit", 50)), 200)
    agent = AIReviewAgent(db_path=DB_PATH)
    if table == "words":
        items = agent.scan_words(limit=limit)
    else:
        items = agent.scan_questions(limit=limit)
        agent.update_quality_scores(items)
    return jsonify({"items": items, "count": len(items)})


@app.route("/api/ai-review/auto-approve", methods=["POST"])
def api_ai_auto_approve():
    data      = request.json or {}
    threshold = int(data.get("threshold", 9))
    agent     = AIReviewAgent(db_path=DB_PATH)
    w_cnt     = agent.auto_approve_words()
    q_cnt     = agent.auto_approve_questions(threshold=threshold)
    return jsonify({
        "success":         True,
        "words_approved":  w_cnt,
        "questions_approved": q_cnt,
        "db":              _db_stats(),
    })


# ── JANITOR ───────────────────────────────────────────
@app.route("/api/janitor/scan")
def api_janitor_scan():
    agent  = JanitorAgent(db_path=DB_PATH)
    result = agent.scan_all()
    # items 필드 제거 (요약만 반환)
    summary = {
        "scanned_at":   result["scanned_at"],
        "total_issues": result["total_issues"],
    }
    for key in ("duplicate_words", "incomplete_words", "broken_questions",
                "broken_templates", "low_quality_questions"):
        summary[key] = result[key]["count"]
    return jsonify(summary)


@app.route("/api/janitor/scan/detail")
def api_janitor_scan_detail():
    agent  = JanitorAgent(db_path=DB_PATH)
    result = agent.scan_all()
    return jsonify(result)


@app.route("/api/janitor/fix", methods=["POST"])
def api_janitor_fix():
    agent  = JanitorAgent(db_path=DB_PATH)
    scan   = agent.scan_all()
    fixed  = agent.fix_all(scan)
    return jsonify({"success": True, **fixed, "db": _db_stats()})


@app.route("/api/janitor/health")
def api_janitor_health():
    agent = JanitorAgent(db_path=DB_PATH)
    return jsonify(agent.health_report())


# ── 실행 ──────────────────────────────────────────────
if __name__ == "__main__":
    print("="*50)
    print("  영어 문제은행 서버 시작")
    print("  http://localhost:5000")
    print("="*50)
    app.run(debug=True, port=5000)
