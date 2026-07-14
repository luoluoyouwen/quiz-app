# 刷题 App / Quiz App

当前版本：`5.0.0`
发布状态：生产候选版，已完成预览环境核查，尚待生产发布确认。

面向化工岗位题库的 React/Vite PWA。应用同时支持本地离线题库和经管理员审核的云端题库，覆盖题库导入、刷题、学习状态、错题复习、拍照搜题、统计、公告反馈及后台管理。

- Preview、Production 地址及 Cloudflare Pages 项目标识由受控部署环境提供，不写入仓库。
- 完整使用帮助：[docs/user-guide.md](docs/user-guide.md)
- 生产发布清单：[docs/production-release-checklist.md](docs/production-release-checklist.md)
- 开发文档：[docs/development-doc.md](docs/development-doc.md)
- 交付文档：[docs/delivery-doc.md](docs/delivery-doc.md)

## 5.0.0 版本定位

5.0.0 是面向正式生产的大版本收口，重点不只是视觉升级，还包括用户协作、数据一致性和安全边界。

- 全站统一深灰蓝设计语言，覆盖首页、登录、加载、题库详情、刷题、统计、个人中心和后台。
- 新增站内公告、用户反馈、管理员按账号回复、公告/反馈删除与回复撤回。
- 统一桌面顶栏、移动端底部导航、栏目独立返回、弹窗返回关闭和滚动锁定。
- 完善“已掌握 / 需复习”口径，按每题最新记录统计并提供需复习入口。
- 修复本地多账号统计隔离、答题记录去重、会话计时和异步写入竞态。
- 题库上传失败会回滚未完成题库，云端删除依赖数据库级联保证事务完整性。
- 管理后台 API、AI 格式整理代理、Supabase RLS 和 SECURITY DEFINER RPC 完成权限加固。
- 路由级分包、OCR 按需加载、PWA 更新策略和加载骨架完成生产化调整。

## 功能概览

| 模块 | 能力 |
| --- | --- |
| 账号与权限 | Supabase Auth；工号/邮箱登录；普通用户与管理员角色；前端守卫、Pages API 鉴权和数据库 RLS 三层约束。 |
| 题库导入 | 支持 DOCX、TXT、JSON、CSV、Markdown；化工岗位 DOCX 可识别题型、下划线填空和题目配图。 |
| 题库管理 | 本地题库、云端题库、审核状态、离线缓存、题型统计、搜索、改名和删除。 |
| 刷题 | 单选、多选、填空、判断、简答、背记题；按题型、随机抽题、题号面板、断点续刷和键盘快捷键。 |
| 学习状态 | 按每题最新记录汇总“已掌握 / 需复习”；答错或“再看一遍”进入复习队列。 |
| 拍照搜题 | 浏览器端 PaddleOCR，支持识别文本编辑、相似题匹配和本地题库搜索。 |
| 同步与离线 | Dexie/IndexedDB 本地持久化；云端进度同步；离页 beacon 兜底；已缓存题库可离线练习。 |
| 公告反馈 | 公告一次提醒、公告中心、反馈提交、管理员回复、状态管理和受控删除。 |
| 后台管理 | 系统概览、题库审核、用户管理、刷题统计、公告反馈、操作日志。 |
| PWA | 可安装、Network First 页面策略、Service Worker 更新提示和安全自动更新。 |
| 响应式界面 | 桌面顶栏、移动端底部导航、深色模式、安全区适配和弹窗背景锁定。 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript 6、Vite 8 |
| UI | Ant Design 6、Lucide/Ant Design Icons、Framer Motion |
| 路由 | React Router 7，页面级 lazy chunk |
| 本地存储 | Dexie 4 / IndexedDB，当前 schema v6 |
| 图表 | Recharts 3 |
| 文件解析 | Mammoth、JSZip、OfficeParser、PapaParse |
| OCR | PaddleOCR，按需加载 |
| 后端 | Supabase Auth、PostgreSQL、RLS |
| 服务端接口 | Cloudflare Pages Functions |
| 部署 | Cloudflare Pages |
| 测试 | Vitest、Testing Library、Playwright 浏览器回归 |

## 架构摘要

```text
Browser PWA
├── React routes and UI
├── Dexie / IndexedDB
├── Service Worker
└── Supabase client
      │
      ├── /api/auth/* and /api/rest/* -> Pages proxy -> Supabase
      ├── /api/ai-normalize          -> authenticated AI proxy
      ├── /api/progress-beacon       -> progress fallback
      ├── /api/announcements         -> user announcements
      ├── /api/feedback              -> user feedback
      └── /api/admin/*               -> service-role admin operations
```

浏览器只能持有 Supabase publishable key。服务角色密钥和 AI 密钥只能配置为 Cloudflare Pages Secret，不能写入前端变量、源码或文档。

## 本地开发

要求：

- Node.js 24 或当前项目兼容的 LTS 版本
- PowerShell 7
- npm
- 有效的 Supabase 开发环境变量

