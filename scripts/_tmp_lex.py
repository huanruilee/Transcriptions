import json
p = "courses/釋量論第二品/learned_corrections.json"
d = json.load(open(p))
new = {
    "醫护": {"corrected": "依怙", "category": "佛經用語", "safe_regex": "醫护",
             "treatise_ref": "底本「自己才是自己的依怙」; 醫护 0 hits"},
    "變質": {"corrected": "遍智", "category": "因明術語", "safe_regex": "變質",
             "treatise_ref": "底本「把祂心中的一切遍智」; 變質 0 hits in 成量品"},
    "诸佛": {"corrected": "諸佛", "category": "常用", "safe_regex": "诸佛",
             "treatise_ref": "简体殘留"},
    "守除": {"corrected": "手除", "category": "偈頌", "safe_regex": "(?<=非以)守除",
             "treatise_ref": "道果論偈「非以手除眾生苦」; 守除 0 hits"},
    "于予者": {"corrected": "於餘者", "category": "偈頌", "safe_regex": "于予者",
               "treatise_ref": "偈「非移自證於餘者」; ASR 同音誤聽"},
    "释法信地": {"corrected": "示法性諦", "category": "偈頌", "safe_regex": "释法信地",
                 "treatise_ref": "偈「示法性諦令解脫」; ASR 同音誤聽"},
    "非以自證": {"corrected": "非移自證", "category": "偈頌", "safe_regex": "非以自證",
                 "treatise_ref": "偈「非移自證於餘者」; 底本用 移"},
}
d["global_terms"].update(new)
assert all(isinstance(v, dict) and "corrected" in v for v in d["global_terms"].values())
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
print("total terms:", len(d["global_terms"]))
