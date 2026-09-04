#!/usr/bin/env python3
"""
scripts/llm_proofread_session_30B.py
Ground-truth aligned LLM deep proofreading for Session 30B of 《入中論善顯密意疏》.
Speaker: 見悲青增格西
Textbook: pages 100-101
"""

import sys, os, json, time, re
import urllib.request

VLLM_URL = os.environ.get("VLLM_URL", "http://192.168.122.1:8001/v1/chat/completions")

COURSE_DIR = "courses/入中論善顯密意疏"
SESSION_PATH = f"{COURSE_DIR}/sessions/session_30B.json"
PAGE_100_PATH = f"{COURSE_DIR}/source_text/page_100.txt"
PAGE_101_PATH = f"{COURSE_DIR}/source_text/page_101.txt"

# Mandatory ground truth references
GROUND_TRUTH = """
【科判體系】：
申三、別釋二諦體。分二：酉一、釋世俗諦，酉二、釋勝義諦。
初又分三：戌一、明於何世俗前為諦何前不諦，戌二、三類補特伽羅見不見世俗之理，戌三、觀待異生聖者成為勝義世俗之理。
初又分二：亥一、正義，亥二、釋煩惱不共建立。

【根本頌文】：
「癡障性故名世俗，假法由彼現為諦，能仁說名世俗諦，所有假法唯世俗。」

【論疏與經文底本】：
由此無明愚癡，令諸眾生不見諸法實性，於無自性之諸法，增益為有自性。遂於見真實性障蔽為體，是名世俗。此所說之世俗，是明世俗諦為於何世俗前安立為諦之世俗，非明總世俗也。
如《楞伽經》云：「諸法世俗生，勝義無自性，無性而迷亂，許為真世俗。」
此說於勝義無自性，誤為有自性之心即是世俗。「世俗」，梵語有「能障」義，此世俗即為能障。此為障何事耶？曰：「許為真世俗。」謂由障蔽真義故，許為世俗或能障。此非說正邪二世俗中之正世俗也。初句所說之世俗，與後句所說之世俗，義全不同。前者是自許諸法生等世俗中有之世俗，後者是諸法於何世俗前為諦之實執世俗也。
由彼實執世俗之力，青等虛偽諸法，本無自性現有自性，於諸眾生現為實有。由此於前所說世間顛倒世俗之前為諦實故，能仁說為世間的世俗諦，即如前經所說也。由於三種人前不現為諦實，而是分別假造虛偽諸法。由於彼世俗前不諦實故，名唯世俗。
《釋論》說：「如影像、谷響等少分緣起法，雖具無明者亦見其虛妄。如青等色法及心受等少法，則現為諦實。諸法實性，則具無明者畢竟不見。故此實性與世俗中見為虛妄者非世俗諦。」此所言「少法」，拏錯譯為「有法」較妥。言「影像等……亦見為虛妄」者，是現似形質與彼質空二事相合之虛妄。彼之實空，亦是空無實質之義，非影像自性空之義。
"""

SYSTEM_PROMPT = f"""你是一位精通藏傳佛教格魯派宗喀巴大師《入中論善顯密意疏》與月稱菩薩《入中論》的頂級佛學主編。
當前校對文本為【見悲青增格西】講授第 30B 堂（進度：底本 p.100 - p.101）的錄音口述逐字稿。

{GROUND_TRUTH}

【核心佛法名相與同音訛字校對手冊】：
1. 科判字號：格西常念「戌一（xū yī）」，語音極易誤為「物意/物一」，切勿誤校，務必校為「戌一」！科判「明於何世俗前為諦」常被語音誤為「民語何世俗/名言何世俗」，務必校為「明於何世俗前為諦」！
2. 障蔽（kun rdzob / 能障）：格西解釋世俗義時常講「障蔽（覆蔽）」，語音常誤為「藏幣/藏自性」，務必校正為「障蔽」！
3. 增益（Samāropa）：語音常誤為「真意/爭議」，務必校正為「增益」（如「增益為有自性」）。
4. 自性（Svabhāva）：常被誤為「自信」，凡談空性法理，務必校正為「自性」（如「無自性」、「有自性」、「自性空」）。
5. 能仁（Śākyamuni / 佛陀）：底本「能仁說名世俗諦」，語音常誤為「來人/人人/老人」，務必校正為「能仁說為世俗諦/能仁說」！
6. 楞伽經引文：「無性而迷亂，許為真世俗」，語音常誤為「無信而迷亂/虛為真世俗」，務必校正為「無性而迷亂，許為真世俗」！
7. 愚癡：格西談癡障時，語音常誤為「吃/於痴」，如「你看癡」、「愚癡的這個世俗」，絕不可寫成「吃飯」的「吃」！
8. 影像谷響：語音常誤為「古生/古神/行止」，務必校正為「谷響/形質」。

【輸出規範】：
1. 輸入有 N 句話，輸出必須是剛好 N 句話的 JSON 字串陣列 `["句子1", "句子2", ...]`。
2. 保持見悲青增格西講課口語自然流暢，只修正錯別字與佛學名相，不改變口語語法。
3. 繁體中文（台灣正體）輸出。嚴禁輸出簡體字或包裹 Markdown 標籤。"""

