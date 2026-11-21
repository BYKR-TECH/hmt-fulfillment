import 'server-only';
import { getOpsProfile, type OpsProfile } from './session.ts';
import { can, type Permission } from './permissions.ts';

/** Page-level check (the layout only decides whether the shell renders). */
export async function allowed(permission: Permission): Promise<OpsProfile | null> {
  const profile = await getOpsProfile();
  return can(profile, permission) ? profile : null;
}
