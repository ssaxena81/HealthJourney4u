
'use server';

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/clientApp'; // Use the initialized auth instance
import { z } from 'zod';

const SignUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

interface SignUpResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: string;
  details?: z.ZodError<typeof SignUpInputSchema>;
}

export async function signUpUser(values: z.infer<typeof SignUpInputSchema>): Promise<SignUpResult> {
  try {
    const validatedValues = SignUpInputSchema.parse(values);

    // Check if auth is properly initialized (not a stub)
    if (!firebaseAuth || typeof firebaseAuth.createUserWithEmailAndPassword !== 'function') {
        console.error("Firebase Auth is not initialized correctly.");
        return { success: false, error: "Authentication service is not available. Please configure Firebase." };
    }

    const userCredential = await createUserWithEmailAndPassword(
      firebaseAuth,
      validatedValues.email,
      validatedValues.password
    );
    return { success: true, userId: userCredential.user.uid };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input.', details: error.flatten() as any };
    }
    // Firebase auth errors (e.g., email-already-in-use, weak-password)
    // https://firebase.google.com/docs/auth/admin/errors
    return { success: false, error: error.message || 'Sign up failed.', errorCode: error.code };
  }
}
