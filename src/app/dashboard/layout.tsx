import { requireOrganiser } from '@/lib/auth';
import Header from '@/components/Header';
import AccessDenied from '@/components/AccessDenied';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, authorized } = await requireOrganiser();

  if (!authorized) {
    return (
      <>
        <Header email={user.email} />
        <AccessDenied />
      </>
    );
  }

  return (
    <>
      <Header email={user.email} />
      {children}
    </>
  );
}
