'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { FileUploader } from '@/components/FileUploader';
import { apiClient, EmailJob, Pagination, User, SlackStatus, Sender } from '@/lib/api-client';
import {
  LayoutDashboard,
  Send,
  BarChart3,
  Users,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  FileText,
  Calendar,
  ShieldAlert,
} from 'lucide-react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const searchArg = searchParams.get('search');
  const router = useRouter();

  // Authentication State
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);

  // Data State
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [senderId, setSenderId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSuccess, setComposeSuccess] = useState<string | null>(null);

  // 1. Session Protection Check: Check authentication FIRST
  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      const currentUser = await apiClient.getMe();
      if (!isMounted) return;

      if (!currentUser) {
        // Unauthenticated -> Redirect immediately to login and stop processing
        router.replace('/login');
        return;
      }

      setUser(currentUser);
      setAuthLoading(false);

      // Fetch user's registered senders & auto-select default sender
      apiClient
        .getSenders()
        .then((userSenders) => {
          if (!isMounted) return;
          setSenders(userSenders || []);
          const defSender = userSenders?.find((s) => s.isDefault) || userSenders?.[0];
          if (defSender) {
            setSenderId(defSender.id);
          }
        })
        .catch(() => isMounted && setSenders([]));

      // Fetch Slack status after auth succeeds
      apiClient
        .getSlackStatus()
        .then((status) => isMounted && setSlackStatus(status))
        .catch(() => isMounted && setSlackStatus(null));
    }

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // 2. Fetch Jobs: Executed ONLY after user is verified authenticated
  const fetchJobs = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (searchArg) {
        const searchRes = await apiClient.searchEmailJobs(searchArg, pagination.page, pagination.limit);
        setJobs(searchRes.data);
        setPagination({
          page: searchRes.page,
          limit: searchRes.limit,
          total: searchRes.total,
          totalPages: Math.ceil(searchRes.total / searchRes.limit) || 1,
        });
      } else {
        const statusFilter = activeTab === 'scheduled' ? 'SCHEDULED' : 'SENT';
        const res = await apiClient.listEmailJobs({
          page: pagination.page,
          limit: pagination.limit,
          status: statusFilter,
        });
        setJobs(res.data);
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchJobs();
    }
  }, [user, activeTab, pagination.page, searchArg]);

  // Render Full-Screen Loading State during Session Check
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-200">Checking authentication...</h3>
            <p className="text-xs text-slate-500">Verifying application session with MailFlow backend</p>
          </div>
        </div>
      </div>
    );
  }

  // If user is null (being redirected), return null
  if (!user) {
    return null;
  }

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeError(null);
    setComposeSuccess(null);

    if (!subject || !body || recipients.length === 0) {
      setComposeError('Please complete subject, body, and upload at least 1 valid recipient.');
      return;
    }

    if (!senderId) {
      setComposeError('No valid sender account selected for your user.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.scheduleEmails({
        subject,
        body,
        recipients,
        senderId,
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        delaySeconds: Number(delaySeconds) || 0,
      });

      setComposeSuccess(res.message);
      setTimeout(() => {
        setIsComposeOpen(false);
        setSubject('');
        setBody('');
        setRecipients([]);
        setComposeSuccess(null);
        fetchJobs();
      }, 1500);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to schedule email batch');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar user={user} slackStatus={slackStatus} />

      <main className="max-w-7xl mx-auto p-6 md:p-10 space-y-8">
        {/* Page Header & Primary Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Mail className="w-6 h-6 text-blue-400" />
              {searchArg ? `Search Results for "${searchArg}"` : 'Email Delivery & Scheduling'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Manage scheduled & sent email jobs backed by PostgreSQL, BullMQ, Redis & Elasticsearch
            </p>
          </div>

          <button
            onClick={() => setIsComposeOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all self-start"
          >
            <Plus className="w-4 h-4" /> Compose / Schedule Email
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-800">
          <div className="flex space-x-6">
            <button
              onClick={() => {
                setActiveTab('scheduled');
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className={`pb-3 text-sm font-medium transition-all relative ${
                activeTab === 'scheduled' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Scheduled Emails
              {activeTab === 'scheduled' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />}
            </button>

            <button
              onClick={() => {
                setActiveTab('sent');
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className={`pb-3 text-sm font-medium transition-all relative ${
                activeTab === 'sent' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sent Emails
              {activeTab === 'sent' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />}
            </button>
          </div>

          <span className="text-xs text-slate-500">Showing page {pagination.page} of {pagination.totalPages}</span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Data Table */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Fetching email jobs from server...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-16 text-center space-y-4">
              <div className="w-12 h-12 bg-slate-800/60 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-200">No {activeTab} emails found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {activeTab === 'scheduled'
                    ? 'No scheduled email jobs pending execution. Click "Compose" to schedule a new batch.'
                    : 'No delivered email logs recorded yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-xs font-semibold text-slate-400">
                    <th className="p-4">Recipient</th>
                    <th className="p-4">Subject</th>
                    <th className="p-4">{activeTab === 'scheduled' ? 'Scheduled Time' : 'Sent Time'}</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-4 font-medium text-slate-200">{job.recipient}</td>
                      <td className="p-4 truncate max-w-xs">{job.subject}</td>
                      <td className="p-4 text-slate-400">
                        {new Date(job.sentAt || job.scheduledAt).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                            job.status === 'SENT'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : job.status === 'PROCESSING'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : job.status === 'FAILED'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 disabled:opacity-40 hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              <span className="text-xs text-slate-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 disabled:opacity-40 hover:bg-slate-700"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Compose Email Modal */}
        {isComposeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-6 p-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  Compose & Schedule Email Batch
                </h2>
                <button
                  onClick={() => setIsComposeOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {composeError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{composeError}</span>
                </div>
              )}

              {composeSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{composeSuccess}</span>
                </div>
              )}

              <form onSubmit={handleScheduleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Sending Account (SMTP Sender)</label>
                  <select
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    {senders.length === 0 ? (
                      <option value="">No sender accounts found</option>
                    ) : (
                      senders.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.email} ({s.email}) {s.isDefault ? '— Default' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Subject</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Welcome to MailFlow PRO"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Body</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Compose message or template with {{firstName}}..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Recipient File Upload Component */}
                <FileUploader onEmailsExtracted={(emails) => setRecipients(emails)} />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Start Time (Optional)</label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Delay Between Emails (Seconds)</label>
                    <input
                      type="number"
                      min={0}
                      value={delaySeconds}
                      onChange={(e) => setDelaySeconds(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || recipients.length === 0}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 transition-all shadow-md shadow-blue-500/20"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Schedule Batch</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading Dashboard...</p>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
