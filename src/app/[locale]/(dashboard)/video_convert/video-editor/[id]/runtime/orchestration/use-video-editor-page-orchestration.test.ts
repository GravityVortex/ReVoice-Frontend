import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('use video editor page orchestration shell boundary', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');
  const hookSource = readFileSync(new URL('./use-video-editor-page-orchestration.ts', import.meta.url), 'utf8');
  const enProjectDetailMessages = JSON.parse(
    readFileSync(new URL('../../../../../../../../config/locale/messages/en/video_convert/projectDetail.json', import.meta.url), 'utf8')
  ) as Record<string, unknown>;
  const zhProjectDetailMessages = JSON.parse(
    readFileSync(new URL('../../../../../../../../config/locale/messages/zh/video_convert/projectDetail.json', import.meta.url), 'utf8')
  ) as Record<string, unknown>;

  const readMessage = (messages: Record<string, unknown>, path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (current, segment) =>
          current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined,
        messages
      );
  const detailMessageKeys = [...hookSource.matchAll(/tDetail\('([^']+)'\)/g)].map(([, key]) => key);

  it('lets the page shell delegate page-level bridge orchestration to useVideoEditorPageOrchestration', () => {
    expect(shellSource).toContain(
      "import { useVideoEditorPageOrchestration } from './runtime/orchestration/use-video-editor-page-orchestration';"
    );
    expect(shellSource).toContain('} = useVideoEditorPageOrchestration({');
    expect(shellSource).not.toContain('const router = useRouter();');
    expect(shellSource).not.toContain('useUnsavedChangesGuard(hasUnsavedChanges)');
    expect(shellSource).not.toContain('const backUrl =');
    expect(shellSource).not.toContain('const handleBackClick = useCallback(() => {');
    expect(shellSource).not.toContain('const handleUnsavedDialogOpenChange = useCallback(');
    expect(shellSource).not.toContain('const headerDownloadLabels = useMemo(');
    expect(shellSource).not.toContain('const headerDownloadTooltipText =');
    expect(shellSource).not.toContain("const structuralEditBlockedMessage = t('videoEditor.tooltips.structuralEditBlocked');");
    expect(shellSource).not.toContain('resetDocumentSessionState();');
    expect(shellSource).not.toContain('hydrateTaskStateFromDetail(loadedTaskMainItem);');

    expect(hookSource).toContain('const router = useRouter();');
    expect(hookSource).toContain('useUnsavedChangesGuard(hasUnsavedChanges)');
    expect(hookSource).toContain('const backUrl =');
    expect(hookSource).toContain('const handleBackClick = useCallback(() => {');
    expect(hookSource).toContain('const handleUnsavedDialogOpenChange = useCallback(');
    expect(hookSource).toContain('const headerDownloadLabels = useMemo(');
    expect(hookSource).toContain('const headerDownloadTooltipText =');
    expect(hookSource).toContain("const structuralEditBlockedMessage = t('videoEditor.tooltips.structuralEditBlocked');");
    expect(hookSource).toContain('resetDocumentSessionState();');
    expect(hookSource).toContain('hydrateTaskStateFromDetail(loadedTaskMainItem);');
  });

  it('exposes the orchestration api consumed by shell header, timeline dock, and leave guard', () => {
    expect(hookSource).toContain('showLeaveDialog,');
    expect(hookSource).toContain('confirmLeave,');
    expect(hookSource).toContain('cancelLeave,');
    expect(hookSource).toContain('handleBackClick,');
    expect(hookSource).toContain('handleUnsavedDialogOpenChange,');
    expect(hookSource).toContain('headerDownloadLabels,');
    expect(hookSource).toContain('headerDownloadTooltipText,');
    expect(hookSource).toContain('structuralEditBlockedMessage,');
  });

  it('reads the final-video download label from the existing projectDetail locale contract', () => {
    expect(hookSource).toContain("downloadFinalVideo: tDetail('ui.workbench.deliverables.downloadVideo')");
    expect(readMessage(enProjectDetailMessages, 'ui.workbench.deliverables.downloadVideo')).toBe('Download final video');
    expect(readMessage(zhProjectDetailMessages, 'ui.workbench.deliverables.downloadVideo')).toBe('下载成片');
  });

  it('keeps every projectDetail message lookup used by orchestration resolvable in en and zh locales', () => {
    expect(detailMessageKeys).toEqual([
      'ui.workbench.deliverables.downloadVideo',
      'buttons.download',
      'audio.download',
      'audio.downloadBg',
      'subtitle.download_yuan',
      'subtitle.download_tran',
      'subtitle.download_double',
    ]);

    detailMessageKeys.forEach((key) => {
      expect(readMessage(enProjectDetailMessages, key), `en missing ${key}`).toEqual(expect.any(String));
      expect(readMessage(zhProjectDetailMessages, key), `zh missing ${key}`).toEqual(expect.any(String));
    });
  });
});
