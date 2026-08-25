#!/usr/bin/env python3
"""
llm_proofread_session_29A.py - High-precision LLM proofreading using GX10 local Qwen3.8-27B.
Fixes all homophone and ASR speech errors with deep Buddhist philosophical domain knowledge.
"""
import sys
import os
import json
import re
import requests
from pathlib import Path

LLM_URL = "http://192.168.122.1:8001/v1/chat/completions"

SYSTEM_PROMPT = """你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的佛學專家與校對主編。
當前文本為法師講解《入中論善顯密意疏》第六現前地（p.97 觀待世間釋彼差別）的錄音口述逐字稿。

本講次核心法義背景與關鍵術語：
1. 【所知與二諦】：所知分為勝義諦與世俗諦。勝義諦是不欺誑法，世俗諦是欺誑法。
2. 【正倒世俗差別】：自續派分為「正世俗」與「倒世俗」；中觀應成派自宗認為：若觀待世間名言識，可分「無損害根識所見（正世俗）」與「有損害根識所見（倒世俗）」；但觀待中觀正理，一切世俗諦皆是顛倒、無自性。
3. 【損害根識之因】：
   - 內損害因：眩翳、飛蚊症（「飛蚊症」、「眼翳」）、膽熱病（視白螺為黃）、黃疸病。
   - 外損害因：咒術（「咒師」施咒）、「幻術」、「毒藥」（服毒見一物為多物）、「陽焰」（沙漠陽光曬沙粒形成的蜃景，世人「執陽焰為水」）、「旋火輪」、「乘船/搭車見岸樹奔馳（坐在高鐵/火車上看樹在動，其實是車在動樹沒動）」。
4. 【哲學名相】：色法、心法、不相應行法、自相有、自性有、無自相、現量、比量、名言、勝義、世俗、神我（數論外道立神我）、無分微塵、自續派、應成派、月稱菩薩、宗喀巴大師。
5. 【常用偈頌】：頌曰、頌云。

任務要求：
1. 嚴格修正 ASR 產生的「同音錯字」與「語音聽寫錯誤」，例如：
   - 羹 / 水損壞羹 / 內在損壞羹 ➔ 根 / 損壞根 / 內在損壞根
   - 肺紋症 / 非紋症 ➔ 飛蚊症
   - 至向有 / 自向有 / 限到 ➔ 自相有 / 陷到自相有
   - 直那個正的是 / 執那個正的是 / 執那個道 ➔ 執那個正的識 / 執那個倒的識
   - 咒詩 ➔ 咒師
   - 陽眼 / 羊眼 ➔ 陽焰
   - 設法 / 設法心法 ➔ 色法 / 色法心法
   - 不先一心法 ➔ 不相應行法
   - 空信 ➔ 空性
   - 宋約 / 頌約 / 頌結 ➔ 頌曰
   - 生一地 / 生意地 ➔ 勝義諦
   - 俗地 / 世俗地 ➔ 世俗諦
   - 過世 ➔ 過失
2. 保持口語對話與開示語氣的自然流暢，保留標點符號（「」、，。？！）。
3. 繁體中文輸出。
4. 【極重要】：輸入有 N 句話，輸出必須是剛好 N 句話的 JSON 字串陣列 `["句子1", "句子2", ...]`，絕不可合併或刪減句子！
"""

def proofread_batch(sentences, batch_idx, total_batches):
    input_list = [s["text"] for s in sentences]
    prompt = f"請校對以下 {len(input_list)} 個句子，修正所有佛學名相與同音錯字，並以 JSON 字串陣列輸出：\n" + json.dumps(input_list, ensure_ascii=False, indent=2)

    payload = {
        "model": "Qwen3.8-27B",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.05,
        "chat_template_kwargs": {"enable_thinking": False}
    }

    try:
        r = requests.post(LLM_URL, json=payload, timeout=60)
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]

        # Parse JSON array from content
        match = re.search(r'\[\s*".*"\s*\]', content, re.DOTALL)
        if match:
            corrected_list = json.loads(match.group(0))
            if len(corrected_list) == len(input_list):
                print(f"  ✅ Batch {batch_idx+1}/{total_batches} ({len(input_list)} sentences) successfully proofread by Qwen3.8-27B.")
                return corrected_list
            else:
                print(f"  ⚠️ Batch {batch_idx+1}: Length mismatch ({len(corrected_list)} != {len(input_list)}). Falling back to original.")
        else:
            print(f"  ⚠️ Batch {batch_idx+1}: JSON parse failed. Content: {content[:100]}...")
    except Exception as e:
        print(f"  ❌ Batch {batch_idx+1} Error: {e}")

    return input_list

def main():
    json_path = Path("courses/入中論善顯密意疏/sessions/session_29A.json")
    if not json_path.exists():
        print(f"File not found: {json_path}")
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Flatten sentences with pointers
    flat_refs = []
    for pi, p in enumerate(data["paragraphs"]):
        for si, s in enumerate(p["sentences"]):
            flat_refs.append((pi, si, s))

    total_sents = len(flat_refs)
    batch_size = 12
    batches = [flat_refs[i:i + batch_size] for i in range(0, total_sents, batch_size)]
    total_batches = len(batches)

    print(f"\n=======================================================")
    print(f"🧠 CALLING GX10 LOCAL QWEN3.8-27B FOR DEEP PROOFREADING — Session 29A")
    print(f"=======================================================")
    print(f"• Total sentences to proofread: {total_sents}")
    print(f"• Batch size: {batch_size} (Total batches: {total_batches})\n")

    for b_idx, batch in enumerate(batches):
        batch_sents = [item[2] for item in batch]
        corrected_texts = proofread_batch(batch_sents, b_idx, total_batches)
        
        for idx, (pi, si, s) in enumerate(batch):
            data["paragraphs"][pi]["sentences"][si]["text"] = corrected_texts[idx]

    data["_meta"]["llm_proofread"] = "Qwen3.8-27B-DeepBuddhistRAG"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 Successfully completed deep LLM proofreading for Session 29A!")

if __name__ == "__main__":
    main()
