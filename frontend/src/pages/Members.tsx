import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { ROLE_LABEL, useAuth, type Role } from '../lib/auth';
import { formatDate, formatDateTime } from '../lib/requests';

// GET /api/users 응답 (AUTH-007)
type Member = { id: string; name: string; email: string; role: Role; status: 'ACTIVE' | 'INACTIVE'; joinedAt: string };
type Invitation = { id: string; email: string; role: Role; status: 'INVITED' | 'EXPIRED'; invitedAt: string; expiresAt: string };
type MemberList = { members: Member[]; invitations: Invitation[] };
// POST /api/auth/invitations, /api/invitations/:id/resend 응답
type IssuedInvitation = { id: string; email: string; role: Role; expiresAt: string; token: string };

const ROLES: Role[] = ['MEMBER', 'MANAGER', 'ADMIN'];
const INVITABLE: Role[] = ['MEMBER', 'MANAGER']; // ADMIN은 초대로 줄 수 없고 역할 변경으로만 (AUTH-005)

const errorText = (e: unknown) =>
  e instanceof ApiError ? `${e.message} (${e.status})` : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

const field = 'border border-[#DEDDD7] rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy';
const small = 'border border-[#DEDDD7] rounded px-2.5 py-1 text-xs font-semibold bg-white hover:bg-[#F4F4F2] disabled:opacity-50';
const muted = 'text-[#83827D]';

function Pill({ tone, children }: { tone: 'green' | 'gray' | 'amber' | 'red'; children: string }) {
  const style = {
    green: 'bg-[#E2EFE6] text-[#2F6B45]',
    gray: 'bg-[#ECEBE6] text-[#83827D]',
    amber: 'bg-[#F6EBD4] text-[#7A5A1E]',
    red: 'bg-[#F3E1DF] text-[#8A3D37]',
  }[tone];
  return <span className={`inline-block text-[11px] font-semibold rounded px-2 py-0.5 ${style}`}>{children}</span>;
}

// 이메일 발송 기능이 없어 관리자가 토큰을 직접 전달한다. 응답에서만 한 번 보이므로 화면에 띄운다.
function TokenNotice({ issued, onClose }: { issued: IssuedInvitation; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="bg-[#E3EAF3] border border-[#C5D3E4] rounded px-5 py-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <p>
          <strong>{issued.email}</strong> ({ROLE_LABEL[issued.role]}) 초대 토큰이 발급되었습니다. 이메일 발송 기능이 없으니 아래 토큰을
          직접 전달해 주세요. 이 화면을 벗어나면 다시 볼 수 없습니다.
        </p>
        <button type="button" onClick={onClose} className="text-xs text-navy shrink-0 hover:underline">
          닫기
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code data-testid="invite-token" className="flex-1 min-w-0 break-all bg-white border border-[#C5D3E4] rounded px-3 py-2 text-xs">
          {issued.token}
        </code>
        <button
          type="button"
          className={small}
          onClick={() => navigator.clipboard.writeText(issued.token).then(() => setCopied(true), () => {})}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <p className="mt-2 text-xs text-[#4A4945]">만료: {formatDateTime(issued.expiresAt)}</p>
    </div>
  );
}

