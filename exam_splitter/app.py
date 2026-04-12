"""
app.py — Flask 서버
  GET  /            업로드 폼 + 결과 뷰어
  POST /process     이미지 처리 → 문제 리스트 JSON 반환
  GET  /img/<sid>/<file>  크롭 이미지 서빙
  POST /save        태깅 결과를 JSON 파일로 저장
"""

import os
import json
import uuid
from flask import Flask, render_template, request, jsonify, send_from_directory
from detector import detect_questions

app = Flask(__name__)
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "output"
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    if "file" not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "파일을 선택하세요."}), 400

    # 세션 ID로 격리된 폴더 생성
    sid = uuid.uuid4().hex[:8]
    upload_path = os.path.join(UPLOAD_DIR, f"{sid}_{f.filename}")
    f.save(upload_path)

    out_dir = os.path.join(OUTPUT_DIR, sid)

    try:
        questions = detect_questions(upload_path, out_dir)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"session_id": sid, "questions": questions})


@app.route("/img/<sid>/<filename>")
def serve_img(sid, filename):
    folder = os.path.join(OUTPUT_DIR, sid)
    return send_from_directory(folder, filename)


@app.route("/save", methods=["POST"])
def save():
    body = request.get_json()
    sid = body.get("session_id", "unknown")
    questions = body.get("questions", [])

    out_dir = os.path.join(OUTPUT_DIR, sid)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "tagged.json")

    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(
            {
                "session_id": sid,
                "total": len(questions),
                "questions": questions,
            },
            fp,
            ensure_ascii=False,
            indent=2,
        )

    return jsonify({"success": True, "saved_to": out_path})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
