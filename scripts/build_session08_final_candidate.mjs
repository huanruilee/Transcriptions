#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applySession08GroundedGlossary,
  buildValidatedModelCandidate,
  computeSourceDigest,
  listTranscriptSentences,
  validateProofreadingCandidate,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'reviews/evidence/transcript_proofreading/production/四念住';
const sourcePath = path.resolve(ROOT, 'courses/四念住/sessions/session_08.json');
const paths = {
  alignment: path.resolve(ROOT, `${base}/session_08.reference-alignment.json`),
  qwen: path.resolve(ROOT, `${base}/session_08.reference-risk-qwen.json`),
  qwenAudio: path.resolve(ROOT, `${base}/session_08.reference-risk-qwen-audio.json`),
  minimax: path.resolve(ROOT, `${base}/session_08.reference-risk-minimax.json`),
  qwenReference: path.resolve(ROOT, `${base}/session_08.reference.qwen.json`),
  audio: path.resolve(ROOT, `${base}/session_08.full-context-asr-all.json`),
  outputDir: path.resolve(ROOT, base),
};

const MANUAL_OVERRIDES = new Map(Object.entries({
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
  'seg-636': '這個大乘的經論裡面',
  'seg-637': '《般若經》、《寶積經》、《法華經》',
  'seg-654': '《金剛經》上',
  'seg-663': '所以說，你看過那部什麼經？我看過。',
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
  'seg-787': '那麼沒有「無我見」',
  'seg-788': '有我見',
  'seg-809': '我的定義有義',
  'seg-826': '你就會如實了知所計諸蘊',
  'seg-846': '諸蘊的自相',
  'seg-855': '共相就是無常的',
  'seg-867': '然後你才能修無我觀',
  'seg-868': '你才能修無我觀',
  'seg-901': '此法有因有緣',
  'seg-925': '橫計有我',
  'seg-958': '佛法附在有我論，流行於世間',
  'seg-967': '這「橫計有我」，是不講道理地執著有我',
  'seg-915': '是唯有蘊',
  'seg-917': '這是「色是一聚」',
  'seg-919': '叫做蘊',
  'seg-978': '做什麼呢？能受用苦樂',
  'seg-997': '或者修學禪定以後你離欲了',
  'seg-1005': '得須陀洹果',
  'seg-1006': '他說我得須陀洹果了嗎',
  'seg-1013': '他執著有一個我是依止於身',
  'seg-1015': '我是受苦樂者',
  'seg-1016': '由我行這個法、非法的事情',
  'seg-1030': '事愚故',
  'seg-1032': '為欲除遣於心意識執我愚者',
  'seg-1033': '我事愚故，立心念住',
  'seg-1042': '立身念住',
  'seg-1043': '這個身念住就是所說顯示',
  'seg-1045': '大蟲聚',
  'seg-1060': '立受念住',
  'seg-1063': '立受念住',
  'seg-1064': '為欲除遣於心意識執我愚',
  'seg-1106': '《俱舍論》有這樣一種意思',
  'seg-1115': '執我愚者，我事愚故',
  'seg-1116': '立以心念住',
  'seg-1122': '這個法念住，前面是由法非法、有染有淨',
  'seg-1150': '第二義',
  'seg-1157': '立四念住',
  'seg-1163': '而建立四念住法門的，什麼呢？',
  'seg-1164': '謂若依此，造作諸業',
  'seg-1165': '就是計我論者',
  'seg-1166': '即執著有我',
  'seg-1167': '以身為依止處，而去造作種種的事業',
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
  'seg-1327': '這叫做自性念住',
  'seg-1328': '就是自性念住',
  'seg-1341': '還有很多的這些心所法',
  'seg-1342': '所以所餘相應的諸心心所法',
  'seg-1395': '皆名念住，這也叫做念住',
  'seg-1396': '這也叫做念住',
  'seg-1407': '一個是聞所成',
  'seg-1432': '聞所成慧',
  'seg-1442': '第二步是思所成',
  'seg-1465': '思所成慧，它不是嘴講',
  'seg-1501': '然後引著《俱舍論》',
  'seg-1499': '我初開始是引《般若經》第六分〈念住品〉',
  'seg-1500': '第四念住，說一個大意',
  'seg-1503': '以後又引著《瑜伽師地論》',
  'seg-1520': '另外在《法蘊足論》',
  'seg-1623': '這件事初開始情況良好',
  'seg-1639': '就是修奢摩他一個時候就修毘缽舍那',
  'seg-1797': '身體的功能是有限度的',
  'seg-1830': '他自己在頭上設一個叫做「禪鎮」的東西',
  'seg-1831': '一打瞌睡，它就掉下來了',
  'seg-1843': '靜坐是容易昏沉的',
  'seg-1865': '（語音不清）',
  'seg-1893': '我查了字典，我找不到這個字',
  'seg-1894': '障礙的障是一個',
  'seg-1895': '耳刀加文章的章',
  'seg-1901': '應該是耳刀吧',
  'seg-2019': '所以我們常常讀《金剛經》',
  'seg-1982': '就是無我相、無人相、無眾生相、無壽者相',
  'seg-2029': '《金剛經》就是心不障人之法',
  'seg-2030': '《修四念處》就是不障人之法',
  'seg-2052': '若我是五陰，我即為生滅',
  'seg-2053': '若我異五陰，則非五陰相',
  'seg-2071': '可以這樣去',
  'seg-2073': '假設你用《中觀論》的',
  'seg-2074': '〈觀法品〉的這個方法也可以',
  'seg-2076': '用前面的「諸法不自生」',
  'seg-2079': '不知道那位同學講的「心不障人之法」',
  'seg-2102': '所以請示「心不障人之法」',
}));

