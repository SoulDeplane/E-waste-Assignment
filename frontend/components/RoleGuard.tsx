'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, dashboardPath } from '@/lib/auth';
import type { Role } from '@/lib/types';

// Wraps a page and only renders its children when the signed-in user has the required role.
export default function RoleGuard({
  role,
  children
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (u.role !== role) {
      router.replace(dashboardPath(u.role));
      return;
    }
    setOk(true);
  }, [role, router]);

  if (!ok) return <div className="center muted">Loading...</div>;
  return <>{children}</>;
}
