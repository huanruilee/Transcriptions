#!/usr/bin/env node
// Emit a reviewable patch; never mutate published artifacts itself.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const relative='courses/入中論善顯密意疏/publications/lecture_36A_study_guide.md';
const file=path.join(root,relative);
const session=JSON.parse(fs.readFileSync(path.join(root,'courses/入中論善顯密意疏/sessions/session_36A.json')));
const original=fs.readFileSync(file,'utf8');
const utterances=new Map(session.paragraphs.flatMap(p=>p.verbatimSentences).map(s=>[s.id,s.text]));
const changes=[
 ['一旦心有所住、有了實執，自然就會衍生出貪瞋等一切煩惱，就像被煩惱毒蛇咬到一樣，後續的種種生死痛苦就無法避免了。','一旦心有所住、有了執著，就會有苦的產生；這裡以被煩惱毒蛇所咬來作比喻。',['p2-v2','p2-v3'],'只保留原話所說的執著與苦，不補列一切煩惱。'],
 ['釋迦牟尼佛最初六年苦行','釋迦牟尼佛苦行',['p4-v1'],'刪除原話未說的年限，並不否定佛傳史實。'],
 ['那是「戒學」方面的中道','老師說那可以說是「戒學」方面的中道',['p4-v2'],'保留可以說是的語氣。'],
 ['修定時遠離昏沉與掉舉，是「定學」方面的中道','老師又以遠離掉舉等說明「定學」方面的中道',['p4-v4'],'原話此句重複掉舉，未聽核前不補昏沉。'],
 ['佛陀捨棄苦行而悟道是戒學中庸，遠離昏沉掉舉是定學中庸','課堂以佛陀苦行後證悟談戒學中庸，並以遠離掉舉等談定學中庸',['p4-v1','p4-v2','p4-v4'],'導讀與正文一致，不補原話未明名相。'],
 ['（格西與學員核對法尊法師譯文斷句：「芽雖現有，種子［續流］亦必間斷無疑」，次句「芽雖現有，於種子［相續不］間斷全無益故」。）','（課堂斷句討論，非底本改字：學員提出「種子續流」及「種子相續不間斷」的讀法，格西與學員反覆核對「間斷／不間斷」。上引底本文字不據此改寫。）',['p9-v6','p9-v7'],'區分底本引文與課堂討論，不把補字包裝為定本。'],
 ['（其中「動搖」與「自性離」的微細語義格西於下節課 36B 進一步補充）','（格西對「離動搖」的解釋仍有疑問，表示以後再說）',['p15-v1','p15-v3'],'不預告下一講未核實內容，保留現場疑問。'],
 ['宗大師把《入中論釋》引經的第四個正理直接歸入第一個科判裡面','課堂推測《入中論釋》引經的第四個正理可能被歸入第一個科判，這個歸屬尚待核對',['p18-v3'],'原話好像、感覺不能提升為定論。'],
 ['（即《四部宗義》所列第四正理，宗大師將其收入「未一」末段）','（課堂推測可能相當於《四部宗義》所列第四正理，並可能收入「未一」末段；尚待核對）',['p18-v3','p26-v2'],'導讀同步保留原話不確定性。'],
 ['可是不論是應成派還是自續派，都共同承認','格西說應成派與自續派應該都共同認同',['p20-v4'],'保留應該，不把共同前提寫成無保留判定。'],
 ['（這就是《四部宗義》所列破自相的第四個正理──','（課堂推測這可能就是《四部宗義》所列破自相的第四個正理──',['p26-v1','p26-v2'],'原話明說沒有好好看、不確定。'],
 ['如果像自續派或唯識宗所說，諸法具有自相之體性','如果諸法具有自相之體性',['p27-v5','p27-v6'],'此處推論先不加入原話本段未明指的宗派。'],
 ['針對這種認為「瓶以瓶空才是自空」的奇特說法，宗大師在接下來的第 114 頁會有非常精采的破斥。','以上討論是為了釐清自空與他空的概念；格西再以「瓶子自性空就是自空」說明自己的用法。',['p29-v9','p29-v10'],'不補寫未說的下講破斥與評語。'],
 ['（《四部宗義》所列第四正理：經說無自相應不合理）','（課堂推測可能相當於《四部宗義》所列第四正理，尚待核對）',['p18-v3','p26-v2'],'宗旨提要亦不確定化為定論。'],
];
let result=original;
const ledger=[];
for(const [before,after,ids,reason] of changes){
 const count=result.split(before).length-1;
 if(count!==1)throw Error(`Expected exactly one occurrence, got ${count}: ${before}`);
 const evidence=ids.map(id=>{if(!utterances.has(id))throw Error(`Unknown evidence ${id}`);return {id,text:utterances.get(id)};});
 result=result.replace(before,after);ledger.push({before,after,evidence,reason,decision:'adopt-conservative-revision'});
}
const notice='> 校稿試點：整理講記為 AI 輔助編輯，並非逐字原音；時間碼為段內估算。課堂原話保留既有時間錨點，模型聲學比對不等於人工聽核；不確定處請對照原音覆核。';
const edited=result;
result=result.replace('\n---\n',`\n${notice}\n\n---\n`);
ledger.push({decision:'reader-notice',after:notice,reason:'不宣稱時間碼精準或已人工聽核。'});
const beforeLines=original.split('\n'),afterLines=edited.split('\n');
if(beforeLines.length!==afterLines.length)throw Error('Unexpected line restructuring');
const hunks=beforeLines.flatMap((line,i)=>line===afterLines[i]?[]:[`@@\n-${line}\n+${afterLines[i]}`]);
const tip=beforeLines.find(l=>l.startsWith('> 💡'));
hunks.unshift(`@@\n ${tip}\n+\n+${notice}`);
const patch=`*** Begin Patch\n*** Update File: ${file}\n${hunks.join('\n')}\n*** End Patch`;
const digest=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
console.log(JSON.stringify({patch,ledger:{schema:'session36a-content-adjudication/v1',authority:'source-grounded editorial decisions; not human audio certification',sourceDigest:digest(fs.readFileSync(path.join(root,'courses/入中論善顯密意疏/sessions/session_36A.json'))),markdownBefore:digest(original),markdownAfter:digest(result),changes:ledger}}));
