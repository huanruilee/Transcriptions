import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  listTranscriptSentences,
  validateProofreadingCandidate,
} from '../../scripts/lib/transcriptProofreadingPipeline.js';

const source = JSON.parse(readFileSync(
  'reviews/evidence/transcript_proofreading/production/四念住/runs/e153a10f-c521-44b3-b300-82cd349bb207/session_08.pre-promotion-source.json',
  'utf8',
));
const candidate = JSON.parse(readFileSync(
  'reviews/evidence/transcript_proofreading/production/四念住/session_08.final-candidate.json', 'utf8',
));
const ledger = JSON.parse(readFileSync(
  'reviews/evidence/transcript_proofreading/production/四念住/session_08.final-ledger.json', 'utf8',
));
const completion = JSON.parse(readFileSync(
  'reviews/evidence/transcript_proofreading/production/四念住/session_08.final-complete.json', 'utf8',
));

function byId(document) {
  return new Map(listTranscriptSentences(document).map((item) => [item.id, item.text]));
}

test('session 08 final candidate remains structurally valid and self-attested', () => {
  const validation = validateProofreadingCandidate({ source, candidate, ledger });
  assert.deepEqual(validation, { valid: true, errors: [] });
  assert.deepEqual(completion.validation, validation);
  assert.equal(listTranscriptSentences(candidate).length, 2136);
});

test('session 08 final candidate has an immutable runId snapshot', () => {
  const runRoot = path.join(
    'reviews/evidence/transcript_proofreading/production/四念住/runs', completion.runId,
  );
  const pairs = [
    ['session_08.final-candidate.json', candidate],
    ['session_08.final-ledger.json', ledger],
    ['session_08.final-review-queue.json', JSON.parse(readFileSync(
      'reviews/evidence/transcript_proofreading/production/四念住/session_08.final-review-queue.json', 'utf8',
    ))],
    ['session_08.final-complete.json', completion],
  ];
  for (const [filename, latest] of pairs) {
    assert.deepEqual(JSON.parse(readFileSync(path.join(runRoot, filename), 'utf8')), latest, filename);
  }
});

test('session 08 final candidate preserves paired punctuation balance', () => {
  const text = listTranscriptSentences(candidate).map((item) => item.text).join('');
  for (const [open, close] of [['「', '」'], ['《', '》'], ['〈', '〉'], ['（', '）']]) {
    assert.equal([...text].filter((character) => character === open).length,
      [...text].filter((character) => character === close).length,
      `${open}${close} must remain balanced`);
  }
});

test('session 08 candidate keeps every edit inside the strict length guard', () => {
  const before = byId(source);
  const after = byId(candidate);
  const exceptions = [];
  for (const [id, text] of after) {
    if (text === before.get(id)) continue;
    const ratio = text.length / Math.max(1, before.get(id).length);
    if (ratio < 0.5 || ratio > 1.6) exceptions.push([id, ratio]);
  }
  assert.deepEqual(exceptions, []);
});

