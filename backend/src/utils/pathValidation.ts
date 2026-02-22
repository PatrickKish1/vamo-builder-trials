export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ALLOWED_EXTENSIONS = [
  "js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "h", "hpp",
  "go", "rs", "rb", "php", "swift", "kt", "scala", "clj", "ex", "exs",
  "html", "css", "scss", "sass", "less", "xml", "json", "yaml", "yml",
  "env", "gitignore", "dockerfile", "makefile", "cmake", "toml", "ini", "cfg", "conf",
  "md", "txt", "rst", "tex",
  "sh", "bash", "zsh", "fish", "ps1",
  "csv", "sql", "db",
  "",
];

export function sanitizePath(path: string): string {
  let sanitized = path.replace(/\.\./g, "").replace(/\\/g, "/");
  sanitized = sanitized.replace(/^\/+/, "");
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");
  return sanitized;
}

export function validateExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.includes(ext);
}

export function validatePath(path: string): boolean {
  if (path.includes("..")) return false;
  if (path.startsWith("/") || /^[A-Z]:\\/.test(path)) return false;
  if (/[\x00-\x1F\x7F]/.test(path)) return false;
  return true;
}

export function validateContentSize(content: string): boolean {
  return content.length <= MAX_FILE_SIZE;
}
