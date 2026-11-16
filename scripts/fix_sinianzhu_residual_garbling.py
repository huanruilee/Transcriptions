#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""四念住 residual-garbling repair (Stage 6, 2026-11-17).

Adjudicated against the lecture base text T0209_01..08
(https://ftp.budaedu.org/ghosa/C009/T0209/ref/T0209_NN.pdf), extracted to
basetext/lectures.json. Only `text` is edited; `rawText` (ASR evidence) is
never touched. Produces a per-edit evidence ledger.
"""
import json, re, sys, os, hashlib
from collections import Counter

ROOT = "/home/henry/.hermes/cache/scratch/sinianzhu_review/wt"
SDIR = os.path.join(ROOT, "courses/四念住/sessions")
EVID = os.path.join(ROOT, "reviews/evidence/sinianzhu")

# ---- ordered global rules (regex, applied to .text only) -------------------
RULES = [
 ("《玉切識論》","《成唯識論》","底本T0209_03論名；唯識論書名"),
 ("《森》","「深」","底本T0209_01《大智度論》釋「深」字"),
 ("大致的論","大智度論","底本T0209_07「《大智度論》解釋《摩訶般若波羅蜜經》」"),
 ("大致論","大智度論","底本T0209_01龍樹《大智度論》"),
 ("龍樹夫社","龍樹菩薩","底本T0209_01"),
 ("遇歉時的論","瑜伽師地論","底本T0209_04「就引《瑜伽師地論》來說九想觀」"),
 ("據史論","俱舍論","底本T0209_04「我想把《俱舍論》這一段文講完」"),
 ("佑伯居多","優波掬多","底本T0209_04優波掬多尊者"),
 ("楞燕","楞嚴","底本T0209_04《楞嚴經》"),
 ("九種不禁觀","九種不淨觀","底本T0209_04不淨觀"),
 ("不禁觀","不淨觀","底本T0209_03/04不淨觀"),
 ("不敬官","不淨觀","底本T0209_01不淨觀上下文"),
 ("九祥關","九想觀","底本T0209_04「所謂九想觀也在內」"),
 ("九響觀","九想觀","底本T0209_04九想觀"),
 ("百五觀","白骨觀","底本T0209_03白骨觀"),
 ("白骨關","白骨觀","底本T0209_03白骨觀"),
 ("御節燈","欲界定","底本T0209_01欲界定"),
 ("修官會","修觀慧","底本T0209_01止觀/觀慧斷惑"),
 ("官慧","觀慧","底本T0209_01觀慧"),
 ("官密","觀慧","底本T0209_04觀慧上下文"),
 ("官法","觀法","底本T0209_03「觀法」"),
 ("修官","修觀","底本T0209_01修觀"),
 ("用官","用觀","底本T0209_03「用觀來相符其心」"),
 ("興深布林波羅蜜","行深般若波羅蜜","底本T0209_01「行深般若波羅蜜多」"),
 ("興森波爾波羅蜜多","行深般若波羅蜜多","底本T0209_01/03經文"),
 ("興森波爾","行深般若","底本T0209_01"),
 ("興深","行深","底本T0209_01"),
 ("興森","行深","底本T0209_01"),
 ("森波爾波羅蜜多","深般若波羅蜜多","底本T0209_01"),
 ("森波爾","深般若","底本T0209_01"),
 ("森波","深般若","底本T0209_01"),
 ("波爾波羅蜜多","般若波羅蜜多","底本T0209_01"),
 ("波爾波羅蜜","般若波羅蜜","底本T0209_07"),
 ("波爾伯","般若波羅","底本T0209_07"),
 ("波爾","般若","底本T0209_01/07"),
 ("布林波羅蜜","般若波羅蜜","底本T0209_01"),
 ("伯羅蕊","波羅蜜","底本T0209_01"),
 ("摩哈喀","摩訶薩","底本T0209_01「諸菩薩摩訶薩」"),
 ("摩沙","摩訶薩","底本T0209_01「諸菩薩摩訶薩」"),
 ("泡沙","摩訶薩","底本T0209_02「諸菩薩摩訶薩」"),
 ("水源鏡","所緣境","底本T0209_01所緣境"),
 ("索元鏡","所緣境","底本T0209_03「不淨觀的所緣境」"),
 ("鎖元鏡","所緣境","底本T0209_04所緣境明瞭現前"),
 ("出席入席","出息、入息","底本T0209_01「出息、入息」"),
 ("竹之頂","足至頂","底本T0209_04「從足至頂」"),
 ("退死","退失","底本T0209_01「不會再退失的」"),
 ("無露","無漏","底本T0209_01「聖念是無漏的」"),
 ("德無聲發","得無生法","底本T0209_07「得無生法忍」"),
 ("就是史詩","就是屍體","底本T0209_03「這個骨鎖就是屍體」"),
 ("史詩","屍體","底本T0209_03/04死屍"),
 ("淫天","人、天","底本T0209_01「地獄、餓鬼、畜生、人、天、阿修羅」"),
 ("惡鬼","餓鬼","底本T0209_01餓鬼"),
 ("烏鵝關","無我觀","底本T0209_01無我觀"),
 ("烏鵝","無我","底本T0209_01無我"),
 ("計鵝","計我","底本T0209_01「計我論者」"),
 ("鵝","我","底本T0209_01「我」之ASR同音誤字（該講無鵝類語境）"),
 ("貪聖池","貪瞋癡","同講seg-128「貪瞋癡」；底本T0209_03"),
 ("處中比比","觸證彼彼","底本T0209_06「因此而能觸證彼彼解脫」"),
 ("處障","觸證","底本T0209_06觸證彼彼解脫"),
 ("比比","彼彼","底本T0209_06「彼彼解脫」「於彼彼義」"),
 ("由念入心","由念住心","底本T0209_06「由念住心、由慧觀察」"),
 ("額空","我空","底本T0209_01「我空」"),
 ("額不可得","我不可得","底本T0209_01「觀我不可得」"),
 ("觀俄","觀我","底本T0209_01「觀我不可得」"),
 ("一些法","一切法","底本T0209_01「一切法也不可得」"),
 ("術疾","速疾","底本T0209_03「此心不住，速疾轉易」"),
 ("樹極","速疾","底本T0209_03速疾轉易"),
 ("轉意。","轉易。","底本T0209_03速疾轉易"),
 ("轉逆","轉易","底本T0209_03速疾轉易"),
 ("不隨心形","不隨心行","底本T0209_03「令心隨己，不隨心行」"),
 ("不遂心形","不隨心行","底本T0209_03不隨心行"),
 ("隨矣","隨己","底本T0209_03「令心隨己」"),
 ("瀑啟","瀑起","底本T0209_03「如水瀑起」"),
 ("到何正正","斷惑證真","底本T0209_01「不能斷惑證真」"),
 ("發作紙","幫助止","底本T0209_01「觀幫助止」"),
 ("輕瘀","青瘀","底本T0209_03「緣青瘀等修不淨觀」"),
 ("慈禧念","持息念","底本T0209_03「叫做持息念」"),
 ("元氣觀","因緣觀","底本T0209_03「癡行人修因緣觀」"),
 ("不願的話","不然的話","底本T0209_01「不然的話」"),
 ("職關","止觀","底本T0209_01止觀"),
 ("四年度","四念住","底本T0209_01四念住"),
 ("新念著","身念住","底本T0209_03「修身念住的時候」"),
 ("念著","念住","底本T0209_03身/心/法念住"),
 ("十年珠","四念住","底本T0209_04「大乘的四念住」"),
 ("四年祖","四念住","底本T0209_07〈四念住品〉"),
 ("四年著","四念住","底本T0209_07〈四念住品〉"),
 ("聖念珠》、現在是說《聖念珠》","念住；現在是說身念住","底本T0209_06「這叫做念住；現在是說身念住」"),
 ("《聖念珠》是這個意思","身念住是這個意思","底本T0209_06"),
 ("《聖念珠》","念住","底本T0209_06念住"),
 ("聖念珠","四念住","底本四念住"),
 ("宰法","擇法","底本T0209_07七覺支之擇法覺支"),
 ("等角之","等覺支","底本T0209_07念等覺支"),
 ("的角之","的覺支","底本T0209_07念覺支"),
 ("角質","覺支","底本T0209_07七覺支"),
 ("尋伺觀","循身觀","底本T0209「住循身觀」（底本無尋伺）"),
 ("福心","伏心","底本T0209_03「若能伏心則伏眾法」"),
 ("相符其心","降伏其心","底本T0209_03「用觀降伏其心」"),
 ("唸","念","底本全書唸=0、念>>0"),
 ("愚痴","愚癡","底本癡110:痴0"),
 ("痴","癡","底本癡110:痴0"),
 ("慾","欲","底本欲356:慾0"),
 ("玉","欲","底本T0209_03「這些欲的境界裡面生活」"),
 ("嘆","歎","底本歎12:嘆0"),
 ("説","說","正體字統一"),
 ("，，","，","ASR標點重複"),
]

# ---- targeted segment rewrites (exact seg id -> new text) -------------------
SEG = {
 "session_01": {
  "seg-083":"這個所緣境也是很多。",  "seg-645":"就是都已經是得無生法忍的聖人了。",
  "seg-646":"他已經成就了根本智。",
  "seg-648":"這樣的人叫做「行深般若波羅蜜多」。",
  "seg-620":"行深般若波羅蜜多。",
  "seg-621":"這個「深」這個字。",
  "seg-927":"天王當知！諸菩薩摩訶薩行深般若波羅蜜多。",
  "seg-933":"諸菩薩摩訶薩。",
  "seg-934":"說諸菩薩摩訶薩。",
  "seg-928":"修四念住。",
  "seg-937":"修四念住。",
  "seg-938":"修四念住怎麼修法呢？",
  "seg-400":"有欲界定、有未到地定、有四禪。",
  "seg-362":"它也能幫助你的止，也能幫助你的觀。",
  "seg-365":"互相有幫助的，所以你修這個止。",
  "seg-367":"去幫助觀。",
  "seg-368":"修觀去幫助止。",
  "seg-1450":"要加上到了未到地定。",
  "seg-1449":"要加上修不淨觀。",
  "seg-1446":"自然地很容易地悟到無我。",
  "seg-1841":"就是唯識觀。",
  "seg-1808":"他們都提到唯恃觀不能了生死。",
 },
 "session_02": {
  "seg-1917":"觀也在這裡。",
  "seg-1929":"可是我們修的時候，是應該修止，以還未成就，",
 },
 "session_03": {
  "seg-050":"此心不住，速疾轉易。",
  "seg-053":"我們這一念心，它並不是不變易的。",
  "seg-067":"此心不住，速疾轉易。",
  "seg-059":"速疾轉易。",
  "seg-447":"令心隨己，不隨心行。",
  "seg-478":"不隨心行。",
  "seg-523":"這個色聲香味觸。",
  "seg-1212":"叫做持息念。",
  "seg-1213":"舊的翻譯叫做數息觀。",
  "seg-1459":"不淨觀裡面有觀察這個死屍。",
  "seg-1626":"他有提到說制令不動。",
  "seg-586":"這裡說這個伏心不但是止，觀也應該在內。",
  "seg-1676":"但是修了不淨觀到白骨觀。",
  "seg-585":"所以要能伏心，則伏眾法。",
  "seg-593":"就是「則伏眾法」，得自在了。",
 },
 "session_04": {
  "seg-1585":"大乘的四念住有更深一層的境界。",
 },
 "session_06": {
  "seg-268":"由念住心，由慧觀察。",
  "seg-269":"因此而能觸證彼彼解脫。",
  "seg-270":"這叫做念住；現在是說身念住，",
  "seg-272":"身念住是這個意思。",
 },
 "session_07": {
  "seg-1282":"得無生法忍了。",
  "seg-700":"也是這樣子，像念的覺支，念的覺支怎麼說？",
  "seg-570":"第二個是擇法。",
 },
}

UNRESOLVED = {
 "session_01":["seg-633","seg-634","seg-635","seg-639","seg-940","seg-1308","seg-1417","seg-1448","seg-1806"],
 "session_02":["seg-1029"],
 "session_03":["seg-998","seg-999","seg-1000"],
 "session_04":["seg-1523","seg-1553","seg-1554","seg-1555","seg-1556"],
 "session_07":["seg-701"],
}
UNREASON = {
 "seg-633":"專名不確定（疑似論名/論師名）","seg-634":"疑為「異熟果」類名相，底本無對應段",
 "seg-635":"同上，需人工","seg-639":"句首「潛力不而不得」不可解","seg-940":"「一如十字…與身相宴」不可解",
 "seg-1308":"「經濟明體」疑為「清淨明體/精明」，無底本對應","seg-1417":"「官腸的身體」不可解",
 "seg-1448":"「得上刀，都出國」疑為「得上道/得初果」","seg-1806":"論師名「加斯坦」不可考",
 "seg-1029":"「慾思的番號」不可解","seg-998":"「不行比法」疑引文不可解","seg-999":"疑「貪瞋癡…煩惱法」引文",
 "seg-1000":"同998","seg-1523":"「修禪念的人」用語待人工","seg-1553":"阿彌陀佛段嚴重破損",
 "seg-1554":"嚴重破損","seg-1555":"「幾宵幾關」不可解","seg-1556":"「明明讓佛行」不可解",
 "seg-701":"句尾「當之一二」不可解",
}

def flatten(t):
    return t["paragraphs"]

def digest_of(data):
    src=[]
    for pi,p in enumerate(data["paragraphs"] or []):
        h=str(p.get("heading") or "").strip()
        for si,s in enumerate(p.get("sentences") or []):
            tx=re.sub(r"\s+"," ",str(s.get("text") or "")).strip()
            if not tx: continue
            src.append({"id":str(s.get("id") or f"p{pi+1}-s{si+1}"),"text":tx,"heading":h,"paragraphIndex":pi})
    return "sha256:"+hashlib.sha256(json.dumps(src,ensure_ascii=False).encode()).hexdigest()

def main():
    ledger=[]; unresolved=[]; rule_counts=Counter(); seg_edits=0
    for n in range(1,9):
        sid=f"session_{n:02d}"
        fp=os.path.join(SDIR,sid+".json")
        data=json.load(open(fp))
        unres=set(UNRESOLVED.get(sid,[]))
        for p in flatten(data):
            for s in p.get("sentences") or []:
                old=s.get("text") or ""
                new=old
                if s["id"] in SEG.get(sid,{}) and SEG[sid][s["id"]]:
                    new=SEG[sid][s["id"]]
                    if new!=old:
                        ledger.append({"sessionId":sid,"segId":s["id"],"before":old,"after":new,"rule":"segment-rewrite","evidence":"底本上下文裁決（見 docs/SINIANZHU_REVIEW_WORKFLOW.md Stage6）"})
                        seg_edits+=1
                before_rules=new
                for pat,rep,ev in RULES:
                    if pat in new:
                        new=new.replace(pat,rep); rule_counts[pat]+=1
                if new!=old:
                    if new==before_rules:
                        pass
                    else:
                        ledger.append({"sessionId":sid,"segId":s["id"],"before":old,"after":new,"rule":"regex","evidence":"; ".join(dict.fromkeys(ev for pat,rep,ev in RULES if pat in old))[:200]})
                    s["text"]=new
                if s.get("reviewNeeded") is True:
                    if s["id"] in unres:
                        unresolved.append({"sessionId":sid,"segId":s["id"],"text":s["text"],"reason":UNREASON.get(s["id"],"需人工核定")})
                    else:
                        s["reviewNeeded"]=False
        # recompute meta + digest
        paras=data["paragraphs"]; segs=paras
        tot_s=sum(len(p.get("sentences") or []) for p in paras)
        if "_meta" in data:
            data["_meta"]["total_paragraphs"]=len(paras)
            data["_meta"]["total_sentences"]=tot_s
            data["_meta"]["residualRepair"]={"at":"2026-11-17","stage":"stage6-residual-repair","baseText":"T0209_01..08 ftp.budaedu.org","ledger":"reviews/evidence/sinianzhu/residual_repair_ledger.json"}
        if data.get("contentOverview"):
            data["contentOverview"]["sourceDigest"]=digest_of(data)
        json.dump(data,open(fp,"w"),ensure_ascii=False,indent=2)
    os.makedirs(EVID,exist_ok=True)
    json.dump({"generatedAt":"2026-11-17","baseText":"https://ftp.budaedu.org/ghosa/C009/T0209/ref/T0209_NN.pdf","ruleCount":len(RULES),"edits":len(ledger),"ledger":ledger},open(os.path.join(EVID,"residual_repair_ledger.json"),"w"),ensure_ascii=False,indent=2)
    json.dump({"generatedAt":"2026-11-17","sentences":unresolved},open(os.path.join(EVID,"unresolved_sentences.json"),"w"),ensure_ascii=False,indent=2)
    print("edits:",len(ledger),"seg_rewrites:",seg_edits,"unresolved:",len(unresolved))
    print("rule_hits:")
    for pat,rep,ev in RULES:
        if rule_counts[pat]: print(f"  {pat} -> {rep}: {rule_counts[pat]}")
    print("zero_hit_rules:", [p for p,_,_ in RULES if rule_counts[p]==0])

if __name__=="__main__":
    main()
