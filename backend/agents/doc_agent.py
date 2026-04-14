"""
doc_agent.py — DOC-IN 에이전트 (PDF/이미지 → DB 자료화)
=========================================================
어떤 문서든 받아서 DB가 읽을 수 있는 형태로 변환.

사용법:
    python backend/agents/doc_agent.py --file data/sample.pdf --level 고1 --book "수능단어"
"""

import argparse
import json
import re
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

# 프로젝트 루트를 sys.path에 추가
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from backend.utils.ai_client import AIClient

# PyMuPDF 선택적 임포트
try:
    import fitz  # PyMuPDF
    _FITZ_AVAILABLE = True
except ImportError:
    _FITZ_AVAILABLE = False

DB_PATH = ROOT / "backend" / "db" / "qbank.db"
SCHEMA_SQL = ROOT / "backend" / "db" / "schema.sql"

LEVEL_TO_GRADE = {
    "중1": 1, "중2": 2, "중3": 3,
    "고1": 4, "고2": 5, "고3": 6,
    "수능": 7, "수능고급": 8,
}

# 품질 점수 기준
QUALITY_THRESHOLD = 7


# ── 텍스트 추출 ───────────────────────────────────────

def extract_text_from_pdf(file_path: Path) -> list[str]:
    """PDF에서 페이지별 텍스트 추출. PyMuPDF 없으면 빈 리스트."""
    if not _FITZ_AVAILABLE:
        return []
    pages = []
    try:
        doc = fitz.open(str(file_path))
        for page in doc:
            text = page.get_text().strip()
            pages.append(text)
        doc.close()
    except Exception as e:
        print(f"  [경고] PDF 텍스트 추출 실패: {e}")
    return pages


def extract_images_from_pdf(file_path: Path, out_dir: Path) -> list[Path]:
    """PDF에서 이미지 추출 후 파일 저장. 경로 리스트 반환."""
    if not _FITZ_AVAILABLE:
        return []
    out_dir.mkdir(parents=True, exist_ok=True)
    image_paths = []
    try:
        doc = fitz.open(str(file_path))
        for page_num, page in enumerate(doc):
            for img_index, img in enumerate(page.get_images(full=True)):
                xref = img[0]
                base_image = doc.extract_image(xref)
                ext = base_image["ext"]
                img_bytes = base_image["image"]
                img_path = out_dir / f"page{page_num}_img{img_index}.{ext}"
                img_path.write_bytes(img_bytes)
                image_paths.append(img_path)
        doc.close()
    except Exception as e:
        print(f"  [경고] 이미지 추출 실패: {e}")
    return image_paths


# ── 단어 파싱 ─────────────────────────────────────────

def parse_words_from_text(text: str) -> list[str]:
    """
    텍스트에서 영어 단어 후보 추출.
    지원 형태:
      - "accomplish - 성취하다"
      - "accomplish: 성취하다"
      - "accomplish 성취하다"
      - "1. accomplish 성취하다"
      - "accomplish [발음] 성취하다"
      - "accomplish"  (단독)
    """
    words = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # 번호 제거: "1.", "01.", "①" 등
        line = re.sub(r"^\d+[.)]\s*|^[①-⑳]\s*", "", line)

        # 영어 단어 추출 (첫 번째 영어 토큰)
        match = re.match(r"^([a-zA-Z][a-zA-Z\-']{1,29})", line)
        if match:
            word = match.group(1).lower()
            # 너무 짧거나 불용어 제외
            if len(word) >= 2 and word not in {"the", "a", "an", "is", "of", "in", "to", "it"}:
                words.append(word)

    return list(dict.fromkeys(words))  # 중복 제거, 순서 유지


def parse_meaning_from_line(line: str) -> str:
    """줄에서 한국어 뜻 추출."""
    line = line.strip()
    line = re.sub(r"^\d+[.)]\s*|^[①-⑳]\s*", "", line)
    # "word - 뜻", "word: 뜻", "word [발음] 뜻", "word 뜻" 패턴
    match = re.match(r"^[a-zA-Z\-']+\s*(?:\[.*?\])?\s*[-:]\s*(.+)$", line)
    if match:
        return match.group(1).strip()
    # 뒤쪽 한글 부분 추출
    match = re.search(r"[가-힣][가-힣\s,·/()]+", line)
    if match:
        return match.group(0).strip()
    return ""


