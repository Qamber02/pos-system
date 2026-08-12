import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { supabase } from '@/integrations/supabase/client';
import { db, UserProfile } from '@/lib/db';
import { User } from '@supabase/supabase-js';

export function useUserRole() {
  const [user, setUser] = useState<User | null>(null);

  // 1. Get user from Supabase's local cache (works offline)
  // and listen for any auth changes (login/logout).
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn("Session error in useUserRole:", error);
        setUser(null);
        return;
      }
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // 2. Get the local profile from Dexie using the user's ID
  const profile = useLiveQuery(
    () => (user ? db.userProfile.get(user.id) : null),
    [user]
  );

  // 3. One-time fetch logic with fallback
  useEffect(() => {
    const fetchAndCacheProfile = async () => {
      if (user && profile === null && navigator.onLine) {
        try {
          // Fetch the role from 'user_roles' safely using maybeSingle
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle();

          const localProfile: UserProfile = {
            id: user.id,
            email: user.email,
            role: roleData?.role || 'user',
          };

          await db.userProfile.put(localProfile);
        } catch (error) {
          console.warn("Failed to fetch and cache profile, applying fallback:", error);
          try {
            await db.userProfile.put({
              id: user.id,
              email: user.email,
              role: 'user',
            });
          } catch (dbErr) {
            console.error("Dexie put error:", dbErr);
          }
        }
      }
    };

    fetchAndCacheProfile();
  }, [user, profile]);

  return {
    profile: profile || null,
    role: profile?.role || 'user',
    isAdmin: profile?.role === 'admin'
  };
}