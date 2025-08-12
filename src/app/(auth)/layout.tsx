import React from 'react';

// Minimal layout for authentication pages (login, verify-2fa, setup)
// This ensures they don't inherit the main application layout (sidebar, header, etc.)
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Renders the specific auth page content */}
        {children}
      </div>
    </div>
  );
} 