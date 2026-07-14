import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Typography } from 'antd';

const { Text } = Typography;

export interface ChartDataPoint {
  label: string;
  score: number;
  correct: number;
  total: number;
  date: Date;
}

interface Props {
  data: ChartDataPoint[];
}

export default function StatsChart({ data }: Props) {

  if (data.length === 0) {
    return (
      <div className="stats-chart-empty">
        <Text type="secondary">开始练习后这里会显示成绩趋势</Text>
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <div className="stats-chart-empty is-compact">
        <Text type="secondary">再刷一组，积累数据后显示趋势</Text>
      </div>
    );
  }

  return (
    <div className="stats-chart-canvas">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 960, height: 200 }}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border, #f0f0f0)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #999)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary, #999)' }}
            tickFormatter={(v: number) => String(v) + '%'}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 8,
              border: '1px solid var(--app-border, #d9d9d9)',
              background: 'var(--app-surface-solid, #fff)',
              color: 'var(--color-text, #111827)',
              boxShadow: 'var(--app-shadow-soft, 0 8px 24px rgba(0,0,0,0.08))',
            }}
            labelStyle={{ color: 'var(--color-text, #111827)' }}
            formatter={(value: unknown) => {
              const point = data.find(d => d.score === value);
              if (point) {
                return String(value) + '% (' + point.correct + '/' + point.total + ')';
              }
              return String(value) + '%';
            }}
            labelFormatter={(label: unknown) => '时间：' + String(label ?? '')}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--app-primary, #1677ff)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--app-primary, #1677ff)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
