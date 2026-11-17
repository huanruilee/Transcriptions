#!/usr/bin/env python3
# Regenerate semantic_review_queue.json from the Stage6 remediation state.
import json, datetime
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
un=json.load(open(ROOT+"/reviews/evidence/sinianzhu/unresolved_sentences.json"))
led=json.load(open(ROOT+"/reviews/evidence/sinianzhu/residual_repair_ledger.json"))
by={}
for s in un["sentences"]:
    by.setdefault(s["sessionId"],[]).append({"segId":s["segId"],"text":s["text"],"reason":s["reason"]})
queue={
 "schemaVersion":2,
 "generatedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "status":"PENDING_HUMAN_REVIEW",
 "stage":"stage6-base-text-adjudication",
 "baseText":"https://ftp.budaedu.org/ghosa/C009/T0209/ref/T0209_NN.pdf",
 "repairLedger":"reviews/evidence/sinianzhu/residual_repair_ledger.json",
 "totalRepairsApplied":led["edits"],
 "pendingTotal":len(un["sentences"]),
 "note":"2026-11-17 Stage6: all 374 base-text-adjudicated repairs applied; only sentences without any base-text correspondence remain pending human judgement.",
 "sessions":[{"sessionId":k,"status":"PENDING_HUMAN_REVIEW","correctionCount":len(v),"sentences":v} for k,v in sorted(by.items())],
}
json.dump(queue,open(ROOT+"/reviews/evidence/sinianzhu/semantic_review_queue.json","w"),ensure_ascii=False,indent=2)
print("queue regenerated; pending:",len(un["sentences"]))
