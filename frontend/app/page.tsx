'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, dashboardPath } from '@/lib/auth';

// Root index page that redirects to the role-appropriate dashboard or to /login when signed out.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const u = getUser();
    router.replace(u ? dashboardPath(u.role) : '/login');
  }, [router]);
  return <div className="center muted">Redirecting...</div>;
}
