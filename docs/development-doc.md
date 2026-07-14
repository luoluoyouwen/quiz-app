# 刷题 App 5.0 开发文档

> 项目：Quiz App
> 版本：5.0.0
> 状态：生产候选版
> 更新日期：2026-07-13
> 项目路径：通过本地 `QUIZ_APP_ROOT` 环境变量提供，不写入仓库

本文档描述 5.0.0 的当前实现。历史 V3/V4 方案和旧修复 SQL 仅作追溯，不再作为运行时事实来源。

## 1. 项目目标

刷题 App 是面向化工岗位培训题库的 PWA，核心目标：

- 从岗位 DOCX 等文件稳定解析结构化题目。
- 在移动端和桌面端提供一致的刷题体验。
- 断网时继续使用已缓存题库，联网后同步进度。
- 通过题库审核、公告反馈和操作日志支持内部运营。
- 保证不同账号、不同题库和管理员能力之间的数据边界。
- 在 Cloudflare Pages 与 Supabase 架构下保持可部署、可回滚和可审计。

## 2. 当前技术基线

| 层 | 技术 |
| --- | --- |
| UI | React 19、TypeScript 6、Ant Design 6 |
| 构建 | Vite 8、Rolldown |
| 路由 | React Router 7 |
| 动画 | Framer Motion / Motion |
| 本地数据 | Dexie 4、IndexedDB schema v6 |
| 云端数据 | Supabase PostgreSQL |
| 认证 | Supabase Auth |
| 服务端 | Cloudflare Pages Functions |
| PWA | vite-plugin-pwa、Workbox injectManifest |
| 图表 | Recharts 3 |
| 导入 | Mammoth、JSZip、OfficeParser、PapaParse |
| OCR | PaddleOCR，动态加载 |
| 测试 | Vitest、Testing Library、Playwright |

## 3. 总体架构

```text
Client
├── App shell
│   ├── AuthProvider / ThemeProvider
│   ├── Desktop topbar / mobile bottom tabs
│   ├── route-level Suspense
│   ├── modal scroll lock
│   └── PWA update prompt
├── Feature routes
│   ├── Home
│   ├── BankDetail
│   ├── Practice
│   ├── Stats
│   ├── Profile
│   └── AdminDashboard
├── Local data
│   └── Dexie / IndexedDB
└── Cloud client
    └── Supabase SDK with Pages proxy

Cloudflare Pages
├── static assets
├── /api/auth/* and /api/rest/*
├── /api/ai-normalize
├── /api/progress-beacon
├── /api/announcements
├── /api/feedback
└── /api/admin/*

Supabase
├── Auth
├── PostgreSQL
├── RLS
├── constrained RPCs
└── audit data
```

## 4. 应用外壳与路由

路由定义在 `src/App.tsx`。

| 路径 | 页面 | 权限 |
| --- | --- | --- |
| `/` | Home | 已登录 |
| `/bank/:id` | BankDetail | 已登录且题库可见 |
| `/practice/:bankId` | Practice | 已登录且题库可见 |
| `/stats` | Stats | 已登录 |
| `/profile` | Profile | 已登录 |
| `/admin` | AdminDashboard | admin |
| `*` | 重定向到首页 | 已登录 |

所有页面使用 `lazyWithChunkReload` 分包。动态 chunk 在版本切换后加载失败时，应用只自动刷新一次，避免无限刷新循环。

### 4.1 导航

- 桌面端使用统一固定顶栏。
- 移动端使用题库、统计、我的、管理底部 Tab。
- 管理 Tab 只对管理员显示。
- 题库详情和刷题路径会让题库 Tab 保持激活。
- 主栏目分别记录滚动位置。
- 栏目内返回逐层进行，跨栏目切换使用替换导航，避免循环历史。
- URL 中的 `modal` 参数让系统返回键优先关闭弹窗。

### 4.2 弹窗滚动锁

`src/utils/modalScrollLock.ts` 监听 Ant Design Modal：

1. 记录当前滚动位置。
2. 给 `html` 添加 `quiz-modal-scroll-locked`。
3. 把 body 固定在原位置。
4. 弹窗关闭时恢复 body 样式与滚动位置。

