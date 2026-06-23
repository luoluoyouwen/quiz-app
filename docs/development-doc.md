# 刷题 App 开发文档

> 项目名称：Quiz App  
> 版本：2.0.0  
> 更新日期：2026-06-23  
> 技术栈：React 19 + TypeScript 6 + Vite 8 + Ant Design 6 + Dexie (IndexedDB) + Supabase + Cloudflare Pages Functions

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
11. [Supabase 后端集成](#11-supabase-后端集成)
12. [关键技术决策](#12-关键技术决策)
13. [开发与部署](#13-开发与部署)
14. [未来升级路线](#14-未来升级路线)
15. [AI 格式整理模块](#15-ai-格式整理模块)
16. [新人快速接手清单](#16-新人快速接手清单)

---

## 1. 项目概述

### 1.1 目标

一套**纯前端、离线可用**的刷题 PWA，支持多种题型导入与练习。用户首次加载后无需网络即可使用，数据持久化在浏览器 IndexedDB 中。

### 1.2 核心能力

| 功能 | 说明 |
|------|------|
| 🔐 **账号系统** | 工号(SMYH)+密码登录/注册，90 天免登录持久化 |
| 📂 **题库管理** | 创建/删除题库、按题型统计、哈希去重 |
| ☁️ **云端上传** | 登录后上传自动同步到 Supabase，全员共享 |
| ✅ **题库审核** | 上传后标记 pending，管理员批准后全员可见，驳回仅上传者和管理员可见 |
| 🔄 **云端进度同步** | 多端刷题进度实时同步，联网自动回写（sendBeacon 兜底） |
| 📴 **在线/离线双模式** | 有网走云端，没网读本地缓存，联网后 pending 进度自动回写 |
| 🛡️ **管理后台** | 系统概览（统计卡片）、题库审核（批准/驳回）、用户管理（角色/密码重置） |
| 📥 **文件导入** | 支持 .txt / .json / .csv / .docx / .md 五种格式 |
| 🤖 **AI 格式整理** | DOCX 导入时可选 AI 归一化排版（双模式：本地直连 / CF 代理） |
| 🖼️ **DOCX 配图自动提取** | 导入 DOCX 时自动提取内嵌图片，刷题/背题/详情均展示（点击放大） |
| 🔢 **五类题型** | 单选题、多选题、填空题、判断题、简答题 |
| ✏️ **自动挖空** | 导入填空题时自动将答案文本替换为 `____`，支持 `、` 枚举多空 |
| 🧠 **背题模式** | 全题型支持：显示答案→自评"记住了/没记住" |
| 🚀 **一键开刷** | 主按钮直接进全部题型，齿轮图标选特定题型/随机抽 N 题 |
| 📊 **统计图表** | Recharts 折线图展示最近 20 次正确率趋势，统计卡片可点击直达对应题型 |
| 🔍 **题目搜索** | 题库内实时搜索题目内容、答案、选项 |
| ❌ **错题本** | 答错自动收集，随错随记，支持错题重刷 |
| ⏯️ **断点续刷** | 按题型独立保存进度，离开后 24 小时内可继续 |
| 📱 **左右滑动** | 右滑上一题、左滑下一题（touch handlers） |
| 📋 **题目导航网格** | 浮动按钮弹出，已答绿底、当前题蓝底、未答灰底、云端已答金色边框 |
| 🏁 **练习结果页** | 完成后显示正确率，绿≥80%/黄≥50%/红<50% 色标 + 错题回顾列表 |
| 🌙 **深色模式** | 右上角切换，偏好持久化到 localStorage |
| 📴 **PWA 离线** | 安装到主屏幕后完全离线可用，自定义 Service Worker（NetworkFirst） |
| 🔄 **自动更新** | Service Worker autoUpdate + 蓝色提示条刷新 |

### 1.3 目标用户画像

- 备考学生/考证人士：导入 DOCX/TXT 题库后离线刷题，多端进度同步
- 化工/工程类专业：支持化工题库特有的填空题多空格格式
- 企业内部培训：工号登录，管理员统一管控题库审核与发布
- 手机 Safari/Chrome 用户：PWA 安装后像原生 App 一样使用，断网续刷

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
│  ┌───────────┐                            │
│  │ Normalize │  AI 格式整理模块            │
│  │ (直接/代理)│  双模式：本地直连 /  CF 代理 │
│  └───────────┘                            │
├──────────────────────────────────────────┤
│          Data Layer (Dexie/IndexedDB)     │
│  banks / questions / sessions / answers   │
└──────────────────────────────────────────┘

部署版 AI 调用链路（CF Pages）：
┌──────────┐    POST /api/ai-normalize    ┌──────────────────┐
│  浏览器   │ ──────────────────────────→ │  CF Pages Function│
│  (无 key) │ ←────────────────────────── │  (带 env key)     │
└──────────┘                              └────────┬─────────┘
                                                   │ fetch (有 key)
                                                   ▼
                                            ┌──────────────────┐
                                            │  DeepSeek API    │
                                            └──────────────────┘
```

部署版完整架构（含 Supabase 云端）：
```
┌──────────────────────────────────────────────────┐
│                    浏览器 PWA                      │
│  ┌────────────────┐    ┌────────────────────┐   │
│  │  React 19 UI   │    │  Dexie (IndexedDB) │   │
│  │  ┌──────────┐  │    │  ┌──────────────┐ │   │
│  │  │ Home     │  │    │  │ banks        │ │   │
│  │  │ BankDet  │  │    │  │ questions    │ │   │
│  │  │ Practice │  │    │  │ sessions     │ │   │
│  │  │ Login    │  │    │  │ userProgress │ │   │
│  │  │ AdminDash│  │    │  └──────────────┘ │   │
│  │  └──────────┘  │    └────────┬─────────┘   │
│  └────────────────┘             │              │
│         │                       │ sync         │
│         ▼                       ▼              │
│  ┌────────────────────────────────────────┐    │
│  │  Supabase JS SDK (custom fetch proxy)  │    │
│  └─────────────────┬──────────────────────┘    │
└────────────────────┼──────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │  CF Pages Functions  │
          │  ├─ /api/auth/*     │
          │  ├─ /api/rest/*     │
          │  ├─ /api/ai-normalize│
          │  └─ (admin RPC)      │
          └──────────┬──────────┘
                     │
          ┌──────────┴──────────┐
          │  Supabase (Singapore)│
          │  ├─ PostgreSQL       │
          │  │  profiles        │
          │  │  question_banks  │
          │  │  questions       │
          │  │  user_progress   │
          │  ├─ Auth (email/pwd)│
          │  └─ Storage (images)│
          └─────────────────────┘
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
| **云端后端** | **Supabase (PostgreSQL + Auth)** | 账号体系、云端题库、进度同步 |
| 测试 | Vitest 4 | 与 Vite 原生集成 |
| 代理 | Cloudflare Pages Functions | 零配置部署，AI 请求代理防 key 泄漏 |
| 部署 | Cloudflare Pages / Vercel | 国内可通（CF）/ 全球加速 |

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

### 3.1b Supabase 云端表

| 表 | 说明 | 关键字段 |
|-----|------|---------|
| `profiles` | 用户扩展信息 | id (UUID PK, FK→auth.users), email, role (user/admin), can_upload, upload_expires_at, created_at |
| `question_banks` | 题库 | id (UUID PK), name, description, content_hash (UNIQUE), review_status (pending/approved/rejected), created_by, question_count, created_at |
| `questions` | 题目 | id (UUID PK), bank_id (FK→question_banks), type, content, options (JSONB), answer, answers (JSONB), explanation, image_url, sort_order |
| `user_progress` | 刷题进度 | id (UUID PK), user_id, question_id, bank_id, user_answer, is_correct, time_taken, attempted_at |
| `upload_requests` | 上传权限申请（P3 已废弃，表保留但未使用） | id, user_id, status, created_at |

**触发器：**
- `handle_new_user` — 注册时自动创建 profiles 行（SECURITY DEFINER）

**索引：**
| 索引 | 表 | 说明 |
|------|-----|------|
| `idx_questions_bank` | questions | 按 bank_id 快速查询题目 |
| `idx_progress_user` | user_progress | 按 user_id 查用户进度 |
| `idx_progress_question` | user_progress | 按 question_id 合并进度 |
| `idx_upload_req_status` | upload_requests | 按状态筛选申请（已废弃） |
| `idx_banks_review_status` | question_banks | admin 按状态查待审核题库 |

**辅助函数（均 SECURITY DEFINER 防 RLS 递归）：**

| 函数 | 用途 |
|------|------|
| `is_admin()` | 检查当前用户 role='admin' |
| `can_upload()` | 检查用户是否有上传权限（P3 后所有用户均可上传，函数保留未用） |

**review_status 可见性规则：**
| 状态 | 上传者 | 管理员 | 其他用户 |
|------|--------|--------|---------|
| approved | ✅ | ✅ | ✅ |
| pending | ✅ | ✅ | ❌ |
| rejected | ✅ | ✅ | ❌ |

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
  image?: string;        // 题目配图（data:image/...;base64,...），DOCX 导入时自动提取
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
| `/` | 首页 | `Home.tsx` | 云端+本地题库列表，统计，导入入口 |
| `/admin` | 管理后台 | `AdminDashboard.tsx` | 系统概览、题库审核、用户管理（仅 admin） |
| `/bank/:id` | 题库详情 | `BankDetail.tsx` | 题目列表、统计卡片、导入入口 |
| `/practice/:bankId` | 练习 | `Practice.tsx` | 核心刷题界面，云端进度同步 |
| (登录页) | 登录/注册 | `Login.tsx` | 工号+密码登录/注册（未登录时自动展示） |

路由守卫：
- `AdminRoute.tsx` — 非 admin 用户访问 /admin 自动跳转首页
- `AuthContext` — 未登录用户全局拦截，强制显示 Login 页

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
    ├── .docx → detectFormat: mammoth→ AI 归一化(可选) → parseExamDocx(text)
    │               │                     │
    │               │              ┌──────┴──────┐
    │               │              │ 本地开发     │ 部署版
    │               │              │ 直连DeepSeek │ CF Pages Function 代理
    │               │              └──────┬──────┘
    |    │               │              └── 失败降级 → 原文
    |    │               ▼
    |    │             同时：mammoth.convertToHtml({ convertImage: mammoth.images.dataUri })
    |    │             → HTML 中嵌入 base64 data URL 图片
    |    │             → extractImagesFromHtml() 收集所有 img src
    |    │             → countImagesPerSection() 按章节统计图片数
    |    │             → assignImagesToQuestions() 按章节映射到 choice/multi/essay 题目
    |    ▼
    └── .md   → parseMarkdown(text)
    │
    ▼
applyClozeToFillQuestions()  // 自动挖空填空题
    │
    ▼
展示预览表格 → 用户确认 → db.questions.bulkAdd()
```

AI 归一化双模式详情见[第 15 章](#15-ai-格式整理模块)。

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
| 驯号枚举长度硬限 | `、` 后内容 ≤7 字才提升为答案，≥8 字仍作为题干（边界案例极少） | v2 词汇分析替代长度启发 |

### 5.4 简答题解析要点

**无答案简答题**：`五 问答题` 区中问题行后无 `答：` 行的，仍然保留为 `type:'essay', answer:''`，供后续图片挂载（图片型题目）。

**答案子标题误判**：答案中出现的`处理方法`、`主风机C-301故障停机步骤`等子标题曾被 `isQuestionLine` 正误判为新题目行，导致答案收集提前中断。修复方式：
- 行以 `？` 结尾 → 无条件视为新题目（break）
- 行匹配 `方法$`/`步骤$` → 仅当**下一行以 `答：` 开头**时才视为新题目（break），否则视为答案子标题继续收集

### 5.5 DOCX 图片提取

```text
DOCX
 ├─ mammoth.extractRawText ──→ 纯文本 ──→ AI normalize ──→ parseExamDocx ──→ questions[]
 │
 └─ mammoth.convertToHtml({ convertImage: mammoth.images.dataUri })
    → HTML 中嵌入 base64 data:image/png;base64,... URL
    → extractImagesFromHtml() 正则提取所有 <img src> → imageList[]
    → countImagesPerSection():
        遍历 HTML 段落，检测章节标题（一 填空题/二 单选题…）
        统计每个章节内 <img> 出现次数 → { choice: N, multi: M, essay: K }
    → assignImagesToQuestions():
        Pass 1: 映射到 choice 型题目（共 N 张图）
        Pass 2: 映射到 multi 型题目（共 M 张图）
        Pass 3: 映射到无答案 essay 型题目（共 K 张图）
    → Question.image = data URL
```

**关键坑点**：
- `countImagesPerSection()` 不能跳过无文本内容的段落（独立 `<p><img/></p>`），必须在检查文本前先检测 `hasImage`
- mammoth `convertImage` 必须使用 `mammoth.images.dataUri`（内置 base64 转换器），手动 `readAsArrayBuffer` + `btoa` 在浏览器环境可能失败
- 图片存储为 base64 data URL ~69KB/张，IndexedDB 无压力

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

1. 部署新版本到 Cloudflare Pages
2. 用户打开 PWA → Service Worker 后台下载新版本
3. 检测到更新 → 显示蓝色提示条 "🆕 新版本已发布"
4. 用户点击"刷新" → 立即激活新版本

---

## 10. 测试体系

### 10.1 测试总览

| 测试文件 | 用例数 | 覆盖范围 |
|----------|--------|----------|
| `engine.test.ts` | 54 | 打乱、筛选、判题（5种题型+多空+非法字符+无options兼容+集成） |
| `stats.test.ts` | 11 | 统计聚合、薄弱点分析、错题队列 |
| `exam.test.ts` | 37 | DOCX 解析：5题型 + tab/短空格多选项 + 顿号枚举 + 连词切分 + 答案清洗 + nofill + AI规范化位置保留 |
| `raw_docx.integration.test.ts` | 16 | 全量数据 10 项一致性断言 + 选项前缀剥离验证 + 多空answers完整性 |
| `QuestionCard.test.tsx` | 8 | showAnswer 显示逻辑：选择/填空/判断/简答/无空填空 |
| `StatsChart.test.tsx` | 5 | 数据排序/20条上限/空数据 |
| `ThemeContext.test.tsx` | 7 | 深色模式切换/持久化/localStorage 异常处理 |

总计：**153 个测试用例**（vitest：137 单元 + 16 集成）

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

## 11. Supabase 后端集成

### 11.1 架构

```
┌──────────────────────────────────────────────┐
│              前端 PWA                          │
│  ┌──────────────┐    ┌──────────────────┐    │
│  │  Dexie 缓存   │    │  Supabase SDK    │    │
│  │  (离线优先)    │    │  (cloud API)     │    │
│  └──────────────┘    └────────┬─────────┘    │
│                               │                │
└───────────────────────────────┼────────────────┘
                                │
                     CF Pages Functions 代理
                     /api/auth/*  /api/rest/*
                     (custom fetch -> 重写 URL)
                                │
                     ┌──────────┴──────────┐
                     │    Supabase           │
                     │  Singapore 节点        │
                     └─────────────────────┘
```

### 11.2 代理模式

生产环境通过 CF Pages Function（`functions/api/[[catchall]].ts`）代理所有 Supabase 请求：

```typescript
// 前端 supabase client (src/lib/supabase.ts)
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true },
  global: {
    fetch: isProd
      ? async (url, options) => {
          const newUrl = url.toString().replace(supabaseUrl, '/api');
          return fetch(newUrl, options);
        }
      : undefined,
  },
});
```

**路由映射：**

| 原始 URL | 代理 URL | 说明 |
|----------|----------|------|
| `https://xxx.supabase.co/auth/v1/...` | `/api/auth/v1/...` | Auth 请求 |
| `https://xxx.supabase.co/rest/v1/...` | `/api/rest/v1/...` | REST API 请求 |

**坑点：**
> CF Pages Functions 使用文件系统路由。**必须用 `[[catchall]].ts` 双括号命名**才能匹配 `/api/*` 下所有子路径。`api/proxy.ts` 只匹配 `/api/proxy`，不匹配 `/api/auth/...`。

### 11.3 Auth 系统

#### 登录流程

```
注册：工号 -> email（{工号}@local.app）+ 密码 -> supabase.auth.signUp()
  ↓
自动触发 database trigger：handle_new_user() -> 创建 profiles 行
  ↓
登录：supabase.auth.signInWithPassword()
  ↓
AuthContext 监听 onAuthStateChange -> 更新 user + profile state
  ↓
未登录 -> 显示 Login 页（全局强制）
登录后 -> 显示 AppLayout（含导航栏）
```

#### 登录/注册验证规则

| 规则 | 前端 | 后端 |
|------|------|------|
| 工号格式 | `^SMYH\\d{4}$`（自动大写） | Supabase Auth email |
| 密码长度 | >= 8 位 | Supabase Auth 默认 |
| 密码内容 | 包含字母 + 数字 | — |

#### 关键组件

| 组件 | 职责 |
|------|------|
| `AuthContext.tsx` | 管理 user/profile 状态，提供 signIn/signUp/signOut，3 秒超时防白屏 |
| `Login.tsx` | 登录/注册表单，含实时格式校验 |
| `AdminRoute.tsx` | 路由守卫，检查 profile.role === 'admin' |

### 11.4 云端上传与审核

```
用户上传文件 -> ImportModal.tsx
  │
  ├─ 已登录 -> uploadBankToSupabase(name, questions, user.id)
  │   ├─ INSERT question_banks (review_status='pending')
  │   ├─ BATCH INSERT questions (每 500 条一批)
  │   └─ syncCloudBankToLocal() -> 缓存到 Dexie（☁️ {uuid} 标记）
  │
  ├─ 未登录 -> 仅写本地 Dexie（无云端同步）
  │
  └─ 内容去重：SHA-256(content_hash) 检测重复，重复则提示并直接缓存
```

#### 上传流程细节

**1MB 文件限制：** `handleFileSelect` 入口处校验，超过 1MB 的文件被拦截并提示。

**ImportModal 双模式：**
- 从 Home 打开（未传 `bankId`）：显示题库名称输入框（默认用文件名），上传后创建新题库
- 从 BankDetail 打开（`bankId` 已传）：标题显示「追加到题库名」，直接追加到当前题库

**上传入口统一：**
- **已登录用户**：上传只走云端，不创建本地 Dexie bank
- **未登录用户**：保持旧逻辑（纯本地）
- **云端缓存**：上传后自动 `syncCloudBankToLocal`，description 存 `☁️ {uuid}` 标记

#### 本地题库一键迁移（P3 迁移横幅）

紫色渐变横幅显示在首页顶部，条件：
- `localStorage.getItem('cloud_migration_done')` 不存在
- `db.banks.count() > 0`（存在本地题库）

迁移流程：逐库读取题目 → 检查云端重复（按 name 粗略去重）→ 计算内容哈希 → 上传到 Supabase（`review_status='pending'`）→ 标记 localStorage

「稍后再说」关闭横幅（不设标记，下次刷新仍显示）。

#### 审核机制变更

| 之前（P1-P2） | 之后（P3+） |
|------|------|
| 有上传权限检查 + 审批申请流程 | **所有登录用户均可上传**，标记 `review_status='pending'` |
| `can_upload` / `upload_expires_at` 字段控制 | 两字段保留但不再使用 |
| upload_requests 表记录申请 | 表保留但不再写入 |

### 11.5 进度同步

#### 同步架构

```
刷题完成/离开页面
    │
    ├─ 在线 -> submitPracticeProgress(records, userId)
    │   ├─ BATCH INSERT -> Supabase user_progress 表
    │   └─ 同时写入 Dexie（标记 synced）
    │
    ├─ 离线 -> 写入 Dexie（标记 pending）
    │   └─ 联网后 registerAutoSync 自动回写
    │
    └─ 关闭/离开兜底 -> submitProgressBeacon (sendBeacon)
        └─ 绕过 supabase-js，直 POST Supabase REST API
```

#### 核心服务函数（`src/lib/syncService.ts`）

| 函数 | 说明 |
|------|------|
| `submitPracticeProgress(records, userId)` | 批量提交进度：在线写 Supabase + 缓存 Dexie；离线写 Dexie（pending） |
| `fetchBankProgress(userId, bankId)` | 从 Supabase 拉取某题库全部进度 |
| `syncPendingProgress(userId)` | 读取本地所有 pending 记录 → 批量写入 Supabase → 标记 synced |
| `registerAutoSync(userId)` | 监听 `window.online` 事件，联网自动回写；启动时立即尝试一次；返回 unregister 函数 |
| `submitProgressBeacon(records, userId)` | 页面关闭时兜底提交，用 `navigator.sendBeacon` 直 POST Supabase REST API |

**Dexie 版本迁移：** `db.version(2)` 安全升级，新增 `userProgress` 表（含 `syncStatus` 字段 `'pending'` / `'synced'`），Dexie 自动处理 schema 迁移，不影响现有数据。

#### 云端进度拉取

进入练习页时：
1. 通过 `cloudProgress` state 记录该题库的云端进度
2. `cloudAnsweredSet` 用 useMemo 计算已答合成 ID
3. 题号网格显示金色边框标记（已答题目）

多端合并策略：按 `question_id` 去重，取 `attempted_at` 最新的记录。

### 11.6 管理员后台

| 功能 | 实现 |
|------|------|
| 系统概览 | 四个统计卡片（用户数/题库数/题目数/待审核数） |
| 题库审核 | 待审核列表（pending Tab）→ 批准/驳回（UPDATE review_status）；已审核列表（reviewed Tab）只读 |
| 用户管理 | 用户列表 → 角色管理（UPDATE profiles.role）+ 密码重置弹窗 |
| 密码重置 | `supabase.rpc('admin_reset_password')` → SECURITY DEFINER 函数 → 直接操作 `auth.users` |

**移动端适配：**
- 三个 Table 均设置 `scroll={{ x: 'max-content' }}`，窄屏可横向滑动
- 分页尺寸缩为 `size: 'small'`，节省纵向空间
- 容器 padding 缩为 `12px 16px`

**密码校验统一：**
| 位置 | 规则 |
|------|------|
| 注册页 placeholder | 至少 8 位，含字母+数字 |
| 注册页 `validatePassword()` | 8 位 + `/[a-zA-Z]/` + `/\d/` |
| 后台改密码弹窗提示 | 至少 8 位，需包含字母和数字 |
| 后台改密码前端校验 | 8 位 + 字母/数字正则 |
| SQL RPC 校验 | 8 位 + `!~ '[a-zA-Z]'` + `!~ '[0-9]'` |

**废弃文件：** `functions/api/admin/reset-password.ts` — 最初采用 CF Pages Function + SERVICE_ROLE_KEY 方案，但因新版 `sb_secret_xxx` key 不兼容 Auth Admin API 而废弃，改用 RPC 方案。代码保留但不再使用。

#### 密码重置 RPC 函数

```sql
CREATE OR REPLACE FUNCTION admin_reset_password(target_user_id UUID, new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION '权限不足'; END IF;
  IF length(new_password) < 8 THEN RAISE EXCEPTION '密码至少 8 位'; END IF;
  IF new_password !~ '[a-zA-Z]' OR new_password !~ '[0-9]' THEN
    RAISE EXCEPTION '密码必须包含字母和数字';
  END IF;
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = NOW(),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION '用户不存在'; END IF;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_reset_password TO authenticated;
```

**注意**：不能使用新版 `sb_secret_xxx` key 调用 Auth Admin API（`/auth/v1/admin/users`），因为该端点只认旧版 `service_role` JWT。RPC 方案绕过此限制。

#### 首个管理员创建

```sql
-- 注册一个工号后执行：
UPDATE profiles SET role='admin' WHERE email='xxx@local.app';
```

### 11.7 RLS 策略

所有 RLS 通过 `is_admin()` 函数判断管理员权限，该函数必须为 SECURITY DEFINER 以绕过 RLS 递归：

```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;
```

关键策略：

```sql
-- profiles：用户看自己，admin 看全部
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid() OR is_admin()
);

-- question_banks：approved 全员可见；pending/rejected 仅上传者和 admin
CREATE POLICY "banks_select" ON question_banks FOR SELECT USING (
  review_status = 'approved' OR created_by = auth.uid() OR is_admin()
);

-- user_progress：用户只能读写自己的进度
CREATE POLICY "progress_all" ON user_progress FOR ALL USING (
  user_id = auth.uid()
);
```

### 11.8 环境变量

| 变量 | 用途 | 来源 |
|------|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | `.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | `.env.local` |
| `AI_NORMALIZE_API_KEY` | DeepSeek API key（生产，CF 环境变量） | CF Dashboard |
| `VITE_AI_NORMALIZE_PROXY` | AI 代理路径 | `.env.production` |

### 11.9 数据库迁移脚本

按执行顺序：

| 脚本 | 用途 |
|------|------|
| `supabase-migration-p1-init.sql` | 初始表结构 + profiles trigger |
| `supabase-migration-p3-review.sql` | 添加 review_status + RLS |
| RPC: `admin_reset_password` | 密码重置函数（手动执行） |

---

## 12. 关键技术决策

### 12.1 为什么是多空合一而不是拆题

**问题**：填空题一行三个空白，拆成三题还是合为一题？
**决定**：合为一题，`answers: string[]` 数组存储，用户输入用 `||` 分隔。
**理由**：保持原始题号对应关系，便于回顾时对照原题上下文。

### 12.2 为什么多选题独立为 `multi` 类型

**问题**：选择题（单选/多选）解析时难以区分。
**决定**：解析器在 `tryParseChoice` 中统一解析为 `choice` 类型，外层按答案字母数自动区分：
- 1 个字母 -> `'choice'`（Radio 单选）
- 多个字母 -> `'multi'`（Checkbox 多选）
**理由**：化工题库的格式高度一致，此规则覆盖 99% 情况。

### 12.3 为什么用规则挖空而非 AI

**问题**：答案在题干中的位置不确定，AI 判断更准确。
**决定**：先用规则精确匹配（效率高、零延迟），规则失败时在末尾追加空白。
**理由**：用户未提供 DeepSeek API Key；纯前端方案更可靠，后续可叠加 AI 作为可选增强。

### 12.4 为什么判题使用容错而非精确匹配

**问题**：填空题输入与实际答案常有细微出入。
**决定**：三级容错：精确->子串包含->Levenshtein 距离 <= 2。
**理由**：用户手动输入时难免多字少字或错别字，容错能减少不必要的判错。

### 12.5 为什么用 FileReader 而非 file.text()

**问题**：现代浏览器支持 `file.text()`，为何用旧的 FileReader？
**决定**：FileReader 在 iOS Safari 上兼容性更好，`file.text()` 在某些版本有 bug。

---

## 13. 开发与部署

### 13.1 本地开发

```bash
cd E:\\quiz-app
npm install        # 安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173）
npm test           # 运行测试
npm run build      # 构建生产版本
npm run preview    # 预览构建产物
```

### 13.2 部署到 Cloudflare Pages

```bash
# 一键部署（需 CLOUDFLARE_API_TOKEN 在环境变量中）
bash deploy-cf.sh

# 或手动
npm run build
npx wrangler pages deploy dist/ --project-name=quiz-app
```

CF Pages Function（`functions/api/ai-normalize.ts`）在部署时自动编译上传，无需额外配置。

### 13.3 项目结构

```
quiz-app/
├── functions/                   # CF Pages Functions（AI 代理 + Supabase 代理）
│   └── api/
│       ├── ai-normalize.ts      # AI 格式整理代理端点
│       └── [[catchall]].ts      # Supabase API 代理（auth + REST）
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
├── src/
│   ├── components/
│   │   ├── ImportModal.tsx      # 文件导入弹窗
│   │   ├── QuestionCard.tsx     # 题目展示卡片
│   │   ├── AdminRoute.tsx       # 管理员路由守卫
│   │   ├── Login.tsx            # 登录/注册页
│   │   └── PwaUpdatePrompt.tsx  # PWA 更新提示条
│   ├── pages/
│   │   ├── Home.tsx             # 首页：云端+本地题库列表
│   │   ├── BankDetail.tsx       # 题库详情页
│   │   ├── Practice.tsx         # 练习页（核心，云端进度同步）
│   │   └── AdminDashboard.tsx   # 管理后台（仅 admin）
│   ├── hooks/
│   │   └── useQuizSession.ts    # 刷题会话 Hook
│   ├── lib/
│   │   └── supabase.ts          # Supabase client（含代理 fetch）
│   ├── contexts/
│   │   └── AuthContext.tsx       # 认证状态管理
│   ├── utils/
│   │   ├── parsers/             # 文件格式解析器
│   │   │   ├── index.ts        # 格式检测路由
│   │   │   ├── types.ts        # 共享类型
│   │   │   ├── exam.ts         # 考试卷解析器（核心）
│   │   │   ├── exam.test.ts                     # 解析器测试 (37)
│   │   │   ├── raw_docx.integration.test.ts     # 全量数据集成测试 (16)
│   │   │   ├── txt.ts          # TXT 解析
│   │   │   ├── json.ts         # JSON 解析
│   │   │   ├── csv.ts          # CSV 解析
│   │   │   ├── docx.ts         # DOCX 转文本
│   │   │   ├── markdown.ts     # Markdown 解析
│   │   │   └── normalize.ts    # AI 格式整理（直接/代理双模式）
│   │   ├── quiz/
│   │   │   ├── engine.ts       # 刷题引擎（判题/打乱/筛选）
│   │   │   ├── engine.test.ts  # 引擎测试
│   │   │   ├── stats.ts        # 统计/薄弱点/错题队列
│   │   │   └── stats.test.ts   # 统计测试
│   │   ├── cloze/
│   │   │   └── index.ts        # 自动挖空/生成挖空题
│   │   ├── themeColors.ts      # 深色模式颜色方案
│   │   ├── sync.ts             # 云端进度同步工具
│   │   └── changelog.ts        # 版本号与更新日志
│   ├── db.ts                   # Dexie 数据库定义
│   ├── App.tsx                 # 路由+全局组件
│   ├── main.tsx                # 入口+PWA注册
│   └── index.css               # 全局样式
├── docs/
│   └── development-doc.md      # 本文档
├── supabase-migration-p1-init.sql   # Supabase 迁移：初始表
├── supabase-migration-p3-review.sql # Supabase 迁移：审核 + RLS
├── sw-custom.js                # 自定义 Service Worker（injectManifest）
├── .env.local                  # 本地 Supabase 密钥（gitignored）
├── .env.normalize.example      # AI API key 配置模板
├── .env.production             # 生产构建环境变量（代理路径）
├── .gitignore                  # 脱敏/构建产物排除规则
├── deploy-cf.sh                # CF Pages 一键部署脚本（gitignored）
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 14. 未来升级路线

### P4 — 后端升级（已完成 P1-P5）

以下为本次后端升级（2026-06-23）已完成的全部功能。**原有路线图中的 F-08（云端同步）和 F-09（数据库迁移）已被此升级覆盖。**

| 阶段 | 内容 | 关键文件 |
|------|------|---------|
| P1 | Supabase 项目创建、Auth 配置、5 张表 + RLS + 触发器、CF Pages Function 反向代理（`[[catchall]].ts`）、Supabase SDK 集成、登录/注册页、密钥使用 publishable/secret 新体系 | `supabase.ts`, `AuthContext.tsx`, `Login.tsx`, `[[catchall]].ts`, `supabase-migration-p1-init.sql` |
| P2 | Header 用户信息（工号+🛡️+退出）、AdminRoute 路由守卫、条件菜单（admin 可见「后台管理」）、右上角工号可点击进后台（移动端友好） | `App.tsx`, `AdminRoute.tsx` |
| P3 | 上传自动建库（ImportModal 双模式：新建/追加）、1MB 文件限制、云端题库列表（fetchVisibleBanks + 本地合并）、云端题库详情+练习（UUID ID 映射）、哈希去重（SHA-256 content_hash）、审核机制（review_status + RLS）、所有用户可上传、本地题库一键迁移（紫色横幅）、移除创建题库按钮 | `uploadService.ts`, `hash.ts`, `MigrationBanner.tsx`, `ImportModal.tsx`, `Home.tsx`, `BankDetail.tsx`, `Practice.tsx`, `supabase-migration-p3-review.sql` |
| P4 | 进度批量提交（submitPracticeProgress）、云端拉取进度（fetchBankProgress）、离线 pending 自动回写（syncPendingProgress）、联网自动同步（registerAutoSync）、sendBeacon 兜底提交、Dexie v2 升级（userProgress 表）、离线缓存题库区展示、题号网格云端已答金色标记、首页统计去重（排除 ☁️ 缓存条目） | `syncService.ts`, `db.ts`, `Practice.tsx`, `Home.tsx`, `App.tsx` |
| P5 | 管理后台三 Tab（系统概览/题库审核/用户管理）、批准/驳回 pending 题库、角色管理（设/取消管理员）、密码重置 RPC（绕过 Auth Admin API 的 sb_secret 限制）、移动端适配（表格横向滚动） | `AdminDashboard.tsx`, `App.tsx`, 密码重置 RPC SQL |

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
| ~~F-08~~ | ~~数据云端同步~~ | ~~可选 iCloud/WebDAV 同步多设备进度~~ | ✅ **P1-P5 已完成：Supabase 云端同步** |
| ~~F-09~~ | ~~数据库版本迁移~~ | ~~DB schema 升级策略，确保旧数据兼容~~ | ✅ **P1-P5 已完成：Dexie v2 迁移** |

### P1 — 增强题型支持

| 编号 | 功能 | 说明 | 预期工作量 |
|------|------|------|-----------|
| F-10 | **不定项选择题** | 支持"选对部分给分"模式（如选对 N 个给 N/M 分） | 2d |
| F-11 | **拖拽排序题** | 将选项拖到正确顺序/位置 | 3d |
| F-12 | **连线匹配题** | 左列-右列配对连线 | 3d |
| F-13 | **AI 格式整理（代理模式）** | 可选调用 DeepSeek API 做 DOCX 格式归一化，部署版通过 CF Pages Function 代理 | ✅ 已完成 v1.1.5 |
| F-14 | **图片嵌入题干** | 题干中显示图片（化工设备图、流程图） | ✅ 已完成 v1.8.0 |

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
|2026 Q3 (近期)               2026 Q4 (中期)          2027 Q1 (远期)
───────────────────────────────────────────────────────────────────
✅ P1-P5 后端升级完成         F-15 计时模式            F-28 桌面端
F-01 题库隔离                F-17 错题专项            F-29 分享功能
F-02 随机选项                F-18 艾宾浩斯复习        F-30 多用户协作
F-03 自动下一题              F-19 统计图表            F-31 竞赛模式
F-04 主观判分                F-20 知识点标签          F-32 题库市场
F-07 导出/导入               F-25 Markdown 渲染       T-05 监控
F-13 AI 格式代理 ✅          T-04 组件拆分            T-06 虚拟滚动
F-21 题干搜索
F-24 深色模式
T-01 严格模式
T-03 组件测试
```

---

## 15. AI 格式整理模块

### 15.1 设计目标

DOCX 导入时通过 DeepSeek API 做格式归一化，解决以下常见的排版混乱：
- tab 字符替代空格
- 全角/半角符号混用
- 选项前缀格式不统一（A. / A、/ A） / A:）
- 多个选项挤在同一行
- OCR 残留多余空格

### 15.2 双模式设计

| 模式 | 适用场景 | 调用链路 | API key 位置 |
|------|----------|----------|-------------|
| **直接模式** | 本地开发（`npm run dev`） | 前端 -> fetch -> DeepSeek API | `.env.normalize` 文件（Node `readFileSync` 加载） |
| **代理模式** | CF Pages 生产部署 | 前端 -> `/api/ai-normalize` -> CF Pages Function -> DeepSeek API | CF 环境变量 `AI_NORMALIZE_API_KEY`（Secret） |

模式选择由 `VITE_AI_NORMALIZE_PROXY` 环境变量控制：
- 未设置（本地开发）：走直接模式
- 设置为 `/api/ai-normalize`（`.env.production` 中定义）：走代理模式

### 15.3 实现架构 (`src/utils/parsers/normalize.ts`)

```
normalizeText(raw, options)
    │
    ├── VITE_AI_NORMALIZE_PROXY 有值？
    │   ├── 是 -> 代理模式：fetch(proxyUrl) -> CF Function -> DeepSeek
    │   └── 否 -> 直接模式：fetch(api.deepseek.com) + Authorization header
    │
    └── handleResponse(response, raw, fallback)
        ├── 200 + 有内容 -> 返回归一化文本
        └── 失败/超时 -> 返回原文（静默降级）
```

关键设计点：

1. **`resolveApiKey()`**：四层回退（调用参数 -> process.env -> `.env.normalize` 文件 -> 硬编码 `''`），仅直接模式使用
2. **`buildRequestBody()`**：共享的 request body 生成，包含 SYSTEM_PROMPT（~200 行精确 prompt）
3. **`handleResponse()`**：共享的 response 解析，错误时返回原文
4. **生产守卫**：代理模式下直接跳过 key 检查，代理端点本身校验 key

### 15.4 错误处理

| 场景 | 行为 |
|------|------|
| 网络超时 | 返回原文，console.warn |
| API 返回 4xx/5xx | 返回原文，console.error |
| 响应为空 | 返回原文，console.warn |
| 所有异常 | 返回原文（`fallbackSilently: true` 默认） |

### 15.5 CF Pages Function (`functions/api/ai-normalize.ts`)

```typescript
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  // 仅接受 POST
  // 校验 env.AI_NORMALIZE_API_KEY
  // 转发到 DeepSeek API 并返回结果
};
```

- 仅接受 POST 请求
- `AI_NORMALIZE_API_KEY` 缺失时返回 500 错误
- 转发完整的 request body 到 `https://api.deepseek.com/chat/completions`
- 65 秒超时（比前端 60 秒略长，包容一次网络重试）
- 无需编译，TypeScript 源文件直接由 wrangler 在部署时编译

---

## 16. 新人快速接手清单

> 失忆专用 — 从零开始接手此项目的所有关键信息。

### 16.1 项目速览

| 属性 | 值 |
|------|-----|
| 项目路径 | `E:\\quiz-app` |
| 域名 | `https://quiz-app-8q3.pages.dev` |
| CF Pages 项目名 | `quiz-app`（≠ 域名） |
| 部署方式 | `bash deploy-cf.sh`（需 `CLOUDFLARE_API_TOKEN`） |
| Supabase 项目 | 新加坡节点，通过 CF Pages Function 代理 |
| 当前版本 | v2.0.0 |
| 测试总数 | 153（7 文件，137 单元 + 16 集成） |
| 技术栈 | React 19 + TypeScript 6 + Vite 8 + Ant Design 6 + Dexie + Supabase + CF Pages |

### 16.2 前置准备

| 需要什么 | 在哪找 | 说明 |
|----------|--------|------|
| `CLOUDFLARE_API_TOKEN` | `.env.cf`（gitignored） | 部署到 CF Pages 用。bash 里 `export` 后再执行 `bash deploy-cf.sh` |
| `CLOUDFLARE_ACCOUNT_ID` | 同上 | 与 token 在同一文件 |
| `AI_NORMALIZE_API_KEY` | `.env.normalize`（gitignored） | 本地 AI 格式整理用 DeepSeek key。模板见 `.env.normalize.example` |
| `VITE_SUPABASE_URL` | `.env.local`（gitignored） | Supabase 项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local`（gitignored） | Supabase publishable key |
| 运行环境 | Windows 10 + git-bash | `npm`/`npx` 可用，`wrangler` 通过 npx |

### 16.3 一日操作流

```bash
# 1. 进入项目
cd /e/quiz-app

# 2. 安装依赖（首次 / 依赖变更后）
npm install

# 3. 本地开发
npm run dev            # http://localhost:5173

# 4. 跑测试
npm test               # 153 tests, 7 files

# 5. 构建
npm run build

# 6. 部署
export CLOUDFLARE_API_TOKEN=***  # 从 .env.cf 取值
bash deploy-cf.sh                # 构建+部署一气呵成
# 或手动：npx wrangler pages deploy dist/ --project-name=quiz-app
```

### 16.4 关键约定与陷阱

| 事项 | 说明 |
|------|------|
| **项目名 ≠ 域名** | CF Pages 项目名是 `quiz-app`，域名是 `quiz-app-8q3.pages.dev`。部署时 `--project-name=quiz-app` |
| **不 commit 机密** | `.gitignore` 已保护 `.env*.local` / `.env.cf` / `.env.normalize` / `raw_docx.txt` / `deploy-cf.sh` |
| **raw_docx.txt** | 真实考试数据，已从 git 历史彻底抹除。有该文件时集成测试跑 16 条，没有时跳过错 |
| **测试踩坑** | Vitest 4 + jsdom 下 Dexie 初始化会导致 worker crash。组件测试用 Playwright E2E 代替 |
| **SW 更新** | NetworkFirst + autoUpdate。部署后用户需点蓝色提示条「刷新」激活新版本 |
| **Windows 特性** | git-bash 环境。`python3=3.13` / `python=3.11`。MCP windows 工具可用 |
| **CF token** | 存于 `.env.cf` 和 shell 环境变量中。当前 token 53 字符（`cfat_` 开头） |
| **Supabase 代理** | CF Pages Function 必须用 `[[catchall]].ts` 双括号命名代理 `/api/*` |
| **.env.local** | 本地 Supabase 密钥文件，从项目管理者获取模板 |

### 16.5 常见问题速查

**Q: 部署报错 `Project not found`？**
A: 检查 `--project-name` — 是 `quiz-app` 不是 `quiz-app-8q3`。

**Q: 部署报错 `CLOUDFLARE_API_TOKEN` 找不到？**
A: 先 `export CLOUDFLARE_API_TOKEN=*** .env.cf 中取）。

**Q: AI 格式整理无效？**
A: 本地开发需要 `.env.normalize` 文件含有效 DeepSeek/OpenRouter key。部署版需在 CF Pages 后台设 `AI_NORMALIZE_API_KEY`（Secret）。

**Q: 集成测试报 `raw_docx.txt not found`？**
A: 该测试需要真实考试数据文件放在项目根目录。没有也能跑其余 137 条测试。

**Q: Supabase 登录后白屏？**
A: 检查 `.env.local` 中 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY` 是否正确。AuthContext 有 3 秒超时防无限白屏。

**Q: CF 部署后 Supabase API 报 404？**
A: 检查 `functions/api/` 下是否使用 `[[catchall]].ts` 双括号命名。单括号只匹配一级路径。

**Q: 想从零 clone 这个项目？**
A: 确保你有 CF token 和 Supabase 项目密钥才能完整运行。本地开发只需 `npm install && npm run dev`。

---
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
|| 2026-06-21 | API key 暴露在生产 bundle 中 | `DEEPSEEK_KEY` 硬编码在 `normalize.ts` 中，Vite 构建时内联进 JS | 改为 CF Pages Function 代理模式，key 仅存服务器环境变量，bundle 中只有 `/api/ai-normalize` 路径 |
||| 2026-06-23 | 统计卡片无法点击进入对应题型刷题 | `BankDetail` 统计卡片用纯展示 `Card`，无 onClick 处理 | 添加 `hoverable` + `cursor:pointer` + `onClick` 跳转对应题型 |
||| 2026-06-23 | `raw_docx.txt`（真实考试数据）被 git 追踪 | 早期提交加入后未清理 | filter-branch 从全部 git 历史中抹除；测试文件添加文件缺失保护 |
||| 2026-06-23 | `deploy-cf.sh` 未在 gitignore 中 | 新建的部署脚本未保护 | 加入 `.gitignore` |

### B. 常见问题

**Q: 关掉 App 再开需要重新导入吗？**
A: 不需要。数据存储在浏览器的 IndexedDB 中，关掉再开自动保留。但不同浏览器/设备间不共享。

**Q: 导入题库后数据如何隔离？**
A: 每个题库通过 `bankId` 隔离，题目/练习记录/session 都关联到对应 `bankId`。不同题库的数据互不干扰。

**Q: 为什么填空题的挖空有时候不准？**
A: 当前使用规则匹配（在题干中查找答案文本替换为 `____`）。如果答案文本在题干中用词不完全一致（如缩写、序数词变体），匹配会失败——此时会在题干末尾追加一个空白框，不影响练习。后续可叠加 DeepSeek AI 智能挖空增强。

**Q: 支持哪些文件格式？**
A: .txt、.json、.csv、.docx、.md。DOCX 文件自动提取为文本后走考试卷解析器。

**Q: AI 格式整理在部署版怎么配置？**
A: 需要两件事：(1) 在 Cloudflare Pages 后台设置环境变量 `AI_NORMALIZE_API_KEY`（Secret 类型，值为 DeepSeek API key）；(2) 前端 `.env.production` 已配置 `VITE_AI_NORMALIZE_PROXY=/api/ai-normalize`，CF Pages Function 会自动代理请求。

**Q: AI 格式整理失败会影响导入吗？**
A: 不会。AI 调用超时或失败时静默返回原文，走规则解析器兜底。
