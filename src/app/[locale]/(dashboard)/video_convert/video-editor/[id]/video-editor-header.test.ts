import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('video editor header shell boundary', () => {
  const shellSource = readFileSync(new URL('./video-editor-page-shell.tsx', import.meta.url), 'utf8');

  it('lets the page shell delegate header rendering to VideoEditorHeader', () => {
    const headerSource = readFileSync(new URL('./video-editor-header.tsx', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { VideoEditorHeader } from './video-editor-header';");
    expect(shellSource).toContain('<VideoEditorHeader');
    expect(shellSource).not.toContain('<HeaderDownloadActions');
    expect(shellSource).not.toContain("aria-label={t('header.backToProject')}");

    expect(headerSource).toContain('export function VideoEditorHeader(');
    expect(headerSource).toContain('<HeaderDownloadActions');
    expect(headerSource).toContain("aria-label={props.t('header.backToProject')}");
  });
});
