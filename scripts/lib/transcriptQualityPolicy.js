const traditionalChineseMapping = {
  '为': '為', '这': '這', '样': '樣', '个': '個', '说': '說',
  '体': '體', '经': '經', '论': '論', '门': '門', '从': '從',
  '对': '對', '么': '麼', '后': '後', '变': '變', '实': '實',
  '证': '證', '觉': '覺', '关': '關', '开': '開', '边': '邊',
  '过': '過', '问': '問', '题': '題', '时': '時', '间': '間',
  '还': '還', '会': '會', '点': '點', '现': '現', '显': '顯',
  '义': '義', '极': '極', '胜': '勝', '广': '廣', '当': '當',
  '无': '無', '师': '師', '发': '發', '与': '與', '见': '見',
  '随': '隨', '应': '應', '处': '處', '观': '觀', '摄': '攝',
  '识': '識', '别': '別', '业': '業', '释': '釋', '难': '難',
  '车': '車', '声': '聲', '闻': '聞', '缘': '緣', '执': '執',
  '许': '許', '计': '計', '总': '總', '种': '種', '量': '量',
  '听': '聽', '讲': '講', '话': '話', '导': '導', '读': '讀',
  '记': '記', '诵': '誦', '传': '傳', '承': '承', '菩': '菩',
  '萨': '薩', '罗': '羅', '蜜': '蜜', '多': '多', '佛': '佛',
  '智': '智', '慧': '慧', '辩': '辯', '净': '淨', '谛': '諦',
  '俗': '俗',
};

const strictSimplifiedToTraditional = Object.freeze(
  Object.fromEntries(Object.entries(traditionalChineseMapping).filter(([simp, trad]) => simp !== trad)),
);

const goldenForbiddenHomophones = Object.freeze([
  Object.freeze({ source: '非紋症|肺紋症', name: '非紋症/肺紋症 (應為「飛蚊症」)' }),
  Object.freeze({ source: '至向有|自向有', name: '至向有/自向有 (應為「自相有」)' }),
  Object.freeze({ source: '損壞羹|損壞更', name: '損壞羹/更 (應為「損壞根」)' }),
  Object.freeze({ source: '設法心法', name: '設法心法 (應為「色法心法」)' }),
  Object.freeze({ source: '不先一心法', name: '不先一心法 (應為「不相應行法」)' }),
  Object.freeze({ source: '生一地|生意地', name: '生一地/生意地 (應為「勝義諦」)' }),
  Object.freeze({ source: '七[狂況]法', name: '七狂法/七況法 (應為「欺誑法」)' }),
  Object.freeze({ source: '執陽眼為水|羊眼', name: '陽眼/羊眼 (應為「陽焰」)' }),
  Object.freeze({ source: '執那個正的是', name: '執那個正的是 (應為「執那個正的識」)' }),
]);

export const TRADITIONAL_CHINESE_PURITY_PROFILE = Object.freeze({
  simpToTrad: strictSimplifiedToTraditional,
});

export const GOLDEN_STANDARD_QUALITY_PROFILE = Object.freeze({
  simplifiedCharacters: '为这样个说体经论门从对么变实证觉关开边过问题时间还会点现显义极胜广当无师发与见随应处观摄识别业释难车声闻缘执许计总种听讲话导读记诵辩净谛',
  forbiddenHomophones: goldenForbiddenHomophones,
});

function collectGlobalMatches(text, pattern) {
  return text.match(new RegExp(pattern.source, `${pattern.flags.replaceAll('g', '')}g`)) || [];
}

export function findTraditionalChinesePurityViolations(text) {
  const pattern = new RegExp(`[${Object.keys(TRADITIONAL_CHINESE_PURITY_PROFILE.simpToTrad).join('')}]`, 'g');
  return collectGlobalMatches(text, pattern);
}

export function findGoldenStandardSimplifiedCharacters(text) {
  const pattern = new RegExp(`[${GOLDEN_STANDARD_QUALITY_PROFILE.simplifiedCharacters}]`, 'g');
  return collectGlobalMatches(text, pattern);
}

export function findForbiddenGoldenStandardText(text) {
  return GOLDEN_STANDARD_QUALITY_PROFILE.forbiddenHomophones.flatMap(({ source }) => {
    const match = new RegExp(source).exec(text);
    return match ? [match[0]] : [];
  });
}
