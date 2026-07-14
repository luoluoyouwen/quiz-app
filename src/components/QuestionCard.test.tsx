// No jsdom needed — pure data logic tests
import { describe, it, expect } from 'vitest';
import type { Question } from '../db';

// The type label mapping used by QuestionCard (duplicated here for testing)
const typeLabels: Record<string, string> = {
  choice: '选择题',
  multi: '多选题',
  fill: '填空题',
  judge: '判断题',
  essay: '简答题',
  nofill: '背记题',
};

// The answer formatting logic used by QuestionCard for showAnswer display:
// - fill with multiple answers: show `answers.join('、')`
// - fill without answers: show `answer`
// - choice/multi: answer is the letter(s)
function formatExpectedAnswer(q: Question): string {
  if (q.type === 'judge') {
    return q.answer === 'true' || q.answer === '对' ? '对' : '错';
  }
  if (q.type === 'fill' && q.answers && q.answers.length > 1) {
    return q.answers.join('、');
  }
  return q.answer;
}

// Multi-choice answer display: "A, B, D"
function formatMultiChoiceAnswer(answer: string): string {
  return answer.split('').map(l => l).join(', ');
}

describe('QuestionCard — answer display logic', () => {

  it('typeLabels covers all expected question types', () => {
    const types = ['choice', 'multi', 'fill', 'judge', 'essay', 'nofill'] as const;
    for (const t of types) {
      expect(typeLabels[t]).toBeDefined();
      expect(typeLabels[t].length).toBeGreaterThan(0);
    }
  });

  it('fill multi-blank: formatExpectedAnswer joins answers with 、', () => {
    const q: Question = {
      bankId: 1, type: 'fill',
      content: '____是____',
      answer: '答案1',
      answers: ['答案1', '答案2'],
    };
    expect(formatExpectedAnswer(q)).toBe('答案1、答案2');
  });

  it('fill single-blank: formatExpectedAnswer returns single answer', () => {
    const q: Question = {
      bankId: 1, type: 'fill',
      content: '中国的首都是____',
      answer: '北京',
    };
    expect(formatExpectedAnswer(q)).toBe('北京');
  });

  it('choice: formatExpectedAnswer returns the answer letter', () => {
    const q: Question = {
      bankId: 1, type: 'choice',
      content: '测试',
      options: ['A', 'B', 'C', 'D'],
      answer: 'C',
    };
    expect(formatExpectedAnswer(q)).toBe('C');
  });

  it('multi-choice answer letters are formatted with commas', () => {
    expect(formatMultiChoiceAnswer('ABD')).toBe('A, B, D');
    expect(formatMultiChoiceAnswer('ABC')).toBe('A, B, C');
    expect(formatMultiChoiceAnswer('A')).toBe('A');
  });

  it('judge: formatExpectedAnswer normalizes true/false to 对/错', () => {
    expect(formatExpectedAnswer({ bankId: 1, type: 'judge', content: 'x', answer: '对' })).toBe('对');
    expect(formatExpectedAnswer({ bankId: 1, type: 'judge', content: 'x', answer: '错' })).toBe('错');
    expect(formatExpectedAnswer({ bankId: 1, type: 'judge', content: 'x', answer: 'true' })).toBe('对');
  });

  it('essay: formatExpectedAnswer returns raw answer text', () => {
    const q: Question = {
      bankId: 1, type: 'essay',
      content: '简述',
      answer: '通过叶轮旋转',
    };
    expect(formatExpectedAnswer(q)).toBe('通过叶轮旋转');
  });
});
