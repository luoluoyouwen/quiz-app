# 刷题 App 5.1 交付文档

> 交付版本：5.1.0
> 交付状态：生产候选版
> 文档日期：2026-07-16
> 部署地址：由受控部署环境提供，不写入仓库

## 1. 交付说明

5.1.0 基于 5.0.0 生产基线继续完成题库加载与 PWA 更新体验优化。累计交付范围包括：

- 全站统一设计语言与响应式页面。
- 本地和云端题库全流程。
- 刷题、背题、学习状态、错题复习和统计。
- 拍照搜题与多格式题库导入。
- 按账号隔离的云端题库持久缓存与后台版本校验。
- PWA 安装、离线、自动更新、手动检查更新和返回逻辑。
- 管理后台、站内公告、意见反馈和操作日志。
- Pages Functions 鉴权、Supabase RLS/RPC 和数据一致性加固。
- 用户、开发、交付和生产发布文档。

生产环境尚未在本次文档任务中发布。正式部署必须完成 `production-release-checklist.md`。

## 2. 用户角色

| 角色 | 能力 |
| --- | --- |
| 普通用户 | 登录、查看可见题库、导入本地题库、上传待审核题库、缓存云端题库、刷题、复习、统计、公告和反馈。 |
| 管理员 | 普通用户全部能力，以及系统概览、题库审核、用户管理、全站统计、公告发布、反馈回复和操作日志。 |

权限不是只靠前端隐藏按钮。管理员操作同时受 Pages Functions bearer 验证、角色检查和数据库策略约束。

## 3. 交付功能

### 3.1 登录与应用外壳

- 工号或邮箱登录。
- 登录状态恢复和退出。
- 统一 App Logo。
- 桌面端固定顶栏。
- 移动端题库、统计、我的、管理底部导航。
- 深色模式持久化。
- 页面级加载骨架。
- 未知路由回首页。
- 路由 chunk 加载失败单次自恢复。

### 3.2 题库

- DOCX、TXT、JSON、CSV、Markdown 导入。
- 岗位标准题库 DOCX 下划线填空识别。
- 题目配图提取和按题目文本锚定。
- 内容哈希去重。
- 本地题库与云端题库。
- 云端题库审核、改名和删除。
- 离线缓存。
- 在线题库缓存优先渲染，后台按内容哈希校验，变化后才重新下载。
- 题型统计、搜索、筛选和分页。
- 题库上传失败自动回滚。

### 3.3 刷题

- 单选、多选、填空、判断、简答和背记题。
- 全部题型、按题型、随机抽题和需复习练习。
- 断点续刷。
- 题号选择器。
- 键盘、小键盘和移动端手势。
- 选项正确、错误和已选择状态。
- 简答题默认背题。
- 已掌握和再看一遍状态记录。
- 练习结果和错题回顾。
- 答案串行写入和去重。
- 会话计时与结束统计。

### 3.4 学习状态与统计

- 每题最新记录决定已掌握或需复习。
- 本地和云端使用同一统计口径。
- 首页题库卡片显示学习状态。
- 题库详情显示练习统计和成绩趋势。
- 统计页按当前账号隔离。
- 需复习队列可直接重刷。

### 3.5 拍照搜题

- 浏览器端 PaddleOCR。
- OCR 按需加载。
- 相机入口和图片上传。
- 识别文本可编辑。
- 对错字、漏字、数字和单位具有容错匹配。
- 搜索当前设备上的本地和已缓存题库。

### 3.6 公告反馈

- 管理员公告草稿、定时、发布、置顶、过期、编辑和删除。
- 用户首页未读公告提醒一次。
- 公告中心和已读状态。
- 用户按类型提交反馈。
- 管理员按账号查看和回复。
- 管理员撤回回复、关闭和删除反馈。
- 用户删除未回复的 open 反馈。
- 所有管理操作受鉴权并记录审计信息。

### 3.7 管理后台

- 系统概览。
- 题库审核。
- 用户创建、删除、角色修改和密码重置。
- 刷题统计。
- 公告反馈。
- 操作日志。
- 自我降级保护。
- 新用户 profile 创建失败回滚。
- 移动端横向滚动 Tab 和响应式数据卡。

