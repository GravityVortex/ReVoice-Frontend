import { describe, expect, it } from 'vitest';

import { resolveTranslatedTtsReference } from './subtitle-reference-audio';

describe('resolveTranslatedTtsReference', () => {
  it('prefers canonical vap_tts_reference_subtitle_id when present', () => {
    const result = resolveTranslatedTtsReference({
      subtitleName: '00030001_00-00-10-074_00-00-14-475',
      translateRows: [
        {
          id: '00030001_00-00-10-074_00-00-14-475',
          vap_split_parent_id: 'translate-parent',
          vap_tts_reference_subtitle_id: 'source-parent',
        },
      ],
      sourceRows: [
        {
          id: '00030001_00-00-10-074_00-00-14-475',
          vap_source_split_parent_id: 'legacy-source-parent',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        referenceSubtitleName: 'source-parent',
        strategy: 'canonical',
        needsBackfill: false,
        patch: null,
      })
    );
  });

  it('falls back to source split parent and requests lazy backfill for legacy rows', () => {
    const result = resolveTranslatedTtsReference({
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      translateRows: [
        {
          id: '00030002_00-00-14-601_00-00-15-780',
          vap_split_parent_id: 'translate-parent',
        },
      ],
      sourceRows: [
        {
          id: '00030002_00-00-14-601_00-00-15-780',
          vap_source_split_parent_id: 'source-parent',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        referenceSubtitleName: 'source-parent',
        strategy: 'source_parent',
        needsBackfill: true,
        patch: { vap_tts_reference_subtitle_id: 'source-parent' },
      })
    );
  });

  it('falls back to source self id when source parent is absent', () => {
    const result = resolveTranslatedTtsReference({
      subtitleName: '0002_00-00-04-000_00-00-08-000',
      translateRows: [
        {
          id: '0002_00-00-04-000_00-00-08-000',
        },
      ],
      sourceRows: [
        {
          id: '0002_00-00-04-000_00-00-08-000',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        referenceSubtitleName: '0002_00-00-04-000_00-00-08-000',
        strategy: 'source_self',
        needsBackfill: true,
        patch: { vap_tts_reference_subtitle_id: '0002_00-00-04-000_00-00-08-000' },
      })
    );
  });

  it('returns unresolved when source row is missing and keeps diagnostics', () => {
    const result = resolveTranslatedTtsReference({
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      translateRows: [
        {
          id: '00030002_00-00-14-601_00-00-15-780',
          vap_split_parent_id: 'translate-parent',
        },
      ],
      sourceRows: [],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'unresolved',
        reason: 'source_row_missing',
      })
    );
  });

  it('keeps mismatch diagnostics without falling back to translate lineage', () => {
    const result = resolveTranslatedTtsReference({
      subtitleName: '00030002_00-00-14-601_00-00-15-780',
      translateRows: [
        {
          id: '00030002_00-00-14-601_00-00-15-780',
          vap_split_parent_id: 'translate-parent',
        },
      ],
      sourceRows: [
        {
          id: '00030002_00-00-14-601_00-00-15-780',
          vap_source_split_parent_id: 'source-parent',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        referenceSubtitleName: 'source-parent',
        strategy: 'source_parent',
        diagnostics: expect.objectContaining({
          translateParentId: 'translate-parent',
          sourceParentId: 'source-parent',
          lineageMismatch: true,
        }),
      })
    );
  });
});
