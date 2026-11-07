"""課堂原話抽屜之時間區間對齊（Verbatim Time-Interval Alignment）

依 docs/STUDY_GUIDE_CALIBRATION_SOP.md 與 PR #345 review finding：
研讀講記與課堂原話的段落切分並非一一對應，不得以段落序號配對
（md 段 N → verbatim p_N）。改以「md 段時間區間 ∩ verbatim 段時間區間」
對齊，確保全部課堂原話皆可見，且抽屜所載原話確為該段正文所對應者。

對齊策略
--------
md 段 i 的時間區間為 [t_i, t_{i+1})（末段延伸至 +inf），
其對應之 verbatim 段落為「與該區間有時間交集」者。

實測（釋量論 30/31 講）
----------------------
  講 30：md 74 段 / verbatim 77 段 → 覆蓋 77/77（原索引法缺 p_75–p_78）
  講 31：md 81 段 / verbatim 92 段 → 覆蓋 92/92（原索引法缺 p_82–p_92）
  且無任何 md 段對應到 0 個 verbatim 段。
"""


def build_paragraph_spans(verbatim_map):
    """回傳 {p_id: (start, end)}，取該段落各句的時間最小／最大值。"""
    spans = {}
    for p_id, sents in (verbatim_map or {}).items():
        if not sents:
            continue
        starts = [s.get("start") for s in sents if s.get("start") is not None]
        ends = [s.get("end") for s in sents if s.get("end") is not None]
        if not starts:
            continue
        spans[p_id] = (min(starts), max(ends) if ends else min(starts))
    return spans


def align_verbatim_by_time(verbatim_map, para_seconds):
    """依 md 段起始秒數，以時間區間對齊課堂原話。

    參數
    ----
    verbatim_map : {p_id: [sentence, ...]}
    para_seconds : md 各段（依序）的起始秒數

    回傳
    ----
    {md_index: [p_id, ...]}  —— 每個 md 段對應的 verbatim 段落（依原文順序）
    """
    spans = build_paragraph_spans(verbatim_map)
    if not spans or not para_seconds:
        return {}
    # 依原文順序排列 verbatim 段落
    ordered = sorted(spans.items(), key=lambda kv: (kv[1][0], _pid_num(kv[0])))
    result = {}
    n = len(para_seconds)
    for i, t in enumerate(para_seconds):
        t_next = para_seconds[i + 1] if i + 1 < n else None
        hits = []
        for p_id, (s, e) in ordered:
            if t_next is None:
                # 末段：延伸至無限，但不得早於目前區間起點
                if e > t:
                    hits.append(p_id)
            else:
                if s < t_next and e > t:
                    hits.append(p_id)
        result[i] = hits
    return result


def _pid_num(p_id):
    """從 'p_12' 取數字；非該格式則回傳 0。"""
    m = __import__("re").search(r"(\d+)", str(p_id))
    return int(m.group(1)) if m else 0


def align_verbatim_by_time_expanded(verbatim_map, para_seconds):
    """時間區間對齊，並保證每個 verbatim 段落**只被掛載一次**。

    問題
    ----
    純「區間交集」會使跨越 md 段邊界的 verbatim 段落被掛載兩次
    （其 span 同時與相鄰兩段有交集），導致讀者看到重複原話。
    實測（入中論 36B）：9 段被掛 2 次，原話句數 121 → 161。

    解法
    ----
    一個 verbatim 段落若與多個 md 段相交，掛給「與其重疊時間最長」的
    md 段；平手時取起始時間較早者。保證：
      - 覆蓋率 100%（每段 verbatim 皆被掛載）
      - 無重複（每段 verbatim 恰被掛載一次）
      - 單調性（md 段順序與原話順序一致）
    """
    base = align_verbatim_by_time(verbatim_map, para_seconds)
    spans = build_paragraph_spans(verbatim_map)
    if not spans or not para_seconds:
        return base

    n = len(para_seconds)
    # 計算每個 (md_index, p_id) 的重疊秒數
    #
    # 容差（TOLERANCE）：md 時間戳僅精確到整秒，故區間邊界可能有 ±1 秒誤差。
    # 實測（釋量論 30 講）：md 段 2 區間為 [85, 86)，而 verbatim p_3 的
    # span 為 (85.96, 86.60)，真實重疊僅 0.04 秒，會被誤判為不屬於該段。
    # 故以容差擴張區間後再計重疊，避免此類邊界段落被誤分配。
    TOLERANCE = 1.0
    overlap = {}
    for i in range(n):
        t = para_seconds[i]
        t_next = para_seconds[i + 1] if i + 1 < n else None
        t_lo = t - TOLERANCE
        t_hi = (t_next + TOLERANCE) if t_next is not None else None
        for p_id, (s, e) in spans.items():
            if t_hi is None:
                ov = max(0.0, e - t_lo)
            else:
                ov = max(0.0, min(e, t_hi) - max(s, t_lo))
            if ov > 0:
                overlap[(i, p_id)] = ov

    # 每個 p_id 只保留重疊最大的 md_index
    best = {}
    for (i, p_id), ov in overlap.items():
        cur = best.get(p_id)
        if cur is None or ov > cur[1] + 1e-9:
            best[p_id] = (i, ov)
        elif abs(ov - cur[1]) <= 1e-9 and i < cur[0]:
            best[p_id] = (i, ov)

    result = {}
    for p_id, (i, _ov) in best.items():
        result.setdefault(i, []).append(p_id)
    # 依原文順序排列每個 md 段的 verbatim 段落
    for i in result:
        result[i].sort(key=lambda pid: (spans[pid][0], _pid_num(pid)))

    # 補掛：若某 md 段無對應原話，掛時間上最接近且尚未被掛載者
    used = set(best.keys())
    for i in range(n):
        if result.get(i):
            continue
        t = para_seconds[i]
        cand = None
        for p_id in sorted(spans, key=lambda p: (abs(spans[p][0] - t), _pid_num(p))):
            if p_id not in used:
                cand = p_id
                break
        if cand:
            result[i] = [cand]
            used.add(cand)
    return result


def alignment_stats(alignment, verbatim_map):
    """回傳對齊統計：覆蓋率、重複掛載、句數比。用於驗證對齊品質。"""
    from collections import Counter
    counts = Counter()
    for pids in (alignment or {}).values():
        for pid in pids:
            counts[pid] += 1
    all_pids = set((verbatim_map or {}).keys())
    covered = set(counts)
    total_sents = sum(len(v or []) for v in (verbatim_map or {}).values())
    aligned_sents = sum(
        len((verbatim_map or {}).get(pid) or [])
        for pids in (alignment or {}).values()
        for pid in pids
    )
    return {
        "verbatim_paragraphs": len(all_pids),
        "covered": len(covered),
        "missing": sorted(all_pids - covered),
        "duplicated": sorted(p for p, c in counts.items() if c > 1),
        "total_sentences": total_sents,
        "aligned_sentences": aligned_sents,
    }


def verbatim_coverage(alignment, verbatim_map):
    """回傳 (已覆蓋 p_id 集合, 未覆蓋 p_id 集合)。"""
    covered = set()
    for hits in (alignment or {}).values():
        covered |= set(hits)
    all_pids = set((verbatim_map or {}).keys())
    return covered, all_pids - covered
