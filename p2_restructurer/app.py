"""
app.py — Program 2: AI Restructurer + Exam Builder
  GET  /              메인 UI
  POST /load          Google Drive에서 문제 로드
  POST /restructure   Claude API로 문제 재구성 (3가지 버전)
  POST /build_pdf     선택된 문제로 시험지 PDF 생성
  GET  /pdf/<file>    PDF 다운로드
  GET  /check_trial   체험 기간 확인
"""

import os
import json
import uuid
import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory
import anthropic

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

OUTPUT_DIR = "output"
TRIAL_FILE = "trial_store.json"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 체험 기간 관리 ────────────────────────────────────

def _load_trials():
    if os.path.exists(TRIAL_FILE):
        with open(TRIAL_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}

def _save_trials(data):
    with open(TRIAL_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)

def check_trial(user_id: str) -> dict:
    trials = _load_trials()
    now = datetime.datetime.utcnow()

    if user_id not in trials:
        # 첫 방문 → 체험 시작
        trials[user_id] = now.isoformat()
        _save_trials(trials)

    start = datetime.datetime.fromisoformat(trials[user_id])
    days_left = 3 - (now - start).days

    return {
        "active": days_left > 0,
        "days_left": max(0, days_left),
        "started": start.isoformat(),
    }


# ── 메인 ──────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/check_trial", methods=["POST"])
def trial_status():
    uid = request.get_json().get("user_id", "demo")
    return jsonify(check_trial(uid))


# ── Google Drive 로드 ─────────────────────────────────

@app.route("/load", methods=["POST"])
def load_questions():
    """Drive 파일 ID 또는 로컬 JSON 경로로 문제 로드."""
    body = request.get_json()
    source = body.get("source")   # "drive" | "local"
    path   = body.get("path", "")

    if source == "local":
        if not os.path.exists(path):
            return jsonify({"error": f"파일 없음: {path}"}), 400
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return jsonify(data)

    elif source == "drive":
        try:
            import sys; sys.path.insert(0, "../p1_categorizer")
            from gdrive import get_service
            service = get_service()
            file_id = body.get("file_id", "")
            content = service.files().get_media(fileId=file_id).execute()
            data = json.loads(content.decode("utf-8"))
            return jsonify(data)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"error": "source는 local 또는 drive"}), 400


# ── Claude AI 재구성 ───────────────────────────────────

@app.route("/restructure", methods=["POST"])
def restructure():
    body     = request.get_json()
    question = body.get("question", {})
    user_id  = body.get("user_id", "demo")

    trial = check_trial(user_id)
    if not trial["active"]:
        return jsonify({"error": "TRIAL_EXPIRED", "days_left": 0}), 402

    original_text = question.get("text", "")
    topic         = question.get("topic", "")
    difficulty    = question.get("difficulty", 3)

    client = anthropic.Anthropic()

    prompt = f"""You are an expert English exam question editor for Korean students.

Original question (topic: {topic}, difficulty: {difficulty}/5):
---
{original_text}
---

Create 3 restructured versions of this question to avoid copyright issues.
Apply these transformations:
1. Replace proper nouns (names, places) with different ones
2. Reorder answer choices (keep the correct answer but change its position)
3. Replace words with synonyms where appropriate
4. Slightly rephrase sentences while keeping the same grammatical structure and difficulty

Return ONLY valid JSON in this exact format:
{{
  "versions": [
    {{
      "id": 1,
      "text": "full question text here",
      "changes": "brief description of changes made"
    }},
    {{
      "id": 2,
      "text": "full question text here",
      "changes": "brief description of changes made"
    }},
    {{
      "id": 3,
      "text": "full question text here",
      "changes": "brief description of changes made"
    }}
  ]
}}"""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()

        # JSON 파싱
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        result = json.loads(raw[start:end])
        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── 시험지 PDF 생성 ────────────────────────────────────

@app.route("/build_pdf", methods=["POST"])
def build_pdf():
    body      = request.get_json()
    questions = body.get("questions", [])
    design    = body.get("design", {})
    user_id   = body.get("user_id", "demo")

    trial = check_trial(user_id)
    if not trial["active"]:
        return jsonify({"error": "TRIAL_EXPIRED"}), 402

    academy   = design.get("academy_name", "영어 학원")
    subtitle  = design.get("subtitle", "")
    logo_text = design.get("logo_text", academy[0] if academy else "A")
    font      = design.get("font", "Noto Sans KR")
    color     = design.get("color", "#2563eb")

    # HTML 시험지 생성
    q_html = ""
    for i, q in enumerate(questions, 1):
        text_html = q.get("text", "").replace("\n", "<br>")
        q_html += f"""
        <div class="question">
          <div class="q-num">{i}</div>
          <div class="q-body">{text_html}</div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family={font.replace(' ','+')}&display=swap" rel="stylesheet">
<style>
  @page {{ margin: 18mm 15mm; }}
  body {{
    font-family: '{font}', sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    line-height: 1.7;
  }}
  .exam-header {{
    display: flex;
    align-items: center;
    gap: 14px;
    border-bottom: 3px solid {color};
    padding-bottom: 12px;
    margin-bottom: 20px;
  }}
  .logo-badge {{
    width: 48px; height: 48px;
    background: {color};
    color: #fff;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    font-weight: 900;
    flex-shrink: 0;
  }}
  .academy-name {{ font-size: 1.25rem; font-weight: 800; color: {color}; }}
  .subtitle {{ font-size: .85rem; color: #666; margin-top: 2px; }}
  .meta {{ margin-left: auto; text-align: right; font-size: .8rem; color: #888; }}
  .question {{
    display: flex;
    gap: 10px;
    margin-bottom: 22px;
    break-inside: avoid;
  }}
  .q-num {{
    min-width: 24px; height: 24px;
    background: {color};
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: .8rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 2px;
  }}
  .q-body {{ flex: 1; }}
  .watermark {{
    position: fixed;
    bottom: 8mm;
    right: 12mm;
    font-size: 8pt;
    color: #ccc;
  }}
</style>
</head>
<body>
<div class="exam-header">
  <div class="logo-badge">{logo_text}</div>
  <div>
    <div class="academy-name">{academy}</div>
    <div class="subtitle">{subtitle}</div>
  </div>
  <div class="meta">
    이름: ________________<br>
    날짜: ________________
  </div>
</div>
{q_html}
<div class="watermark">Made with ExamSwipe</div>
</body>
</html>"""

    out_file = f"exam_{uuid.uuid4().hex[:6]}.html"
    out_path = os.path.join(OUTPUT_DIR, out_file)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    # WeasyPrint로 PDF 변환 시도, 없으면 HTML 그대로 제공
    pdf_file = out_file.replace(".html", ".pdf")
    pdf_path = os.path.join(OUTPUT_DIR, pdf_file)
    try:
        from weasyprint import HTML
        HTML(string=html).write_pdf(pdf_path)
        return jsonify({"success": True, "file": pdf_file, "type": "pdf"})
    except ImportError:
        return jsonify({"success": True, "file": out_file, "type": "html",
                        "note": "PDF 변환은 weasyprint 설치 후 가능합니다"})


@app.route("/pdf/<filename>")
def serve_pdf(filename):
    return send_from_directory(OUTPUT_DIR, filename)


if __name__ == "__main__":
    app.run(debug=True, port=5002)