function delimiterNet(text, open, close) {
  return [...text].reduce((total, character) => (
    total + (character === open ? 1 : character === close ? -1 : 0)
  ), 0);
}

function preservesDelimiterNets(before, after) {
  return [['「', '」'], ['《', '》'], ['〈', '〉'], ['（', '）']]
    .every(([open, close]) => delimiterNet(before, open, close) === delimiterNet(after, open, close));
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function readBound(filePath) {
  const raw = readFileSync(filePath);
  return { raw, value: JSON.parse(raw), digest: digest(raw) };
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, filePath);
  return digest(bytes);
}

const sourceRaw = readFileSync(sourcePath);
const source = JSON.parse(sourceRaw);
const sourceFileDigest = digest(sourceRaw);
const sourceDigest = computeSourceDigest(source);
const evidence = Object.fromEntries(Object.entries(paths)
  .filter(([name]) => !['outputDir'].includes(name))
  .map(([name, filePath]) => [name, readBound(filePath)]));
const alignment = evidence.alignment.value;
if (alignment.sourceFileDigest !== sourceFileDigest) throw new Error('alignment source digest mismatch');
for (const name of ['qwen', 'qwenAudio', 'minimax']) {
  const item = evidence[name].value;
  if (item.status !== 'complete' || item.sourceDigest !== sourceFileDigest
    || item.alignmentDigest !== evidence.alignment.digest
    || item.completedItemCount !== item.itemCount) {
    throw new Error(`${name} evidence is incomplete or not bound`);
  }
}
if (evidence.audio.value.sourceFileDigest !== sourceFileDigest
  || evidence.audio.value.itemCount !== 2136
  || evidence.qwenReference.value.sourceDigest !== sourceDigest) {
  throw new Error('review or audio evidence is not bound to source');
}

const sentences = listTranscriptSentences(source);
if (alignment.items.length !== sentences.length) throw new Error('alignment coverage mismatch');
const alignmentById = new Map(alignment.items.map((item) => [item.id, item]));
const riskDecisionById = new Map(evidence.qwen.value.decisions.map((item) => [item.id, item]));
for (const item of evidence.qwenAudio.value.decisions) riskDecisionById.set(item.id, item);
const qwenVerdictById = new Map(evidence.qwenReference.value.verdicts
  .map((item) => [item.proposalId, item]));
