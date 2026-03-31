# 视频编辑页全链路核查计划

> **目标**：基于当前重构后的主链，对视频编辑页所有真实功能路径做完整核查；发现问题立即修复并回归，直到本轮无法再发现新的明确问题。

## 功能矩阵

- [x] 路由入口与页面壳：`page.tsx`、`video-editor-page-shell.tsx`
- [x] 初始化与详情刷新：`runtime/bootstrap/*`、`video-editor-reload-contract.ts`
- [x] 文档 owner 与统一时间轴：`runtime/document/*`
- [x] 字幕工作台本地状态：`subtitle-workstation.tsx`、`subtitle-workstation-state.ts`
- [x] 翻译/配音生成/应用：`subtitle-workstation.tsx`、`subtitle-job-poll.ts`
- [x] 主播放与试听播放：`runtime/playback/use-video-editor-playback.ts`、`audio-audition-engine.ts`
- [x] 播放阻塞 UI：`playback-gate.ts`、`playback-gate-card.tsx`、`video-preview-panel.tsx`、`timeline-panel.tsx`
- [x] 合成与状态恢复：`runtime/merge/use-video-editor-merge.ts`、`video-merge-state.ts`
- [x] 时间轴切割/撤销/时间持久化：`runtime/structural/use-video-editor-structural-edit.ts`、`video-editor-structural-edit.ts`
- [x] 工作台桥接与结构桥接：`runtime/bridge/*`
- [x] 布局/快捷键/未保存离开保护：`runtime/layout/*`、`runtime/keybindings/*`、`runtime/orchestration/*`
- [x] 头部下载链与按钮门控：`video-editor-header.tsx`、`header-download-actions.tsx`
- [x] API 契约回归：`auto-save-draft` 相关测试、编辑页相关接口调用链
- [x] 全量验证：video-editor 全测试 + TypeScript

## 本轮核查规则

- [x] 仅核查当前真实页面主链，历史未引用组件不计入现网闭环
- [x] 每条链至少同时验证：owner 边界、任务切换隔离、网络失败出口、用户反馈
- [x] 每发现一个问题，必须补修复与对应验证，不留口头结论
- [x] 每轮修复后重新执行整组编辑页测试与 `tsc --noEmit`
- [x] 只有在“本轮没有新的明确问题 + 验证命令全部通过”时才允许停止

## 本轮新增修复

- [x] `video-editor-page-shell.tsx`：结构时间持久化 bridge 改为 `useLayoutEffect` 同步，补掉“刚改 timing 就点更新视频”时的竞态窗口。
- [x] `video-sync-controller.ts`：`apply()` 返回真实播放启动结果，避免 controller 层吞掉 `play()` 失败。
- [x] `runtime/playback/use-video-editor-playback.ts`：`applyVideoTransportSnapshot()` 向上传递 controller 的布尔结果，convert 试听启动失败时能正确回收 audition owner。
- [x] `runtime/playback/use-video-editor-playback.ts`：视频 warmup 超时直接失败返回，不再继续对未就绪 video 调 `play()`。
- [x] `runtime/playback/use-video-editor-playback.ts`：`user-play`、`blocked-retry`、`subtitle-buffering-resume` 三条启动链统一改成“先确认 `syncStarted` 成功，再切到播放态”；失败时统一回落到可重试的 `network_failed` 卡片。
- [x] `runtime/playback/use-video-editor-playback.ts`：`network_failed` 在当前时间点没有可解析字幕片段时，仍可按当前 transport 时间直接 Retry，不再出现点击重试无响应。
- [x] `runtime/playback/use-video-editor-playback.test.ts`、`page-playback-guards.test.ts`：补齐播放启动失败闭环断言，覆盖用户播放、阻塞重试、buffer resume 与无 clip Retry 兜底。

## 验证结果

- [x] `pnpm exec vitest run "src/app/[locale]/(dashboard)/video_convert/video-editor/[id]" "src/app/api/video-task/auto-save-draft/route.test.ts"` 通过，`38` 个测试文件、`193` 个用例通过。
- [x] `pnpm exec tsc --noEmit` 通过。
