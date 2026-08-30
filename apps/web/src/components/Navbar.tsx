'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Mail, LayoutDashboard, Send, BarChart3, Users, LogOut, Sparkles, MessageSquare, Search, CheckCircle2 } from 'lucide-react';
import { apiClient, User, SlackStatus } from '../lib/api-client';

interface NavbarProps {
  user?: User | null;
  slackStatus?: SlackStatus | null;
}

export function Navbar({ user: initialUser, slackStatus: initialSlackStatus }: NavbarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(initialSlackStatus ?? null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (initialUser !== undefined) {
      setUser(initialUser);
    } else {
      apiClient.getMe().then((data) => setUser(data));
    }
  }, [initialUser]);

  useEffect(() => {
    if (initialSlackStatus !== undefined) {
      setSlackStatus(initialSlackStatus);
    } else if (user) {
      apiClient
        .getSlackStatus()
        .then((data) => setSlackStatus(data))
        .catch(() => setSlackStatus(null));
    }
  }, [initialSlackStatus, user]);

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      setUser(null);
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleConnectSlack = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    window.location.href = `${apiBase}/integrations/slack/connect`;
  };

  const handleDisconnectSlack = async () => {
    if (confirm('Are you sure you want to disconnect Slack? Rate limit alerts will no longer be delivered to Slack.')) {
      try {
        await apiClient.disconnectSlack();
        setSlackStatus({ isConnected: false });
      } catch (err) {
        alert('Failed to disconnect Slack');
      }
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Campaigns', href: '/campaigns', icon: Send },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Contacts & Senders', href: '/contacts', icon: Users },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-slate-100 group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
              MailFlow
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                PRO
              </span>
            </span>
          </div>
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="hidden lg:flex items-center relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search subject, recipient, body..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </form>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Slack Connection & User Avatar */}
        <div className="flex items-center gap-3">
          {/* Slack Integration Button */}
          {slackStatus?.isConnected ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Slack: {slackStatus.teamName || 'Connected'}</span>
              <button
                onClick={handleDisconnectSlack}
                title="Disconnect Slack"
                className="text-slate-400 hover:text-rose-400 ml-1 text-[11px] font-semibold underline"
              >
                Disconnect
              </button>
            </div>
          ) : user ? (
            <button
              onClick={handleConnectSlack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Connect Slack</span>
            </button>
          ) : null}

          {/* User Account or Sign In */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name || user.email} className="w-8 h-8 rounded-full" />
                ) : (
                  (user.name || user.email).charAt(0).toUpperCase()
                )}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-medium text-slate-200">{user.name || 'MailFlow User'}</span>
                <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-all"
            >
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
