import { describe, it, expect, vi, beforeEach } from "vitest";

// SCRUM-342 regression (SCRUM-340 class): createLesson / updateLesson /
// deleteLesson mutated lesson rows by a caller-supplied courseId/lessonId via
// the RLS-bypassing db() helper, gated only by the caller's own org role — so
// an admin of org X could add/edit/delete lessons on org Y's course. The
// lesson's parent course must belong to the caller's org.

const mockGetUser = vi.fn();
const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  }),
}));

const mockDbFrom = vi.fn();
vi.mock("@/lib/supabase/db", () => ({ db: () => ({ from: mockDbFrom }) }));

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import {
  createLesson,
  updateLesson,
  deleteLesson,
} from "@/app/(dashboard)/train/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockChain(result: { data: unknown; error?: unknown }): any {
  const payload = { error: null, ...result };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(payload),
    then: (onFulfilled: (value: typeof payload) => unknown) =>
      Promise.resolve(payload).then(onFulfilled),
  };
  return chain;
}

const validLesson = {
  title: "Intro to MMC",
  content: "Lesson body content.",
  sort_order: 0,
  quiz_questions: [],
  estimated_reading_minutes: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  // admin of org-1
  mockServerFrom.mockReturnValue(
    mockChain({
      data: { id: "prof-1", org_id: "org-1", role: "owner", full_name: "X" },
    }),
  );
});

describe("createLesson — cross-tenant isolation (SCRUM-342)", () => {
  it("rejects adding a lesson to a course owned by another org", async () => {
    mockDbFrom.mockReturnValueOnce(mockChain({ data: null })); // course-in-org check: miss

    const result = await createLesson("course-foreign", validLesson);

    expect(result).toEqual({ error: "Course not found" });
    expect(mockDbFrom).toHaveBeenCalledTimes(1); // never reached the insert
  });

  it("creates the lesson when the course belongs to the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { id: "course-1" } })) // course-in-org: hit
      .mockReturnValueOnce(mockChain({ data: { id: "lesson-1" } })); // insert

    const result = await createLesson("course-1", validLesson);

    expect(result).toEqual({ lessonId: "lesson-1" });
  });
});

describe("updateLesson — cross-tenant isolation (SCRUM-342)", () => {
  it("rejects editing a lesson whose course is in another org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { course_id: "course-1" } })) // lesson
      .mockReturnValueOnce(mockChain({ data: null })); // course-in-org: miss

    const result = await updateLesson("lesson-foreign", { title: "hacked" });

    expect(result).toEqual({ error: "Lesson not found" });
    expect(mockDbFrom).toHaveBeenCalledTimes(2); // never reached the update
  });

  it("updates when the lesson's course belongs to the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { course_id: "course-1" } })) // lesson
      .mockReturnValueOnce(mockChain({ data: { id: "course-1" } })) // course-in-org: hit
      .mockReturnValueOnce(mockChain({ data: null })); // update

    const result = await updateLesson("lesson-1", { title: "New title" });

    expect(result).toEqual({ success: true });
  });
});

describe("deleteLesson — cross-tenant isolation (SCRUM-342)", () => {
  it("rejects deleting a lesson whose course is in another org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { course_id: "course-1" } })) // lesson
      .mockReturnValueOnce(mockChain({ data: null })); // course-in-org: miss

    const result = await deleteLesson("lesson-foreign");

    expect(result).toEqual({ error: "Lesson not found" });
    expect(mockDbFrom).toHaveBeenCalledTimes(2); // never reached the delete
  });

  it("deletes when the lesson's course belongs to the caller's org", async () => {
    mockDbFrom
      .mockReturnValueOnce(mockChain({ data: { course_id: "course-1" } })) // lesson
      .mockReturnValueOnce(mockChain({ data: { id: "course-1" } })) // course-in-org: hit
      .mockReturnValueOnce(mockChain({ data: null })); // delete

    const result = await deleteLesson("lesson-1");

    expect(result).toEqual({ success: true });
  });

  it("rejects a non-admin caller", async () => {
    mockServerFrom.mockReturnValue(
      mockChain({
        data: { id: "prof-2", org_id: "org-1", role: "member", full_name: "Y" },
      }),
    );

    const result = await deleteLesson("lesson-1");

    expect(result).toEqual({ error: "Admin access required" });
    expect(mockDbFrom).not.toHaveBeenCalled();
  });
});
