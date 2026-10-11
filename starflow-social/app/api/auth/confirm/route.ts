import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// GET /auth/confirm is intentionally not an OTP exchange. Email scanners
// can prefetch links, so a client-driven same-origin POST consumes tokens.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const failure = () => NextResponse.json({ ok: false }, {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });

  if (!request.headers.get('content-type')?.includes('application/json')) return failure();
  let payload: { token_hash?: unknown; type?: unknown } | null = null;
  try {
    payload = await request.json() as { token_hash?: unknown; type?: unknown };
  } catch {
    return failure();
  }
  if (!payload || typeof payload.token_hash !== 'string'
      || payload.token_hash.length < 12 || payload.token_hash.length > 512
      || (payload.type !== 'email' && payload.type !== 'recovery')) return failure();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return failure();

  const destination = payload.type === 'recovery' ? '/auth/reset' : '/auth/verified';
  const response = NextResponse.json({ ok: true, next: destination }, {
    headers: { 'Cache-Control': 'no-store' },
  });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: payload.token_hash,
      type: payload.type,
    });
    if (error || !data.session) return failure();
    return response;
  } catch {
    return failure();
  }
}
