import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '@/lib/env';

type CookieToSet = {
  name: string;
  value: string;
  options?: Partial<ResponseCookie>;
};

/** Cliente com a identidade do usuário logado (RLS aplicada). */
export function createSupabaseServer() {
  const store = cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },

        setAll(list: CookieToSet[]) {
          try {
            list.forEach(({ name, value, options }) => {
              store.set(name, value, options);
            });
          } catch {
            // Em Server Components, o middleware renova os cookies.
          }
        },
      },
    }
  );
}
