'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Shield, Sparkles, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;
    apiClient.getMe().then((user) => {
      if (!isMounted) return;
      if (user) {
        router.replace('/dashboard');
      } else {
        setCheckingAuth(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleGoogleLogin = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    window.location.href = `${apiBase}/auth/google`;
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Verifying session status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 font-sans">
      {/* Header */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">MailFlow</span>
        </Link>
      </header>

      {/* Main Login Portal Card */}
      <main className="max-w-md mx-auto w-full py-12">
        <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl space-y-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-blue-500/30">
            <Shield className="w-7 h-7 text-white" />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight">Sign In to MailFlow</h1>
            <p className="text-xs text-slate-400 mt-1">
              Google OAuth 2.0 authentication for ReachInbox assignment platform
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.27v3.13C3.25 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.22c-.25-.72-.38-1.49-.38-2.22s.13-1.5.38-2.22V6.65H1.27C.46 8.26 0 10.07 0 12s.46 3.74 1.27 5.35l4.01-3.13z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.65l4.01 3.13c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            Continue with Google OAuth
          </button>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Secure OAuth 2.0 PKCE Authorization</p>
            <p>Initiates authentic Google login via backend <code className="text-blue-400">/api/auth/google</code></p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto w-full text-center text-xs text-slate-600 py-4">
        MailFlow PRO &bull; High-Performance Email Job Scheduling Platform
      </footer>
    </div>
  );
}
