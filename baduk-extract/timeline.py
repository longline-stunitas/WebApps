"""영상의 바둑판 변화를 시간순 사건(놓기/되돌리기/판 변경)으로 만들고 해설(stt.json)에 매핑한다.

사용법: python timeline.py <영상.mp4> <작업폴더>   (작업폴더에 stt.json 이 있어야 함)
"""
import json
import sys
from collections import Counter

from board import name, play, read_states

if len(sys.argv) != 3:
    raise SystemExit(__doc__)
video, out = sys.argv[1], sys.argv[2]
states = read_states(video)

# drop cursor-occlusion flicker: a stone "vanishes" into a never-seen board, then the same board returns
clean=[states[0]]; seen={states[0][1]}; k=1; dropped=0
while k<len(states):
    t,s=states[k]; last=clean[-1][1]
    gone=[i for i in range(361) if last[i]!=s[i]]
    if s not in seen and 0<len(gone)<=2 and all(s[i]=='.' for i in gone):
        ret=next((m for m in range(k+1,min(k+6,len(states))) if states[m][1]==last and states[m][0]-t<15),None)
        if ret is not None: dropped+=ret-k+1; k=ret+1; continue
    clean.append(states[k]); seen.add(s); k+=1
states=clean
print('flicker states dropped',dropped)
KO={'B':'흑','W':'백'}
# position before video move 1 (the video opens with black 1 at C18 already on the board)
c18=1*19+2
first=states[0][1]; assert first[c18]=='B'
base=first[:c18]+'.'+first[c18+1:]
num={base:0, first:1}; hist=[base,first]
ev=[{'t':0.0,'kind':'move','moves':[[1,'B',c18,True]],'board':first}]
prev=first
for t,s in states[1:]:
    if s==prev: continue
    n=num.get(prev)
    e={'t':round(t,1),'board':s}
    one=[i for i in range(361) if s[i]!='.' and prev[i]!=s[i] and play(prev,i,s[i])==s]
    added=[i for i in range(361) if s[i]!='.' and prev[i]!=s[i]]
    only_add=all(prev[i]=='.' or prev[i]==s[i] for i in range(361))
    if one:
        k=None if n is None else n+1
        e.update(kind='move',moves=[[k,s[one[0]],one[0],True]]); num.setdefault(s,k)
    elif s in hist:
        idx=len(hist)-1-hist[::-1].index(s); del hist[idx+1:]
        e.update(kind='back',to=num.get(s))
    elif only_add and len(added)<=6:
        turn='W' if s.count('B') and prev!=base else 'B'
        last=next((m for x in reversed(ev) if x['kind']=='move' for m in [x['moves'][-1]]),None)
        turn='B' if prev==base or (last and last[1]=='W') else 'W'
        rest=added[:]; mv=[]; k=n
        while rest:
            i=next((i for i in rest if s[i]==turn),rest[0]); rest.remove(i)
            k=None if k is None else k+1; mv.append([k,s[i],i,False]); turn='W' if s[i]=='B' else 'B'
        e.update(kind='move',moves=mv); num.setdefault(s,k)
    else:
        e.update(kind='change',add=[[s[i],i] for i in added],remove=[i for i in range(361) if prev[i]!='.' and s[i]=='.'])
    if s not in hist: hist.append(s)
    ev.append(e); prev=s
def desc(e):
    if e['kind']=='move':
        return ' → '.join(f"{(str(k)+'.') if k is not None else ''}{KO[c]} {name(i)}{'' if ok else '(순서추정)'}" for k,c,i,ok in e['moves'])
    if e['kind']=='back':
        return '⏪ 시작 모양으로' if e['to']==0 else (f"⏪ {e['to']}수까지 되돌림" if e['to'] is not None else '⏪ 앞 모양으로 되돌림')
    return f"🔄 판 변경 (+{len(e['add'])} / -{len(e['remove'])})"
stt=json.load(open(out+'/stt.json',encoding='utf-8'))
def clock(t): return f"{int(t)//60}:{int(t)%60:02d}"
md=['# 화점정석 #4 — 해설·수순 시간순 매핑','','영상: https://www.youtube.com/watch?v=bz67s5mESSY','']
j=0; empty=0
for a,seg in enumerate(stt):
    end=stt[a+1]['s'] if a+1<len(stt) else 1e9
    got=[]
    while j<len(ev) and ev[j]['t']<end: got.append(ev[j]); j+=1
    md.append(f"**[{clock(seg['s'])}]** {seg['t']}")
    for e in got: md.append(f"- `{clock(e['t'])}` {desc(e)}")
    md.append('')
open(out+'/timeline.md','w',encoding='utf-8').write('\n'.join(md))
json.dump({'events':ev,'speech':stt},open(out+'/timeline.json','w',encoding='utf-8'),ensure_ascii=False)
c=Counter(e['kind'] for e in ev); mv=[m for e in ev if e['kind']=='move' for m in e['moves']]
print(c,'stones placed',len(mv),'order guessed',sum(not m[3] for m in mv),'speech segments',len(stt))
