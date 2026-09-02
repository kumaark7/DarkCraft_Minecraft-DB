import type { ReactNode } from 'react';
import { Sidebar, MobileSidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { LayoutProvider } from './LayoutContext';

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="nethercraft-background flex min-h-screen w-full bg-background">
      <Sidebar />
      <MobileSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
        <MobileHeader />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <LayoutProvider>
      <AppLayout>{children}</AppLayout>
    </LayoutProvider>
  );
}