### 3.8 PWA

- 可安装到桌面或主屏幕。
- Network First 页面导航。
- 静态资源预缓存。
- OCR 大资产排除预缓存。
- 安全自动更新和手动更新提示。
- “我的 → 检查更新”可立即拉取、激活并切换到新版本。
- 刷题、后台、脏表单和弹窗中禁止强制刷新。
- 各主栏目独立返回和滚动位置。
- 弹窗背景锁定。

## 4. 技术交付

### 4.1 前端

```text
React 19
├── TypeScript 6
├── Vite 8
├── React Router 7
├── Ant Design 6
├── Dexie 4
├── Recharts 3
├── Framer Motion
├── Mammoth / JSZip / OfficeParser / PapaParse
└── PaddleOCR
```

### 4.2 服务端

```text
Cloudflare Pages Functions
├── Supabase auth/rest proxy
├── authenticated AI normalization
├── progress beacon
├── announcements
├── feedback
└── admin APIs

Supabase
├── Auth
├── PostgreSQL
├── RLS
├── constrained SECURITY DEFINER RPCs
└── audit data
```

## 5. 数据库交付

主要表：

- `profiles`
- `question_banks`
- `questions`
- `user_progress`
- `practice_sessions`
- `page_views`
- `audit_logs`
- `announcements`
- `announcement_reads`
- `feedback_items`

本地 IndexedDB：

- `banks`
- `questions`
- `sessions`
- `sessionAnswers`
- `userProgress`
- `sm2Data`

最终加固 SQL：

- `supabase/final-security-hardening.sql`
- `supabase/final-function-access.sql`
- `supabase/final-performance-hardening.sql`

## 6. 质量验收基线

5.1.0 当前功能候选已完成：

| 检查 | 结果 |
| --- | --- |
| TypeScript | 通过 |
| ESLint error gate | 0 errors |
| Vitest | 166 passed / 4 skipped |
| 生产构建 | 通过 |
| 生产依赖 audit | 0 vulnerabilities |
| 桌面 Playwright | 5.0.0 全量基线通过 |
| Pixel 7 Playwright | 5.0.0 全量基线通过 |
| 横向溢出 | 5.0.0 全量基线未发现 |
| 弹窗背景锁定 | 5.0.0 全量基线通过 |
| 5.1.0 定向浏览器回归 | 题库缓存、Profile 检查更新通过；无业务错误，存在已知 AntD message 开发警告 |
| 未授权 admin API | 401 |
| 未授权 AI API | 401 |
| 废弃 reset-password API | 404 |

发布时必须重新运行门禁，以上数量仅为当前基线。

## 7. 交付文件

| 文件 | 用途 |
| --- | --- |
| `README.md` | 项目入口和快速运行。 |
| `docs/user-guide.md` | 完整用户帮助。 |
| `docs/development-doc.md` | 当前架构和维护说明。 |
| `docs/delivery-doc.md` | 本交付范围。 |
| `docs/status-and-issues.md` | 当前状态和未完成项。 |
| `docs/admin-upgrade-plan.md` | 后台升级完成记录。 |
| `docs/production-release-checklist.md` | 发布、冒烟和回滚。 |
| `src/utils/changelog.ts` | 应用内版本与更新日志。 |

## 8. 环境和密钥

前端只允许使用 publishable key。以下值必须配置为 Cloudflare Pages Secrets：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SERVICE_ROLE_KEY`
- `AI_NORMALIZE_API_KEY`

本机 Cloudflare Token 只存放在 gitignored 的 `.env.cf`。旧 V3 文档曾保存过 Token，生产发布前必须轮换。

## 9. 部署

Preview：

```powershell
npm test -- --run
npm run build
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch preview
```

Production：

```powershell
npm run build
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch master
```

Cloudflare Pages 项目标识通过 `CLOUDFLARE_PAGES_PROJECT` 提供，实际值不写入仓库。

## 10. 生产前置条件

- 轮换旧文档暴露的 Cloudflare Token。
- 开启 Supabase 泄露密码保护。
- 重新执行自动化门禁。
- 用普通用户和管理员账号完成 Preview 冒烟。
- 记录当前生产版本和回滚入口。
- 获得明确的生产部署确认。
