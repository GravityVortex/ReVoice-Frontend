# Dense Run Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign dense subtitle runs so they read like a native compressed subtitle strip in a professional NLE timeline instead of a stack of bright vertical markers.

**Architecture:** Keep the existing dense-run layout and item-anchor interaction model unchanged. Only retune the render-layer visual hierarchy inside `subtitle-track.tsx`, lowering the default visual presence of dense runs, hiding boundary seams at rest, and surfacing local detail only for active states.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest

---

## Chunk 1: Retune Dense-Run Visual Hierarchy

### Task 1: Rebuild the dense run as a native compressed subtitle strip

**Files:**
- Modify: `src/shared/components/video-editor/subtitle-track.tsx`

- [ ] **Step 1: Lower the default contrast so the run blends into the timeline track**
- [ ] **Step 2: Hide boundary seams in the resting state**
- [ ] **Step 3: Reveal local segment detail only for selected / playing / playhead states**
- [ ] **Step 4: Preserve existing data attributes and item anchors**

## Chunk 2: Verify No Behavioral Regression

### Task 2: Run focused validation

**Files:**
- Verify: `src/shared/components/video-editor/subtitle-track.tsx`
- Verify: `src/shared/components/video-editor/subtitle-track.test.tsx`

- [ ] **Step 1: Run dense-run tests**

Run: `pnpm -s vitest run src/shared/components/video-editor/subtitle-track.test.tsx`
Expected: PASS

- [ ] **Step 2: Run focused timeline regression**

Run: `pnpm -s vitest run src/shared/lib/timeline/collision.test.ts src/shared/components/video-editor/subtitle-track-layout.test.ts src/shared/components/video-editor/subtitle-track.test.tsx 'src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/timeline-panel.test.tsx'`
Expected: PASS

- [ ] **Step 3: Run lint on touched files**

Run: `pnpm -s eslint src/shared/components/video-editor/subtitle-track.tsx src/shared/components/video-editor/subtitle-track.test.tsx`
Expected: PASS
