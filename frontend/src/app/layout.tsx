import type { Metadata, Viewport } from 'next';
import { Orbitron, JetBrains_Mono } from 'next/font/google';
import { Web3Provider } from '@/components/providers';
import './globals.css';

const orbitron = Orbitron({
  variable: '--font-orbitron',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nexus Protocol - Decentralized Space Strategy',
  description: 'Build your empire across the cosmos. Mine resources, command fleets, and dominate the galaxy in this decentralized space strategy game.',
  keywords: ['space game', 'strategy', 'blockchain', 'web3', 'decentralized', 'sci-fi', 'browser game'],
  authors: [{ name: 'Nexus Protocol Team' }],
};

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${orbitron.variable} ${jetbrainsMono.variable} antialiased bg-bg-primary text-text-primary min-h-screen`}
        style={{
          fontFamily: 'var(--font-jetbrains), monospace',
        }}
      >
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
