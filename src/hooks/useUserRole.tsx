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
    // Get the initial session from local storage (this is synchronous)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for future auth changes (e.g., login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    // Cleanup listener on unmount
    return () => subscription.unsubscribe();
  }, []); // Runs only once on mount

  // 2. Get the local profile from Dexie using the user's ID
  const profile = useLiveQuery(
    () => (user ? db.userProfile.get(user.id) : null),
    [user] // Rerun when user object changes
  );

  // 3. One-time fetch logic
  useEffect(() => {
    const fetchAndCacheProfile = async () => {
      // If we have a user, but no local profile, AND we are online...
      if (user && profile === null && navigator.onLine) {
        console.log("No local profile found. Fetching from network...");
        try {
          // Fetch the role from 'user_roles'
          const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

          if (roleError) throw roleError;

          // Create the profile object to save
          const localProfile: UserProfile = {
            id: user.id,
            email: user.email,
            role: roleData?.role || 'user',
          };

          // Save the profile to the local database
          await db.userProfile.put(localProfile);
          console.log("Local profile saved successfully.");
          
        } catch (error) {
          console.error("Failed to fetch and cache profile:", error);
        }
      }
    };

    fetchAndCacheProfile();
  }, [user, profile]); // Runs when user or profile changes

  // 4. Return the data
  // This will show "user" (the default) until the profile loads
  // or return the profile if it's already cached.
  return {
    profile: profile || null,
    role: profile?.role || 'user',
    isAdmin: profile?.role === 'admin'
  };
}