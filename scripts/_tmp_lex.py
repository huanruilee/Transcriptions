import json
p = "courses/釋量論第二品/learned_corrections.json"
d = json.load(open(p))
new = {
    "心绪": {"corrected": "心續", "category": "因明術語", "safe_regex": "心绪",
             "treatise_ref": "简体殘留; 心續 72 hits / 心绪 0 hits in 成量品"},
    "变质": {"corrected": "遍智", "category": "因明術語", "safe_regex": "变质",
             "treatise_ref": "ASR 同音誤聽: 底本「把祂心中的一切遍智」; 变质/變質 0 hits"},
    "變质": {"corrected": "遍智", "category": "因明術語", "safe_regex": "變质",
             "treatise_ref": "同上, LLM 混寫變體"},
    "医护": {"corrected": "依怙", "category": "佛經用語", "safe_regex": "医护",
             "treatise_ref": "底本「自己才是自己的依怙」; 医护 0 hits"},
}
d["global_terms"].update(new)
assert all(isinstance(v, dict) and "corrected" in v for v in d["global_terms"].values())
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
print("total terms:", len(d["global_terms"]))
