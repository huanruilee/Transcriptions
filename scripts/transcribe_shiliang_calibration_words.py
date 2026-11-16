import sys,json,time,hashlib,glob,importlib.metadata
from faster_whisper import WhisperModel
model_path=glob.glob('/root/.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo/snapshots/*')[0]
model=WhisperModel(model_path,device='cuda',compute_type='int8')
for sid in ('30','31'):
    p='/tmp/calibration-20261024/'+sid+'.mp3'
    t=time.time()
    segments,info=model.transcribe(p,language='zh',word_timestamps=True,vad_filter=True,beam_size=5,initial_prompt='釋量論第二品，成量品，無我慧，我執，貪瞋，道諦，無間道，解脫道。')
    result=[]
    for seg in segments:
        result.append({'start':seg.start,'end':seg.end,'text':seg.text,'avg_logprob':seg.avg_logprob,'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for w in (seg.words or [])]})
    out={'schema':'acoustic-words/v1','session':sid,'audioSha256':'sha256:'+hashlib.sha256(open(p,'rb').read()).hexdigest(),'duration':info.duration,'model':model_path,'fasterWhisperVersion':importlib.metadata.version('faster-whisper'),'device':'cuda','computeType':'int8','beamSize':5,'wordTimestamps':True,'elapsedSeconds':time.time()-t,'segments':result}
    with open('/tmp/calibration-20261024/'+sid+'.words.json','w') as f:json.dump(out,f,ensure_ascii=False)
    print(sid,len(result),info.duration,time.time()-t,flush=True)
