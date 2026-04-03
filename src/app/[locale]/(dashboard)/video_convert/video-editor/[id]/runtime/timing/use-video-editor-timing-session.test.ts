import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('use video editor timing session source boundary', () => {
  const source = readFileSync(new URL('./use-video-editor-timing-session.ts', import.meta.url), 'utf8');

  it('reads the latest pending timing map when a persist request settles so newer dirty edits are not cleared by an older response', () => {
    expect(source).toContain('const pendingTimingMapRef = useRef(pendingTimingMap);');
    expect(source).toContain('pendingTimingMapRef.current = pendingTimingMap;');
    expect(source).toContain('currentPendingTimingMap: pendingTimingMapRef.current,');
    expect(source).not.toContain('currentPendingTimingMap: pendingTimingMap,');
    expect(source).toContain('const currentPendingTimingMap = pendingTimingMapRef.current;');
    expect(source).toContain('const items = buildPendingTimingPersistItems(currentPendingTimingMap);');
  });
});
