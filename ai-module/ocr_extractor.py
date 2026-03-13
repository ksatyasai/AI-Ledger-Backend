from pdf2image import convert_from_path
import pytesseract
import re
import os
import sys

# ---------- CONFIGURABLE PATHS (use env variables if available) ----------
POPPLER_PATH = os.environ.get('POPPLER_PATH', r"C:\poppler-25.12.0\Library\bin")
TESSERACT_PATH = os.environ.get('TESSERACT_PATH', r"C:\Program Files\Tesseract-OCR\tesseract.exe")

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


# ---------- TEXT CLEANING FUNCTION ----------
def clean_ocr_text(text):
    """
    Cleans OCR noise and normalizes spacing.
    """
    text = text.lower()
    text = re.sub(r"\n+", "\n", text)          # remove extra newlines
    text = re.sub(r"[ ]{2,}", " ", text)       # remove extra spaces
    text = re.sub(r"[^\w\s\.\)\(:\-]", "", text)  # remove garbage symbols
    return text.strip()


# ---------- OCR EXTRACTION FUNCTION ----------
def extract_text_from_pdf(pdf_path):
    """
    Converts PDF pages to images and extracts text using OCR.
    """
    extracted_text = ""

    images = convert_from_path(
        pdf_path,
        dpi=300,
        poppler_path=POPPLER_PATH
    )

    for idx, img in enumerate(images):
        page_text = pytesseract.image_to_string(img)
        extracted_text += f"\n{page_text}"

    return clean_ocr_text(extracted_text)


# ---------- TESTING ----------
def main():
    # CLI usage: python ocr_extractor.py <pdf_path>
    if len(sys.argv) < 2:
        print("Usage: python ocr_extractor.py <pdf_path>", file=sys.stderr)
        sys.exit(2)

    pdf = sys.argv[1]
    try:
        text = extract_text_from_pdf(pdf)
        # Print only the cleaned text to stdout (no extra markers)
        print(text)
    except Exception as e:
        print(json.dumps({"error": "OCR failed", "reason": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
