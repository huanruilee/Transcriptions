#!/usr/bin/env python3
"""
extract_treatise_text.py - 100% Local Treatise Text Extraction Tool
Extracts all 285 pages from 《入中論善顯密意疏 2016.pdf》 into structured text files
and builds an indexed root verses dataset for exact/fuzzy grounding.
"""
import os
import sys
import json
import re
from pathlib import Path

# Paths
PDF_CANDIDATES = [
    Path("/Users/henry/Documents/電子書/入中論善顯密意疏 2016.pdf"),
    Path("/home/henry/gdrive/KnowledgeSources/經論/入中論善顯密意疏 2016.pdf"),
    Path("/home/henry/gdrive/KnowledgeSources/入中論善顯密意疏 2016.pdf"),
]

OUTPUT_DIR = Path("courses/入中論善顯密意疏/source_text")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def find_pdf():
    for p in PDF_CANDIDATES:
        if p.exists() and p.stat().st_size > 100000:
            return p
    return None

def extract_all():
    pdf_path = find_pdf()
    if not pdf_path:
        print("❌ Error: Could not locate '入中論善顯密意疏 2016.pdf'")
        sys.exit(1)

    print(f"📖 Loading PDF from {pdf_path} ({pdf_path.stat().st_size / 1024 / 1024:.2f} MB)...")
    
    try:
        import pymupdf
        doc = pymupdf.open(str(pdf_path))
        pages_count = len(doc)
        get_page_text = lambda i: doc[i].get_text()
    except ImportError:
        try:
            import fitz
            doc = fitz.open(str(pdf_path))
            pages_count = len(doc)
            get_page_text = lambda i: doc[i].get_text()
        except ImportError:
            import pypdf
            reader = pypdf.PdfReader(str(pdf_path))
            pages_count = len(reader.pages)
            get_page_text = lambda i: reader.pages[i].extract_text()

    print(f"📄 Found {pages_count} pages. Extracting to {OUTPUT_DIR}...")

    all_verses = []
    page_catalog = {}

    for page_idx in range(pages_count):
        page_num = page_idx + 1
        raw_text = get_page_text(page_idx)
        
        # Clean header/footer artifacts
        lines = [line.rstrip() for line in raw_text.splitlines()]
        clean_text = "\n".join(lines).strip()

        # Save individual page
        page_filename = f"page_{page_num:03d}.txt"
        page_file_path = OUTPUT_DIR / page_filename
        with open(page_file_path, "w", encoding="utf-8") as f:
            f.write(clean_text)

        # Detect and collect verses
        verse_matches = re.findall(r'[「『]([^」』\n]{10,200})[」』]', clean_text)
        for v in verse_matches:
            v_clean = v.strip()
            if any(term in clean_text for term in ["頌曰", "頌云", "云：", "如云"]):
                all_verses.append({
                    "page": page_num,
                    "text": v_clean
                })

        page_catalog[page_num] = {
            "file": page_filename,
            "char_count": len(clean_text),
            "preview": clean_text[:60].replace("\n", " ")
        }

    # Save Catalog and Verses index
    catalog_path = OUTPUT_DIR / "catalog.json"
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump({"total_pages": pages_count, "pages": page_catalog}, f, ensure_ascii=False, indent=2)

    verses_path = OUTPUT_DIR / "all_verses.json"
    with open(verses_path, "w", encoding="utf-8") as f:
        json.dump(all_verses, f, ensure_ascii=False, indent=2)

    print(f"✅ Successfully extracted {pages_count} pages and indexed {len(all_verses)} verse citations.")

if __name__ == "__main__":
    extract_all()
