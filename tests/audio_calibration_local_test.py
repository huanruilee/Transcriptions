import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('local',Path(__file__).resolve().parents[1]/'scripts/build_local_calibration_alternatives.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_recovers_reordered_sentence_from_real_word_boundaries(self):
  words=[{'word':'現在這個例子都是煩惱','start':10,'end':16},{'word':'之前那個例子分成正確及顛倒認知','start':20,'end':28}]
  r=m.align_local('之前那個例子分成正確及顛倒認知',words,0,30,normalizer=lambda t:t)
  self.assertEqual((r['start'],r['end']),(20,28));self.assertEqual(r['matchedCharacters'],len('之前那個例子分成正確及顛倒認知'))
 def test_never_uses_old_time_or_interpolates_missing_text(self):
  r=m.align_local('完全沒有對應語音', [{'word':'其他內容','start':10,'end':15}],0,30,normalizer=lambda t:t)
  self.assertIsNone(r['start']);self.assertIsNone(r['end'])
 def test_repeated_short_answer_is_ambiguous(self):
  r=m.align_local('是',[{'word':'是','start':10,'end':11},{'word':'是','start':20,'end':21}],0,30,normalizer=lambda t:t)
  self.assertTrue(r['ambiguous'])
if __name__=='__main__':unittest.main()
