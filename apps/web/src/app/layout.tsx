import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MailFlow - Reliable Email Job Scheduling Platform',
  description: 'Production-ready email job scheduling engine with BullMQ, Redis, PostgreSQL, Ethereal SMTP, and Elasticsearch.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-blue-500/30 selection:text-blue-200">
        {children}
      </body>
    </html>
  );
}
