import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { EmailOtpType } from '@supabase/supabase-js';

/** The typed client returned by the browser and server factories. */
export type DomusSupabaseClient = SupabaseClient<Database>;
