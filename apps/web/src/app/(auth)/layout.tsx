import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { Card } from '@/components/ui/card';

/** Frame for the public authentication pages: brand and one centered card, single column from 360 px up. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo className="h-10" />
      <Card>{children}</Card>
    </main>
  );
}
