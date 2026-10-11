import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Supabase PKCE exchange requires the browser that initiated signup.
// Email links must instead use TokenHash so QQ/163/Gmail mail apps can
// verify on a different browser without looking for the old code verifier.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  // Never include the single-use token in follow-up URLs or error messages.
  const errorResponse = () => {
    const response = NextResponse.redirect(new URL('/auth/email-error', requestUrl.origin), { status: 303 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };

  if (!tokenHash || !['email', 'recovery'].includes(type ?? '')) return errorResponse();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return errorResponse();

  // Email confirmation enters Starflow; recovery enters password-change.
  const destination = new URL(type === 'recovery' ? '/auth/reset' : '/auth/verified', requestUrl.origin);
  const response = NextResponse.redirect(destination, { status: 303 });
  response.headers.set('Cache-Control', 'no-store');

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
        // Persist newly issued auth cookies in the actual redirect response.
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type === 'recovery' ? 'recovery' : 'email',
    });
    if (error || !data.session) return errorResponse();
    return response;
  } catch {
    return errorResponse();
  }
}
