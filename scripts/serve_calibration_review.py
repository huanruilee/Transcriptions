#!/usr/bin/env python3
"""Read-only loopback server with single byte ranges for accurate MP3 seeking."""
import argparse,os,re
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):self.send_header('Accept-Ranges','bytes');super().end_headers()
    def send_head(self):
        self.byte_range=None
        value=self.headers.get('Range');path=self.translate_path(self.path)
        if not value or not os.path.isfile(path):return super().send_head()
        size=os.path.getsize(path);match=re.fullmatch(r'bytes=(\d*)-(\d*)',value.strip())
        try:
            if not match or not size or not any(match.groups()):raise ValueError()
            first,last=match.groups()
            if first:start=int(first);end=min(int(last),size-1)if last else size-1
            else:
                count=int(last)
                if count<=0:raise ValueError()
                start=max(0,size-count);end=size-1
            if start>=size or end<start:raise ValueError()
        except ValueError:
            self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.send_header('Content-Length','0');self.end_headers();return None
        try:stream=open(path,'rb')
        except OSError:self.send_error(404);return None
        self.byte_range=(start,end);self.send_response(206);self.send_header('Content-Type',self.guess_type(path));self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.send_header('Content-Length',str(end-start+1));self.end_headers();return stream
    def copyfile(self,source,outputfile):
        try:
            if self.byte_range is None:return super().copyfile(source,outputfile)
            start,end=self.byte_range;source.seek(start);remaining=end-start+1
            while remaining:
                data=source.read(min(65536,remaining))
                if not data:break
                outputfile.write(data);remaining-=len(data)
        except(BrokenPipeError,ConnectionResetError):pass # Media clients cancel old ranges when seeking.
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--port',type=int,default=4192);a=p.parse_args();ThreadingHTTPServer(('127.0.0.1',a.port),partial(RangeHandler,directory=a.root)).serve_forever()
