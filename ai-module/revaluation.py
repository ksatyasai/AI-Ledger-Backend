import sys
import json
import re
import os

# ---------- LOAD RUBRIC (FALLBACK TO STATIC) ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUBRIC_PATH = os.path.join(BASE_DIR, "rubric.json")

# Will attempt to fetch rubric from backend API when subject code is provided.
def load_rubric_from_api(subject_code):
    try:
        import requests
        API_BASE = os.environ.get('API_BASE_URL')
        if not API_BASE: raise Exception("API_BASE_URL environment variable is missing")
        url = f"{API_BASE}/admin/question-paper/{subject_code}"
        resp = requests.get(url, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('success') and data.get('data'):
                paper = data['data']
                # Convert to expected rubric dict: { 'Q1': {max_marks, keywords, definition_marks, keyword_marks, explanation_marks}, ... }
                out = {}
                for q in paper.get('questions', []):
                    out[q['questionId']] = {
                        'max_marks': q.get('maxMarks', 10),
                        'keywords': q.get('keywords', []),
                        'definition_marks': q.get('definitionMarks', 0),
                        'keyword_marks': q.get('keywordMarks', 0),
                        'explanation_marks': q.get('explanationMarks', 0)
                    }
                return out
    except Exception as e:
        # network error or parsing error - write warning to stderr so stdout remains for final JSON array
        import sys as _sys
        _sys.stderr.write(json.dumps({'warning': 'Failed to fetch rubric from API', 'reason': str(e)}) + "\n")
    return None

# Load static fallback now; dynamic load occurs later when subject code provided
static_rubric = {}
if os.path.exists(RUBRIC_PATH):
    try:
        with open(RUBRIC_PATH, 'r') as f:
            static_rubric = json.load(f)
    except Exception:
        static_rubric = {}

# 'rubric' variable will be populated after we know subject code
rubric = static_rubric.copy()

# ---------- OCR IMPORTS ----------
from pdf2image import convert_from_path
import pytesseract

# ---------- WINDOWS PATHS ----------
POPPLER_PATH = r"C:\poppler-25.12.0\Library\bin"
TESSERACT_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


# ---------- OCR FUNCTION ----------
def extract_text_with_ocr(pdf_path):
    text = ""
    images = convert_from_path(
        pdf_path,
        dpi=300,
        poppler_path=POPPLER_PATH
    )
    for img in images:
        text += pytesseract.image_to_string(img)
    return text


# ---------- INPUT FROM NODE ----------
# argv[1] -> extracted text (pdf-parse)
# argv[2] -> absolute pdf path (for OCR)
# argv[3] -> subjectCode (optional) to fetch rubric dynamically

full_text = sys.argv[1].strip().lower()
pdf_path = sys.argv[2] if len(sys.argv) > 2 else None
subject_code = None
if len(sys.argv) > 3:
    subject_code = sys.argv[3].strip().upper()

# Read rubric JSON from stdin if provided (Node will send the rubric via stdin)
try:
    stdin_data = sys.stdin.read()
    if stdin_data and stdin_data.strip():
        try:
            parsed = json.loads(stdin_data)
            if isinstance(parsed, dict):
                # Accept empty dict too (Node may send {} when no rubric found)
                rubric = parsed
        except Exception as e:
            # If parsing fails, write warning to stderr and continue (will fallback to subject_code or static)
            sys.stderr.write(json.dumps({'warning': 'Invalid rubric JSON on stdin', 'reason': str(e)}) + "\n")
    else:
        # If no stdin rubric, and subject_code provided, try API
        if subject_code:
            api_rubric = load_rubric_from_api(subject_code)
            if api_rubric:
                rubric = api_rubric
except Exception as e:
    sys.stderr.write(json.dumps({'warning': 'Failed reading stdin for rubric', 'reason': str(e)}) + "\n")

# ---------- OCR FALLBACK ----------
try:
    if (not full_text or full_text == "") and pdf_path:
        full_text = extract_text_with_ocr(pdf_path).lower()
except Exception as e:
    print(json.dumps({
        "error": "OCR failed",
        "reason": str(e)
    }))
    sys.exit(0)

# ---------- QUESTION EXTRACTION STRATEGY ----------
# If we have a rubric (keys like Q1, Q2...), try to extract answers for each rubric question explicitly.
# This avoids missing questions when OCR formatting is inconsistent.
def extract_by_rubric_keys(text, rubric_keys):
    answers = {}
    # Build patterns for question labels e.g., Q1, 1., 1), Q1:
    # We'll search for the first occurrence of each label and capture text until next label.
    # Normalize search to lower-case for robust matching.
    low_text = text.lower()
    positions = []
    for key in rubric_keys:
        # Try many label variants
        k = key.lower()
        candidates = [f"{k}", f"{k}:", f"{k}.", f"{k})", f"{k}-", k.replace('q', '') + '.', k.replace('q', '') + ')', k.replace('q', '') + ':']
        found = None
        for cand in candidates:
            idx = low_text.find(cand)
            if idx != -1:
                found = (idx, cand, key)
                break
        if found:
            positions.append(found)

    # Sort by position and slice
    positions.sort(key=lambda x: x[0])
    for i, (pos, label, key) in enumerate(positions):
        start = pos + len(label)
        end = positions[i+1][0] if i+1 < len(positions) else len(low_text)
        snippet = text[start:end].strip()
        answers[key] = snippet

    return answers

# ---------- AGGREGATE ANSWERS PER QUESTION ----------
question_answers = {}

rubric_keys = [k for k in rubric.keys()] if isinstance(rubric, dict) else []
if rubric_keys:
    # prefer extracting by rubric keys
    extracted = extract_by_rubric_keys(full_text, rubric_keys)
    # fill question_answers for keys present in rubric
    for k in rubric_keys:
        if k in extracted and extracted[k].strip():
            question_answers[k] = extracted[k]
        else:
            # initially empty; we'll attempt segmentation fallback below
            question_answers[k] = ""

    # If many questions are empty (OCR didn't include explicit labels),
    # fallback by splitting the full_text into N sequential chunks and assigning them in order.
    empty_keys = [k for k, v in question_answers.items() if not v.strip()]
    if len(empty_keys) > 0 and full_text.strip():
        try:
            n = len(rubric_keys)
            text_len = len(full_text)
            # compute chunk size
            chunk_size = max(1, text_len // n)
            for idx, k in enumerate(rubric_keys):
                if not question_answers[k].strip():
                    start = idx * chunk_size
                    end = (idx + 1) * chunk_size if idx < n - 1 else text_len
                    question_answers[k] = full_text[start:end].strip()
        except Exception as e:
            sys.stderr.write(json.dumps({'warning': 'Failed to segment full_text for missing questions', 'reason': str(e)}) + "\n")
else:
    # fallback to flexible pattern extraction when no rubric keys
    pattern = r"(?:q)?(\d+)[\.\):\-]?\s*(.*?)(?=(?:q?\d+[\.\):\-]?\s)|$)"
    matches = re.findall(pattern, full_text, re.DOTALL)
    for q_number, answer_text in matches:
        qid = f"Q{q_number}"
        # attempt to map to rubric key (case-insensitive)
        if qid in rubric:
            key = qid
        elif qid.lower() in rubric:
            key = qid.lower()
        else:
            # still record under qid so we can evaluate if static rubric had it
            key = qid
        question_answers[key] = question_answers.get(key, "") + " " + answer_text


# ---------- AI EVALUATION (ONE ROW PER QUESTION) ----------
results = []

# Default rubric template for questions not in rubric
default_rule = {
    'max_marks': 10,
    'definition_marks': 3,
    'keyword_marks': 4,
    'explanation_marks': 3,
    'keywords': []
}

for qid, answer_text in question_answers.items():
    # Get rule from rubric or use default if not found
    rule = rubric.get(qid, default_rule)
    
    score = 0
    breakdown = {}

    # Definition marks
    if len(answer_text.strip()) > 10:
        score += rule.get("definition_marks", 0)
        breakdown["definition"] = rule.get("definition_marks", 0)
    else:
        breakdown["definition"] = 0

    # Keyword marks
    keyword_count = 0
    for kw in rule.get("keywords", []):
        if kw.lower() in answer_text.lower():
            keyword_count += 1

    keyword_score = min(keyword_count * 2, rule.get("keyword_marks", 0))
    score += keyword_score
    breakdown["keywords"] = keyword_score

    # Explanation marks
    if len(answer_text.split()) > 15:
        score += rule.get("explanation_marks", 0)
        breakdown["explanation"] = rule.get("explanation_marks", 0)
    else:
        breakdown["explanation"] = 0

    results.append({
        "question": qid,
        "suggested_marks": score,
        "max_marks": rule.get("max_marks", 10),
        "breakdown": breakdown
    })


# ---------- OUTPUT TO NODE ----------
print(json.dumps(results))
