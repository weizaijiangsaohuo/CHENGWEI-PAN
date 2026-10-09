/**
 * Trigger after a verified account first enters the app. The server verifies the
 * Supabase JWT again and guarantees a once-per-account send via a DB claim.
 * No email API key, SMTP password, or service-role key is exposed to browsers.
 */
import { db } from './supabase';

const attempted = new Set<string>();
export async function ensureWelcomeEmail(userId: string): Promise<void> {
  if (attempted.has(userId)) return;
  attempted.add(userId);
  try {
    // The same endpoint works for email+password accounts and Google OAuth accounts.
    const { error } = await db().functions.invoke('welcome-email', { body: {} });
    if (error) attempted.delete(userId); // May retry on a later page load.
  } catch {
    attempted.delete(userId);
  }
}