def call_vllm(batch_sentences):
    prompt_user = "請校對以下句子陣列，並剛好返回相同數量的 JSON 字串陣列：\n" + json.dumps(
        [s["text"] for s in batch_sentences], ensure_ascii=False, indent=2
    )

    payload = {
        "model": "Qwen3.8-27B",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt_user}
        ],
        "temperature": 0.0,
        "max_tokens": 4096,
        "chat_template_kwargs": {"enable_thinking": False}
    }

    req = urllib.request.Request(
        VLLM_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        content = res["choices"][0]["message"]["content"].strip()

    # Parse JSON array from content
    match = re.search(r'\[.*\]', content, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    else:
        return json.loads(content)

def main():
    print(f"📖 Loading Session 30B from {SESSION_PATH}...")
    with open(SESSION_PATH, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    # Flatten all sentences while keeping track of paragraph & sentence indices
    sentence_refs = []
    for p_idx, p in enumerate(session_data["paragraphs"]):
        for s_idx, s in enumerate(p["sentences"]):
            sentence_refs.append((p_idx, s_idx, s))

    total = len(sentence_refs)
    print(f"📊 Total sentences to proofread: {total} across {len(session_data['paragraphs'])} paragraphs.")

    batch_size = 25
    corrections = []
    t0 = time.time()

    for i in range(0, total, batch_size):
        chunk_refs = sentence_refs[i:i+batch_size]
        batch_sents = [ref[2] for ref in chunk_refs]
        batch_num = i // batch_size + 1
        total_batches = (total + batch_size - 1) // batch_size
        
        print(f"  ⚡ [{batch_num}/{total_batches}] Processing sentences {i+1} to {min(i+batch_size, total)}...", end="", flush=True)

        try:
            proofread_texts = call_vllm(batch_sents)
            if len(proofread_texts) != len(batch_sents):
                print(f" ⚠️ Length mismatch ({len(proofread_texts)} vs {len(batch_sents)}), skipping LLM for this batch.")
                continue

            batch_fixes = 0
            for (p_idx, s_idx, s), new_text in zip(chunk_refs, proofread_texts):
                clean_text = new_text.strip()
                # Post-processing protection:
                clean_text = clean_text.replace("無明瞭", "無明了")
                clean_text = clean_text.replace("明瞭了", "明了了")

                old_text = s.get("text", "")
                if clean_text and clean_text != old_text:
                    corrections.append({
                        "start": s.get("start"),
                        "end": s.get("end"),
                        "old": old_text,
                        "new": clean_text
                    })
                    s["text"] = clean_text
                    s["proofreadText"] = clean_text
                    batch_fixes += 1

            print(f" ✅ Done ({batch_fixes} fixes).")
        except Exception as e:
            print(f" ❌ Error: {e}")

    elapsed = time.time() - t0
    print(f"\n🎉 Proofreading complete in {elapsed:.1f}s! Total corrections made: {len(corrections)}")

    # Save updated session_30B.json
    with open(SESSION_PATH, "w", encoding="utf-8") as f:
        json.dump(session_data, f, ensure_ascii=False, indent=2)
    print(f"💾 Updated session written to {SESSION_PATH}")

    # Write evidence audit log
    os.makedirs("reviews/evidence", exist_ok=True)
    audit_file = "reviews/evidence/session_30B_llm_proofread_audit.json"
    with open(audit_file, "w", encoding="utf-8") as f:
        json.dump({
            "session": "30B",
            "total_sentences": total,
            "total_corrections": len(corrections),
            "elapsed_seconds": round(elapsed, 2),
            "sample_corrections": corrections[:100]
        }, f, ensure_ascii=False, indent=2)
    print(f"📝 Audit log written to {audit_file}")

if __name__ == "__main__":
    main()
