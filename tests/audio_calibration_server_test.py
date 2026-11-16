import importlib.util,unittest,tempfile,threading,functools,urllib.request,urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
spec=importlib.util.spec_from_file_location('server',Path(__file__).resolve().parents[1]/'scripts/serve_calibration_review.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_byte_range_support_is_required_for_exact_audio_seek(self):
  with tempfile.TemporaryDirectory()as root:
   Path(root,'test.mp3').write_bytes(b'abcdefgh');Path(root,'empty.mp3').write_bytes(b'')
   server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(m.RangeHandler,directory=root));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}'
   try:
    with urllib.request.urlopen(urllib.request.Request(base+'/test.mp3',headers={'Range':'bytes=2-5'}))as r:self.assertEqual(r.status,206);self.assertEqual(r.headers['Content-Range'],'bytes 2-5/8');self.assertEqual(r.read(),b'cdef')
    with urllib.request.urlopen(urllib.request.Request(base+'/test.mp3',headers={'Range':'bytes=-2'}))as r:self.assertEqual(r.read(),b'gh')
    with urllib.request.urlopen(base+'/test.mp3')as r:self.assertEqual(r.status,200);self.assertEqual(r.headers['Accept-Ranges'],'bytes');self.assertEqual(r.read(),b'abcdefgh')
    for path,byte_range in [('/test.mp3','bytes=99-100'),('/empty.mp3','bytes=0-1')]:
     with self.assertRaises(urllib.error.HTTPError)as e:urllib.request.urlopen(urllib.request.Request(base+path,headers={'Range':byte_range}))
     self.assertEqual(e.exception.code,416)
   finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
