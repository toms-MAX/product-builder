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
from backend.core.ontology import LEVEL_TO_GRADE

# PyMuPDF 선택적 임포트
try:
    import fitz  # PyMuPDF
    _FITZ_AVAILABLE = True
except ImportError:
    _FITZ_AVAILABLE = False

DB_PATH = ROOT / "backend" / "db" / "qbank.db"
SCHEMA_SQL = ROOT / "backend" / "db" / "schema.sql"

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


# ── 문제 파싱 ────────────────────────────────────────

def parse_questions_from_text(text: str) -> list[dict]:
    """
    텍스트에서 ①②③④⑤ 패턴으로 객관식 문제 블록 감지.

    지원 레이아웃:
      수직형:  stem 줄 / ① choice / ② choice / ...
      수평형:  stem 줄 / ① choice ② choice ③ choice ...
      혼합형:  지시문 + stem + choices

    반환:
      [{"raw_stem": str, "choices": list[str], "has_blank": bool}, ...]
    """
    CIRCLES = "①②③④⑤"
    questions: list[dict] = []

    # 줄 단위로 처리
    lines = [l.rstrip() for l in text.splitlines()]

    i = 0
    while i < len(lines):
        line = lines[i]

        # ① 이 포함된 줄 발견 → 보기 시작점
        if "①" not in line:
            i += 1
            continue

        # ── stem 수집: 현재 줄 앞에서 영어가 있는 줄을 역방향으로 수집 ──
        stem_lines: list[str] = []
        for j in range(i - 1, max(-1, i - 8), -1):
            prev = lines[j].strip()
            if not prev:
                if stem_lines:
                    break       # 빈 줄이 나오면 수집 종료
                continue
            # circled-number가 있는 줄은 이전 문제의 보기 → 건너뜀
            if any(c in prev for c in CIRCLES):
                break
            if re.search(r"[a-zA-Z]", prev):
                # 질문 번호만 있는 줄 건너뜀 (예: "3.")
                if re.fullmatch(r"\d+[.)]\s*", prev):
                    continue
                stem_lines.insert(0, prev)
            elif stem_lines:
                break           # 한글만인 줄이 중간에 나오면 종료

        # ── stem이 없으면 ERR_ID 형식인지 확인 ──────────
        # ERR_ID: 보기 자체가 영어 문장 (지시문은 한글)
        if not stem_lines:
            # ①이 있는 줄의 텍스트가 영어 문장이면 → ERR_ID
            first_choice_text = re.sub(r"^[①②③④⑤]\s*", "", line).strip()
            if re.search(r"[A-Z][a-z]", first_choice_text):
                # 지시문을 stem 대신 사용 (앞 한글 줄)
                for j in range(i - 1, max(-1, i - 4), -1):
                    prev = lines[j].strip()
                    if re.search(r"[가-힣]", prev) and len(prev) > 2:
                        stem_lines = [prev]
                        break
                if not stem_lines:
                    stem_lines = ["어법상 틀린 것을 고르시오."]  # 기본 지시문
            else:
                i += 1
                continue

        stem_raw = " ".join(stem_lines)
        # 줄 맨 앞 번호·괄호 제거
        stem_raw = re.sub(r"^\s*\d+[.)\]]\s*", "", stem_raw).strip()
        # 한글 지시문 제거 — 영어 stem 앞에 붙은 경우만 (ERR_ID 한글 stem은 유지)
        if re.search(r"[a-zA-Z]", stem_raw):
            stem_raw = re.sub(
                r"(?:다음|보기|밑줄|빈칸|어법|아래)[^\n]{0,40}(?:고르시오|쓰시오|찾으시오)[^\n]*",
                "", stem_raw,
            ).strip()
        # 빈칸 정규화
        stem_raw = re.sub(r"_{2,}", "_____", stem_raw)
        stem_raw = re.sub(r"\(\s{2,}\)", "_____", stem_raw)

        if not stem_raw:
            i += 1
            continue
        # 한글 지시문만 있는 경우(ERR_ID): 보기에 영어가 있으면 허용
        if not re.search(r"[a-zA-Z]", stem_raw):
            first_choice_text = re.sub(r"^[①②③④⑤]\s*", "", line).strip()
            if not re.search(r"[A-Za-z]", first_choice_text):
                i += 1
                continue

        # ── choices 수집: 현재 줄부터 ②③④⑤ 끝까지 ──────────────────
        choice_text_parts: list[str] = []
        k = i
        while k < min(i + 10, len(lines)):
            l = lines[k].strip()
            if any(c in l for c in CIRCLES):
                choice_text_parts.append(l)
            elif choice_text_parts and l:
                # 보기 뒤 일반 텍스트가 나오면 종료
                break
            k += 1

        all_choices_text = " ".join(choice_text_parts)
        choices = re.findall(r"[①②③④⑤]\s*([^①②③④⑤\n]{1,80})", all_choices_text)
        choices = [c.strip() for c in choices if c.strip()]

        if len(choices) >= 2:
            questions.append({
                "raw_stem": stem_raw,
                "choices":  choices[:5],
                "has_blank": "_____" in stem_raw,
            })

        i = k  # 보기 이후 줄부터 재개

    return questions


