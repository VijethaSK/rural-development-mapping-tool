import React from 'react';
import { ComplaintStatus, StatusHistoryItem, AvailableTransition } from '../../types/citizen';
import { ComplaintLifecycleTimeline } from './ComplaintLifecycleTimeline';

interface Props {
  currentStatus: ComplaintStatus;
  statusHistory?: StatusHistoryItem[];
  complaintId?: string;
  availableTransitions?: AvailableTransition[];
  onTransitionSuccess?: (updatedComplaint: any) => void;
  readOnly?: boolean;
}

export function ComplaintLifecycleStepper({
  currentStatus,
  statusHistory = [],
  complaintId = '',
  availableTransitions = [],
  onTransitionSuccess,
  readOnly = false
}: Props) {
  return (
    <ComplaintLifecycleTimeline
      complaintId={complaintId}
      currentStatus={currentStatus}
      statusHistory={statusHistory}
      availableTransitions={availableTransitions}
      onTransitionSuccess={onTransitionSuccess}
      readOnly={readOnly}
    />
  );
}

export default ComplaintLifecycleStepper;
