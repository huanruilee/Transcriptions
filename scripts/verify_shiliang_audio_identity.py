import subprocess,numpy as np,json,hashlib
from pathlib import Path

def pcm(path,t):
    raw=subprocess.check_output(['ffmpeg','-v','error','-ss',str(t),'-i',str(path),'-t','8','-ar','8000','-ac','1','-f','f32le','-'])
    return np.frombuffer(raw,dtype='<f4').astype(np.float64)
results=[]
for sid in ('30','31'):
    official=Path(f'work/audio-calibration/{sid}-drive.audio'); runtime=Path(f'work/audio-calibration/{sid}-gpu.mp3')
    info=json.load(open(f'work/audio-calibration/{sid}.info.json'))
    checks=[]
    for t in (100,1300,2600,3900,info['duration']-45):
        a=pcm(official,t);b=pcm(runtime,t);a-=a.mean();b-=b.mean()
        n=min(len(a),len(b));a=a[:n];b=b[:n]
        size=1<<(2*n-1).bit_length();corr=np.fft.irfft(np.fft.rfft(a,size)*np.conj(np.fft.rfft(b,size)),size)
        lags=np.arange(-800,801);vals=corr[lags%size];lag=int(lags[np.argmax(vals)])
        if lag>=0: aa=a[lag:];bb=b[:n-lag]
        else: aa=a[:n+lag];bb=b[-lag:]
        similarity=float(np.dot(aa,bb)/np.sqrt(np.dot(aa,aa)*np.dot(bb,bb)))
        checks.append({'seconds':t,'lagSeconds':lag/8000,'correlation':round(similarity,6)})
    result={'session':sid,'videoId':info['id'],'youtubeDuration':info['duration'],'officialAudioSha256':'sha256:'+hashlib.sha256(official.read_bytes()).hexdigest(),'runtimeAudioSha256':'sha256:'+hashlib.sha256(runtime.read_bytes()).hexdigest(),'officialLinkPresentInVideoDescription':('124EVflDzP3_lAKT1Lak_q_PKiizyOtPO' if sid=='30' else '1Ie5xyNY7d4h7n_F8YF-r15m2F5EaNCmO') in info['description'],'checks':checks,'verified':all(c['correlation']>=.9 and abs(c['lagSeconds'])<=.05 for c in checks)}
    results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
Path('work/audio-calibration/audio-identity.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
