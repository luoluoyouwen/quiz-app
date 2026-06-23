export interface QuestionInput {
  type: 'choice' | 'multi' | 'fill' | 'judge' | 'essay' | 'nofill';
  content: string;
  options?: string[];  // ['A. text', 'B. text', ...] for choice/multi
  answer: string;
  answers?: string[];  // multiple answers for multi-blank fill questions
  explanation?: string;
  tags?: string[];
  image?: string;      // data:image/...;base64,... for inline question images
}
