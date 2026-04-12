"""
detector.py — 시험지 이미지에서 문제 영역을 감지하고 낱개로 분리
전략 1 (우선): 문제 번호 OCR 감지 (1. 2. (1) [1] 형식)
전략 2 (폴백): 수평 공백 분석으로 경계 추정
"""

import cv2
import numpy as np
import pytesseract
import re
import os


# ──────────────────────────────────────────
# 이미지 전처리
# ──────────────────────────────────────────

def preprocess(img):
    """그레이스케일 변환 + 대비 강화 + 노이즈 제거."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(denoised)


# ──────────────────────────────────────────
# 전략 1: 문제 번호 위치로 경계 감지
# ──────────────────────────────────────────

_Q_PATTERNS = [
    r'^\d{1,2}\.$',       # 1.  2.  10.
    r'^\(\d{1,2}\)$',     # (1) (2)
    r'^\[\d{1,2}\]$',     # [1] [2]
    r'^\d{1,2}\)$',       # 1)  2)
    r'^Q\d{1,2}\.?$',     # Q1  Q2.
]


def _boundaries_by_number(gray):
    """OCR로 문제 번호를 찾아 (문제번호, y좌표) 리스트 반환."""
    data = pytesseract.image_to_data(
        gray,
        lang='eng',
        config='--psm 6 --oem 3',
        output_type=pytesseract.Output.DICT,
    )

    hits = {}  # q_num → y (첫 등장만 유지)
    for i, text in enumerate(data['text']):
        t = text.strip()
        if not t or int(data['conf'][i]) < 30:
            continue
        for pat in _Q_PATTERNS:
            if re.match(pat, t, re.IGNORECASE):
                q_num = int(re.search(r'\d+', t).group())
                if q_num not in hits:
                    hits[q_num] = data['top'][i]
                break

    # (y좌표, 문제번호) 정렬
    return sorted((y, n) for n, y in hits.items())


# ──────────────────────────────────────────
# 전략 2: 수평 공백 분석 폴백
# ──────────────────────────────────────────

def _boundaries_by_whitespace(gray, min_gap_px=18, min_q_height=60):
    """텍스트 밀도가 낮은 행을 공백으로 보고 경계를 찾는다."""
    _, binary = cv2.threshold(gray, 0, 255,
                              cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    proj = np.sum(binary, axis=1).astype(float)
    threshold = proj.max() * 0.015  # 전체 최대 밀도의 1.5% 미만 = 공백

    boundaries = []
    in_gap = False
    gap_start = 0
    last_b = 0

    for y, val in enumerate(proj):
        if val < threshold and not in_gap:
            in_gap = True
            gap_start = y
        elif val >= threshold and in_gap:
            in_gap = False
            gap_size = y - gap_start
            if gap_size >= min_gap_px and (y - last_b) >= min_q_height:
                boundaries.append((y, len(boundaries) + 1))
                last_b = y

    return boundaries


# ──────────────────────────────────────────
# 공개 API
# ──────────────────────────────────────────

def detect_questions(image_path: str, output_dir: str) -> list[dict]:
    """
    시험지 이미지에서 문제를 감지해 낱개 PNG로 저장하고,
    각 문제의 메타 정보 리스트를 반환한다.

    반환 형식:
        [
          {
            "id": 1,
            "image_file": "q_01.png",
            "text": "...",
            "difficulty": null,
            "topic": "",
            "bbox": {"y_start": 0, "y_end": 200}
          }, ...
        ]
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"이미지를 열 수 없습니다: {image_path}")

    h, w = img.shape[:2]
    gray = preprocess(img)

    # 전략 1 시도
    boundaries = _boundaries_by_number(gray)

    # 감지된 문제가 2개 미만이면 전략 2로 폴백
    if len(boundaries) < 2:
        boundaries = _boundaries_by_whitespace(gray)

    # 그래도 없으면 이미지 전체를 1문제로 처리
    if not boundaries:
        boundaries = [(0, 1)]

    os.makedirs(output_dir, exist_ok=True)
    questions = []

    for idx, (start_y, q_num) in enumerate(boundaries):
        end_y = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else h

        # 여백 5px 추가
        y0 = max(0, start_y - 5)
        y1 = min(h, end_y + 5)

        if y1 - y0 < 25:   # 너무 작은 조각은 무시
            continue

        # 크롭 저장
        crop = img[y0:y1, 0:w]
        img_file = f"q_{q_num:02d}.png"
        cv2.imwrite(os.path.join(output_dir, img_file), crop)

        # 해당 영역 텍스트 추출
        text = pytesseract.image_to_string(
            gray[y0:y1, 0:w],
            lang='eng',
            config='--psm 6',
        ).strip()

        questions.append({
            "id": q_num,
            "image_file": img_file,
            "text": text,
            "difficulty": None,
            "topic": "",
            "bbox": {"y_start": int(y0), "y_end": int(y1)},
        })

    return questions
