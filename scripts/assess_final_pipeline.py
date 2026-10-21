#!/usr/bin/env python3
"""評估 ASR 加 LLM 終稿的配對穩定改善證據；不執行辨識或修改逐字稿。"""
import argparse
import json
from pathlib import Path

from lib.pipeline_evaluation import assess_final_stability


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', required=True, type=Path)
    args = parser.parse_args()
    evidence = json.loads(args.evidence.read_text(encoding='utf-8'))
    if not isinstance(evidence, dict) or not isinstance(evidence.get('runs', []), list):
        parser.error('證據必須是物件且 runs 必須是陣列')
    print(json.dumps(assess_final_stability(evidence), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
