import { describe, it, expect } from 'vitest';
import { parseExamDocx } from './exam';

const sampleFill = `一 填空题

反应器R-301操作控制温度      525℃±5℃      、通常进料前将温度控制在   550℃ 才开始进料。
确保任何时候反应温度不能低于  485℃  ，如低于485℃，需切断反应进料，重新组织两器循环，达到温度和压力等各项指标要求，再度恢复进料。`;

const sampleChoice = `二 单选题

离心泵的扬程随流量上升而( C )。
A.上升，过额定点后开始下降        B.上升
C.下降                            D..下降，过额定点后开始上升`;

const sampleJudge = `四 判断题

专项应急预案应根据风险评估及危险性控制措施逐一编制，做到事故相关人员应知应会，熟练掌握，并通过应急演练，做到迅速反应、正确处置。（×）
主风机正常停机时，应先逐步降负荷，再关闭出口阀门，最后停运设备。（√）`;

const sampleEssay = `五 问答题

US-38主风机C-301停机联锁触发的联锁动作？
答：①旋转进料阀IC-201A~F联锁停
②两器循环联锁切断
启动射汽抽气器建立真空如何操作？
答：当真空度稳定，用主抽与启抽切换，先打开投用组的二级蒸汽阀，然后打开一级蒸汽阀。`;

const sampleMulti = `三 多选题

主风机C-301正常巡检内容包括（ABCD）
A.振动、温度    B.润滑油/油位    C.喘振阀状态     D.电流与声音
循环煤气压缩机 C-401 必须满足的启动条件（ABC）
A.润滑油系统正常        B.密封气投用正常
C.电捕焦油器运行        D.防喘振阀全开`;

