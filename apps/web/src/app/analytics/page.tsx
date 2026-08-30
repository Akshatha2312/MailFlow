'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { apiClient } from '@/lib/api-client';
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Mail,
  Send,
  Users,
  Search,
  ArrowUpRight,
  RefreshCw,
  Zap,
  Activity,
  Filter,
} from 'lucide-react';

interface CampaignPerformance {
  id: string;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  deliveryRate: number;
  createdAt: string;
  completedAt: string | null;
}

interface OverviewMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  draftCampaigns: number;
  cancelledCampaigns: number;
  totalRecipients: number;
  emailsQueued: number;
  emailsSent: number;
  emailsFailed: number;
  deliveryRate: number;
  campaigns: CampaignPerformance[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const json = await apiClient.getAnalyticsOverview();
      setData(json as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error connecting to analytics server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const filteredCampaigns = (data?.campaigns || []).filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar />
      <div className="max-w-7xl mx-auto p-6 md:p-10 space-y-8">
        {/* Header Navigation */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-blue-400" />
                Campaign Analytics & Delivery Intelligence
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time delivery performance aggregated directly from PostgreSQL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAnalytics}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
            <Link
              href="/campaigns/new"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all"
            >
              + Create Campaign
            </Link>
          </div>
        </header>

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={fetchAnalytics} className="text-xs text-rose-400 hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loading && !data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-900 border border-slate-800"></div>
            ))}
          </div>
        )}

        {/* KPI Metrics Cards */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 transition-all shadow-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                <span>Total Campaigns</span>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Mail className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-slate-100 tracking-tight">{data.totalCampaigns}</div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                <span className="text-emerald-400 font-semibold">{data.activeCampaigns} Active</span>
                <span>•</span>
                <span>{data.completedCampaigns} Completed</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 transition-all shadow-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                <span>Emails Delivered (Sent)</span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Send className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">{data.emailsSent}</div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                <span>Total Recipients: {data.totalRecipients}</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 transition-all shadow-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                <span>Delivery Success Rate</span>
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-indigo-400 tracking-tight">{data.deliveryRate}%</div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">{data.emailsFailed} Failed Attempts</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800/80 hover:border-slate-700/60 transition-all shadow-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                <span>Queue Pipeline</span>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-amber-400 tracking-tight">{data.emailsQueued}</div>
              <div className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                <span>BullMQ Delayed Queue Jobs</span>
              </div>
            </div>
          </div>
        )}

        {/* Campaign Status Distribution Breakdown Bar */}
        {data && data.totalCampaigns > 0 && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between text-sm font-semibold text-slate-200">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Campaign Status Distribution
              </span>
              <span className="text-xs text-slate-400">{data.totalCampaigns} Total Campaigns</span>
            </div>

            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
              <div
                style={{ width: `${(data.completedCampaigns / data.totalCampaigns) * 100}%` }}
                className="bg-emerald-500 h-full transition-all"
                title="Completed"
              ></div>
              <div
                style={{ width: `${(data.activeCampaigns / data.totalCampaigns) * 100}%` }}
                className="bg-blue-500 h-full transition-all animate-pulse"
                title="Active / Sending"
              ></div>
              <div
                style={{ width: `${(data.draftCampaigns / data.totalCampaigns) * 100}%` }}
                className="bg-slate-600 h-full transition-all"
                title="Draft"
              ></div>
              <div
                style={{ width: `${(data.cancelledCampaigns / data.totalCampaigns) * 100}%` }}
                className="bg-rose-500 h-full transition-all"
                title="Cancelled"
              ></div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 pt-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span>Completed ({data.completedCampaigns})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <span>Sending / Active ({data.activeCampaigns})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
                <span>Draft ({data.draftCampaigns})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                <span>Cancelled ({data.cancelledCampaigns})</span>
              </div>
            </div>
          </div>
        )}

        {/* Campaign Performance Table */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Campaign Performance Matrix</h2>
              <p className="text-xs text-slate-400">Detailed delivery statistics per campaign</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {['ALL', 'SENDING', 'COMPLETED', 'DRAFT', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      statusFilter === st ? 'bg-blue-600 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          {filteredCampaigns.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-3">
              <Mail className="w-10 h-10 mx-auto text-slate-700 stroke-[1.5]" />
              <p className="text-sm">No campaigns match the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Campaign Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Recipients</th>
                    <th className="py-3 px-4 text-right">Sent</th>
                    <th className="py-3 px-4 text-right">Failed</th>
                    <th className="py-3 px-4 text-right">Delivery Rate</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCampaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-4 px-4 font-semibold text-slate-200">
                        <Link href={`/campaigns/${c.id}`} className="hover:text-blue-400 transition-colors">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                            c.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : c.status === 'SENDING'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse'
                              : c.status === 'CANCELLED'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-medium text-slate-300">{c.totalRecipients}</td>
                      <td className="py-4 px-4 text-right font-semibold text-emerald-400">{c.sentCount}</td>
                      <td className="py-4 px-4 text-right font-semibold text-rose-400">{c.failedCount}</td>
                      <td className="py-4 px-4 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            c.deliveryRate >= 90
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : c.deliveryRate >= 50
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {c.deliveryRate}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium hover:underline"
                        >
                          View <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
