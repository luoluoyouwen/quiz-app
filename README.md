# 刷题 App — Quiz App

> 纯前端离线刷题 PWA + Supabase 后端云端同步 · 化工行业题库专用 · 支持单选 / 多选 / 填空 / 判断 / 简答 · 自动挖空 · 深色模式 · AI 格式整理 · 账号系统 · 管理员后台

---

## 功能一览

| 功能 | 说明 |
|------|------|
| 🔐 **账号系统** | 工号+密码登录/注册（SMYH 格式），持久化 90 天免登录 |
| 📂 **多题库管理** | 创建/删除题库，数据按 `bankId` 完全隔离 |
| ☁️ **云端上传** | 登录后上传自动同步到 Supabase，全员共享 |
| ✅ **题库审核** | 上传后标记 pending，管理员批准后全员可见 |
| 📥 **五格式导入** | .txt · .json · .csv · .docx · .md |
| 🔢 **五类题型** | 单选题、多选题、填空题、判断题、简答题 |
| 🤖 **AI 格式整理** | DOCX 导入时自动 AI 规整排版；部署版通过 CF Pages Function 代理，API key 不暴露 |
| ✏️ **自动挖空** | 填空题自动将答案替换为 `____`，支持 `、` 枚举多空 |
| 🧠 **背题模式** | 显示答案 → 自评「记住了 / 没记住」 |
| 🚀 **一键开刷** | 主按钮直接进全部题型练习，齿轮图标选特定题型/随机抽题 |
| 📊 **统计图表** | 练习趋势折线图，最近 20 次正确率可视化 |
| 🔄 **云端进度同步** | 多端刷题进度实时同步，联网自动回写 |
| 📴 **离线可用 + 在线兜底** | 已缓存的题库断网可刷，联网自动回写进度 |
| 🔍 **题目搜索** | 实时搜索题目内容、答案、选项 |
| ❌ **错题本** | 答错自动收集，支持错题重刷，随错随记 |
| ⏯️ **断点续刷** | 按题型独立保存进度，离开后 24 小时内可继续 |
| 📱 **左右滑动** | 右滑上一题、左滑下一题 |
| 📋 **题目导航** | 网格视图，已答/未答/当前题分色标识 |
| 🌙 **深色模式** | 右上角切换，持久化偏好 |
| 🖼️ **DOCX 配图自动提取** | 导入 DOCX 时自动提取内嵌图片并展示 |
| 🔄 **PWA 自动更新** | 检测新版本后提示刷新 |
| 🛡️ **管理员后台** | 系统概览、题库审核（批准/驳回）、用户管理（角色/密码重置） |

---

## 快速开始

### 本地开发

```bash
npm install            # 安装依赖
npm run dev            # 本地开发（默认 http://localhost:5173）
npm run build          # 构建生产版本
npm run preview        # 预览构建产物
```

### 环境变量

| 文件 | 用途 | 是否提交 |
|------|------|----------|
| `.env.local` | Supabase URL + publishable key | ❌ `.gitignore` |
| `.env.normalize` | 本地开发 AI 格式整理的 DeepSeek API key | ❌ `.gitignore` |
| `.env.normalize.example` | 模板文件（含占位符） | ✅ |
| `.env.production` | 生产构建时指定 AI 代理路径 | ✅（不含 key） |
| `.env.cf` | Cloudflare API token + Account ID | ❌ `.gitignore` |

#### Supabase 配置（`.env.local`）

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

### 部署

```bash
# 一键部署（需 CLOUDFLARE_API_TOKEN 在环境变量中）
bash deploy-cf.sh

# 或手动
npm run build
npx wrangler pages deploy dist/ --project-name=quiz-app
```

#### 部署后额外配置

1. **AI 格式整理**：在 CF Pages 后台 → 设置 → 环境变量 → 添加 `AI_NORMALIZE_API_KEY`（Secret）
2. **Supabase RLS**：上传 `supabase-migration-*.sql` 到 Supabase SQL Editor 执行
3. **首个管理员**：注册第一个工号后，在 Supabase SQL Editor 执行 `UPDATE profiles SET role='admin' WHERE email='xxx@local.app'`
4. **密码重置 RPC**：执行 `CREATE FUNCTION admin_reset_password` SQL（详见 [docs/development-doc.md](./docs/development-doc.md) 第 16 章）

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite + PWA 插件 (injectManifest) |
| UI | Ant Design 6 |
| 路由 | React Router 7 |
| 离线存储 | Dexie (IndexedDB) |
| **云端后端** | **Supabase (Singapore)** |
| **Auth** | **Supabase Auth（邮箱/密码）** |
| 后端代理 | Cloudflare Pages Functions |
| 部署 | Cloudflare Pages |

---

## 架构概览

