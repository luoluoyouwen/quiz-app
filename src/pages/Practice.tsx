import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Card, Button, Progress, Typography, Radio, Input, Space, Tag, Result, message,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { db, type QuestionType } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateSession, checkAnswer } from '../utils/quiz/engine';
import type { QuizSession } from '../utils/quiz/engine';
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

  const [session, setSession] = useState<QuizSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});
  const [sessionDone, setSessionDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [answerTime, setAnswerTime] = useState<Record<number, number>>({});
  const questionStartRef = useRef(Date.now());

  // Generate session when questions load
  useEffect(() => {
    if (!allQuestions || allQuestions.length === 0) return;
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all');
    setSession(quizSession);
    setCurrentIndex(0);
    setUserAnswers({});
    setSubmitted({});
    setSessionDone(false);
    setAnswerTime({});
    questionStartRef.current = Date.now();
  }, [allQuestions, bankId, typeParam]);

  const sessionQuestions = session?.questions ?? [];
  const currentQuestion = sessionQuestions[currentIndex] ?? null;
  const totalQuestions = sessionQuestions.length;

  const handleAnswer = useCallback((value: string) => {
    if (submitted[currentIndex]) return;
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: value }));
    setAnswerTime((prev) => ({ ...prev, [currentIndex]: Date.now() - questionStartRef.current }));
  }, [currentIndex, submitted]);

  const handleSubmit = useCallback(() => {
    if (!userAnswers[currentIndex] && userAnswers[currentIndex] !== '') {
      message.warning('请先作答');
      return;
    }
    setSubmitted((prev) => ({ ...prev, [currentIndex]: true }));
  }, [currentIndex, userAnswers]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      questionStartRef.current = Date.now();
    } else {
      setSessionDone(true);
    }
  }, [currentIndex, totalQuestions]);

  const handleRestart = () => {
    if (!allQuestions) return;
    const quizSession = generateSession(Number(bankId), allQuestions, typeParam as QuestionType | 'all');
    setSession(quizSession);
    setCurrentIndex(0);
    setUserAnswers({});
    setSubmitted({});
    setSessionDone(false);
    setAnswerTime({});
    questionStartRef.current = Date.now();
  };

  // Save session results to DB
  useEffect(() => {
    if (!sessionDone || !bank || !session) return;

    const saveSession = async () => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      let correct = 0;

      for (let i = 0; i < sessionQuestions.length; i++) {
        const q = sessionQuestions[i];
        const ua = userAnswers[i] || '';
        const result = checkAnswer(q, ua);
        if (result.correct) correct++;
      }

      const sessionId = await db.sessions.add({
        bankId: Number(bankId),
        startedAt: new Date(startTime),
        endedAt: new Date(),
        totalQuestions: totalQuestions,
        correctAnswers: correct,
        wrongAnswers: totalQuestions - correct,
        score: totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0,
        duration,
      });

      if (sessionId === undefined) {
        message.error('保存练习记录失败');
        return;
      }

      await db.sessionAnswers.bulkAdd(
        sessionQuestions.map((q, i) => ({
          sessionId,
          questionId: q.id!,
          userAnswer: userAnswers[i] || '',
          isCorrect: checkAnswer(q, userAnswers[i] || '').correct,
          timeTaken: answerTime[i] || 0,
        }))
      );

      await db.banks.update(Number(bankId), { lastPracticed: new Date() });
    };

    saveSession();
  }, [sessionDone]);

  // Results view
  if (sessionDone) {
    const correctCount = sessionQuestions.filter((q, i) => checkAnswer(q, userAnswers[i] || '').correct).length;
    const wrongQuestions = sessionQuestions
      .map((q, i) => ({ question: q, userAnswer: userAnswers[i] || '', isCorrect: checkAnswer(q, userAnswers[i] || '').correct, index: i }))
      .filter((r) => !r.isCorrect);
    const duration = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
      <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
        <Result
          status={accuracy >= 80 ? 'success' : accuracy >= 50 ? 'warning' : 'error'}
          title={`练习完成！正确率 ${accuracy}%`}
          subTitle={`${totalQuestions} 题，正确 ${correctCount} 题，错误 ${totalQuestions - correctCount} 题，用时 ${minutes}分${seconds}秒`}
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

  const isSubmitted = submitted[currentIndex];
  const userAnswer = userAnswers[currentIndex] || '';
  const checkResult = isSubmitted && currentQuestion ? checkAnswer(currentQuestion, userAnswer) : null;
  const isCorrect = checkResult?.correct;

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/bank/${bankId}`)} />
        <Title level={4} style={{ margin: 0, flex: 1 }}>{bank.name}</Title>
      </div>

      {/* Progress Bar */}
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

      {/* Question */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          {currentQuestion && (
            <Tag color={
              currentQuestion.type === 'choice' ? 'blue' :
              currentQuestion.type === 'fill' ? 'orange' : 'purple'
            }>
              {currentQuestion.type === 'choice' ? '选择题' :
               currentQuestion.type === 'fill' ? '填空题' : '判断题'}
            </Tag>
          )}
        </div>

        <Title level={5} style={{ whiteSpace: 'pre-wrap', marginBottom: 20 }}>
          {currentQuestion?.content}
        </Title>

        {/* Choice question */}
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

        {/* Fill question */}
        {currentQuestion?.type === 'fill' && (
          <TextArea
            rows={3}
            placeholder="请输入你的答案"
            value={userAnswer}
            onChange={(e) => handleAnswer(e.target.value)}
            disabled={isSubmitted}
            style={{ marginBottom: 12 }}
          />
        )}

        {/* Judge question */}
        {currentQuestion?.type === 'judge' && (
          <Space size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Button
              size="large"
              style={{
                width: 140,
                height: 80,
                fontSize: 20,
                border: userAnswer === 'true' ? '2px solid #52c41a' : undefined,
                background: isSubmitted && currentQuestion.answer === 'true' ? '#f6ffed' : userAnswer === 'true' ? '#f6ffed' : undefined,
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
                width: 140,
                height: 80,
                fontSize: 20,
                border: userAnswer === 'false' ? '2px solid #ff4d4f' : undefined,
                background: isSubmitted && currentQuestion.answer === 'false' ? '#fff1f0' : userAnswer === 'false' ? '#fff1f0' : undefined,
              }}
              onClick={() => handleAnswer('false')}
              disabled={isSubmitted}
              icon={<CloseCircleOutlined />}
            >
              ❌ 错
            </Button>
          </Space>
        )}

        {/* Submit button for fill */}
        {currentQuestion?.type === 'fill' && !isSubmitted && (
          <Button type="primary" onClick={handleSubmit} style={{ marginTop: 8 }}>
            提交答案
          </Button>
        )}
      </Card>

      {/* Result feedback */}
      {isSubmitted && currentQuestion && checkResult && (
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
                  ? (checkResult.expected === 'true' ? '✅ 对' : '❌ 错')
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
        {isSubmitted ? (
          <Button type="primary" size="large" onClick={handleNext} style={{ width: '100%' }}>
            {currentIndex < totalQuestions - 1 ? '下一题' : '查看结果'}
          </Button>
        ) : (
          currentQuestion?.type !== 'fill' && (
            <Button type="primary" size="large" onClick={handleSubmit} style={{ width: '100%' }}>
              提交答案
            </Button>
          )
        )}
      </div>
    </div>
  );
}
