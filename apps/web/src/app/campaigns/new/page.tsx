'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { formatCsvContacts, parseCsvContacts } from '@/lib/csv-contacts';
import { Mail, ArrowLeft, Plus, Play, Calendar, User, Building, Sparkles, CheckCircle2, Eye, FileText, Upload } from 'lucide-react';

interface Sender {
  id: string;
  email: string;
  name?: string | null;
  isDefault?: boolean;
}

interface RecipientInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

export default function NewCampaignPage() {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState('');
  const [senderId, setSenderId] = useState('');
  const [senders, setSenders] = useState<Sender[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Recipients input state
  const [rawRecipientsText, setRawRecipientsText] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState<RecipientInput[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Scheduling state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAtDate, setScheduledAtDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch senders on component mount and auto-select default
  useEffect(() => {
    let isMounted = true;
    async function fetchSenders() {
      try {
        const userSenders = await apiClient.getSenders();
        if (!isMounted) return;
        setSenders(userSenders || []);
        // Auto-select default sender
        const defaultSender = userSenders?.find((s) => s.isDefault) || userSenders?.[0];
        if (defaultSender) {
          setSenderId(defaultSender.id);
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to load senders. Please refresh the page.');
        }
      }
    }
    fetchSenders();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // Parse recipients text automatically
    const lines = rawRecipientsText.split('\n').filter((l) => l.trim().length > 0);
    const parsed: RecipientInput[] = [];

    for (const line of lines) {
      // Support comma or tab separated values: email, firstName, lastName, company
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts[0] && parts[0].includes('@')) {
        parsed.push({
          email: parts[0],
          firstName: parts[1] || '',
          lastName: parts[2] || '',
          company: parts[3] || '',
        });
      }
    }
    setParsedRecipients(parsed);
  }, [rawRecipientsText]);

  const handleCsvUpload = (file: File | undefined) => {
    if (!file) return;
    setCsvError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Please upload a .csv file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = parseCsvContacts(String(reader.result || ''));
      if (result.contacts.length > 0) {
        const existingEmails = new Set(
          rawRecipientsText
            .split('\n')
            .map((line) => line.split(/[,;\t]/)[0]?.trim().toLowerCase())
            .filter(Boolean)
        );
        const newContacts = result.contacts.filter((contact) => !existingEmails.has(contact.email.toLowerCase()));
        if (newContacts.length > 0) {
          setRawRecipientsText((currentText) =>
            [currentText.trim(), formatCsvContacts(newContacts)].filter(Boolean).join('\n')
          );
        }
      }
      setCsvError(result.error || null);
    };
    reader.onerror = () => setCsvError('Failed to read the CSV file.');
    reader.readAsText(file);
  };

  const insertTag = (tag: string) => {
    setBody((prev) => `${prev} {{${tag}}}`);
  };

  const renderPersonalized = (text: string, rec?: RecipientInput) => {
    if (!rec) return text;
    return text
      .replace(/\{\{\s*firstName\s*\}\}/g, rec.firstName || 'Friend')
      .replace(/\{\{\s*lastName\s*\}\}/g, rec.lastName || '')
      .replace(/\{\{\s*company\s*\}\}/g, rec.company || 'your organization')
      .replace(/\{\{\s*email\s*\}\}/g, rec.email);
  };

  const handleSaveCampaign = async (launchImmediately = false) => {
    if (!name || !subject || !body) {
      setError('Please fill in campaign name, subject, and email body.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create Campaign
      const campaign = await apiClient.createCampaign({
        name,
        subject,
        body,
        senderId: senderId || undefined,
        scheduledAt: isScheduled && scheduledAtDate ? new Date(scheduledAtDate).toISOString() : undefined,
      });

      // 2. Attach Recipients if provided
      if (parsedRecipients.length > 0) {
        await apiClient.addRecipients(campaign.id, parsedRecipients);
      }

      // 3. Launch if requested
      if (launchImmediately) {
        await apiClient.launchCampaign(campaign.id);
        alert('🚀 Campaign created and launched successfully!');
      } else {
        alert('✅ Campaign saved as draft successfully!');
      }

      window.location.href = '/campaigns';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-12 text-white">
      <div className="max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-8">
          <div className="flex items-center gap-3">
            <Link href="/campaigns" className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Create Email Campaign</h1>
              <p className="text-xs text-gray-400">Design personalized email campaigns with real-time preview</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/30'
                    : step > s
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-gray-500 border border-white/5'
                }`}
              >
                {step > s ? '✓' : s}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Step 1: Campaign Details */}
        {step === 1 && (
          <div className="p-8 rounded-2xl glass-card border border-white/10 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              1. Campaign Setup
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Campaign Name *</label>
              <input
                type="text"
                placeholder="e.g. Q3 Product Launch Newsletter"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Sender Account (SMTP) *</label>
              {senders.length === 0 ? (
                <div className="px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-gray-500 text-sm">
                  No sender accounts found. Please configure a sender first.
                </div>
              ) : (
                <select
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a sender...</option>
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.email} ({s.email}) {s.isDefault ? '— Default' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                disabled={!name || !senderId}
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Next: Email Composition ➔
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Composition & Personalization */}
        {step === 2 && (
          <div className="p-8 rounded-2xl glass-card border border-white/10 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              2. Subject Line & Personalized Content
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email Subject *</label>
              <input
                type="text"
                placeholder="e.g. Special invitation for {{firstName}} at {{company}}"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">HTML Body *</label>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400">Insert tag:</span>
                  <button
                    type="button"
                    onClick={() => insertTag('firstName')}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                  >
                    + {"{{firstName}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('lastName')}
                    className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                  >
                    + {"{{lastName}}"}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('company')}
                    className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                  >
                    + {"{{company}}"}
                  </button>
                </div>
              </div>

              <textarea
                rows={8}
                placeholder="<p>Hi {{firstName}},</p><p>We have an exclusive offer for {{company}}.</p>"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="pt-4 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                ← Back
              </button>
              <button
                disabled={!subject || !body}
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                Next: Recipients Import ➔
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Recipients Upload */}
        {step === 3 && (
          <div className="p-8 rounded-2xl glass-card border border-white/10 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-400" />
              3. Recipient Selection & CSV Import
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Enter Recipients (One per line: email, firstName, lastName, company)
              </label>
              <p className="text-xs text-gray-500 mb-2">Example: alex@acme.com, Alex, Smith, Acme Corp</p>
              <textarea
                rows={6}
                placeholder="sarah@skynet.com, Sarah, Connor, Skynet&#10;john@cyberdyne.com, John, Doe, Cyberdyne"
                value={rawRecipientsText}
                onChange={(e) => setRawRecipientsText(e.target.value)}
                className="w-full p-4 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 mt-3 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 text-sm font-medium cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload CSV
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  handleCsvUpload(e.target.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
              {csvError && <p className="mt-2 text-xs text-rose-400">{csvError}</p>}
            </div>

            {parsedRecipients.length > 0 && (
              <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                <h3 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Parsed {parsedRecipients.length} Recipient(s)
                </h3>
                <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
                  {parsedRecipients.map((r, i) => (
                    <div key={i} className="py-1 px-2 rounded bg-white/5 flex items-center justify-between text-gray-300">
                      <span>{r.email}</span>
                      <span className="text-gray-500">{r.firstName} {r.lastName} ({r.company || 'N/A'})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                Next: Live Personalization Preview ➔
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Preview & Launch */}
        {step === 4 && (
          <div className="p-8 rounded-2xl glass-card border border-white/10 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-400" />
              4. Personalization Preview & Launch
            </h2>

            {/* Recipient Toggle */}
            {parsedRecipients.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 text-xs text-gray-400">
                <span>Previewing for recipient {previewIndex + 1} of {parsedRecipients.length}:</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={previewIndex === 0}
                    onClick={() => setPreviewIndex((p) => p - 1)}
                    className="px-2 py-1 rounded bg-white/5 text-gray-300 disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-white">{parsedRecipients[previewIndex]?.email}</span>
                  <button
                    disabled={previewIndex === parsedRecipients.length - 1}
                    onClick={() => setPreviewIndex((p) => p + 1)}
                    className="px-2 py-1 rounded bg-white/5 text-gray-300 disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Preview Box */}
            <div className="p-6 rounded-xl bg-black/60 border border-white/10 space-y-4">
              <div>
                <div className="text-xs text-gray-500">Subject Preview</div>
                <div className="text-base font-semibold text-white mt-1">
                  {renderPersonalized(subject, parsedRecipients[previewIndex])}
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="text-xs text-gray-500 mb-2">HTML Body Rendered Preview</div>
                <div
                  className="p-4 rounded-lg bg-white/5 text-gray-200 text-sm prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: renderPersonalized(body, parsedRecipients[previewIndex]),
                  }}
                />
              </div>
            </div>

            {/* Schedule options */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-black/50 border-white/10"
                />
                <span className="text-sm text-gray-300 font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  Schedule campaign for a future start time
                </span>
              </label>

              {isScheduled && (
                <div className="pl-7">
                  <input
                    type="datetime-local"
                    value={scheduledAtDate}
                    onChange={(e) => setScheduledAtDate(e.target.value)}
                    className="px-4 py-2 bg-black/60 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="pt-4 flex items-center justify-between border-t border-white/10">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                ← Back
              </button>

              <div className="flex items-center gap-3">
                <button
                  disabled={loading}
                  onClick={() => handleSaveCampaign(false)}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  disabled={loading}
                  onClick={() => handleSaveCampaign(true)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  {isScheduled ? 'Schedule Campaign' : 'Launch Campaign Now'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
