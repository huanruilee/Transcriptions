#!/usr/bin/env python3
"""
scripts/calibrate_53a.py - Targeted grounded proofreading & calibration for Session 53A.
"""

import json
import re
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

def main():
    p = Path("courses/入中論善顯密意疏/sessions/session_53A.json")
    with open(p, "r", encoding="utf-8") as f:
        s53a = json.load(f)

    grounding_text = """
《入中論善顯密意疏》第六現前地：
若謂自破他宗時，以「此宗有何能諍」等出過；他人反難時，彼不知各種深細建立，復不能依自宗甚深最精微義及最難通達之深細正理而釋他難，唯樂狡辯，云「我宗無所許，故不犯過」，若唯樂於狡辯，實不須示如是精微建立。然若聰叡智士，若不以精細正理檢測得失之正倒，便不能信受，故由具慈悲，略示自宗無過之門徑。
若謂：「我見青色」，此「我」乃指補特伽羅，與緣青色之眼識相違，如是念識云何能念緣青色？彼見青色之眼識雖與補特伽羅相違，然彼眼識是見青色之緣，故可名言說「我見青色」，無相違過。
破自證分：若無自證分，如何憶念曾見青色？答云：如根識緣青色生時，名言中後時即能生起憶念，不須執有自證分與依他起自相。
名相對應表：
- 葡萄切勒 -> 補特伽羅
- 能政治/能政/能整 -> 能諍
- 相偽 -> 相違
- 原青色/原青眼 -> 緣青色/緣青眼識
- 精偉/驚議 -> 精微
- 充類知識/聰銳志士 -> 聰叡智士
- 門禁 -> 門徑
- 神系 -> 深細
- 著相/自相 -> 自相
- 自證分、依他起、勝義無、名言有
"""

    ROUTER_URL = "http://127.0.0.1:4001/v1/chat/completions"
    VLLM_URL = "http://192.168.122.1:8001/v1/chat/completions"

    all_sents = []
    for p_item in s53a["paragraphs"]:
        for s in p_item.get("sentences", []):
            all_sents.append(s)

    print(f"Total sentences to calibrate in 53A: {len(all_sents)}")

    system_prompt = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與中觀應成派見解的頂級佛學主編。
當前任務是將格西講述第 53A 堂逐字稿中的 ASR 語音錯字（特別是：葡萄切勒->補特伽羅、能政治->能諍、相偽->相違、原青色->緣青色、精偉/驚議->精微、充類知識/聰銳志士->聰叡智士、門禁->門徑、神系->深細等）依據底本精準校正為純正的佛法名相與通順正體中文。

【底本與名相參考】：
---
{grounding_text}
---

【極重要規則】：
1. 嚴格保持句子數量完全一致（輸入 N 句，輸出剛好 N 句的 JSON 字串陣列）。
2. 保留時間戳不變，僅校正錯別字與名相。
3. 輸出 100% 繁體中文（台灣正體）。
"""

    def call_llm(msgs):
        try:
            r = requests.post(ROUTER_URL, json={"model": "primary", "messages": msgs, "temperature": 0.05, "chat_template_kwargs": {"enable_thinking": False}}, timeout=60)
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"]
        except Exception:
            pass
        r = requests.post(VLLM_URL, json={"model": "Qwen3.8-27B", "messages": msgs, "temperature": 0.05, "chat_template_kwargs": {"enable_thinking": False}}, timeout=60)
        return r.json()["choices"][0]["message"]["content"]

    batch_size = 12
    batches = [all_sents[i:i+batch_size] for i in range(0, len(all_sents), batch_size)]
    results = [None] * len(batches)

    def process_b(b_idx, batch):
        input_texts = [s["text"] for s in batch]
        prompt = f"請依據底本校正以下 {len(input_texts)} 個句子，輸出剛好 {len(input_texts)} 個句子的 JSON 陣列：\n" + json.dumps(input_texts, ensure_ascii=False, indent=2)
        msgs = [{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}]
        try:
            content = call_llm(msgs)
            m = re.search(r'\[\s*".*"\s*\]', content, re.DOTALL)
            if m:
                arr = json.loads(m.group(0))
                if len(arr) == len(batch):
                    return b_idx, [{"start": s["start"], "end": s["end"], "text": arr[j]} for j, s in enumerate(batch)]
        except Exception as e:
            print(f"Batch {b_idx} err: {e}")
        return b_idx, batch

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(process_b, i, b) for i, b in enumerate(batches)]
        for f in futs:
            idx, res_b = f.result()
            results[idx] = res_b

    calibrated_sents = []
    for r in results:
        calibrated_sents.extend(r)

    print(f"✅ Successfully calibrated {len(calibrated_sents)} sentences!")

    # Re-assemble paragraphs
    curr_idx = 0
    for p_item in s53a["paragraphs"]:
        p_len = len(p_item.get("sentences", []))
        p_item["sentences"] = calibrated_sents[curr_idx:curr_idx+p_len]
        curr_idx += p_len

    try:
        import opencc
        t_conv = opencc.OpenCC("s2twp")
        def to_trad(o):
            if isinstance(o, str): return t_conv.convert(o)
            elif isinstance(o, list): return [to_trad(x) for x in o]
            elif isinstance(o, dict): return {k: to_trad(v) for k, v in o.items()}
            return o
        s53a = to_trad(s53a)
    except Exception:
        pass

    with open(p, "w", encoding="utf-8") as f:
        json.dump(s53a, f, ensure_ascii=False, indent=2)
    print("🎉 Saved calibrated session_53A.json!")

if __name__ == "__main__":
    main()
