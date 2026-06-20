export interface QuestionInput {
  type: 'choice' | 'multi' | 'fill' | 'judge' | 'essay';
  content: string;
  options?: string[];  // ['A. text', 'B. text', ...] for choice/multi
  answer: string;
  answers?: string[];  // multiple answers for multi-blank fill questions
  explanation?: string;
  tags?: string[];
}
