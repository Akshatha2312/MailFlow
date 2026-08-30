'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Users, Upload, Plus, Search, Mail, Building, CheckCircle2, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { apiClient, Sender, User } from '@/lib/api-client';
import { formatCsvContacts, parseCsvContacts } from '@/lib/csv-contacts';

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  status: 'ACTIVE' | 'UNSUBSCRIBED';
}

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'CONTACTS' | 'SENDERS'>('CONTACTS');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([
    { id: '1', email: 'sarah@skynet.com', firstName: 'Sarah', lastName: 'Connor', company: 'Skynet Inc', status: 'ACTIVE' },
    { id: '2', email: 'john@cyberdyne.com', firstName: 'John', lastName: 'Doe', company: 'Cyberdyne Systems', status: 'ACTIVE' },
    { id: '3', email: 'alice@acme.org', firstName: 'Alice', lastName: 'Smith', company: 'Acme Corp', status: 'ACTIVE' },
  ]);

  useEffect(() => {
    let isMounted = true;
    apiClient.getMe().then((u) => {
      if (!isMounted || !u) return;
      setUser(u);
      apiClient.getSenders().then((s) => {
        if (isMounted) setSenders(s || []);
      });
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleUploadCsv = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;

    const lines = csvText.trim().split('\n');
    const newContacts: Contact[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(',').map((p) => p.trim());
      if (parts[0] && parts[0].includes('@')) {
        newContacts.push({
          id: String(Date.now() + idx),
          email: parts[0],
          firstName: parts[1] || 'Friend',
          lastName: parts[2] || '',
          company: parts[3] || 'Organization',
          status: 'ACTIVE',
        });
      }
    });

    setContacts((prev) => [...newContacts, ...prev]);
    setCsvText('');
    setShowUploadModal(false);
    alert(`Successfully added ${newContacts.length} contacts!`);
  };

  const handleCsvFile = (file: File | undefined) => {
    if (!file) return;
    setCsvError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Please upload a .csv file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = parseCsvContacts(String(reader.result || ''));
      if (result.contacts.length > 0) setCsvText(formatCsvContacts(result.contacts));
      setCsvError(result.error || null);
    };
    reader.onerror = () => setCsvError('Failed to read the CSV file.');
    reader.readAsText(file);
  };

  const filteredContacts = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.firstName.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <Navbar />

      <main className="max-w-7xl mx-auto p-6 md:p-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-6 h-6 text-purple-400" />
              Audience & Sender Configuration
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Manage recipient contact lists, custom template fields, and Ethereal/SMTP sender credentials
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 text-xs font-semibold transition-all"
            >
              <Upload className="w-4 h-4" /> Import CSV Audience
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('CONTACTS')}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 ${
              activeTab === 'CONTACTS'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Recipient Audience List ({contacts.length})
          </button>
          <button
            onClick={() => setActiveTab('SENDERS')}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 ${
              activeTab === 'SENDERS'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Sender SMTP Accounts
          </button>
        </div>

        {/* Contacts Tab Content */}
        {activeTab === 'CONTACTS' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="relative w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter contacts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Recipient Email</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Company</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredContacts.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-200">{c.email}</td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {c.firstName} {c.lastName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{c.company}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Senders Tab Content */}
        {activeTab === 'SENDERS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {senders.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
                No sender accounts found for your account.
              </div>
            ) : (
              senders.map((s) => (
                <div key={s.id} className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-200">{s.name || s.email}</h3>
                        <p className="text-xs text-slate-400">{s.email}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {s.isDefault ? 'DEFAULT' : 'ACTIVE'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Host:</span>
                      <span className="font-mono">{s.smtpHost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Port:</span>
                      <span className="font-mono">{s.smtpPort}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Hourly Limit:</span>
                      <span className="font-mono">{s.hourlyLimit} emails/hr</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* CSV Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                  Import CSV Contacts
                </h3>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Format: <code>email, firstName, lastName, company</code> (one contact per line)
              </p>

              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 text-xs font-semibold cursor-pointer transition-all">
                <Upload className="w-4 h-4" /> Upload CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    handleCsvFile(e.target.files?.[0]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              <textarea
                rows={6}
                placeholder="alice@acme.org, Alice, Smith, Acme Corp&#10;bob@corp.com, Bob, Jones, Globex"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500/50"
              />
              {csvError && <p className="text-xs text-rose-400">{csvError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUploadCsv}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500"
                >
                  Import Contacts
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
