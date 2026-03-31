# Dense Run Subtitle Timeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-item micro subtitle special-casing with a dense-run timeline model that represents locally high-density subtitle sequences professionally while preserving true item timing and item-level interactions.

**Architecture:** Keep one true `pxPerSec` source in `timeline-panel`, have `subtitle-track-layout` output both item entries and dense runs, and let `subtitle-track` render runs while preserving transparent item anchors for click/drag/select behavior. Dense runs become a visual aggregation layer, not a data entity.

**Tech Stack:** Next.js, React 19, TypeScript, Tailwind CSS, Vitest

---

## Chunk 1: Replace the Old Test Assumptions

### Task 1: Rewrite layout tests around dense-run detection

**Files:**
- Modify: `src/shared/components/video-editor/subtitle-track-layout.test.ts`
- Modify: `src/shared/components/video-editor/subtitle-track-layout.ts`

- [ ] **Step 1: Write the failing test for dense-run grouping**

```ts
it('groups adjacent high-density clips into one dense run', () => {
  const layout = buildSubtitleTrackLayout({
    items: [
      clip('a', 114.84, 0.1),
      clip('b', 114.94, 0.06),
      clip('c', 115.0, 0.04),
    ],
    totalDuration: 120,
    pxPerSec: 50,
  });

  expect(layout.runs).toHaveLength(1);
  expect(layout.runs[0].mode).toBe('dense');
  expect(layout.runs[0].itemIds).toEqual(['a', 'b', 'c']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -s vitest run src/shared/components/video-editor/subtitle-track-layout.test.ts`
Expected: FAIL because the current layout API does not return runs.

- [ ] **Step 3: Write the failing test for dense-run boundaries preserving true time**

```ts
it('keeps dense-run boundaries on the true item start positions', () => {
  const layout = buildSubtitleTrackLayout({
    items: [
      clip('a', 114.84, 0.1),
      clip('b', 114.94, 0.06),
      clip('c', 115.0, 0.04),
    ],
    totalDuration: 120,
    pxPerSec: 50,
  });

  expect(layout.runs[0].boundaries.map((b) => b.itemId)).toEqual(['a', 'b', 'c']);
  expect(layout.runs[0].boundaries.map((b) => b.leftPct)).toEqual([
    (114.84 / 120) * 100,
    (114.94 / 120) * 100,
    (115.0 / 120) * 100,
  ]);
});
```

- [ ] **Step 4: Write the failing test for short clips that should NOT become a dense run**

```ts
it('does not group short clips with enough visual gap into a dense run', () => {
  const layout = buildSubtitleTrackLayout({
    items: [
      clip('a', 10, 0.08),
      clip('b', 10.4, 0.08),
    ],
    totalDuration: 20,
    pxPerSec: 50,
  });

  expect(layout.runs.map((run) => run.mode)).toEqual(['compact', 'compact']);
});
```

- [ ] **Step 5: Run tests to verify they fail for the expected reason**

Run: `pnpm -s vitest run src/shared/components/video-editor/subtitle-track-layout.test.ts`
Expected: FAIL because `runs` and dense grouping are not implemented yet.

## Chunk 2: Implement Dense-Run Layout Data

### Task 2: Upgrade `buildSubtitleTrackLayout` to return entries plus runs

**Files:**
- Modify: `src/shared/components/video-editor/subtitle-track-layout.ts`
- Modify: `src/shared/components/video-editor/subtitle-track-layout.test.ts`

- [ ] **Step 1: Implement new layout result types**

Add:

- `SubtitleTrackDenseBoundary`
- `SubtitleTrackLayoutRun`
- `SubtitleTrackLayoutResult`

- [ ] **Step 2: Implement dense-run detection**

Rules must consider:

- `widthPx`
- `gapPx`
- run size
- boundary visibility budget

Return:

- `entries` for item-level interaction
- `runs` for rendering

- [ ] **Step 3: Keep true item geometry untouched**

Ensure:

- `entry.leftPct` always equals true start time
- `entry.widthPct` always equals true duration
- no right-pushing logic remains

