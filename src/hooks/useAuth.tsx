
'use client';

import React, { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User as FirebaseUser, signOut } from 'firebase/auth';
import { auth as firebaseAuthInstance, db } from '@/lib/firebase/clientApp';
import type { UserProfile, AppAuthStateCookie } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { setCookie, eraseCookie, getCookie } from '@/lib/cookie-utils';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUserProfileStateOnly?: (profileUpdater: (prev: UserProfile | null) => UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfileInternal] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuthInstance) {
      console.warn("[AuthProvider] Firebase Auth instance not available. Can't set up listener.");
      setLoading(false);
      return;
    }
    
    console.log("[AuthProvider] Setting up onAuthStateChanged listener.");
    const unsubscribe = onAuthStateChanged(firebaseAuthInstance, async (fbUser) => {
      console.log(`[AuthProvider onAuthStateChanged] Fired. fbUser object is: ${fbUser ? fbUser.uid : 'null'}`);
      if (fbUser) {
        // User is signed in.
        setUser(fbUser);
        try {
          const profileSnap = await getDoc(doc(db, "users", fbUser.uid));
          if (profileSnap.exists()) {
            const profile = profileSnap.data() as UserProfile;
            setUserProfileInternal(profile);
            console.log("[AuthProvider onAuthStateChanged] User profile found and set for UID:", fbUser.uid);
            const cookieStateToSet: AppAuthStateCookie = {
              isProfileCreated: !!profile.profileSetupComplete,
              authSyncComplete: true
            };
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
          } else {
            // This case might happen if profile creation failed during signup.
            console.warn("[AuthProvider onAuthStateChanged] User is authenticated, but no profile document found for UID:", fbUser.uid);
            setUserProfileInternal(null);
            eraseCookie('app_auth_state');
          }
        } catch (error) {
            console.error("[AuthProvider onAuthStateChanged] Error fetching user profile:", error);
            setUserProfileInternal(null);
            eraseCookie('app_auth_state');
        }
      } else {
        // User is signed out.
        console.log("[AuthProvider onAuthStateChanged] User is signed out.");
        setUser(null);
        setUserProfileInternal(null);
        eraseCookie('app_auth_state');
      }
      setLoading(false);
      console.log("[AuthProvider onAuthStateChanged] Auth state processing finished. Loading set to false.");
    });

    // Cleanup subscription on unmount
    return () => {
      console.log("[AuthProvider] Cleaning up onAuthStateChanged listener.");
      unsubscribe();
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  const contextLogout = useCallback(async () => {
    setLoading(true);
    eraseCookie('app_auth_state');
    if (firebaseAuthInstance) {
      await signOut(firebaseAuthInstance);
      // onAuthStateChanged will handle setting user/profile to null and loading to false
    } else {
      console.error("[AuthProvider] Firebase Auth instance not available for logout.");
      setUser(null);
      setUserProfileInternal(null);
      setLoading(false);
    }
  }, []);

  const setUserProfileStateOnly = useCallback((updater: (prev: UserProfile | null) => UserProfile | null) => {
    setUserProfileInternal(prevUserProfile => {
        const newProfile = updater(prevUserProfile);
        if (user && newProfile) {
             const cookieStateToSet: AppAuthStateCookie = {
                isProfileCreated: !!newProfile.profileSetupComplete,
                authSyncComplete: getCookie('app_auth_state') ? JSON.parse(getCookie('app_auth_state')!).authSyncComplete : true,
            };
            setCookie('app_auth_state', JSON.stringify(cookieStateToSet), 1);
        }
        return newProfile;
    });
  }, [user]);

  const contextValue = useMemo(() => ({
    user,
    userProfile,
    loading,
    logout: contextLogout,
    setUserProfileStateOnly,
  }), [user, userProfile, loading, contextLogout, setUserProfileStateOnly]);

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

    