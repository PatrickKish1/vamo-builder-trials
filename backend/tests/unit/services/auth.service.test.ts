import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  login,
  signup,
  getSessionUser,
  logout,
} from "../../../src/services/auth.service.js";

vi.mock("../../../src/config/supabase.js", () => ({
  getSupabaseClient: vi.fn(),
}));

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    getUser: vi.fn(),
  },
};

beforeEach(async () => {
  vi.resetAllMocks();
  const { getSupabaseClient } = await import("../../../src/config/supabase.js");
  vi.mocked(getSupabaseClient).mockReturnValue(mockSupabase as never);
});

describe("auth.service", () => {
  describe("login", () => {
    it("should return session and user when credentials are valid", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: "user-1",
            email: "u@example.com",
            user_metadata: { full_name: "User One" },
          },
          session: { user: { id: "user-1" }, access_token: "token-123" },
        },
        error: null,
      });

      const result = await login("u@example.com", "password");

      expect(result.session).toBeDefined();
      expect((result.session as { userId: string; token: string }).userId).toBe("user-1");
      expect((result.session as { userId: string; token: string }).token).toBe("token-123");
      expect(result.user.id).toBe("user-1");
      expect(result.user.email).toBe("u@example.com");
      expect(result.user.name).toBe("User One");
    });

    it("should throw on invalid credentials", async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      });

      await expect(login("bad@example.com", "wrong")).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid login credentials",
      });
    });
  });

  describe("signup", () => {
    it("should return session and user when signup succeeds", async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: {
            id: "user-2",
            email: "new@example.com",
            user_metadata: { full_name: "New User" },
          },
          session: { user: { id: "user-2" }, access_token: "token-456" },
        },
        error: null,
      });

      const result = await signup("new@example.com", "secret", "New User");

      expect(result.user.email).toBe("new@example.com");
      expect(result.user.name).toBe("New User");
      expect(result.session).toBeDefined();
      expect((result.session as { token: string }).token).toBe("token-456");
    });

    it("should throw when signup fails", async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "User already registered" },
      });

      await expect(
        signup("existing@example.com", "pass")
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "User already registered",
      });
    });
  });

  describe("getSessionUser", () => {
    it("should return user and authenticated true when token is valid", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: "user-3",
            email: "s@example.com",
            user_metadata: { name: "Session User" },
          },
        },
        error: null,
      });

      const result = await getSessionUser("valid-token");

      expect(result.authenticated).toBe(true);
      expect(result.user?.id).toBe("user-3");
      expect(result.user?.name).toBe("Session User");
    });

    it("should return authenticated false when token is invalid", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Invalid token" },
      });

      const result = await getSessionUser("bad-token");

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });
  });

  describe("logout", () => {
    it("should return success", () => {
      const result = logout();
      expect(result).toEqual({ success: true });
    });
  });
});
