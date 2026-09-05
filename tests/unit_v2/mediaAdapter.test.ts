import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMediaAdapter, type IMediaAdapter, type MediaConfig } from '../../src/media/MediaAdapter';

describe('MediaAdapter Test Pattern (TDD)', () => {
  it('應能正確工廠化建立 HTML5AudioAdapter', () => {
    const config: MediaConfig = {
      type: 'audio/mp3',
      src: 'https://example.com/audio/01.mp3',
    };
    const adapter = createMediaAdapter(config);
    expect(adapter).toBeDefined();
    expect(adapter.getMediaType()).toBe('audio/mp3');
  });

  it('應能正確工廠化建立 YouTubeIframeAdapter', () => {
    const config: MediaConfig = {
      type: 'video/youtube',
      youtubeVideoId: 's-zO8jcvI2A',
      playlistId: 'PLMngxNMnjFcPb9_mZSX2f7i1E9JbC_AGI',
    };
    const adapter = createMediaAdapter(config);
    expect(adapter).toBeDefined();
    expect(adapter.getMediaType()).toBe('video/youtube');
  });

  it('YouTube 適配器應支援純音訊模式 (Audio-Only) 與影片視窗模式切換', () => {
    const config: MediaConfig = {
      type: 'video/youtube',
      youtubeVideoId: 's-zO8jcvI2A',
    };
    const adapter = createMediaAdapter(config);
    
    // 預設為純音訊聽聞模式
    expect(adapter.getDisplayMode()).toBe('audio-only');
    
    adapter.setDisplayMode('video-pip');
    expect(adapter.getDisplayMode()).toBe('video-pip');

    adapter.setDisplayMode('video-split');
    expect(adapter.getDisplayMode()).toBe('video-split');
  });

  it('適配器應支援統一的倍速播放控制合約 (1.0x ~ 2.0x)', () => {
    const config: MediaConfig = {
      type: 'audio/mp3',
      src: 'test.mp3',
    };
    const adapter = createMediaAdapter(config);
    adapter.setPlaybackRate(1.2);
    expect(adapter.getPlaybackRate()).toBe(1.2);

    adapter.setPlaybackRate(1.5);
    expect(adapter.getPlaybackRate()).toBe(1.5);

    adapter.setPlaybackRate(2.0);
    expect(adapter.getPlaybackRate()).toBe(2.0);
  });
});
