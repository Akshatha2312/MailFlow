'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface FileUploaderProps {
  onEmailsExtracted: (emails: string[]) => void;
}

export function FileUploader({ onEmailsExtracted }: FileUploaderProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [emailCount, setEmailCount] = useState<number>(0);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFileContent = (content: string, name: string) => {
    setError(null);
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = content.match(emailRegex) || [];

    if (matches.length === 0) {
      setError('No valid email addresses detected in file.');
      setFileName(name);
      setEmailCount(0);
      setDuplicateCount(0);
      onEmailsExtracted([]);
      return;
    }

    const uniqueEmails: string[] = [];
    const seen = new Set<string>();

    for (const raw of matches) {
      const normalized = raw.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueEmails.push(normalized);
      }
    }

    setFileName(name);
    setEmailCount(uniqueEmails.length);
    setDuplicateCount(matches.length - uniqueEmails.length);
    onEmailsExtracted(uniqueEmails);
  };

  const handleFile = (file: File) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit.');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'txt') {
      setError('Please upload a .csv or .txt file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseFileContent(text || '', file.name);
    };
    reader.onerror = () => {
      setError('Failed to read file.');
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const clearFile = () => {
    setFileName(null);
    setEmailCount(0);
    setDuplicateCount(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onEmailsExtracted([]);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-300">Recipient Email List (CSV or TXT)</label>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10'
            : fileName
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-900'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          accept=".csv,.txt"
          className="hidden"
        />

        {fileName ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 text-left">
              <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{fileName}</p>
                <p className="text-xs text-emerald-400 font-medium">
                  {emailCount} valid recipient{emailCount === 1 ? '' : 's'} detected
                  {duplicateCount > 0 && ` (${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} removed)`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mx-auto w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-sm text-slate-300 font-medium">
              Click to upload or drag & drop CSV / TXT file
            </div>
            <p className="text-xs text-slate-500">Supports .csv or .txt containing recipient email addresses (Max 5MB)</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
