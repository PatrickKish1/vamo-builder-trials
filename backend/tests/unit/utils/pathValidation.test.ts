import { describe, it, expect } from "vitest";
import {
  sanitizePath,
  validateExtension,
  validatePath,
  validateContentSize,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
} from "../../../src/utils/pathValidation.js";

describe("pathValidation", () => {
  describe("sanitizePath", () => {
    it("removes literal .. segments (does not resolve path)", () => {
      expect(sanitizePath("../../etc/passwd")).toBe("etc/passwd");
      expect(sanitizePath("a/../b")).toBe("a//b"); // only strips "..", leaves slash
    });

    it("normalizes backslashes to forward slashes", () => {
      expect(sanitizePath("a\\b\\c")).toBe("a/b/c");
    });

    it("strips leading slashes", () => {
      expect(sanitizePath("/foo/bar")).toBe("foo/bar");
      expect(sanitizePath("///foo")).toBe("foo");
    });

    it("strips control characters and DEL", () => {
      expect(sanitizePath("a\x00b\x1fc")).toBe("abc");
      expect(sanitizePath("file\x7fname")).toBe("filename");
    });

    it("leaves safe relative paths unchanged except normalization", () => {
      expect(sanitizePath("src/index.ts")).toBe("src/index.ts");
      expect(sanitizePath("folder/sub/file.json")).toBe("folder/sub/file.json");
    });

    it("handles empty string", () => {
      expect(sanitizePath("")).toBe("");
    });
  });

  describe("validateExtension", () => {
    it("returns true for allowed extensions", () => {
      expect(validateExtension("file.ts")).toBe(true);
      expect(validateExtension("file.js")).toBe(true);
      expect(validateExtension("file.json")).toBe(true);
      expect(validateExtension("Dockerfile")).toBe(true);
      expect(validateExtension("README.md")).toBe(true);
      expect(validateExtension("script.sh")).toBe(true);
    });

    it("returns false for disallowed extensions", () => {
      expect(validateExtension("file.exe")).toBe(false);
      expect(validateExtension("file.dll")).toBe(false);
      expect(validateExtension("file.unknown")).toBe(false);
    });

    it("is case-insensitive for extension", () => {
      expect(validateExtension("file.TS")).toBe(true);
      expect(validateExtension("file.JSX")).toBe(true);
    });

    it("allows Makefile (no extension, name in allowed list)", () => {
      expect(validateExtension("Makefile")).toBe(true);
    });

    it("allows file with empty extension (trailing dot)", () => {
      expect(validateExtension("file.")).toBe(true);
    });
  });

  describe("validatePath", () => {
    it("returns false for path traversal", () => {
      expect(validatePath("..")).toBe(false);
      expect(validatePath("a/../b")).toBe(false);
      expect(validatePath("../foo")).toBe(false);
    });

    it("returns false for absolute paths", () => {
      expect(validatePath("/etc/passwd")).toBe(false);
      expect(validatePath("/foo/bar")).toBe(false);
    });

    it("returns false for Windows-style absolute paths", () => {
      expect(validatePath("C:\\Users\\file")).toBe(false);
      expect(validatePath("D:\\data")).toBe(false);
    });

    it("returns false for paths with control characters", () => {
      expect(validatePath("file\x00name")).toBe(false);
      expect(validatePath("a\x1fb")).toBe(false);
      expect(validatePath("path\x7f")).toBe(false);
    });

    it("returns true for safe relative paths", () => {
      expect(validatePath("src/index.ts")).toBe(true);
      expect(validatePath("folder/sub/file.json")).toBe(true);
      expect(validatePath("single")).toBe(true);
    });
  });

  describe("validateContentSize", () => {
    it("returns true when content is at or below MAX_FILE_SIZE", () => {
      expect(validateContentSize("")).toBe(true);
      expect(validateContentSize("a".repeat(MAX_FILE_SIZE))).toBe(true);
    });

    it("returns false when content exceeds MAX_FILE_SIZE", () => {
      expect(validateContentSize("a".repeat(MAX_FILE_SIZE + 1))).toBe(false);
    });

    it("respects MAX_FILE_SIZE constant (5MB)", () => {
      expect(MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
    });
  });
});
