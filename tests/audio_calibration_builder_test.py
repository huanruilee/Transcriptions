import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('builder',Path(__file__).resolve().parents[1]/'scripts/build_audio_calibration_candidate.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class CalibrationTests(unittest.TestCase):
    def build(self,text,words):
        source={'youtubeVideoId':'video','paragraphs':[{'sentences':[{'id':'s1','text':text,'start':999,'end':1000}]}]}
        evidence={'audioSha256':'sha256:audio','duration':30,'model':'fixed','fasterWhisperVersion':'1','segments':[{'words':words}]}
        return b.build(source,evidence,'source','evidence',normalizer=lambda t:t)['items'][0]
    def test_uses_acoustic_bounds_not_source_or_interpolation(self):
        result=self.build('甲乙丙丁',[{'word':'甲乙','start':2,'end':4},{'word':'丙丁','start':7,'end':9}])
        self.assertEqual((result['start'],result['end']),(2,9)); self.assertEqual(result['status'],'aligned')
    def test_no_match_is_review_without_fabricated_timestamp(self):
        result=self.build('甲乙丙丁',[{'word':'完全不同','start':2,'end':4}])
        self.assertIsNone(result['start']);self.assertIsNone(result['end']);self.assertEqual(result['status'],'review')
    def test_missing_edge_is_not_filled_from_old_times(self):
        result=self.build('甲乙丙丁戊己庚辛壬癸',[{'word':'丁戊己庚辛壬癸','start':2,'end':4}])
        self.assertIn('unmatched-edge',result['risks']);self.assertEqual(result['start'],2)
if __name__=='__main__':unittest.main()
