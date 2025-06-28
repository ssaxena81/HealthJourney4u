
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/serverApp';

// This is the duration of the session cookie.
// 5 days in seconds.
const expiresIn = 60 * 60 * 24 * 5;

// POST: Create a session cookie
export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idToken = authorization.split('Bearer ')[1];
  
  if (!adminAuth) {
    return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
  }

  try {
    const decodedIdToken = await adminAuth.verifyIdToken(idToken);
    
    // Ensure the token is not too old
    if (new Date().getTime() / 1000 - decodedIdToken.auth_time > expiresIn) {
      return NextResponse.json({ error: 'Recent sign-in required' }, { status: 401 });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: expiresIn * 1000 });
    
    const options = {
      name: '__session',
      value: sessionCookie,
      maxAge: expiresIn,
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const, // Use 'lax' for better cross-site compatibility
    };
    
    cookies().set(options);
    
    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('Error creating session cookie:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 401 });
  }
}

// DELETE: Clear the session cookie
export async function DELETE(request: NextRequest) {
  try {
    cookies().delete('__session');
    return NextResponse.json({ status: 'success' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting session cookie:', error);
    return NextResponse.json({ error: 'Failed to clear session' }, { status: 500 });
  }
}
