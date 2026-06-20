export interface QuestionInput {
  type: 'choice' | 'fill' | 'judge';
  content: string;
  options?: string[];  // ['A. text', 'B. text', ...] for choice
  answer: string;
  explanation?: string;
  tags?: string[];
}
