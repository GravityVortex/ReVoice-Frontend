'use client';

import { useCallback, useRef } from 'react';

import type { SubtitleWorkstationHandle } from '../../subtitle-workstation';

export function useVideoEditorWorkstationBridge() {
  const workstationRef = useRef<SubtitleWorkstationHandle>(null);

  const scrollToWorkstationItem = useCallback((id: string) => {
    workstationRef.current?.scrollToItem(id);
  }, []);

  const prepareForVideoMerge = useCallback(async () => workstationRef.current?.prepareForVideoMerge(), []);

  const requestVideoSave = useCallback(async () => workstationRef.current?.onVideoSaveClick(), []);

  const prepareForStructuralEdit = useCallback(async () => workstationRef.current?.prepareForStructuralEdit(), []);

  const commitPreviewSubtitleText = useCallback((id: string, text: string) => {
    return workstationRef.current?.commitPreviewSubtitleText(id, text) ?? false;
  }, []);

  return {
    workstationRef,
    scrollToWorkstationItem,
    prepareForVideoMerge,
    requestVideoSave,
    prepareForStructuralEdit,
    commitPreviewSubtitleText,
  };
}
