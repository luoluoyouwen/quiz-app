import { useState, useRef, useCallback } from 'react';
import { Modal, Button, Upload, Spin, List, Tag, Empty, message, Typography, Space, Input, Segmented } from 'antd';
import { CameraOutlined, PictureOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Question } from '../db';
import { searchQuestions, type MatchResult } from '../utils/search/questionMatch';
import QuestionCard from './QuestionCard';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface PhotoSearchProps {
  open: boolean;
  onClose: () => void;
  questions?: Question[] | null;
  onOcrDone?: (text: string) => void;
}

type Status = 'idle' | 'loading-ocr' | 'searching' | 'done';
type SearchScope = 'all' | 'stem';

export default function PhotoSearch({ open, onClose, questions, onOcrDone }: PhotoSearchProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [results, setResults] = useState<MatchResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [scope, setScope] = useState<SearchScope>('all');
  const ocrRef = useRef<any>(null);
  const [ocrInitDone, setOcrInitDone] = useState(false);

  const initOcr = useCallback(async () => {
    if (ocrInitDone && ocrRef.current) return;
    const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
    ocrRef.current = await PaddleOCR.create({
      lang: 'ch',
      ocrVersion: 'PP-OCRv6',
      worker: true,
      ortOptions: {
        backend: 'wasm',
        wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',
        numThreads: 1,
        simd: true,
      },
    });
    setOcrInitDone(true);
  }, [ocrInitDone]);

  const canvasToBlob = (canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片处理失败')), 'image/jpeg', quality);
  });

  const drawResized = (file: File, enhance: boolean): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        URL.revokeObjectURL(url);
        const MAX = 1600;
        let { width, height } = img;
        const ratio = Math.min(1, MAX / Math.max(width, height));
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('无法处理图片');
        ctx.drawImage(img, 0, 0, width, height);

        if (enhance) {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 138));
            data[i] = data[i + 1] = data[i + 2] = boosted;
          }
          ctx.putImageData(imageData, 0, 0);
        }

        resolve(await canvasToBlob(canvas));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });

  const extractText = (ocrResult: any): string => {
    const items = ocrResult?.[0]?.items || ocrResult?.items || [];
    return items
      .map((item: any) => String(item.text || '').trim())
      .filter(Boolean)
      .join('\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  };

  const runSearch = (text: string) => {
    const sourceQuestions = questions || [];
    if (!sourceQuestions.length) {
      setResults([]);
      return;
    }
    const pool = scope === 'stem'
      ? sourceQuestions.map((question) => ({ ...question, answer: '', answers: [], options: [], explanation: '' }))
      : sourceQuestions;
    setResults(searchQuestions(text, pool as Question[], 8));
  };

  const runOcr = async (file: File) => {
    try {
      setStatus('loading-ocr');
      setResults([]);
      message.loading({ content: '正在识别图片文字...', key: 'ocr' });

      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      await initOcr();

      const variants = [await drawResized(file, false), await drawResized(file, true)];
      let bestText = '';
      for (const variant of variants) {
        const text = extractText(await ocrRef.current.predict(variant));
        if (text.length > bestText.length) bestText = text;
        if (bestText.length >= 12) break;
      }

      setOcrText(bestText);
      onOcrDone?.(bestText);

      if (!bestText) {
        message.warning({ content: '未识别出文字，可以换一张更清晰的照片或手动输入关键词', key: 'ocr' });
        setStatus('done');
        return;
      }

      message.success({ content: `识别到 ${bestText.replace(/\s/g, '').length} 个字`, key: 'ocr' });
      setStatus('searching');
      runSearch(bestText);
      setStatus('done');
    } catch (err: any) {
      console.error('OCR failed:', err);
      message.error({ content: `OCR 识别失败：${err.message || '未知错误'}`, key: 'ocr' });
      setStatus('done');
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return false;
    }
    await runOcr(file);
    return false;
  };

  const handleReset = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setOcrText('');
    setResults([]);
    setStatus('idle');
  };

  const close = () => {
    handleReset();
    onClose();
  };

  const hasMatches = results.length > 0;

  return (
    <Modal

      className="photo-search-modal"
      title={<Space><CameraOutlined />拍照搜题</Space>}
      open={open}
      onCancel={close}
      footer={null}
      width={720}
      destroyOnClose
    >
      {status === 'idle' && (
        <div className="photo-search-empty">
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleFile as any} capture="environment">
            <Button className="photo-search-primary" type="primary" size="large" icon={<CameraOutlined />}>
              拍照识别
            </Button>
          </Upload>
          <div className="photo-search-secondary-action">
            <Upload accept="image/*" showUploadList={false} beforeUpload={handleFile as any}>
              <Button icon={<PictureOutlined />}>从相册选择</Button>
            </Upload>
          </div>
          <Text className="photo-search-guidance" type="secondary">
            尽量让题干占满画面，避免倾斜和强反光。识别后可以手动修正文案再搜索。
          </Text>
          {!ocrInitDone && (
            <Text className="photo-search-model-hint" type="warning">
              首次使用需要加载 OCR 模型，可能需要等待几秒。
            </Text>
          )}
        </div>
      )}

      {(status === 'loading-ocr' || status === 'searching') && (
        <div className="photo-search-loading">
          <Spin size="large" />
          <p className="photo-search-status-text">{status === 'loading-ocr' ? '正在识别图片文字...' : '正在题库中匹配...'}</p>
          {imagePreview && <img className="photo-search-preview is-loading" src={imagePreview} alt="预览" />}
        </div>
      )}

      {status === 'done' && (
        <div className="photo-search-results">
          {imagePreview && (
            <div className="photo-search-preview-wrap">
              <img className="photo-search-preview" src={imagePreview} alt="预览" />
            </div>
          )}

          <Space orientation="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <Space className="photo-search-text-head">
                <Text strong>识别文本</Text>
                <Segmented
                  size="small"
                  value={scope}
                  onChange={(value) => setScope(value as SearchScope)}
                  options={[{ label: '搜整题', value: 'all' }, { label: '只搜题干', value: 'stem' }]}
                />
              </Space>
              <TextArea
                value={ocrText}
                onChange={(event) => setOcrText(event.target.value)}
                autoSize={{ minRows: 3, maxRows: 7 }}
                placeholder="可以在这里手动输入或修正识别文字"
              />
              <Button
                className="photo-search-rescan"
                type="primary"
                icon={<SearchOutlined />}
                disabled={!ocrText.trim()}
                onClick={() => runSearch(ocrText)}
              >
                重新搜索
              </Button>
            </div>

            {ocrText ? (
              hasMatches ? (
                <div>
                  <Title className="photo-search-result-title" level={5}>匹配结果（{results.length} 条）</Title>
                  <List
                    dataSource={results}
                    renderItem={(item, idx) => (
                      <List.Item>
                        <div className="photo-search-result-item">
                          <Tag className="photo-search-score" color={idx === 0 ? 'blue' : 'default'}>
                            匹配度 {Math.round(item.score * 100)}%
                          </Tag>
                          {idx === 0 ? (
                            <div className="photo-search-best-match">
                              <QuestionCard question={item.question} showAnswer />
                            </div>
                          ) : (
                            <div className="photo-search-lite-match">
                              <Text>{item.question.content?.slice(0, 100)}</Text>
                              <Text className="photo-search-type" type="secondary">[{item.question.type}]</Text>
                            </div>
                          )}
                        </div>
                      </List.Item>
                    )}
                  />
                </div>
              ) : (
                <Empty description="未在题库中找到匹配题目，可以修正识别文字后重新搜索" />
              )
            ) : (
              <Empty description="未识别出文字，可以手动输入关键词搜索" />
            )}
          </Space>

          <div className="photo-search-reset">
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重新拍照</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
