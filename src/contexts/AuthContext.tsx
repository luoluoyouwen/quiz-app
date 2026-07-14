import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { debug } from "../utils/debug";
import type { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  role: 'user' | 'admin';
  can_upload: boolean;
  upload_expires_at: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  username: string;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signUp: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function extractUsername(email: string): string {
  return email.replace('@local.app', '');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // 获取 profile
  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile(data as Profile);
    }
  };

  // 登录迁移：现有未归属题库分配给当前用户
  const migrateLocalBanks = async (userId: string) => {
    try {
      const { db } = await import('../db');
      const unowned = await db.banks
        .filter(b => !b.userId || b.userId === '')
        .toArray();
      for (const bank of unowned) {
        await db.banks.update(bank.id!, { userId });
      }
      if (unowned.length > 0) {
        debug.log(`[Auth] Migrated ${unowned.length} unowned banks to user ${userId}`);
      }
    } catch {
      // 静默失败 — 迁移不是关键路径
    }
  };

  // 监听 Auth 状态
  useEffect(() => {
    let cancelled = false;

    // 安全超时：3 秒后强制结束 loading
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        debug.warn('Auth session check timeout - forcing loading=false');
        setLoading(false);
      }
    }, 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      clearTimeout(safetyTimer);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);
        migrateLocalBanks(currentUser.id);
      }
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      clearTimeout(safetyTimer);
      debug.error('getSession error:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          fetchProfile(currentUser.id);
          migrateLocalBanks(currentUser.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    const email = `${username}@local.app`;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: error.message || '登录失败，请检查网络或联系管理员' };
    return {};
  };

  const signUp = async (username: string, password: string) => {
    const email = `${username}@local.app`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });
    if (error) return { error: error.message || '注册失败，请检查网络或联系管理员' };
    // signUp 成功后触发 trigger 自动创建 profile，但需要等待几秒
    // 如果用户存在（已注册），返回提示
    if (data.user?.identities?.length === 0) {
      return { error: '该工号已注册，请直接登录' };
    }
    return {};
  };

  const signOut = async () => {
    // 清除当前用户在 IndexedDB 中的练习数据（隔离多账号）
    try {
      const { db } = await import('../db');
      if (user) {
        await db.sessions.where('userId').equals(user.id).delete();
        await db.sessionAnswers.where('userId').equals(user.id).delete();
        await db.userProgress.where('userId').equals(user.id).delete();
      }
    } catch {
      // 静默 — 清理不是关键路径
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const username = user ? extractUsername(user.email ?? '') : '';

  return (
    <AuthContext.Provider
      value={{ user, profile, username, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