# ── DB 초기화 및 저장 ─────────────────────────────────

def ensure_db(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    with open(SCHEMA_SQL, encoding="utf-8") as f:
        conn.executescript(f.read())
    # 스키마 진화: 신규 컬럼 추가 (이미 있으면 무시)
    for stmt in [
        "ALTER TABLE templates ADD COLUMN grammar_answer  TEXT",
        "ALTER TABLE templates ADD COLUMN grammar_choices TEXT",
    ]:
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass
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

    def process(
        self,
        file_path: str | Path,
        level: str,
        book_title: str,
        progress_callback=None,
    ) -> dict:
        """
        파일을 처리하고 words 테이블에 저장.

        Args:
            progress_callback: (event: dict) -> None
                event 예시:
                  {"type": "step",     "step": 1, "total_steps": 4, "message": "PDF 텍스트 추출 중..."}
                  {"type": "progress", "current": 3, "total": 100, "word": "accomplish", "pct": 3}
                  {"type": "done",     "stats": {...}}

        반환:
          {
            "total":       처리한 단어 수,
            "saved":       DB에 저장된 신규 단어 수,
            "skipped":     중복으로 건너뛴 수,
            "low_quality": 품질 미달 (needs_review) 단어 수,
            "words":       저장된 단어 목록,
          }
        """
        def emit(event: dict):
            if progress_callback:
                progress_callback(event)

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
            emit({"type": "step", "step": 1, "total_steps": 4, "message": "PDF 텍스트 추출 중..."})
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
            emit({"type": "step", "step": 1, "total_steps": 4, "message": "이미지 Vision 처리 중..."})
            print("  [1/4] 이미지 Vision 처리 중...")
            text = self.ai.read_image(str(file_path))
            if text:
                raw_texts = [text]

        elif suffix == ".txt":
            emit({"type": "step", "step": 1, "total_steps": 4, "message": "텍스트 파일 읽기..."})
            print("  [1/4] 텍스트 파일 읽기...")
            raw_texts = [file_path.read_text(encoding="utf-8")]

        else:
            print(f"  [오류] 지원하지 않는 파일 형식: {suffix}")
            return {"total": 0, "saved": 0, "skipped": 0, "low_quality": 0, "words": []}

        # ── 2. 단어 파싱 ──────────────────────────────
        emit({"type": "step", "step": 2, "total_steps": 4, "message": "단어 파싱 중..."})
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

        # ── 3. 태깅 (레벨: 사용자 지정값 고정 / 품사: 규칙 → AI 폴백) ──
        total_words = len(unique_words)
        word_list = [w for w, _ in unique_words]

        # 레벨은 사용자가 업로드 시 직접 지정 → AI 호출 0번
        level_map = {w: level for w in word_list}

        # 품사: 텍스트에서 규칙 기반 추출 가능 → AI는 불필요 시 생략
        # 현재는 AI 없이 기본값(noun) 사용; 추후 PDF 내 v./n./adj. 파싱으로 교체 가능
        pos_map = {w: "noun" for w in word_list}

        ai_calls = 0
        if self.ai.available:
            # 품사만 AI에 위임 (레벨은 이미 확정)
            emit({"type": "step", "step": 3, "total_steps": 4,
                  "message": f"품사 분류 중... (AI {max(1,(total_words+49)//50)}번 호출)"})
            print(f"  [3/4] 품사 분류 중... (레벨 고정={level}, AI {max(1,(total_words+49)//50)}번)")
            pos_map  = self.ai.classify_pos_batch(word_list)
            ai_calls = max(1, (total_words + 49) // 50)
        else:
            emit({"type": "step", "step": 3, "total_steps": 4,
                  "message": f"태깅 완료 (레벨={level} 고정, AI 호출 0번)"})
            print(f"  [3/4] 태깅 완료 — 레벨={level} 고정, AI 호출 0번")

        # 품질 점수: 규칙 기반 (AI 불필요)
        def _rule_score(meaning: str) -> int:
            if not meaning or not meaning.strip():
                return 5
            if len(meaning.strip()) < 2:
                return 6
            return 8

        ensure_db(self.db_path)
        conn = sqlite3.connect(self.db_path)

        stats = {"total": 0, "saved": 0, "skipped": 0, "low_quality": 0,
                 "ai_calls": ai_calls, "words": []}

        for idx, (word, meaning_ko) in enumerate(unique_words, 1):
            stats["total"] += 1
            pct = int(idx / total_words * 100) if total_words else 100
            print(f"\r        [{idx}/{total_words}] {pct:3d}%  {word:<20}", end="", flush=True)
            emit({"type": "progress", "current": idx, "total": total_words,
                  "word": word, "pct": pct})

            final_level = level_map.get(word, level)
            final_grade = LEVEL_TO_GRADE.get(final_level, grade_num)
            pos   = pos_map.get(word, "noun")
            score = _rule_score(meaning_ko)
            needs_review = score < QUALITY_THRESHOLD

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
                "verified":    0,
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
        print()  # \r 이후 줄바꿈
        emit({"type": "step", "step": 4, "total_steps": 4, "message": "완료"})
        print("  [4/4] 완료\n")
        self._print_report(stats, book_title)
        emit({"type": "done", "stats": {
            "total": stats["total"], "saved": stats["saved"],
            "skipped": stats["skipped"], "low_quality": stats["low_quality"],
        }})
        return stats

    # ── 문제 추출 모드 ────────────────────────────────
    def extract_questions(
        self,
        file_path: str | Path,
        level: str,
        book_title: str,
        progress_callback=None,
    ) -> dict:
        """
        PDF/이미지/텍스트 파일에서 문법 문제를 추출.
        DB 저장 없음 — 원본 추출 + AI 분석만 수행.

        반환:
        {
          "questions": [
            {
              "raw_stem":     원본 문장 (빈칸=_____),
              "choices":      보기 리스트,
              "has_blank":    빈칸 여부,
              "grammar_point": AI 분류 (없으면 None),
              "answer":       AI 정답 제안 (없으면 None),
              "answer_idx":   정답 인덱스 (0-based),
              "level":        사용자 지정 레벨,
              "source_book":  교재명,
            }, ...
          ],
          "total": int,
          "pages": int,
          "ai_used": bool,
        }
        """
        def emit(e: dict):
            if progress_callback:
                progress_callback(e)

        file_path = Path(file_path)
        print(f"\n[DOC-IN Q모드] {file_path.name} / {level}")

        # ── 1. 텍스트 추출 ────────────────────────────
        emit({"type": "step", "step": 1, "total_steps": 3,
              "message": "파일에서 텍스트 추출 중..."})
        raw_texts: list[str] = []
        suffix = file_path.suffix.lower()

        if suffix == ".pdf":
            pages = extract_text_from_pdf(file_path)
            if pages:
                raw_texts = pages
                print(f"  텍스트 PDF {len(pages)}페이지 추출")
            else:
                print("  스캔 PDF → Vision 처리")
                tmp_dir = ROOT / "data" / "tmp_images"
                for img in extract_images_from_pdf(file_path, tmp_dir):
                    text = self.ai.read_image(str(img))
                    if text:
                        raw_texts.append(text)
        elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            text = self.ai.read_image(str(file_path))
            if text:
                raw_texts = [text]
        elif suffix == ".txt":
            raw_texts = [file_path.read_text(encoding="utf-8")]

        if not raw_texts:
            emit({"type": "done", "total": 0, "pages": 0})
            return {"questions": [], "total": 0, "pages": 0, "ai_used": False}

        # ── 2. 문제 블록 감지 ─────────────────────────
        emit({"type": "step", "step": 2, "total_steps": 3,
              "message": "문제 패턴 감지 중..."})
        raw_qs: list[dict] = []
        for page_text in raw_texts:
            raw_qs.extend(parse_questions_from_text(page_text))

        print(f"  {len(raw_qs)}개 문제 블록 감지")
        emit({"type": "progress", "detected": len(raw_qs)})

        if not raw_qs:
            emit({"type": "done", "total": 0, "pages": len(raw_texts)})
            return {"questions": [], "total": 0, "pages": len(raw_texts), "ai_used": False}

        # ── 3. AI 문법 포인트 + 정답 분류 ────────────
        emit({"type": "step", "step": 3, "total_steps": 3,
              "message": f"AI 분석 중... ({len(raw_qs)}문제)"})

        from backend.core.ontology import VALID_GRAMMAR_POINTS
        analyzed: list[dict] = [{"grammar_point": None, "answer": None, "answer_idx": 0}
                                 for _ in raw_qs]
        ai_used = False

        if self.ai.available:
            ai_input = [{"stem": q["raw_stem"], "choices": q["choices"]}
                        for q in raw_qs]
            analyzed = self.ai.analyze_questions_batch(
                ai_input, list(VALID_GRAMMAR_POINTS)
            )
            ai_used = True
            print("  AI 분석 완료")

        # ── 결합 ──────────────────────────────────────
        result: list[dict] = []
        for raw_q, ana in zip(raw_qs, analyzed):
            result.append({
                "raw_stem":      raw_q["raw_stem"],
                "choices":       raw_q["choices"],
                "has_blank":     raw_q["has_blank"],
                "grammar_point": ana.get("grammar_point"),
                "answer":        ana.get("answer"),
                "answer_idx":    int(ana.get("answer_idx", 0)),
                "level":         level,
                "source_book":   book_title,
            })

        emit({"type": "done", "total": len(result), "pages": len(raw_texts)})
        print(f"  추출 완료: {len(result)}개")
        return {
            "questions": result,
            "total":     len(result),
            "pages":     len(raw_texts),
            "ai_used":   ai_used,
        }

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
