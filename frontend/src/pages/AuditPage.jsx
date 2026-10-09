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
  FileCheck,
  Layers,
  ScrollText,
} from 'lucide-react';

export default function AuditPage() {
  const [activeTab, setActiveTab] = useState('decision'); // 'decision' | 'model' | 'claims'

  // Tab 1: Decision Audit
  const [auditRows, setAuditRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedHash, setCopiedHash] = useState('');

  // Tab 2: Model Governance
  const [governanceModel, setGovernanceModel] = useState(null);

  // Tab 3: Claims Matrix
  const [governanceClaims, setGovernanceClaims] = useState(null);

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
      setVerificationResult({ ok: false, message: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    fetchAuditLog();
    verifyChain();
    api.getGovernanceModel()
      .then(setGovernanceModel)
      .catch(async () => {
        // Fallback to static snapshot in /audit/
        try {
          const res = await fetch('/audit/audit_metrics.json');
          if (res.ok) {
            const data = await res.json();
            setGovernanceModel({
              verdict: 'WEAK',
              allowed_quotes: [
                { metric: 'Official Test RMSE (Capped)', value: data.headline_reproduction?.rmse_test_capped?.toString() || '16.1972', context: 'C-MAPSS FD001 test split, cap 125' },
                { metric: 'Official Test MAE (Capped)', value: data.headline_reproduction?.mae_test_capped?.toString() || '12.4734', context: 'C-MAPSS FD001 test split, cap 125' },
                { metric: 'Model Bias', value: `+${data.headline_reproduction?.bias_test?.toString() || '1.2569'} cycles`, context: 'Positive indicates model overestimates remaining life' },
              ],
              forbidden_quotes: [
                { claim: 'Outperforms classical baselines', reason: 'HistGradientBoosting (14.27) and Ridge (15.89) beat the 1D-CNN (16.19) on identical feature splits.' },
                { claim: 'Zero False Alarms', reason: '2 of 20 held-out engines false-alert on healthy segments.' }
              ]
            });
          }
        } catch (e) {
          console.warn('Offline audit fallback error:', e);
        }
      });

    api.getGovernanceClaims().then(setGovernanceClaims).catch(() => {});
  }, []);

  const handleCopy = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(''), 2000);
  };

  const decisionColumns = [
    { field: 'id', header: 'ID', width: '6%' },
    { field: 'timestamp', header: 'TIMESTAMP (UTC)', width: '18%' },
    { field: 'action', header: 'ACTION', width: '14%' },
    { field: 'engine_id', header: 'ENGINE', width: '10%' },
    { field: 'cycle', header: 'CYCLE', width: '10%', render: (val, row) => `${row.cycle} cycles` },
    { field: 'reviewer_id', header: 'REVIEWER', width: '12%', render: (val, row) => row.reviewer_id || 'SYSTEM' },
    {
      field: 'row_hash',
      header: 'SHA-256 ROW HASH',
      width: '20%',
      render: (val, row) => (
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <span className="text-text-2 truncate max-w-32">{row.row_hash}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(row.row_hash);
            }}
            className="text-text-muted hover:text-text p-0.5 rounded-sm cursor-pointer"
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
      width: '10%',
      render: (val, row) => (
        <span className="font-mono text-xs text-text-muted truncate max-w-24 block">
          {row.prev_hash?.slice(0, 8)}...
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-5 select-none overflow-y-auto pr-1">
      {/* Top Tabs */}
      <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-3 rounded-lg">
        <div className="flex items-center gap-2">
          {[
            { id: 'decision', label: 'Decision Audit Trail', icon: ShieldCheck },
            { id: 'model', label: 'Model Governance', icon: FileCheck },
            { id: 'claims', label: 'Claims Matrix', icon: ScrollText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-accent text-accent font-semibold'
                    : 'border-transparent text-text-2 hover:text-text-main'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={verifyChain} disabled={isVerifying}>
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>Verify Hash Chain</span>
          </Button>
        </div>
      </div>

      {/* TAB 1: DECISION AUDIT */}
      {activeTab === 'decision' && (
        <div className="space-y-4">
          {/* Status banner */}
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-center justify-between ${
              verificationResult?.ok
                ? 'bg-status-healthy-bg border-status-healthy-border text-status-healthy-text'
                : 'bg-status-critical-bg border-status-critical-border text-status-critical-text'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {verificationResult?.ok ? <ShieldCheck className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
              <div>
                <span className="font-semibold block text-sm">
                  {verificationResult?.ok ? 'Cryptographic Hash Chain: VERIFIED' : 'Cryptographic Hash Chain: TAMPERED OR UNVERIFIED'}
                </span>
                <span className="opacity-90">{verificationResult?.message}</span>
              </div>
            </div>
            <ProvenanceTag type="LIVE" />
          </div>

          <Card className="p-0 overflow-hidden">
            <TableShell
              columns={decisionColumns}
              data={auditRows}
              loading={loading}
              emptyMessage="No audit records logged."
            />
          </Card>
        </div>
      )}

      {/* TAB 2: MODEL GOVERNANCE */}
      {activeTab === 'model' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="Model Verdict" value="WEAK" provenance="AUDIT" tooltip="Model authentically trained but does not beat tree baselines on same features." />
            <MetricCard label="Audited Test RMSE" value="16.1972" provenance="C-MAPSS" tooltip="Evaluated on 100 test engines with RUL cap 125." />
            <MetricCard label="ONNX Engine Latency" value="0.042 ms" provenance="BENCHMARK" tooltip="Direct batch-1 ONNX Runtime execution." />
            <MetricCard label="HTTP API Latency (p50)" value="8.444 ms" provenance="BENCHMARK" tooltip="End-to-end FastAPI serialization + DB write." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Allowed Quotes */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-status-healthy-text uppercase tracking-wider flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>Numbers You May Quote (Audited & Verified)</span>
              </h3>
              <div className="divide-y divide-border text-xs font-mono">
                {(governanceModel?.allowed_quotes || []).map((q, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-text-main block">{q.metric}</span>
                      <span className="text-text-muted font-sans text-xs">{q.context}</span>
                    </div>
                    <span className="text-accent font-bold text-sm">{q.value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Forbidden Quotes */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-semibold text-status-critical-text uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>Numbers You May NOT Quote (Debunked)</span>
              </h3>
              <div className="divide-y divide-border text-xs font-mono">
                {(governanceModel?.forbidden_quotes || []).map((q, idx) => (
                  <div key={idx} className="py-2 space-y-1">
                    <span className="font-semibold text-status-critical-text block line-through">{q.claim}</span>
                    <span className="text-text-muted font-sans text-xs block">{q.reason}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-border text-xs">
            <span className="text-text-muted">
              Official Model Audit Snapshot: SHA-256 verified artifact manifest
            </span>
            <a
              href="/audit/MODEL_AUDIT.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline font-mono flex items-center gap-1.5"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>View Raw MODEL_AUDIT.md</span>
            </a>
          </div>
        </div>
      )}

      {/* TAB 3: CLAIMS MATRIX */}
      {activeTab === 'claims' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-semibold text-text-main">TwinEdge Claims Register & Honesty Protocol</h2>
              <p className="text-xs text-text-muted mt-0.5">Strict distinction between empirically proven claims vs forbidden marketing claims.</p>
            </div>
            <ProvenanceTag type="AUDIT" />
          </div>

          <div className="space-y-4 text-xs font-sans">
            <div className="p-4 rounded-md bg-surface-2 border border-border">
              <h4 className="font-semibold text-text-main text-xs uppercase tracking-wider mb-2">Permitted Statements</h4>
              <ul className="list-disc pl-5 space-y-1.5 text-text-2">
                <li>NASA C-MAPSS FD001 benchmark test RMSE is 16.197 under capped ground truth convention (RUL &le; 125).</li>
                <li>1D-CNN architecture sliding window N=30, 14 sensor features, 16,805 parameters.</li>
                <li>Edge feature extraction reduces telemetry payload by over 99% compared to raw tensors.</li>
                <li>Audit trail is protected with SHA-256 cryptographic hash pointers.</li>
              </ul>
            </div>

            <div className="p-4 rounded-md bg-status-critical-bg/20 border border-status-critical-border text-status-critical-text">
              <h4 className="font-semibold text-xs uppercase tracking-wider mb-2">Strictly Forbidden Statements</h4>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>NO claims of FAA / EASA / DO-178C flight airworthiness certification.</li>
                <li>NO claims of physics-based or finite-element digital twins (surrogate data model only).</li>
                <li>NO claims of 100% heuristic confidence or fabricated certainty metrics.</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