```
┌──────────────────────────────────────────────────┐
│                    浏览器 PWA                      │
│  ┌────────────┐         ┌────────────────────┐   │
│  │  Dexie     │  ←sync→ │  Supabase SDK      │   │
│  │  (离线缓存)  │         │  (cloud api)        │   │
│  └────────────┘         └─────────┬──────────┘   │
│                                    │               │
└────────────────────────────────────┼───────────────┘
                                     │
                          ┌──────────┴──────────┐
                          │  CF Pages Functions  │
                          │  ├─ /api/auth/*      │
                          │  ├─ /api/rest/*      │
                          │  ├─ /api/ai-normalize│
                          │  └─ /api/admin/*     │
                          └──────────┬──────────┘
                                     │
                          ┌──────────┴──────────┐
                          │  Supabase (Singapore)│
                          │  ├─ PostgreSQL        │
                          │  ├─ Auth              │
                          │  └─ Storage           │
                          └─────────────────────┘
```

**数据流：**
- **上传**：用户上传 → Supabase（标记 pending）→ 缓存到本地 Dexie（`☁️ {uuid}`）
- **刷题**：在线拉取云端进度 → 提交时批量写入 Supabase → 本地缓存
- **离线**：已缓存的题库离线可刷 → 进度标记 pending → 联网自动回写
- **审核**：管理员在后台批准/驳回 → 全员可见性变更

---

## 项目结构

```
quiz-app/
├── functions/                  # CF Pages Functions
│   └── api/
│       ├── [[catchall]].ts     # Supabase API 反向代理（auth/rest）
│       ├── ai-normalize.ts     # AI 格式整理代理
│       └── admin/
│           └── reset-password.ts  # (已废弃) 密码重置代理
├── public/                     # 静态资源 & PWA 图标
├── src/
│   ├── components/
│   │   ├── AdminRoute.tsx      # 管理员路由守卫
│   │   ├── ImportModal.tsx     # 文件导入弹窗
│   │   ├── QuestionCard.tsx    # 题目展示卡片
│   │   └── PwaUpdatePrompt.tsx # PWA 更新提示条
│   ├── contexts/
│   │   ├── AuthContext.tsx     # 登录状态 + profile 管理
│   │   └── ThemeContext.tsx    # 深色模式状态管理
│   ├── pages/
│   │   ├── Home.tsx            # 首页：云端+本地题库列表
│   │   ├── BankDetail.tsx      # 题库详情
│   │   ├── Practice.tsx        # 练习页（核心刷题界面）
│   │   ├── AdminDashboard.tsx  # 管理后台：概览/审核/用户管理
│   │   └── Login.tsx           # 登录/注册页
│   ├── hooks/
│   │   └── useQuizSession.ts   # 刷题会话状态管理
│   ├── lib/
│   │   ├── supabase.ts         # Supabase 客户端（含 custom fetch 代理）
│   │   ├── uploadService.ts    # 云端上传服务
│   │   └── syncService.ts      # 进度同步服务
│   ├── utils/
│   │   ├── parsers/            # 5 种格式解析器 + DOCX 考试卷解析 + AI 格式化
│   │   ├── quiz/               # 刷题引擎（判题/打乱/统计）
│   │   ├── cloze/              # 自动挖空/智能生成填空题
│   │   └── hash.ts             # SHA-256 内容哈希（云端去重）
│   ├── db.ts                   # IndexedDB 数据模型（含 userProgress 表）
│   ├── main.tsx                # 入口 + PWA 注册
│   └── App.tsx                 # 路由 + 全局布局 + 自动同步注册
├── sw-custom.js                # 自定义 Service Worker（NetworkFirst）
├── docs/
│   └── development-doc.md      # 完整开发文档
├── supabase-migration-*.sql    # 数据库迁移脚本
└── README.md
```

---

## 数据库（Supabase）

### 核心表

| 表 | 说明 | 关键字段 |
|-----|------|---------|
| `profiles` | 用户扩展信息 | id, email, role (user/admin), created_at |
| `question_banks` | 题库 | id, name, content_hash, review_status (pending/approved/rejected), created_by |
| `questions` | 题目 | id, bank_id, type, content, options, answer |
| `user_progress` | 刷题进度 | id, user_id, question_id, bank_id, is_correct |

### RLS 策略

- `profiles`：用户只能看自己的行，admin 可看全部
- `question_banks`：pending/rejected 仅上传者和 admin 可见，approved 全员可见
- `user_progress`：用户只能读写自己的进度

---

## AI 格式整理

DOCX 导入时可选调 DeepSeek API 做格式归一化，解决 tab/全角空格/混排/OCR 残留导致的解析失败。

### 双模式

| 模式 | 适用场景 | 原理 |
|------|----------|------|
| **直接模式** | 本地开发 | 前端携带 `.env.normalize` 中的 API key 直接调 DeepSeek |
| **代理模式** | 生产部署 | 前端请求 `/api/ai-normalize` → CF Pages Function 代理（key 在服务器环境变量中） |

### 失败降级

AI 调用超时或失败时静默返回原文，不影响导入流程。

---

## License

MIT
