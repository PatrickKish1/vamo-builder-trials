import { describe, it, expect, afterEach } from "vitest";
import { apiV1, getApiUrl } from "@/lib/api";

describe("api", () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
  });

  describe("getApiUrl", () => {
    it("returns empty string when NEXT_PUBLIC_API_URL is unset (proxy mode)", () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      expect(getApiUrl()).toBe("");
    });

    it("returns base URL without trailing slash", () => {
      process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000/";
      expect(getApiUrl()).toBe("http://localhost:4000");
    });

    it("returns base URL when no trailing slash", () => {
      process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
      expect(getApiUrl()).toBe("http://localhost:4000");
    });
  });

  describe("apiV1", () => {
    it("returns same-origin path when base is empty (proxy mode)", () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      expect(apiV1("/auth/session")).toBe("/api/v1/auth/session");
      expect(apiV1("auth/login")).toBe("/api/v1/auth/login");
    });

    it("prepends base URL when NEXT_PUBLIC_API_URL is set", () => {
      process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
      expect(apiV1("/auth/session")).toBe("http://localhost:4000/api/v1/auth/session");
      expect(apiV1("builder/projects")).toBe("http://localhost:4000/api/v1/builder/projects");
    });

    it("normalizes path to start with single slash", () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      expect(apiV1("auth/login")).toBe("/api/v1/auth/login");
    });
  });
});
