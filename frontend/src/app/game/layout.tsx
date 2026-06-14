import { ProtectedRoute } from '@/components/auth';
import { ContractConfigWarning, ErrorBoundary } from '@/components/ui';
import { SessionProvider } from '@/contexts/SessionContext';

export default function GameRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ContractConfigWarning>
        <ProtectedRoute>
          <SessionProvider>{children}</SessionProvider>
        </ProtectedRoute>
      </ContractConfigWarning>
    </ErrorBoundary>
  );
}
