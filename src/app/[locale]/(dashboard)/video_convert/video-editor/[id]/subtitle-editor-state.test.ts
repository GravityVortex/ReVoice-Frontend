import { describe, expect, it } from 'vitest';

import type { SubtitleRowData } from './subtitle-row-item';
import {
  mergeLoadedConvertedTrackItems,
  mergeLoadedSourceTrackItems,
  mergeLoadedSubtitleItems,
  type EditorSubtitleTrackItem,
} from './subtitle-editor-state';

function makeRow(overrides: Partial<SubtitleRowData> = {}): SubtitleRowData {
  return {
    order: 0,
    id: 'clip-1',
    sourceId: 'source-1',
    startTime_source: '00:00:01,000',
    endTime_source: '00:00:02,000',
    text_source: 'server source',
    audioUrl_source: 'split_audio/audio/source-1.wav',
    startTime_convert: '00:00:01,000',
    endTime_convert: '00:00:02,000',
    text_convert: 'server convert',
    persistedText_convert: 'server convert',
    audioUrl_convert: 'split_audio/audio/clip-1.wav',
    audioUrl_convert_custom: 'adj_audio_time_temp/clip-1.wav?t=1',
    voiceStatus: 'missing',
    needsTts: true,
    draftAudioPath: 'adj_audio_time_temp/clip-1.wav',
    newTime: '',
    ...overrides,
  };
}

function makeTrack(overrides: Partial<EditorSubtitleTrackItem> = {}): EditorSubtitleTrackItem {
  return {
    id: 'clip-1',
    sourceId: 'source-1',
    type: 'video',
    name: 'Sub 1',
    startTime: 1,
    duration: 1,
    text: 'server convert',
    audioUrl: 'split_audio/audio/clip-1.wav',
    ...overrides,
  };
}

describe('subtitle editor state merge', () => {
  it('preserves the local workstation truth when the same row reloads from stale convertObj data', () => {
    const local = makeRow({
      text_source: 'local source',
      text_convert: 'local convert',
      persistedText_convert: 'local convert',
      audioUrl_convert: 'adj_audio_time/clip-1.wav',
      audioUrl_convert_custom: '',
      voiceStatus: 'ready',
      needsTts: false,
      draftAudioPath: '',
      newTime: '1710000000000',
    });
    const loaded = makeRow();

    const [merged] = mergeLoadedSubtitleItems([local], [loaded]);

    expect(merged.text_source).toBe('local source');
    expect(merged.text_convert).toBe('local convert');
    expect(merged.persistedText_convert).toBe('local convert');
    expect(merged.audioUrl_convert).toBe('adj_audio_time/clip-1.wav');
    expect(merged.audioUrl_convert_custom).toBe('');
    expect(merged.draftAudioPath).toBe('');
    expect(merged.voiceStatus).toBe('ready');
    expect(merged.needsTts).toBe(false);
    expect(merged.newTime).toBe('1710000000000');
  });

  it('carries local workstation edits across timing-driven id renames by matching on sourceId', () => {
    const local = makeRow({
      id: 'clip-old',
      sourceId: 'source-1',
      text_convert: 'local convert',
      audioUrl_convert_custom: 'adj_audio_time_temp/clip-old.wav?t=3',
      draftAudioPath: 'adj_audio_time_temp/clip-old.wav',
    });
    const loaded = makeRow({
      id: 'clip-new',
      sourceId: 'source-1',
      text_convert: 'server convert after rename',
      audioUrl_convert_custom: '',
      draftAudioPath: '',
    });

    const [merged] = mergeLoadedSubtitleItems([local], [loaded]);

    expect(merged.id).toBe('clip-new');
    expect(merged.sourceId).toBe('source-1');
    expect(merged.text_convert).toBe('local convert');
    expect(merged.audioUrl_convert_custom).toBe('adj_audio_time_temp/clip-old.wav?t=3');
    expect(merged.draftAudioPath).toBe('adj_audio_time_temp/clip-old.wav');
  });

  it('preserves unified converted timeline text and audio across reloads', () => {
    const local = makeTrack({
      text: 'local convert',
      audioUrl: 'adj_audio_time/clip-1.wav?t=9',
    });
    const loaded = makeTrack();

    const [merged] = mergeLoadedConvertedTrackItems([local], [loaded]);

    expect(merged.text).toBe('local convert');
    expect(merged.audioUrl).toBe('adj_audio_time/clip-1.wav?t=9');
  });

  it('carries unified converted timeline state across timing-driven id renames by sourceId', () => {
    const local = makeTrack({
      id: 'clip-old',
      sourceId: 'source-1',
      text: 'local convert',
      audioUrl: 'adj_audio_time/clip-old.wav?t=4',
    });
    const loaded = makeTrack({
      id: 'clip-new',
      sourceId: 'source-1',
      text: 'server convert after rename',
      audioUrl: 'split_audio/audio/clip-new.wav',
    });

    const [merged] = mergeLoadedConvertedTrackItems([local], [loaded]);

    expect(merged.id).toBe('clip-new');
    expect(merged.text).toBe('local convert');
    expect(merged.audioUrl).toBe('adj_audio_time/clip-old.wav?t=4');
  });

  it('preserves local converted timing while the row still has unsaved timing edits', () => {
    const local = makeTrack({
      startTime: 3.25,
      duration: 2.5,
      text: 'local convert',
      audioUrl: 'adj_audio_time/clip-1.wav?t=9',
    });
    const loaded = makeTrack({
      startTime: 1,
      duration: 1,
      text: 'server convert',
      audioUrl: 'split_audio/audio/clip-1.wav',
    });

    const [merged] = mergeLoadedConvertedTrackItems([local], [loaded], {
      pendingTimingMap: {
        'clip-1': {
          startMs: 3250,
          endMs: 5750,
        },
      },
    });

    expect(merged.startTime).toBe(3.25);
    expect(merged.duration).toBe(2.5);
    expect(merged.text).toBe('local convert');
    expect(merged.audioUrl).toBe('adj_audio_time/clip-1.wav?t=9');
  });

  it('preserves unified original timeline text across reloads', () => {
    const local = makeTrack({
      id: 'source-1',
      sourceId: 'source-1',
      type: 'audio',
      name: 'Src 1',
      text: 'local source',
      audioUrl: undefined,
    });
    const loaded = makeTrack({
      id: 'source-1',
      sourceId: 'source-1',
      type: 'audio',
      name: 'Src 1',
      text: 'server source',
      audioUrl: undefined,
    });

    const [merged] = mergeLoadedSourceTrackItems([local], [loaded]);

    expect(merged.text).toBe('local source');
  });
});
