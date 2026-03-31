import { describe, expect, it } from 'vitest';

import {
  getPendingSourceSaveEntries,
  hasSubtitleWorkstationDirtyState,
  remapSubtitleIdRecordBySourceId,
  remapSubtitleIdSetBySourceId,
  shouldApplySubtitleAsyncResult,
} from './subtitle-workstation-state';

describe('subtitle workstation dirty state', () => {
  it('treats pending source autosave work as unsaved changes even when voice state is already clean', () => {
    expect(
      hasSubtitleWorkstationDirtyState({
        rowVoiceStates: ['ready'],
        pendingAppliedVoiceCount: 0,
        pendingSourceSaveCount: 1,
      })
    ).toBe(true);
  });

  it('stays clean only when both voice work and source autosave queues are empty', () => {
    expect(
      hasSubtitleWorkstationDirtyState({
        rowVoiceStates: ['ready'],
        pendingAppliedVoiceCount: 0,
        pendingSourceSaveCount: 0,
      })
    ).toBe(false);
  });

  it('collects pending source saves by sourceId even after translated ids have been renamed', () => {
    expect(
      getPendingSourceSaveEntries(
        [
          {
            id: 'clip-renamed',
            sourceId: 'source-1',
            text_source: 'updated source text',
          },
          {
            id: 'clip-2',
            sourceId: 'source-2',
            text_source: 'clean source text',
          },
        ],
        {
          'source-1': 1710000000000,
        }
      )
    ).toEqual([
      {
        sourceId: 'source-1',
        text: 'updated source text',
        editedAtMs: 1710000000000,
      },
    ]);
  });

  it('remaps row id sets by sourceId when timing saves rename translated subtitle ids', () => {
    expect(
      Array.from(
        remapSubtitleIdSetBySourceId(
          new Set(['clip-old', 'clip-keep', 'clip-missing']),
          [
            { id: 'clip-old', sourceId: 'source-1' },
            { id: 'clip-keep', sourceId: 'source-2' },
          ],
          [
            { id: 'clip-new', sourceId: 'source-1' },
            { id: 'clip-keep', sourceId: 'source-2' },
          ]
        )
      )
    ).toEqual(['clip-new', 'clip-keep']);
  });

  it('remaps row id records by sourceId so invalidated draft audio state survives id renames', () => {
    expect(
      remapSubtitleIdRecordBySourceId(
        {
          'clip-old': 1710000000000,
          'clip-keep': 1710000001000,
          'clip-missing': 1710000002000,
        },
        [
          { id: 'clip-old', sourceId: 'source-1' },
          { id: 'clip-keep', sourceId: 'source-2' },
        ],
        [
          { id: 'clip-new', sourceId: 'source-1' },
          { id: 'clip-keep', sourceId: 'source-2' },
        ]
      )
    ).toEqual({
      'clip-new': 1710000000000,
      'clip-keep': 1710000001000,
    });
  });

  it('drops stale async subtitle responses when the row text has changed since the request started', () => {
    expect(
      shouldApplySubtitleAsyncResult({
        currentText: 'latest text',
        requestTextSnapshot: 'old text',
      })
    ).toBe(false);

    expect(
      shouldApplySubtitleAsyncResult({
        currentText: 'latest text',
        requestTextSnapshot: 'latest text',
      })
    ).toBe(true);
  });
});
