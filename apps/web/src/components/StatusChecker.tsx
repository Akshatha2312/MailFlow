'use client';

import { useState, useEffect } from 'react';
import { Database, Server, Cpu, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latencyMs?: number;
  error?: string;
}

interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'checking';
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    elasticsearch: ServiceStatus;
  };
}

export function StatusChecker() {
  const [health, setHealth] = useState<SystemHealth>({
    status: 'checking',
    services: {
      postgres: { status: 'unhealthy' },
      redis: { status: 'unhealthy' },
      elasticsearch: { status: 'unhealthy' },
    },
  });
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/health');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setHealth({
        status: 'unhealthy',
        services: {
          postgres: { status: 'unhealthy', error: 'API unreachable' },
          redis: { status: 'unhealthy', error: 'API unreachable' },
          elasticsearch: { status: 'unhealthy', error: 'API unreachable' },
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const renderStatusBadge = (status: string) => {
    if (status === 'healthy') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
        </span>
      );
    }
    if (status === 'degraded') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" /> Degraded
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <XCircle className="w-3.5 h-3.5" /> Offline
      </span>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 p-6 rounded-2xl glass-card border border-white/10 glow-blue">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            Infrastructure Status (Phase 0)
          </h2>
          <p className="text-sm text-gray-400">Live health verification of core MailFlow services</p>
        </div>
        <div className="flex items-center gap-3">
          {renderStatusBadge(health.status)}
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Postgres Status */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">PostgreSQL</h3>
                <p className="text-xs text-gray-400">Prisma ORM</p>
              </div>
            </div>
            {renderStatusBadge(health.services.postgres.status)}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-gray-500">Port 5432</span>
            <span className="text-gray-300 font-mono">
              {health.services.postgres.latencyMs !== undefined
                ? `${health.services.postgres.latencyMs}ms`
                : health.services.postgres.error || 'N/A'}
            </span>
          </div>
        </div>

        {/* Redis Status */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Redis</h3>
                <p className="text-xs text-gray-400">BullMQ Engine</p>
              </div>
            </div>
            {renderStatusBadge(health.services.redis.status)}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-gray-500">Port 6379</span>
            <span className="text-gray-300 font-mono">
              {health.services.redis.latencyMs !== undefined
                ? `${health.services.redis.latencyMs}ms`
                : health.services.redis.error || 'N/A'}
            </span>
          </div>
        </div>

        {/* Elasticsearch Status */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Elasticsearch</h3>
                <p className="text-xs text-gray-400">Full-text Search</p>
              </div>
            </div>
            {renderStatusBadge(health.services.elasticsearch.status)}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-gray-500">Port 9200</span>
            <span className="text-gray-300 font-mono">
              {health.services.elasticsearch.latencyMs !== undefined
                ? `${health.services.elasticsearch.latencyMs}ms`
                : health.services.elasticsearch.error || 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
