'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let instance: SupabaseClient | null = null;
export function hasConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return url.startsWith('https://') && !url.includes('YOUR_') && key.length > 20 && !key.startsWith('YOUR_');
}

export function db(): SupabaseClient {
  if (!hasConfig()) throw new Error('尚未配置 Supabase：请先填写 .env.local 中的公开项目地址和 anon key');
  if (!instance) instance = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return instance;
}
