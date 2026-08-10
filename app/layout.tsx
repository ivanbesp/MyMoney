import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Финансы',
  description: 'Личный трекер финансов',
  icons: { icon: '/favicon.svg' },
};

// maximumScale не ставим: это ломает доступность на мобильных
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5F7' },
    { media: '(prefers-color-scheme: dark)', color: '#14161A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Ставит data-theme до первой отрисовки — иначе тёмная тема мигает светлой */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
