import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MetricCard, Chip, ProvenanceTag, Card, CardHeader, Button, TableShell, Input, Drawer } from '../components/ui';
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
} from 'lucide-react';

export default function AlertsPage() {
  const { dataSource, alerts, setAlerts, setPendingAlertCount } = useApp();

  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [reviewerId, setReviewerId] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionAction, setDecisionAction] = useState('approve');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
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

  const handleOpenSignoff = (alertItem, action) => {
    setSignoffError('');
    if (!reviewerId.trim()) {
      setSignoffError('Reviewer ID is required for audit trail sign-off.');
      return;
    }
    if (action === 'reject' && !decisionNotes.trim()) {
      setSignoffError('Decision notes are mandatory when rejecting an alert.');
      return;
    }
    setDecisionAction(action);
    setIsConfirmOpen(true);
  };

  const handleExecuteSignoff = async () => {
    if (!selectedAlert) return;
    try {
      await api.signoffAlert(selectedAlert.id, {
        reviewer_id: reviewerId.trim(),
        action: decisionAction,
        notes: decisionNotes.trim(),
      });
      setIsConfirmOpen(false);
      setSelectedAlert(null);
      setDecisionNotes('');
      fetchAlerts();
    } catch (err) {
      setSignoffError(err.message || 'Failed to submit sign-off');
      setIsConfirmOpen(false);
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === 'ALL') return true;
    return a.status === statusFilter;
  });

  const pendingCount = alerts.filter((a) => a.status === 'PENDING').length;
  const approvedCount = alerts.filter((a) => a.status === 'APPROVED').length;
  const rejectedCount = alerts.filter((a) => a.status === 'REJECTED').length;

  const columns = [
    {
      field: 'id',
      header: 'Alert ID',
      width: '18%',
      render: (val) => <span className="font-mono text-xs">{val.slice(0, 8)}...</span>,
    },
    {
      field: 'engine_id',
      header: 'Engine ID',
      width: '14%',
      render: (val) => <span className="font-mono font-semibold">#{String(val).padStart(3, '0')}</span>,
    },
    { field: 'cycle', header: 'Cycle', width: '12%' },
    {
      field: 'rul_prediction',
      header: 'RUL projection',
      width: '16%',
      render: (val) => `${val} cycles`,
    },
    {
      field: 'status',
      header: 'Status band',
      width: '16%',
      render: (val) => <Chip status={val} />,
    },
    { field: 'reviewer_id', header: 'Reviewer', width: '14%' },
    { field: 'timestamp', header: 'Raised at', width: '22%' },
  ];

  return (
    <div className="flex flex-col h-full gap-6 select-none">
      {/* KPI Cards Header */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Pending alerts" value={pendingCount} provenance="LIVE" />
        <MetricCard label="Approved" value={approvedCount} provenance="LIVE" />
        <MetricCard label="Rejected" value={rejectedCount} provenance="LIVE" />
        <MetricCard
          label="Gating policy"
          value={`T<${HEALTH_CONFIG.ALERT_THRESHOLD_T}, K=${HEALTH_CONFIG.ALERT_SUSTAINED_K}`}
          provenance="STATIC"
          tooltip="Requires 3 consecutive cycles with RUL < 60 to raise an alert."
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Table View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-text-main">
                Fleet alerts queue
              </span>
              <ProvenanceTag type="LIVE" />
            </div>

            <div className="flex items-center gap-1.5 text-xs bg-surface-2 p-1 rounded-md border border-border">
              <span className="text-text-muted px-2">Filter:</span>
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-accent text-on-accent font-semibold shadow-xs'
                      : 'text-text-2 hover:text-text-main'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <TableShell
              columns={columns}
              data={filteredAlerts}
              keyField="id"
              onRowClick={(row) => setSelectedAlert(row)}
              selectedKey={selectedAlert?.id}
              exportFileName="twinedge_alerts.csv"
              emptyMessage="No alerts logged in the system."
              isLoading={loading}
            />
          </div>
        </div>

        {/* Detail & Sign-off Drawer */}
        {selectedAlert && (
          <Drawer
            isOpen={Boolean(selectedAlert)}
            onClose={() => setSelectedAlert(null)}
            title={`Alert #${selectedAlert.id.slice(0, 8)}`}
            width="max-w-md"
          >
            <div className="space-y-5">
              <div className="space-y-1">
                <span className="text-xs text-text-muted">Engine & cycle</span>
                <div className="font-mono text-base font-semibold text-text-main">
                  Engine #{selectedAlert.engine_id} &middot; Cycle {selectedAlert.cycle}
                </div>
                <div className="text-xs text-text-2">
                  RUL prediction: <strong className="text-status-critical-text font-mono">{selectedAlert.rul_prediction} cycles</strong>
                </div>
              </div>

              {/* Templated Work Order Suggestion */}
              <div className="p-4 rounded-md bg-surface-2 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-text-2">
                  <span>Work-order template</span>
                  <ProvenanceTag type="STATIC" />
                </div>
                <div className="font-mono text-xs text-text-main bg-surface p-3 rounded-md border border-border">
                  DISPATCH: Borescope inspection on HPC stage 3 stators and blade tip clearance.
                </div>
                <p className="text-xs text-text-muted">
                  Prototype template suggestion. Requires formal sign-off triage before execution.
                </p>
              </div>

              {/* Reviewer ID & Action Contract */}
              <div className="space-y-4 pt-3 border-t border-border">
                <div>
                  <label className="text-xs font-medium text-text-2 block mb-1.5">
                    Reviewer ID <span className="text-status-critical-text">*</span>
                  </label>
                  <Input
                    type="text"
                    value={reviewerId}
                    onChange={(e) => setReviewerId(e.target.value)}
                    placeholder="e.g. MRO-TECH-042"
                    className="w-full font-mono text-xs"
                  />
                  <span className="text-xs text-text-muted mt-1 block">
                    Reviewer ID is recorded, not licence-verified (Rule H4).
                  </span>
                </div>

                <div>
                  <label className="text-xs font-medium text-text-2 block mb-1.5">
                    Decision notes
                  </label>
                  <textarea
                    rows={3}
                    value={decisionNotes}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                    placeholder="Required if rejecting alert..."
                    className="w-full bg-surface border border-border rounded-md p-3 text-text-main font-mono text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                {signoffError && (
                  <div className="p-3 rounded-md bg-status-critical-bg border border-status-critical-border text-status-critical-text text-xs">
                    {signoffError}
                  </div>
                )}

                {/* Sign-off Actions */}
                {dataSource !== 'LIVE' ? (
                  <div className="p-3 rounded-md bg-surface-2 border border-border text-xs text-text-muted italic">
                    Sign-off contract is active in Live source only. Currently in {dataSource} mode.
                  </div>
                ) : selectedAlert.status !== 'PENDING' ? (
                  <div className="p-3 rounded-md bg-status-healthy-bg border border-status-healthy-border text-xs text-status-healthy-text font-medium">
                    Alert already finalized with status: <strong>{selectedAlert.status}</strong>
                  </div>
                ) : (
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="primary"
                      onClick={() => handleOpenSignoff(selectedAlert, 'approve')}
                      className="flex-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Approve</span>
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleOpenSignoff(selectedAlert, 'reject')}
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Drawer>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title={`Confirm alert ${decisionAction}`}
        message={`Are you sure you want to ${decisionAction} alert for Engine #${selectedAlert?.engine_id}? This creates an immutable cryptographic audit entry.`}
        confirmText={decisionAction === 'approve' ? 'Approve alert' : 'Reject alert'}
        confirmVariant={decisionAction === 'approve' ? 'primary' : 'danger'}
        onConfirm={handleExecuteSignoff}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