所有新增 Modal 都应继续使用 Ant Design 的 `.ant-modal-wrap`，否则全局锁定器无法识别。

## 5. 本地数据模型

数据库定义在 `src/db.ts`，名称为 `QuizApp`，当前版本为 v6。

| 表 | 主键与索引 | 用途 |
| --- | --- | --- |
| `banks` | `++id, userId, name, createdAt` | 当前账号的本地题库和云端缓存。 |
| `questions` | `++id, bankId, type` | 本地题目。 |
| `sessions` | `++id, userId, bankId, startedAt` | 本地练习会话。 |
| `sessionAnswers` | `++id, userId, sessionId, questionId` | 单题最新作答。 |
| `userProgress` | `++id, userId, questionId, bankId, syncStatus` | 云端进度本地队列。 |
| `sm2Data` | `++id, key` | 间隔复习数据。 |

### 5.1 账号隔离

`banks`、`sessions`、`sessionAnswers` 和 `userProgress` 都包含 `userId`。页面查询必须先按当前 Supabase user id 过滤。

禁止使用“当前浏览器全部 sessions”作为统计源，否则切换账号后会串数据。

### 5.2 v6 迁移

v6 会按 `userId + sessionId + questionId` 查找历史重复答案，并保留最新记录。新增迁移时：

- 只能追加新的 `db.version(n)`。
- 不删除历史 schema。
- 升级函数必须可处理空表和旧字段。
- 为迁移逻辑增加独立测试。

## 6. 云端数据模型

主要表：

| 表 | 用途 |
| --- | --- |
| `profiles` | 用户扩展信息和角色。 |
| `question_banks` | 云端题库、所有者和审核状态。 |
| `questions` | 云端结构化题目。 |
| `user_progress` | 每次题目进度记录。 |
| `practice_sessions` | 云端练习会话。 |
| `page_views` | 访问计数。 |
| `audit_logs` | 管理操作日志。 |
| `announcements` | 公告正文、级别和发布时间。 |
| `announcement_reads` | 每个用户的公告已读状态。 |
| `feedback_items` | 用户反馈、状态和管理员回复。 |

题库审核状态：

| 状态 | 上传者 | 管理员 | 其他用户 |
| --- | --- | --- | --- |
| approved | 可见 | 可见 | 可见 |
| pending | 可见 | 可见 | 不可见 |
| rejected | 可见 | 可见 | 不可见 |

`questions.bank_id` 外键使用 `ON DELETE CASCADE`。管理员删除题库时只删除父题库，避免“题目已删但题库删除失败”的半完成状态。

## 7. 认证与权限

权限边界分三层。

### 7.1 前端层

- `AuthContext` 管理 Supabase 会话。
- 未登录时显示 Login。
- `AdminRoute` 阻止非管理员进入后台。
- 前端限制只用于体验，不能作为安全边界。

### 7.2 Pages Functions 层

管理员接口流程：

1. 读取 bearer token。
2. 调用 Supabase Auth 验证用户。
3. 查询 profile 并确认 role 为 admin。
4. 通过 `SERVICE_ROLE_KEY` 执行受控操作。
5. 写入 audit log。

管理员 API：

| 路径 | 方法 | 功能 |
| --- | --- | --- |
| `/api/admin/users` | GET/POST/PATCH/DELETE | 用户、角色、密码和删除。 |
| `/api/admin/banks` | GET/PATCH/DELETE | 题库列表、审核、改名和删除。 |
| `/api/admin/logs` | GET | 操作日志。 |
| `/api/admin/announcements` | GET/POST/PATCH/DELETE | 公告管理。 |
| `/api/admin/feedback` | GET/PATCH/DELETE | 回复、撤回、关闭和删除反馈。 |

用户 API：

| 路径 | 方法 | 功能 |
| --- | --- | --- |
| `/api/announcements` | GET/POST | 获取有效公告、标记已读。 |
| `/api/feedback` | GET/POST/DELETE | 查询、提交和受控删除自己的反馈。 |
| `/api/progress-beacon` | POST | 离页进度兜底。 |
| `/api/ai-normalize` | POST | 鉴权后的 AI 格式整理。 |
| `/api/auth/*` | 多种 | Supabase Auth 代理。 |
| `/api/rest/*` | 多种 | Supabase REST/RPC 代理。 |

