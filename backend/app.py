"""
app.py — Flask API 서버
========================
프론트엔드 ↔ 에이전트 4개를 연결하는 REST API.

실행:
    python backend/app.py
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

from backend.agents.doc_agent    import DocAgent
from backend.agents.gen_agent    import GenAgent
from backend.agents.build_agent  import BuildAgent
from backend.agents.review_agent import ReviewAgent
from backend.agents.doc_agent    import ensure_db

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
    limit = int(request.args.get("limit", 50))
    agent = ReviewAgent(db_path=DB_PATH)
    rows  = agent.list_pending(table, limit=limit)
    return jsonify({"items": rows})


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


# ── 실행 ──────────────────────────────────────────────
if __name__ == "__main__":
    print("="*50)
    print("  영어 문제은행 서버 시작")
    print("  http://localhost:5000")
    print("="*50)
    app.run(debug=True, port=5000)
