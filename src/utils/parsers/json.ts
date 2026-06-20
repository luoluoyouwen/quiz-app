import type { QuestionInput } from './types';

interface JsonQuestion {
  type: 'choice' | 'fill' | 'judge' | 'essay';
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  tags?: string[];
}

/**
 * Parse a JSON array of questions or an object with { name, questions }.
 *
 * Array format:
 *   [{ type, content, options?, answer, explanation?, tags? }, ...]
 *
 * Object format:
 *   { name: "Bank Name", questions: [...] }
 */
export function parseJson(data: string): { bankName: string; questions: QuestionInput[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Invalid JSON format: unable to parse the file content');
  }

  let bankName = 'Imported JSON';
  let questionsRaw: JsonQuestion[];

  if (Array.isArray(parsed)) {
    questionsRaw = parsed as JsonQuestion[];
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if ('questions' in obj && Array.isArray(obj.questions)) {
      if (typeof obj.name === 'string' && obj.name.trim()) {
        bankName = obj.name.trim();
      }
      questionsRaw = obj.questions as JsonQuestion[];
    } else {
      throw new Error('JSON object must contain a "questions" array');
    }
  } else {
    throw new Error('JSON must be an array of questions or an object with a "questions" array');
  }

  if (questionsRaw.length === 0) {
    throw new Error('No questions found in the JSON content');
  }

  const questions: QuestionInput[] = questionsRaw.map((item, index) => {
    const validTypes = ['choice', 'fill', 'judge', 'essay'];
    const type = item.type;
    if (!validTypes.includes(type)) {
      throw new Error(
        `Invalid type "${type}" at index ${index}. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    if (!item.content || typeof item.content !== 'string' || !item.content.trim()) {
      throw new Error(`Missing or empty "content" at index ${index}`);
    }

    if (!item.answer || typeof item.answer !== 'string' || !item.answer.trim()) {
      throw new Error(`Missing or empty "answer" at index ${index}`);
    }

    const q: QuestionInput = {
      type,
      content: item.content.trim(),
      answer: item.answer.trim(),
    };

    if (item.options && Array.isArray(item.options) && item.options.length > 0) {
      q.options = item.options.map((o) => String(o).trim());
    }

    if (item.explanation && typeof item.explanation === 'string') {
      q.explanation = item.explanation.trim();
    }

    if (item.tags && Array.isArray(item.tags)) {
      q.tags = item.tags.map((t) => String(t).trim()).filter(Boolean);
    }

    return q;
  });

  return { bankName, questions };
}
