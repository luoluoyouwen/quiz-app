import { describe, it, expect } from 'vitest';
import { parseExamDocx } from './exam';

const sampleFill = `一 填空题

反应器R-301操作控制温度      525℃±5℃      、通常进料前将温度控制在   550℃ 才开始进料。
确保任何时候反应温度不能低于  485℃  ，如低于485℃，需切断反应进料，重新组织两器循环，达到温度和压力等各项指标要求，再度恢复进料。
`;

const sampleChoice = `二 单选题

离心泵的扬程随流量上升而( C )。
A.上升，过额定点后开始下降        B.上升
C.下降                            D..下降，过额定点后开始上升
`;

const sampleJudge = `四 判断题

专项应急预案应根据风险评估及危险性控制措施逐一编制，做到事故相关人员应知应会，熟练掌握，并通过应急演练，做到迅速反应、正确处置。（×）
主风机正常停机时，应先逐步降负荷，再关闭出口阀门，最后停运设备。（√）
`;

const sampleEssay = `五 问答题

US-38主风机C-301停机联锁触发的联锁动作？
答：①旋转进料阀IC-201A~F联锁停
②两器循环联锁切断
启动射汽抽气器建立真空如何操作？
答：当真空度稳定，用主抽与启抽切换，先打开投用组的二级蒸汽阀，然后打开一级蒸汽阀。
`;

const sampleMulti = `三 多选题

主风机C-301正常巡检内容包括（ABCD）
A.振动、温度    B.润滑油/油位    C.喘振阀状态     D.电流与声音
循环煤气压缩机 C-401 必须满足的启动条件（ABC）
A.润滑油系统正常        B.密封气投用正常
C.电捕焦油器运行        D.防喘振阀全开
`;

describe('parseExamDocx', () => {
  it('parses fill questions (multi-blank becomes one question with multiple answers)', () => {
    const result = parseExamDocx(sampleFill);
    // 2 blanks in first line become 1 question with 2 answers,
    // 1 blank in second line = 1 question = 2 total
    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('fill');
    expect(result.questions[0].answer).toBe('525℃±5℃');
    expect(result.questions[0].answers).toEqual(['525℃±5℃', '550℃']);
    expect(result.questions[1].answer).toBe('485℃');
    expect(result.questions[1].answers).toEqual(['485℃']);
  });

  it('parses choice questions', () => {
    const result = parseExamDocx(sampleChoice);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].type).toBe('choice');
    expect(result.questions[0].answer).toBe('C');
    expect(result.questions[0].options).toBeDefined();
    expect(result.questions[0].options!.length).toBe(4);
  });

  it('parses multi-choice as multi type', () => {
    const result = parseExamDocx(sampleMulti);
    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('multi');
    expect(result.questions[0].answer).toBe('ABCD');
    expect(result.questions[1].answer).toBe('ABC');
    expect(result.questions[1].type).toBe('multi');
  });

  it('parses judge questions', () => {
    const result = parseExamDocx(sampleJudge);
    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('judge');
    expect(result.questions[0].answer).toBe('错');
    expect(result.questions[1].answer).toBe('对');
  });

  it('parses essay questions', () => {
    const result = parseExamDocx(sampleEssay);
    expect(result.questions.length).toBe(2);
    expect(result.questions[0].type).toBe('essay');
    expect(result.questions[0].content).toContain('US-38主风机C-301');
    expect(result.questions[0].answer).toContain('旋转进料阀IC-201A~F');
  });

  it('returns default bank name when no header found', () => {
    const result = parseExamDocx(sampleFill);
    expect(result.bankName).toBe('主风岗位题库');
  });

  it('throws on empty input', () => {
    expect(() => parseExamDocx('')).toThrow();
  });
});
