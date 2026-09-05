export type MediaType = 'audio/mp3' | 'video/youtube';
export type DisplayMode = 'audio-only' | 'video-pip' | 'video-split';

export interface MediaConfig {
  type: MediaType;
  src?: string;
  youtubeVideoId?: string;
  playlistId?: string;
}

export interface IMediaAdapter {
  getMediaType(): MediaType;
  getDisplayMode(): DisplayMode;
  setDisplayMode(mode: DisplayMode): void;
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getCurrentTime(): number;
  getDuration(): number;
  onTimeUpdate(callback: (time: number) => void): () => void;
  destroy(): void;
}

export class HTML5AudioAdapter implements IMediaAdapter {
  private config: MediaConfig;
  private playbackRate: number = 1.0;
  private currentTime: number = 0;
  private duration: number = 0;
  private displayMode: DisplayMode = 'audio-only';
  private timeCallbacks: Set<(time: number) => void> = new Set();

  constructor(config: MediaConfig) {
    this.config = config;
  }

  getMediaType(): MediaType {
    return 'audio/mp3';
  }

  getDisplayMode(): DisplayMode {
    return this.displayMode;
  }

  setDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode;
  }

  play(): void {}
  pause(): void {}
  seek(timeSeconds: number): void {
    this.currentTime = timeSeconds;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  onTimeUpdate(callback: (time: number) => void): () => void {
    this.timeCallbacks.add(callback);
    return () => this.timeCallbacks.delete(callback);
  }

  destroy(): void {
    this.timeCallbacks.clear();
  }
}

export class YouTubeIframeAdapter implements IMediaAdapter {
  private config: MediaConfig;
  private playbackRate: number = 1.0;
  private currentTime: number = 0;
  private duration: number = 0;
  private displayMode: DisplayMode = 'audio-only';
  private timeCallbacks: Set<(time: number) => void> = new Set();

  constructor(config: MediaConfig) {
    this.config = config;
  }

  getMediaType(): MediaType {
    return 'video/youtube';
  }

  getDisplayMode(): DisplayMode {
    return this.displayMode;
  }

  setDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode;
  }

  play(): void {}
  pause(): void {}
  seek(timeSeconds: number): void {
    this.currentTime = timeSeconds;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  onTimeUpdate(callback: (time: number) => void): () => void {
    this.timeCallbacks.add(callback);
    return () => this.timeCallbacks.delete(callback);
  }

  destroy(): void {
    this.timeCallbacks.clear();
  }
}

export function createMediaAdapter(config: MediaConfig): IMediaAdapter {
  if (config.type === 'video/youtube') {
    return new YouTubeIframeAdapter(config);
  }
  return new HTML5AudioAdapter(config);
}
