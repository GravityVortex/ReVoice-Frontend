# Video Convert Progressive UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a progressive UI flow across the video gallery, task list, and task detail pages so users naturally move from content browsing to task management to result handling.

**Architecture:** Keep the existing three-layer navigation model and refactor only the presentation layer. The outer page becomes a wide media-card layout, the task list becomes a structured row list, and the detail page remains a left-preview/right-workbench layout with refined spacing and hierarchy.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, existing UI primitives in `src/shared/components/ui`

---

## Chunk 1: 外部视频页改成宽卡

### Task 1: 重构外部视频列表的卡片形态

**Files:**
- Modify: `src/shared/components/ui/video-list.tsx`
- Modify: `src/app/[locale]/(landing)/video_convert/myVideoList/page.tsx`

- [ ] **Step 1: 定义宽卡目标结构**

把当前 3 列内容卡调整为内容导向的宽卡结构：
- 左侧 16:9 大封面
- 右侧标题、简述、轻状态、轻元信息
- 保留进入详情与必要的轻操作

- [ ] **Step 2: 先保留现有状态逻辑，调整展示层级**

不要新增状态计算逻辑，只重排当前已有的：
- `status`
- `duration`
- `convertedAt`
- `videoSize`

预期：外部页仍是视频内容入口，不展开详细任务处理信息。

- [ ] **Step 3: 调整容器节奏**

让页面整体更像内容流：
- 减少“控制台式网格卡片”感
- 提升横向媒体卡的舒展感
- 保持移动端单列自然堆叠

- [ ] **Step 4: 运行验证**

Run: `pnpm exec eslint src/shared/components/ui/video-list.tsx 'src/app/[locale]/(landing)/video_convert/myVideoList/page.tsx'`
Expected: 无错误输出

## Chunk 2: 内部任务页改成列表行

### Task 2: 重构项目详情页中的任务列表视图

**Files:**
- Modify: `src/shared/blocks/video-convert/project-detail-view.tsx`
- Optional Modify: `src/config/locale/messages/zh/video_convert/projectDetail.json`
- Optional Modify: `src/config/locale/messages/en/video_convert/projectDetail.json`

- [ ] **Step 1: 锁定仅修改 `viewMode === 'list'` 的视觉结构**

不要改变页面路由和视图切换逻辑，只重构列表态：
- 保留顶部文件信息
- 保留任务点击进入详情
- 把当前卡片感进一步收成列表行感

- [ ] **Step 2: 强化状态入口**

每一行应清晰展示：
- 语言对
- 任务状态
- 时间 / 时长 / 积分等关键判断信息
- 处理中时的轻进度反馈

- [ ] **Step 3: 避免和外部宽卡重复**

内部页不能继续强调大封面和内容感，而要强调：
- 结构
- 可比较
- 可继续处理

- [ ] **Step 4: 运行验证**

Run: `pnpm exec eslint src/shared/blocks/video-convert/project-detail-view.tsx`
Expected: 无错误输出

## Chunk 3: 详情工作台做统一收口

### Task 3: 细化详情页工作台的统一语言

**Files:**
- Modify: `src/shared/blocks/video-convert/project-detail-view.tsx`
- Test: `src/shared/lib/project-detail-workbench.test.ts`

- [ ] **Step 1: 保持左预览右工作台模式不变**

不要再改详情页的基础结构，只微调：
- 视频区与容器的贴合度
- 右侧时间信息和三张卡片的节奏
- 左右同高时的自然分布

- [ ] **Step 2: 统一三层状态语言**

检查外部页、任务列表页、详情页的状态表现是否统一：
- 处理中
- 已完成
- 失败

保持颜色和语义一致，但不要让三个页面看起来重复。

- [ ] **Step 3: 跑现有测试**

Run: `pnpm test src/shared/lib/project-detail-workbench.test.ts`
Expected: `4 passed`

- [ ] **Step 4: 跑类型检查并记录存量问题**

Run: `pnpm exec tsc --noEmit --pretty false`
Expected: 若仍失败，只允许出现当前仓库已知存量问题；不要新增本次改动相关类型错误。

