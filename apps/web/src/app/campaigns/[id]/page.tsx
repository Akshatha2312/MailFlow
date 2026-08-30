'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Mail, ArrowLeft, Play, Ban, Trash2, CheckCircle2, AlertTriangle, Clock, Send, User } from 'lucide-react';

interface Recipient {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  error?: string;
  sentAt?: string;
}

interface CampaignDetails {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: 'DRAFT' | 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  sender?: {
    email: string;
    name?: string;
  };
  recipients: Recipient[];
}

export default function CampaignDetailsPage() {
  const params = useParams();
  const campaignId = params?.id as string;

  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getCampaign(campaignId);
      setCampaign(data as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [campaignId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/campaigns" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to Campaigns
        </Link>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading campaign details...</div>
        ) : error ? (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
        ) : campaign ? (
          <div className="space-y-6">
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold border bg-blue-500/10 text-blue-400 border-blue-500/20">
                  {campaign.status}
                </span>
                <h1 className="text-xl font-bold text-slate-100 mt-2">{campaign.name}</h1>
                <p className="text-xs text-slate-400 mt-1">Subject: {campaign.subject}</p>
              </div>

              <div className="flex items-center gap-6 text-center text-xs">
                <div>
                  <div className="text-slate-400">Total</div>
                  <div className="text-lg font-bold text-slate-100">{campaign.totalRecipients}</div>
                </div>
                <div>
                  <div className="text-emerald-400">Sent</div>
                  <div className="text-lg font-bold text-emerald-400">{campaign.sentCount}</div>
                </div>
                <div>
                  <div className="text-rose-400">Failed</div>
                  <div className="text-lg font-bold text-rose-400">{campaign.failedCount}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 font-semibold text-xs text-slate-300">
                Recipients List ({campaign.recipients?.length || 0})
              </div>
              <div className="divide-y divide-slate-800 text-xs">
                {campaign.recipients?.map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-200">{r.email}</div>
                      {r.firstName && <div className="text-[10px] text-slate-500">{r.firstName} {r.lastName}</div>}
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
