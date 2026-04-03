import { describe, expect, it } from 'vitest';

import { resolveEditorPublicAudioUrl, resolveSourceAuditionAudio } from './audio-source-resolver';

describe('resolveSourceAuditionAudio', () => {
  it('prefers sourceEntry.audio_url over legacy front-end path concatenation', () => {
    const result = resolveSourceAuditionAudio({
      convertObj: {
        userId: 'owner-1',
        id: 'task-1',
        r2preUrl: 'https://pub.example.com',
        env: 'dev',
      } as any,
      sourceEntry: {
        id: 'clip-1',
        audio_url: 'split_audio/audio/clip-1.wav',
      },
    });

    expect(result.primary?.url).toBe('https://pub.example.com/dev/owner-1/task-1/split_audio/audio/clip-1.wav');
    expect(result.primary?.url).not.toContain('/undefined/');
    expect(result.primary?.source).toBe('source_segment');
  });

  it('reuses resolveSourcePlaybackMode semantics for split rows', () => {
    const result = resolveSourceAuditionAudio({
      convertObj: {
        userId: 'owner-1',
        id: 'task-1',
        vocalAudioUrl: 'https://private.example.com/vocal.wav',
      } as any,
      sourceEntry: {
        id: 'clip-1',
        start: '00:00:10,000',
        end: '00:00:12,000',
        vap_source_mode: 'fallback_vocal',
      },
    });

    expect(result.primary?.source).toBe('vocal_fallback');
    expect(result.primary?.url).toBe('https://private.example.com/vocal.wav');
    expect(result.stopAtSec).toBe(12);
  });
});

describe('resolveEditorPublicAudioUrl', () => {
  it('uses convertObj.userId rather than runtime user context when building editor audio urls', () => {
    const result = resolveEditorPublicAudioUrl({
      convertObj: {
        userId: 'owner-1',
        id: 'task-1',
        r2preUrl: 'https://pub.example.com',
        env: 'dev',
      } as any,
      pathName: 'adj_audio_time/clip-1.wav',
      cacheBust: '123',
    });

    expect(result).toBe('https://pub.example.com/dev/owner-1/task-1/adj_audio_time/clip-1.wav?t=123');
  });

  it('falls back to a same-origin storage stream url when public bucket metadata is unavailable', () => {
    const result = resolveEditorPublicAudioUrl({
      convertObj: {
        userId: 'owner-1',
        id: 'task-1',
      } as any,
      pathName: 'adj_audio_time_temp/clip-1.wav',
      cacheBust: '123',
    });

    expect(result).toBe('/api/storage/stream?key=owner-1%2Ftask-1%2Fadj_audio_time_temp%2Fclip-1.wav&t=123');
  });
});
