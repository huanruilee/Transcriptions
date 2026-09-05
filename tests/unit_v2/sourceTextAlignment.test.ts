import { describe, it, expect } from 'vitest';
import {
  findVerseById,
  alignSentenceWithVerse,
  suggestCanonicalCorrections,
  type VerseItem,
} from '../../src/composables/useCanonicalAlignment';

describe('SourceTextAlignment Test Pattern (TDD)', () => {
  const sampleVerses: VerseItem[] = [
    {
      verse_id: 'v-01',
      chapter: '成量品',
      number: 1,
      root_text: '敬禮定量欲利生，大師示導善逝救。',
      tibetan: 'ཚད་མར་གྱུར་པ་འགྲོ་ལ་ཕན་བཞེད་པ།',
    },
    {
      verse_id: 'v-02',
      chapter: '成量品',
      number: 2,
      root_text: '為成定量故宣說，此中定量不欺誑，明不知義故定量。',
      tibetan: 'ཚད་མ་བསླུ་མེད་ཅན་ཤེས་པ།',
    },
  ];

  it('應能精確根據 verse_id 檢索對應課文偈頌', () => {
    const verse = findVerseById(sampleVerses, 'v-01');
    expect(verse).toBeDefined();
    expect(verse?.root_text).toContain('敬禮定量欲利生');
  });

  it('逐字稿句帶有 root_verse_id 時應能自動關聯所屬偈頌', () => {
    const sentence = {
      id: 's-50',
      start_time: 120.0,
      end_time: 126.0,
      text: '法師開示第一句偈頌敬禮定量欲利生。',
      root_verse_id: 'v-01',
    };

    const linkedVerse = alignSentenceWithVerse(sentence, sampleVerses);
    expect(linkedVerse).toBeDefined();
    expect(linkedVerse?.verse_id).toBe('v-01');
  });

  it('底本印證智慧校勘應能比對出 ASR 辨識同音訛字並給出替換建議', () => {
    // 假設 ASR 把「定量」辨識為「訂量」
    const asrText = '敬禮訂量欲利生，大師示導善逝救。';
    const canonicalText = '敬禮定量欲利生，大師示導善逝救。';

    const suggestions = suggestCanonicalCorrections(asrText, canonicalText);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suspicious).toBe('訂量');
    expect(suggestions[0].canonical).toBe('定量');
  });
});