旧 `/api/admin/reset-password` 已移除。密码重置只允许通过 `/api/admin/users`，且服务端会验证管理员身份。

### 7.3 数据库层

最终权限脚本：

- `final-security-hardening.sql`
- `final-function-access.sql`
- `final-performance-hardening.sql`

关键规则：

- profile 只允许用户读取自己的记录。
- 普通用户新建题库必须归属自己并保持 pending。
- 普通用户不能把题库改成 approved。
- 普通用户不能直接提升角色。
- user_progress、practice_sessions、feedback 和 announcement_reads 按 `auth.uid()` 隔离。
- 不再使用的 SECURITY DEFINER RPC 会撤销 authenticated 执行权。
- 必要管理统计 RPC 必须在函数体内再次检查 `is_admin()`。

服务角色密钥绝不能进入浏览器 bundle。

## 8. 题库导入

入口组件：`src/components/ImportModal.tsx`。

解析器目录：`src/utils/parsers/`。

| 格式 | 主要实现 |
| --- | --- |
| DOCX | `docx.ts`、`docx-xml.ts`、`exam.ts` |
| TXT | `txt.ts` |
| CSV | `csv.ts` |
| JSON | `json.ts` |
| Markdown | `markdown.ts` |

### 8.1 DOCX 主链路

```text
DOCX
├── read document.xml and relationships
├── preserve underline blanks
├── extract paragraphs and image anchors
├── parse sections by question type
├── bind images to matched question text
├── optional authenticated AI normalization
└── preview before save/upload
```

四套岗位题库是解析回归样本，每套约 350 题。涉及 DOCX 的修改至少验证：

- 总题数。
- 各题型数量。
- nofill 数量。
- 下划线答案是否泄漏在题干。
- 图片是否绑定到正确题目。
- 长答案和多空填空是否完整。

### 8.2 AI 格式整理

生产链路：

```text
browser -> authenticated POST /api/ai-normalize -> DeepSeek chat API
```

Function 会：

- 只接受 POST。
- 先验证 Supabase 会话。
- 限制请求体、system prompt 和 user content 长度。
- 固定模型和生成参数。
- 不向未授权请求暴露配置状态。
- 超时或失败时让前端回退规则解析。

## 9. 上传与审核

`src/lib/uploadService.ts` 负责创建题库和批量写入题目。

上传顺序：

1. 检查内容哈希。
2. 创建 `question_banks`。
3. 每 500 题写入一批 questions。
4. 任一批失败时删除未完成父题库。
5. 清理也失败时保留原始异常为 `cause` 并报告两个错误。

普通用户上传的题库只能是 pending。管理员在后台通过 Pages API 批准、驳回、改名或删除。

## 10. 刷题引擎

核心模块：

- `src/utils/quiz/engine.ts`
- `src/hooks/useQuizSession.ts`
- `src/pages/Practice.tsx`

支持题型：

- `choice`
- `multi`
- `fill`
- `judge`
- `essay`
- `nofill`

### 10.1 会话规则

- 新练习和重新开始会重置开始时间。
- 单题时间从进入该题开始计算。
- 答案写入按 Promise 队列串行化。
- 同一会话同一题使用 upsert 语义，避免重复记录。
- 结束会话前等待所有答案写入完成，再计算统计。
- 断点信息按题库、题型和题号集合区分，有效期 24 小时。

### 10.2 背题与简答

简答题默认采用背题策略，不再显示无意义的客观题判分流程。

- 已掌握：写入正确/掌握状态。
- 再看一遍：写入需复习状态。
- 操作完成后进入下一题。

### 10.3 快捷键

- 左右方向键翻题。
- 数字键、A-E 和小键盘数字选项。
- Enter 提交。
- Space 下一题。
- 输入控件获得焦点时不触发全局选择快捷键。

## 11. 学习状态与同步

学习状态实现：`src/utils/learningStatus.ts`。

