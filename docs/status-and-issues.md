# 刷题 App 5.0 状态与遗留事项

> 当前版本：5.0.0
> 当前阶段：生产候选文档收口
> 更新时间：2026-07-13

## 1. 当前结论

代码层面已完成主要功能、安全和浏览器回归，可以进入生产发布准备阶段。

本次文档更新已将跨版本资料统一到 5.0.0。生产尚未发布，不能把“源码已升版”视为“线上已升版”。

## 2. 已完成范围

- 全站设计语言与深色模式统一。
- 桌面顶栏和移动端底部导航。
- 题库导入、审核、缓存、详情和题目列表。
- 选择、判断、填空、简答和背题体验。
- 已掌握、需复习和错题重刷。
- 拍照搜题。
- 统计和多账号本地数据隔离。
- 公告、反馈、回复、删除和撤回。
- 后台系统概览、题库、用户、统计和日志。
- PWA 更新、离线、返回、滚动和弹窗锁定。
- 路由级分包和 chunk 加载恢复。
- Pages API 与 Supabase 权限加固。
- 上传回滚、答题去重、写入串行和计时修正。
- README、应用内帮助、开发、交付和发布文档。

## 3. 最近验证基线

| 项目 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| ESLint error gate | 0 errors |
| 完整 ESLint | 0 errors，114 warnings |
| Vitest | 154 passed，4 skipped |
| npm production audit | 0 vulnerabilities |
| Vite/PWA build | 通过 |
| Playwright desktop | 通过 |
| Playwright Pixel 7 | 通过 |
| Console | 0 errors / 0 warnings |
| API 未授权检查 | 401 / 401 / 404 |
| Supabase advisor 关键性能项 | 无 initplan、重复 permissive、重复索引或未索引 FK 问题 |

版本号与文档变更后已重新通过 TypeScript、ESLint error gate、154/4 测试与生产构建；正式发布前仍应按清单再跑一遍。

## 4. 生产发布阻断项

以下事项完成前不部署生产：

1. 轮换旧 V3 文档中出现过的 Cloudflare API Token。
2. 更新本机 `.env.cf` 并验证新 Token 可部署 Preview。
3. 在 Supabase Auth 开启泄露密码保护。
4. 重新运行 5.0.0 自动化门禁。
5. 在新 Preview 上完成普通用户和管理员冒烟测试。
6. 明确确认生产部署。

## 5. 非阻断技术债

### React 与 ESLint

完整 ESLint 仍有 114 条 warnings，主要是：

- React hooks/compiler 对 effect 中 setState 的新规则。
- render-time ref 读写。
- exhaustive-deps。
- 存量 any。
- 旧解析器正则转义和不规则空白。

本次 error gate 为 0。建议后续按组件拆分逐批清理，不在生产发布前做大范围行为重构。

### 包体与加载

- Ant Design chunk 较大。
- 导入器 chunk 超过通用建议阈值。
- OCR worker 和模型体积很大。
- OCR 已按需加载并排除 PWA precache。
- 路由已按页面分包。

后续可继续拆分后台、导入器和 OCR，但不阻断 5.0.0。

### 数据与存储

- 题目图片主要使用 data URI，数据库和 IndexedDB 体积会增长。
- 建议迁移到 Supabase Storage 或 Cloudflare R2。
- 超大题库需要虚拟列表或服务端分页。

### 运维

- 尚未接入独立的前端错误监控平台。
- page view 计数 RPC 可匿名调用，属于低风险遥测接口，后续可增加限流。
- 发布后应观察 Cloudflare Functions 5xx 和 Supabase API 错误。

## 6. 文档状态

| 文档 | 状态 |
| --- | --- |
| README | 已更新 5.0.0 |
| 应用内更新日志 | 已更新 5.0.0 |
| 应用内使用帮助 | 已更新 |
| 完整用户指南 | 已新增 |
| 开发文档 | 已重写为 5.0 当前架构 |
| 交付文档 | 已更新 5.0.0 |
| 后台升级记录 | 已更新 |
| 生产发布清单 | 已新增 |
| V3 Agent 提示词 | 已脱敏并归档 |

## 7. 下一步

严格按 `docs/production-release-checklist.md` 执行：

1. 密钥轮换。
2. 自动化门禁。
3. Preview 部署。
4. 普通用户与管理员冒烟。
5. 生产确认。
6. Production 部署和发布后观察。
