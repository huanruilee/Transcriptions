#!/usr/bin/env python3
"""Match immutable sentence text to acoustic word boundaries; never interpolate missing words.
Requires opencc-python-reimplemented. Outputs candidates only, never edits source.
"""
import argparse, difflib, hashlib, json, re
from pathlib import Path


def digest(raw):
    return 'sha256:' + hashlib.sha256(raw).hexdigest()


def build(source, evidence, source_digest, evidence_digest, normalizer=None):
    if normalizer is None:
        from opencc import OpenCC
        normalizer = OpenCC('t2s').convert
    def normalize(text):
        return re.sub(r'[^\w\u3400-\u9fff]', '', normalizer(text))
    rows = [s for p in source['paragraphs'] for s in p['sentences']]
    words = [w for seg in evidence['segments'] for w in seg['words']]
    acoustic, indices = '', []
    for i, word in enumerate(words):
        text = normalize(word['word'])
        acoustic += text
        indices.extend([i] * len(text))
    target, spans = '', []
    for row in rows:
        norm = normalize(row['text'])
        spans.append((len(target), len(target) + len(norm)))
        target += norm
    mapping = {}
    for block in difflib.SequenceMatcher(None, target, acoustic, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            mapping[block.a+k] = block.b+k
    items = []
    for row, (left, right) in zip(rows, spans):
        matched = [i for i in range(left, right) if i in mapping]
        risks = []
        first = indices[mapping[matched[0]]] if matched else None
        last = indices[mapping[matched[-1]]] if matched else None
        start = words[first]['start'] if matched else None
        end = words[last]['end'] if matched else None
        if not matched or len(matched)/max(1,right-left)<0.75: risks.append('weak-match')
        if matched and (matched[0]-left>2 or right-1-matched[-1]>2): risks.append('unmatched-edge')
        if start is not None and (end<=start or ((right-left)>=12 and ((end-start)<=0.51 or (right-left)/(end-start)>12))): risks.append('implausible-duration')
        items.append({'id':row['id'], 'text':row['text'], 'start':start, 'end':end,
            'oldStart':row['start'], 'oldEnd':row['end'],
            'status':'review' if risks else 'aligned', 'risks':risks,
            'evidence':{'artifactSha256':evidence_digest, 'firstWord':first, 'lastWord':last,
                'start':start, 'end':end, 'matchedCharacters':len(matched), 'totalCharacters':right-left,
                'unmatchedPrefix':matched[0]-left if matched else right-left,
                'unmatchedSuffix':right-1-matched[-1] if matched else right-left,
                'acousticText':''.join(w['word'] for w in words[first:last+1]) if matched else ''}})
    return {'schema':'audio-calibration/v1', 'authority':'machine-candidate', 'humanListened':False,
        'sourceDigest':source_digest, 'videoId':source['youtubeVideoId'],
        'audio':{'sha256':evidence['audioSha256'], 'duration':evidence['duration'],
            'videoOffsetSeconds':0, 'identityVerified':False},
        'engine':{'name':'faster-whisper', 'revision':evidence['model'], 'version':evidence['fasterWhisperVersion']},
        'method':'global normalized exact-character matching; acoustic whole-word boundaries; no time interpolation',
        'items':items}


def main():
    p=argparse.ArgumentParser()
    for name in ('source','evidence','output'): p.add_argument('--'+name,required=True)
    a=p.parse_args(); source=Path(a.source).read_bytes(); evidence=Path(a.evidence).read_bytes()
    result=build(json.loads(source),json.loads(evidence),digest(source),digest(evidence))
    Path(a.output).parent.mkdir(parents=True,exist_ok=True)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':a.output,'sentences':len(result['items']),'review':sum(i['status']=='review' for i in result['items'])}))
if __name__=='__main__': main()
