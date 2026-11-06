import { NextResponse } from 'next/server';
import { COOKIE_ADMIN } from '@/lib/admin-auth';

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/admin', req.url), 303);
  res.cookies.delete(COOKIE_ADMIN);
  return res;
}
