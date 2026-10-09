import { NextResponse } from 'next/server';
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const configured = url.startsWith('https://') && !url.includes('YOUR_') && key.length > 20 && !key.startsWith('YOUR_');
  return NextResponse.json({ name: 'Starflow', status: configured ? 'configured' : 'setup_required' }, {headers:{'Cache-Control':'no-store'}});
}
