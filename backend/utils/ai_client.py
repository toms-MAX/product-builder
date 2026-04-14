"""
ai_client.py — Gemini API 추상화 레이어
=======================================
AI는 분류·선택·점수만 담당. 문장 생성 절대 없음.
환경변수 GEMINI_API_KEY 미설정 시 폴백으로 자동 동작.
"""

import os
import json
import base64
import re
from pathlib import Path

# google-generativeai 없어도 동작
try:
    import google.generativeai as genai
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False


# ── 레벨 매핑 ─────────────────────────────────────────
LEVEL_TO_GRADE = {
    "중1": 1, "중2": 2, "중3": 3,
    "고1": 4, "고2": 5, "고3": 6,
    "수능": 7, "수능고급": 8,
}
GRADE_TO_LEVEL = {v: k for k, v in LEVEL_TO_GRADE.items()}

VALID_POS = {"noun", "verb", "adjective", "adverb"}
VALID_LEVELS = set(LEVEL_TO_GRADE.keys())


class AIClient:
    """
    Gemini 무료 API 래퍼.
    API 키 없음 / 호출 실패 시 모든 메서드가 기본값을 반환함.
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self._model = None

        if self.api_key and _GENAI_AVAILABLE:
            try:
                genai.configure(api_key=self.api_key)
                self._model = genai.GenerativeModel("gemini-1.5-flash")
            except Exception:
                self._model = None

    @property
    def available(self) -> bool:
        return self._model is not None

    def _call(self, prompt: str) -> str | None:
        """Gemini 텍스트 호출. 실패 시 None 반환."""
        if not self.available:
            return None
        try:
            response = self._model.generate_content(prompt)
            return response.text.strip()
        except Exception:
            return None

    # ── 1. 이미지에서 텍스트 읽기 ──────────────────────
    def read_image(self, image_path: str) -> str:
        """
        이미지/스캔 PDF 페이지에서 텍스트 추출 (Vision).
        폴백: 빈 문자열 반환.
        """
        if not self.available:
            return ""

        path = Path(image_path)
        if not path.exists():
            return ""

        try:
            with open(path, "rb") as f:
                img_bytes = f.read()

            ext = path.suffix.lower().lstrip(".")
            mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                    "png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")

            img_part = {
                "inline_data": {
                    "mime_type": mime,
                    "data": base64.b64encode(img_bytes).decode(),
                }
            }
            prompt = "이 이미지에서 모든 텍스트를 그대로 추출하세요. 형식 없이 텍스트만 출력하세요."
            response = self._model.generate_content([prompt, img_part])
            return response.text.strip()
        except Exception:
            return ""

    # ── 2. 레벨 분류 ───────────────────────────────────
    def classify_level(self, text: str) -> str:
        """
        단어/문장의 영어 난이도 레벨 분류.
        반환값: 중1/중2/중3/고1/고2/고3/수능/수능고급
        폴백: "중2"
        """
        DEFAULT = "중2"
        if not text or not text.strip():
            return DEFAULT

        prompt = (
            "다음 영어 단어 또는 문장의 난이도를 한국 교육과정 기준으로 분류하세요.\n"
            "반드시 다음 중 하나만 반환하세요: 중1, 중2, 중3, 고1, 고2, 고3, 수능, 수능고급\n"
            f"입력: {text}\n"
            "답(한 단어만):"
        )
        result = self._call(prompt)
        if result and result.strip() in VALID_LEVELS:
            return result.strip()
        return DEFAULT

    # ── 3. 품사 분류 ───────────────────────────────────
    def classify_pos(self, word: str) -> str:
        """
        영어 단어의 품사 분류.
        반환값: noun / verb / adjective / adverb
        폴백: "noun"
        """
        DEFAULT = "noun"
        if not word or not word.strip():
            return DEFAULT

        prompt = (
            "다음 영어 단어의 품사를 분류하세요.\n"
            "반드시 다음 중 하나만 반환하세요: noun, verb, adjective, adverb\n"
            f"단어: {word}\n"
            "답(한 단어만):"
        )
        result = self._call(prompt)
        if result and result.strip().lower() in VALID_POS:
            return result.strip().lower()
        return DEFAULT

    # ── 4. 문제 품질 점수 ──────────────────────────────
    def score_quality(self, stem: str, choices: list[str] | None = None,
                      answer: str | None = None) -> int:
        """
        영어 문법 문제 품질을 1~10으로 평가.
        폴백: 8
        """
        DEFAULT = 8
        if not stem or not stem.strip():
            return DEFAULT

        choices_str = ", ".join(choices) if choices else "없음"
        prompt = (
            "영어 문법 문제 품질을 1-10으로만 평가하세요.\n"
            f"문제: {stem}\n"
            f"선택지: {choices_str}\n"
            f"정답: {answer or '없음'}\n"
            "숫자 하나만 반환 (예: 8):"
        )
        result = self._call(prompt)
        if result:
            match = re.search(r"\b([1-9]|10)\b", result)
            if match:
                return int(match.group(1))
        return DEFAULT

    # ── 5. 레벨 배치 분류 (50개씩 묶어서 1번 호출) ────
    def classify_level_batch(self, words: list[str],
                              chunk_size: int = 50) -> dict[str, str]:
        """
        여러 단어의 레벨을 한 번에 분류.
        반환: {"word": "레벨", ...}
        폴백: 모두 "중2"
        """
        DEFAULT = "중2"
        if not words:
            return {}
        if not self.available:
            return {w: DEFAULT for w in words}

        result: dict[str, str] = {}
        for i in range(0, len(words), chunk_size):
            chunk = words[i : i + chunk_size]
            words_str = "\n".join(f"- {w}" for w in chunk)
            prompt = (
                "다음 영어 단어들의 난이도를 한국 교육과정 기준으로 분류하세요.\n"
                "레벨은 반드시 다음 중 하나: 중1, 중2, 중3, 고1, 고2, 고3, 수능, 수능고급\n\n"
                f"단어 목록:\n{words_str}\n\n"
                "JSON 형식으로만 반환. 예시: {\"accomplish\": \"고1\", \"diligent\": \"고2\"}\n"
                "JSON만:"
            )
            raw = self._call(prompt)
            if raw:
                try:
                    m = re.search(r"\{.*\}", raw, re.DOTALL)
                    if m:
                        parsed = json.loads(m.group())
                        for w in chunk:
                            lv = parsed.get(w, DEFAULT)
                            result[w] = lv if lv in VALID_LEVELS else DEFAULT
                        continue
                except (json.JSONDecodeError, KeyError):
                    pass
            # 호출 실패 시 청크 전체 기본값
            for w in chunk:
                result[w] = DEFAULT

        return result

    # ── 6. 품사 배치 분류 (50개씩 묶어서 1번 호출) ────
    def classify_pos_batch(self, words: list[str],
                            chunk_size: int = 50) -> dict[str, str]:
        """
        여러 단어의 품사를 한 번에 분류.
        반환: {"word": "pos", ...}
        폴백: 모두 "noun"
        """
        DEFAULT = "noun"
        if not words:
            return {}
        if not self.available:
            return {w: DEFAULT for w in words}

        result: dict[str, str] = {}
        for i in range(0, len(words), chunk_size):
            chunk = words[i : i + chunk_size]
            words_str = "\n".join(f"- {w}" for w in chunk)
            prompt = (
                "다음 영어 단어들의 품사를 분류하세요.\n"
                "품사는 반드시 다음 중 하나: noun, verb, adjective, adverb\n\n"
                f"단어 목록:\n{words_str}\n\n"
                "JSON 형식으로만 반환. 예시: {\"accomplish\": \"verb\", \"diligent\": \"adjective\"}\n"
                "JSON만:"
            )
            raw = self._call(prompt)
            if raw:
                try:
                    m = re.search(r"\{.*\}", raw, re.DOTALL)
                    if m:
                        parsed = json.loads(m.group())
                        for w in chunk:
                            pos = parsed.get(w, DEFAULT)
                            pos = pos.lower() if isinstance(pos, str) else DEFAULT
                            result[w] = pos if pos in VALID_POS else DEFAULT
                        continue
                except (json.JSONDecodeError, KeyError):
                    pass
            for w in chunk:
                result[w] = DEFAULT

        return result

    # ── 7. 자연스러운 단어 조합 선택 ──────────────────
    def select_combo(self, template: str, candidates: dict[str, list[str]]) -> dict[str, str]:
        """
        템플릿 슬롯에 들어갈 가장 자연스러운 단어 조합 선택.
        candidates: {"SLOT_NAME": ["word1", "word2", ...], ...}
        반환값: {"SLOT_NAME": "선택된 단어", ...}
        폴백: 각 슬롯에서 첫 번째 단어 선택
        """
        # 폴백: 각 슬롯의 첫 번째 단어
        fallback = {slot: words[0] for slot, words in candidates.items() if words}

        if not self.available or not candidates:
            return fallback

        candidates_str = json.dumps(candidates, ensure_ascii=False, indent=2)
        prompt = (
            "다음 영어 문장 템플릿의 빈칸에 가장 자연스러운 단어 조합을 선택하세요.\n"
            f"템플릿: {template}\n"
            f"후보 단어:\n{candidates_str}\n\n"
            "각 슬롯에서 단어 하나를 골라 JSON으로 반환하세요.\n"
            "예시: {{\"SUBJECT_PERSON\": \"teacher\", \"VERB_PP\": \"completed\"}}\n"
            "JSON만 반환:"
        )
        result = self._call(prompt)
        if result:
            try:
                # JSON 블록 추출
                match = re.search(r"\{.*\}", result, re.DOTALL)
                if match:
                    parsed = json.loads(match.group())
                    # 후보에 없는 단어가 선택됐을 경우 폴백
                    validated = {}
                    for slot, word in parsed.items():
                        if slot in candidates and word in candidates[slot]:
                            validated[slot] = word
                        elif slot in fallback:
                            validated[slot] = fallback[slot]
                    return validated if validated else fallback
            except (json.JSONDecodeError, KeyError):
                pass
        return fallback
