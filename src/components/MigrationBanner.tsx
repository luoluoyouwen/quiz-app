import { useState, useEffect } from 'react';
import { Button, Typography, message } from 'antd';
import { CloudUploadOutlined, CloseOutlined } from '@ant-design/icons';
import { db } from '../db';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { uploadBankToSupabase, syncCloudBankToLocal } from '../lib/uploadService';

const { Text } = Typography;

interface MigrationBannerProps {
  user: User | null;
}

export default function MigrationBanner({ user }: MigrationBannerProps) {
  const [show, setShow] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    if (show) return; // 已经显示就不重复计算
    if (!user) {
      setShow(false);
      return;
    }

    const check = async () => {
      // 如果已经有迁移过的记录（localStorage 标记），跳过
      if (localStorage.getItem('cloud_migration_done')) return;

      // 检查本地有多少非云端缓存的题库（排除 ☁️ 标记的）
      const localBanks = (await db.banks.toArray())
        .filter(b => !b.description?.startsWith('☁️'));
      if (localBanks.length === 0) return;

      setLocalCount(localBanks.length);
      setShow(true);
    };

    check();
  }, [user, show]);

  const handleMigration = async () => {
    if (!user) {
      message.warning('请先登录');
      return;
    }

    setMigrating(true);
    try {
      const localBanks = await db.banks.toArray();
      let migrated = 0;

      for (const bank of localBanks) {
        const questions = await db.questions.where('bankId').equals(bank.id!).toArray();
        if (questions.length === 0) continue;

        // 检查云端是否已存在（按 name 粗略去重）
        const { data: existingBanks } = await supabase
          .from('question_banks')
          .select('id, name')
          .eq('name', bank.name);

        if (existingBanks && existingBanks.length > 0) {
          // 存在同名云端题库，检查它是否是当前用户之前迁移的
          const myBank = existingBanks.find(b => b.name === bank.name);
          if (myBank) {
            // 把云端题目同步到本地（如果本地还没有）
            const added = await syncCloudBankToLocal(myBank.id, bank.name, bank.id);
            if (added > 0) migrated++;
          }
          continue;
        }

        // 生成内容哈希（用题目 JSON）
        const contentStr = JSON.stringify(questions.map(q => ({ type: q.type, content: q.content, answer: q.answer })));
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(contentStr));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 上传到 Supabase
        await uploadBankToSupabase(
          bank.name,
          bank.description || '',
          questions.map(q => ({
            type: q.type,
            content: q.content,
            options: q.options,
            answer: q.answer,
            answers: q.answers,
            explanation: q.explanation || '',
          })),
          contentHash,
          user.id,
        );
        migrated++;
      }

      localStorage.setItem('cloud_migration_done', 'true');
      setShow(false);
      message.success(`成功迁移 ${migrated} 个题库到云端`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '迁移失败';
      message.error(msg);
    } finally {
      setMigrating(false);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    // 不设置 localStorage 标记，下次刷新仍会显示
  };

  if (!show) return null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f0f5ff 0%, #d6e4ff 100%)',
        border: '1px solid #adc6ff',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 240px', minWidth: 0 }}>
        <CloudUploadOutlined style={{ fontSize: 28, color: '#2f54eb', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ fontSize: 15, color: '#1d39c4', wordBreak: 'break-word' }}>
            检测到本地有 {localCount} 个题库尚未同步到云端
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 13, wordBreak: 'break-word' }}>
            上传后其他用户也能看到这些题库，随时随地刷题
          </Text>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          onClick={handleMigration}
          loading={migrating}
          style={{
            background: '#2f54eb',
            borderColor: '#2f54eb',
            fontWeight: 600,
          }}
        >
          {migrating ? '迁移中...' : '☁️ 迁移到云端'}
        </Button>
        <Button onClick={handleDismiss} disabled={migrating}>
          稍后再说
        </Button>
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={handleDismiss}
          disabled={migrating}
          size="small"
          style={{ opacity: 0.5 }}
        />
      </div>
    </div>
  );
}
