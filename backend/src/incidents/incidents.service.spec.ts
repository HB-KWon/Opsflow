import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { ROLES_KEY } from "../auth/decorators";
import { UserRole } from "../users/user-role.enum";
import { CreateIncidentDto, ListIncidentsQuery } from "./dto/incidents.dto";
import { Incident, IncidentStatus, Severity } from "./incident.entity";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";

const ORG = "11111111-1111-4111-8111-111111111111";
const MANAGER = {
  id: "manager",
  name: "매니저",
  role: UserRole.MANAGER,
  organizationId: ORG,
} as never;
const reporter = { id: "reporter", name: "등록자", email: "r@x.test" };

describe("IncidentsService", () => {
  let row: Incident;
  let manager: Record<string, jest.Mock>;
  let audit: { record: jest.Mock; historyOf: jest.Mock };
  let notes: { find: jest.Mock };
  let service: IncidentsService;

  const mkIncident = (over: Partial<Incident> = {}) =>
    Object.assign(new Incident(), {
      id: "inc-1",
      organizationId: ORG,
      title: "t",
      description: "d",
      status: IncidentStatus.INVESTIGATING,
      severity: Severity.MEDIUM,
      peakSeverity: Severity.MEDIUM,
      reporterId: reporter.id,
      reporter,
      assigneeId: "manager",
      assignee: null,
      postmortemWrittenAt: null,
      ...over,
    });

  beforeEach(() => {
    row = mkIncident();
    manager = {
      findOne: jest.fn(async () => row),
      insert: jest.fn(async () => ({ identifiers: [{ id: "inc-1" }] })),
      save: jest.fn(async (e) => e),
      create: jest.fn((_e, data) => ({
        id: "note-1",
        createdAt: new Date(),
        ...data,
      })),
    };
    audit = { record: jest.fn(), historyOf: jest.fn() };
    notes = { find: jest.fn() };
    const incidents = { findOne: jest.fn(async () => row) };
    const dataSource = {
      transaction: (work: (m: unknown) => unknown) => work(manager),
    };
    service = new IncidentsService(
      incidents as never,
      notes as never,
      dataSource as never,
      audit as never,
    );
  });

  describe("create (IC-001)", () => {
    it("심각도를 생략하면 MEDIUM, OPEN으로 만들고 peak도 같은 값으로 시작한다", async () => {
      await service.create(MANAGER, { title: "t", description: "d" });
      expect(manager.insert).toHaveBeenCalledWith(
        Incident,
        expect.objectContaining({
          status: IncidentStatus.OPEN,
          severity: Severity.MEDIUM,
          peakSeverity: Severity.MEDIUM,
          reporterId: "manager",
        }),
      );
    });

    it("초기 심각도를 주면 peak도 그 값으로 시작한다", async () => {
      await service.create(MANAGER, {
        title: "t",
        description: "d",
        severity: Severity.CRITICAL,
      });
      expect(manager.insert.mock.calls[0][1]).toMatchObject({
        severity: Severity.CRITICAL,
        peakSeverity: Severity.CRITICAL,
      });
    });

    it("응답에 peakSeverity를 넣지 않는다", async () => {
      const result = await service.create(MANAGER, {
        title: "t",
        description: "d",
      });
      expect(result).not.toHaveProperty("peakSeverity");
    });
  });

  describe("changeSeverity (IC-007) — peak는 올라가기만 한다", () => {
    it.each([
      // [현재, peak, 새 값, 기대 peak]
      [Severity.MEDIUM, Severity.MEDIUM, Severity.CRITICAL, Severity.CRITICAL],
      [Severity.CRITICAL, Severity.CRITICAL, Severity.LOW, Severity.CRITICAL],
      [Severity.LOW, Severity.HIGH, Severity.MEDIUM, Severity.HIGH],
      [Severity.LOW, Severity.HIGH, Severity.CRITICAL, Severity.CRITICAL],
    ])(
      "%s(peak %s) → %s 이면 peak %s",
      async (severity, peakSeverity, next, expectedPeak) => {
        row = mkIncident({ severity, peakSeverity });
        await service.changeSeverity(MANAGER, "inc-1", { severity: next });
        expect(manager.save).toHaveBeenCalledWith(
          expect.objectContaining({
            severity: next,
            peakSeverity: expectedPeak,
          }),
        );
      },
    );

    it("peak가 오를 때만 감사 로그에 peakSeverity 변화를 남긴다", async () => {
      row = mkIncident({
        severity: Severity.CRITICAL,
        peakSeverity: Severity.CRITICAL,
      });
      await service.changeSeverity(MANAGER, "inc-1", {
        severity: Severity.LOW,
      });
      expect(audit.record.mock.calls[0][1].changes).toEqual({
        severity: { from: Severity.CRITICAL, to: Severity.LOW },
      });

      audit.record.mockClear();
      row = mkIncident({
        severity: Severity.LOW,
        peakSeverity: Severity.MEDIUM,
      });
      await service.changeSeverity(MANAGER, "inc-1", {
        severity: Severity.HIGH,
      });
      expect(audit.record.mock.calls[0][1].changes).toEqual({
        severity: { from: Severity.LOW, to: Severity.HIGH },
        peakSeverity: { from: Severity.MEDIUM, to: Severity.HIGH },
      });
    });

    it("같은 심각도면 저장·감사 로그 없음", async () => {
      await service.changeSeverity(MANAGER, "inc-1", {
        severity: Severity.MEDIUM,
      });
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it("IC-010: Critical로 올렸다가 Low로 낮춰도 Postmortem 없이는 종료할 수 없다", async () => {
    row = mkIncident({
      severity: Severity.MEDIUM,
      peakSeverity: Severity.MEDIUM,
    });
    await service.changeSeverity(MANAGER, "inc-1", {
      severity: Severity.CRITICAL,
    });
    await service.changeSeverity(MANAGER, "inc-1", { severity: Severity.LOW });
    row.status = IncidentStatus.RESOLVED;
    expect(row.peakSeverity).toBe(Severity.CRITICAL);
    await expect(service.close(MANAGER, "inc-1")).rejects.toMatchObject({
      status: 409,
    });
  });

  describe("assign (IC-004, IC-005)", () => {
    it("OPEN이면 지정과 함께 INVESTIGATING으로 바꾸고, 자기 자신도 지정할 수 있다", async () => {
      row = mkIncident({ status: IncidentStatus.OPEN, assigneeId: null });
      manager.findOne.mockImplementation(async (entity) =>
        entity === Incident ? row : { id: "manager", name: "매니저" },
      );
      await service.assign(MANAGER, "inc-1", { assigneeId: "manager" });
      expect(row).toMatchObject({
        status: IncidentStatus.INVESTIGATING,
        assigneeId: "manager",
      });
      expect(audit.record.mock.calls[0][1].action).toBe("ASSIGNED");
    });

    it("같은 사람으로 다시 지정하면 변경 없이 성공한다", async () => {
      manager.findOne.mockImplementation(async (entity) =>
        entity === Incident ? row : { id: "manager", name: "매니저" },
      );
      await service.assign(MANAGER, "inc-1", { assigneeId: "manager" });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it("비활성·다른 조직 사용자는 400 (조회 조건에 같은 조직·활성을 건다)", async () => {
      manager.findOne.mockImplementation(async (entity) =>
        entity === Incident ? row : null,
      );
      await expect(
        service.assign(MANAGER, "inc-1", { assigneeId: "x" }),
      ).rejects.toThrow(BadRequestException);
      expect(manager.findOne).toHaveBeenLastCalledWith(expect.anything(), {
        where: { id: "x", organizationId: ORG, isActive: true },
      });
    });
  });

  it("다른 조직이거나 없는 장애는 404", async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.resolve(MANAGER, "x")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("IC-009: Postmortem을 처음 쓰면 WRITTEN, 다시 쓰면 UPDATED로 남기고 본문은 감사 로그에 넣지 않는다", async () => {
    row = mkIncident({ status: IncidentStatus.RESOLVED });
    const dto = { cause: "원인", action: "조치", prevention: "방지" };
    await service.writePostmortem(MANAGER, "inc-1", dto);
    await service.writePostmortem(MANAGER, "inc-1", dto);
    expect(audit.record.mock.calls.map((c) => c[1].action)).toEqual([
      "POSTMORTEM_WRITTEN",
      "POSTMORTEM_UPDATED",
    ]);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("원인");
  });

  describe("대응 기록과 타임라인 (IC-003, IC-006)", () => {
    it("기록 본문은 incident_notes에 저장하고 감사 로그에는 noteId만 남긴다", async () => {
      const item = await service.addNote(MANAGER, "inc-1", {
        content: "DB 재시작",
      });
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ incidentId: "inc-1", content: "DB 재시작" }),
      );
      expect(audit.record.mock.calls[0][1]).toMatchObject({
        action: "NOTE_ADDED",
        changes: { noteId: "note-1" },
      });
      expect(item).toMatchObject({
        content: "DB 재시작",
        actor: { id: "manager", name: "매니저" },
      });
    });

    it("상세의 timeline은 감사 로그 순서 그대로, NOTE_ADDED 항목에 본문을 붙인다", async () => {
      const at = (s: number) => new Date(s * 1000);
      audit.historyOf.mockResolvedValue([
        {
          action: "CREATED",
          summary: "장애 등록",
          changes: null,
          actor: reporter,
          createdAt: at(1),
        },
        {
          action: "NOTE_ADDED",
          summary: "대응 기록 추가",
          changes: { noteId: "n1" },
          actor: reporter,
          createdAt: at(2),
        },
        {
          action: "RESOLVED",
          summary: "해결 처리",
          changes: null,
          actor: reporter,
          createdAt: at(3),
        },
      ]);
      notes.find.mockResolvedValue([{ id: "n1", content: "원인 파악 중" }]);

      const detail = await service.findOne(MANAGER, "inc-1");

      expect(notes.find).toHaveBeenCalledWith({
        where: { incidentId: "inc-1" },
      });
      expect(detail.timeline.map((t) => [t.action, t.content])).toEqual([
        ["CREATED", undefined],
        ["NOTE_ADDED", "원인 파악 중"],
        ["RESOLVED", undefined],
      ]);
    });
  });
});

describe("IncidentsController 역할 제한", () => {
  it.each(["assign", "close"] as const)(
    "%s는 Manager·Admin 전용 (Member 403)",
    (method) => {
      expect(
        Reflect.getMetadata(ROLES_KEY, IncidentsController.prototype[method]),
      ).toEqual([UserRole.MANAGER, UserRole.ADMIN]);
    },
  );

  it.each([
    "create",
    "list",
    "findOne",
    "addNote",
    "changeSeverity",
    "resolve",
    "writePostmortem",
  ] as const)(
    "%s는 역할 제한 없이 서비스에서 담당자 관계로 검사한다",
    (method) => {
      expect(
        Reflect.getMetadata(ROLES_KEY, IncidentsController.prototype[method]),
      ).toBeUndefined();
    },
  );
});

describe("INCIDENT DTO 검증", () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it.each([
    ["심각도 소문자", { title: "t", description: "d", severity: "high" }],
    ["제목 없음", { description: "d" }],
    [
      "peakSeverity 직접 지정",
      { title: "t", description: "d", peakSeverity: "LOW" },
    ],
  ])("생성: %s → 400", async (_label, body) => {
    await expect(
      pipe.transform(body, { type: "body", metatype: CreateIncidentDto }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    [{ limit: "101" }],
    [{ severity: "URGENT" }],
    [{ sort: "peak_severity" }],
  ])("목록 쿼리 %o → 400", async (query) => {
    await expect(
      pipe.transform(query, { type: "query", metatype: ListIncidentsQuery }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});
