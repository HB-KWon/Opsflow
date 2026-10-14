import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

type Page<T> = { items: T[]; total: number };
type RequestItem = { id: string; title: string; status: string; createdAt: string };
type IncidentItem = { id: string; title: string; severity: string; createdAt: string };

const REQUEST_STATUS: Record<string, string> = {
  PENDING: '승인 대기',
  APPROVED: '승인됨',
  REJECTED: '반려',
  CANCELLED: '취소',
  IN_PROGRESS: '진행 중',
  COMPLETED: '완료',
};
const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-[#8A3D37] text-white',
  HIGH: 'bg-[#F3E1DF] text-[#8A3D37]',
  MEDIUM: 'bg-[#F6EBD4] text-[#7A5A1E]',
  LOW: 'bg-[#ECEBE6] text-[#4A4945]',
};

type Data = {
  stats: { label: string; value: number }[];
  recentRequests: RequestItem[];
  activeIncidents: IncidentItem[];
};

// 숫자는 목록 API의 total로 센다 (limit=1로 본문은 최소화). Member는 요청 API가 본인 관련 건만 주므로 숫자도 본인 기준.
async function load(): Promise<Data> {
  const page = <T,>(path: string) => api<Page<T>>(path);
  const [pending, inProgress, open, investigating, critical, criticalClosed, recent] = await Promise.all([
    page<RequestItem>('/requests?status=PENDING&limit=1'),
    page<RequestItem>('/requests?status=IN_PROGRESS&limit=1'),
    page<IncidentItem>('/incidents?status=OPEN&limit=3'),
    page<IncidentItem>('/incidents?status=INVESTIGATING&limit=3'),
    page<IncidentItem>('/incidents?severity=CRITICAL&limit=1'),
    page<IncidentItem>('/incidents?severity=CRITICAL&status=CLOSED&limit=1'),
    page<RequestItem>('/requests?limit=3'),
  ]);
  return {
    stats: [
      { label: '승인 대기 요청', value: pending.total },
      { label: '진행 중 요청', value: inProgress.total },
      { label: '진행 중 장애', value: open.total + investigating.total },
      // API에 "CLOSED 제외" 필터가 없어 전체 CRITICAL에서 CLOSED만 뺀다
      { label: 'Critical 장애', value: critical.total - criticalClosed.total },
    ],
    recentRequests: recent.items,
    // 두 상태에서 각각 최근 3건을 받아 합친 뒤 다시 최근 3건
    activeIncidents: [...open.items, ...investigating.items]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3),
  };
}

function Card({ title, link, children }: { title: string; link?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#DEDDD7] rounded">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#DEDDD7]">
        <h2 className="text-sm font-bold">{title}</h2>
        {link && (
          <Link to={link} className="text-xs text-navy hover:underline">
            전체 보기
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-5 py-6 text-sm text-[#83827D]">{text}</p>;

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    load().then(setData, () => setError(true));
  }, []);

  if (error) return <p role="alert" className="text-sm text-[#8A3D37]">대시보드를 불러오지 못했습니다.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(data?.stats ?? ['승인 대기 요청', '진행 중 요청', '진행 중 장애', 'Critical 장애'].map((label) => ({ label, value: null }))).map(
          (s) => (
            <div key={s.label} className="bg-white border border-[#DEDDD7] rounded px-5 py-4">
              <p className="text-xs text-[#83827D]">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value ?? '–'}</p>
            </div>
          ),
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="최근 업무 요청" link="/requests">
          {data && data.recentRequests.length === 0 && <Empty text="업무 요청이 없습니다." />}
          <ul className="divide-y divide-[#EEEDE8]">
            {data?.recentRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate">{r.title}</span>
                <span className="shrink-0 text-xs text-[#4A4945] border border-[#DEDDD7] rounded px-2 py-0.5">
                  {REQUEST_STATUS[r.status] ?? r.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="진행 중인 장애">
          {data && data.activeIncidents.length === 0 && <Empty text="진행 중인 장애가 없습니다." />}
          <ul className="divide-y divide-[#EEEDE8]">
            {data?.activeIncidents.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate">{i.title}</span>
                <span className={`shrink-0 text-[11px] font-semibold rounded px-2 py-0.5 ${SEVERITY_STYLE[i.severity] ?? ''}`}>
                  {i.severity}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
