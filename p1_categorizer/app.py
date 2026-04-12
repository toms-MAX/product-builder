"""
app.py — Program 1: Swipe Categorizer
  GET  /              메인 UI
  POST /process       이미지/PDF 처리
  GET  /img/<s>/<f>   문제 이미지 서빙
  POST /save_local    로컬 JSON 저장
  POST /save_drive    Google Drive 업로드
"""

import os
import json
import uuid
from flask import Flask, render_template, request, jsonify, send_from_directory
from detector import detect_questions

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024  # 30MB

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "output"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ── 메인 ──────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── 이미지 처리 ──────────────────────────────────────

@app.route("/process", methods=["POST"])
def process():
    if "file" not in request.files:
        return jsonify({"error": "파일이 없습니다."}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "파일을 선택하세요."}), 400

    sid = uuid.uuid4().hex[:8]
    ext = os.path.splitext(f.filename)[1].lower()
    upload_path = os.path.join(UPLOAD_DIR, f"{sid}{ext}")
    f.save(upload_path)

    out_dir = os.path.join(OUTPUT_DIR, sid)

    try:
        # PDF는 먼저 이미지로 변환
        if ext == ".pdf":
            upload_path = _pdf_to_image(upload_path, out_dir)

        questions = detect_questions(upload_path, out_dir)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({"session_id": sid, "questions": questions})


def _pdf_to_image(pdf_path: str, out_dir: str) -> str:
    """PDF 첫 페이지를 고해상도 PNG로 변환."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("PDF 처리를 위해 PyMuPDF가 필요합니다: pip install pymupdf")

    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    # 모든 페이지를 하나의 긴 이미지로 합치기
    import numpy as np
    import cv2

    pages_imgs = []
    for page in doc:
        mat = fitz.Matrix(2.5, 2.5)  # 2.5x 해상도
        pix = page.get_pixmap(matrix=mat)
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )
        if pix.n == 4:
            img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
        pages_imgs.append(img_array)

    combined = np.vstack(pages_imgs)
    out_path = os.path.join(out_dir, "source.png")
    cv2.imwrite(out_path, combined)
    return out_path


# ── 이미지 서빙 ──────────────────────────────────────

@app.route("/img/<sid>/<filename>")
def serve_img(sid, filename):
    return send_from_directory(os.path.join(OUTPUT_DIR, sid), filename)


# ── 로컬 저장 ─────────────────────────────────────────

@app.route("/save_local", methods=["POST"])
def save_local():
    body = request.get_json()
    sid = body.get("session_id", "unknown")
    questions = body.get("questions", [])

    out_dir = os.path.join(OUTPUT_DIR, sid)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "categorized.json")

    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump(
            {"session_id": sid, "total": len(questions), "questions": questions},
            fp,
            ensure_ascii=False,
            indent=2,
        )

    return jsonify({"success": True, "path": out_path})


# ── Google Drive 저장 ─────────────────────────────────

@app.route("/save_drive", methods=["POST"])
def save_drive():
    body = request.get_json()
    sid = body.get("session_id", "unknown")
    questions = body.get("questions", [])

    try:
        from gdrive import upload_json
        link = upload_json(
            {"session_id": sid, "total": len(questions), "questions": questions},
            f"exam_{sid}.json",
        )
        return jsonify({"success": True, "link": link})
    except FileNotFoundError as e:
        return jsonify({"error": str(e), "need_setup": True}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5001)
