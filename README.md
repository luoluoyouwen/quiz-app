# 刷题 App — Quiz App

> 纯前端离线刷题 PWA · 化工行业题库专用 · 支持单选 / 多选 / 填空 / 判断 / 简答 · 自动挖空 · 深色模式

---

## 功能一览

| 功能 | 说明 |
|------|------|
| 📂 **多题库管理** | 创建/删除题库，数据按 `bankId` 完全隔离 |
| 📥 **五格式导入** | .txt · .json · .csv · .docx · .md |
| 🔢 **五类题型** | 单选题、多选题、填空题、判断题、简答题 |
| 🤖 **AI 格式整理** | DOCX 导入时自动 AI 规整排版，兼容 tab/全角/混排/OCR 残留 |
| ✏️ **自动挖空** | 填空题自动将答案替换为 `____`，支持 `、` 枚举多空 |
| 🧠 **背题模式** | 显示答案 → 自评"记住了 / 没记住" |
| 📊 **练习统计** | 正确率、按题型聚合、薄弱点分析 |
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

```bash
npm install            # 安装依赖
npm run dev            # 本地开发（默认 http://localhost:5173）
npm test               # 运行全部测试（110 个用例）
npm run build          # 构建生产版本
npm run preview        # 预览构建产物
```

### 部署

```bash
# 构建后部署到任意静态托管平台
npm run build
npx wrangler pages deploy dist/
npx vercel --prod
```

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite + PWA 插件 (injectManifest) |
| UI | Ant Design 6 |
| 路由 | React Router 7 |
| 存储 | Dexie (IndexedDB) |
| 测试 | Vitest + jsdom |
| 部署 | Cloudflare Pages / Vercel |

---

## 项目结构

```
quiz-app/
├── public/                    # 静态资源 & PWA 图标
├── src/
│   ├── components/
│   │   ├── ImportModal.tsx    # 文件导入弹窗
│   │   ├── QuestionCard.tsx   # 题目展示卡片
│   │   └── PwaUpdatePrompt.tsx# PWA 更新提示条
│   ├── contexts/
│   │   └── ThemeContext.tsx   # 深色模式状态管理
│   ├── pages/
│   │   ├── Home.tsx           # 首页：题库列表 + 版本信息
│   │   ├── BankDetail.tsx     # 题库详情：统计/搜索/错题/题目列表
│   │   └── Practice.tsx       # 练习页（核心刷题界面）
│   ├── hooks/
│   │   └── useQuizSession.ts  # 刷题会话状态管理
│   ├── utils/
│   │   ├── parsers/           # 5 种格式解析器 + DOCX 考试卷解析
│   │   ├── quiz/              # 刷题引擎（判题/打乱/统计）
│   │   ├── cloze/             # 自动挖空/智能生成填空题
│   │   ├── themeColors.ts     # 深色模式颜色方案
│   │   └── changelog.ts       # 版本号与更新日志
│   ├── db.ts                  # IndexedDB 数据模型（4 张表）
│   ├── main.tsx               # 入口 + PWA 注册
│   └── App.tsx                # 路由 + 深色主题集成
├── sw-custom.js               # 自定义 Service Worker（NetworkFirst）
├── docs/
│   └── development-doc.md     # 完整开发文档
├── package.json
├── vite.config.ts
└── README.md
```

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

AI 格式归一化（可选）：通过 DeepSeek API 预处理 DOCX 文本，统一 tab/空格/全角/选项排版。

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
