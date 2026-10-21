"""可重現的字元錯誤率；只忽略空白與標點，不刪除重複或語氣詞。"""
import unicodedata


def normalize_text(text):
    return ''.join(c.lower() for c in unicodedata.normalize('NFC', text)
                   if not c.isspace() and not unicodedata.category(c).startswith('P'))


def cer(reference, hypothesis):
    ref, hyp = normalize_text(reference), normalize_text(hypothesis)
    if not ref:
        raise ValueError('CER 參考文字不得為空')
    previous = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        current = [i]
        for j, h in enumerate(hyp, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1,
                               previous[j - 1] + (r != h)))
        previous = current
    errors = previous[-1]
    return {'reference_chars': len(ref), 'hypothesis_chars': len(hyp),
            'errors': errors, 'cer': errors / len(ref)}


def compare_runs(reference, baseline, candidate, minimum_relative_reduction=0.0):
    old, new = cer(reference, baseline), cer(reference, candidate)
    reduction = (old['cer'] - new['cer']) / old['cer'] if old['cer'] else None
    return {'baseline': old, 'candidate': new, 'relative_reduction': reduction,
            'minimum_relative_reduction': minimum_relative_reduction,
            'target_met': reduction is not None and reduction > 0 and reduction >= minimum_relative_reduction}


def assess_final_stability(evidence):
    """三段以上固定未見音訊、三輪配對終稿均改善；不是統計顯著性宣告。"""
    reasons = []
    if evidence.get('stage') != 'FINAL_VERBATIM':
        reasons.append('需比較 ASR 加校對後的最終逐字稿')
    for key in ['reference_audio_verified', 'unseen_evaluation_set', 'fidelity_checked']:
        if evidence.get(key) is not True:
            reasons.append(key + ' 尚未通過')
    runs = evidence.get('runs', [])
    pairs, signatures, repeats = set(), {}, {}
    invalid = False
    for row in runs:
        if not isinstance(row, dict):
            invalid = True
            continue
        clip, repeat = row.get('clip'), row.get('repeat')
        counts = [row.get(k) for k in ['reference_chars', 'baseline_errors', 'candidate_errors']]
        hashes = [row.get(k) for k in ['audio_sha256', 'reference_sha256']]
        if (not isinstance(clip, str) or not clip or type(repeat) is not int
                or any(type(n) is not int or n < 0 for n in counts)
                or counts[0] == 0 or any(not isinstance(h, str) or len(h) != 64
                                        or any(c not in '0123456789abcdef' for c in h) for h in hashes)):
            invalid = True
            continue
        key = (repeat, clip)
        if key in pairs:
            invalid = True
            continue
        pairs.add(key)
        signature = (*hashes, counts[0])
        if clip in signatures and signatures[clip] != signature:
            invalid = True
        signatures[clip] = signature
        repeats.setdefault(repeat, {})[clip] = counts
        if row.get('quality_passed') is not True:
            reasons.append('終稿品質檢查尚未通過')
    if invalid:
        reasons.append('配對資料無效、重複或雜湊不一致')
    if len(repeats) < 3 or len(signatures) < 3:
        reasons.append('至少需要三段固定音訊及三輪配對結果')
    totals = []
    for rows in repeats.values():
        if set(rows) != set(signatures):
            reasons.append('各輪必須使用相同完整切片集合')
        counts = list(rows.values())
        total = [sum(row[i] for row in counts) for i in range(3)]
        totals.append(total)
        if total[2] >= total[1]:
            reasons.append('至少一輪最終 CER 未改善')
    chars, baseline, candidate = [sum(row[i] for row in totals) for i in range(3)]
    return {'policy': 'FINAL_STABLE_IMPROVEMENT_V1', 'accepted': not reasons,
            'reasons': sorted(set(reasons)), 'repeat_count': len(repeats), 'clip_count': len(signatures),
            'baseline_cer': baseline / chars if chars else None,
            'candidate_cer': candidate / chars if chars else None,
            'relative_reduction': (baseline - candidate) / baseline if baseline else None,
            'statistical_significance_claimed': False}
