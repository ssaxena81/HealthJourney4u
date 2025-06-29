// [2025-06-29] COMMENT: This route has been moved to /api/auth/googlefit/callbackflowname/route.ts to align with the user's interpretation of the Google OAuth error message. This file is now intentionally left blank to prevent routing conflicts.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'This callback endpoint has been moved.' }, { status: 404 });
}
