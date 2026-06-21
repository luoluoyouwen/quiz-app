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
  multi: { label: '多选题', color: 'cyan' },
  fill: { label: '填空题', color: 'orange' },
  judge: { label: '判断题', color: 'purple' },
  essay: { label: '简答题', color: 'green' },
  nofill: { label: '无空填空题', color: 'gold' },
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
            const label = String.fromCharCode(65 + idx);
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

      {question.type === 'multi' && question.options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {question.options.map((opt, idx) => {
            const label = String.fromCharCode(65 + idx);
            const userAnswerStr = userAnswer || '';
            const isSelected = userAnswerStr.toUpperCase().includes(label);
            const isCorrectOpt = question.answer.toUpperCase().includes(label);
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
          {showAnswer && (
            <div style={{ marginTop: 8 }}>
              <Text strong>正确答案: </Text>
              <Text style={{ color: '#52c41a' }}>{question.answer.split('').map(l => `${l}`).join(', ')}</Text>
            </div>
          )}
        </div>
      )}

      {showAnswer && question.type === 'fill' && (
        <div style={{ marginTop: 8 }}>
          <Text strong>你的答案: </Text>
          <Text style={{ color: isCorrect ? '#52c41a' : '#ff4d4f' }}>{userAnswer || '(未作答)'}</Text>
          {!isCorrect && question.answers && question.answers.length > 1 && (
            <>
              <br />
              <Text strong>正确: </Text>
              <Text style={{ color: '#52c41a' }}>{question.answers.join('、')}</Text>
            </>
          )}
          {!isCorrect && (!question.answers || question.answers.length <= 1) && (
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

      {showAnswer && question.type === 'essay' && (
        <div style={{ marginTop: 8 }}>
          <Text strong>你的答案: </Text>
          <Text style={{ color: '#ff4d4f' }}>{userAnswer || '(未作答)'}</Text>
          <br />
          <Text strong>参考回答: </Text>
          <Text style={{ color: '#52c41a', whiteSpace: 'pre-wrap' }}>{question.answer}</Text>
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
