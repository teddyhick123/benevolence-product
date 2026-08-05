import { createServerClient } from '@/lib/api/server-client';

/** Exchange browser tokens without exposing a session client to the route. */
export async function setServerSession(accessToken: string, refreshToken: string) {
  const db = await createServerClient();
  return db.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

/** Clear the cookie-backed server session. */
export async function clearServerSession() {
  const db = await createServerClient();
  return db.auth.signOut();
}