同一道题可能存在多次历史记录，计算时必须先按时间取最新一条：

- 最新记录正确或“已掌握” -> mastered。
- 最新记录错误或“再看一遍” -> review。
- 没有记录 -> untracked。

云端题库从 `user_progress` 读取；本地题库从 session answers 读取。首页与题库详情必须复用同一口径。

### 11.1 自动同步

`src/lib/syncService.ts` 监听网络恢复，把 `syncStatus=pending` 的记录回写云端。

### 11.2 离页兜底

Practice 在 pagehide/unmount 时使用 `/api/progress-beacon`。服务端限制：

- 请求体不超过 512 KB。
- 每次 1 到 500 行。
- 必须有有效 bearer token。
- 每行用户 id 由服务端会话确定，不信任客户端伪造身份。

## 12. 公告与反馈

客户端：

- `src/lib/messageCenter.ts`
- `src/components/UserMessageActions.tsx`
- `src/components/MessageCenterAdmin.tsx`
- `HomeAnnouncementPopup`

### 12.1 公告

- 管理员支持草稿、定时、生效和过期状态。
- 用户 API 只返回当前有效公告。
- 首页只弹出第一条未读公告。
- sessionStorage 防止同一会话重复弹出。
- 点击“知道了”会写入 `announcement_reads`。
- 公告中心仍可查看全部当前有效公告。

### 12.2 反馈

输入边界：

- category 使用 allowlist。
- title 最长 60。
- content 最长 800。
- admin reply 最长 1000。

用户只能删除自己的、状态为 open 且没有非空管理员回复的反馈。管理员可以删除反馈、撤回回复、重新回复或关闭。所有管理删除动作写入审计日志，不保存被删正文到日志。

## 13. 后台管理

后台 Tab：

1. 系统概览
2. 题库审核
3. 用户管理
4. 刷题统计
5. 公告反馈
6. 操作日志

系统概览的用户和题库数据通过受保护 Pages API 获取，避免依赖宽松 profile RLS。

用户管理保护：

- 新用户创建 profile 失败时回滚 Auth 用户。
- 密码至少 8 位且同时包含字母和数字。
- 管理员不能在当前请求中降级自己。
- 删除、角色修改和密码重置写入日志。

## 14. PWA、缓存与更新

配置：`vite.config.ts`、`sw-custom.js`、`PwaUpdatePrompt.tsx`。

- 使用 injectManifest。
- 页面导航使用 Network First，超时 3 秒。
- 静态构建文件预缓存。
- OCR 大资产 `worker-entry-*` 和 `dist-*` 不进入 PWA 预缓存。
- Service Worker 激活后 claim clients 并通知页面。
- Practice、Admin、脏表单、输入焦点和打开弹窗时禁止自动应用更新。
- 其他安全页面可自动切换，也保留手动更新入口。

PWA 看到旧 UI 时优先使用更新提示；仍未更新再关闭重开或强刷。

## 15. 性能策略

- 所有路由页面 lazy load。
- Ant Design、React、Supabase、Dexie、Recharts 和导入器使用 manual chunk。
- OCR 只在拍照搜题时加载。
- 云端题库详情需要获取题目与进度，首次打开受网络和题库大小影响。
- 大题库列表仍使用分页；超过 5000 题时应评估虚拟列表。

构建中的大 chunk warning 目前主要来自 Ant Design、导入器和 OCR，不是构建失败。

## 16. 测试与质量门禁

当前 5.0.0 生产候选基线：

- Vitest：154 passed，4 skipped。
- TypeScript：通过。
- ESLint error gate：0 errors。
- 生产依赖 audit：0 vulnerabilities。
- Vite/PWA 生产构建：通过。
- Playwright：桌面 1440 和 Pixel 7 关键路径通过。
- 浏览器控制台：0 errors / 0 warnings。

运行：

```powershell
npx tsc -b --pretty false
npx eslint . --quiet
npm test -- --run
npm audit --omit=dev --registry=https://registry.npmjs.org
npm run build
git diff --check
```