describe('parseExamDocx', () => {
  it('parses fill questions (multi-blank becomes one question with multiple answers)', () => {
    const result = parseExamDocx(sampleFill);
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

// ── Repair-specific tests: choice multi-option split ──

describe('choice: multi-option split fix', () => {

  it('splits tab-separated options on one line (A.xxx\\tB.xxx)', () => {
    const input = `二 单选题

辅助燃烧室正常燃烧时，火焰呈浅蓝色，如( B )，火焰发暗，长而飘摇不定。
A.一次风过大\tB.一次风过小\t   C.二次风过大\t   D.二次风过小`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(4);
    expect(result.questions[0].options![0]).toBe('一次风过大');
    expect(result.questions[0].options![1]).toBe('一次风过小');
    expect(result.questions[0].options![2]).toBe('二次风过大');
    expect(result.questions[0].options![3]).toBe('二次风过小');
  });

  it('splits short-space (2+) separated options', () => {
    const input = `二 单选题

辅助燃烧室正常燃烧时，火焰呈浅蓝色，如( B )，火焰发暗，长而飘摇不定。
A.一次风过大  B.一次风过小  C.二次风过大  D.二次风过小`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(4);
  });

  it('does NOT split option-internal 2+ spaces (A.  text)', () => {
    // "A. 油压过高" has space after dot — must remain as a single option
    const input = `二 单选题

油滤器压差过高说明（  C  ）。
A. 油压过高      B. 油温过高      C. 滤芯堵塞       D. 油箱液位低`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(4);
    expect(result.questions[0].options![0]).toBe('油压过高');
    expect(result.questions[0].options![1]).toBe('油温过高');
    expect(result.questions[0].options![2]).toBe('滤芯堵塞');
    expect(result.questions[0].options![3]).toBe('油箱液位低');
  });

  it('splits single-space inline options (A. xxx B. xxx)', () => {
    const input = `二 单选题

根据表格中主风机 C-301 停机联锁的逻辑，三个流量联锁信号（FZT-164A3、FZT-164B3、FZT-164C3）的表决方式为（ C ）
A. 一取一 B. 二取一 C. 三取二 D. 三取三`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(4);
    expect(result.questions[0].options![0]).toBe('一取一');
    expect(result.questions[0].options![1]).toBe('二取一');
    expect(result.questions[0].options![2]).toBe('三取二');
    expect(result.questions[0].options![3]).toBe('三取三');
  });

  it('splits 、-delimited tight options (A、textB、text)', () => {
    // Options use 、 after letter with no space between them
    const input = `二 单选题

《安全生产法》规定,生产经营单位使用被派遣劳动者的,应将被派遣劳动者纳入本单位从业人员(A)。
A、统一管理B、分别管理C、由派遣单位管理`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(3);
    expect(result.questions[0].options![0]).toBe('统一管理');
    expect(result.questions[0].options![1]).toBe('分别管理');
    expect(result.questions[0].options![2]).toBe('由派遣单位管理');
  });

  it('handles options with missing dot after letter prefix (A略高于)', () => {
    const input = `二 单选题

在同一根引出管的前提下，容器的就地液面计液面(　C　)仪表液面指示。
A略高于       B.略低于       C.等于       D.没有规律`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(4);
    expect(result.questions[0].options![0]).toBe('略高于');
  });

  it('handles both 3+space and tab in same line', () => {
    const input = `二 单选题

测试题（ A ）
A.选项一\tB.选项二      C.选项三`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].options?.length).toBe(3);
    expect(result.questions[0].options![0]).toBe('选项一');
    expect(result.questions[0].options![1]).toBe('选项二');
    expect(result.questions[0].options![2]).toBe('选项三');
  });
});

// ── Repair-specific tests: fill enumeration and conjunction ──

describe('fill: enumeration and conjunction fix', () => {

  it('splits 、-enumerated answers into separate blanks', () => {
    const input = `一 填空题

主风机发生喘振应立即  开大防喘振阀  、降低负荷  、严禁强行带负荷。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].type).toBe('fill');
    expect(result.questions[0].answers).toEqual(['开大防喘振阀', '降低负荷', '严禁强行带负荷']);
    const blanks = (result.questions[0].content.match(/____/g) || []).length;
    expect(blanks).toBe(3);
  });

  it('splits conjunction-separated answers (及 single space)', () => {
    const input = `一 填空题

润滑调节油站为轴流压缩机提供    润滑油  及 调节油   并采用双联冷油器和双联过滤器。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].type).toBe('fill');
    expect(result.questions[0].answers).toEqual(['润滑油', '调节油']);
  });

  it('preserves blanks=answers for 3-enumeration with trailing content', () => {
    const input = `一 填空题

机组润滑油含水会导致  轴承锈蚀  、 油膜失效  、温度升高。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].answers).toEqual(['轴承锈蚀', '油膜失效', '温度升高']);
    const blanks = (result.questions[0].content.match(/____/g) || []).length;
    expect(blanks).toBe(3);
  });

  it('does not split 、 when text after is long (content between blanks)', () => {
    // "、通常进料前将温度控制在" — starts with 、 but is long content
    const input = `一 填空题

反应器R-301操作控制温度      525℃±5℃      、通常进料前将温度控制在   550℃ 才开始进料。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].answers).toEqual(['525℃±5℃', '550℃']);
    expect(result.questions[0].content).toContain('、通常进料前将温度控制在');
  });

  it('cleans space+Chinese-comma content from answers', () => {
    const input = `一 填空题

润滑油温度过高会导致  油膜破坏 ，过低会导致  黏度偏大、启动扭矩增大  。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    // "油膜破坏 ，过低会导致" → stripped to "油膜破坏"
    expect(result.questions[0].answers![0]).toBe('油膜破坏');
  });

  it('does NOT over-clean valid comma in long answer', () => {
    const input = `一 填空题

辅助燃烧室F-301长明灯仪表风压力需调整至  0.1 MPa，燃料气压力0.2-0.3MPa。。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    // "0.1 MPa，燃料气压力0.2-0.3MPa" — valid comma, should not be stripped
    expect(result.questions[0].answers![0]).toContain('0.1 MPa，燃料气压力');
  });

  it('handles 与 conjunction split', () => {
    const input = `一 填空题

防喘振控制分为  固定极限流量  与  可变极限流量  两种模式。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].answers).toEqual(['固定极限流量', '可变极限流量']);
  });

  it('handles 和 conjunction split', () => {
    const input = `一 填空题

按照泵的叶轮级数来分，分为  单级泵  和  多级泵  两类。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].answers).toEqual(['单级泵', '多级泵']);
  });
});

// ── Repair-specific tests: nofill type ──