const proposals = [];
const uncertainty = [];
for (const sentence of sentences) {
  const aligned = alignmentById.get(sentence.id);
  if (!aligned || aligned.before !== sentence.text) throw new Error(`alignment mismatch for ${sentence.id}`);
  let after = sentence.text;
  let changeClass = null;
  const itemEvidence = [
    `reference-pdf:${alignment.referencePdfDigest}`,
    `reference-text:${alignment.referenceTextDigest}`,
    `reference-alignment:${evidence.alignment.digest}`,
  ];
  const reasons = [];
  if (!aligned.boundaryRisk && aligned.after !== sentence.text) {
    after = aligned.after;
    changeClass = 'reference-transcript';
    reasons.push('公開正式講記全域對齊且句界風險低');
    itemEvidence.push(`reference-span:${aligned.referenceStart}-${aligned.referenceEnd}`);
    const verdict = qwenVerdictById.get(sentence.id);
    if (verdict) itemEvidence.push(`gx10-reference-verdict:${verdict.verdict}`);
  } else if (aligned.boundaryRisk) {
    const decision = riskDecisionById.get(sentence.id);
    if (decision?.decision === 'replace') {
      after = decision.proposedText;
      changeClass = 'reference-audio-adjudication';
      reasons.push('正式講記與 GX10 風險群組裁決提出最小修正');
      itemEvidence.push(`gx10-risk:${evidence.qwen.digest}`);
      if (evidence.qwenAudio.value.decisions.some((item) => item.id === sentence.id)) {
        itemEvidence.push(`gx10-audio-risk:${evidence.qwenAudio.digest}`);
        itemEvidence.push(`audio:${evidence.audio.value.audioSha256}`);
      }
    } else if (decision?.decision === 'uncertain') {
      uncertainty.push({ id: sentence.id, reason: '正式講記句界與音訊仍不能唯一支持替換' });
    }
  }
  const glossary = applySession08GroundedGlossary(after);
  if (glossary.text !== after) {
    after = glossary.text;
    changeClass = changeClass ? `${changeClass}+grounded-glossary` : 'grounded-glossary';
    reasons.push('同講正式講記與全講用語一致支持的確定性術語修正');
    itemEvidence.push(`grounded-glossary:session-08-v1`);
  }
  if (MANUAL_OVERRIDES.has(sentence.id)) {
    after = MANUAL_OVERRIDES.get(sentence.id);
    changeClass = 'independent-review-correction';
    reasons.push('獨立抽查依正式講記、音訊上下文或引用原文修正');
    itemEvidence.push('independent-review:session-08-run-348fbff5');
  }
  if (after !== sentence.text) {
    proposals.push({
      id: sentence.id,
      after,
      change_class: changeClass,
      reason: reasons.join('；'),
      evidence: itemEvidence,
      confidence: aligned.boundaryRisk ? 0.8 : Math.max(0.7, aligned.similarity),
    });
  }
}

