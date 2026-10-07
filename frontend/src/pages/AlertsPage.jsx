import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';
import DataTable from '../components/common/DataTable';
import ConfirmModal from '../components/common/ConfirmModal';
import { api } from '../services/api';
import { HEALTH_CONFIG } from '../config/rubrics';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  ShieldAlert,
  X,
  Send,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export default function AlertsPage() {
  const { dataSource, alerts, setAlerts, setPendingAlertCount } = useApp();

  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [reviewerId, setReviewerId] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionAction, setDecisionAction] = useState('approve');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lastAuditResult, setLastAuditResult] = useState(null);
  const [signoffError, setSignoffError] = useState('');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const data = await api.getAlerts();
      setAlerts(data);
      const pending = data.filter((a) => a.status === 'PENDING').length;
      setPendingAlertCount(pending);
    } catch (err) {
      console.warn('Failed to fetch alerts from backend:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleOpenSignoff = (alert, action) => {
    setSelectedAlert(alert);
    setDecisionAction(action);
    setSignoffError('');
    setIsConfirmOpen(true);
  };

  const handleExecuteSignoff = async () => {
    if (!reviewerId.trim()) {
      setSignoffError('Reviewer ID is required.');
      return;
    }
    if (decisionAction === 'reject' && !decisionNotes.trim()) {
      setSignoffError('Notes are strictly required when rejecting an alert.');
      return;
    }

    try {
      const res = await api.postSignoff(selectedAlert.id, {
        action: decisionAction,
        reviewer_id: reviewerId.trim(),
        notes: decisionNotes.trim(),
      });
      setLastAuditResult(res.audit_entry);
      setIsConfirmOpen(false);
      setDecisionNotes('');
      fetchAlerts();
    } catch (err) {
      setSignoffError(err.message);
    }
  };

  // Metrics
  const pendingCount = alerts.filter((a) => a.status === 'PENDING').length;
  const approvedCount = alerts.filter((a) => a.status === 'APPROVED').length;
  const rejectedCount = alerts.filter((a) => a.status === 'REJECTED').length;

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === 'ALL') return true;
    return a.status === statusFilter;
  });

  const columns = [
    { field: 'id', header: 'ALERT ID', width: '15%' },
    { field: 'engine_id', header: 'ENGINE', width: '10%' },
    { field: 'cycle', header: 'CYCLE', width: '10%' },
    {
      field: 'rul_prediction',
      header: 'PRED RUL',
      width: '12%',
      render: (val) => `${val} cyc`,
    },
    {
      field: 'status',
      header: 'STATUS',
      width: '15%',
      render: (val) => <StatusBadge status={val} />,
    },
    { field: 'reviewer_id', header: 'REVIEWER', width: '15%' },
    { field: 'timestamp', header: 'RAISED AT', width: '23%' },
  ];

  return (
    <div className="flex flex-col h-full gap-4 select-none">
      {/* KPI Cards Header */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Pending Alerts" value={pendingCount} provenance="LIVE" />
        <MetricCard label="Approved" value={approvedCount} provenance="LIVE" />
        <MetricCard label="Rejected" value={rejectedCount} provenance="LIVE" />
        <MetricCard
          label="Gating Policy"
          value={`T<${HEALTH_CONFIG.ALERT_THRESHOLD_T}, K=${HEALTH_CONFIG.ALERT_SUSTAINED_K}`}
          provenance="STATIC"
          tooltip="Requires 3 consecutive cycles with RUL < 60 to raise an alert."
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Table View */}
        <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded shadow-md overflow-hidden">
          <div className="p-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Fleet Alerts Queue
              </span>
              <ProvenanceTag type="LIVE" />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Filter:</span>
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2 py-0.5 rounded ${
                    statusFilter === st ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <DataTable
              columns={columns}
              data={filteredAlerts}
              keyField="id"
              onRowClick={(row) => setSelectedAlert(row)}
              selectedKey={selectedAlert?.id}
              exportFileName="twinedge_alerts.csv"
              emptyMessage="No alerts logged in the system."
            />
          </div>
        </div>

        {/* Detail & Sign-off Drawer */}
        {selectedAlert && (
          <div className="w-96 bg-slate-900 border border-slate-800 rounded shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-150">
            <div className="p-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-400" />
                <span className="text-xs font-bold text-white uppercase font-mono">
                  Alert #{selectedAlert.id.slice(0, 8)}
                </span>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-300">
              <div className="space-y-1">
                <span className="text-slate-400 text-[11px]">Engine & Cycle</span>
                <div className="font-mono text-base font-bold text-white">
                  Engine #{selectedAlert.engine_id} &middot; Cycle {selectedAlert.cycle}
                </div>
                <div className="text-slate-400 text-[11px]">
                  RUL Prediction: <strong className="text-rose-300 font-mono">{selectedAlert.rul_prediction} cycles</strong>
                </div>
              </div>

              {/* Templated Work Order Suggestion */}
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase">
                  <span>Work-Order Template</span>
                  <ProvenanceTag type="STATIC" />
                </div>
                <div className="font-mono text-[11px] text-slate-300 bg-slate-900 p-2 rounded border border-slate-800">
                  DISPATCH: Borescope inspection on HPC stage 3 stators and blade tip clearance.
                </div>
                <p className="text-[10px] text-slate-500">
                  Prototype template suggestion. Requires formal sign-off triage before execution.
                </p>
              </div>

              {/* Reviewer ID & Action Contract */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Reviewer ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={reviewerId}
                    onChange={(e) => setReviewerId(e.target.value)}
                    placeholder="e.g. MRO-TECH-042"
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100 font-mono text-xs focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Reviewer ID is recorded, not licence-verified (Rule H4).
                  </span>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Decision Notes</label>
                  <textarea
                    rows={2}
                    value={decisionNotes}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                    placeholder="Required if rejecting alert..."
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100 font-mono text-xs focus:border-indigo-500"
                  />
                </div>

                {signoffError && (
                  <div className="p-2 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px]">
                    {signoffError}
                  </div>
                )}

                {/* Sign-off Actions */}
                {dataSource !== 'Live' ? (
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-amber-300 italic">
                    Sign-off contract is active in Live source only. Currently in {dataSource} mode.
                  </div>
                ) : selectedAlert.status !== 'PENDING' ? (
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-emerald-400">
                    Alert already finalized with status: <strong>{selectedAlert.status}</strong>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleOpenSignoff(selectedAlert, 'approve')}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => handleOpenSignoff(selectedAlert, 'reject')}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title={`Confirm Alert ${decisionAction.toUpperCase()}`}
        message={`Are you sure you want to ${decisionAction} alert for Engine #${selectedAlert?.engine_id}? This creates an immutable cryptographic audit entry.`}
        confirmText={decisionAction === 'approve' ? 'Approve Alert' : 'Reject Alert'}
        confirmVariant={decisionAction === 'approve' ? 'primary' : 'danger'}
        onConfirm={handleExecuteSignoff}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