export default function Members() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [data, setData] = useState<MemberList | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');

  const load = useCallback(
    () => api<MemberList>('/users').then(setData, (e) => setError(errorText(e))),
    [],
  );
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // 행 단위 작업 공통: 실패하면 메시지를 띄우고, 성공·실패 모두 목록을 다시 받아 서버 상태와 맞춘다
  async function run(rowId: string, work: () => Promise<unknown>) {
    setBusyId(rowId);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      await load();
      setBusyId(null);
    }
  }

  function changeRole(m: Member, next: Role) {
    if (!confirm(`${m.name}님의 역할을 ${ROLE_LABEL[m.role]} → ${ROLE_LABEL[next]}(으)로 바꿀까요?`)) return;
    run(m.id, () => api(`/users/${m.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: next }) }));
  }

  function deactivate(m: Member) {
    if (!confirm(`${m.name}님을 비활성화할까요? 즉시 로그아웃되고 다시 로그인할 수 없습니다. (재활성화 기능 없음)`)) return;
    run(m.id, () => api(`/users/${m.id}/deactivate`, { method: 'PATCH' }));
  }

  function resend(inv: Invitation) {
    run(inv.id, async () => setIssued(await api<IssuedInvitation>(`/invitations/${inv.id}/resend`, { method: 'POST' })));
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    await run('invite', async () => {
      setIssued(await api<IssuedInvitation>('/auth/invitations', { method: 'POST', body: JSON.stringify({ email, role }) }));
      setInviting(false);
      setEmail('');
      setRole('MEMBER');
    });
  }

  if (!isAdmin)
    return (
      <div className="bg-white border border-[#DEDDD7] rounded px-6 py-16 text-center text-sm text-[#83827D]">
        구성원 관리는 Admin만 사용할 수 있습니다.
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className={`text-sm ${muted}`}>
          {data && `구성원 ${data.members.length}명 · 초대 중 ${data.invitations.length}건`}
        </p>
        {!inviting && (
          <button type="button" onClick={() => setInviting(true)} className="bg-navy text-white text-sm font-semibold rounded px-4 py-2">
            + 구성원 초대
          </button>
        )}
      </div>

      {inviting && (
        <form onSubmit={invite} className="bg-white border border-[#DEDDD7] rounded px-5 py-4 flex flex-wrap items-end gap-3" aria-label="구성원 초대">
          <div className="flex-1 min-w-56">
            <label htmlFor="invite-email" className="block text-xs font-semibold mb-1">
              이메일
            </label>
            <input id="invite-email" type="email" required maxLength={255} className={`${field} w-full`} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="invite-role" className="block text-xs font-semibold mb-1">
              역할
            </label>
            <select id="invite-role" className={field} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {INVITABLE.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busyId === 'invite'} className="bg-navy text-white text-sm font-semibold rounded px-4 py-2 disabled:opacity-50">
            초대 토큰 발급
          </button>
          <button type="button" onClick={() => setInviting(false)} className="text-sm text-[#4A4945] px-2 py-2">
            취소
          </button>
        </form>
      )}

      {issued && <TokenNotice issued={issued} onClose={() => setIssued(null)} />}
      {error && (
        <p role="alert" className="text-sm text-[#8A3D37] bg-[#FBF3F2] border border-[#E5C4C0] rounded px-4 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-[#DEDDD7] rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[#83827D] border-b border-[#DEDDD7]">
            <tr>
              {['이름', '이메일', '역할', '상태', '가입일', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEDE8]">
            {data?.members.map((m) => {
              const isSelf = m.id === user?.id;
              const editable = !isSelf && m.status === 'ACTIVE';
              return (
                <tr key={m.id} data-email={m.email}>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">{m.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{m.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {editable ? (
                      <select
                        aria-label={`${m.name} 역할`}
                        className="border border-[#DEDDD7] rounded px-2 py-1 text-sm bg-white disabled:opacity-50"
                        value={m.role}
                        disabled={busyId === m.id}
                        onChange={(e) => changeRole(m, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABEL[m.role]
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.status === 'ACTIVE' ? <Pill tone="green">활성</Pill> : <Pill tone="gray">비활성</Pill>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#4A4945]">{formatDate(m.joinedAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {isSelf ? (
                      <span className={`text-xs ${muted}`}>본인</span>
                    ) : (
                      editable && (
                        <button type="button" className={`${small} text-[#8A3D37]`} disabled={busyId === m.id} onClick={() => deactivate(m)}>
                          비활성화
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {data?.invitations.map((inv) => (
              <tr key={inv.id} data-email={inv.email}>
                <td className={`px-4 py-3 ${muted}`}>-</td>
                <td className="px-4 py-3 whitespace-nowrap">{inv.email}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  초대 중 <span className={`text-xs ${muted}`}>({ROLE_LABEL[inv.role]})</span>
                </td>
                <td className="px-4 py-3">
                  {inv.status === 'INVITED' ? <Pill tone="amber">초대 중</Pill> : <Pill tone="red">초대 만료</Pill>}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-xs ${muted}`}>{formatDate(inv.invitedAt)} 초대</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" className={small} disabled={busyId === inv.id} onClick={() => resend(inv)}>
                    초대 재발송
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data && !error && <p className="px-4 py-10 text-center text-sm text-[#83827D]">불러오는 중...</p>}
      </div>
    </div>
  );
}
