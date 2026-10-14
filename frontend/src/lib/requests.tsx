// 업무 요청 API 응답 타입과 화면 표시용 이름 (README 업무 요청 API 기준)
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED';
export type UserSummary = { id: string; name: string; email: string };

export type WorkRequest = {
  id: string;
  template: { id: string; name: string };
  title: string;
  content: string;
  status: RequestStatus;
  requester: UserSummary;
  assignee: UserSummary | null;
  approvedBy: UserSummary | null;
  approvedAt: string | null;
  rejectedBy: UserSummary | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HistoryItem = {
  action: string;
  summary: string;
  actor: { id: string; name: string };
  createdAt: string;
};

export type RequestDetail = WorkRequest & { history: HistoryItem[] };
export type Page<T> = { items: T[]; page: number; limit: number; total: number };

export const REQUEST_STATUS: Record<RequestStatus, string> = {
  PENDING: '승인 대기',
  APPROVED: '승인됨',
  REJECTED: '반려',
  CANCELLED: '취소',
  IN_PROGRESS: '진행 중',
  COMPLETED: '완료',
};

const STATUS_STYLE: Record<RequestStatus, string> = {
  PENDING: 'bg-[#F6EBD4] text-[#7A5A1E]',
  APPROVED: 'bg-[#E3EAF3] text-navy',
  REJECTED: 'bg-[#F3E1DF] text-[#8A3D37]',
  CANCELLED: 'bg-[#ECEBE6] text-[#83827D]',
  IN_PROGRESS: 'bg-[#E3EAF3] text-navy',
  COMPLETED: 'bg-[#E2EFE6] text-[#2F6B45]',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-block text-[11px] font-semibold rounded px-2 py-0.5 ${STATUS_STYLE[status]}`}>
      {REQUEST_STATUS[status]}
    </span>
  );
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR');
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
