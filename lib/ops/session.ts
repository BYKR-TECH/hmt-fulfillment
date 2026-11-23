import 'server-only';
import { headers } from 'next/headers';
import { currentUserProfile } from '@/lib/current-user';
import { can, canAccessOpsPath, roleOf, type Permission, type Profile } from './permissions.ts';

export type OpsProfile = NonNullable<Profile> & { id?: string; name?: string | null; full_name?: string | null; email?: string | null; role?: string | null; local?: boolean };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// The old app already skips sign-in for localhost outside production
// (lib/auth-guard.js isLocalAuthBypassAllowed); mirror that so the new screens
// render during local development. Never applies in production.
async function localDeveloperProfile(): Promise<OpsProfile | null> {
  if (process.env.NODE_ENV === 'production') return null;
  const host = (await headers()).get('host') || '';
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0] || '';
  if (!LOCAL_HOSTS.has(hostname)) return null;
  return { active: true, role: 'admin', name: 'Local developer', email: 'localhost', local: true };
}

export async function getOpsProfile(): Promise<OpsProfile | null> {
  const profile = (await currentUserProfile()) as OpsProfile | null;
  return profile ?? (await localDeveloperProfile());
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = 'You do not have permission to do this.') {
    super(message);
  }
}

export async function requireOpsPermission(permission: Permission): Promise<OpsProfile> {
  const profile = await getOpsProfile();
  if (!can(profile, permission)) throw new ForbiddenError();
  return profile as OpsProfile;
}

export { can, canAccessOpsPath, roleOf };
