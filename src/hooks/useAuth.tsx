
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile } from '@/types';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfile?: (profile: UserProfile | null) => void; // For manual profile updates from other parts of app
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const initialLogTimestamp = useMemo(() => new Date().toISOString(), []);
  console.log(`[AuthProvider BODY START] Timestamp: ${initialLogTimestamp}`);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true); // Crucially, start as true

  console.log(`  [AuthProvider State Init @ ${initialLogTimestamp}] User: ${user?.uid || 'null'}, Loading: ${loading}. firebaseAuthInstance available: ${!!firebaseAuthInstance}`);

  const fetchUserProfile = useCallback(async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
    const fetchProfileTimestamp = new Date().toISOString();
    console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Called for UID: ${fbUser.uid}. DB available: ${!!db}`);
    if (!db) {
      console.error("    [AuthProvider fetchUserProfile] Firestore 'db' instance is not available. Cannot fetch profile.");
      return null;
    }
    try {
      const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
      if (profileSnap.exists()) {
        const profileData = profileSnap.data() as UserProfile;
        console.log(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Profile fetched for ${fbUser.uid}. Profile setup complete: ${profileData.profileSetupComplete}`);
        return profileData;
      } else {
        console.warn(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] No profile found for ${fbUser.uid}. This user might need to complete profile setup.`);
        return null;
      }
    } catch (e) {
      console.error(`    [AuthProvider fetchUserProfile @ ${fetchProfileTimestamp}] Error fetching profile for ${fbUser.uid}:`, e);
      return null;
    }
  }, []); // db is from module scope, considered stable

  useEffect(() => {
    const effectExecutionTime = new Date().toISOString();
    console.log(`[AuthProvider useEffect for onAuthStateChanged] EXECUTING EFFECT. Timestamp: ${effectExecutionTime}`);
    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] firebaseAuthInstance in effect: ${!!firebaseAuthInstance}`);

    if (!firebaseAuthInstance) {
      console.warn(`  [AuthProvider useEffect @ ${effectExecutionTime}] Firebase Auth instance not available at effect execution. Setting loading to false to prevent perpetual loading state.`);
      setLoading(false); 
      return;
    }

    // setLoading(true) here ensures that even the initial check is considered a loading phase.
    // This was already the default state, but being explicit can help reasoning.
    // If setLoading(true) is here, it might cause a quick true -> false -> true flicker if onAuthStateChanged is fast.
    // The initial state of `loading` being `true` should cover this.

    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] Subscribing to onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      const callbackTime = new Date().toISOString();
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK START] Received fbUser UID: ${fbUser?.uid || 'null'}. Timestamp: ${callbackTime}`);
      
      // This setLoading(true) is critical for subsequent auth changes (login/logout after initial load)
      setLoading(true); 
      console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Set loading to TRUE.`);

      if (fbUser) {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User IS PRESENT (UID: ${fbUser.uid}). Setting user state.`);
        setUser(fbUser);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] Attempting to fetch profile...`);
        const profile = await fetchUserProfile(fbUser);
        setUserProfileState(profile);
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User profile state set. Profile found: ${!!profile}. Current User state (after setUser): ${fbUser.uid}`);
      } else {
        console.log(`    [AuthProvider onAuthStateChanged @ ${callbackTime}] User IS NULL. Clearing user and userProfile states.`);
        setUser(null);
        setUserProfileState(null);
      }
      
      setLoading(false);
      console.log(`  [AuthProvider onAuthStateChanged CALLBACK END @ ${new Date().toISOString()}] Set loading to FALSE. Final context state - User: ${fbUser?.uid || 'null'}, Profile: ${!!userProfileState}, Loading: false`);
    });

    console.log(`  [AuthProvider useEffect @ ${effectExecutionTime}] Listener SUBSCRIBED.`);
    
    return () => {
      const cleanupTime = new Date().toISOString();
      console.log(`[AuthProvider useEffect for onAuthStateChanged] CLEANING UP LISTENER. Timestamp: ${cleanupTime}`);
      unsubscribe();
    };
  // Using an empty dependency array to ensure this effect runs only once on mount
  // and the listener is cleaned up on unmount.
  }, [fetchUserProfile]); // fetchUserProfile is memoized, so this should effectively run once.

  const contextLogout = useCallback(async () => {
    const logoutStartTime = new Date().toISOString();
    console.log(`[AuthProvider contextLogout @ ${logoutStartTime}] Called.`);
    if (firebaseAuthInstance) {
      try {
        setLoading(true); 
        console.log(`  [AuthProvider contextLogout @ ${logoutStartTime}] Attempting Firebase signOut...`);
        await signOut(firebaseAuthInstance);
        // onAuthStateChanged will handle setting user to null and then setLoading(false)
        console.log(`  [AuthProvider contextLogout @ ${new Date().toISOString()}] signOut successful. onAuthStateChanged will update context.`);
      } catch (error) {
        console.error("  [AuthProvider contextLogout] Error signing out:", error);
        setUser(null);
        setUserProfileState(null);
        setLoading(false); // Ensure loading is false if signOut or onAuthStateChanged fails
      }
    } else {
      console.error("  [AuthProvider contextLogout] Firebase Auth instance not available for logout.");
      setUser(null);
      setUserProfileState(null);
      setLoading(false);
    }
  }, []); // firebaseAuthInstance is stable

  // Callback to allow other parts of the app to update the profile in the context
  const contextSetUserProfile = useCallback((profile: UserProfile | null) => {
    console.log("[AuthProvider contextSetUserProfile] Manually updating profile in context:", profile);
    setUserProfileState(profile);
  }, []);

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
    setUserProfile: contextSetUserProfile,
  }), [user, userProfile, loading, contextLogout, contextSetUserProfile]);

  const renderLogTimestamp = useMemo(() => new Date().toISOString(), [user, userProfile, loading]);
  console.log(`[AuthProvider RENDER/Memo @ ${renderLogTimestamp}] Context: User UID: ${contextValue.user?.uid || 'null'}, Loading: ${contextValue.loading}, Profile ID: ${contextValue.userProfile?.id || 'null'}`);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

    