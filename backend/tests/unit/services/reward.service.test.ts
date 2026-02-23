import { describe, it, expect, vi, beforeEach } from "vitest";
import { award, type RewardEventType } from "../../../src/services/reward.service.js";

vi.mock("../../../src/config/supabase.js", () => ({
  getSupabaseClientWithAuth: vi.fn(),
}));

const mockRpc = vi.fn();

beforeEach(async () => {
  vi.resetAllMocks();
  const { getSupabaseClientWithAuth } = await import("../../../src/config/supabase.js");
  vi.mocked(getSupabaseClientWithAuth).mockReturnValue({
    rpc: mockRpc,
  } as never);
});

describe("reward.service", () => {
  const accessToken = "token";
  const projectId = "project-1";
  const idempotencyKey = "msg-1-prompt";

  it("returns reward result when RPC succeeds", async () => {
    mockRpc.mockResolvedValue({
      data: {
        rewarded: true,
        amount: 1,
        new_balance: 11,
        idempotent: false,
      },
      error: null,
    });

    const result = await award(accessToken, projectId, "prompt" as RewardEventType, idempotencyKey);

    expect(mockRpc).toHaveBeenCalledWith("reward_user", {
      p_project_id: projectId,
      p_event_type: "prompt",
      p_idempotency_key: idempotencyKey,
    });
    expect(result).toEqual({
      rewarded: true,
      amount: 1,
      new_balance: 11,
      idempotent: false,
    });
  });

  it("passes null projectId when awarding non-project event", async () => {
    mockRpc.mockResolvedValue({
      data: { rewarded: true, amount: 5, new_balance: 15 },
      error: null,
    });

    await award(accessToken, null, "link_github" as RewardEventType, "link-1-link_github");

    expect(mockRpc).toHaveBeenCalledWith("reward_user", {
      p_project_id: null,
      p_event_type: "link_github",
      p_idempotency_key: "link-1-link_github",
    });
  });

  it("returns rewarded false and error message when RPC fails", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Rate limit exceeded" },
    });

    const result = await award(accessToken, projectId, "prompt" as RewardEventType, idempotencyKey);

    expect(result).toEqual({
      rewarded: false,
      amount: 0,
      new_balance: 0,
      error: "Rate limit exceeded",
    });
  });

  it("returns idempotent result when key already used", async () => {
    mockRpc.mockResolvedValue({
      data: {
        rewarded: true,
        amount: 1,
        new_balance: 10,
        idempotent: true,
      },
      error: null,
    });

    const result = await award(accessToken, projectId, "prompt" as RewardEventType, idempotencyKey);

    expect(result.idempotent).toBe(true);
    expect(result.rewarded).toBe(true);
  });
});
