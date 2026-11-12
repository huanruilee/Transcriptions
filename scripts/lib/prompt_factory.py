"""
Prompt factory for transcription, proofreading, and calibration pipelines.
Dynamically resolves course metadata (title, master/instructor) from course.json
to prevent hardcoding teacher attributions or confusing different courses.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional

def load_course_metadata(course_dir: Path) -> Dict[str, Any]:
    course_json_path = course_dir / "course.json"
    if course_json_path.exists():
        try:
            with open(course_json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data
        except Exception:
            pass
    return {}

def resolve_master_attribution(course_dir: Path, default_master: str = "格西/法師") -> str:
    meta = load_course_metadata(course_dir)
    return (
        meta.get("master")
        or meta.get("lecturer")
        or meta.get("instructor")
        or default_master
    )

def resolve_course_title(course_dir: Path, default_title: Optional[str] = None) -> str:
    meta = load_course_metadata(course_dir)
    return meta.get("title") or (default_title if default_title else course_dir.name)

def build_whisper_prompt(
    course_dir: Path,
    key_terms: Optional[list] = None
) -> str:
    """Builds dynamic initial prompt for Whisper ASR."""
    meta = load_course_metadata(course_dir)
    master = resolve_master_attribution(course_dir, default_master="法師")
    title = resolve_course_title(course_dir)
    
    terms = [master, title]
    if key_terms:
        terms.extend([t for t in key_terms if t not in terms])
        
    terms_str = "、".join(terms)
    return f"以下是{master}講授《{title}》的開示錄音。包含專有名相：{terms_str}。"

def build_proofread_system_prompt(course_dir: Path) -> str:
    """Builds LLM proofreading system prompt adhering to specific master and course."""
    master = resolve_master_attribution(course_dir, default_master="主講法師")
    title = resolve_course_title(course_dir)
    
    return f"""你是一位精通佛學法義與藏傳佛教宗義的資深校對專家。
你正在校對【{master}】講授《{title}》的課堂錄音口述逐字稿。
請嚴格保留講者的口述原意與講課口氣，修正語音識別錯別字與佛學名相，不可隨意篡改或替換為其他傳承之用語。"""

def build_reference_view_note(course_dir: Path) -> str:
    """Builds standard reference view note attributed correctly to the course master."""
    master = resolve_master_attribution(course_dir, default_master="主講法師")
    return f"{master}依傳承清淨開闡顯密圓滿之道次第。"
