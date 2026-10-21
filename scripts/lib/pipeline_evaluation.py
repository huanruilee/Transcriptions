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


def compare_runs(reference, baseline, candidate):
    old, new = cer(reference, baseline), cer(reference, candidate)
    reduction = (old['cer'] - new['cer']) / old['cer'] if old['cer'] else None
    return {'baseline': old, 'candidate': new, 'relative_reduction': reduction,
            'target_met': reduction is not None and reduction >= .4}
