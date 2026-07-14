import { Card, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { Question } from '../db';
import QuestionImage from './QuestionImage';

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
  nofill: { label: '背记题', color: 'gold' },
};

function answerClass(isAnswerCorrect?: boolean) {
  if (isAnswerCorrect === true) return 'is-correct';
  if (isAnswerCorrect === false) return 'is-wrong';
  return '';
}

function optionClass(isSelected: boolean, isCorrectOpt: boolean, showAnswer?: boolean) {
  if (showAnswer && isCorrectOpt) return 'question-card-option is-correct';
  if (showAnswer && isSelected && !isCorrectOpt) return 'question-card-option is-wrong';
  if (!showAnswer && isSelected) return 'question-card-option is-selected';
  return 'question-card-option';
}

export default function QuestionCard({ question, showAnswer, userAnswer, isCorrect }: QuestionCardProps) {
  const typeInfo = typeLabels[question.type] || { label: question.type, color: 'default' };
  const cardClass = ['question-card', answerClass(isCorrect)].filter(Boolean).join(' ');

  return (
    <Card size="small" className={cardClass}>
      <div className="question-card-tags">
        <Tag color={typeInfo.color}>{typeInfo.label}</Tag>
        {isCorrect === true && (
          <Tag color="success" icon={<CheckCircleOutlined />}>正确</Tag>
        )}
        {isCorrect === false && (
          <Tag color="error" icon={<CloseCircleOutlined />}>错误</Tag>
        )}
      </div>

      <Paragraph className="question-card-content">
        {question.content}
      </Paragraph>
      <QuestionImage image={question.image} />

      {question.type === 'choice' && question.options && (
        <div className="question-card-options">
          {question.options.map((opt, idx) => {
            const label = String.fromCharCode(65 + idx);
            const isSelected = userAnswer?.toLowerCase() === label.toLowerCase();
            const isCorrectOpt = question.answer.toLowerCase() === label.toLowerCase();
            return (
              <div key={label} className={optionClass(Boolean(isSelected), isCorrectOpt, showAnswer)}>
                <Text strong>{label}.</Text> {opt}
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'multi' && question.options && (
        <div className="question-card-options">
          {question.options.map((opt, idx) => {
            const label = String.fromCharCode(65 + idx);
            const userAnswerStr = userAnswer || '';
            const isSelected = userAnswerStr.toUpperCase().includes(label);
            const isCorrectOpt = question.answer.toUpperCase().includes(label);
            return (
              <div key={label} className={optionClass(isSelected, isCorrectOpt, showAnswer)}>
                <Text strong>{label}.</Text> {opt}
              </div>
            );
          })}
          {showAnswer && (
            <div className="question-card-answer-row">
              <Text strong>正确答案: </Text>
              <Text className="question-card-answer-correct">{question.answer.split('').join(', ')}</Text>
            </div>
          )}
        </div>
      )}

      {showAnswer && question.type === 'fill' && (
        <div className="question-card-answer-row">
          <Text strong>你的答案: </Text>
          <Text className={isCorrect ? 'question-card-answer-correct' : 'question-card-answer-wrong'}>{userAnswer || '(未作答)'}</Text>
          {!isCorrect && question.answers && question.answers.length > 1 && (
            <>
              <br />
              <Text strong>正确: </Text>
              <Text className="question-card-answer-correct">{question.answers.join('、')}</Text>
            </>
          )}
          {!isCorrect && (!question.answers || question.answers.length <= 1) && (
            <>
              <br />
              <Text strong>正确答案: </Text>
              <Text className="question-card-answer-correct">{question.answer}</Text>
            </>
          )}
        </div>
      )}

      {showAnswer && question.type === 'judge' && (
        <div className="question-card-answer-row">
          <Text strong>你的答案: </Text>
          <Text className={isCorrect ? 'question-card-answer-correct' : 'question-card-answer-wrong'}>
            {userAnswer === 'true' ? '对' : userAnswer === 'false' ? '错' : '(未作答)'}
          </Text>
          {!isCorrect && (
            <>
              <br />
              <Text strong>正确答案: </Text>
              <Text className="question-card-answer-correct">{question.answer === 'true' ? '对' : '错'}</Text>
            </>
          )}
        </div>
      )}

      {showAnswer && question.type === 'essay' && (
        <div className="question-card-answer-row">
          <Text strong>你的答案: </Text>
          <Text className="question-card-answer-wrong">{userAnswer || '(未作答)'}</Text>
          <br />
          <Text strong>参考回答: </Text>
          <Text className="question-card-answer-correct is-prewrap">{question.answer}</Text>
        </div>
      )}

      {showAnswer && question.explanation && (
        <div className="question-card-explanation">
          <Text type="secondary">
            <Text strong>解析: </Text>
            {question.explanation}
          </Text>
        </div>
      )}
    </Card>
  );
}
