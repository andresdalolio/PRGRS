import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'PRGRS — Your training. Your journey.',
  description: 'Track the work. See the growth. Offline-first training, built around you.',
  applicationName: 'PRGRS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PRGRS' },
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f2' },
    { media: '(prefers-color-scheme: dark)', color: '#121612' },
  ],
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('prgrs-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):t}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
