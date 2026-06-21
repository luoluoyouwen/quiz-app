# 刷题 App — Quiz App

> 纯前端离线刷题 PWA · 支持选择题 / 多选题 / 填空题 / 判断题 / 简答题 · 自动挖空 · 背题模式

---

## 功能一览

| 功能 | 说明 |
|------|------|
| 📂 **多题库管理** | 创建 / 删除题库，数据按 `bankId` 完全隔离 |
| 📥 **五种格式导入** | .txt · .json · .csv · .docx · .md |
| 🔢 **五类题型** | 单选题、多选题、填空题、判断题、简答题 |
| ✏️ **自动挖空** | 导入填空题自动将答案替换为 `____` |
| 🧠 **背题模式** | 显示答案 → 自评"记住了 / 没记住" |
| 📊 **练习统计** | 正确率、按题型聚合、薄弱点分析、错题队列 |
| 📱 **左右滑动** | 右滑上一题、左滑下一题 |
| 📋 **题目导航** | 浮动按钮弹出网格，已答 / 未答 / 当前题分色标识 |
| 🔄 **自动更新** | PWA 检测新版本后自动接管，蓝色提示条「刷新」 |
| 📴 **离线可用** | 首次加载后完全离线运行（IndexedDB 持久化） |

---

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 本地开发（默认 http://localhost:5173）
npm test             # 运行全部测试（91 个用例）
npm run build        # 构建生产版本
npm run preview      # 预览构建产物
```

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 + PWA 插件 (injectManifest) |
| UI | Ant Design 6 |
| 路由 | React Router 7 |
| 存储 | Dexie (IndexedDB) |
| 测试 | Vitest 4 |
| 部署 | Vercel |

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
│   ├── pages/
│   │   ├── Home.tsx           # 首页：题库列表
│   │   ├── BankDetail.tsx     # 题库详情：统计 + 题目列表
│   │   └── Practice.tsx       # 练习页（核心）
│   ├── hooks/
│   │   └── useQuizSession.ts  # 刷题会话状态管理
│   ├── utils/
│   │   ├── parsers/           # 5 种格式解析器 + DOCX 考试卷解析
│   │   ├── quiz/              # 刷题引擎（判题 / 打乱 / 统计）
│   │   └── cloze/             # 自动挖空 / 智能生成填空题
│   ├── db.ts                  # IndexedDB 数据模型（4 张表）
│   ├── main.tsx               # 入口 + PWA 注册
│   └── App.tsx                # 路由
├── sw-custom.js               # 自定义 Service Worker（injectManifest）
├── docs/
│   └── development-doc.md     # 完整开发文档（架构 / 数据模型 / API / 升级路线）
├── package.json
├── vite.config.ts
└── README.md
```

---

## DOCX 考试卷解析器 — 格式支持细节

解析器专为中国化工行业标准题库 DOCX 格式设计，支持以下题型（单文件混合）：

| 题型 | 章节标题 | 解析策略 |
|------|----------|----------|
| 填空题 | `一 填空题` | 按 2+ 空格分段，交替取内容/答案；支持 `、` 枚举多答案；支持 `及/与/和/或` 连词后单空格切分 |
| 单选题 | `二 单选题` | 行内 `(C)` 答案标记 + 后续 A/B/C/D 选项行；支持 3+空格/tab/短空格多选项分离 |
| 多选题 | `三 多选题` | 同上，按答案字母数自动区分为 `multi` 类型 |
| 判断题 | `四 判断题` | 行尾 `（√）/（×）` 检测 |
| 简答题 | `五 问答题` | 问题行 + `答：` 答案行收集，支持编号列表 `①/1）` 延续 |

### 填空题解析算法

核心流程：

1. 按 `\s{2,}` 或连词 `(?<=及|与|和|或)\s` 分割
2. 单遍线性扫描：第一部分为题干，遇到 `、` 短内容提升为答案，其余按奇偶交替
3. 答案清洗：去首尾标点、截断 `space+逗号+功能词`、截断 `space+功能词`
4. 构建 `content` 时 `____` 一一对齐 `answers`，保证 `blanks === answers.length`

---

## 判题容错策略

| 题型 | 判题方式 |
|------|----------|
| 单选题 | 大小写不敏感，trim，无 options 时直接判题 |
| 多选题 | 排序后逐字符对比，非法字符直接判错，无 options 时直接判题 |
| 判断题 | `对/错/√/×/true/false/t/f` 六种输入兼容 |
| 填空题（单空） | 精确 → 子串包含 → Levenshtein 距离 ≤ 2 |
| 填空题（多空） | `||` 分隔，逐空独立判题，全对才算对 |
| 简答题（背题） | `__remembered__` / `__forgot__` 自评 |

---

## 扩展指南

### 加新文件格式

1. 在 `src/utils/parsers/` 下新建文件，导出 `parseXxx(content): { bankName, questions }`
2. 在 `src/utils/parsers/index.ts` 的 `detectFormat` 中加一行 `case`
3. 在 `ImportModal.tsx` 的 `accept` 属性加上新扩展名

### 加新题型

1. `src/db.ts` — `QuestionType` 联合类型加新值
2. `src/utils/parsers/types.ts` — 如需新增字段
3. `src/utils/quiz/engine.ts` — `checkAnswer` 加新 case
4. `src/pages/Practice.tsx` — 加对应的 UI 输入组件

---

## 部署

```bash
# 需要 Vercel 账号 + token
npx vercel deploy --prod --yes --token <token>
```

部署到 Vercel 后 PWA 自动生效。自定义 Service Worker（`sw-custom.js`）使用 NetworkFirst 策略，HTML 优先从网络加载；静态资源由 precache 缓存。更新流程：

1. 部署新版 → 2. 用户刷新 → 3. 新 SW 安装 → 4. `SKIP_WAITING` 激活 → 5. 自动刷新

---

## 测试

```bash
npm test                          # 运行全部（91 个用例）
npx vitest --watch                # 监听模式
npx vitest run --reporter=verbose # 详细输出
```

| 测试文件 | 用例数 | 覆盖内容 |
|----------|--------|----------|
| `exam.test.ts` | 21 | DOCX 解析：全部 5 题型 + tab/短空格分离 + 顿号枚举 + 连词切分 + nofill |
| `raw_docx.integration.test.ts` | 14 | 全量数据一致性：blanks==answers、answer 非空、题数范围、特定修复点验证 |
| `engine.test.ts` | 45 | 判题引擎（5 题型 + 多空 + 非法 + 无 options 兼容）、统计、集成 |
| `stats.test.ts` | 11 | 统计聚合、薄弱点分析、错题队列 |

测试覆盖解析器 → 判题引擎 → 统计的完整链路，以及 raw_docx.txt 全量数据的 8 项一致性断言。

---

## 完整文档

详细的架构说明、数据模型 ER 图、解析器算法、关键技术决策、32 项未来升级路线 → **[docs/development-doc.md](docs/development-doc.md)**

---

## 反馈

如有问题或建议，欢迎直接联系。
