import unittest
from pathlib import Path
import tempfile
import json
import sys

repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root))

from scripts.lib.prompt_factory import (
    load_course_metadata,
    resolve_master_attribution,
    resolve_course_title,
    build_whisper_prompt,
    build_proofread_system_prompt,
    build_reference_view_note,
)

class TestPromptFactory(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.course_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_san_zhu_yao_dao_attribution(self):
        san_zhu_path = repo_root / "courses" / "三主要道"
        if san_zhu_path.exists():
            master = resolve_master_attribution(san_zhu_path)
            self.assertEqual(master, "如性法師")
            
            note = build_reference_view_note(san_zhu_path)
            self.assertIn("如性法師", note)
            self.assertNotIn("見悲青增", note)

    def test_pusa_attribution(self):
        pusa_path = repo_root / "courses" / "菩薩就是這樣成佛"
        if pusa_path.exists():
            master = resolve_master_attribution(pusa_path)
            self.assertEqual(master, "智善法師")

    def test_ru_zhong_lun_attribution(self):
        ru_path = repo_root / "courses" / "入中論善顯密意疏"
        if ru_path.exists():
            master = resolve_master_attribution(ru_path)
            self.assertEqual(master, "見悲青增格西")

    def test_dynamic_fallback(self):
        master = resolve_master_attribution(self.course_dir, default_master="自選導師")
        self.assertEqual(master, "自選導師")

        with open(self.course_dir / "course.json", "w", encoding="utf-8") as f:
            json.dump({"title": "測試課程", "master": "法尊法師"}, f)

        master2 = resolve_master_attribution(self.course_dir)
        self.assertEqual(master2, "法尊法師")

        prompt = build_whisper_prompt(self.course_dir, ["因明", "量論"])
        self.assertIn("法尊法師", prompt)
        self.assertIn("測試課程", prompt)
        self.assertIn("因明", prompt)

if __name__ == "__main__":
    unittest.main()
