# Video Editor Closed-Loop Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复视频编辑页里会破坏字幕编辑、时间轴保存、配音生成保存、merge 恢复的闭环断点，保证网络异常和并发操作下页面仍可恢复、可解释、可继续。

**Architecture:** 保持现有 `video-editor-page-shell -> runtime/* -> workstation/preview` 分层不变，只收拢错误的 owner 和状态协议。修复按 `字幕编辑 owner -> 时间轴持久化与 id 重映射 -> 配音请求竞态 -> merge 恢复与刷新入口` 顺序推进，并用测试冻结关键链路。

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Testing Library

---

## Chunk 1: 字幕编辑 Owner 收口

### Task 1: 让预览区字幕编辑回到工作台 owner

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.test.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`

- [ ] **Step 1: 写失败测试，冻结预览区只读/编辑协议**
- [ ] **Step 2: 让预览编辑走工作台 owner，而不是直接改 document track**
- [ ] **Step 3: 下线预览区假拖拽能力或改成明确只读**
- [ ] **Step 4: busy 行禁用 textarea，避免生成/保存期间继续编辑**
- [ ] **Step 5: 运行相关测试并确认通过**

## Chunk 2: 时间轴保存与 id 重映射

### Task 2: 修正 pendingTimingMap 清理与本地状态迁移

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-editor-state.ts`
- Modify: `src/shared/lib/subtitle-voice-state.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation-state.test.ts`
- Test: `src/shared/lib/subtitle-voice-state.test.ts`

- [ ] **Step 1: 写失败测试，证明时间轴保存成功后不会清掉飞行中的新 pending**
- [ ] **Step 2: 抽出 pending timing reconcile helper，按请求快照差量清理**
- [ ] **Step 3: 抽出字幕 id remap helper，统一迁移本地语音相关集合**
- [ ] **Step 4: 验证 split 子段在重映射后状态仍一致**
- [ ] **Step 5: 运行结构编辑与状态测试并确认通过**

## Chunk 3: 配音生成 / 保存竞态

### Task 3: 防止晚到响应覆盖用户新编辑

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-row-item.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`

- [ ] **Step 1: 写失败测试，证明旧 convert/save 响应不会覆盖新文本**
- [ ] **Step 2: 为 convert/save 引入请求文本快照校验**
- [ ] **Step 3: 仅在文本未变化时应用返回结果，否则保持需重新生成/保存**
- [ ] **Step 4: 运行工作台测试并确认通过**

## Chunk 4: Merge 恢复与刷新入口

### Task 4: 统一 merge 终态清锁与服务端刷新入口

**Files:**
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.ts`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-page-shell.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.tsx`
- Modify: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace.test.ts`

- [ ] **Step 1: 写失败测试，冻结 task 终态后 active job 清锁与刷新入口行为**
- [ ] **Step 2: 让 merge owner 在 task 终态时强制收敛 active job / manual retry**
- [ ] **Step 3: 让工作台刷新按钮走 bootstrap detail reload，而不是本地重建**
- [ ] **Step 4: 运行 merge / workspace 测试并确认通过**

## Chunk 5: 回归验证

### Task 5: 运行核心闭环回归

**Files:**
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-preview-panel.test.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/subtitle-workstation.test.tsx`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/structural/use-video-editor-structural-edit.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/runtime/merge/use-video-editor-merge.test.ts`
- Test: `src/app/[locale]/(dashboard)/video_convert/video-editor/[id]/video-editor-workspace.test.ts`
- Test: `src/shared/lib/subtitle-voice-state.test.ts`

- [ ] **Step 1: 运行本轮新增/修改测试**
- [ ] **Step 2: 运行 video-editor 关键回归测试**
- [ ] **Step 3: 若有失败，逐项修复直到核心闭环稳定**
