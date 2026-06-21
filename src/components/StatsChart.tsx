import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Typography } from 'antd';
import type { Session } from '../db';

const { Text } = Typography;

interface ChartDataPoint {
  label: string;
  score: number;
  correct: number;
  total: number;
  date: Date;
}

interface Props {
  sessions: Session[];
}

function formatDate(d: Date): string {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day}`;
}

function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function StatsChart({ sessions }: Props) {
  const data: ChartDataPoint[] = useMemo(() => {
    // Take last 20 sessions, newest first, reverse to chronological
    const recent = [...sessions]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 20)
      .reverse();

    return recent.map((s) => ({
      label: `${formatDate(new Date(s.startedAt))} ${formatTime(new Date(s.startedAt))}`,
      score: s.score,
      correct: s.correctAnswers,
      total: s.totalQuestions,
      date: new Date(s.startedAt),
    }));
  }, [sessions]);

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <Text type="secondary">暂无练习数据</Text>
      </div>
    );
  }

  if (data.length === 1) {
    // Single data point: just show a simple stat card instead of a line
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <Text type="secondary">继续练习，积累更多数据后显示成绩趋势图</Text>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #f0f0f0)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #999)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #999)' }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 6,
              border: '1px solid var(--border, #d9d9d9)',
            }}
            formatter={(value: unknown) => {
              const point = data.find(d => d.score === value);
              if (point) {
                return `${value}% (${point.correct}/${point.total})`;
              }
              return `${value}%`;
            }}
            labelFormatter={(label: unknown) => `时间：${String(label ?? '')}`}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#1677ff"
            strokeWidth={2}
            dot={{ r: 3, fill: '#1677ff' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
