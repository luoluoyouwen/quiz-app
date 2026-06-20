import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Card, Button, Progress, Typography, Radio, Checkbox, Input, Space, Tag, Result, message, Modal,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined, ReloadOutlined,
  OrderedListOutlined,
} from '@ant-design/icons';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuizSession } from '../hooks/useQuizSession';
import { checkAnswer } from '../utils/quiz/engine';
import QuestionCard from '../components/QuestionCard';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function Practice() {
  const { bankId } = useParams<{ bankId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const typeParam = (location.state as { type?: string })?.type || 'all';

  const bank = useLiveQuery(() => db.banks.get(Number(bankId)), [bankId]);
  const allQuestions = useLiveQuery(
    () => db.questions.where('bankId').equals(Number(bankId)).toArray(),
    [bankId],
  );

  const {
    session, currentIndex, sessionDone,
    userAnswers, submitted,
    totalQuestions, currentQuestion,
    handleAnswer, handleSubmit, handleNext, handlePrev, goToQuestion, handleRestart,
  } = useQuizSession(bankId || '', allQuestions, typeParam);

  // Question grid / navigation
  const [gridOpen, setGridOpen] = useState(false);

  // Touch swipe handlers
  const touchStartRef = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    const threshold = 60;
    if (diff > threshold && currentIndex > 0) {
      handlePrev();
    } else if (diff < -threshold && currentIndex < totalQuestions - 1) {
      handleNext();
    }
    touchStartRef.current = null;
  }, [currentIndex, totalQuestions, handleNext, handlePrev]);

  // Essay flashcard state (not affected by swipe)
  const [answerRevealed, setAnswerRevealed] = useState(false);
  useEffect(() => { setAnswerRevealed(false); }, [currentIndex]);

  // 背题模式 toggle — all question types show flashcard UI
  const [flashcardMode, setFlashcardMode] = useState(false);

  // ── Results View ──

  if (sessionDone && bank) {
    const correctCount = session!.questions.filter(
      (q, i) => checkAnswer(q, userAnswers[i] || '').correct,
    ).length;
    const wrongQuestions = session!.questions
      .map((q, i) => ({
        question: q,
        userAnswer: userAnswers[i] || '',
        isCorrect: checkAnswer(q, userAnswers[i] || '').correct,
        index: i,
      }))
      .filter((r) => !r.isCorrect);
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <Result
          status={accuracy >= 80 ? 'success' : accuracy >= 50 ? 'warning' : 'error'}
          title={`练习完成！正确率 ${accuracy}%`}
          subTitle={`${totalQuestions} 题，正确 ${correctCount} 题，错误 ${totalQuestions - correctCount} 题`}
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRestart}>重新刷题</Button>
              <Button onClick={() => navigate(`/bank/${bankId}`)}>返回题库</Button>
            </Space>
          }
        />
        {wrongQuestions.length > 0 && (
          <Card title={`错题回顾 (${wrongQuestions.length} 题)`} style={{ marginTop: 16 }}>
            {wrongQuestions.map((r) => (
              <QuestionCard
                key={r.question.id}
                question={r.question}
                showAnswer
                userAnswer={r.userAnswer}
                isCorrect={false}
              />
            ))}
          </Card>
        )}
      </div>
    );
  }

  // ── Loading / Empty ──

  if (!bank || !allQuestions || !session) {
    return <div style={{ padding: 24 }}><Card loading /></div>;
  }

  if (totalQuestions === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Result
          status="info"
          title="暂无题目"
          subTitle="该题库中没有符合条件的题目"
          extra={<Button onClick={() => navigate(`/bank/${bankId}`)}>返回题库</Button>}
        />
      </div>
    );
  }

  // ── Practice View ──

  const isSubmitted = submitted[currentIndex];
  const userAnswer = userAnswers[currentIndex] || '';
  const checkResult = isSubmitted && currentQuestion ? checkAnswer(currentQuestion, userAnswer) : null;
  const isCorrect = checkResult?.correct;

  const handleSubmitClick = () => {
    if (!userAnswers[currentIndex] && userAnswers[currentIndex] !== '') {
      message.warning('请先作答');
      return;
    }
    handleSubmit();
  };

  return (
    <div
      style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/bank/${bankId}`)} />
        <Title level={4} style={{ margin: 0, flex: 1 }}>{bank.name}</Title>
        <Button
          size="small"
          type={flashcardMode ? 'primary' : 'default'}
          onClick={() => { setFlashcardMode(!flashcardMode); setAnswerRevealed(false); }}
        >
          {flashcardMode ? '📖 背题中' : '📖 背题'}
        </Button>
      </div>

      {/* Progress */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong>进度</Text>
          <Text type="secondary">{currentIndex + 1} / {totalQuestions}</Text>
        </div>
        <Progress
          percent={Math.round(((currentIndex + 1) / totalQuestions) * 100)}
          showInfo={false}
          strokeColor="#1677ff"
        />
      </Card>

      {/* Question Card */}
      <Card style={{ marginBottom: 16 }}>
        {currentQuestion && (
          <div style={{ marginBottom: 12 }}>
            <Tag color={
              currentQuestion.type === 'choice' ? 'blue' :
              currentQuestion.type === 'multi' ? 'cyan' :
              currentQuestion.type === 'fill' ? 'orange' :
              currentQuestion.type === 'judge' ? 'purple' :
              'green'
            }>
              {currentQuestion.type === 'choice' ? '选择题' :
               currentQuestion.type === 'multi' ? '多选题' :
               currentQuestion.type === 'fill' ? '填空题' :
               currentQuestion.type === 'judge' ? '判断题' : '问答题'}
            </Tag>
            {currentQuestion.type === 'multi' && (
              <Tag color="cyan">可多选</Tag>
            )}
          </div>
        )}

        <Title level={5} style={{ whiteSpace: 'pre-wrap', marginBottom: 20 }}>
          {currentQuestion?.content}
        </Title>

        {/* ── Flashcard Mode (背题模式 — all types) ── */}
        {flashcardMode ? (
          <div>
            {!answerRevealed ? (
              <Button
                type="primary"
                size="large"
                onClick={() => setAnswerRevealed(true)}
                style={{ width: '100%', height: 48, fontSize: 16, marginTop: 8 }}
              >
                显示答案
              </Button>
            ) : (
              <div>
                <Card
                  size="small"
                  style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}
                >
                  <Text strong style={{ fontSize: 15 }}>参考答案：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    <Text>
                      {currentQuestion?.type === 'judge'
                        ? (currentQuestion?.answer === 'true' || currentQuestion?.answer === '对' ? '✅ 对' : '❌ 错')
                        : currentQuestion?.answer}
                    </Text>
                  </div>
                  {currentQuestion?.explanation && (
                    <div style={{ marginTop: 12, padding: 8, background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
                      <Text type="secondary">
                        <Text strong>解析: </Text>
                        {currentQuestion.explanation}
                      </Text>
                    </div>
                  )}
                </Card>
                <Space size="large" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: '#f6ffed', border: '2px solid #52c41a',
                      color: '#52c41a',
                    }}
                    onClick={() => {
                      handleAnswer('__remembered__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CheckCircleOutlined />}
                  >
                    记住了
                  </Button>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: '#fff1f0', border: '2px solid #ff4d4f',
                      color: '#ff4d4f',
                    }}
                    onClick={() => {
                      handleAnswer('__forgot__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CloseCircleOutlined />}
                  >
                    没记住
                  </Button>
                </Space>
              </div>
            )}
          </div>
        ) : (
          <>
        {/* Choice */}
        {currentQuestion?.type === 'choice' && currentQuestion.options && (
          <Radio.Group
            value={userAnswer}
            onChange={(e) => handleAnswer(e.target.value)}
            disabled={isSubmitted}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {currentQuestion.options.map((opt, idx) => {
                const label = String.fromCharCode(65 + idx);
                const isOptCorrect = isSubmitted && currentQuestion.answer.toLowerCase() === label.toLowerCase();
                const isOptWrong = isSubmitted && userAnswer.toLowerCase() === label.toLowerCase() && !isOptCorrect;
                return (
                  <div
                    key={label}
                    style={{
                      padding: '10px 12px',
                      border: `1px solid ${
                        isOptCorrect ? '#52c41a' : isOptWrong ? '#ff4d4f' : '#d9d9d9'
                      }`,
                      borderRadius: 8,
                      background: isOptCorrect ? '#f6ffed' : isOptWrong ? '#fff1f0' : '#fff',
                      cursor: isSubmitted ? 'default' : 'pointer',
                    }}
                  >
                    <Radio value={label}>
                      <Text strong>{label}.</Text> {opt}
                    </Radio>
                  </div>
                );
              })}
            </Space>
          </Radio.Group>
        )}

        {/* Multi Choice */}
        {currentQuestion?.type === 'multi' && currentQuestion.options && (
          <Checkbox.Group
            value={userAnswer ? userAnswer.split('').filter(Boolean) : []}
            onChange={(checkedValues) => {
              handleAnswer((checkedValues as string[]).sort().join(''));
            }}
            disabled={isSubmitted}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {currentQuestion.options.map((opt, idx) => {
                const label = String.fromCharCode(65 + idx);
                const isOptCorrect = isSubmitted && currentQuestion.answer.toUpperCase().includes(label);
                const isOptWrong = isSubmitted && !currentQuestion.answer.toUpperCase().includes(label) && (userAnswer || '').toUpperCase().includes(label);
                return (
                  <div
                    key={label}
                    style={{
                      padding: '10px 12px',
                      border: `1px solid ${
                        isOptCorrect ? '#52c41a' : isOptWrong ? '#ff4d4f' : '#d9d9d9'
                      }`,
                      borderRadius: 8,
                      background: isOptCorrect ? '#f6ffed' : isOptWrong ? '#fff1f0' : '#fff',
                      cursor: isSubmitted ? 'default' : 'pointer',
                    }}
                  >
                    <Checkbox value={label}>
                      <Text strong>{label}.</Text> {opt}
                    </Checkbox>
                  </div>
                );
              })}
            </Space>
          </Checkbox.Group>
        )}

        {/* Fill */}
        {currentQuestion?.type === 'fill' && (
          <div>
            {currentQuestion.answers && currentQuestion.answers.length > 1 ? (
              // Multi-blank: show one input per blank
              <Space direction="vertical" style={{ width: '100%' }}>
                {currentQuestion.answers.map((_, idx) => {
                  const blankAnswers = userAnswer ? userAnswer.split('||') : [];
                  return (
                    <Input
                      key={idx}
                      placeholder={`第 ${idx + 1} 空`}
                      value={blankAnswers[idx] || ''}
                      onChange={(e) => {
                        const newBlankAnswers = userAnswer ? userAnswer.split('||') : [];
                        newBlankAnswers[idx] = e.target.value;
                        handleAnswer(newBlankAnswers.join('||'));
                      }}
                      disabled={isSubmitted}
                      suffix={<Text type="secondary">{idx + 1}/{currentQuestion.answers!.length}</Text>}
                      style={{ marginBottom: 4 }}
                    />
                  );
                })}
              </Space>
            ) : (
              <TextArea
                rows={3}
                placeholder="请输入你的答案"
                value={userAnswer}
                onChange={(e) => handleAnswer(e.target.value)}
                disabled={isSubmitted}
                style={{ marginBottom: 12 }}
              />
            )}
          </div>
        )}

        {/* Judge */}
        {currentQuestion?.type === 'judge' && (
          <Space size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Button
              size="large"
              style={{
                width: 140, height: 80, fontSize: 20,
                border: userAnswer === 'true' ? '2px solid #52c41a' : undefined,
                background: isSubmitted && ['true', '对'].includes(currentQuestion.answer) ? '#f6ffed'
                  : userAnswer === 'true' ? '#f6ffed' : undefined,
              }}
              onClick={() => handleAnswer('true')}
              disabled={isSubmitted}
              icon={<CheckCircleOutlined />}
            >
              ✅ 对
            </Button>
            <Button
              size="large"
              style={{
                width: 140, height: 80, fontSize: 20,
                border: userAnswer === 'false' ? '2px solid #ff4d4f' : undefined,
                background: isSubmitted && ['false', '错'].includes(currentQuestion.answer) ? '#fff1f0'
                  : userAnswer === 'false' ? '#fff1f0' : undefined,
              }}
              onClick={() => handleAnswer('false')}
              disabled={isSubmitted}
              icon={<CloseCircleOutlined />}
            >
              ❌ 错
            </Button>
          </Space>
        )}

        {/* Essay question — Flashcard / 背题模式 (in normal mode, treated as flashcard) */}
        {currentQuestion?.type === 'essay' && (
          <div>
            {!answerRevealed ? (
              <Button
                type="primary"
                size="large"
                onClick={() => setAnswerRevealed(true)}
                style={{ width: '100%', height: 48, fontSize: 16, marginTop: 8 }}
              >
                显示答案
              </Button>
            ) : (
              <div>
                <Card
                  size="small"
                  style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}
                >
                  <Text strong style={{ fontSize: 15 }}>参考答案：</Text>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    <Text>{currentQuestion.answer}</Text>
                  </div>
                  {currentQuestion.explanation && (
                    <div style={{ marginTop: 12, padding: 8, background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
                      <Text type="secondary">
                        <Text strong>解析: </Text>
                        {currentQuestion.explanation}
                      </Text>
                    </div>
                  )}
                </Card>
                <Space size="large" style={{ display: 'flex', justifyContent: 'center' }}>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: '#f6ffed', border: '2px solid #52c41a',
                      color: '#52c41a',
                    }}
                    onClick={() => {
                      handleAnswer('__remembered__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CheckCircleOutlined />}
                  >
                    记住了
                  </Button>
                  <Button
                    size="large"
                    style={{
                      width: 160, height: 60, fontSize: 18,
                      background: '#fff1f0', border: '2px solid #ff4d4f',
                      color: '#ff4d4f',
                    }}
                    onClick={() => {
                      handleAnswer('__forgot__');
                      handleSubmit();
                      handleNext();
                    }}
                    icon={<CloseCircleOutlined />}
                  >
                    没记住
                  </Button>
                </Space>
              </div>
            )}
          </div>
        )}

        {/* Submit for fill */}
        {currentQuestion?.type === 'fill' && !isSubmitted && (
          <Button type="primary" onClick={handleSubmitClick} style={{ marginTop: 8 }}>
            提交答案
          </Button>
        )}
        </>
        )}
      </Card>

      {/* Result feedback */}
      {isSubmitted && currentQuestion && checkResult && !flashcardMode && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            borderLeft: `3px solid ${isCorrect ? '#52c41a' : '#ff4d4f'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {isCorrect ? (
              <>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                <Text strong style={{ color: '#52c41a' }}>回答正确!</Text>
              </>
            ) : (
              <>
                <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
                <Text strong style={{ color: '#ff4d4f' }}>回答错误</Text>
              </>
            )}
          </div>
          {!isCorrect && (
            <div style={{ marginBottom: 4 }}>
              <Text strong>正确答案: </Text>
              <Text style={{ color: '#52c41a', fontWeight: 'bold' }}>
                {currentQuestion.type === 'judge'
                  ? (checkResult.expected === '对' ? '✅ 对' : '❌ 错')
                  : checkResult.expected}
              </Text>
            </div>
          )}
          {currentQuestion.explanation && (
            <div style={{ marginTop: 4, padding: 8, background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
              <Text type="secondary">
                <Text strong>解析: </Text>
                {currentQuestion.explanation}
              </Text>
            </div>
          )}
        </Card>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {flashcardMode ? (
          answerRevealed ? null : (
            <Text type="secondary" style={{ textAlign: 'center', width: '100%' }}>
              点击「显示答案」查看参考答案
            </Text>
          )
        ) : isSubmitted ? (
          <Button type="primary" size="large" onClick={handleNext} style={{ width: '100%' }}>
            {currentIndex < totalQuestions - 1 ? '下一题' : '查看结果'}
          </Button>
        ) : (
          currentQuestion?.type !== 'fill' && currentQuestion?.type !== 'essay' && (
            <Button type="primary" size="large" onClick={handleSubmitClick} style={{ width: '100%' }}>
              提交答案
            </Button>
          )
        )}
      </div>

      {/* Question grid - floating button */}
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<OrderedListOutlined />}
        onClick={() => setGridOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 48, height: 48, zIndex: 100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      />

      {/* Question progress grid */}
      <Modal
        title="题目列表"
        open={gridOpen}
        onCancel={() => setGridOpen(false)}
        footer={null}
        width={360}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {session && session.questions.map((_, i) => {
            const ans = userAnswers[i];
            const isAnswered = ans !== undefined && ans !== '';
            const isCurrent = i === currentIndex;
            return (
              <Button
                key={i}
                size="small"
                type={isCurrent ? 'primary' : undefined}
                onClick={() => { goToQuestion(i); setGridOpen(false); }}
                style={{
                  width: 44, height: 44,
                  fontWeight: isCurrent ? 'bold' : 'normal',
                  background: isCurrent ? undefined : isAnswered ? '#f6ffed' : '#fafafa',
                  border: isCurrent ? undefined : isAnswered ? '1px solid #b7eb8f' : '1px solid #d9d9d9',
                  color: isCurrent ? '#fff' : isAnswered ? '#389e0d' : '#999',
                }}
              >
                {i + 1}
              </Button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
