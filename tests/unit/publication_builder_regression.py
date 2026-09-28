"""Executable contracts; BUILDER_PATH permits replay against historical source."""
import ast
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(os.environ.get('BUILDER_PATH', Path(__file__).resolve().parents[2] / 'scripts/build_study_group_publication.py'))
spec = importlib.util.spec_from_file_location('publication_builder', SOURCE)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def segments(*texts):
    return [dict(id=f's{i}', start=i, end=i+1, text=text, rawText=text) for i, text in enumerate(texts)]


class PublicationBuilderContracts(unittest.TestCase):
    def test_complete_traditional_and_simplified_endings(self):
        for closing in ['願成善師赦受命', '願成善事設受醫', '愿成善事设受医', '愿成善事设寿因', '願成善逝受持義']:
            with self.subTest(closing=closing):
                original = segments('正文', closing + '。謝謝大家', '尾端循環' * 10)
                result = builder.trim_after_dedication(original)
                self.assertEqual([s['text'] for s in result], ['正文', closing + '。'])
                self.assertEqual(original[1]['text'], closing + '。謝謝大家')

    def test_playlist_11_original_simplified_asr_excludes_repeated_tail(self):
        path = Path(__file__).resolve().parents[2] / 'reviews/evidence/study-group-2025/playlist-11/candidate.json'
        original = json.loads(path.read_text())["segments"]
        result = builder.trim_after_dedication(original)
        self.assertEqual(result[-1]["id"], 'seg-4632')
        self.assertEqual(result[-1]["text"], '愿成善事设寿因')
        self.assertNotIn('seg-4633', [segment['id'] for segment in result])

    def test_split_dedication_preserves_sentence_ids_and_timestamps(self):
        original = segments('正文', '愿成善事设', '受应。尾端闲聊', '重複' * 10)
        before = copy.deepcopy(original)
        result = builder.trim_after_dedication(original)
        self.assertEqual([s['text'] for s in result], ['正文', '愿成善事设', '受应。'])
        self.assertEqual([(s['id'], s['start'], s['end']) for s in result], [('s0', 0, 1), ('s1', 1, 2), ('s2', 2, 3)])
        self.assertEqual(original, before)
        paragraphs = [dict(id='p0', start=0, end=2, sentences=original[:2]), dict(id='p1', start=2, end=4, sentences=original[2:])]
        trimmed = builder.trim_paragraphs_after_dedication(paragraphs)
        self.assertEqual([s['id'] for p in trimmed for s in p['sentences']], ['s0', 's1', 's2'])
        self.assertEqual(trimmed[-1]['end'], 3)

    def test_raw_text_is_not_sliced_using_corrected_text_offsets(self):
        original = segments('願成善事設受醫。謝謝大家', 'tail')
        original[0]['rawText'] = '原始辨識有比較長的前綴 愿成善事设受医 谢谢'
        result = builder.trim_after_dedication(original)
        self.assertEqual(result[0]['rawText'], original[0]['rawText'])

    def test_no_marker_and_incomplete_marker_are_unchanged(self):
        for values in [('這裡是正文', '謝謝大家'), ('願成善', '正文沒有結尾標記')]:
            original = segments(*values)
            self.assertEqual(builder.trim_after_dedication(original), original)

    def test_last_complete_dedication_wins(self):
        original = segments('願成善逝受持義。', '正文', '愿成善事设寿因', '謝謝')
        result = builder.trim_after_dedication(original)
        self.assertEqual([s['id'] for s in result], ['s0', 's1', 's2'])
        self.assertEqual(result[-1]['text'], '愿成善事设寿因')

    def test_help_and_invalid_arguments_never_enter_mutating_main(self):
        # Keep the real CLI entrypoint but instrument main in a disposable copy.
        # The no-argument control proves this detects execution, even when a real
        # build would merely rewrite identical bytes or fail before its first write.
        tree = ast.parse(SOURCE.read_text())
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == 'main':
                node.body = ast.parse("Path(__file__).with_name('build-entered').write_text('mutated')").body
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / 'scripts' / 'builder.py'
            script.parent.mkdir()
            script.write_text(ast.unparse(ast.fix_missing_locations(tree)))
            artifact = Path(tmp) / 'course.json'
            artifact.write_text('{"sentinel": true}')
            def snapshot():
                return {str(p.relative_to(tmp)): (hashlib.sha256(p.read_bytes()).hexdigest(), p.stat().st_mtime_ns) for p in Path(tmp).rglob('*') if p.is_file()}
            for args, status in [(['--help'], 0), (['--unknown-option'], 2)]:
                before = snapshot()
                run = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True)
                self.assertEqual(snapshot(), before, run.stderr)
                self.assertEqual(run.returncode, status, run.stderr)
                self.assertIn('usage:', run.stdout + run.stderr)
            run = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertTrue(script.with_name('build-entered').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
