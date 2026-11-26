import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY (see .env)');
}

export const supabase = createClient(url, key, {
  auth: {
    // The browser keeps the session itself; phones need explicit storage.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  company_name: string | null;
  position: string | null;
  department: string | null;
  phone: string | null;
  profile_complete: boolean;
};

export type Company = { id: string; name: string };

export type CompanyRole = 'owner' | 'admin' | 'member' | 'guest';

export type Project = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  restrict_to_subgroups: boolean;
  edited_at: string | null;
};

/** A group (no parent) or a team (parent is a group). */
export type Subgroup = {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color: string | null;
};
