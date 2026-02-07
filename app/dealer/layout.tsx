import { Sidebar } from '@/components/dashboard/sidebar';

export default function DealerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar role="DEALER" />
      <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

