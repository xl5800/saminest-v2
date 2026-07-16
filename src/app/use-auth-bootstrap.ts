import { useEffect } from "react";

import { getSupabaseClient } from "../integrations/supabase/client";
import { useAuthStore } from "../store/auth-store";

/**
 * Reads the current session once, then keeps the auth store in sync via a
 * single onAuthStateChange subscription for the lifetime of the app.
 */
export function useAuthBootstrap(): void {
  useEffect(() => {
    const supabase = getSupabaseClient();
    const { setSession, setInitializing } = useAuthStore.getState();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
}
