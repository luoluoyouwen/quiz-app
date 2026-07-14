import JSZip from 'jszip';

export interface DocxImageAnchor {
  paragraphIndex: number;
  text: string;
  images: string[];
}

export interface DocxXmlExtraction {
  text: string;
  paragraphs: string[];
  imageAnchors: DocxImageAnchor[];
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function hasVisibleUnderline(runXml: string): boolean {
  const underline = runXml.match(/<w:u\b[^>]*>/);
  return !!underline && !/\bw:val="(?:none|0|false)"/.test(underline[0]);
}

function runText(runXml: string): string {
  let value = '';

  const tokenPattern = /<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  const tokens = runXml.match(tokenPattern) || [];
  for (const token of tokens) {
    if (token.startsWith('<w:t')) {
      const textMatch = token.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
      value += decodeXml(textMatch?.[1] || '');
    } else if (token.startsWith('<w:tab')) {
      value += '    ';
    } else if (token.startsWith('<w:br')) {
      value += '\n';
    }
  }

  return value;
}

function paragraphText(paragraphXml: string): string {
  const runs = paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/g) || [];
  let value = '';
  let underlined = '';

  const flushUnderline = () => {
    if (!underlined) return;
    const normalized = underlined.replace(/\s+/g, ' ').trim();
    value += normalized ? `{{BLANK:${normalized}}}` : '____';
    underlined = '';
  };

  for (const run of runs) {
    const text = runText(run);
    if (!text) continue;

    if (hasVisibleUnderline(run)) {
      underlined += text;
    } else {
      flushUnderline();
      value += text;
    }
  }
  flushUnderline();

  return value.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim();
}

function paragraphImageRelIds(paragraphXml: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /\br:embed="([^"]+)"/g,
    /\br:link="([^"]+)"/g,
    /\ba:embed="([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(paragraphXml)) !== null) {
      ids.add(match[1]);
    }
  }

  return [...ids];
}

function extractParagraphs(documentXml: string): Array<{ text: string; relIds: string[] }> {
  const paragraphs: Array<{ text: string; relIds: string[] }> = [];
  const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(documentXml)) !== null) {
    const text = paragraphText(match[0]);
    const relIds = paragraphImageRelIds(match[0]);
    if (text || relIds.length > 0) paragraphs.push({ text, relIds });
  }

  return paragraphs;
}

function parseRelationships(relsXml: string): Record<string, string> {
  const rels: Record<string, string> = {};
  const relPattern = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = relPattern.exec(relsXml)) !== null) {
    rels[match[1]] = decodeXml(match[2]);
  }

  return rels;
}

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  return 'application/octet-stream';
}

function normalizeTarget(target: string): string {
  if (/^https?:\/\//i.test(target) || target.startsWith('data:')) return target;
  const clean = target.replace(/^\/+/g, '');
  return clean.startsWith('word/') ? clean : `word/${clean.replace(/^\.\//, '')}`;
}

async function relIdToDataUri(zip: JSZip, rels: Record<string, string>, relId: string): Promise<string | null> {
  const target = rels[relId];
  if (!target) return null;
  if (/^https?:\/\//i.test(target) || target.startsWith('data:')) return target;

  const path = normalizeTarget(target);
  const file = zip.file(path);
  if (!file) return null;

  const base64 = await file.async('base64');
  return `data:${mimeFromPath(path)};base64,${base64}`;
}

export async function extractDocxXml(arrayBuffer: ArrayBuffer): Promise<DocxXmlExtraction | null> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return null;

  const documentXml = await documentFile.async('string');
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string').catch(() => '') || '';
  const rels = relsXml ? parseRelationships(relsXml) : {};
  const rawParagraphs = extractParagraphs(documentXml);
  const firstBodySection = rawParagraphs.findIndex((paragraph) =>
    /^[一二三四五]\s*(?:填空题|单选题|多选题|判断题|问答题)\s*$/.test(paragraph.text)
  );
  const bodyRawParagraphs = firstBodySection > 0 ? rawParagraphs.slice(firstBodySection) : rawParagraphs;
  const bodyParagraphs = bodyRawParagraphs.map((paragraph) => paragraph.text).filter(Boolean);
  const text = bodyParagraphs.join('\n');
  const imageAnchors: DocxImageAnchor[] = [];

  for (let i = 0; i < bodyRawParagraphs.length; i++) {
    const paragraph = bodyRawParagraphs[i];
    if (paragraph.relIds.length === 0) continue;
    const images = (await Promise.all(paragraph.relIds.map((relId) => relIdToDataUri(zip, rels, relId))))
      .filter((image): image is string => !!image);
    if (images.length > 0) {
      imageAnchors.push({ paragraphIndex: i, text: paragraph.text, images });
    }
  }

  return text.trim() || imageAnchors.length > 0
    ? { text, paragraphs: bodyRawParagraphs.map((paragraph) => paragraph.text), imageAnchors }
    : null;
}

export async function extractDocxXmlText(arrayBuffer: ArrayBuffer): Promise<string | null> {
  const extraction = await extractDocxXml(arrayBuffer);
  return extraction?.text || null;
}
