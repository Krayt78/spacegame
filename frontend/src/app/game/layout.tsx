import { ProtectedRoute } from '@/components/auth';
import { ContractConfigWarning, ErrorBoundary, NetworkGuard } from '@/components/ui';

export default function GameRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ContractConfigWarning>
        <NetworkGuard>
          <ProtectedRoute>{children}</ProtectedRoute>
        </NetworkGuard>
      </ContractConfigWarning>
    </ErrorBoundary>
  );
}
