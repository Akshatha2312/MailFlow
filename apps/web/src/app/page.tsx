'use client';

import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Mail, Zap, Shield, Search, Slack, ArrowRight, LayoutDashboard, Send, BarChart3, Users, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-sans">
      <Navbar />

      <main className="max-w-7xl mx-auto w-full px-6 py-12 md:py-16 space-y-16">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5" /> ReachInbox Software Development Intern Hiring Assignment
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Reliable Email Job Scheduling & <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Delivery Engine</span>
          </h1>

          <p className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Schedule bulk email campaigns with delayed BullMQ queueing, PostgreSQL persistence, rate-limiting, and dedicated SMTP worker processes.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition-all hover:scale-105"
            >
              <LayoutDashboard className="w-4 h-4" /> Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/campaigns/new"
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-semibold text-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-blue-400" /> Create Campaign
            </Link>
          </div>
        </section>

        {/* Feature Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/campaigns"
            className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/40 transition-all group shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
              Email Campaign Management
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Compose, personalize, schedule, launch, and track bulk campaigns with relational recipient data.
            </p>
          </Link>

          <Link
            href="/analytics"
            className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all group shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-indigo-400 transition-colors">
              Delivery Intelligence
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              PostgreSQL SQL aggregations calculating sent, failed, queued counts, and delivery success rates.
            </p>
          </Link>

          <Link
            href="/contacts"
            className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/40 transition-all group shadow-xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-purple-400 transition-colors">
              Audience & Senders
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Configure SMTP credentials, hourly sending limits, and upload CSV audience contact lists.
            </p>
          </Link>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        MailFlow Platform • ReachInbox Software Development Intern Hiring Assignment
      </footer>
    </div>
  );
}
