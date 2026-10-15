#!/usr/bin/env python3
"""Align timestamped transcript sentences to an independently sourced reference transcript."""

import argparse
import bisect
import difflib
import hashlib
import json
import pathlib
import re
import tempfile


SCHEMA = "transcript-reference-alignment/v1"
NORMALIZED_CHAR = re.compile(r"[\u3400-\u9fffA-Za-z0-9]")


def sha256_bytes(value):
    return "sha256:" + hashlib.sha256(value).hexdigest()


def normalize_with_map(value):
    output = []
    mapping = []
    for index, char in enumerate(value):
        if NORMALIZED_CHAR.match(char):
            output.append(char)
            mapping.append(index)
    return "".join(output), mapping


def clean_reference(value):
    lines = []
    for line in value.splitlines():
        stripped = line.strip()
        if re.fullmatch(r"\d+", stripped):
            continue
        if re.fullmatch(r"四念住八[．.]1996/3/15", stripped):
            continue
        lines.append(line)
    return "\n".join(lines)


def transcript_rows(source):
    rows = []
    for paragraph in source.get("paragraphs", []):
        rows.extend(paragraph.get("sentences", []))
    ids = [row.get("id") for row in rows]
    if not rows or any(not isinstance(item, str) or not item for item in ids):
        raise ValueError("source requires non-empty sentence IDs")
    if len(set(ids)) != len(ids):
        raise ValueError("source sentence IDs must be unique")
    if any(not isinstance(row.get("text"), str) for row in rows):
        raise ValueError("source sentence text must be strings")
    return rows


def build_alignment(source, reference_raw):
    rows = transcript_rows(source)
    source_parts = []
    spans = []
    position = 0
    for row in rows:
        normalized, _ = normalize_with_map(row["text"])
        spans.append((position, position + len(normalized)))
        source_parts.append(normalized)
        position += len(normalized)
    source_normalized = "".join(source_parts)
    reference_clean = clean_reference(reference_raw)
    reference_normalized, reference_map = normalize_with_map(reference_clean)
    if not source_normalized or not reference_normalized:
        raise ValueError("source and reference must contain alignable text")

    matcher = difflib.SequenceMatcher(
        None, source_normalized, reference_normalized, autojunk=True
    )
    opcodes = matcher.get_opcodes()
    starts = [item[1] for item in opcodes]

    def boundary(source_position):
        index = max(0, min(bisect.bisect_right(starts, source_position) - 1, len(opcodes) - 1))
        tag, left_start, left_end, right_start, right_end = opcodes[index]
        if source_position < left_start and index > 0:
            tag, left_start, left_end, right_start, right_end = opcodes[index - 1]
        if left_end == left_start:
            return right_start
        if tag == "equal":
            return right_start + max(0, min(source_position - left_start, right_end - right_start))
        ratio = max(0, min(1, (source_position - left_start) / (left_end - left_start)))
        return round(right_start + (right_end - right_start) * ratio)

    items = []
    for row, (source_start, source_end) in zip(rows, spans):
        reference_start = boundary(source_start)
        reference_end = boundary(source_end)
        if reference_end < reference_start:
            reference_start, reference_end = reference_end, reference_start
        if reference_start >= len(reference_map):
            candidate = ""
        else:
            raw_start = reference_map[reference_start]
            raw_end = (
                reference_map[reference_end - 1] + 1
                if reference_end > reference_start and reference_end - 1 < len(reference_map)
                else raw_start
            )
            candidate = re.sub(r"\s+", "", reference_clean[raw_start:raw_end])
        before_normalized, _ = normalize_with_map(row["text"])
        after_normalized, _ = normalize_with_map(candidate)
        similarity = difflib.SequenceMatcher(
            None, before_normalized, after_normalized, autojunk=False
        ).ratio()
        length_ratio = len(after_normalized) / max(1, len(before_normalized))
        items.append({
            "id": row["id"],
            "before": row["text"],
            "after": candidate,
            "similarity": round(similarity, 6),
            "lengthRatio": round(length_ratio, 6),
            "sourceStart": source_start,
            "sourceEnd": source_end,
            "referenceStart": reference_start,
            "referenceEnd": reference_end,
            "boundaryRisk": (
                not (0.67 <= length_ratio <= 1.5)
                or similarity < 0.35
                or not candidate
            ),
        })
    def raw_slice(start, end):
        start = max(0, min(start, len(reference_map)))
        end = max(start, min(end, len(reference_map)))
        if start >= len(reference_map) or end <= start:
            return ""
        raw_start = reference_map[start]
        raw_end = reference_map[end - 1] + 1
        return re.sub(r"\s+", "", reference_clean[raw_start:raw_end])

    clusters = []
    cluster_start = None
    for index, item in enumerate(items + [{"boundaryRisk": False}]):
        if item["boundaryRisk"] and cluster_start is None:
            cluster_start = index
        if not item["boundaryRisk"] and cluster_start is not None:
            cluster_end = index - 1
            left_item = items[cluster_start - 1] if cluster_start > 0 else None
            right_item = items[index] if index < len(items) else None
            core_start = left_item["referenceEnd"] if left_item else 0
            core_end = right_item["referenceStart"] if right_item else len(reference_map)
            if core_end < core_start:
                core_start, core_end = core_end, core_start
            clusters.append({
                "clusterId": f"risk-{len(clusters) + 1:03d}",
                "itemIds": [row["id"] for row in rows[cluster_start:index]],
                "sourceItems": [
                    {"id": row["id"], "text": row["text"]}
                    for row in rows[cluster_start:index]
                ],
                "leftAnchor": (
                    {"id": rows[cluster_start - 1]["id"], "text": left_item["after"]}
                    if left_item else None
                ),
                "rightAnchor": (
                    {"id": rows[index]["id"], "text": right_item["after"]}
                    if right_item else None
                ),
                "referenceStart": core_start,
                "referenceEnd": core_end,
                "referenceText": raw_slice(core_start, core_end),
            })
            cluster_start = None
    return matcher.ratio(), items, clusters


def write_json_atomic(output_path, value):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=output_path.parent, delete=False
    ) as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = pathlib.Path(handle.name)
    temporary.replace(output_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--reference-text", required=True)
    parser.add_argument("--reference-url", required=True)
    parser.add_argument("--reference-pdf")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    source_path = pathlib.Path(args.source)
    reference_path = pathlib.Path(args.reference_text)
    output_path = pathlib.Path(args.output)
    source_bytes = source_path.read_bytes()
    reference_bytes = reference_path.read_bytes()
    source = json.loads(source_bytes)
    reference_raw = reference_bytes.decode("utf-8")
    global_similarity, items, risk_clusters = build_alignment(source, reference_raw)
    changed = sum(item["before"] != item["after"] for item in items)
    boundary_risk = sum(item["boundaryRisk"] for item in items)
    artifact = {
        "schema": SCHEMA,
        "authority": "candidate-only",
        "sourceFileDigest": sha256_bytes(source_bytes),
        "referenceUrl": args.reference_url,
        "referencePdfDigest": (
            sha256_bytes(pathlib.Path(args.reference_pdf).read_bytes())
            if args.reference_pdf else None
        ),
        "referenceTextDigest": sha256_bytes(reference_bytes),
        "algorithm": "python-difflib-sequence-matcher/v1",
        "globalSimilarity": round(global_similarity, 6),
        "itemCount": len(items),
        "changedCount": changed,
        "boundaryRiskCount": boundary_risk,
        "riskClusterCount": len(risk_clusters),
        "riskClusters": risk_clusters,
        "items": items,
    }
    write_json_atomic(output_path, artifact)


if __name__ == "__main__":
    main()
