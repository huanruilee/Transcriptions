"""T6：僅檢索當講底本，提供模糊讀誦候選與實體頁／行證據；不覆寫原話。"""
from difflib import SequenceMatcher
import re
from functools import lru_cache
from pypinyin import lazy_pinyin


@lru_cache(maxsize=4096)
def phonetics(text):
    return tuple(lazy_pinyin(text, errors=lambda chars: list(chars)))


def plain(text):
    return ''.join(re.findall(r'[\u3400-\u9fffA-Za-z0-9]', text))


def distance(a, b):
    previous = list(range(len(b) + 1))
    for i, item in enumerate(a, 1):
        current = [i]
        for j, other in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[-1] + 1, previous[j - 1] + (item != other)))
        previous = current
    return previous[-1]


class SourceAligner:
    def __init__(self, pages):
        self.units = []
        for page, text in pages.items():
            # 保留每個字在原始實體頁面中的行號，換行不切斷引文。
            chars, line_map = [], []
            for line_no, line in enumerate(text.splitlines(), 1):
                for char in line:
                    if not char.isspace():
                        chars.append(char)
                        line_map.append(line_no)
            joined = ''.join(chars)
            for match in re.finditer(r'[^，。；！？：「」『』《》]+', joined):
                clause = match.group()
                normalized = plain(clause)
                if 5 <= len(normalized) <= 48:
                    self.units.append({'page': int(page), 'line': line_map[match.start()],
                                       'text': clause, 'plain': normalized, 'phonetics': phonetics(normalized)})

    @classmethod
    def from_context(cls, context):
        parts = re.split(r'=== 《善顯密意疏》第 (\d+) 頁 ===\n', context)
        return cls({int(parts[i]): parts[i + 1] for i in range(1, len(parts) - 1, 2)})

    def retrieve(self, text, limit=4):
        query = phonetics(plain(text))
        found = []
        for unit in self.units:
            tokens = unit['phonetics']
            match = SequenceMatcher(None, tokens, query, autojunk=False).find_longest_match()
            if match.size < 3:
                continue
            origin = match.b - match.a
            best = 0
            for shift in range(-2, 3):
                start = max(0, origin + shift)
                window = query[start:start + len(tokens)]
                if window:
                    best = max(best, 1 - distance(tokens, window) / max(len(tokens), len(window)))
            if best >= .72:
                found.append({k: unit[k] for k in ('page', 'line', 'text')} | {'score': round(best, 4)})
        return sorted(found, key=lambda hit: (-hit['score'], hit['page'], hit['line']))[:limit]

    def propose_patches(self, text, hits):
        # 僅處理音節完全相同且有完整短句依據的窗口；保留每次重複。
        indices = [i for i, char in enumerate(text) if re.match(r'[\u3400-\u9fff]', char)]
        chinese = ''.join(text[i] for i in indices)
        tokens = phonetics(chinese)
        proposals = []
        occupied = set()
        for hit in hits:
            target = plain(hit['text'])
            if not re.fullmatch(r'[\u3400-\u9fff]{5,20}', target):
                continue
            wanted = phonetics(target)
            for pos in range(len(tokens) - len(wanted) + 1):
                if tokens[pos:pos + len(wanted)] != wanted:
                    continue
                start, end = indices[pos], indices[pos + len(wanted) - 1] + 1
                before = text[start:end]
                if (before == target or not re.fullmatch(r'[\u3400-\u9fff]+', before)
                        or sum(a == b for a, b in zip(before, target)) < 2
                        or any(i in occupied for i in range(start, end))):
                    continue
                proposals.append({'start': start, 'end': end, 'before': before,
                                  'after': target, 'evidence': hit['text']})
                occupied.update(range(start, end))
        return proposals
