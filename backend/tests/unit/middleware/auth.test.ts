import { describe, it, expect, vi, beforeEach } from "vitest";
import { optionalAuth, requireAuth } from "../../../src/middleware/auth.js";
import type { Request, Response, NextFunction } from "express";

vi.mock("../../../src/config/supabase.js", () => ({
  getSupabaseClient: vi.fn(),
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
};

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as Request;
}

function mockRes(): Response {
  return {} as Response;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe("auth middleware", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { getSupabaseClient } = await import("../../../src/config/supabase.js");
    vi.mocked(getSupabaseClient).mockReturnValue(mockSupabase as never);
  });

  describe("optionalAuth", () => {
    it("sets req.user to null when no Authorization header", async () => {
      const req = mockReq({ headers: {} });
      const res = mockRes();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
    });

    it("sets req.user to null when Authorization is not Bearer", async () => {
      const req = mockReq({ headers: { authorization: "Basic xyz" } });
      const res = mockRes();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSupabase.auth.getUser).not.toHaveBeenCalled();
    });

    it("sets req.user to null when token is invalid", async () => {
      const req = mockReq({ headers: { authorization: "Bearer bad-token" } });
      const res = mockRes();
      const next = mockNext();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid token" },
      });

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSupabase.auth.getUser).toHaveBeenCalledWith("bad-token");
    });

    it("sets req.user when token is valid", async () => {
      const req = mockReq({ headers: { authorization: "Bearer valid-token" } });
      const res = mockRes();
      const next = mockNext();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: "user-123",
            email: "u@example.com",
            user_metadata: { full_name: "Test User" },
          },
        },
        error: null,
      });

      await optionalAuth(req, res, next);

      expect(req.user).toEqual({
        id: "user-123",
        email: "u@example.com",
        name: "Test User",
      });
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("uses email prefix as name when user_metadata has no name", async () => {
      const req = mockReq({ headers: { authorization: "Bearer t" } });
      const res = mockRes();
      const next = mockNext();
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: "u1",
            email: "alice@example.com",
            user_metadata: {},
          },
        },
        error: null,
      });

      await optionalAuth(req, res, next);

      expect(req.user?.name).toBe("alice");
    });
  });

  describe("requireAuth", () => {
    it("calls next() with unauthorized error when req.user is null", () => {
      const req = mockReq();
      (req as { user?: unknown }).user = null;
      const res = mockRes();
      const next = mockNext();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toMatchObject({ statusCode: 401, message: "Authentication required" });
    });

    it("calls next() with no args when req.user is set", () => {
      const req = mockReq();
      (req as { user?: unknown }).user = { id: "u1", email: "a@b.com", name: "A" };
      const res = mockRes();
      const next = mockNext();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
