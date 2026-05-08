import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-app' });

export const metadata: Metadata = {
  title: 'E-Waste Platform',
  description: 'Find local e-waste recyclers near you',
  icons: {
    icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2322c55e%22 stroke-width=%222.4%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M21 12a9 9 0 1 1-9-9%22/%3E%3Cpath d=%22M21 3v6h-6%22/%3E%3Cpath d=%22M9 12l2 2 4-4%22/%3E%3C/svg%3E'
  }
};

// Root HTML shell that wires the single app font, theme provider, page content, and the global footer.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <ThemeProvider>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
