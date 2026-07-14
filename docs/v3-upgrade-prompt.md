# V3 升级提示词归档

> 状态：已归档，不再作为当前实施说明
> 原适用版本：2.x -> 3.0
> 当前版本：5.0.0
> 脱敏日期：2026-07-13

该文件原用于一次性 V3 升级，内容已被 5.0 的实际实现和文档取代。旧版本曾包含部署 Token 和项目连接值，现已全部移除。

当前维护入口：

- 项目概览：`../README.md`
- 开发文档：`development-doc.md`
- 使用帮助：`user-guide.md`
- 交付文档：`delivery-doc.md`
- 当前状态：`status-and-issues.md`
- 生产发布：`production-release-checklist.md`

安全要求：

- 不在 Markdown、提示词、日志或截图中保存 API Token、service role key 或 AI key。
- Cloudflare Token 只保存在 gitignored 的 `.env.cf`。
- Supabase 和 AI 服务端密钥只保存在 Cloudflare Pages Secrets。
- 曾经写入旧文档的 Cloudflare Token 必须在 5.0 生产发布前轮换。

历史 V3 方案如需追溯，应从受控版本历史读取，不应复制其中的旧连接信息或部署凭据。