describe('fill: nofill type', () => {
  it('preserves lines without blanks as nofill type', () => {
    const input = `一 填空题

低温干馏温度为500℃～650℃，原煤干馏超过600℃，焦油会发生二次热解，焦油产量逐步下降、煤气产量逐步升高。`;
    const result = parseExamDocx(input);
    expect(result.questions.length).toBe(1);
    expect(result.questions[0].type).toBe('nofill');
    expect(result.questions[0].content).toContain('低温干馏温度');
    expect(result.questions[0].answer).toBe('');
  });
});

// ── Fix: option prefix stripping ──

describe('choice: option prefix stripping', () => {

  it('strips A. prefix from option text', () => {
    const input = `二 单选题

测试题（A）
A.纯文本`;
    const result = parseExamDocx(input);
    expect(result.questions[0].options![0]).toBe('纯文本');
  });

  it('strips A、prefix (Chinese comma)', () => {
    const input = `二 单选题

测试题（A）
A、选项A`;
    const result = parseExamDocx(input);
    expect(result.questions[0].options![0]).toBe('选项A');
  });

  it('strips A．prefix (full-width dot)', () => {
    const input = `二 单选题

测试题（A）
A．全角点`;
    const result = parseExamDocx(input);
    expect(result.questions[0].options![0]).toBe('全角点');
  });

  it('strips A) prefix', () => {
    const input = `二 单选题

测试题（A）
A)括号选项`;
    const result = parseExamDocx(input);
    expect(result.questions[0].options![0]).toBe('括号选项');
  });

  it('strips A prefix with no separator (A略高于)', () => {
    const input = `二 单选题

测试题（A）
A略高于       B.略低于       C.等于       D.无规律`;
    const result = parseExamDocx(input);
    expect(result.questions[0].options![0]).toBe('略高于');
    expect(result.questions[0].options![1]).toBe('略低于');
    expect(result.questions[0].options![2]).toBe('等于');
    expect(result.questions[0].options![3]).toBe('无规律');
  });

  it('strips A: prefix', () => {
    const input = `二 单选题

测试题（A）
A:冒号选项`;
    const result = parseExamDocx(input);
    expect(result.questions[0].options![0]).toBe('冒号选项');
  });
});

// ── Fix: middle answer marker → blank ──

describe('choice: middle answer marker replaced with blank', () => {

  it('replaces middle (C) with ____ in stem', () => {
    const input = `二 单选题

突发事件分为四类，即自然灾害、事故灾难、（  C ）和社会安全事件。
A.地质灾害    B.森林火灾  C.公共卫生事件   D.群体性事件`;
    const result = parseExamDocx(input);
    expect(result.questions[0].content).toBe('突发事件分为四类，即自然灾害、事故灾难、____和社会安全事件');
  });

  it('replaces middle ( B ) with ____ in stem (comma after)', () => {
    const input = `二 单选题

如( B )，火焰发暗。
A.一次风过大      B.一次风过小`;
    const result = parseExamDocx(input);
    expect(result.questions[0].content).toBe('如____，火焰发暗');
  });

  it('does NOT add blank when answer marker is at the end', () => {
    const input = `二 单选题

离心泵的扬程随流量上升而( C )。
A.上升    B.上升    C.下降    D.不确定`;
    const result = parseExamDocx(input);
    expect(result.questions[0].content).toBe('离心泵的扬程随流量上升而');
  });

  it('does NOT add blank when answer marker is at the start', () => {
    const input = `二 单选题

（C）下面哪项正确。
A.选项一    B.选项二    C.选项三`;
    const result = parseExamDocx(input);
    expect(result.questions[0].content).toBe('下面哪项正确');
  });

  it('handles full-width parentheses in middle', () => {
    const input = `二 单选题

正常投用以后的安全阀前的截止阀开度为（　D　），并进行上锁。
A.全关    B.1/3     C.1/2     D.全开`;
    const result = parseExamDocx(input);
    expect(result.questions[0].content).toBe('正常投用以后的安全阀前的截止阀开度为____，并进行上锁');
  });

  it('multi-choice multi-letter answer in middle also gets blank', () => {
    const input = `三 多选题

主风机C-301正常巡检内容包括（ABCD）
A.振动、温度    B.润滑油/油位    C.喘振阀状态     D.电流与声音`;
    const result = parseExamDocx(input);
    expect(result.questions[0].content).toBe('主风机C-301正常巡检内容包括');
    expect(result.questions[0].options![0]).toBe('振动、温度');
  });
});