const lengthRejected = [];
const guardedProposals = proposals.filter((proposal) => {
  const sentence = sentences.find((item) => item.id === proposal.id);
  const ratio = proposal.after.length / Math.max(1, sentence.text.length);
  if (ratio >= 0.5 && ratio <= 1.6
    && preservesDelimiterNets(sentence.text, proposal.after)) return true;
  lengthRejected.push(proposal);
  uncertainty.push({
    id: proposal.id,
    reason: ratio < 0.5 || ratio > 1.6
      ? `長度閘門拒絕 ratio=${ratio.toFixed(3)}`
      : '成對符號淨值閘門拒絕',
  });
  return false;
});
const review = {
  batch_id: `session-08-final:${sourceFileDigest}`,
  reviewed_count: sentences.length,
  reviewed_ids: sentences.map((item) => item.id),
  proposals: guardedProposals,
  uncertain: uncertainty,
};
const firstPass = buildValidatedModelCandidate({
  source,
  reviews: [review],
  model: {
    provider: 'formal-reference-plus-local-adjudication',
    alignmentDigest: evidence.alignment.digest,
    qwenRiskDigest: evidence.qwen.digest,
    qwenAudioRiskDigest: evidence.qwenAudio.digest,
    minimaxRiskDigest: evidence.minimax.digest,
    qwenReferenceReviewDigest: evidence.qwenReference.digest,
    audioEvidenceDigest: evidence.audio.digest,
  },
});
const quarantinedIds = new Set(firstPass.quarantined.map((item) => item.sentenceId));
const fallbackProposals = review.proposals.flatMap((proposal) => {
  if (!quarantinedIds.has(proposal.id)) return [proposal];
  const sentence = sentences.find((item) => item.id === proposal.id);
  const glossary = applySession08GroundedGlossary(sentence.text);
  if (glossary.text === sentence.text) return [];
  return [{
    id: proposal.id,
    after: glossary.text,
    change_class: 'grounded-glossary-fallback',
    reason: '整句候選被跨句閘門隔離，只保留來源支持的術語修正',
    evidence: [`grounded-glossary:session-08-v1`, `rejected-combined-proposal:${proposal.id}`],
    confidence: 0.9,
  }];
}).concat(lengthRejected.flatMap((proposal) => {
  const sentence = sentences.find((item) => item.id === proposal.id);
  const glossary = applySession08GroundedGlossary(sentence.text);
  if (glossary.text === sentence.text) return [];
  return [{
    id: proposal.id,
    after: glossary.text,
    change_class: 'grounded-glossary-fallback',
    reason: '整句候選被長度閘門隔離，只保留來源支持的術語修正',
    evidence: [`grounded-glossary:session-08-v1`, `rejected-length-proposal:${proposal.id}`],
    confidence: 0.9,
  }];
}));
const fallbackUncertain = [
  ...uncertainty,
  ...firstPass.quarantined.map((item) => ({
    id: item.sentenceId,
    reason: `整句候選被跨句閘門隔離：${item.errors.map((error) => error.code).join(',')}`,
  })),
];
const result = buildValidatedModelCandidate({
  source,
  reviews: [{ ...review, proposals: fallbackProposals, uncertain: fallbackUncertain }],
  model: {
    provider: 'formal-reference-plus-local-adjudication',
    alignmentDigest: evidence.alignment.digest,
    qwenRiskDigest: evidence.qwen.digest,
    qwenAudioRiskDigest: evidence.qwenAudio.digest,
    minimaxRiskDigest: evidence.minimax.digest,
    qwenReferenceReviewDigest: evidence.qwenReference.digest,
    audioEvidenceDigest: evidence.audio.digest,
  },
});
if (!result.validation.valid) {
  throw new Error(`final candidate validation failed: ${JSON.stringify(result.validation.errors)}`);
}
const runId = randomUUID();
const candidate = result.candidate;
const ledger = { ...result.ledger, runId };
const finalValidation = validateProofreadingCandidate({ source, candidate, ledger });
if (!finalValidation.valid) {
  throw new Error(`serialized final candidate validation failed: ${JSON.stringify(finalValidation.errors)}`);
}
const queue = {
  schema: 'transcript-proofreading-final-review-queue/v1',
  runId,
  sourceDigest,
  itemCount: result.reviewQueue.length,
  items: result.reviewQueue,
};
const runDirectory = path.join(paths.outputDir, 'runs', runId);
if (existsSync(runDirectory)) throw new Error(`immutable run snapshot already exists: ${runId}`);
const outputPaths = {
  candidate: path.join(paths.outputDir, 'session_08.final-candidate.json'),
  ledger: path.join(paths.outputDir, 'session_08.final-ledger.json'),
  reviewQueue: path.join(paths.outputDir, 'session_08.final-review-queue.json'),
  complete: path.join(paths.outputDir, 'session_08.final-complete.json'),
  runDirectory,
};
const artifactDigests = {
  candidate: writeJsonAtomic(outputPaths.candidate, candidate),
  ledger: writeJsonAtomic(outputPaths.ledger, ledger),
  reviewQueue: writeJsonAtomic(outputPaths.reviewQueue, queue),
};
const completion = {
  schema: 'transcript-proofreading-final-candidate-completion/v1',
  runId,
  sourceDigest,
  sourceFileDigest,
  evidenceDigests: Object.fromEntries(Object.entries(evidence).map(([name, item]) => [name, item.digest])),
  artifactDigests,
  counts: {
    proposed: fallbackProposals.length,
    applied: result.ledger.entries.length,
    quarantined: firstPass.quarantined.length + result.quarantined.length,
    unresolved: fallbackUncertain.length,
    reviewQueue: queue.itemCount,
  },
  state: 'candidate-independent-review-required',
  validation: finalValidation,
};
writeJsonAtomic(outputPaths.complete, completion);
for (const [name, value] of Object.entries({ candidate, ledger, reviewQueue: queue, complete: completion })) {
  writeJsonAtomic(path.join(runDirectory, `session_08.final-${name.replace('reviewQueue', 'review-queue')}.json`), value);
}
console.log(JSON.stringify({ runId, outputPaths, counts: {
  proposed: fallbackProposals.length,
  applied: result.ledger.entries.length,
  quarantined: firstPass.quarantined.length + result.quarantined.length,
  unresolved: fallbackUncertain.length,
  reviewQueue: queue.itemCount,
} }, null, 2));
