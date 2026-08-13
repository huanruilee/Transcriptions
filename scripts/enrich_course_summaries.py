import json
import os

course_file = 'courses/入中論善顯密意疏/course.json'
toc_file = 'courses/入中論善顯密意疏/toc.json'

with open(course_file, 'r', encoding='utf-8') as f:
    course = json.load(f)

with open(toc_file, 'r', encoding='utf-8') as f:
    toc = json.load(f)

# Build TOC topic map per sessionId
session_topics = {}

def extract_topics(nodes):
    for n in nodes:
        sid = n.get('sessionId')
        title = n.get('title', '')
        if sid:
            if sid not in session_topics:
                session_topics[sid] = []
            if title not in session_topics[sid]:
                session_topics[sid].append(title)
        if 'children' in n:
            extract_topics(n['children'])

extract_topics(toc.get('sections', []))

for sess in course.get('sessions', []):
    sid = sess.get('sessionId')
    topics = session_topics.get(sid, [])
    
    # If no TOC topic, extract first non-header sentence from transcript
    if not topics and 'jsonUrl' in sess and os.path.exists(sess['jsonUrl']):
        try:
            with open(sess['jsonUrl'], 'r', encoding='utf-8') as sf:
                sdata = json.load(sf)
                for p in sdata.get('paragraphs', []):
                    for s in p.get('sentences', []):
                        txt = s.get('text', '').strip()
                        if len(txt) > 8 and not txt.startswith('[p.'):
                            topics.append(txt[:35] + '...')
                            break
                    if topics:
                        break
        except Exception as e:
            pass

    if topics:
        sess['summary'] = ' ・ '.join(topics[:3])
    else:
        sess['summary'] = f"第 {sid} 堂《入中論善顯密意疏》講記導讀"

with open(course_file, 'w', encoding='utf-8') as f:
    json.dump(course, f, ensure_ascii=False, indent=2)

print(f"Successfully enriched {len(course['sessions'])} sessions with unique summaries!")
