import mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = mammoth as any;
import { parseTxt } from './txt';
import { parseExamDocx } from './exam';
import { normalizeText } from './normalize';
import type { QuestionInput } from './types';

/**
 * Parses a DOCX file, extracting both text content and embedded images.
 *
 * Text is extracted via mammoth.extractRawText and processed through the
 * existing parser pipeline (AI normalizer → exam parser / TXT parser).
 *
 * Embedded images are extracted in parallel via mammoth.convertToHtml with
 * a custom convertImage callback that embeds each image as a base64 data: URL.
 * Images are then assigned in order to choice/multi-choice questions (the
 * common pattern in Chinese化工 exam papers).
 */
export async function parseDocx(
  arrayBuffer: ArrayBuffer,
  nameHint?: string,
): Promise<{ bankName: string; questions: QuestionInput[] }> {
  // ── Run both extraction paths in parallel ──
  let textResult, htmlResult;
  try {
    const results = await Promise.all([
      m.extractRawText({ arrayBuffer }),
      m.convertToHtml({
        arrayBuffer,
        convertImage: m.images.dataUri,
      }),
    ]);
    textResult = results[0];
    htmlResult = results[1];
    console.log('[parseDocx] mammoth OK: text=' + textResult.value.length + ' html=' + htmlResult.value.length + ' msgs=' + (htmlResult.messages?.length || 0));
  } catch (e: any) {
    console.error('[parseDocx] mammoth failed:', e?.message || e);
    throw e;
  }

  if (htmlResult.messages?.length) {
    htmlResult.messages.forEach((m: any) => {
      if (m.type === 'warning') console.warn('[parseDocx] mammoth warning:', m.message);
    });
  }
  const text = textResult.value;
  if (!text || !text.trim()) {
    throw new Error('No text content found in the DOCX file');
  }

  // ── Text parsing (existing flow, unchanged) ──
  const hasSectionHeaders =
    /(填空|单选|多选|判断|问答).*[（(]/.test(text)
    || /[（(]\s*[√×]\s*[）)]/.test(text);
  const hasFillBlanks =
    /\s{2,}[\u4e00-\u9fff\w]/.test(text)
    || /[\u4e00-\u9fff\w]\s{2,}/.test(text);

  let result: { bankName: string; questions: QuestionInput[] };

  if (hasSectionHeaders || hasFillBlanks) {
    try {
      const normalized = await normalizeText(text);
      result = parseExamDocx(normalized);
    } catch {
      // Exam parser failed, fall through to TXT parser
      result = parseTxt(text, nameHint || '题库');
    }
  } else {
    result = parseTxt(text, nameHint || '题库');
  }

  // ── Image extraction: collect all base64 data URLs from mammoth HTML ──
  const imageList = extractImagesFromHtml(htmlResult.value);

  // ── Debug logging (remove after verification) ──
  console.log('[parseDocx] images found:', imageList.length,
    'html msgs:', htmlResult.messages?.length || 0);

  // ── Merge: assign images to questions by section ──
  if (imageList.length > 0) {
    const imageCounts = countImagesPerSection(htmlResult.value);
    console.log('[parseDocx] image counts per section:', JSON.stringify(imageCounts));
    result.questions = assignImagesToQuestions(result.questions, imageList, imageCounts);

    // Log which questions got images
    const withImg = result.questions.filter(q => q.image);
    console.log('[parseDocx] questions with images:', withImg.length);
    withImg.forEach(q => console.log('  →', q.type, q.content.substring(0, 50)));
  } else {
    console.log('[parseDocx] no images found in DOCX');
    // Log mammoth warnings if any
    if (htmlResult.messages?.length) {
      htmlResult.messages.forEach((msg: any) => console.warn('[parseDocx] mammoth msg:', msg.message));
    }
  }

  return result;
}

/**
 * Section patterns (mirrors exam.ts) for counting images per section from HTML.
 */
const SECTION_PATTERNS: Record<string, string> = {
  '单选': 'choice',
  '多选': 'multi',
  '填空': 'fill',
  '判断': 'judge',
  '问答': 'essay',
};

/**
 * Analyzes mammoth HTML to count how many images appear in each exam section.
 *
 * Walks through HTML paragraphs, tracks current section by detecting headers
 * like "二 单选题", and counts <img> tags within each section.
 */
function countImagesPerSection(html: string): Record<string, number> {
  const counts: Record<string, number> = {};
  let currentSection: string | null = null;

  // Split HTML into paragraph-level segments
  const segments = html.split(/(?=<\/?p>|<br\s*\/?>)/i);

  for (const seg of segments) {
    const text = seg.replace(/<[^>]+>/g, '').trim();
    const hasImage = /<img[^>]+src="data:image/.test(seg);

    // Skip empty segments with no text and no image
    if (!text && !hasImage) continue;

    // Detect section header like "一 填空题", "二 单选题", etc.
    if (text) {
      const headerMatch = text.match(/^[一二三四五]\s+(.+?)$/);
      if (headerMatch) {
        const sectionName = headerMatch[1];
        currentSection = null;
        for (const [key, val] of Object.entries(SECTION_PATTERNS)) {
          if (sectionName.includes(key)) {
            currentSection = val;
            break;
          }
        }
        continue;
      }
    }

    // Count images in this segment (even if text-less, e.g. <p><img/></p>)
    if (currentSection && hasImage) {
      const imgTags = seg.match(/<img[^>]+>/g);
      counts[currentSection] = (counts[currentSection] || 0) + (imgTags ? imgTags.length : 0);
    }
  }

  return counts;
}

/**
 * Assigns images to questions by section, using per-section image counts
 * extracted from the HTML. This correctly handles images that span multiple
 * sections (choice images + essay images in the same DOCX).
 *
 * Assignment order per section: fill → choice → multi → judge → essay
 */
function assignImagesToQuestions(
  questions: QuestionInput[],
  images: string[],
  counts: Record<string, number>,
): QuestionInput[] {
  // Build per-type image pools: how many images to assign to each type
  const pools: Record<string, number> = {
    choice: counts.choice || 0,
    multi: counts.multi || 0,
    essay: counts.essay || 0,
  };

  let imgIdx = 0;

  // Pass 1: images → choice questions
  const afterChoice = assignToType(questions, 'choice', pools.choice, images, imgIdx);
  imgIdx += pools.choice;

  // Pass 2: images → multi questions
  const afterMulti = assignToType(afterChoice, 'multi', pools.multi, images, imgIdx);
  imgIdx += pools.multi;

  // Pass 3: remaining images → answerless essay questions
  return assignToEssay(afterMulti, 'essay', pools.essay, images, imgIdx);
}

function assignToType(
  questions: QuestionInput[],
  type: string,
  count: number,
  images: string[],
  startIdx: number,
): QuestionInput[] {
  if (count === 0) return questions;
  let assigned = 0;
  return questions.map((q) => {
    if (q.type === type && assigned < count && (startIdx + assigned) < images.length) {
      const img = images[startIdx + assigned];
      assigned++;
      return { ...q, image: img };
    }
    return q;
  });
}

function assignToEssay(
  questions: QuestionInput[],
  type: string,
  count: number,
  images: string[],
  startIdx: number,
): QuestionInput[] {
  if (count === 0) return questions;
  let assigned = 0;
  return questions.map((q) => {
    if (q.type === type && !q.answer && assigned < count && (startIdx + assigned) < images.length) {
      const img = images[startIdx + assigned];
      assigned++;
      return { ...q, image: img };
    }
    return q;
  });
}

/**
 * Extracts all base64-encoded image sources from mammoth-generated HTML.
 */
function extractImagesFromHtml(html: string): string[] {
  const images: string[] = [];
  // Match <img> tags with any attributes, extract the src attribute value
  const regex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    images.push(match[1]);
  }
  return images;
}
