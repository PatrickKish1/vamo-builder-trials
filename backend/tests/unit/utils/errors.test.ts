import { describe, it, expect } from "vitest";
import {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  dbError,
  isAppError,
  isSupabaseAuthError,
} from "../../../src/utils/errors.js";

describe("errors", () => {
  it("should create AppError with message and statusCode", () => {
    const err = new AppError("Not found", 404);
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("AppError");
  });

  it("should create badRequest (400)", () => {
    const err = badRequest("Invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Invalid input");
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("should create unauthorized (401)", () => {
    const err = unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("should create unauthorized with custom message", () => {
    const err = unauthorized("Token expired");
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Token expired");
  });

  it("should create forbidden (403)", () => {
    const err = forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("Forbidden");
  });

  it("should create forbidden with custom message", () => {
    const err = forbidden("Access denied");
    expect(err.message).toBe("Access denied");
  });

  it("should create notFound (404)", () => {
    const err = notFound("Project missing");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Project missing");
  });

  it("should create dbError (500)", () => {
    const err = dbError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("DB_ERROR");
    expect(err.message).toContain("database");
  });

  it("should create dbError with custom message", () => {
    const err = dbError("Connection failed");
    expect(err.message).toBe("Connection failed");
  });

  it("isAppError should identify AppError instances", () => {
    expect(isAppError(new AppError("x", 500))).toBe(true);
    expect(isAppError(badRequest("y"))).toBe(true);
    expect(isAppError(new Error("z"))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  describe("isSupabaseAuthError", () => {
    it("returns true for JWT-related codes", () => {
      expect(isSupabaseAuthError({ code: "401" })).toBe(true);
      expect(isSupabaseAuthError({ code: "PGRST301" })).toBe(true);
      expect(isSupabaseAuthError({ code: "jwt_expired" })).toBe(true);
      expect(isSupabaseAuthError({ code: "invalid_jwt" })).toBe(true);
    });

    it("returns true when message contains auth-related terms", () => {
      expect(isSupabaseAuthError({ message: "JWT expired" })).toBe(true);
      expect(isSupabaseAuthError({ message: "Invalid token" })).toBe(true);
      expect(isSupabaseAuthError({ message: "Unauthorized" })).toBe(true);
    });

    it("returns false for null or non-auth errors", () => {
      expect(isSupabaseAuthError(null)).toBe(false);
      expect(isSupabaseAuthError({ message: "Network error" })).toBe(false);
      expect(isSupabaseAuthError({ code: "23505" })).toBe(false);
    });
  });
});
