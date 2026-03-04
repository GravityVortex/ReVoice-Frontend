# 排障 FAQ（从现象到根因）

本页按“最常见现象”组织，建议配合 `00-system-architecture.md` 的时序图一起看。


## 🔍 快速定位（5 分钟内必须做完）

1. 任务在 DB 里的状态是什么？
   - `vt_task_main.status`：`pending/processing/completed/failed`
2. Java 调度是否在跑？
   - 看 Java 日志是否持续输出 claim/submit
3. Python 是否在回写 progress？
   - Java `InternalApiController` 是否收到 `PUT /api/internal/tasks/{id}/progress`
4. `vt_file_final` 是否有记录？
   - 前端下载/展示只看它；没有就不要去 R2“碰运气”
5. R2 上对象是否存在（仅内部排查用）？
   - 如果对象存在但 `vt_file_final` 没写入，优先查 Java 回调逻辑（可能 503 导致需要重试）


## ❓ 任务一直是 pending，不会动

可能原因（按优先级）：

- Java scheduler 未启用
  - `task.scheduler.enabled`（配置/环境变量）
  - Java 实例未启动或异常重启
- DB 中“并发上限”过小
  - `vt_system_config.max_concurrent_tasks` 太小，running 已满
- Python submit 失败（429/5xx/网络）
  - Java `PythonServiceClient` 调用 `/api/internal/video/translate/jobs` 未返回 202
  - Modal-Key/Secret 配错、base URL 配错（Gateway/Service 混用）

排查建议：
- 查 Java 日志：是否打印了 pending/running/slots 的调度统计
- 查 Render/Docker 运行状态与健康检查是否通过


## ❓ Java 容器启动了，但外部访问不了 / 健康检查失败

高概率是“端口/路径契约不一致”：

- 应用默认 `PORT=18412` 且 `context-path=/video`
- 但 Docker/compose 可能按 8080 + `/api/health` 检查

处理：
- 统一端口与 healthcheck（见 `70-deployment-and-ops.md`）


## ❓ Python 返回 429：服务器繁忙/排队超时

含义：
- 服务的并发门禁已满（VAP/TTS/Speaker 均有 semaphore）
- 继续重试会加剧拥塞

处理建议：
- 客户端按 `Retry-After` 或指数退避重试
- 运维侧：
  - 降低 Java 的 submit 速度（更严格 backoff）
  - 或提升 GPU 实例数量/并发上限（谨防 OOM）


## ❓ TTS 返回 503：runtime recovering / not ready

典型场景：
- 冷启动 / snapshot restore 期间，runtime 尚未 ready

处理：
- 遵循 `Retry-After` 重试
- 生产建议：
  - 在 Modal 侧配置 warmup（提前拉起 runtime）
  - 降低 `tts.max_concurrent_jobs` 避免恢复期雪崩


## ❓ 任务 processing 但进度不再变化

常见根因：

- Python 在某一步卡死（ffmpeg/模型推理/外部 API）
- Python 回写 progress 失败（Java internal 401/404/503）
- presigned URL 过期（上传/下载失败但未正确重试）

排查顺序：
1) 看 Python 日志：最后一个 step 是什么  
2) 看 Java internal 日志：是否持续收到 progress 回调  
3) 看是否存在大量 presigned 请求失败/超时  


## ❓ 成品在 R2 看似存在，但前端下载按钮没有/下载失败

系统设计要求：
- UI 只信 `vt_file_final`（DB 真相源）
- `vt_file_final` 由 Java 在 step completed 时写入

因此可能是：
- Python 没有回写“步骤 completed”
- Java upsert finals 失败并返回 503（Python 应重试回调）

处理：
- 查 `PUT /api/internal/tasks/{id}/progress` 的响应码
- 查 Java 日志中的 “Final file bookkeeping failed / 503”


## ❓ 字幕为空 / SRT 下载内容为空

可能原因：
- Python 没把字幕数据通过 `additionalData.subtitle_*` 回传
- Java 落库失败或 stepName 不一致（`gen_srt`/`translate_srt`）
- 前端读错 stepName

排查：
- 查 `vt_task_subtitle` 是否存在对应 stepName 记录
- 查 Java internal presigned/progress 接口是否打印了“检测到字幕数据并保存”


## ❓ Modal job 一直 PENDING / cancel 不生效

可能原因：
- Job 还没真正 enqueue（Gateway 返回 409）
- Modal 平台侧实例缩容/限额导致排队
- 取消只取消了主 call，但子 call（tts/speaker）仍在跑（需要联动 cancel）

排查：
- 使用 `GET /api/internal/video/translate/jobs/{job_id}` 看 `modal_status`
- 必要时对 job 做 cancel，并确认 gateway 是否清理了 index 记录


## ❓ CORS / 代理问题（SRT/资源无法加载）

系统内已有两类代理：

- 通用请求代理：`/api/request-proxy`（只做 fetch 转发）
- SRT 专用代理：`/api/proxy-srt`（限制允许域名白名单）

若出现 “Domain not allowed”：
- 需要把目标域名加入 `allowedDomains`（以业务要求为准）

