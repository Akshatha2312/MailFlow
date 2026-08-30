'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { apiClient, Campaign, CampaignRecipient } from '@/lib/api-client';
import { Mail, Plus, Play, Calendar, Ban, Trash2, CheckCircle2, Clock, AlertTriangle, Send, Search, BarChart3 } from 'lucide-react';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.listCampaigns(statusFilter);
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [statusFilter]);

  const handleLaunch = async (id: string) => {
    if (!confirm('Are you sure you want to launch this campaign now?')) return;
    try {
      await apiClient.launchCampaign(id);
      alert('🚀 Campaign launched successfully! Personalized email jobs have been scheduled.');
      fetchCampaigns();
    } catch (err) {
      alert(`Error launching campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) return;
    try {
      await apiClient.cancelCampaign(id);
      fetchCampaigns();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to cancel'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) return;
    try {
      await apiClient.deleteCampaign(id);
      fetchCampaigns();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to delete'}`);
    }
  };

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderStatusBadge = (status: Campaign['status']) => {
    switch (status) {
      case 'DRAFT':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">Draft</span>;
      case 'SCHEDULED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1"><Clock className="w-3 h-3" /> Scheduled</span>;
      case 'QUEUED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1"><Send className="w-3 h-3 animate-pulse" /> Queued</span>;
      case 'SENDING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1"><Play className="w-3 h-3 animate-spin" /> Sending</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1"><Ban className="w-3 h-3" /> Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20"><AlertTriangle className="w-3 h-3" /> Failed</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Send className="w-6 h-6 text-blue-400" />
              Campaign Management
            </h1>
            <p className="text-xs text-slate-400 mt-1">Compose, personalize, schedule, and track bulk email campaigns</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/analytics"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-sm transition-all"
            >
              <BarChart3 className="w-4 h-4 text-blue-400" /> Analytics
            </Link>
            <Link
              href="/campaigns/new"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" /> Create New Campaign
            </Link>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-8 mb-6">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {['ALL', 'DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-gray-400">Loading campaigns...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-6 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchCampaigns} className="underline text-xs">Retry</button>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredCampaigns.length === 0 && (
          <div className="text-center py-20 rounded-2xl glass-card border border-white/5">
            <Mail className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">No campaigns found</h3>
            <p className="text-sm text-gray-400 mt-1 mb-6">Create your first personalized email campaign to start scheduling</p>
            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Campaign
            </Link>
          </div>
        )}

        {/* Campaign Grid */}
        {!loading && filteredCampaigns.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCampaigns.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl glass-card border border-white/10 p-6 flex flex-col justify-between hover:border-white/20 transition-all hover:shadow-xl"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-bold text-white text-lg truncate hover:text-blue-400 transition-colors">
                      <Link href={`/campaigns/${c.id}`}>{c.name}</Link>
                    </h3>
                    {renderStatusBadge(c.status)}
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-1 mb-4">
                    <span className="text-gray-500 font-semibold">Subject:</span> {c.subject}
                  </p>

                  <div className="grid grid-cols-3 gap-2 py-3 px-3 rounded-xl bg-black/40 border border-white/5 mb-4 text-center">
                    <div>
                      <div className="text-xs text-gray-500">Recipients</div>
                      <div className="text-sm font-semibold text-white mt-0.5">{c.totalRecipients}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Sent</div>
                      <div className="text-sm font-semibold text-emerald-400 mt-0.5">{c.sentCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Failed</div>
                      <div className="text-sm font-semibold text-rose-400 mt-0.5">{c.failedCount}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    {c.scheduledAt ? `Scheduled: ${new Date(c.scheduledAt).toLocaleDateString()}` : `Created: ${new Date(c.createdAt).toLocaleDateString()}`}
                  </span>

                  <div className="flex items-center gap-2">
                    {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
                      <button
                        onClick={() => handleLaunch(c.id)}
                        className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Launch Now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}

                    {(c.status === 'SCHEDULED' || c.status === 'QUEUED') && (
                      <button
                        onClick={() => handleCancel(c.id)}
                        className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                        title="Cancel Campaign"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}

                    {(c.status === 'DRAFT' || c.status === 'CANCELLED' || c.status === 'FAILED') && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Delete Campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <Link
                      href={`/campaigns/${c.id}`}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
