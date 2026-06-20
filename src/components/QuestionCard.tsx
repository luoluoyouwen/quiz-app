import { Card, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { Question } from '../db';

const { Text, Paragraph } = Typography;

interface QuestionCardProps {
  question: Question;
  showAnswer?: boolean;
  userAnswer?: string;
  isCorrect?: boolean;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  choice: { label: '选择题', color: 'blue' },
  fill: { label: '填空题', color: 'orange' },
  judge: { label: '判断题', color: 'purple' },
};

export default function QuestionCard({ question, showAnswer, userAnswer, isCorrect }: QuestionCardProps) {
  const typeInfo = typeLabels[question.type] || { label: question.type, color: 'default' };

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, borderLeft: isCorrect === undefined ? undefined : isCorrect ? '3px solid #52c41a' : '3px solid #ff4d4f' }}
    >
      <div style={{ marginBottom: 8 }}>
        <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
        {isCorrect === true && (
          <Tag color="success" icon={<CheckCircleOutlined />}>正确</Tag>
        )}
        {isCorrect === false && (
          <Tag color="error" icon={<CloseCircleOutlined />}>错误</Tag>
        )}
      </div>

      <Paragraph style={{ marginBottom: 8, whiteSpace: 'pre-wrap', fontSize: 15 }}>
        {question.content}
      </Paragraph>

      {question.type === 'choice' && question.options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {question.options.map((opt, idx) => {
            const label = String.fromCharCode(65 + idx); // A, B, C, D
            const isSelected = userAnswer?.toLowerCase() === label.toLowerCase();
            const isCorrectOpt = question.answer.toLowerCase() === label.toLowerCase();
            let style: React.CSSProperties = {};
            if (showAnswer) {
              if (isCorrectOpt) style = { ...style, background: '#f6ffed', color: '#52c41a', fontWeight: 'bold' };
              if (isSelected && !isCorrectOpt) style = { ...style, background: '#fff1f0', color: '#ff4d4f' };
            } else if (isSelected) {
              style = { ...style, background: '#e6f4ff' };
            }
            return (
              <div key={label} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', ...style }}>
                <Text strong>{label}.</Text> {opt}
              </div>
            );
          })}
        </div>
      )}

      {showAnswer && question.type === 'fill' && (
        <div style={{ marginTop: 8 }}>
          <Text strong>你的答案: </Text>
          <Text style={{ color: isCorrect ? '#52c41a' : '#ff4d4f' }}>{userAnswer || '(未作答)'}</Text>
          {!isCorrect && (
            <>
              <br />
              <Text strong>正确答案: </Text>
              <Text style={{ color: '#52c41a' }}>{question.answer}</Text>
            </>
          )}
        </div>
      )}

      {showAnswer && question.type === 'judge' && (
        <div style={{ marginTop: 8 }}>
          <Text strong>你的答案: </Text>
          <Text style={{ color: isCorrect ? '#52c41a' : '#ff4d4f' }}>
            {userAnswer === 'true' ? '✅ 对' : userAnswer === 'false' ? '❌ 错' : '(未作答)'}
          </Text>
          {!isCorrect && (
            <>
              <br />
              <Text strong>正确答案: </Text>
              <Text style={{ color: '#52c41a' }}>{question.answer === 'true' ? '✅ 对' : '❌ 错'}</Text>
            </>
          )}
        </div>
      )}

      {showAnswer && question.explanation && (
        <div style={{ marginTop: 8, padding: 8, background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
          <Text type="secondary">
            <Text strong>解析: </Text>
            {question.explanation}
          </Text>
        </div>
      )}
    </Card>
  );
}
