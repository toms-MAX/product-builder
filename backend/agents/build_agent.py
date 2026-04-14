"""
build_agent.py — BUILD 에이전트 (시험지 PDF 출력)
==================================================
ReportLab 있으면 PDF, 없으면 HTML로 폴백.

사용법:
    python backend/agents/build_agent.py \\
        --ids q1,q2,q3 \\
        --academy "민준영어" \\
        --title "문법 테스트" \\
        [--show-answers] [--layout 2col]
"""

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.agents.doc_agent import ensure_db

DB_PATH    = ROOT / "backend" / "db" / "qbank.db"
OUTPUT_DIR = ROOT / "output"

# ReportLab 선택적 임포트
try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    )
    _REPORTLAB = True
except ImportError:
    _REPORTLAB = False

# 한글 폰트 후보 경로
_KOREAN_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/nanum/NanumGothic.ttf",
    "/Library/Fonts/AppleGothic.ttf",
    "C:/Windows/Fonts/malgun.ttf",
]
_FALLBACK_FONT_PATH = None
for _p in _KOREAN_FONT_CANDIDATES:
    if Path(_p).exists():
        _FALLBACK_FONT_PATH = _p
        break

# DejaVu (항상 존재)
_DEJAVU_CANDIDATES = [
    "/nix/store/1mjlla0fc468wl9cphnn2ivpfx02mr7j-dejavu-fonts-minimal-2.37/share/fonts/truetype/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
_DEJAVU_PATH = next((p for p in _DEJAVU_CANDIDATES if Path(p).exists()), None)


# ── 폰트 설정 ─────────────────────────────────────────

def _setup_fonts():
    """ReportLab 폰트 등록. 한글 폰트 없으면 DejaVu 사용."""
    font_name = "CustomFont"
    if _FALLBACK_FONT_PATH:
        pdfmetrics.registerFont(TTFont(font_name, _FALLBACK_FONT_PATH))
    elif _DEJAVU_PATH:
        pdfmetrics.registerFont(TTFont(font_name, _DEJAVU_PATH))
    else:
        font_name = "Helvetica"
    return font_name


# ── DB 조회 ───────────────────────────────────────────

def fetch_questions(db_path: Path, question_ids: list[str]) -> list[dict]:
    if not db_path.exists():
        return []
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        placeholders = ",".join("?" * len(question_ids))
        rows = conn.execute(
            f"SELECT * FROM questions WHERE question_id IN ({placeholders})",
            question_ids,
        ).fetchall()
        # 요청 순서 유지
        order = {qid: i for i, qid in enumerate(question_ids)}
        return sorted([dict(r) for r in rows],
                      key=lambda r: order.get(r["question_id"], 9999))
    finally:
        conn.close()


# ── PDF 빌더 ──────────────────────────────────────────

def _build_pdf(questions: list[dict], config: dict, out_path: Path):
    font = _setup_fonts()

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm,  bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    h_style = ParagraphStyle("header", fontName=font, fontSize=14,
                              alignment=TA_CENTER, spaceAfter=4)
    sub_style = ParagraphStyle("sub", fontName=font, fontSize=10,
                               alignment=TA_CENTER, spaceAfter=2, textColor=colors.grey)
    q_style  = ParagraphStyle("q",  fontName=font, fontSize=11,
                               leading=16, spaceAfter=4)
    c_style  = ParagraphStyle("c",  fontName=font, fontSize=10,
                               leading=14, leftIndent=10)
    ans_style = ParagraphStyle("ans", fontName=font, fontSize=9,
                                textColor=colors.red, spaceAfter=2)

    elements = []

    # 헤더
    academy = config.get("academy_name", "")
    title   = config.get("title", "영어 문법 테스트")
    if academy:
        elements.append(Paragraph(academy, sub_style))
    elements.append(Paragraph(title, h_style))
    elements.append(Paragraph(
        f"총 {len(questions)}문제  |  {datetime.now().strftime('%Y년 %m월 %d일')}",
        sub_style,
    ))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.black))
    elements.append(Spacer(1, 6 * mm))

    layout = config.get("layout", "1col")
    show_answers = config.get("show_answers", False)

    if layout == "2col":
        _add_2col(elements, questions, config, font, q_style, c_style, ans_style)
    else:
        _add_1col(elements, questions, show_answers, q_style, c_style, ans_style)

    doc.build(elements)


def _add_1col(elements, questions, show_answers, q_style, c_style, ans_style):
    from reportlab.platypus import Spacer
    for i, q in enumerate(questions, 1):
        choices = json.loads(q["choices"]) if q.get("choices") else []
        elements.append(Paragraph(f"{i}. {q['stem']}", q_style))
        for j, c in enumerate(choices):
            elements.append(Paragraph(f"  ① ② ③ ④ ⑤"[j * 2:j * 2 + 2] + f"  {c}", c_style))
        if show_answers and q.get("answer"):
            elements.append(Paragraph(f"[정답: {q['answer']}]", ans_style))
        elements.append(Spacer(1, 4))


def _add_2col(elements, questions, config, font, q_style, c_style, ans_style):
    """2컬럼 레이아웃: Table로 좌/우 분할."""
    from reportlab.platypus import Spacer
    show_answers = config.get("show_answers", False)
    pairs = []
    for i, q in enumerate(questions, 1):
        choices = json.loads(q["choices"]) if q.get("choices") else []
        lines = [Paragraph(f"{i}. {q['stem']}", q_style)]
        for j, c in enumerate(choices):
            lines.append(Paragraph(f"  {'①②③④⑤'[j]}  {c}", c_style))
        if show_answers and q.get("answer"):
            lines.append(Paragraph(f"[정답: {q['answer']}]", ans_style))
        pairs.append(lines)

    rows = []
    for i in range(0, len(pairs), 2):
        left  = pairs[i]
        right = pairs[i + 1] if i + 1 < len(pairs) else [""]
        rows.append([left, right])

    if rows:
        t = Table(rows, colWidths=["50%", "50%"])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)


