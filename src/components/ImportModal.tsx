import { useState, useCallback, useRef } from 'react';
import { Modal, Table, Button, message, Typography, Space, Tag, Alert, Input } from 'antd';
import { InboxOutlined, UploadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { db } from '../db';
import { detectFormat } from '../utils/parsers';
import type { QuestionInput } from '../utils/parsers';
import { applyClozeToFillQuestions } from '../utils/cloze';
import { useLiveQuery } from 'dexie-react-hooks';
import { useColors } from '../utils/themeColors';
import { useAuth } from '../contexts/AuthContext';
import { uploadBankToSupabase, checkHashExists, syncCloudBankToLocal, getBankByHash } from '../lib/uploadService';
import { computeFileHash } from '../utils/hash';

const { Text } = Typography;

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  /** 有 bankId 时表示追加到已有题库，否则创建新题库 */
  bankId?: number;
}

export default function ImportModal({ open, onClose, bankId }: ImportModalProps) {
  const { user } = useAuth();
  const isAppend = bankId !== undefined;

  const [parsed, setParsed] = useState<QuestionInput[]>([]);
  const [bankName, setBankName] = useState('');
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [isDocx, setIsDocx] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parsedFileRef = useRef<File | null>(null);
  const colors = useColors();

  // 追加模式：获取目标题库信息
  const targetBank = useLiveQuery(
    () => isAppend ? db.banks.get(bankId!) : undefined,
    [isAppend, bankId],
  );

  // 文件选择后自动用文件名做题库名
  const updateBankNameFromFile = useCallback((name: string) => {
    const clean = name.replace(/\.(txt|json|csv|docx|md)$/i, '').trim();
    if (!bankName && clean) {
      setBankName(clean);
    }
  }, [bankName]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      message.error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），请上传不超过 1MB 的文件`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFileName(file.name);
    updateBankNameFromFile(file.name);
    setIsDocx(file.name.toLowerCase().endsWith('.docx'));
    setParseError('');
    setParsing(true);
    setParsed([]);
    parsedFileRef.current = file;

    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
      });

      const result = await detectFormat(file, text);

      if (result.questions.length === 0) {
        setParseError('未能从文件中解析出任何题目，请检查文件格式');
        setFileName('');
        return;
      }

      setParsed(result.questions);
      message.success(`成功解析 ${result.questions.length} 题`);

      const imageCount = result.questions.filter((q) => q.image).length;
      if (imageCount > 0) {
        message.info(`其中 ${imageCount} 题包含配图`);
      }

      const clozeBefore = result.questions.filter(
        (q) => q.type === 'fill' && !/_{3,}/.test(q.content),
      ).length;
      if (clozeBefore > 0) {
        const clozeQuestions = applyClozeToFillQuestions(result.questions);
        setParsed(clozeQuestions);
        message.info(`已自动挖空 ${clozeBefore} 道填空题`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '解析失败';
      setParseError(msg);
      setFileName('');
    } finally {
      setParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [updateBankNameFromFile]);

  const handleImport = async () => {
    if (parsed.length === 0) {
      message.error('请先上传并解析文件');
      return;
    }

    // 新建模式：校验题库名
    if (!isAppend && !bankName.trim()) {
      message.error('请输入题库名称');
      return;
    }

    setImporting(true);

    try {
      // ── 已登录用户：只上传云端，不写入本地 Dexie ──
      if (user) {
        let contentHash = '';
        if (parsedFileRef.current) {
          contentHash = await computeFileHash(parsedFileRef.current);
        } else {
          const contentStr = JSON.stringify(parsed.map(q => ({ type: q.type, content: q.content, answer: q.answer })));
          const encoder = new TextEncoder();
          const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(contentStr));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // 检查是否已存在
        const { exists, bankName: existingName } = await checkHashExists(contentHash);
        if (exists) {
          Modal.confirm({
            title: '题库已存在',
            content: `该题库「${existingName}」已被其他人上传，自动添加到本地。`,
            okText: '添加到本地',
            cancelText: '取消',
            onOk: async () => {
              if (existingName && contentHash) {
                const bankInfo = await getBankByHash(contentHash);
                if (bankInfo) {
                  const added = await syncCloudBankToLocal(bankInfo.id, bankInfo.name, user.id);
                  message.success(`已同步 ${added} 题到本地`);
                }
              }
              setImporting(false);
              handleClose();
            },
            onCancel: () => {
              setImporting(false);
            },
          });
          return;
        }

        // 上传到 Supabase
        const finalName = isAppend ? (targetBank?.name || '未命名') : bankName.trim();
        const result = await uploadBankToSupabase(finalName, '', parsed, contentHash, user.id);
        message.success(`已上传 ${parsed.length} 题到云端，等待管理员审核后全员可见`);

        // 同步缓存到本地（断网可刷）
        await syncCloudBankToLocal(result.bankId, finalName, user.id);
        setParsed([]);
        setFileName('');
        setParseError('');
        onClose();
        return;
      }

      // ── 未登录用户：仅存到本地（当前应用需登录，此路径为兜底） ──
      let localBankId = bankId;
      if (!isAppend) {
        localBankId = await db.banks.add({
          userId: user.id,
          name: bankName.trim(),
          description: '',
          createdAt: new Date(),
        });
      }

      const toAdd = parsed.map((q) => ({
        bankId: localBankId!,
        type: q.type,
        content: q.content,
        options: q.options,
        answer: q.answer,
        answers: q.answers,
        explanation: q.explanation,
      }));
      await db.questions.bulkAdd(toAdd);
      message.success(`成功导入 ${toAdd.length} 题`);

      setParsed([]);
      setFileName('');
      setParseError('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导入失败';
      message.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setParsed([]);
    setFileName('');
    setBankName('');
    setParseError('');
    setIsDocx(false);
    setParsing(false);
    parsedFileRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const columns = [
    {
      title: '#',
      key: 'index',
      width: 50,
      render: (_: unknown, __: unknown, i: number) => i + 1,
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 80,
      render: (v: string) => {
        const colors: Record<string, string> = { choice: 'blue', multi: 'cyan', fill: 'orange', judge: 'purple', essay: 'green' };
        const labels: Record<string, string> = { choice: '单选', multi: '多选', fill: '填空', judge: '判断', essay: '简答' };
        return <Tag color={colors[v] || 'default'}>{labels[v] || v}</Tag>;
      },
    },
    {
      title: '图',
      dataIndex: 'image',
      width: 40,
      render: (v: string) => v ? '🖼️' : null,
    },
    {
      title: '题目内容',
      dataIndex: 'content',
      ellipsis: true,
    },
    {
      title: '答案',
      dataIndex: 'answer',
      width: 120,
      ellipsis: true,
      render: (v: string, record: QuestionInput) => {
        if (record.answers && record.answers.length > 1) {
          return record.answers.map((a, i) => `${i + 1}.${a}`).join(' ');
        }
        return v;
      },
    },
  ];

  return (
    <Modal
      title={isAppend ? `追加题目到「${targetBank?.name || '...'}」` : '上传题库'}
      open={open}
      onCancel={handleClose}
      width={720}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            onClick={handleImport}
            loading={importing}
            disabled={parsed.length === 0 || (!isAppend && !bankName.trim())}
          >
            {importing ? '导入中...' : `导入 ${parsed.length > 0 ? `(${parsed.length} 题)` : ''}`}
          </Button>
        </Space>
      }
    >
      {/* 新建模式：题库名称 */}
      {!isAppend && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>题库名称</Text>
          <Input
            style={{ width: '100%', marginTop: 4 }}
            placeholder="输入题库名称，默认使用文件名"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
          />
        </div>
      )}

      {/* 云端上传提示 */}
      {user && (
        <Alert
          message={
            <span>
              <CloudUploadOutlined style={{ marginRight: 6 }} />
              登录后自动同步到云端，等待管理员审核后全员可见
            </span>
          }
          type="info"
          showIcon={false}
          style={{ marginBottom: 12, fontSize: 13 }}
        />
      )}

      {!user && (
        <Alert
          message="未登录，仅保存到本地题库。登录后可上传到云端共享"
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${colors.border}`,
          borderRadius: 8,
          padding: '60px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: parsing ? colors.bgFill : colors.bgContainer,
          transition: 'border-color 0.3s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d9d9d9'; }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.json,.csv,.docx,.md"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        {parsing ? (
          <Text type="secondary">{isDocx ? 'AI 格式整理中...' : '正在解析文件...'}</Text>
        ) : (
          <>
            <InboxOutlined style={{ fontSize: 48, color: colors.textMuted, display: 'block', marginBottom: 8 }} />
            <Text>点击选择文件</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 13 }}>
              支持格式: .txt .json .csv .docx .md（单文件不超过 1MB）
            </Text>
          </>
        )}
      </div>

      {fileName && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          {isDocx && <Tag color="green" style={{ marginRight: 4 }}>AI 导入</Tag>}
          已选择文件: {fileName}
        </Text>
      )}

      {parseError && (
        <Alert
          message={parseError}
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          closable
          onClose={() => setParseError('')}
        />
      )}

      <div style={{ marginTop: 16 }}>
        {parsed.length > 0 ? (
          <>
            <Text strong>预览 (共 {parsed.length} 题):</Text>
            <Table
              dataSource={parsed}
              columns={columns}
              rowKey={(_, i) => String(i)}
              size="small"
              pagination={false}
              scroll={{ y: 250 }}
              style={{ marginTop: 8 }}
            />
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: colors.textMuted }}>
            <UploadOutlined style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
            <Text type="secondary">上传文件后预览</Text>
          </div>
        )}
      </div>
    </Modal>
  );
}
