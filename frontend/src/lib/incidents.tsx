// 장애 API 응답 타입과 화면 표시용 이름 (README 장애 대응 API 기준)
import type { UserSummary } from './requests';

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type Incident = {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: Severity;
  reporter: UserSummary;
  assignee: UserSummary | null;
  postmortem: { cause: string; action: string; prevention: string; writtenAt: string } | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// 대응 기록(NOTE_ADDED) 항목만 content가 있다
export type TimelineItem = {
  action: string;
  summary: string;
  actor: { id: string; name: string };
  createdAt: string;
  content?: string;
};

export type IncidentDetail = Incident & { timeline: TimelineItem[] };

export const INCIDENT_STATUS: Record<IncidentStatus, string> = {
  OPEN: '접수',
  INVESTIGATING: '조사 중',
  RESOLVED: '해결됨',
  CLOSED: '종료',
};

// 높은 것부터 (select 순서)
export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-[#8A3D37] text-white',
  HIGH: 'bg-[#F3E1DF] text-[#8A3D37]',
  MEDIUM: 'bg-[#F6EBD4] text-[#7A5A1E]',
  LOW: 'bg-[#ECEBE6] text-[#4A4945]',
};

const STATUS_STYLE: Record<IncidentStatus, string> = {
  OPEN: 'bg-[#F3E1DF] text-[#8A3D37]',
  INVESTIGATING: 'bg-[#E3EAF3] text-navy',
  RESOLVED: 'bg-[#E2EFE6] text-[#2F6B45]',
  CLOSED: 'bg-[#ECEBE6] text-[#83827D]',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-block text-[11px] font-semibold rounded px-2 py-0.5 ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={`inline-block text-[11px] font-semibold rounded px-2 py-0.5 ${STATUS_STYLE[status]}`}>
      {INCIDENT_STATUS[status]}
    </span>
  );
}
