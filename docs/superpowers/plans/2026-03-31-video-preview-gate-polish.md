# Video Preview Gate Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将视频编辑页右侧预览区的播放阻断卡重做为更轻量、和当前舞台风格一致的状态舱，同时保持现有阻断逻辑和操作闭环不变。

**Architecture:** 仅调整右侧预览区内的视觉表达层，不改播放状态机、不改阻断判定、不改按钮动作语义。`video-preview-panel` 继续负责按阻断状态组装文案，`playback-gate-card` 负责新的轻量状态舱视觉结构与状态层级。

**Tech Stack:** React, Next.js, Tailwind CSS, Vitest

---

### Task 1: 锁定新的预览阻断卡视觉契约

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate-card.test.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.test.tsx`

- [ ] **Step 1: 写失败测试，锁住轻量状态舱应暴露的结构语义**
- [ ] **Step 2: 运行相关测试，确认先按预期失败**

### Task 2: 实现右侧预览区轻量状态舱

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate-card.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx`

- [ ] **Step 1: 为阻断卡补充更贴合播放器舞台的状态 badge / 层级 / 轻量动作区**
- [ ] **Step 2: 调整预览区挂载位置与容器气质，让等待态像播放器内建反馈**

### Task 3: 回归验证

**Files:**
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate-card.test.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.test.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/playback-gate.test.ts`

- [ ] **Step 1: 运行右侧预览与阻断卡相关测试**
- [ ] **Step 2: 运行 `pnpm exec tsc --noEmit` 做类型验证**
