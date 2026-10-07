import React, { useState, useEffect } from 'react';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';
import DataTable from '../components/common/DataTable';
import { api } from '../services/api';
import {
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  RefreshCw,
  Info,
  Lock,
} from 'lucide-react';

export default function AuditPage() {
  const [auditRows, setAuditRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedHash, setCopiedHash] = useState('');

  const fetchAuditLog = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLog();
      setAuditRows(data);
    } catch (err) {
      console.warn('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  const verifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await api.verifyAudit();
      setVerificationResult(res);
    } catch (err) {
      setVerificationResult({ verified: false, error: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    fetchAuditLog();
    verifyChain();
  }, []);

  const handleCopy = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(''), 2000);
  };

  const columns = [
    { field: 'id', header: 'ID', width: '6%' },
    { field: 'timestamp', header: 'TIMESTAMP (UTC)', width: '16%' },
    { field: 'action', header: 'ACTION', width: '12%' },
    { field: 'engine_id', header: 'ENGINE', width: '8%' },
    { field: 'cycle', header: 'CYCLE', width: '8%' },
    { field: 'reviewer_id', header: 'REVIEWER', width: '12%', render: (val) => val || 'SYSTEM' },
    {
      field: 'row_hash',
      header: 'SHA-256 ROW HASH',
      width: '20%',
      render: (val) => (
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="text-indigo-300 truncate max-w-[140px]">{val}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(val);
            }}
            className="text-slate-500 hover:text-white p-0.5"
            title="Copy Hash"
          >
            {copiedHash === val ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      ),
    },
    {
      field: 'prev_hash',
      header: 'PREV HASH',
      width: '18%',
      render: (val) => (
        <span className="font-mono text-[11px] text-slate-500 truncate max-w-[120px] block">
          {val || 'GENESIS'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-4 select-none">
      {/* Top Metrics Banner */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Audit Log Entries" value={auditRows.length} provenance="LIVE" />
        <MetricCard
          label="Cryptographic Chain Status"
          value={verificationResult?.verified ? 'VERIFIED' : verificationResult ? 'BROKEN' : 'CHECKING'}
          provenance="LIVE"
          delta={verificationResult?.verified ? '0 TAMPERED' : 'INTEGRITY ALERT'}
          deltaType={verificationResult?.verified ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Chaining Algorithm"
          value="SHA-256 Pointer"
          provenance="STATIC"
          tooltip="Each entry commits to sha256(prev_hash | alert_id | engine | cycle | action | reviewer | rul | notes | ts)."
        />
        <div className="bg-slate-900 border border-slate-800 rounded p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
            <span>Verify Integrity</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <button
            onClick={verifyChain}
            disabled={isVerifying}
            className="mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'Verifying...' : 'Verify Chain Now'}</span>
          </button>
        </div>
      </div>

      {/* Info notice about hash scope */}
      <div className="bg-slate-900 border border-slate-800 rounded p-3 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            <strong>Scope of Cryptographic Verification:</strong> The SHA-256 hash chain guarantees tamper-evidence inside this SQLite database table. It detects retroactively modified or deleted rows, but does not provide external blockchain anchoring or hardware HSM certification.
          </span>
        </div>
        <ProvenanceTag type="STATIC" />
      </div>

      {/* Table of Entries */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded overflow-hidden shadow-md flex flex-col">
        <div className="p-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Immutable Audit Trail Ledger
          </span>
          <ProvenanceTag type="LIVE" />
        </div>

        <div className="flex-1 overflow-hidden">
          <DataTable
            columns={columns}
            data={auditRows}
            keyField="id"
            exportFileName="twinedge_audit_trail.csv"
            emptyMessage="No audit ledger records found."
          />
        </div>
      </div>
    </div>
  );
}
