import mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = mammoth as any;
import { parseTxt } from './txt';
import { parseExamDocx } from './exam';
import { extractDocxXml, type DocxImageAnchor } from './docx-xml';
import { normalizeText } from './normalize';
import type { QuestionInput } from './types';
import { debug } from '../debug';

function mammothInput(arrayBuffer: ArrayBuffer): { arrayBuffer: ArrayBuffer; buffer?: Buffer } {
  return {
    arrayBuffer,
    buffer: typeof Buffer !== 'undefined' ? Buffer.from(arrayBuffer) : undefined,
  };
}

function detectSection(line: string): QuestionInput['type'] | null {
  if (/\t\d+\s*$/.test(line)) return null;
  const match = line.match(/^[一二三四五]\s+(.+?)$/);
  if (!match) return null;
  const section = match[1];
  if (section.includes('填空')) return 'fill';
  if (section.includes('单选')) return 'choice';
  if (section.includes('多选')) return 'multi';
  if (section.includes('判断')) return 'judge';
  if (section.includes('问答')) return 'essay';
  return null;
}

function isAnswerLine(line: string): boolean {
  return /^答[：:(（]/.test(line) || /^答案[:：]/.test(line) || /^\d+[）.、]/.test(line) || /^[①-⑩]/.test(line) || /^[（(]\d+[）)]/.test(line);
}

function isQuestionParagraph(line: string, section: QuestionInput['type'] | null): boolean {
  if (!line || detectSection(line)) return false;
  if (/^(目录|主风岗位|反应岗位|磨煤岗位|分馏岗位)$/.test(line)) return false;

  if (section === 'fill') return line.length > 5;
  if (section === 'judge') return /[（(]\s*[√×]\s*[）)]/.test(line);
  if (section === 'choice' || section === 'multi') return /[（(]\s*[A-E]{1,}\s*[）)]/.test(line);
  if (section === 'essay') return !isAnswerLine(line);
  return false;
}

function normalizeAnchorText(text: string): string {
  return text
    .replace(/{{BLANK:[^}]+}}/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function findMatchingQuestionIndex(
  questions: QuestionInput[],
  section: QuestionInput['type'] | null,
  line: string,
  startIndex: number,
): number {
  const normalizedLine = normalizeAnchorText(line);
  if (!normalizedLine) return -1;

  for (let i = Math.max(0, startIndex); i < questions.length; i++) {
    const question = questions[i];
    if (section && question.type !== section) continue;
    const normalizedContent = normalizeAnchorText(question.content);
    if (!normalizedContent) continue;

    if (
      normalizedContent === normalizedLine
      || normalizedContent.startsWith(normalizedLine.slice(0, Math.min(24, normalizedLine.length)))
      || normalizedLine.startsWith(normalizedContent.slice(0, Math.min(24, normalizedContent.length)))
    ) {
      return i;
    }
  }
  return -1;
}

function previousNonEmptyParagraph(paragraphs: string[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    const line = (paragraphs[i] || '').trim();
    if (line) return line;
  }
  return '';
}

function anchorImagesToQuestions(
  questions: QuestionInput[],
  paragraphs: string[],
  imageAnchors: DocxImageAnchor[],
): QuestionInput[] {
  if (imageAnchors.length === 0 || questions.length === 0) return questions;

  const anchorByParagraph = new Map<number, string[]>();
  for (const anchor of imageAnchors) {
    const list = anchorByParagraph.get(anchor.paragraphIndex) || [];
    list.push(...anchor.images);
    anchorByParagraph.set(anchor.paragraphIndex, list);
  }

  const imagesByQuestion = new Map<number, string[]>();
  let section: QuestionInput['type'] | null = null;
  let lastQuestionIndex = -1;
  let searchFrom = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const line = (paragraphs[i] || '').trim();
    const nextSection = detectSection(line);
    if (nextSection) {
      section = nextSection;
      continue;
    }

    if (isQuestionParagraph(line, section)) {
      const matched = findMatchingQuestionIndex(questions, section, line, searchFrom);
      if (matched >= 0) {
        lastQuestionIndex = matched;
        searchFrom = matched + 1;
      }
    }

    const images = anchorByParagraph.get(i);
    if (!images?.length) continue;

    let targetIndex = lastQuestionIndex;
    if (!line) {
      const previousLine = previousNonEmptyParagraph(paragraphs, i);
      if (isQuestionParagraph(previousLine, section)) {
        const matchedPrevious = findMatchingQuestionIndex(questions, section, previousLine, Math.max(0, lastQuestionIndex - 1));
        if (matchedPrevious >= 0) targetIndex = matchedPrevious;
      }
    }

    if (targetIndex >= 0) {
      const list = imagesByQuestion.get(targetIndex) || [];
      list.push(...images);
      imagesByQuestion.set(targetIndex, list);
    }
  }

  if (imagesByQuestion.size === 0) return questions;

  return questions.map((question, idx) => {
    if (question.image) return question;
    const images = imagesByQuestion.get(idx);
    return images?.[0] ? { ...question, image: images[0] } : question;
  });
}

export async function parseDocx(
  arrayBuffer: ArrayBuffer,
  nameHint?: string,
): Promise<{ bankName: string; questions: QuestionInput[] }> {
  let textResult, htmlResult;
  const input = mammothInput(arrayBuffer);
  try {
    const results = await Promise.all([
      m.extractRawText(input),
      m.convertToHtml({
        ...input,
        convertImage: m.images.dataUri,
      }),
    ]);
    textResult = results[0];
    htmlResult = results[1];
    debug.log('[parseDocx] text=' + textResult.value.length + ' html=' + htmlResult.value.length);
  } catch (e: any) {
    debug.error('[parseDocx] failed:', e?.message || e);
    throw e;
  }

  let text = textResult.value;
  let usedXmlText = false;
  let xmlImages: { paragraphs: string[]; imageAnchors: DocxImageAnchor[] } | null = null;
  try {
    const xml = await extractDocxXml(arrayBuffer);
    if (xml?.text && xml.text.length > text.length * 0.8) {
      text = xml.text;
      usedXmlText = true;
      xmlImages = { paragraphs: xml.paragraphs, imageAnchors: xml.imageAnchors };
      debug.log('[parseDocx] using xml text=' + xml.text.length + ' images=' + xml.imageAnchors.length);
    }
  } catch (e: any) {
    debug.warn('[parseDocx] xml extraction failed:', e?.message || e);
  }
  if (!text || !text.trim()) {
    throw new Error('No text content found in the DOCX file');
  }

  const hasSectionHeaders =
    /(填空|单选|多选|判断|问答).*[题]?/.test(text)
    || /[（(]\s*[√×]\s*[）)]/.test(text);
  const hasFillBlanks =
    /\s{2,}[一-鿿\w]/.test(text)
    || /[一-鿿\w]\s{2,}/.test(text)
    || /\{\{BLANK:/.test(text);

  let result: { bankName: string; questions: QuestionInput[] };

  if (usedXmlText) {
    result = parseExamDocx(text);
  } else if (hasSectionHeaders || hasFillBlanks) {
    try {
      const normalized = await normalizeText(text);
      const normSections = ['填空', '单选', '多选', '判断', '问答'].map(s => ({
        name: s,
        idx: normalized.search(new RegExp(`[一二三四五]\\s*${s}`)),
      }));
      const missing = normSections.find(s => s.idx < 0);
      const wrongOrder = normSections.find((s, i) => i > 0 && s.idx < normSections[i - 1].idx);
      const countMarkers = (t: string) =>
        (t.match(/[（(]\s*[√×A-Da-d]{1,}\s*[）)]/g) || []).length +
        (t.match(/答案[:：]/g) || []).length;
      const origCount = countMarkers(text);
      const normCount = countMarkers(normalized);
      const diff = Math.abs(origCount - normCount);
      const threshold = Math.max(Math.round(origCount * 0.05), 3);

      if (missing || wrongOrder || diff > threshold) {
        debug.warn('[parseDocx] AI validation failed - using raw text');
        result = parseExamDocx(text);
      } else {
        result = parseExamDocx(normalized);
      }
    } catch {
      result = parseTxt(text, nameHint || '题库');
    }
  } else {
    result = parseTxt(text, nameHint || '题库');
  }

  if (xmlImages?.imageAnchors.length) {
    result.questions = anchorImagesToQuestions(result.questions, xmlImages.paragraphs, xmlImages.imageAnchors);
  }

  const hasAnchoredImages = result.questions.some((question) => !!question.image);
  if (!hasAnchoredImages) {
    const imageList = extractImagesFromHtml(htmlResult.value);
    if (imageList.length > 0) {
      const imageCounts = countImagesPerSection(htmlResult.value);
      result.questions = assignImagesToQuestions(result.questions, imageList, imageCounts);
    }
  }

  return result;
}

const SECTION_PATTERNS: Record<string, string> = {
  '单选': 'choice', '多选': 'multi', '填空': 'fill', '判断': 'judge', '问答': 'essay',
};

function countImagesPerSection(html: string): Record<string, number> {
  const counts: Record<string, number> = {};
  let currentSection: string | null = null;
  const segments = html.split(/(?=<\/?p>|<br\s*\/?>)/i);

  for (const seg of segments) {
    const text = seg.replace(/<[^>]+>/g, '').trim();
    const hasImage = /<img[^>]+src="data:image/.test(seg);
    if (text && !/\t\d+\s*$/.test(text)) {
      const match = text.match(/^[一二三四五]\s+(.+?)$/);
      if (match) {
        for (const [key, val] of Object.entries(SECTION_PATTERNS)) {
          if (match[1].includes(key)) { currentSection = val; break; }
        }
        continue;
      }
    }
    if (currentSection && hasImage) {
      const imgTags = seg.match(/<img[^>]+>/g);
      counts[currentSection] = (counts[currentSection] || 0) + (imgTags ? imgTags.length : 0);
    }
  }
  return counts;
}

function assignImagesToQuestions(
  questions: QuestionInput[], images: string[], counts: Record<string, number>,
): QuestionInput[] {
  const pools: Record<string, number> = { fill: counts.fill || 0, choice: counts.choice || 0, multi: counts.multi || 0, judge: counts.judge || 0, essay: counts.essay || 0 };
  let idx = 0;
  let result = questions;
  for (const type of ['fill', 'choice', 'multi', 'judge', 'essay']) {
    result = assignToType(result, type, pools[type], images, idx);
    idx += pools[type];
  }
  if (idx < images.length) {
    let s = idx;
    result = result.map(q => (!q.image && s < images.length) ? { ...q, image: images[s++] } : q);
  }
  return result;
}

function assignToType(qs: QuestionInput[], type: string, count: number, images: string[], start: number): QuestionInput[] {
  if (count === 0) return qs;
  let a = 0;
  return qs.map(q => (q.type === type && !q.image && a < count && (start + a) < images.length) ? { ...q, image: images[start + (a++)] } : q);
}

function extractImagesFromHtml(html: string): string[] {
  const imgs: string[] = [];
  const re = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null) imgs.push(match[1]);
  return imgs;
}