test('session 08 independent-review regressions stay corrected', () => {
  const actual = byId(candidate);
  const expected = {
    'seg-078': '因為佛於循身念住中',
    'seg-085': '佛說不淨相應',
    'seg-105': '這是第一個憺怕路',
    'seg-127': '頷輪齒鬘',
    'seg-128': '頷就是下巴骨',
    'seg-129': '齒鬘也就是齒',
    'seg-130': '但是它像鬘似的',
    'seg-147': '憺怕路的含義',
    'seg-151': '所以叫做憺怕',
    'seg-188': '所以要多分思惟',
    'seg-202': '因此而建立受念住',
    'seg-203': '所以這幾句話是標出來',
    'seg-271': '我們不容易承認的',
    'seg-300': '這個「行」便表示這一切有為法',
    'seg-328': '佛教說一切有為法',
    'seg-329': '都是不長久的',
    'seg-523': '有我見的人',
    'seg-571': '玄奘大師也翻譯《俱舍論》',
    'seg-572': '《俱舍論》上的時間、剎那的計算',
    'seg-583': '你就能夠便於無常斷常顛倒',
    'seg-605': '心是剎那剎那生滅的',
    'seg-606': '就是無常的',
    'seg-607': '法念住',
    'seg-608': '是為欲對治',
    'seg-623': '於無我中計我顛倒',
    'seg-627': '所謂對於無我中計我的錯誤',
    'seg-630': '《阿含經》裡面常常說到無我',
    'seg-637': '《般若經》、《寶積經》、《法華經》',
    'seg-654': '《金剛經》上',
    'seg-731': '就是無我論',
    'seg-732': '所以我們要讀《阿含經》',
    'seg-737': '但是我們從來有有我見等',
    'seg-738': '這個有我見',
    'seg-741': '「見」這個字',
    'seg-756': '這樣的人不可能有這個無我見',
    'seg-759': '那麼也要無我就容易斷掉煩惱',
    'seg-780': '所以於諸蘊中生起我見',
    'seg-785': '有一個我',
    'seg-786': '以於諸法住循法觀',
    'seg-788': '有我見',
    'seg-826': '你就會如實了知所計諸蘊',
    'seg-846': '諸蘊的自相',
    'seg-855': '共相就是無常的',
    'seg-867': '然後你才能修無我觀',
    'seg-868': '你才能修無我觀',
    'seg-958': '佛法附在有我論，流行於世間',
    'seg-925': '橫計有我',
    'seg-967': '這「橫計有我」，是不講道理地執著有我',
    'seg-1005': '得須陀洹果',
    'seg-1006': '他說我得須陀洹果了嗎',
    'seg-915': '是唯有蘊',
    'seg-919': '叫做蘊',
    'seg-917': '這是「色是一聚」',
    'seg-1013': '他執著有一個我是依止於身',
    'seg-1015': '我是受苦樂者',
    'seg-1016': '由我行這個法、非法的事情',
    'seg-1042': '立身念住',
    'seg-1045': '大蟲聚',
    'seg-1060': '立受念住',
    'seg-1032': '為欲除遣於心意識執我愚者',
    'seg-1033': '我事愚故，立心念住',
    'seg-1106': '《俱舍論》有這樣一種意思',
    'seg-1115': '執我愚者，我事愚故',
    'seg-1166': '即執著有我',
    'seg-1167': '以身為依止處，而去造作種種的事業',
    'seg-1064': '為欲除遣於心意識執我愚',
    'seg-1116': '立以心念住',
    'seg-1122': '這個法念住，前面是由法非法、有染有淨',
    'seg-1150': '第二義',
    'seg-1157': '立四念住',
    'seg-1163': '而建立四念住法門的，什麼呢？',
    'seg-1164': '謂若依此，造作諸業',
    'seg-1168': '或者善業、惡業、生死業、涅槃業，造作諸業',
    'seg-1171': '若為此故，造作諸業：為什麼要造業？為此，為什麼？為享受',
    'seg-1191': '立四念住',
    'seg-1196': '而安立四念住',
    'seg-1199': '前面說，謂若依此，造作諸業',
    'seg-1201': '還是色受想行識五蘊',
    'seg-1223': '復有差別',
    'seg-1231': '謂若依此，有染有淨',
    'seg-1236': '若為此故，起染起淨',
    'seg-1238': '若染淨者，就是指心說的',
    'seg-1239': '若由此故，成染成淨',
    'seg-1242': '總為顯示以上一切，安立這四念住',
    'seg-1248': '前面「謂若依此」',
    'seg-1252': '為求受故，起染起淨',
    'seg-1293': '由此住念者，是第二句',
    'seg-1328': '就是自性念住',
    'seg-1342': '所以所餘相應的諸心心所法',
    'seg-1395': '皆名念住，這也叫做念住',
    'seg-1396': '這也叫做念住',
    'seg-1432': '聞所成慧',
    'seg-1442': '第二步是思所成',
    'seg-1465': '思所成慧，它不是嘴講',
    'seg-1501': '然後引著《俱舍論》',
    'seg-1499': '我初開始是引《般若經》第六分〈念住品〉',
    'seg-1500': '第四念住，說一個大意',
    'seg-1503': '以後又引著《瑜伽師地論》',
    'seg-1520': '另外在《法蘊足論》',
    'seg-1623': '這件事初開始情況良好',
    'seg-1797': '身體的功能是有限度的',
    'seg-1831': '一打瞌睡，它就掉下來了',
    'seg-1843': '靜坐是容易昏沉的',
    'seg-1865': '（語音不清）',
    'seg-1639': '就是修奢摩他一個時候就修毘缽舍那',
    'seg-1894': '障礙的障是一個',
    'seg-1895': '耳刀加文章的章',
    'seg-1901': '應該是耳刀吧',
    'seg-1893': '我查了字典，我找不到這個字',
    'seg-2029': '《金剛經》就是心不障人之法',
    'seg-2019': '所以我們常常讀《金剛經》',
    'seg-1982': '就是無我相、無人相、無眾生相、無壽者相',
    'seg-2052': '若我是五陰，我即為生滅',
    'seg-2074': '〈觀法品〉的這個方法也可以',
    'seg-2076': '用前面的「諸法不自生」',
    'seg-2071': '可以這樣去',
    'seg-2079': '不知道那位同學講的「心不障人之法」',
    'seg-2102': '所以請示「心不障人之法」',
    'seg-040': '這個第一科說的有四個原因',
    'seg-053': '安立這個法門',
    'seg-087': '有四憺怕路',
    'seg-091': '這個「外」是對「內」說的',
    'seg-093': '外就是對死屍',
    'seg-094': '這個死屍已經朽穢了',
    'seg-111': '這個「變赤」的含義就是',
    'seg-112': '離皮肉血，筋脈纏裹',
    'seg-113': '這叫做「變赤」',
    'seg-148': '這個死屍的地方',
    'seg-191': '計樂顛倒，立受念住',
    'seg-299': '這個「行」在這裡的意思',
    'seg-398': '說是「以於諸受住循受觀」',
    'seg-506': '性淨明體嘛',
    'seg-531': '沒有辦法斷，那麼你沒辦法得解脫',
    'seg-539': '亦能了知有貪心等種種差別，經歷彼彼日夜剎那瞬息須臾',
    'seg-570': '這是《瑜伽師地論》',
    'seg-622': '為欲對治',
    'seg-639': '《大智度論》、像《瑜伽師地論》',
    'seg-640': '《顯揚聖教論》這些',
    'seg-685': '繼續聽的師父是哪位律師？',
    'seg-710': '我怎麼怎麼地、你怎麼怎麼地，有這麼一個字',
    'seg-797': '以於諸法住循法觀',
    'seg-799': '無常是有為法',
    'seg-847': '色受想行識',
    'seg-901': '由法非法，有染有淨',
    'seg-912': '不如實，橫計',
    'seg-951': '我在想，這是我的虛妄分別',
    'seg-1038': '為欲除遣我所依事愚故',
    'seg-1031': '立受念住',
    'seg-1039': '為欲破除去',
    'seg-1055': '這個受啊，計我論者是說',
    'seg-1080': '有差別，這個識是面向外的',
    'seg-1083': '這個意是識的依止處',
    'seg-1119': '就是除遣這個我',
    'seg-1160': '復有差別，還有不同的理由',
    'seg-1184': '造業要由善法的因緣去造作諸業',
    'seg-1225': '若為此故，起染起淨',
    'seg-1226': '若染淨者，若由此故，成染成淨',
    'seg-1227': '總為顯示如是一切',
    'seg-1228': '立四念住',
    'seg-1233': '會有染污的業',
    'seg-1237': '享受，起染污、起清淨',
    'seg-1249': '有染有淨',
    'seg-1268': '答：於此、由此住念',
    'seg-1286': '謂所緣念住，所以叫做念住',
    'seg-1295': '謂若慧、若念攝持於定',
    'seg-1404': '就是前面所說的若慧、若念',
    'seg-1405': '攝持於定，是自性念住',
    'seg-1493': '所以這裡解釋：由身受心法增上所生',
    'seg-1528': '那個《法蘊足論》的《四念住》',
    'seg-1558': '我們現在這個四念住',
    'seg-1560': '下一個星期就開始講《攝大乘論》',
    'seg-1621': '這件問題我剛才說',
    'seg-1716': '也要對治',
    'seg-1717': '對治',
    'seg-1819': '昏沉是重了一點',
    'seg-1892': '障礙的障',
    'seg-1898': '石頭的石加文章的章',
    'seg-1902': '是那個阜，左阜右邑',
    'seg-1914': '現在說是心不障人之法',
    'seg-2007': '你不清除',
    'seg-2039': '所以請示',
    'seg-056': '四念住，每一個念住',
    'seg-066': '立身念住',
    'seg-538': '觀察其餘的一切法',
    'seg-809': '「我」的定義有二義',
    'seg-1043': '這個身念住就是色受想行識',
    'seg-1266': '原因',
    'seg-1683': '昏沉老半天還是不能',
    'seg-1729': '所以說',
    'seg-1897': '你這個是石頭的石字',
  };
  for (const [id, text] of Object.entries(expected)) assert.equal(actual.get(id), text, id);
});

test('session 08 final candidate contains none of the confirmed ASR homophone forms', () => {
  const text = listTranscriptSentences(candidate).map((item) => item.text).join('\n');
  for (const forbidden of [
    '無惡見', '有惡見', '有惡劍', '無惡劍', '橫跡有鵝', '恆疾有鵝',
    '由俄行', '四年柱', '虛灘黃國', '淡泊路', '勳身念住', '共象',
    '經安經', '玉確實的論', '兒刀加文章', '傾慈心不障眼',
  ]) assert.equal(text.includes(forbidden), false, forbidden);
});
