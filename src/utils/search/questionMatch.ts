import type { Question } from '../../db';

function normalize(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/[\s,，。．、；;：:？?！!"'“”‘’（）()【】\[\]《》<>·•\-—_…]+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

function grams(value: string, size: number): Set<string> {
  const result = new Set<string>();
  if (value.length <= size) {
    if (value) result.add(value);
    return result;
  }
  for (let i = 0; i <= value.length - size; i++) result.add(value.slice(i, i + size));
  return result;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 4 && right.includes(left)) return Math.min(0.96, 0.55 + left.length / Math.max(right.length, 1));
  if (right.length >= 4 && left.includes(right)) return Math.min(0.94, 0.5 + right.length / Math.max(left.length, 1));

  const bigramScore = dice(grams(left, 2), grams(right, 2));
  const trigramScore = dice(grams(left, 3), grams(right, 3));
  return Math.max(bigramScore * 0.75 + trigramScore * 0.25, trigramScore);
}

function coverage(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q || !t) return 0;
  const qGrams = grams(q, 2);
  if (qGrams.size === 0) return 0;
  let hit = 0;
  for (const gram of qGrams) if (t.includes(gram)) hit++;
  return hit / qGrams.size;
}

function searchableText(question: Question): string {
  return [
    question.content,
    ...(question.options || []),
    question.answer,
    ...(question.answers || []),
    question.explanation,
  ].filter(Boolean).join(' ');
}

export interface MatchResult {
  question: Question;
  score: number;
}

export function searchQuestions(
  ocrText: string,
  questions: Question[],
  topN: number = 5,
): MatchResult[] {
  const query = normalize(ocrText);
  if (query.length < 2 || !questions.length) return [];

  const scored = questions.map((question) => {
    const contentScore = similarity(query, question.content || '');
    const fullText = searchableText(question);
    const fullScore = similarity(query, fullText);
    const coverScore = coverage(query, fullText);
    const answerScore = similarity(query, question.answer || '') * 0.35;
    const optionScore = Math.max(0, ...(question.options || []).map((option) => similarity(query, option) * 0.25));
    const score = Math.min(1, contentScore * 0.5 + fullScore * 0.25 + coverScore * 0.2 + answerScore + optionScore);
    return { question, score: Math.round(score * 100) / 100 };
  });

  return scored
    .filter((item) => item.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
