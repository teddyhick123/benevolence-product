import './globals.css';
import React from 'react';

export const metadata = { title: 'Benevolence MVP', description: 'Impact portfolio dashboard' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="max-w-6xl mx-auto p-6 bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
