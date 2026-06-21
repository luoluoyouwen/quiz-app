/**
 * 应用版本号与更新日志
 *
 * 每次发布新版本时，在这里追加一条记录。
 * 显示在首页底部的「关于」弹窗中。
 */

export interface VersionEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const APP_VERSION = '1.2.1';

export const CHANGELOG: VersionEntry[] = [
  {
    version: '1.2.1',
    date: '2026-06-21',
    title: '修复：选项乱序导致练习页白屏崩溃',
    changes: [
      '修复 autoAdvanceTimer hooks 写在 early return 之后导致的 React error #310（最大更新深度）',
      '新增 ErrorBoundary 组件，防止白屏，出错时显示错误信息和刷新按钮',
      '新功能测试覆盖：pickRandomQuestions（7 条）+ 选项乱序核心逻辑（4 条），共 121 条测试',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-21',
    title: '答对自动下一题 / 随机抽题 / 选项乱序',
    changes: [
      '答对自动下一题：提交正确后 1.5s 自动跳转，答错不跳，背题模式不启用',
      '随机抽题：练习弹窗新增可选输入框，指定抽取 N 题练习',
      '选项乱序：每次进入练习，选择题选项顺序随机打乱，判题过原始答案映射',
    ],
  },
  {
    version: '1.1.5',
    date: '2026-06-21',
    title: 'CF Pages Function 代理 AI 格式整理',
    changes: [
      'AI 格式整理改为后端代理模式，API key 存在 CF 环境变量中，不再进入前端 bundle',
      '新增 CF Pages Function 代理端（functions/api/ai-normalize.ts）',
      '本地开发保持原有直接调用 DeepSeek 模式',
    ],
  },
  {
    version: '1.1.4',
    date: '2026-06-21',
    title: '新增深色模式',
    changes: [
      '右上角新增深色/浅色切换按钮，偏好持久化',
      'Ant Design darkAlgorithm 自动处理所有 UI 组件',
      'CSS 变量覆盖自定义样式的语义色（正确/错误/警告）',
    ],
  },
  {
    version: '1.1.3',
    date: '2026-06-21',
    title: '修复错题统计 & 按钮位置',
    changes: [
      '修复错题重刷计数跨题库叠加的问题（只统计当前题库的错题）',
      '错题按钮从右上角移为独立横幅，不再遮挡界面元素',
    ],
  },
  {
    version: '1.1.2',
    date: '2026-06-21',
    title: '修复：断点续刷共享进度 / 错题随错随记 / 测试增强',
    changes: [
      '修复断点续刷不同类型题目共享进度的问题（填空/选择互不干扰）',
      '错题随错随记：答完即存，退出刷题界面后错题本立即可见',
      '错题重刷按钮更醒目（红色大按钮+阴影）',
      '测试用例从 91 增至 103，覆盖选项前缀剥离和题干中间挖空',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-06-21',
    title: '修复：选项前缀重复 & 题干挖空丢失',
    changes: [
      '修复选择题选项显示双重前缀的问题（不再显示 A A.xxx）',
      '修复选择题题干中间挖空丢失的问题（答案标记替换为 ____）',
      '选项前缀统一剥离，为后续乱序选项功能打下基础',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-21',
    title: '搜索 / 错题本 / 断点续刷 / 填空强校验',
    changes: [
      '题库详情页支持搜索题目内容、答案、选项',
      '错题重刷：直接从题库跳转练习所有做错过的题目',
      '断点续传：刷题中途离开后自动保存进度，回来可继续',
      '填空题改为精确匹配，不再接受近似答案',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-21',
    title: 'AI 格式整理上线',
    changes: [
      '导入 .docx 题库时自动通过 AI 统一格式，大幅提升 tab/混排/异形排版兼容性',
      '导入弹窗新增 🟢 AI 导入 标识',
      '修复 CF Pages 图标无法正常加载的问题',
      '所有题型导入准确率提升至 ~98%',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-06-20',
    title: '题库导入与解析重写',
    changes: [
      '重构 DOCX 解析引擎，支持化工题库全部题型（单选/多选/填空/判断/简答）',
      '修复 tab 分隔选项导致的合并错误',
      '填空题自动挖空（答案匹配替换为 ____）',
      '部署至 Cloudflare Pages 与 Vercel 双线',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-06-18',
    title: 'PWA 离线刷题',
    changes: [
      '支持离线缓存，网络不佳时仍可刷题',
      '自定义 Service Worker 策略（NetworkFirst + 缓存回退）',
      'PWA 安装支持（Android / iOS 添加到主屏幕）',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-10',
    title: '初版上线',
    changes: [
      '基础题库管理（创建/删除题库）',
      '刷题模式（选择题/填空题/判断题）',
      '本地 IndexedDB 存储，无需后端',
    ],
  },
];