```powershell
npm install
npm run dev
npm test -- --run
npm run lint
npm run build
npm run preview
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务，默认 `http://localhost:5173`。 |
| `npm test -- --run` | 运行单元、组件、解析器和 Pages Function 测试。 |
| `npm run lint` | 运行完整 ESLint；当前生产门禁要求 0 errors。 |
| `npm run build` | TypeScript 构建、Vite 生产构建和 PWA 注入。 |
| `npm run security:check` | 使用服务角色执行基础数据健康检查，只能在可信环境运行。 |

## 环境变量

### 前端

| 变量 | 位置 | 说明 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `.env.local` | Supabase 项目 URL。 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` | 浏览器可用 publishable key。 |
| `VITE_AI_NORMALIZE_PROXY` | `.env.production` | 生产环境应为 `/api/ai-normalize`。 |

### Cloudflare Pages Secrets

| 变量 | 说明 |
| --- | --- |
| `SUPABASE_URL` | Supabase 项目 URL。 |
| `SUPABASE_PUBLISHABLE_KEY` | Pages 代理使用的 publishable key。 |
| `SERVICE_ROLE_KEY` | 后台管理接口使用的服务角色密钥。 |
| `AI_NORMALIZE_API_KEY` | AI 格式整理服务密钥。 |

### 本机部署

| 文件 | 说明 |
| --- | --- |
| `.env.cf` | Cloudflare API Token，仅保存在本机并保持 gitignored。 |
| `.env.normalize` | 本地 AI 调试密钥，仅保存在本机并保持 gitignored。 |

任何文档、日志和截图都不得包含 Token 或服务角色密钥。旧文档曾出现 Cloudflare Token，正式生产前必须轮换并更新 `.env.cf`。

## 数据库迁移

全新环境建议按顺序执行：

1. `supabase/complete-migration.sql`
2. `supabase/announcements-feedback.sql`
3. `supabase/final-security-hardening.sql`
4. `supabase/final-function-access.sql`
5. `supabase/final-performance-hardening.sql`

旧的 `fix-*.sql` 用于历史故障修复，不应替代最终加固脚本。生产执行 SQL 前必须备份，并先在事务或预览环境验证。

## 部署

构建：

```powershell
npm test -- --run
npm run build
```

部署预览：

```powershell
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch preview
```

部署生产：

```powershell
npx wrangler pages deploy dist --project-name $env:CLOUDFLARE_PAGES_PROJECT --branch master
```

生产发布前必须完成 [生产发布清单](docs/production-release-checklist.md)。未经确认不要把预览候选直接推到 `master`。

## 关键目录

```text
functions/api/                  Cloudflare Pages Functions
  [[catchall]].ts               Supabase auth/rest 代理
  ai-normalize.ts               鉴权后的 AI 格式整理代理
  progress-beacon.ts            离页进度兜底
  announcements.ts             用户公告 API
  feedback.ts                  用户反馈 API
  admin/                       管理员 API
src/components/                 通用组件和消息中心
src/pages/                      业务页面
src/hooks/useQuizSession.ts     刷题会话状态与答题写入
src/lib/                        上传、同步、Supabase 和消息中心客户端
src/utils/parsers/              题库解析器
src/utils/search/               拍照搜题匹配
src/utils/learningStatus.ts     学习状态口径
src/utils/changelog.ts          应用版本和应用内更新日志
src/styles/                     主题和视觉契约测试
supabase/                       数据库建表、功能与最终加固 SQL
docs/                           使用、开发、交付和发布文档
```

## 当前质量基线

5.0.0 生产候选当前完整核查结果：

- TypeScript：通过。
- ESLint：0 errors；存在 React 编译器迁移等非阻断 warnings。
- Vitest：154 passed，4 skipped。
- 生产构建：通过。
- 生产依赖审计：0 vulnerabilities。
- Playwright：桌面与 Pixel 7 关键流程通过，控制台 0 errors / 0 warnings。
- 未授权后台、AI 和废弃密码重置接口分别返回预期的 401/401/404。

测试数量会随新增测试变化，发布时以命令实际输出为准。

## 已知限制

- PaddleOCR 和导入器体积较大，已按需加载并排除 OCR 资产的 PWA 预缓存，首次拍照搜题仍可能受网络和设备性能影响。
- Ant Design、导入器和 OCR chunk 会触发构建体积提示，不阻塞 5.0.0。
- 大于 5000 题的本地题库仍建议引入虚拟列表或更细分页。
- 题目图片目前主要以 data URI 存储，后续可迁移到 Supabase Storage 或 Cloudflare R2。
- Supabase Auth 的泄露密码保护需要在 Dashboard 手动开启。

## 文档维护约定

- 发版时同时更新 `package.json`、`package-lock.json` 和 `src/utils/changelog.ts`。
- 用户操作变化同时更新应用内帮助和 `docs/user-guide.md`。
- 权限、数据库或 API 变化同时更新 `docs/development-doc.md` 与发布清单。
- 部署完成后更新 `docs/status-and-issues.md`，记录生产部署 ID 和验证结果。
