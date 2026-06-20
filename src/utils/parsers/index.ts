import type { QuestionInput } from './types';
import { parseTxt } from './txt';
import { parseJson } from './json';
import { parseCsv } from './csv';
import { parseDocx } from './docx';
import { parseMarkdown } from './markdown';
import { parseExamDocx } from './exam';

export type { QuestionInput };

export { parseTxt, parseJson, parseCsv, parseDocx, parseMarkdown, parseExamDocx };

type ParserResult = { bankName: string; questions: QuestionInput[] };

/**
 * Detect the file format from the filename/extension and route to the correct parser.
 *
 * @param file     File object with name and (for DOCX) arrayBuffer data
 * @param content  Raw text content (for TXT, JSON, CSV, Markdown)
 * @returns        Parsed bank name and questions
 */
export async function detectFormat(
  file: { name: string; arrayBuffer?: () => Promise<ArrayBuffer> },
  content?: string,
): Promise<ParserResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const nameHint = file.name.replace(/\.[^.]+$/, '');

  switch (ext) {
    case 'txt': {
      if (content === undefined) {
        throw new Error('Text content is required for .txt files');
      }
      return parseTxt(content, nameHint);
    }

    case 'json': {
      if (content === undefined) {
        throw new Error('Text content is required for .json files');
      }
      return parseJson(content);
    }

    case 'csv': {
      if (content === undefined) {
        throw new Error('Text content is required for .csv files');
      }
      return parseCsv(content);
    }

    case 'md':
    case 'markdown': {
      if (content === undefined) {
        throw new Error('Text content is required for .md files');
      }
      return parseMarkdown(content);
    }

    case 'docx': {
      if (!file.arrayBuffer) {
        throw new Error('arrayBuffer() method is required for .docx files');
      }
      const arrayBuffer = await file.arrayBuffer();
      return parseDocx(arrayBuffer, nameHint);
    }

    default:
      throw new Error(
        `Unsupported file format: .${ext}. Supported formats: .txt, .json, .csv, .md, .docx`,
      );
  }
}