- [ ] **Step 4: Run layout tests**

Run: `pnpm -s vitest run src/shared/components/video-editor/subtitle-track-layout.test.ts`
Expected: PASS

## Chunk 3: Replace Item-Level Micro Rendering With Run Rendering

### Task 3: Rewrite `SubtitleTrack` to render runs but keep item anchors

**Files:**
- Modify: `src/shared/components/video-editor/subtitle-track.tsx`
- Modify: `src/shared/components/video-editor/subtitle-track.test.tsx`

- [ ] **Step 1: Rewrite the old micro tests to target dense-run behavior**

Add failing tests for:

- `data-visual-mode="dense-run"`
- dense run exposes internal boundaries
- selected item still has a distinct highlight inside a dense run
- title still contains millisecond precision

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -s vitest run src/shared/components/video-editor/subtitle-track.test.tsx`
Expected: FAIL because current DOM is item-centric.

- [ ] **Step 3: Implement run rendering**

In `subtitle-track.tsx`:

- render `runs` first
- `normal` and `compact` runs keep existing item visuals
- `dense` runs render one continuous band plus internal boundary ticks
- selected and playing states highlight the matching boundary / local segment only

- [ ] **Step 4: Preserve item-level interaction**

Keep per-item transparent anchors or hit layers so:

- click selects one item
- drag starts from one item
- ripple/clamp logic continues to use item ids

- [ ] **Step 5: Keep split/scissor alignment**

Move split scissor calculations to consume layout boundary data rather than ad-hoc render adjacency if needed.

- [ ] **Step 6: Run the focused tests**

Run:
- `pnpm -s vitest run src/shared/components/video-editor/subtitle-track.test.tsx`
- `pnpm -s vitest run src/shared/components/video-editor/subtitle-track-layout.test.ts`

Expected: PASS

## Chunk 4: Integrate and Regress

### Task 4: Verify upstream density and editing behavior still hold

**Files:**
- Modify if needed: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx`
- Modify if needed: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx`
- Keep unchanged if possible: `src/shared/lib/timeline/collision.ts`

- [ ] **Step 1: Preserve the real density source-of-truth**

Ensure `SubtitleTrack` still receives `pxPerSec={minPxPerSec}`.

- [ ] **Step 2: Run upstream tests**

Run:
- `pnpm -s vitest run 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`
- `pnpm -s vitest run src/shared/lib/timeline/collision.test.ts`

Expected: PASS

- [ ] **Step 3: Run the complete focused test set**

Run:
- `pnpm -s vitest run src/shared/lib/timeline/collision.test.ts src/shared/components/video-editor/subtitle-track-layout.test.ts src/shared/components/video-editor/subtitle-track.test.tsx 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`

Expected: PASS

- [ ] **Step 4: Run lint on touched files**

Run:
- `pnpm -s eslint src/shared/components/video-editor/subtitle-track-layout.ts src/shared/components/video-editor/subtitle-track-layout.test.ts src/shared/components/video-editor/subtitle-track.tsx src/shared/components/video-editor/subtitle-track.test.tsx 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx' 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`

Expected: PASS

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`

Verify:

- adjacent dense subtitle sequences render as one dense run, not fake overlaps
- dense run boundaries remain legible
- selecting one item in a dense run highlights only that item’s local boundary/segment
- split subtitles and scissor marks still align
- drag still works on item-level anchors

- [ ] **Step 6: Commit**

```bash
git add \
  src/shared/components/video-editor/subtitle-track-layout.ts \
  src/shared/components/video-editor/subtitle-track-layout.test.ts \
  src/shared/components/video-editor/subtitle-track.tsx \
  src/shared/components/video-editor/subtitle-track.test.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.tsx \
  src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx \
  docs/superpowers/specs/2026-03-27-micro-subtitle-timeline-design.md \
  docs/superpowers/plans/2026-03-27-micro-subtitle-timeline.md
git commit -m "feat: add dense-run subtitle timeline rendering"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-27-micro-subtitle-timeline.md`. Ready to execute?
