import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** Auth is optional: without keys the app runs open, with no sign-in screen. */
export const authEnabled = Boolean(url && key);

export const supabase = authEnabled
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export interface Account {
  username: string;
  email: string | null;
  plan: 'free' | 'monthly' | 'quarterly' | 'lifetime';
  expiresAt: string | null;
  active: boolean;
}

export async function currentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function loadAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_account');
  if (error || !Array.isArray(data) || !data.length) return null;
  const row = data[0] as {
    username: string;
    email: string | null;
    plan: Account['plan'];
    expires_at: string | null;
    active: boolean;
  };
  return {
    username: row.username,
    email: row.email,
    plan: row.plan,
    expiresAt: row.expires_at,
    active: row.active,
  };
}

export async function signUp(email: string, password: string, username: string) {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw new Error(friendly(error.message));
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
}

export async function sendReset(email: string) {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Accounts are not configured.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** Supabase messages are written for developers. These are for people. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That email and password do not match an account.';
  if (m.includes('already registered')) return 'An account already uses that email. Try signing in.';
  if (m.includes('password should be')) return 'Use a password of at least 6 characters.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('email not confirmed')) return 'Check your inbox and confirm your email first.';
  return message;
}