# ── HTML 폴백 빌더 ────────────────────────────────────

def _build_html(questions: list[dict], config: dict, out_path: Path):
    academy      = config.get("academy_name", "")
    title        = config.get("title", "영어 문법 테스트")
    show_answers = config.get("show_answers", False)
    layout       = config.get("layout", "1col")
    col_style    = "column-count:2;column-gap:40px;" if layout == "2col" else ""

    q_blocks = []
    for i, q in enumerate(questions, 1):
        choices = json.loads(q["choices"]) if q.get("choices") else []
        nums = "①②③④⑤"
        choice_html = "".join(
            f"<div class='choice'>{nums[j]} {c}</div>"
            for j, c in enumerate(choices)
        )
        answer_html = (
            f"<div class='answer'>정답: {q['answer']}</div>"
            if show_answers and q.get("answer") else ""
        )
        q_blocks.append(
            f"<div class='question'>"
            f"<div class='stem'>{i}. {q['stem']}</div>"
            f"{choice_html}{answer_html}"
            f"</div>"
        )

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
  body {{ font-family: 'Malgun Gothic','Apple Gothic',sans-serif;
          margin:20mm; font-size:11pt; }}
  h1   {{ text-align:center; font-size:16pt; margin-bottom:4px; }}
  .sub {{ text-align:center; color:#666; font-size:9pt; margin-bottom:8px; }}
  hr   {{ margin:8px 0; }}
  .questions {{ {col_style} }}
  .question  {{ margin-bottom:14px; break-inside:avoid; }}
  .stem      {{ font-weight:bold; margin-bottom:4px; }}
  .choice    {{ margin-left:16px; font-size:10pt; line-height:1.6; }}
  .answer    {{ color:red; font-size:9pt; margin-top:2px; }}
</style>
</head>
<body>
{'<div class="sub">' + academy + '</div>' if academy else ''}
<h1>{title}</h1>
<div class="sub">총 {len(questions)}문제 &nbsp;|&nbsp; {datetime.now().strftime('%Y년 %m월 %d일')}</div>
<hr>
<div class="questions">
{''.join(q_blocks)}
</div>
</body>
</html>"""

    out_path.write_text(html, encoding="utf-8")


# ── BuildAgent ────────────────────────────────────────

class BuildAgent:
    def __init__(self, db_path: Path | str | None = None,
                 output_dir: Path | str | None = None):
        self.db_path    = Path(db_path)    if db_path    else DB_PATH
        self.output_dir = Path(output_dir) if output_dir else OUTPUT_DIR

    def build(self, question_ids: list[str], config: dict | None = None) -> Path:
        """
        문제 ID 리스트로 시험지 생성.

        config 키:
          academy_name  학원명 (기본값: "")
          title         시험지 제목 (기본값: "영어 문법 테스트")
          logo_path     로고 이미지 경로 (현재 미사용)
          show_answers  정답 표시 여부 (기본값: False)
          layout        "1col" or "2col" (기본값: "1col")

        반환: 생성된 파일 경로
        """
        config = config or {}
        self.output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        print(f"\n{'='*55}")
        print(f"  BUILD 에이전트 시작")
        print(f"{'='*55}")
        print(f"  학원:   {config.get('academy_name', '(없음)')}")
        print(f"  제목:   {config.get('title', '영어 문법 테스트')}")
        print(f"  레이아웃: {config.get('layout', '1col')}")
        print(f"  정답표시: {'예' if config.get('show_answers') else '아니오'}")
        print(f"  문제 수: {len(question_ids)}개")
        print()

        # DB에서 문제 조회
        questions = fetch_questions(self.db_path, question_ids)
        if not questions:
            print("  [경고] 조회된 문제 없음. 전달된 ID 확인 필요.")

        if _REPORTLAB:
            out_path = self.output_dir / f"시험지_{timestamp}.pdf"
            print("  [빌드] PDF 생성 중...")
            _build_pdf(questions, config, out_path)
            fmt = "PDF"
        else:
            out_path = self.output_dir / f"시험지_{timestamp}.html"
            print("  [빌드] ReportLab 없음 → HTML로 생성 중...")
            _build_html(questions, config, out_path)
            fmt = "HTML (브라우저에서 PDF로 인쇄 가능)"

        print(f"  완료: {out_path.name}  [{fmt}]")
        print(f"  경로: {out_path}\n")
        return out_path


# ── CLI ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BUILD 에이전트 — 시험지 생성")
    parser.add_argument("--ids",          required=True, help="문제 ID 콤마 구분")
    parser.add_argument("--academy",      default="",    help="학원명")
    parser.add_argument("--title",        default="영어 문법 테스트", help="시험지 제목")
    parser.add_argument("--logo",         default=None,  help="로고 이미지 경로")
    parser.add_argument("--show-answers", action="store_true", help="정답 표시")
    parser.add_argument("--layout",       default="1col",
                        choices=["1col", "2col"], help="레이아웃")
    args = parser.parse_args()

    config = {
        "academy_name": args.academy,
        "title":        args.title,
        "logo_path":    args.logo,
        "show_answers": args.show_answers,
        "layout":       args.layout,
    }

    agent = BuildAgent()
    ids   = [i.strip() for i in args.ids.split(",") if i.strip()]
    agent.build(ids, config)


if __name__ == "__main__":
    main()
