"""聲學覆蓋疑點與逐字錯誤分解；不自動補字或核准發布。"""
import math
import re
from lib.pipeline_evaluation import normalize_text


def text_risk_flags(text, prompt):
    """只產生待聽核旗標，絕不根據文字重複刪字。"""
    flags = []
    if '\ufffd' in text:
        flags.append('REPLACEMENT_CHARACTER')
    if 'amara.org' in text.lower():
        flags.append('SUBTITLE_BOILERPLATE_REQUIRES_LISTENING')
    normalized = normalize_text(text)
    if prompt and '本講名相' in normalize_text(prompt) and '本講名相' in normalized:
        flags.append('PROMPT_MARKER_ECHO')
    if re.search(r'(.{4,30}?)\1{3,}', normalized):
        flags.append('REPEATED_PHRASE_REQUIRES_LISTENING')
    return flags


def experiment_options(name):
    options = dict(beam_size=5, patience=1.2, repetition_penalty=1.08,
                   condition_on_previous_text=False, temperature=0.0,
                   word_timestamps=True, vad_filter=True)
    variants = {'control': {}, 'repeat_1': {'repetition_penalty': 1.0},
                'no_vad': {'vad_filter': False}, 'no_words': {'word_timestamps': False},
                'fallback': {'temperature': [0.0, .2, .4, .6, .8, 1.0]}}
    if name not in variants:
        raise ValueError('未知對照組')
    return dict(options, **variants[name])


def _union(spans, duration):
    result = []
    checked = []
    for span in spans:
        start, end = float(span['start']), float(span['end'])
        if not all(math.isfinite(x) for x in (start, end)) or not 0 <= start <= end <= duration + 1e-3:
            raise ValueError('無效音訊時間範圍')
        if end > start:
            checked.append((start, min(end, duration)))
    for start, end in sorted(checked):
        if result and start <= result[-1][1]:
            result[-1][1] = max(end, result[-1][1])
        else:
            result.append([start, end])
    return result


def coverage_audit(speech, segments, duration):
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('無效音訊時長')
    voiced = _union(speech, duration)
    spans = []
    for segment in segments:
        _union([segment], duration)
        words = segment.get('words') or []
        if words:
            spans.extend(w for w in words if w.get('word', '').strip())
        elif segment.get('text', '').strip():
            spans.append(segment)
    covered = _union(spans, duration)
    gaps = []
    for start, end in voiced:
        cursor = start
        for left, right in covered:
            if right <= cursor:
                continue
            if left >= end:
                break
            if left > cursor:
                gaps.append({'start': cursor, 'end': min(left, end)})
            cursor = max(cursor, min(right, end))
        if cursor < end:
            gaps.append({'start': cursor, 'end': end})
    total = sum(b - a for a, b in voiced)
    missing = sum(g['end'] - g['start'] for g in gaps)
    return {'speech_seconds': total, 'uncovered_seconds': missing,
            'coverage_ratio': 1 - missing / total if total else None, 'gaps': gaps,
            'coverage_basis': 'word_intervals_when_available_else_segment_intervals',
            'status': 'SUSPECT_TIMING_GAPS_NOT_PROVEN_WORD_DELETIONS',
            'publication_accepted': False}


def plan_chunks(duration, speech):
    """完整分割原音：優先選 15–25 秒內靜音中點；不刪靜音、不字串去重。"""
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('無效音訊時長')
    voiced = _union(speech, duration)
    boundaries = [(a[1] + b[0]) / 2 for a, b in zip(voiced, voiced[1:]) if a[1] < b[0]]
    chunks, start = [], 0
    while duration - start > 25:
        nearby = [t for t in boundaries if start + 15 <= t <= start + 25]
        end = min(nearby, key=lambda t: abs(t - start - 20)) if nearby else start + 20
        chunks.append({'start': start, 'end': end})
        start = end
    chunks.append({'start': start, 'end': duration})
    return chunks


def error_breakdown(reference, hypothesis):
    ref, hyp = normalize_text(reference), normalize_text(hypothesis)
    if not ref:
        raise ValueError('CER 參考文字不得為空')
    # 固定同成本優先序：對角、刪除、插入；避免平台造成不同錯誤分解。
    previous = [(j, 0, 0, j) for j in range(len(hyp) + 1)]
    for i, char in enumerate(ref, 1):
        current = [(i, 0, i, 0)]
        for j, actual in enumerate(hyp, 1):
            cost, sub, delete, insert = previous[j - 1]
            diagonal = (cost + (char != actual), sub + (char != actual), delete, insert)
            cost, sub, delete, insert = previous[j]
            deletion = (cost + 1, sub, delete + 1, insert)
            cost, sub, delete, insert = current[j - 1]
            insertion = (cost + 1, sub, delete, insert + 1)
            current.append(min((diagonal, deletion, insertion), key=lambda x: x[0]))
        previous = current
    errors, sub, delete, insert = previous[-1]
    return {'reference_chars': len(ref), 'hypothesis_chars': len(hyp), 'errors': errors,
            'substitutions': sub, 'deletions': delete, 'insertions': insert,
            'cer': errors / len(ref)}
