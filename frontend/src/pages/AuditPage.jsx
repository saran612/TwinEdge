import React, { useState, useEffect } from 'react';
import { Card, CardHeader, MetricCard, Chip, ProvenanceTag, Button, TableShell } from '../components/ui';
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
      setAuditRows(data || []);
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
    { field: 'timestamp', header: 'TIMESTAMP (UTC)', width: '18%' },
    { field: 'action', header: 'ACTION', width: '12%' },
    { field: 'engine_id', header: 'ENGINE', width: '10%' },
    { field: 'cycle', header: 'CYCLE', width: '10%', render: (row) => `${row.cycle} cycles` },
    { field: 'reviewer_id', header: 'REVIEWER', width: '12%', render: (row) => row.reviewer_id || 'SYSTEM' },
    {
      field: 'row_hash',
      header: 'SHA-256 ROW HASH',
      width: '22%',
      render: (row) => (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-text-2 truncate max-w-36">{row.row_hash}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(row.row_hash);
            }}
            className="text-text-muted hover:text-text p-0.5 rounded-sm"
            title="Copy Hash"
          >
            {copiedHash === row.row_hash ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      ),
    },
    {
      field: 'prev_hash',
      header: 'PREV HASH',
      width: '20%',
      render: (row) => (
        <span className="font-mono text-xs text-text-muted truncate max-w-32 block">
          {row.prev_hash || 'GENESIS'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-6 select-none">
      {/* Top 5 Metric Cards in a single grid row */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Audit ledger entries" value={auditRows.length} provenance="LIVE" />
        <MetricCard
          label="Cryptographic status"
          value={verificationResult?.verified ? 'VERIFIED' : verificationResult ? 'BROKEN' : 'CHECKING'}
          provenance="LIVE"
          delta={verificationResult?.verified ? '0 TAMPERED' : 'INTEGRITY ALERT'}
          deltaType={verificationResult?.verified ? 'positive' : 'negative'}
        />
        <MetricCard
          label="Chaining algorithm"
          value="SHA-256"
          provenance="STATIC"
          tooltip="Each entry commits to sha256(prev_hash | alert_id | engine | cycle | action | reviewer | rul | notes | ts)."
        />
        <MetricCard
          label="Tamper detection"
          value="Active"
          provenance="STATIC"
          tooltip="Real-time verification against hash pointer chain in SQLite storage."
        />
        <Card className="h-[120px] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-text-muted">
            <span>Verify integrity</span>
            <Lock className="w-4 h-4 text-accent" />
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={verifyChain}
            disabled={isVerifying}
            className="w-full justify-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'Verifying...' : 'Verify chain now'}</span>
          </Button>
        </Card>
      </div>

      {/* Info notice about hash scope */}
      <div className="bg-surface-2 border border-border rounded-lg p-4 text-xs text-text-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-accent shrink-0" />
          <span>
            <strong className="text-text">Scope of Cryptographic Verification:</strong> The SHA-256 hash chain guarantees tamper-evidence inside this SQLite database table. It detects retroactively modified or deleted rows, but does not provide external blockchain anchoring or hardware HSM certification.
          </span>
        </div>
        <ProvenanceTag type="STATIC" />
      </div>

      {/* Table of Entries */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader
          title="Immutable Audit Trail Ledger"
          subtitle="Cryptographically linked ledger rows"
          action={<ProvenanceTag type="LIVE" />}
        />
        <div className="flex-1 p-5 pt-0 overflow-hidden">
          <TableShell
            columns={columns}
            data={auditRows}
            keyField="id"
            emptyMessage="No audit ledger records found."
          />
        </div>
      </Card>
    </div>
  );
}
