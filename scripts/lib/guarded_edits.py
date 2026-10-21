"""以正體字座標審查局部校正；可接受的修改不受同句其他拒絕項牽連。"""
from difflib import SequenceMatcher
from functools import lru_cache
import re

from lib.pipeline_evaluation import normalize_text
from lib.source_alignment import phonetics, plain


@lru_cache(maxsize=1)
def converter():
    import opencc
    return opencc.OpenCC('s2twp')


def canonical_text(text):
    return converter().convert(text).replace('無明瞭', '無明了').replace('明瞭了', '明了了')


def propose_diff(original, proposed):
    original, proposed = canonical_text(original), canonical_text(proposed)
    return [{'start': a, 'end': b, 'before': original[a:b], 'after': proposed[c:d], 'evidence': ''}
            for op, a, b, c, d in SequenceMatcher(None, original, proposed, autojunk=False).get_opcodes()
            if op != 'equal']


def learned_evidence(text, start, end, replacement, learned):
    candidate = text[:start] + replacement + text[end:]
    for typo, info in learned.items():
        corrected = info.get('corrected')
        if not corrected:
            continue
        pattern = info.get('safe_regex', re.escape(typo))
        for match in re.finditer(pattern, text):
            if match.start() <= start and end <= match.end():
                expected = text[:match.start()] + match.expand(corrected) + text[match.end():]
                if candidate == expected:
                    return {'type': '已驗證詞庫', 'term': typo}
    return None


def source_evidence(text, start, end, replacement, evidence, hits):
    before = text[start:end]
    if not isinstance(evidence, str):
        return None
    if (not before or not replacement or len(before) != len(replacement)
            or not re.fullmatch(r'[\u3400-\u9fff]+', before + replacement)
            or phonetics(before) != phonetics(replacement)):
        return None
    revised = text[:start] + replacement + text[end:]
    # 至少五字的上下文須落在確實檢索到的原典句中，不能僅以孤立一字核准。
    for hit in hits:
        source = plain(canonical_text(hit['text']))
        if not evidence or plain(canonical_text(evidence)) not in source:
            continue
        for left in range(max(0, start - 8), start + 1):
            for right in range(start + len(replacement), min(len(revised), start + len(replacement) + 8) + 1):
                anchor = plain(revised[left:right])
                if len(anchor) >= 5 and anchor in source:
                    return {'type': '底本同音對齊', 'page': hit['page'], 'line': hit['line'],
                            'text': hit['text'], 'anchor': anchor}
    return None


def apply_patches(original, patches, learned, hits):
    text = canonical_text(original)
    if not isinstance(patches, list):
        raise ValueError('patches 必須是陣列')
    audit, accepted = [], []
    resolved = []
    for proposal in patches:
        item = dict(proposal) if isinstance(proposal, dict) else {'proposal': proposal}
        if 'start' not in item and isinstance(item.get('before'), str) and item['before']:
            matches = list(re.finditer(re.escape(item['before']), text))
            occurrence = item.get('occurrence', 0 if len(matches) == 1 else None)
            if type(occurrence) is int and 0 <= occurrence < len(matches):
                item.update(start=matches[occurrence].start(), end=matches[occurrence].end())
        resolved.append(item)
    patches = resolved
    intervals = [(p.get('start'), p.get('end')) for p in patches]
    for patch in patches:
        item = dict(patch) if isinstance(patch, dict) else {'proposal': patch}
        item.update(applied=False, reason='格式或座標錯誤')
        start, end = item.get('start'), item.get('end')
        before, after = item.get('before'), item.get('after')
        valid = (type(start) is int and type(end) is int and 0 <= start <= end <= len(text)
                 and isinstance(before, str) and isinstance(after, str) and text[start:end] == before)
        if not valid:
            audit.append(item)
            continue
        if sum(type(a) is int and type(b) is int and max(start, a) < min(end, b)
               for a, b in intervals) > 1:
            item['reason'] = '修改範圍重疊'
            audit.append(item)
            continue
        after = canonical_text(after)
        item['after'] = after
        proof = None
        if before != after and normalize_text(before) == normalize_text(after):
            proof = {'type': '標點與空白'}
        elif (before != after and before and not normalize_text(after)
              and re.fullmatch(r'[嗯啊呃，、。？！\s]+', before)
              and (start == 0 or not text[start - 1].isalnum())
              and (end == len(text) or not text[end].isalnum())):
            proof = {'type': '獨立語氣詞'}
        if proof is None:
            proof = learned_evidence(text, start, end, after, learned)
        if proof is None:
            proof = source_evidence(text, start, end, after, item.get('evidence', ''), hits)
        if proof and before != after:
            item.update(applied=True, reason='校正通過', proof=proof)
            accepted.append((start, end, after))
        else:
            item['reason'] = '無足夠同音或底本依據，保留原話'
        audit.append(item)
    for start, end, after in sorted(accepted, reverse=True):
        text = text[:start] + after + text[end:]
    return {'text': text, 'edits': audit, 'reviewNeeded': any(not p['applied'] for p in audit)}
