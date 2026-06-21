# 刷题 App 开发文档

> 项目名称：Quiz App  
> 版本：1.1.3  
> 更新日期：2026-06-21  
> 技术栈：React 19 + TypeScript 6 + Vite 8 + Ant Design 6 + Dexie (IndexedDB)

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [数据模型](#3-数据模型)
4. [前端路由](#4-前端路由)
5. [题库导入与解析](#5-题库导入与解析)
6. [刷题引擎](#6-刷题引擎)
7. [自动挖空系统](#7-自动挖空系统)
8. [练习模式](#8-练习模式)
9. [PWA 与离线支持](#9-pwa-与离线支持)
10. [测试体系](#10-测试体系)
11. [关键技术决策](#11-关键技术决策)
12. [开发与部署](#12-开发与部署)
13. [未来升级路线](#13-未来升级路线)

---

## 1. 项目概述

### 1.1 目标

一套**纯前端、离线可用**的刷题 PWA，支持多种题型导入与练习。用户首次加载后无需网络即可使用，数据持久化在浏览器 IndexedDB 中。

### 1.2 核心能力

| 功能 | 说明 |
|------|------|
| **题库管理** | 创建/删除题库、按题型统计 |
| **文件导入** | 支持 .txt / .json / .csv / .docx / .md 五种格式 |
| **AI 格式整理** | DOCX 导入时可选 AI 归一化排版 |
| **五类题型** | 单选题、多选题、填空题、判断题、简答题 |
| **自动挖空** | 导入填空题时自动将答案文本替换为 `____` |
| **背题模式** | 全题型支持：显示答案→自评"记住了/没记住" |
| **题目搜索** | 题库内实时搜索题目内容、答案、选项 |
| **错题本** | 答错自动收集，随错随记，支持错题重刷 |
| **断点续刷** | 按题型独立保存进度，24 小时内可继续 |
| **深色模式** | 右上角切换，偏好持久化 |
| **练习统计** | 按题型聚合正确率、薄弱点分析 |
| **PWA 离线** | 安装到主屏幕后完全离线可用 |
| **自动更新** | Service Worker autoUpdate + 蓝色提示条刷新 |

### 1.3 目标用户画像

- 备考学生/考证人士：导入 DOCX/TXT 题库后离线刷题
- 化工/工程类专业：支持化工题库特有的填空题多空格格式
- 手机 Safari/Chrome 用户：PWA 安装后像原生 App 一样使用

---

## 2. 技术架构

### 2.1 总体架构（分层图）

```
┌──────────────────────────────────────────┐
│          PWA Shell (Service Worker)       │
│  注册、缓存策略、autoUpdate 更新提示       │
├──────────────────────────────────────────┤
│          React 19 UI Layer                │
│  ┌────────┐ ┌────────┐ ┌──────────────┐  │
│  │  Home  │ │ BankDet│ │   Practice   │  │
│  │  (首页)│ │ (详情) │ │   (练习)     │  │
│  └────────┘ └────────┘ └──────────────┘  │
│  ┌────────┐ ┌────────┐                   │
│  │ImportMo│ │QCard   │  组件库           │
│  └────────┘ └────────┘                   │
├──────────────────────────────────────────┤
│          Hooks Layer                      │
│  useQuizSession — 刷题会话状态管理         │
│  useLiveQuery — Dexie 响应式查询           │
├──────────────────────────────────────────┤
│          Utils Layer                      │
│  ┌───────────┐ ┌────────────┐             │
│  │  Parsers  │ │ Quiz Engine│             │
│  │ txt/json  │ │ checkAnswer│             │
│  │ csv/docx/ │ │ shuffle    │             │
│  │ md/exam   │ │ filter/sess│             │
│  └───────────┘ └────────────┘             │
│  ┌───────────┐ ┌────────────┐             │
│  │  Cloze    │ │  Stats     │             │
│  │ 自动挖空   │ │ 统计/薄弱点│             │
│  └───────────┘ └────────────┘             │
├──────────────────────────────────────────┤
│          Data Layer (Dexie/IndexedDB)     │
│  banks / questions / sessions / answers   │
└──────────────────────────────────────────┘
```

### 2.2 技术选型说明

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | React 19 | 成熟生态，PWA 友好 |
| 语言 | TypeScript 6 | 类型安全，JSX 支持 |
| 构建 | Vite 8 | 极快 HMR，PWA 插件生态 |
| UI | Ant Design 6 | 移动端适配好，组件丰富 |
| 路由 | React Router 7 | 声明式路由，Lazy loading |
| 存储 | Dexie (IndexedDB) | 离线持久化，响应式查询 |
| 测试 | Vitest 4 | 与 Vite 原生集成 |
| 部署 | Vercel | 零配置，HTTPS 自动 |

---

## 3. 数据模型

### 3.1 ER 图

```
┌──────────────┐       ┌──────────────────┐
│  QuestionBank │──1:N──│    Question      │
│  id           │       │  id              │
│  name         │       │  bankId (FK)     │
│  description  │       │  type            │
│  createdAt    │       │  content         │
│  lastPracticed│       │  options?        │
└──────────────┘       │  answer          │
                       │  answers?[]      │
                       │  explanation?    │
                       └──────────────────┘
                              │ 1:N
                              ▼
┌──────────────┐       ┌──────────────────┐
│   Session    │──1:N──│  SessionAnswer   │
│  id          │       │  id              │
│  bankId (FK) │       │  sessionId (FK)  │
│  startedAt   │       │  questionId (FK) │
│  endedAt     │       │  userAnswer      │
│  totalQ      │       │  isCorrect       │
│  correct     │       │  timeTaken       │
│  wrong       │       └──────────────────┘
│  score       │
│  duration    │
└──────────────┘
```

### 3.2 表结构

#### `banks` — 题库表

```typescript
interface QuestionBank {
  id?: number;          // 自增主键
  name: string;         // 题库名称（默认从文件名提取）
  description: string;  // 描述
  createdAt: Date;      // 创建时间
  lastPracticed?: Date; // 最后练习时间
}
```

#### `questions` — 题目表

```typescript
type QuestionType = 'choice' | 'multi' | 'fill' | 'judge' | 'essay';

interface Question {
  id?: number;           // 自增主键
  bankId: number;        // 外键 → banks.id
  type: QuestionType;    // 题型
  content: string;       // 题干（填空题已自动挖空为 ____）
  options?: string[];    // 选项列表 choice/multi 使用
  answer: string;        // 标准答案
  answers?: string[];    // 多空填空题的答案数组
  explanation?: string;  // 解析
}
```

#### `sessions` — 练习会话表

```typescript
interface Session {
  id?: number;
  bankId: number;
  startedAt: Date;
  endedAt?: Date;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  score: number;          // 正确率 0-100
  duration: number;       // 秒
}
```

#### `sessionAnswers` — 答题记录表

```typescript
interface SessionAnswer {
  id?: number;
  sessionId: number;
  questionId: number;
  userAnswer: string;
  isCorrect: boolean;
  timeTaken: number;      // 秒
}
```

### 3.3 IndexedDB 索引

```typescript
db.version(1).stores({
  banks:           '++id, name, createdAt',
  questions:       '++id, bankId, type',
  sessions:        '++id, bankId, startedAt',
  sessionAnswers:  '++id, sessionId, questionId',
});
```

所有查询通过 Dexie 的 `useLiveQuery` 实现响应式绑定——数据变更自动触发 UI 重渲染。

---

## 4. 前端路由

| 路径 | 页面 | 组件 | 功能 |
|------|------|------|------|
| `/` | 首页 | `Home.tsx` | 题库列表、创建/删除题库 |
| `/bank/:id` | 题库详情 | `BankDetail.tsx` | 题目列表(题型筛选)、统计、导入、练习入口 |
| `/practice/:bankId` | 练习 | `Practice.tsx` | 核心刷题界面 |

路由定义在 `src/App.tsx`，使用 `react-router-dom` 的 `BrowserRouter`。

---

## 5. 题库导入与解析

### 5.1 导入流程

```
用户选择文件
    │
    ▼
FileReader.readAsText()  // 兼容 iOS
    │
    ▼
detectFormat(file, text)  // 按扩展名路由
    │
    ├── .txt  → parseTxt(text)
    ├── .json → parseJson(text)
    ├── .csv  → parseCsv(text)
    ├── .docx → detectFormat: mammoth→parseExamDocx(text)
    └── .md   → parseMarkdown(text)
    │
    ▼
applyClozeToFillQuestions()  // 自动挖空填空题
    │
    ▼
展示预览表格 → 用户确认 → db.questions.bulkAdd()
```

### 5.2 按扩展名路由规则 (`parsers/index.ts`)

| 扩展名 | 解析函数 | 核心逻辑 |
|--------|----------|----------|
| `.txt` | `parseTxt` | 按段解析，支持 `答：` 标记 |
| `.json` | `parseJson` | 直接 JSON parse |
| `.csv` | `parseCsv` | PapaParse → 映射列名 |
| `.docx` | `mammoth` → `parseExamDocx` | 先转文本再走 exam 解析器 |
| `.md` | `parseMarkdown` | 识别标题/列表/引用 |

### 5.3 考试卷解析器 (`parsers/exam.ts`)

这是核心解析器，专门处理中国化工行业标准题库 DOCX 格式。**搜索发现的六大方法：**

#### `detectSection(line)`
检测章节标题，支持：
- `一 填空题` / `一、填空题` → `'fill'`
- `二 单选题` / `二 选择题` → `'choice'`
- `三 多选题` → `'multi'`
- `四 判断题` → `'judge'`
- `五 问答题` / `五 简答题` → `'essay'`

#### `tryParseJudge(line)`
- 匹配行尾 `（×）` / `（√）`
- 返回 `{ type:'judge', answer:'错'/'对' }`

#### `tryParseChoice(line)`
- 匹配 `（C）` → 单选题
- 匹配 `（ABC）` → 单选题（后续按答案长度区分单选/多选）
- 遍历后续行收集选项：支持单行多选项，按 `\t| {2,}(?=[A-Da-d][.、．])` 切分（tab 或 2+空格后跟选项标记）
- 返回时根据答案字符串长度自动设 type：1个字母→`'choice'`，多个→`'multi'`

#### `tryParseFill(line)` ⚠️ 核心逻辑，历史 Bug 最多
- **检测**：行内有 `2+ 空格` 分段
- **分段**：`line.split(/\s{2,}|(?<=及|与|和|或)\s/)` — 支持 2+ 空格切分，以及中文连词后单空格切分
- **单遍线性扫描**：按以下规则遍历 parts，保持原始顺序：
  1. `parts[0]` → 首个题干段
  2. 后续段若以 `、` 开头且内容短（≤7 字）→ 提升为答案，`、` 作为内容分隔符
  3. 其余段按奇偶交替（奇数→答案，偶数→题干）
- **答案清洗**：去除首尾标点符号；截断 `space+逗号+功能词` 后的内容（如 `油膜破坏 ，过低会导致` → `油膜破坏`）；截断 `space+功能词` 后的内容
- **内容构建**：contentParts 与 cleanAnswers 逐项配对，保证 `blanks === answers.length`
- **多空合一**：同一行的所有空白合并为一道填空题，`answers` 数组存储
- **判题使用**：用户输入以 `||` 分隔各空

#### `tryParseFill` 处理示例

**输入行：**
```
反应器R-301操作控制温度      525℃±5℃      、通常进料前将温度控制在   550℃ 才开始进料。
```

**解析后：**
```json
{
  "type": "fill",
  "content": "反应器R-301操作控制温度____、通常进料前将温度控制在____才开始进料。",
  "answer": "525℃±5℃",
  "answers": ["525℃±5℃", "550℃"]
}
```

#### `isQuestionLine(line)`
检测问答题题干行（以问号结尾或含"如何/怎样/哪些"等关键词）。

#### 解析器已知限制

| 限制 | 说明 | 计划 |
|------|------|------|
| 单空格内联选项 | 部分单选题使用单空格分隔（A. 一取一 B. 二取一），当前不拆分 | v2 提升拆分精度 |
| 选项行在题干前 | 某些题库选项行出现在题干上方，当前无法关联 | v2 增加上下文关联 |
| 答案清洗规则 | 中文功能词截断列表为硬编码，可能误伤罕见长答案 | v2 改为 NLP 分词判断 |
| 顿号枚举长度硬限 | `、` 后内容 ≤7 字才提升为答案，≥8 字仍作为题干（边界案例极少） | v2 词汇分析替代长度启发 |

---

## 6. 刷题引擎

### 6.1 引擎模块 (`utils/quiz/engine.ts`)

#### 核心函数

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `shuffleQuestions` | questions, seed? | Question[] | Fisher-Yates shuffle，可选种子保证确定性 |
| `filterByType` | questions, type | Question[] | 按题型筛选 |
| `checkAnswer` | question, userAnswer | {correct, expected} | 判题中枢 |
| `generateSession` | bankId, questions, mode | QuizSession | 生成练习会话 |

#### `checkAnswer` 判题逻辑

| 题型 | 判题策略 |
|------|----------|
| **choice** 单选题 | 大小写不敏感，trim |
| **multi** 多选题 | 字母排序后逐字符对比；非法字符（非 A-D）直接判错 |
| **judge** 判断题 | 支持 `对/错/√/×/true/false/t/f` 六种输入 |
| **fill** 填空题 | 三级容错：精确→子串包含→Levenshtein 距离 ≤2 |
| **fill multi-blank** | `||` 分隔，逐空独立判题，全部正确才算对 |
| **essay** 简答题 | 背题模式标记：`__remembered__`/`__forgot__` |

**Levenshtein 容错示例：**
- 标准答案 "气化技术" → 用户输入 "气化技木" 判对（距离=1）
- 标准答案 "长江" → 用户输入 "长河" 判对（距离=1，替换）
- 标准答案 "长江" → 用户输入 "塔里木河" 判错（距离=3）

### 6.2 统计模块 (`utils/quiz/stats.ts`)

| 函数 | 说明 |
|------|------|
| `calculateStats` | 聚合总正确率 + 各题型统计 |
| `getWeakAreas` | 返回正确率 < threshold 的题目（默认 0.6） |
| `getReviewQueue` | 返回最近答错的题，按时间从旧到新排序 |

### 6.3 会话 Hook (`hooks/useQuizSession.ts`)

管理刷题会话的全部状态：

```typescript
interface UseQuizSessionReturn {
  session: QuizSession | null;
  currentIndex: number;
  sessionDone: boolean;
  userAnswers: string[];
  submitted: boolean[];
  totalQuestions: number;
  currentQuestion: Question | null;
  handleAnswer: (answer: string) => void;
  handleSubmit: () => void;
  handleNext: () => void;
  handlePrev: () => void;
  goToQuestion: (index: number) => void;
  handleRestart: () => void;
}
```

---

## 7. 自动挖空系统

### 7.1 导入时自动挖空 (`utils/cloze/index.ts`)

**触发时机**：导入解析完成后，对所有 `type === 'fill'` 且内容中不含有 `____` 的题目执行。

```typescript
export function applyClozeToFillQuestions(questions: QuestionInput[]): QuestionInput[]
```

**挖空算法**（按优先级）：

1. **精确匹配**：在题干中直接查找答案文本，替换为 `____`
2. **大小写不敏感匹配**：lowercase 后定位替换
3. **兜底追加**：找不到匹配时，在题干末尾追加 ` ____`

### 7.2 自动生成挖空题 (`autoGenerateCloze`)

从一段纯文本自动生成填空题，四种提取策略：

| 策略 | 模式 | 示例匹配 |
|------|------|----------|
| 数字/年份/百分比 | `NUMBER_PATTERN` | 525℃, 85%, 2024年 |
| 引号内容 | `QUOTE_PATTERN` | "关键参数"、『注意』 |
| 关键词后文本 | `KEYWORD_TRIGGER_PATTERN` | "称为…"、"即…"、"包括…" |
| 英文单词 | 2+ 字母连续 | temperature, reactor |
| CJK 双字词 | 2-6 汉字序列 | 反应器、操作控制 |

---

## 8. 练习模式

### 8.1 标准模式

```
1. 选择题库 → 筛选题型（全部/单选/多选/填空/判断/简答）
2. 进入练习界面
   ┌───────────────────────┐
   │  ← 返回  题库名  [背题]│  ← 右上角背题模式切换
   ├───────────────────────┤
   │ 进度 ████████░░ 3/15  │
   ├───────────────────────┤
   │ [填空题]               │
   │                       │
   │ 反应器R-301操作控制    │
   │ 温度____、通常进料前    │
   │ 将温度控制在____才开    │
   │ 始进料。               │
   │                       │
   │ [第 1 空  ________]   │
   │ [第 2 空  ________]   │
   │                       │
   │   [提交答案]           │
   ├───────────────────────┤
   │ 提交后：正确/错误反馈   │
   │ 正确答案：525℃±5℃     │
   ├───────────────────────┤
   │     [下一题]           │
   └───────────────────────┘
   📋 ← 浮动按钮弹出题目列表
```

### 8.2 背题模式

切换后所有题型统一为"显示答案→自评"模式：

```
┌───────────────────────┐
│ [填空题]               │
│ 反应器R-301操作控制    │
│ 温度____、...          │
│                       │
│ [     显示答案      ]  │  ← 点击后展开答案
│                       │
├───────────────────────┤
│ 点击后：               │
│ ┌─────────────────┐   │
│ │ 参考答案：        │   │
│ │ 525℃±5℃、550℃   │   │
│ └─────────────────┘   │
│                       │
│ [✓ 记住了] [✗ 没记住]  │
└───────────────────────┘
```

### 8.3 交互细节

- **左右滑动**：右滑上一题，左滑下一题（touch handlers）
- **题目列表**：右下角 📋 按钮弹出网格，已答题绿底、当前题蓝底、未答题灰底
- **结果页**：练习完成后显示正确率 + 错题回顾列表（颜色分级：绿≥80%，黄≥50%，红<50%）

---

## 9. PWA 与离线支持

### 9.1 Service Worker 策略

使用 `injectManifest` 策略，自定义 Service Worker（`sw-custom.js`）：

```typescript
// vite.config.ts
VitePWA({
  strategies: 'injectManifest',
  srcDir: '.',
  filename: 'sw-custom.js',
  registerType: 'autoUpdate',
  // ...
})
```

核心行为：
- **NetworkFirst 策略**：HTML 导航优先从网络加载，保证用户始终获得最新版本
- **Precache 静态资源**：JS/CSS/图标等 Vite 构建产物由 workbox precache 管理
- **SKIP_WAITING**：页面可通过 `postMessage({type:'SKIP_WAITING'})` 指令立即激活新 SW
- **clientsClaim**：激活后立即接管所有已打开的页面标签
- **更新提示**：`PwaUpdatePrompt` 组件检测到 waiting SW 后，显示蓝色"新版本已发布 刷新"按钮

### 9.2 离线方案

- 所有数据通过 Dexie 存储在 IndexedDB（浏览器原生持久化）
- 静态资源由 Vite PWA 插件缓存（`generateSW` 默认策略）
- 首次加载后完全离线可用，无需网络

### 9.3 更新流程

1. 部署新版本到 Vercel
2. 用户打开 PWA → Service Worker 后台下载新版本
3. 检测到更新 → 显示蓝色提示条 "🆕 新版本已发布"
4. 用户点击"刷新" → 立即激活新版本

---

## 10. 测试体系

### 10.1 测试总览

| 测试文件 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| `engine.test.ts` | 45 | 打乱、筛选、判题（5种题型+多空+非法字符+无options兼容+集成） |
| `stats.test.ts` | 11 | 统计聚合、薄弱点分析、错题队列 |
| `exam.test.ts` | 21 | DOCX 解析：5题型 + tab/短空格多选项 + 顿号枚举 + 连词切分 + 答案清洗 + nofill |
| `raw_docx.integration.test.ts` | 14 | 全量数据 8 项一致性断言 + 4 个特定修复点验证 |

总计：**91 个测试用例**（vitest）

### 10.2 判题测试覆盖矩阵

| 题型 | 测试点 | 状态 |
|------|--------|------|
| 单选题 | 正确/错误/大小写/空格 | ✅ |
| 多选题 | 正确/乱序/部分选/多选/非法字符(ABCDE) | ✅ |
| 判断题 | 对/错/true/false/t/f/√/× | ✅ |
| 填空(单空) | 精确/子串/Levenshtein/空/错误 | ✅ |
| 填空(多空) | 全对/部分错/全错/模糊匹配/空 | ✅ |

### 10.3 集成测试

覆盖完整解析+判题链路（3 个测试）+ 全量数据一致性验证（14 个测试）：

```typescript
// parser + checkAnswer end-to-end
parseExamDocx("填空题...") → checkAnswer(||) → 验证所有题型题干各不相同

// raw_docx.txt 全量数据断言
raw_docx.integration  →  fill 题 blanks == answers
                      →  每题型 answer 非空
                      →  题数 300-360 范围
                      →  内容唯一性（排除已知数据重复）
                      →  特定修复点：顿号枚举/连词切分/tab分离
```

### 10.4 运行命令

```bash
npm test                    # 运行全部测试
npx vitest --watch          # 监听模式
npx vitest run --reporter=verbose  # 详细输出
```

---

## 11. 关键技术决策

### 11.1 为什么是多空合一而不是拆题

**问题**：填空题一行三个空白，拆成三题还是合为一题？
**决定**：合为一题，`answers: string[]` 数组存储，用户输入用 `||` 分隔。
**理由**：保持原始题号对应关系，便于回顾时对照原题上下文。

### 11.2 为什么多选题独立为 `multi` 类型

**问题**：选择题（单选/多选）解析时难以区分。
**决定**：解析器在 `tryParseChoice` 中统一解析为 `choice` 类型，外层按答案字母数自动区分：
- 1 个字母 → `'choice'`（Radio 单选）
- 多个字母 → `'multi'`（Checkbox 多选）
**理由**：化工题库的格式高度一致，此规则覆盖 99% 情况。

### 11.3 为什么用规则挖空而非 AI

**问题**：答案在题干中的位置不确定，AI 判断更准确。
**决定**：先用规则精确匹配（效率高、零延迟），规则失败时在末尾追加空白。
**理由**：用户未提供 DeepSeek API Key；纯前端方案更可靠，后续可叠加 AI 作为可选增强。

### 11.4 为什么判题使用容错而非精确匹配

**问题**：填空题输入与实际答案常有细微出入。
**决定**：三级容错：精确→子串包含→Levenshtein 距离 ≤ 2。
**理由**：用户手动输入时难免多字少字或错别字，容错能减少不必要的判错。

### 11.5 为什么用 FileReader 而非 file.text()

**问题**：现代浏览器支持 `file.text()`，为何用旧的 FileReader？
**决定**：FileReader 在 iOS Safari 上兼容性更好，`file.text()` 在某些版本有 bug。

---

## 12. 开发与部署

### 12.1 本地开发

```bash
cd [redacted-project-root]
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm test           # 运行测试
npm run build      # 构建生产版本
npm run preview    # 预览构建产物
```

### 12.2 部署到 Vercel

```bash
npx vercel deploy --prod --yes
# 或使用本地 token 认证
npx vercel deploy --prod --token <token>
```

### 12.3 项目结构

```
quiz-app/
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
├── src/
│   ├── components/
│   │   ├── ImportModal.tsx      # 文件导入弹窗
│   │   ├── QuestionCard.tsx     # 题目展示卡片
│   │   └── PwaUpdatePrompt.tsx  # PWA 更新提示条
│   ├── pages/
│   │   ├── Home.tsx             # 首页：题库列表
│   │   ├── BankDetail.tsx       # 题库详情页
│   │   └── Practice.tsx         # 练习页（核心）
│   ├── hooks/
│   │   └── useQuizSession.ts    # 刷题会话 Hook
│   ├── utils/
│   │   ├── parsers/             # 文件格式解析器
│   │   │   ├── index.ts        # 格式检测路由
│   │   │   ├── types.ts        # 共享类型
│   │   │   ├── exam.ts         # 考试卷解析器（核心）
│   │   │   ├── exam.test.ts    # 解析器测试（21 个）
│   │   │   ├── raw_docx.integration.test.ts  # 全量数据集成测试（14 个）
│   │   │   ├── txt.ts          # TXT 解析
│   │   │   ├── json.ts         # JSON 解析
│   │   │   ├── csv.ts          # CSV 解析
│   │   │   ├── docx.ts         # DOCX 转文本
│   │   │   └── markdown.ts     # Markdown 解析
│   │   ├── quiz/
│   │   │   ├── engine.ts       # 刷题引擎（判题/打乱/筛选）
│   │   │   ├── engine.test.ts  # 引擎测试
│   │   │   ├── stats.ts        # 统计/薄弱点/错题队列
│   │   │   └── stats.test.ts   # 统计测试
│   │   └── cloze/
│   │       └── index.ts        # 自动挖空/生成挖空题
│   ├── db.ts                   # Dexie 数据库定义
│   ├── App.tsx                 # 路由+全局组件
│   ├── main.tsx                # 入口+PWA注册
│   └── index.css               # 全局样式
├── docs/
│   └── development-doc.md      # 本文档
├── sw-custom.js               # 自定义 Service Worker（injectManifest）
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 13. 未来升级路线

### P0 — 核心体验优化（优先级最高）

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-01 | **题库隔离** | 不同题库的练习数据（session/answers）完全隔离，不可互访 | 2d |
| F-02 | **选择题随机选项** | 每次练习时选项顺序打乱，避免记位置 | 1d |
| F-03 | **答题后自动下一题** | 提交正确答案后自动跳转，无需手动点击"下一题" | 1d |
| F-04 | **主观题手动判分** | 简答题/论述题允许用户手动判定对错，录入正确率 | 1d |

### P1 — 持久化与数据管理

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-05 | **题库导入持久化** | 用户关闭 App 后再开，无需重新导入，数据自动保留在 IndexedDB | ✅ 已完成 |
| F-06 | **多题库隔离** | 创建多个题库，数据（题目、练习记录、错题）互不干扰 | ✅ 已完成 |
| F-07 | **题库导出** | 将题库及其练习记录导出为 JSON 文件，支持导入恢复 | 1d |
| F-08 | **数据云端同步** | 可选 iCloud/WebDAV 同步多设备进度 | 5d |
| F-09 | **数据库版本迁移** | DB schema 升级策略，确保旧数据兼容 | 2d |

### P1 — 增强题型支持

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-10 | **不定项选择题** | 支持"选对部分给分"模式（如选对 N 个给 N/M 分） | 2d |
| F-11 | **拖拽排序题** | 将选项拖到正确顺序/位置 | 3d |
| F-12 | **连线匹配题** | 左列-右列配对连线 | 3d |
| F-13 | **AI 智能挖空** | 可选调用 DeepSeek API 判断填空题应挖空的位置（Vercel Function 代理防泄漏） | 3d |
| F-14 | **图片嵌入题干** | 题干中显示图片（化工设备图、流程图） | 2d |

### P2 — 练习模式增强

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-15 | **计时模式** | 限定时间内答题，超时自动提交 | 2d |
| F-16 | **随机抽题** | 从题库中随机抽取 N 题组成练习卷 | 1d |
| F-17 | **错题专项练习** | 只练之前答错的题，直到全部正确"出狱" | 2d |
| F-18 | **艾宾浩斯复习** | 根据遗忘曲线安排复习计划：1d/3d/7d/15d 定时提醒 | 3d |
| F-19 | **进度统计图表** | 按天/周/月展示正确率趋势图（ECharts/Recharts） | 2d |
| F-20 | **知识点标签** | 为题目打标签（如"离心泵""传热"），按知识点筛选练习 | 3d |

### P2 — 用户体验

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-21 | **题干搜索** | 在题库中搜索题干关键词快速定位题目 | 1d |
| F-22 | **批量删除/编辑** | 多选题目后批量删除或批量编辑 | 2d |
| F-23 | **题目收藏** | 收藏重点/难点题目专项复习 | 1d |
| F-24 | **深色模式** | 跟随系统或手动切换深色主题 | 1d |
| F-25 | **Markdown 解析题干** | 题干支持粗体/代码/公式等 Markdown 渲染 | 2d |
| F-26 | **朗读模式** | 点击 TTS 朗读题干（适合语言类/听力类题库） | 1d |
| F-27 | **本地化** | 英文界面支持，方便外籍用户 | 3d |

### P3 — 跨平台与分享

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-28 | **桌面端 Electron** | 打包为 Windows/Mac 桌面应用 | 5d |
| F-29 | **题分享** | 将某道题分享为图片/链接给他人 | 2d |
| F-30 | **多用户协作** | 团队共享题库，多人同时练习 | 10d+ |
| F-31 | **答题竞赛模式** | 多人实时答题 PK | 10d+ |
| F-32 | **第三方题库市场** | 用户上传/下载公开题库 | 10d+ |

### P3 — 技术债务

| 编号 | 事项 | 说明 | 优先级 |
|------|------|------|--------|
| T-01 | **TypeScript 严格模式** | 启用 `strict: true`，修复所有隐式 any | P2 |
| T-02 | **ESLint 规则强化** | 添加 react-hooks/exhaustive-deps 等 | P2 |
| T-03 | **测试覆盖率达到 90%** | 补齐组件测试（Practice, ImportModal） | P2 |
| T-04 | **组件拆分** | Practice.tsx (616行) 拆分为更小组件 | P2 |
| T-05 | **监控/日志** | 添加前端错误捕获和上报 | P3 |
| T-06 | **性能优化** | 大数据量题库 (>5000题) 的分页/虚拟滚动 | P3 |

### 升级路线图

```
2026 Q3 (近期)         2026 Q4 (中期)          2027 Q1 (远期)
─────────────────────────────────────────────────────────
F-01 题库隔离          F-10 不定项选择          F-28 桌面端
F-02 随机选项          F-13 AI 智能挖空         F-29 分享功能
F-03 自动下一题        F-15 计时模式            F-30 多用户协作
F-04 主观判分          F-17 错题专项            F-31 竞赛模式
F-07 导出/导入         F-18 艾宾浩斯复习        F-32 题库市场
F-21 题干搜索          F-19 统计图表            T-05 监控
F-24 深色模式          F-20 知识点标签          T-06 虚拟滚动
T-01 严格模式          F-25 Markdown 渲染
T-03 组件测试          T-04 组件拆分
```

---

## 附录

### A. 历史 Bug 修复记录

| 日期 | Bug | 根因 | 修复 |
|------|-----|------|------|
| 2026-06-20 | 填空题题干未挖空，答案暴露 | `tryParseFill` 对 `parts` 做 `replace(/\s{2,}/g, '____')` 只替换了空格分隔符，答案文本保留在内容中 | 改写为索引取模：偶数索引取正文+`____`，奇数索引取答案 |
| 2026-06-20 | 单空填空题无任何空白 | off-by-one：`i+1 < parts.length` 条件导致最后一个元素不生成 `____` | 改为无条件 `else` |
| 2026-06-20 | 多选题选 ABCDE 判对 | `normalizeMulti` 的 `replace(/[^A-D]/g, '')` 静默丢弃非法字符 | 添加校验 `!/^[A-D]*$/.test(input)`，非法直接判错 |
| 2026-06-20 | 判断题 `expected` 显示为 `true`/`false` | `checkAnswer` 直接返回原文 | 转译为"对"/"错"，按钮高亮兼容中英文 |
|| 2026-06-21 | 单选题 tab/短空格多选项未分离（A.xxx\tB.xxx） | `split(/\s{3,}/)` 不匹配 tab 和 2 空格 | 改为 `split(/\t| {2,}(?=[A-Da-d][.、．])/)` — tab + 2+空格后跟选项标记 |
|| 2026-06-21 | 填空题顿号枚举未分离（、降低负荷  、严禁强行带负荷） | `extractFillAnswers` 交替模式不处理中文顿号枚举 | 单遍线性扫描，`、` 短内容提升为答案 |
|| 2026-06-21 | 填空题连词单空格未切分（及 调节油） | `split(/\s{2,}/)` 不匹配连词后单空格 | 增加 `(?<=及|与|和|或)\s` 切分规则 |
|| 2026-06-21 | 答案清洗误伤长答案（0.1 MPa，燃料气压力） | `\s+，.*$` 剥离所有逗号后内容 | 改用 `\s[、，]\s*[^会将]*[会将].*$` 仅剥离含功能词的逗号从句 |
|| 2026-06-21 | 问答题"处理方法是："被当作独立题目 | `isQuestionLine` 中 `方法` 无 `$` 锚点匹配了任意包含"方法"的行 | `方法` → `方法$` 仅匹配行尾 |
|| 2026-06-21 | PWA 缓存不使用 `autoUpdate` | `vite-plugin-pwa` 的 `generateSW` 模式忽略 `registerType` | 改为 `injectManifest` + 自定义 `sw-custom.js`（NetworkFirst + skipWaiting + clientsClaim） |

### B. 常见问题

**Q: 关掉 App 再开需要重新导入吗？**
A: 不需要。数据存储在浏览器的 IndexedDB 中，关掉再开自动保留。但不同浏览器/设备间不共享。

**Q: 导入题库后数据如何隔离？**
A: 每个题库通过 `bankId` 隔离，题目/练习记录/session 都关联到对应 `bankId`。不同题库的数据互不干扰。

**Q: 为什么填空题的挖空有时候不准？**
A: 当前使用规则匹配（在题干中查找答案文本替换为 `____`）。如果答案文本在题干中用词不完全一致（如缩写、序数词变体），匹配会失败——此时会在题干末尾追加一个空白框，不影响练习。后续可叠加 DeepSeek AI 智能挖空增强。

**Q: 支持哪些文件格式？**
A: .txt、.json、.csv、.docx、.md。DOCX 文件自动提取为文本后走考试卷解析器。
