type ResolvedStrategy = 'canonical' | 'source_parent' | 'source_self';

type ResolvedReference = {
  status: 'resolved';
  referenceSubtitleName: string;
  strategy: ResolvedStrategy;
  translateIndex: number;
  needsBackfill: boolean;
  patch: Record<string, any> | null;
  diagnostics: Record<string, any>;
};

type UnresolvedReference = {
  status: 'unresolved';
  reason: 'translate_row_missing' | 'source_row_missing' | 'source_reference_missing';
  diagnostics: Record<string, any>;
};

export type TranslatedTtsReferenceResolution = ResolvedReference | UnresolvedReference;

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveTranslatedTtsReference(args: {
  subtitleName: string;
  translateRows: any[];
  sourceRows: any[];
}): TranslatedTtsReferenceResolution {
  const translateRows = Array.isArray(args.translateRows) ? args.translateRows : [];
  const sourceRows = Array.isArray(args.sourceRows) ? args.sourceRows : [];
  const subtitleName = readTrimmedString(args.subtitleName);
  const translateIndex = translateRows.findIndex((row) => row?.id === subtitleName);

  if (translateIndex < 0) {
    return {
      status: 'unresolved',
      reason: 'translate_row_missing',
      diagnostics: {
        subtitleName,
        translateCount: translateRows.length,
      },
    };
  }

  const translateRow = translateRows[translateIndex];
  const canonical = readTrimmedString(translateRow?.vap_tts_reference_subtitle_id);
  if (canonical) {
    return {
      status: 'resolved',
      referenceSubtitleName: canonical,
      strategy: 'canonical',
      translateIndex,
      needsBackfill: false,
      patch: null,
      diagnostics: {
        subtitleName,
      },
    };
  }

  const sourceRow = sourceRows[translateIndex];
  if (!sourceRow || typeof sourceRow !== 'object') {
    return {
      status: 'unresolved',
      reason: 'source_row_missing',
      diagnostics: {
        subtitleName,
        translateIndex,
        sourceCount: sourceRows.length,
      },
    };
  }

  const sourceParentId = readTrimmedString(sourceRow?.vap_source_split_parent_id);
  const sourceId = readTrimmedString(sourceRow?.id);
  const referenceSubtitleName = sourceParentId || sourceId;

  if (!referenceSubtitleName) {
    return {
      status: 'unresolved',
      reason: 'source_reference_missing',
      diagnostics: {
        subtitleName,
        translateIndex,
      },
    };
  }

  const translateParentId = readTrimmedString(translateRow?.vap_split_parent_id);
  const lineageMismatch = Boolean(
    translateParentId &&
    sourceParentId &&
    translateParentId !== sourceParentId
  );

  return {
    status: 'resolved',
    referenceSubtitleName,
    strategy: sourceParentId ? 'source_parent' : 'source_self',
    translateIndex,
    needsBackfill: true,
    patch: {
      vap_tts_reference_subtitle_id: referenceSubtitleName,
    },
    diagnostics: {
      subtitleName,
      translateParentId,
      sourceParentId,
      sourceId,
      lineageMismatch,
    },
  };
}