# ── DB 초기화 및 저장 ─────────────────────────────────

def ensure_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    # 테이블이 없을 때만 스키마 적용 (IF NOT EXISTS 사용)
    with open(SCHEMA_SQL, encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


def save_word(conn: sqlite3.Connection, record: dict) -> bool:
    """단어 1건 저장. 이미 있으면 건너뜀. 성공 여부 반환."""
    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO words
              (word_id, word, pos, level, grade_num, meaning_ko, meaning_en,
               synonyms, antonyms, example, category, source_book,
               verb_past, verb_pp, verb_ing, noun_plural,
               adj_comp, adj_super, verified)
            VALUES
              (:word_id, :word, :pos, :level, :grade_num, :meaning_ko, :meaning_en,
               :synonyms, :antonyms, :example, :category, :source_book,
               :verb_past, :verb_pp, :verb_ing, :noun_plural,
               :adj_comp, :adj_super, :verified)
            """,
            record,
        )
        return conn.execute("SELECT changes()").fetchone()[0] > 0
    except Exception as e:
        print(f"  [경고] DB 저장 실패 ({record.get('word')}): {e}")
        return False


# ── DocAgent ──────────────────────────────────────────

class DocAgent:
    def __init__(self, db_path: Path | str | None = None, ai_client: AIClient | None = None):
        self.db_path = Path(db_path) if db_path else DB_PATH
        self.ai = ai_client or AIClient()

    def process(self, file_path: str | Path, level: str, book_title: str) -> dict:
        """
        파일을 처리하고 words 테이블에 저장.

        반환:
          {
            "total":       처리한 단어 수,
            "saved":       DB에 저장된 신규 단어 수,
            "skipped":     중복으로 건너뛴 수,
            "low_quality": 품질 미달 (needs_review) 단어 수,
            "words":       저장된 단어 목록,
          }
        """
        file_path = Path(file_path)
        print(f"\n{'='*55}")
        print(f"  DOC-IN 에이전트 시작")
        print(f"{'='*55}")
        print(f"  파일:  {file_path.name}")
        print(f"  레벨:  {level}")
        print(f"  교재:  {book_title}")
        print()

        grade_num = LEVEL_TO_GRADE.get(level, 4)

        # ── 1. 파일 형식 판별 및 텍스트 추출 ─────────
        suffix = file_path.suffix.lower()
        raw_texts: list[str] = []

        if not file_path.exists():
            print(f"  [오류] 파일 없음: {file_path}")
            return {"total": 0, "saved": 0, "skipped": 0, "low_quality": 0, "words": []}

        if suffix == ".pdf":
            print("  [1/4] PDF 텍스트 추출 중...")
            pages = extract_text_from_pdf(file_path)

            if pages:
                raw_texts = pages
                print(f"        텍스트 {len(pages)}페이지 추출 완료")
            else:
                # 스캔 PDF: 이미지로 추출 후 Vision
                print("        텍스트 없음 → 이미지 추출 후 Vision 처리")
                tmp_dir = ROOT / "data" / "tmp_images"
                images = extract_images_from_pdf(file_path, tmp_dir)
                print(f"        이미지 {len(images)}장 추출")
                for img in images:
                    text = self.ai.read_image(str(img))
                    if text:
                        raw_texts.append(text)

        elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            print("  [1/4] 이미지 Vision 처리 중...")
            text = self.ai.read_image(str(file_path))
            if text:
                raw_texts = [text]

        elif suffix == ".txt":
            print("  [1/4] 텍스트 파일 읽기...")
            raw_texts = [file_path.read_text(encoding="utf-8")]

        else:
            print(f"  [오류] 지원하지 않는 파일 형식: {suffix}")
            return {"total": 0, "saved": 0, "skipped": 0, "low_quality": 0, "words": []}

        # ── 2. 단어 파싱 ──────────────────────────────
        print("  [2/4] 단어 파싱 중...")
        all_words: list[tuple[str, str]] = []  # (word, meaning_ko)
        for text in raw_texts:
            for line in text.splitlines():
                parsed = parse_words_from_text(line)
                meaning = parse_meaning_from_line(line)
                for w in parsed:
                    all_words.append((w, meaning))

        # 중복 제거
        seen: set[str] = set()
        unique_words: list[tuple[str, str]] = []
        for w, m in all_words:
            if w not in seen:
                seen.add(w)
                unique_words.append((w, m))

        print(f"        {len(unique_words)}개 단어 후보 파악")

        # ── 3. AI 태깅 + 품질 검사 ───────────────────
        print("  [3/4] 자동 태깅 및 품질 검사 중...")
        ensure_db(self.db_path)
        conn = sqlite3.connect(self.db_path)

        stats = {"total": 0, "saved": 0, "skipped": 0, "low_quality": 0, "words": []}

        for word, meaning_ko in unique_words:
            stats["total"] += 1

            # 레벨 분류 (AI or 입력값 그대로)
            ai_level = self.ai.classify_level(word) if self.ai.available else level
            # 입력 레벨과 AI 레벨 중 더 구체적인 것 사용
            final_level = ai_level if ai_level != "중2" else level
            final_grade = LEVEL_TO_GRADE.get(final_level, grade_num)

            # 품사 분류
            pos = self.ai.classify_pos(word) if self.ai.available else "noun"

            # 품질 점수
            score = self.ai.score_quality(
                stem=word,
                choices=None,
                answer=meaning_ko or None,
            )
            needs_review = score < QUALITY_THRESHOLD
            verified = 0  # 검수는 대표님이 직접

            record = {
                "word_id":     str(uuid.uuid4()),
                "word":        word,
                "pos":         pos,
                "level":       final_level,
                "grade_num":   final_grade,
                "meaning_ko":  meaning_ko or None,
                "meaning_en":  None,
                "synonyms":    None,
                "antonyms":    None,
                "example":     None,
                "category":    None,
                "source_book": book_title,
                "verb_past":   None,
                "verb_pp":     None,
                "verb_ing":    None,
                "noun_plural": None,
                "adj_comp":    None,
                "adj_super":   None,
                "verified":    verified,
            }

            saved = save_word(conn, record)
            if saved:
                stats["saved"] += 1
                if needs_review:
                    stats["low_quality"] += 1
                stats["words"].append({"word": word, "pos": pos, "level": final_level,
                                       "score": score, "needs_review": needs_review})
            else:
                stats["skipped"] += 1

        conn.commit()
        conn.close()

        # ── 4. 요약 리포트 ────────────────────────────
        print("  [4/4] 완료\n")
        self._print_report(stats, book_title)
        return stats

    def _print_report(self, stats: dict, book_title: str):
        print(f"{'─'*55}")
        print(f"  처리 완료 리포트 — {book_title}")
        print(f"{'─'*55}")
        print(f"  총 단어 후보:    {stats['total']}개")
        print(f"  DB 신규 저장:    {stats['saved']}개")
        print(f"  중복 건너뜀:     {stats['skipped']}개")
        print(f"  검수 필요:       {stats['low_quality']}개  (품질점수 < {QUALITY_THRESHOLD})")
        print()
        if stats["words"]:
            print("  저장된 단어 목록:")
            for w in stats["words"][:20]:
                flag = " ⚠️ 검수필요" if w["needs_review"] else ""
                print(f"    [{w['pos']:10}] {w['word']:20} {w['level']}  (점수:{w['score']}){flag}")
            if len(stats["words"]) > 20:
                print(f"    ... 외 {len(stats['words']) - 20}개")
        print()


# ── CLI ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DOC-IN 에이전트 — 문서를 DB로 자료화")
    parser.add_argument("--file",  required=True, help="처리할 파일 경로")
    parser.add_argument("--level", required=True,
                        choices=list(LEVEL_TO_GRADE.keys()), help="난이도 레벨")
    parser.add_argument("--book",  required=True, help="교재명")
    args = parser.parse_args()

    agent = DocAgent()
    agent.process(args.file, args.level, args.book)


if __name__ == "__main__":
    main()
