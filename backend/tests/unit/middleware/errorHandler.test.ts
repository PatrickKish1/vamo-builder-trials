import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorHandler } from "../../../src/middleware/errorHandler.js";
import { AppError, badRequest } from "../../../src/utils/errors.js";
import type { Request, Response } from "express";

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("errorHandler", () => {
  const req = {} as Request;
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends AppError status and message with code", () => {
    const res = mockRes();
    const err = badRequest("Invalid input");

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid input",
      code: "BAD_REQUEST",
    });
  });

  it("sends 401 for unauthorized AppError", () => {
    const res = mockRes();
    const err = new AppError("Unauthorized", 401, "UNAUTHORIZED");

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("sends 413 for PayloadTooLargeError", () => {
    const res = mockRes();
    const err = new Error("payload too large");
    err.name = "PayloadTooLargeError";

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: "Request body too large. Try sending less context (e.g. fewer or smaller files).",
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("sends 413 for entity.too.large type", () => {
    const res = mockRes();
    const err = new Error("too large");
    (err as { type?: string }).type = "entity.too.large";

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
  });

  it("sends 500 with generic message for Postgres errors (never exposes DB message)", () => {
    const res = mockRes();
    const err = { code: "23505", message: "duplicate key value violates unique constraint" };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "A database error occurred. Please try again.",
      code: "DB_ERROR",
    });
  });

  it("sends 500 INTERNAL_ERROR for generic Error", () => {
    const res = mockRes();
    const err = new Error("Something broke");

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
    });
  });

  it("sends 500 for non-Error thrown values", () => {
    const res = mockRes();

    errorHandler("string error", req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
    });
  });
});
