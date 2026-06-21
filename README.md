# 刷题 App — Quiz App

> 纯前端离线刷题 PWA · 化工行业题库专用 · 支持单选 / 多选 / 填空 / 判断 / 简答 · 自动挖空 · 深色模式 · AI 格式整理

---

## 功能一览

| 功能 | 说明 |
|------|------|
| 📂 **多题库管理** | 创建/删除题库，数据按 `bankId` 完全隔离 |
| 📥 **五格式导入** | .txt · .json · .csv · .docx · .md |
| 🔢 **五类题型** | 单选题、多选题、填空题、判断题、简答题 |
| 🤖 **AI 格式整理** | DOCX 导入时自动 AI 规整排版，兼容 tab/全角/混排/OCR 残留；部署版通过 [CF Pages Function](#部署) 代理调用 DeepSeek，API key 不暴露在前端 |
| ✏️ **自动挖空** | 填空题自动将答案替换为 `____`，支持 `、` 枚举多空 |
| 🧠 **背题模式** | 显示答案 → 自评"记住了 / 没记住" |
| 🚀 **一键开刷** | 主按钮直接进全部题型练习，齿轮图标选特定题型/随机抽题 |
| 📊 **统计图表** | 练习趋势折线图，最近 20 次正确率可视化；统计卡片可点击直达对应题型刷题 |
| 🔄 **页面过渡动画** | framer-motion 全场淡入+上移切换 |
| 🏁 **练习结束交互** | 完成后自动返回，支持「再来一局」 |
| 🔍 **题目搜索** | 实时搜索题目内容、答案、选项 |
| ❌ **错题本** | 答错自动收集，支持错题重刷，随错随记 |
| ⏯️ **断点续刷** | 按题型独立保存进度，离开后 24 小时内可继续 |
| 📱 **左右滑动** | 右滑上一题、左滑下一题 |
| 📋 **题目导航** | 网格视图，已答/未答/当前题分色标识 |
| 🔄 **PWA 自动更新** | 检测新版本后提示刷新 |
| 🌙 **深色模式** | 右上角切换，持久化偏好 |
| 📴 **离线可用** | 首次加载后完全离线运行（IndexedDB 持久化） |

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
| `.env.normalize` | 本地开发 AI 格式整理的 DeepSeek API key | ❌ `.gitignore` |
| `.env.normalize.example` | 模板文件（含占位符） | ✅ |
| `.env.production` | 生产构建时指定 AI 代理路径 | ✅（不含 key） |

### 部署

```bash
# 一键部署（需 CLOUDFLARE_API_TOKEN 在环境变量中）
bash deploy-cf.sh

# 或手动
npm run build
npx wrangler pages deploy dist/ --project-name=quiz-app
```

> **AI 格式整理在部署版需要额外配置**：
> 1. 在 Cloudflare Pages 后台 → 设置 → 环境变量 → 添加 `AI_NORMALIZE_API_KEY`（类型选 Secret）
> 2. 项目自带 `functions/api/ai-normalize.ts`，部署时自动上传
> 3. 前端请求 `/api/ai-normalize`，CF Function 代理转发到 DeepSeek，key 不暴露

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite + PWA 插件 (injectManifest) |
| UI | Ant Design 6 |
| 路由 | React Router 7 |
| 存储 | Dexie (IndexedDB) |
| 后端代理 | Cloudflare Pages Functions |
| 部署 | Cloudflare Pages / Vercel |

---

## 项目结构

```
quiz-app/
├── functions/                  # CF Pages Functions（AI 代理）
│   └── api/
│       └── ai-normalize.ts     # AI 格式整理代理端点
├── public/                     # 静态资源 & PWA 图标
├── src/
│   ├── components/
│   │   ├── ImportModal.tsx     # 文件导入弹窗
│   │   ├── QuestionCard.tsx    # 题目展示卡片
│   │   └── PwaUpdatePrompt.tsx # PWA 更新提示条
│   ├── contexts/
│   │   └── ThemeContext.tsx    # 深色模式状态管理
│   ├── pages/
│   │   ├── Home.tsx            # 首页：题库列表 + 版本信息
│   │   ├── BankDetail.tsx      # 题库详情：统计/搜索/错题/题目列表
│   │   └── Practice.tsx        # 练习页（核心刷题界面）
│   ├── hooks/
│   │   └── useQuizSession.ts   # 刷题会话状态管理
│   ├── utils/
│   │   ├── parsers/            # 5 种格式解析器 + DOCX 考试卷解析 + AI 格式化
│   │   ├── quiz/               # 刷题引擎（判题/打乱/统计）
│   │   ├── cloze/              # 自动挖空/智能生成填空题
│   │   ├── themeColors.ts      # 深色模式颜色方案
│   │   └── changelog.ts        # 版本号与更新日志
│   ├── db.ts                   # IndexedDB 数据模型（4 张表）
│   ├── main.tsx                # 入口 + PWA 注册
│   └── App.tsx                 # 路由 + 深色主题集成
├── sw-custom.js                # 自定义 Service Worker（NetworkFirst）
├── docs/
│   └── development-doc.md      # 完整开发文档
├── .env.production             # 生产构建环境变量（代理路径）
├── package.json
├── vite.config.ts
└── README.md
```

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

## DOCX 考试卷解析器

专为中国化工行业标准题库 DOCX 格式设计：

| 题型 | 章节标题 | 解析策略 |
|------|----------|----------|
| 填空题 | `一 填空题` | 按 2+ 空格分段，交替取内容/答案；支持 `、` 枚举多答案 |
| 单选题 | `二 单选题` | 行内 `(C)` 答案标记 + 后续 A/B/C/D 选项行 |
| 多选题 | `三 多选题` | 同上，按答案字母数自动区分为 `multi` 类型 |
| 判断题 | `四 判断题` | 行尾 `（√）/（×）` 检测 |
| 简答题 | `五 问答题` | 问题行 + `答：` 答案行收集 |

---

## 深色模式

- 切换按钮位于顶部导航栏右侧（🌙 / ☀️）
- 偏好写入 `localStorage`，刷新/重启后保持
- Ant Design `darkAlgorithm` 自动处理所有 UI 组件
- CSS 变量覆盖自定义样式的语义色（正确绿/错误红/警告黄）
- **iOS 添加到桌面时状态栏不支持自适应**（iOS PWA 限制）

---

## License

MIT
