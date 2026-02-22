import { describe, it, expect } from "vitest";
import {
  AppError,
  badRequest,
  unauthorized,
  notFound,
  isAppError,
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

  it("should create notFound (404)", () => {
    const err = notFound("Project missing");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Project missing");
  });

  it("isAppError should identify AppError instances", () => {
    expect(isAppError(new AppError("x", 500))).toBe(true);
    expect(isAppError(badRequest("y"))).toBe(true);
    expect(isAppError(new Error("z"))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});
