'use client';

import { useEffect, useState } from 'react';
import { useAccount } from '@/hooks/useAccount';
import { GameLayout } from '@/components/layout';
import { Card, CardHeader, CardContent } from '@/components/ui';
import { Settings, Wallet, Globe, FileCode, Copy, Check } from 'lucide-react';
import { activeChain } from '@/lib/wagmiConfig';

const nexusGameAddress = process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS || '';
const gameConfigAddress = process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS || '';
const environment = process.env.NEXT_PUBLIC_CHAIN === 'testnet' ? 'Testnet' : 'Local';
const rpcUrl = activeChain.rpcUrls.default.http[0];

function truncateAddress(address: string) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function truncateUrl(url: string, maxLength = 30) {
  if (url.length <= maxLength) return url;
  return `${url.slice(0, maxLength)}...`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-sm hover:bg-[var(--bg-tertiary)] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-4 h-4 text-[var(--accent-primary)]" />
      ) : (
        <Copy className="w-4 h-4 text-[var(--text-muted)]" />
      )}
    </button>
  );
}

function InfoRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[var(--bg-tertiary)] last:border-0">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-[var(--text-primary)]">{value}</span>
        {copyValue && <CopyButton text={copyValue} />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { address, ss58Address } = useAccount();

  return (
    <GameLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[var(--accent-secondary)]/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-[var(--accent-secondary)]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Settings
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Wallet, network, and contract information
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Wallet Info */}
          <Card>
            <CardHeader
              title="Wallet"
              subtitle="Connected account details"
              action={<Wallet className="w-4 h-4 text-[var(--accent-primary)]" />}
            />
            <CardContent>
              <div className="space-y-0">
                <InfoRow
                  label="Address"
                  value={address ? truncateAddress(address) : 'Not connected'}
                  copyValue={address}
                />
                <InfoRow
                  label="Source"
                  value="Polkadot Host (dot.li)"
                />
                {ss58Address && (
                  <InfoRow
                    label="SS58"
                    value={truncateAddress(ss58Address)}
                    copyValue={ss58Address}
                  />
                )}
              </div>
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Disconnect by closing this dApp in the host&apos;s wallet UI.
              </p>
            </CardContent>
          </Card>

          {/* Network Info */}
          <Card>
            <CardHeader
              title="Network"
              subtitle="Active chain configuration"
              action={<Globe className="w-4 h-4 text-[var(--accent-secondary)]" />}
            />
            <CardContent>
              <div className="space-y-0">
                <InfoRow label="Chain" value={activeChain.name} />
                <InfoRow label="Chain ID" value={String(activeChain.id)} />
                <InfoRow
                  label="RPC"
                  value={truncateUrl(rpcUrl)}
                  copyValue={rpcUrl}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contract Addresses */}
          <Card>
            <CardHeader
              title="Contracts"
              subtitle="Deployed contract addresses"
              action={<FileCode className="w-4 h-4 text-[var(--accent-primary)]" />}
            />
            <CardContent>
              <div className="space-y-0">
                <InfoRow
                  label="NexusGame"
                  value={nexusGameAddress ? truncateAddress(nexusGameAddress) : 'Not configured'}
                  copyValue={nexusGameAddress || undefined}
                />
                <InfoRow
                  label="GameConfig"
                  value={gameConfigAddress ? truncateAddress(gameConfigAddress) : 'Not configured'}
                  copyValue={gameConfigAddress || undefined}
                />
              </div>
            </CardContent>
          </Card>

          {/* Game Info */}
          <Card>
            <CardHeader
              title="About"
              subtitle="Game version and info"
            />
            <CardContent>
              <div className="space-y-0">
                <InfoRow label="Version" value="v0.1.0" />
                <InfoRow label="Environment" value={environment} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </GameLayout>
  );
}
