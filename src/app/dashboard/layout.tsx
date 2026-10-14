import { requireDashboardUser } from '@/lib/auth';
import Header from '@/components/Header';
import AccessDenied from '@/components/AccessDenied';
import PresenceTracker from '@/components/PresenceTracker';
import SessionKeeper from '@/components/SessionKeeper';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, authorized, role } = await requireDashboardUser();

  if (!authorized || !role) {
    return (
      <>
        <Header email={user.email} userRole={null} />
        <AccessDenied />
      </>
    );
  }

  return (
    <PresenceTracker userId={user.id} role={role}>
      <SessionKeeper />
      <Header email={user.email} userRole={role} />
      {children}
    </PresenceTracker>
  );
}

