#!/usr/bin/env python3
"""
scripts/test_prompt_strategies.py
Test prompt engineering strategies against GX10 Qwen3.8-27B to achieve human-expert proofreading.
"""

import json
import urllib.request
import sys

endpoint = "http://127.0.0.1:18001/v1"

def call_llm(system_prompt, user_prompt):
    payload = {
        "model": "Qwen3.8-27B",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 3000,
        "chat_template_kwargs": {"enable_thinking": False}
    }
    req = urllib.request.Request(
        f"{endpoint}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["choices"][0]["message"]["content"]

test_sentences = [
    {"id": 1, "text": "就是變成這邊講的那個世俗，講的是那個嘛，就是一般正常人的明眼識前面不是地。"},
    {"id": 2, "text": "我們一般沒有懂空性的，一般人的明眼識前面不是地的，其實就只有那七種了。"},
    {"id": 3, "text": "瓶子桌子等等等等都是地，這樣可以嗎？可是就是變成一切所知，包括空性。"},
    {"id": 4, "text": "在無明前面都是地，一切所知在無明前面是地，這樣可以嗎？那只有幻花等等等等。"},
    {"id": 5, "text": "在一般明眼識前面不是地，但是在無明前面依然是地，要把這兩個間分開嘛。"},
    {"id": 6, "text": "從這邊講下去，《釋論》是談到「實性與具無明者，畢竟不現」，有沒有？這個就在討論。"},
    {"id": 7, "text": "「此許為斷盡無明的聖人，義皆現證真實義」，只要是聖人，是不是都懂空性。"},
    {"id": 8, "text": "至於有學聖人之後的智，反正就是有學聖人，反正就是說，見到修到。"},
    {"id": 9, "text": "像後導致這些 好像那個人也不算嘛 人可以懂 那他的後導致這些 雖然也是算是一種據無明吧？"}
]

treatise_context = """
【原典《入中論善顯密意疏》第101-102頁】
《釋論》說：「如影像、谷響等少分緣起法，雖具無明者亦見其虛妄。如青等色法及心受等少法，則現為諦實。諸法實性，則具無明者畢竟不見。故此實性與世俗中見為虛妄者非世俗諦。」... 以是當知論說「影像非世俗諦」者，意說善名言者世間世俗所見影像，現似形質已知為妄，是觀待彼心已非世俗諦...《釋論》言「實性於具無明者畢竟不現」者，此許未斷盡無明之聖人，亦皆現證真實義，故是說現被無明障蔽之心。至於有學聖人之後得智及異生之真實義見，雖有無明及無明習氣所蔽不能現見，然當許彼見勝義諦。
"""

# Strategy 1: Naive Proofreader
sys_1 = """你是一位專業佛學逐字稿校對員。請校對以下逐字稿中的錯別字，並以 JSON 格式返回校對後的句子清單 [{\"id\": ..., \"text\": ...}]。"""
user_1 = json.dumps(test_sentences, ensure_ascii=False)

# Strategy 2: Context Only
sys_2 = f"""你是一位專業佛學逐字稿校對員。請參考以下經論原文進行校對：
{treatise_context}
請以 JSON 格式返回校對後的句子清單 [ {{\"id\": ..., \"text\": ...}} ]。"""
user_2 = json.dumps(test_sentences, ensure_ascii=False)

# Strategy 3: Semantic Scaffolding + Acoustic Bias Guidance
sys_3 = f"""你是一位精通中觀應成派見解的資深佛學法義校對專家。你正在校對見悲青增格西講授《入中論善顯密意疏》的課堂錄音逐字稿。

【經論原典參照（p.101-102）】：
{treatise_context}

【本段核心法義對立軸與高頻聽打語音訛誤指引】：
1. 【名言識 vs 無明實執】與【諦 vs 妄】：
   - 善名言者常人識為「名言識」，名言識知影像虛妄故「非諦」；但有情心中染污無明執為實有，故於無明前「是諦」。
   - ⚠️ 語音盲區修訂：聽打常將「名言識」誤聽為「明眼識」；常將「諦（諦實）」誤聽為「地（土地）」。
2. 【未斷盡無明之聖人】：
   - 七地以下菩薩尚未斷盡無明，但已現證空性，故宗大師釋論消文為「此許未斷盡無明之聖人，亦皆現證真實義」。
   - ⚠️ 語音盲區修訂：聽打常將「未斷盡」誤寫為「為斷盡」；「亦皆」誤寫為「義皆」。
3. 【根本智 vs 後得智】：
   - 聖人出定後之分別智為「後得智」，大乘五道為「見道、修道」。
   - ⚠️ 語音盲區修訂：聽打常將「後得智」誤寫為「後的智 / 後導致」；「見道修道」誤寫為「見到修到」。
4. 【具無明者】：
   - 指與無明相應之心心所（如貪瞋痴）。
   - ⚠️ 語音盲區修訂：聽打常將「具無明」誤寫為「據無明」。

【任務指示】：
請逐句核對，修正所有上述 ASR 訛字，務必輸出嚴格的 JSON 陣列：
[
  {{"id": 句子編號, "original": "原始句", "corrected": "校正後句子", "corrections": ["訛字 -> 正字"]}}
]
"""
user_3 = json.dumps(test_sentences, ensure_ascii=False)

def run():
    print("=== Running Strategy 1 (Naive) ===")
    res_1 = call_llm(sys_1, user_1)
    print(res_1[:400])

    print("\n=== Running Strategy 2 (Context Only) ===")
    res_2 = call_llm(sys_2, user_2)
    print(res_2[:400])

    print("\n=== Running Strategy 3 (Semantic Scaffolding + Acoustic Bias) ===")
    res_3 = call_llm(sys_3, user_3)
    print(res_3)

if __name__ == "__main__":
    run()
