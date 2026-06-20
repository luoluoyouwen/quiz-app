import { describe, it, expect } from 'vitest';
import {
  shuffleQuestions,
  filterByType,
  checkAnswer,
  generateSession,
} from './engine';
import type { Question } from '../../db';

const questions: Question[] = [
  { id: 1, bankId: 1, type: 'choice', content: '1+1=?', options: ['A. 1', 'B. 2', 'C. 3', 'D. 4'], answer: 'B' },
  { id: 2, bankId: 1, type: 'fill', content: '中国的首都是___', answer: '北京' },
  { id: 3, bankId: 1, type: 'judge', content: '地球是圆的', answer: '对' },
  { id: 4, bankId: 1, type: 'choice', content: '水分子式是?', options: ['A. H2O', 'B. CO2', 'C. NaCl', 'D. O2'], answer: 'A' },
  { id: 5, bankId: 1, type: 'fill', content: '太阳从___边升起', answer: '东' },
  { id: 6, bankId: 1, type: 'fill', content: '中国最长的河流是___', answer: '长江' },
];

// ── shuffleQuestions ──

describe('shuffleQuestions', () => {
  it('returns an array of the same length', () => {
    const result = shuffleQuestions(questions);
    expect(result).toHaveLength(questions.length);
  });

  it('returns a new array (not the same reference)', () => {
    const result = shuffleQuestions(questions);
    expect(result).not.toBe(questions);
  });

  it('contains all original items', () => {
    const result = shuffleQuestions(questions);
    expect(result).toEqual(expect.arrayContaining(questions));
    expect(questions).toEqual(expect.arrayContaining(result));
  });

  it('produces deterministic order with the same seed', () => {
    const a = shuffleQuestions(questions, 42);
    const b = shuffleQuestions(questions, 42);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('produces different order with different seeds', () => {
    const a = shuffleQuestions(questions, 42);
    const b = shuffleQuestions(questions, 99);
    expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
  });
});

// ── filterByType ──

describe('filterByType', () => {
  it('returns all questions when mode is "all"', () => {
    expect(filterByType(questions, 'all')).toHaveLength(6);
  });

  it('filters choice questions', () => {
    const result = filterByType(questions, 'choice');
    expect(result).toHaveLength(2);
    expect(result.every((q) => q.type === 'choice')).toBe(true);
  });

  it('filters fill questions', () => {
    const result = filterByType(questions, 'fill');
    expect(result).toHaveLength(3);
    expect(result.every((q) => q.type === 'fill')).toBe(true);
  });

  it('filters judge questions', () => {
    const result = filterByType(questions, 'judge');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('judge');
  });
});

// ── checkAnswer: choice ──

describe('checkAnswer - choice', () => {
  const q = questions[0]; // 1+1=? answer: B

  it('correct answer', () => {
    const r = checkAnswer(q, 'B');
    expect(r.correct).toBe(true);
    expect(r.expected).toBe('B');
  });

  it('ignores case', () => {
    expect(checkAnswer(q, 'b').correct).toBe(true);
  });

  it('ignores whitespace', () => {
    expect(checkAnswer(q, '  B  ').correct).toBe(true);
  });

  it('wrong answer', () => {
    expect(checkAnswer(q, 'A').correct).toBe(false);
  });
});

// ── checkAnswer: judge ──

describe('checkAnswer - judge', () => {
  const q = questions[2]; // 地球是圆的 answer: 对

  it('correct: 对', () => {
    expect(checkAnswer(q, '对').correct).toBe(true);
  });

  it('accepts true/t as valid', () => {
    expect(checkAnswer(q, 'true').correct).toBe(true);
    expect(checkAnswer(q, 'T').correct).toBe(true);
  });

  it('wrong answer', () => {
    expect(checkAnswer(q, '错').correct).toBe(false);
  });
});

// ── checkAnswer: fill (single blank) ──

describe('checkAnswer - fill', () => {
  it('exact match', () => {
    expect(checkAnswer(questions[1], '北京').correct).toBe(true);
  });

  it('normalized match (extra spaces, punctuation)', () => {
    expect(checkAnswer(questions[1], '  北京！').correct).toBe(true);
  });

  it('substring containment', () => {
    expect(checkAnswer(questions[1], '北京市').correct).toBe(true);
  });

  it('Levenshtein distance ≤ 2 (fuzzy match)', () => {
    // '长江' vs '长河': 1 substitution (江→河), distance=1
    expect(checkAnswer(questions[5], '长河').correct).toBe(true);
  });

  it('wrong answer when distance > 2', () => {
    // '长江' (2 chars) vs '塔里木河' (4 chars): insert 2, sub 1 = distance 3
    expect(checkAnswer(questions[5], '塔里木河').correct).toBe(false);
  });

  it('empty answer is wrong', () => {
    expect(checkAnswer(questions[1], '').correct).toBe(false);
  });
});

// ── generateSession ──

describe('generateSession', () => {
  it('generates a session with all questions', () => {
    const s = generateSession(1, questions, 'all');
    expect(s.bankId).toBe(1);
    expect(s.questions).toHaveLength(6);
    expect(s.total).toBe(6);
    expect(s.correct).toBe(0);
    expect(s.wrong).toBe(0);
    expect(s.answers).toEqual([]);
  });

  it('filters by type', () => {
    const s = generateSession(1, questions, 'judge');
    expect(s.questions).toHaveLength(1);
    expect(s.questions[0].type).toBe('judge');
  });

  it('generates unique session IDs', () => {
    const a = generateSession(1, questions);
    const b = generateSession(1, questions);
    expect(a.id).not.toBe(b.id);
  });
});

// ── checkAnswer: multi (multi-choice) ──

describe('checkAnswer - multi', () => {
  const q: Question = {
    id: 10, bankId: 1, type: 'multi',
    content: '以下哪些是质数？',
    options: ['A. 2', 'B. 4', 'C. 7', 'D. 9'],
    answer: 'AC',
  };

  it('correct: AC (sorted)', () => {
    const r = checkAnswer(q, 'AC');
    expect(r.correct).toBe(true);
    expect(r.expected).toBe('AC');
  });

  it('correct regardless of order: CA == AC', () => {
    expect(checkAnswer(q, 'CA').correct).toBe(true);
  });

  it('partial answer is wrong', () => {
    expect(checkAnswer(q, 'A').correct).toBe(false);
  });

  it('extra wrong option is wrong', () => {
    expect(checkAnswer(q, 'AB').correct).toBe(false);
  });

  it('empty answer is wrong', () => {
    expect(checkAnswer(q, '').correct).toBe(false);
  });

  it('three-answer multi-choice', () => {
    const q3: Question = {
      id: 11, bankId: 1, type: 'multi',
      content: '以下哪些是动物？',
      options: ['A. 狗', 'B. 桌子', 'C. 猫', 'D. 鸟'],
      answer: 'ACD',
    };
    expect(checkAnswer(q3, 'DCA').correct).toBe(true);
    expect(checkAnswer(q3, 'A').correct).toBe(false);
    expect(checkAnswer(q3, 'ABC').correct).toBe(false);
  });
});

// ── checkAnswer: fill (multi-blank) ──

describe('checkAnswer - fill multi-blank', () => {
  const q: Question = {
    id: 12, bankId: 1, type: 'fill',
    content: '水煤浆____和____是主要设备',
    answer: '气化技术',
    answers: ['气化技术', '净化技术'],
  };

  it('both blanks correct', () => {
    const r = checkAnswer(q, '气化技术||净化技术');
    expect(r.correct).toBe(true);
    expect(r.expected).toBe('气化技术、净化技术');
  });

  it('one blank wrong', () => {
    expect(checkAnswer(q, '气化技术||错误答案').correct).toBe(false);
  });

  it('both blanks wrong', () => {
    expect(checkAnswer(q, '错误1||错误2').correct).toBe(false);
  });

  it('empty is wrong', () => {
    expect(checkAnswer(q, '').correct).toBe(false);
  });

  it('partial blanks (only first filled) is wrong', () => {
    expect(checkAnswer(q, '气化技术||').correct).toBe(false);
  });

  it('fuzzy match on individual blanks', () => {
    // Levenshtein: '气化技术' vs '气化技木' — 1 char different
    expect(checkAnswer(q, '气化技木||净化技术').correct).toBe(true);
  });

  it('arbitrary gibberish is wrong', () => {
    expect(checkAnswer(q, 'abc||xyz').correct).toBe(false);
  });
});

// ── Full parser + engine integration ──

describe('full integration - parse then check answers', () => {
  it('parsed fill + checkAnswer works end-to-end', async () => {
    const { parseExamDocx } = await import('../parsers/exam');
    const result = parseExamDocx(`一 填空题

反应器R-301操作控制温度      525℃±5℃      、通常进料前将温度控制在   550℃ 才开始进料。
确保任何时候反应温度不能低于  485℃  。`);

    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('fill');
    expect(result.questions[0].answers).toEqual(['525℃±5℃', '550℃']);

    // Simulate practice — check answers on the parsed questions
    const q0 = result.questions[0];
    expect(q0.answers).toBeDefined();

    // Treat parsed question as Question (same shape)
    const fillQ = q0 as unknown as Question;
    expect(checkAnswer(fillQ, '525℃±5℃||550℃').correct).toBe(true);
    expect(checkAnswer(fillQ, '525℃±5℃||错误').correct).toBe(false);
    expect(checkAnswer(fillQ, '随便填的||550℃').correct).toBe(false);
    expect(checkAnswer(fillQ, '胡乱输入').correct).toBe(false);

    // Single blank (second question)
    const q1 = result.questions[1] as unknown as Question;
    expect(checkAnswer(q1, '485℃').correct).toBe(true);
    expect(checkAnswer(q1, '错答案').correct).toBe(false);
  });

  it('parsed multi-choice + checkAnswer works', async () => {
    const { parseExamDocx } = await import('../parsers/exam');
    const result = parseExamDocx(`三 多选题

主风机C-301正常巡检内容包括（ABCD）
A.振动、温度    B.润滑油/油位    C.喘振阀状态     D.电流与声音
循环煤气压缩机 C-401 必须满足的启动条件（ABC）
A.润滑油系统正常        B.密封气投用正常`);

    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('multi');
    expect(result.questions[0].answer).toBe('ABCD');

    const q0 = result.questions[0] as unknown as Question;
    expect(checkAnswer(q0, 'ABCD').correct).toBe(true);
    expect(checkAnswer(q0, 'DCBA').correct).toBe(true);   // order-insensitive
    expect(checkAnswer(q0, 'AB').correct).toBe(false);    // partial
    expect(checkAnswer(q0, 'ABCDE').correct).toBe(false); // extra

    const q1 = result.questions[1] as unknown as Question;
    expect(checkAnswer(q1, 'ABC').correct).toBe(true);
    expect(checkAnswer(q1, 'CBA').correct).toBe(true);
    expect(checkAnswer(q1, 'AB').correct).toBe(false);
  });

  it('parsed judge + checkAnswer works', async () => {
    const { parseExamDocx } = await import('../parsers/exam');
    const result = parseExamDocx(`四 判断题

专项应急预案应根据风险评估及危险性控制措施逐一编制，做到事故相关人员应知应会，熟练掌握，并通过应急演练，做到迅速反应、正确处置。（×）
主风机正常停机时，应先逐步降负荷，再关闭出口阀门，最后停运设备。（√）`);

    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('judge');

    const q0 = result.questions[0] as unknown as Question;
    const r0 = checkAnswer(q0, '错');
    expect(r0.correct).toBe(true);
    expect(r0.expected).toBe('错');

    const q1 = result.questions[1] as unknown as Question;
    const r1 = checkAnswer(q1, '对');
    expect(r1.correct).toBe(true);
    expect(r1.expected).toBe('对');

    // Wrong answer
    expect(checkAnswer(q0, '对').correct).toBe(false);
  });

  it('all question types have distinct content after parsing', async () => {
    const { parseExamDocx } = await import('../parsers/exam');
    const result = parseExamDocx(`一 填空题

控制系统        数据采集    主要负责现场数据监测。

二 单选题

离心泵的扬程随流量上升而( C )。
A.上升    B.不变    C.下降    D.不确定

三 多选题

以下属于易燃气体的是（AC）
A.氢气    B.氮气    C.乙炔    D.氩气

四 判断题

设备运行时严禁打开防护罩。（√）

五 问答题

简述应急预案的编制步骤。
答：第一步风险识别、第二步资源评估、第三步编制预案、第四步演练验证。`);

    // All 5 types present
    expect(result.questions.length).toBe(5);

    // Extract contents and verify they're all different
    const contents = result.questions.map(q => q.content);
    const uniqueContents = new Set(contents);
    expect(uniqueContents.size).toBe(5);  // ALL contents must be unique!

    // Verify content coherence — each should have meaningful text
    expect(result.questions[0].content).toContain('控制系统');
    expect(result.questions[1].content).toContain('离心泵');
    expect(result.questions[2].content).toContain('易燃气体');
    expect(result.questions[3].content).toContain('防护罩');
    expect(result.questions[4].content).toContain('应急预案');
  });
});
