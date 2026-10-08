import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, Button } from '../ui';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger', // 'danger' | 'primary'
  onConfirm,
  onCancel,
  children,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`w-5 h-5 flex-shrink-0 ${
              confirmVariant === 'danger'
                ? 'text-status-critical-text'
                : 'text-accent'
            }`}
          />
          <div className="text-sm text-text-2 leading-relaxed">
            {message && <p>{message}</p>}
            {children}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={confirmVariant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
