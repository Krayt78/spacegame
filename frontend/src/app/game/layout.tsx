import { ProtectedRoute } from '@/components/auth';
import { ContractConfigWarning, ErrorBoundary } from '@/components/ui';

export default function GameRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ContractConfigWarning>
        <ProtectedRoute>{children}</ProtectedRoute>
      </ContractConfigWarning>
    </ErrorBoundary>
  );
}
