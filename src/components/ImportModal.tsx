import { useState, useCallback } from 'react';
import { Modal, Upload, Table, Select, Button, message, Typography, Empty, Space, Tag } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { db, type QuestionBank } from '../db';
import { detectFormat } from '../utils/parsers';
import type { QuestionInput } from '../utils/parsers';
import { useLiveQuery } from 'dexie-react-hooks';

const { Dragger } = Upload;
const { Text } = Typography;

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  bankId?: number; // optional, pre-select a bank
}

export default function ImportModal({ open, onClose, bankId }: ImportModalProps) {
  const [parsed, setParsed] = useState<QuestionInput[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | undefined>(bankId);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');

  const banks = useLiveQuery(() => db.banks.toArray());

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = await detectFormat(file, text);
      if (result.questions.length === 0) {
        message.warning('未能从文件中解析出任何题目');
        return;
      }
      setParsed(result.questions);
      message.success(`成功解析 ${result.questions.length} 题`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '解析失败';
      message.error(msg);
    }
    return false; // prevent default upload
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
        explanation: q.explanation,
      }));
      await db.questions.bulkAdd(toAdd);
      message.success(`成功导入 ${toAdd.length} 题`);
      setParsed([]);
      setFileName('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导入失败';
      message.error(msg);
    } finally {
      setImporting(false);
    }
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
        const colors: Record<string, string> = { choice: 'blue', fill: 'orange', judge: 'purple' };
        const labels: Record<string, string> = { choice: '选择', fill: '填空', judge: '判断' };
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
      width: 100,
      ellipsis: true,
    },
  ];

  const handleClose = () => {
    setParsed([]);
    setFileName('');
    onClose();
  };

  return (
    <Modal
      title="导入题目"
      open={open}
      onCancel={handleClose}
      width={720}
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
        />
      </div>

      <Dragger
        accept=".txt,.json,.csv,.docx,.md"
        beforeUpload={handleFile}
        showUploadList={false}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
        <p className="ant-upload-hint">
          支持格式: .txt .json .csv .docx .md
        </p>
      </Dragger>

      {fileName && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          已选择文件: {fileName}
        </Text>
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
          <Empty description="上传文件后预览" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </Modal>
  );
}
