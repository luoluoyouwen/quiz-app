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
| 🔄 **自动更新** | PWA 检测新版本后蓝色提示条「刷新」 |
| 📴 **离线可用** | 首次加载后完全离线运行（IndexedDB 持久化） |

---

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 本地开发（默认 http://localhost:5173）
npm test             # 运行全部测试（60 个用例）
npm run build        # 构建生产版本
npm run preview      # 预览构建产物
```

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | React 19 + TypeScript 6 |
| 构建 | Vite 8 + PWA 插件 |
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
│   │   └── PwaUpdatePrompt.tsx
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
├── docs/
│   └── development-doc.md     # 完整开发文档（架构 / 数据模型 / API / 升级路线）
├── package.json
├── vite.config.ts
└── README.md
```

---

## 判题容错策略

| 题型 | 判题方式 |
|------|----------|
| 单选题 | 大小写不敏感，trim |
| 多选题 | 排序后逐字符对比，非法字符直接判错 |
| 判断题 | `对/错/√/×/true/false/t/f` 六种输入兼容 |
| 填空题（单空） | 精确 → 子串包含 → Levenshtein 距离 ≤ 2 |
| 填空题（多空） | `\|\|` 分隔，逐空独立判题，全对才算对 |
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
npx vercel deploy --prod --yes
```

部署到 Vercel 后 PWA 自动生效，用户打开即用，无需额外配置。

---

## 测试

```bash
npm test                          # 运行全部（60 个用例）
npx vitest --watch                # 监听模式
npx vitest run --reporter=verbose # 详细输出
```

测试覆盖：判题引擎（5 种题型 + 多空 + 非法字符）、统计聚合、薄弱点分析、错题队列、解析器集成。

---

## 完整文档

详细的架构说明、数据模型 ER 图、解析器算法、关键技术决策、32 项未来升级路线 → **[docs/development-doc.md](docs/development-doc.md)**

---

## 反馈

如有问题或建议，欢迎直接联系。
