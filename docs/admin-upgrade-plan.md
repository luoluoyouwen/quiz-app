# 管理后台 5.0 升级完成记录

> 原文件用途：管理后台升级计划
> 当前状态：主要计划已完成
> 更新日期：2026-07-13

## 1. 功能完成情况

| 模块 | 状态 | 当前实现 |
| --- | --- | --- |
| 系统概览 | 已完成 | 用户数、题库数、题目数、待审核、存储和今日访问。 |
| 题库审核 | 已完成 | 审核、驳回、改名、删除、题目查看和 JSON 导出。 |
| 用户管理 | 已完成 | 创建、删除、角色、密码重置和自我降级保护。 |
| 刷题统计 | 已完成 | 全站统计、活跃用户和错题排行。 |
| 公告发布 | 已完成 | 草稿、定时、发布、置顶、过期、修改和删除。 |
| 反馈处理 | 已完成 | 按账号查看、回复、撤回回复、关闭和删除。 |
| 操作日志 | 已完成 | 管理操作通过服务端记录。 |
| 移动端后台 | 已完成 | 滚动 Tab、响应式卡片、底部管理入口和深色模式。 |

## 2. 服务端接口

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/admin/users` | GET/POST/PATCH/DELETE | 用户管理。 |
| `/api/admin/banks` | GET/PATCH/DELETE | 题库管理。 |
| `/api/admin/logs` | GET | 日志查询。 |
| `/api/admin/announcements` | GET/POST/PATCH/DELETE | 公告管理。 |
| `/api/admin/feedback` | GET/PATCH/DELETE | 反馈管理。 |

所有接口必须：

1. 校验 bearer token。
2. 调用 Supabase Auth 验证用户。
3. 验证 profile.role 为 admin。
4. 限制请求体和字段。
5. 对管理变更写入 audit log。

## 3. 安全收口

- 旧 `/api/admin/reset-password` 已删除。
- 密码重置统一走 `/api/admin/users`。
- profile 读取 RLS 已收紧为本人。
- 后台概览不依赖宽松 profile SELECT。
- 普通用户不能批准自己的题库。
- 管理员不能降级当前自己的账号。
- 创建 profile 失败时回滚新建 Auth 用户。
- 题库删除使用外键级联。
- 公告和反馈删除保留元数据审计，不把正文复制到日志。

## 4. 公告与反馈数据

表：

- `announcements`
- `announcement_reads`
- `feedback_items`

公告状态由发布开关、发布时间和过期时间共同决定。用户只读取当前有效公告。

用户反馈删除条件：

- 属于当前用户。
- 状态为 open。
- 没有非空管理员回复。

管理员可删除任意反馈或只撤回回复。撤回回复后状态回到 open。

## 5. 已有测试

- `functions/api/admin/users.test.ts`
- `functions/api/admin/feedback.test.ts`
- `functions/api/feedback.test.ts`
- `src/lib/messageCenter.test.ts`

发布前还需要浏览器冒烟覆盖每个后台 Tab。

## 6. 后续优化

这些项目不阻断 5.0.0：

- 后台组件继续拆分，降低 `AdminDashboard.tsx` 复杂度。
- 为表格增加服务端分页和筛选。
- 增加批量审核。
- 增加题库解析质量报告。
- 接入错误监控和审计告警。
- 增加 API 级速率限制。