Windows 沙箱下 Vite/Vitest 偶尔出现 `spawn EPERM`。先在正常 PowerShell 7 终端重跑，不要把它误判为代码失败。

完整 ESLint 仍有 React 编译器迁移、旧解析器正则和存量 any warnings。新增代码不得增加 error，hooks 警告应在后续重构批次逐步清理。

## 17. 环境变量

### 前端

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_AI_NORMALIZE_PROXY=/api/ai-normalize`

### Pages Secrets

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SERVICE_ROLE_KEY`
- `AI_NORMALIZE_API_KEY`

### 本机

- `.env.cf`
- `.env.normalize`

禁止把真实 Token、service role 或 AI key 写入源码和 Markdown。5.0.0 发布前需要轮换曾出现在旧 V3 文档中的 Cloudflare Token。

## 18. 数据库初始化与迁移

全新环境：

1. `complete-migration.sql`
2. `announcements-feedback.sql`
3. `final-security-hardening.sql`
4. `final-function-access.sql`
5. `final-performance-hardening.sql`

历史 `fix-admin.sql`、`fix-delete.sql`、`fix-rls.sql` 只用于追溯旧问题。现有生产数据库继续以最终 hardening 脚本和实际 schema 为准。

所有生产 SQL：

- 先备份。
- 先在事务中 dry run。
- 检查 advisor 和 grants。
- 保存执行时间与结果。
- 不在前端发版过程中临时追加未验证 SQL。

## 19. 开发与部署

本地：

```powershell
Set-Location $env:QUIZ_APP_ROOT
npm install
npm run dev
```

预览：

```powershell
npm test -- --run
npm run build
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch preview
```

生产：

```powershell
npm run build
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch master
```

Cloudflare Pages 项目标识通过 `CLOUDFLARE_PAGES_PROJECT` 提供，实际值不写入仓库。

完整步骤见 `docs/production-release-checklist.md`。

## 20. 维护约定

### 20.1 版本

发版时必须同步：

- `package.json`
- `package-lock.json`
- `src/utils/changelog.ts`
- `README.md`
- `docs/user-guide.md`
- `docs/delivery-doc.md`
- `docs/status-and-issues.md`

### 20.2 功能变更

- 用户操作变化更新应用内帮助和用户指南。
- API 变化更新 API 表和 handler tests。
- 数据库变化新增迁移，不直接修改已执行迁移的历史含义。
- 学习状态变化更新 `learningStatus.test.ts`。
- 返回逻辑变化更新 `navigation.test.ts`。
- PWA 更新策略变化更新 `pwaUpdateStrategy.test.ts`。
- 弹窗变化更新 `modalScrollLock.test.ts`。

### 20.3 生产诊断

生产代码通过 `src/utils/debug.ts` 控制调试输出。可恢复网络失败不应直接产生生产 console warning；真正阻断错误应进入 ErrorBoundary 或用户可见错误状态。

## 21. 已知技术债

| 项目 | 当前处理 | 后续方向 |
| --- | --- | --- |
| React hooks/compiler warnings | 非阻断，error gate 为 0 | 拆分大组件并消除 render-time ref 写入。 |
| AdminDashboard/Practice 体积 | 路由级分包 | 继续拆成 feature components/hooks。 |
| OCR 体积 | 动态加载并排除预缓存 | 评估远端模型缓存或更轻 OCR。 |
| 题目图片 data URI | 当前可用 | 迁移 Storage/R2。 |
| 大题库渲染 | 分页 | 引入虚拟列表。 |
| 前端错误监控 | ErrorBoundary 和日志 | 增加生产遥测与告警。 |
| 泄露密码检测 | 需 Dashboard 开启 | 列为生产发布必检项。 |

## 22. 文档索引

- `README.md`：项目入口。
- `docs/user-guide.md`：完整用户操作。
- `docs/delivery-doc.md`：5.0 交付范围与验收。
- `docs/status-and-issues.md`：当前状态和剩余事项。
- `docs/admin-upgrade-plan.md`：后台升级完成记录。
- `docs/production-release-checklist.md`：生产发布与回滚清单。
- `docs/v3-upgrade-prompt.md`：已脱敏的历史归档说明。
