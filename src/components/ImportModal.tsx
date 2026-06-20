import { useState, useCallback, useRef } from 'react';
import { Modal, Table, Select, Button, message, Typography, Space, Tag, Alert } from 'antd';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { db, type QuestionBank } from '../db';
import { detectFormat } from '../utils/parsers';
import type { QuestionInput } from '../utils/parsers';
import { applyClozeToFillQuestions } from '../utils/cloze';
import { useLiveQuery } from 'dexie-react-hooks';

const { Text } = Typography;

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  bankId?: number;
}

export default function ImportModal({ open, onClose, bankId }: ImportModalProps) {
  const [parsed, setParsed] = useState<QuestionInput[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(bankId);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const banks = useLiveQuery(() => db.banks.toArray());

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError('');
    setParsing(true);
    setParsed([]);

    try {
      // Use FileReader for iOS compatibility (more reliable than file.text())
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

      // Auto-apply cloze to fill questions that lack visible blanks
      const clozeBefore = result.questions.filter(
        (q) => q.type === 'fill' && !/_{3,}/.test(q.content),
      ).length;
      if (clozeBefore > 0) {
        const clozeQuestions = applyClozeToFillQuestions(result.questions);
        setParsed(clozeQuestions);
        message.info(
          `已自动挖空 ${clozeBefore} 道填空题（已在内容中匹配答案替换为 ____）`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '解析失败';
      setParseError(msg);
      setFileName('');
    } finally {
      setParsing(false);
      // Reset the file input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  const handleImport = async () => {
    if (!selectedBankId) {
      message.error('请选择题库');
      return;
    }
    if (parsed.length === 0) {
      message.error('请先上传并解析文件');
      return;
    }
    setImporting(true);
    try {
      const toAdd = parsed.map((q) => ({
        bankId: selectedBankId,
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
    setParseError('');
    setParsing(false);
    // Reset file input
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
      title="导入题目"
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
            disabled={parsed.length === 0 || !selectedBankId}
          >
            导入 {parsed.length > 0 ? `(${parsed.length} 题)` : ''}
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Text strong>选择目标题库</Text>
        <Select
          style={{ width: '100%', marginTop: 4 }}
          placeholder="请选择题库"
          value={selectedBankId}
          onChange={setSelectedBankId}
          options={banks?.map((b: QuestionBank) => ({ label: b.name, value: b.id })) || []}
          notFoundContent="还没有题库，请先创建"
        />
      </div>

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #d9d9d9',
          borderRadius: 8,
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: parsing ? '#fafafa' : '#fff',
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
          <Text type="secondary">正在解析文件...</Text>
        ) : (
          <>
            <InboxOutlined style={{ fontSize: 48, color: '#999', display: 'block', marginBottom: 8 }} />
            <Text>点击选择文件</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 13 }}>
              支持格式: .txt .json .csv .docx .md
            </Text>
          </>
        )}
      </div>

      {fileName && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
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
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>
            <UploadOutlined style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
            <Text type="secondary">上传文件后预览</Text>
          </div>
        )}
      </div>
    </Modal>
  );
}
