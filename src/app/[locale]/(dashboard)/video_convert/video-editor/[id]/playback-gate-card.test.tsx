import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PlaybackGateCard } from './playback-gate-card';

describe('PlaybackGateCard', () => {
  it('renders a retry-focused state card for network failures', () => {
    const html = renderToStaticMarkup(
      <PlaybackGateCard
        state="network_failed"
        title="这段配音暂时加载失败"
        description="第 12 段的配音暂时无法加载。"
        detail="你可以立即重试，或稍后再试。"
        primaryAction={{ label: '重试本段' }}
        secondaryAction={{ label: '取消播放' }}
      />
    );

    expect(html).toContain('这段配音暂时加载失败');
    expect(html).toContain('重试本段');
    expect(html).toContain('取消播放');
    expect(html).toContain('data-gate-state="network_failed"');
    expect(html).toContain('data-slot="playback-gate-card"');
    expect(html).toContain('data-slot="playback-gate-actions"');
    expect(html).not.toContain('网络失败');
    expect(html).not.toContain('data-gate-emphasis=');
    expect(html).not.toContain('Preview');
  });

  it('renders an unavailable state card with a navigation-style recovery action', () => {
    const html = renderToStaticMarkup(
      <PlaybackGateCard
        state="voice_unavailable"
        title="这段还没有可审听的配音"
        description="请先生成这段配音后再继续审听。"
        detail="播放已停在当前段。"
        primaryAction={{ label: '定位到该段' }}
      />
    );

    expect(html).toContain('这段还没有可审听的配音');
    expect(html).toContain('定位到该段');
    expect(html).toContain('data-gate-state="voice_unavailable"');
    expect(html).not.toContain('需配音');
  });
});
