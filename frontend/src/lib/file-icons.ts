import { getIconForFile } from "vscode-icons-js";
import { getClassWithColor } from "file-icons-js";

export type FileIcon = string | { url: string; alt?: string };

type FileIconCacheValue = {
  src: string;
  alt: string;
};

const DEFAULT_ICON = "/icons/file.svg";
const ICON_BASE = "https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@latest/icons/";
const iconCache = new Map<string, FileIconCacheValue>();

function buildIconUrl(iconName?: string | null): string | null {
  if (!iconName) {
    return null;
  }

  let normalized = iconName.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("https://") || normalized.startsWith("http://")) {
    return normalized;
  }

  normalized = normalized.replace(/^(\.\/)+/g, "");
  normalized = normalized.replace(/^(\.\.\/)+/g, "");
  normalized = normalized.replace(/^\/+/g, "");

  if (!normalized) {
    return null;
  }

  return `${ICON_BASE}${normalized}`;
}

function getVscodeIcon(path: string): FileIconCacheValue | null {
  const fileName = path.split("/").pop() || path;

  try {
    const iconName = getIconForFile?.(fileName);
    const sanitized = buildIconUrl(iconName);
    if (sanitized) {
      return { src: sanitized, alt: `${fileName} icon` };
    }
  } catch (error) {
    // fall through
  }

  return null;
}

function buildFallbackIcon(path: string): FileIconCacheValue {
  const extension = path.includes(".") ? path.split(".").pop() || "file" : "file";
  const result = getClassWithColor(path);
  const color = result?.color;

  if (color) {
    const svg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}"><path d="M6 2a2 2 0 0 0-2 2v16a1 1 0 0 0 1.447.894L12 18.118l6.553 2.776A1 1 0 0 0 20 20V4a2 2 0 0 0-2-2H6Zm0 2h12v14.382l-5.553-2.352a1 1 0 0 0-.894 0L6 18.382V4Zm3 3v2h6V7H9Zm0 4v2h6v-2H9Z"/></svg>`,
    );
    return {
      src: `data:image/svg+xml,${svg}`,
      alt: `${extension} icon`,
    };
  }

  return {
    src: DEFAULT_ICON,
    alt: `${extension} icon`,
  };
}

export function getFileIconProps(path: string): FileIconCacheValue {
  if (iconCache.has(path)) {
    return iconCache.get(path)!;
  }

  const vscodeIcon = getVscodeIcon(path);
  if (vscodeIcon) {
    iconCache.set(path, vscodeIcon);
    return vscodeIcon;
  }

  const fallback = buildFallbackIcon(path);
  iconCache.set(path, fallback);
  return fallback;
}

export function addIconMapping(extensions: string[], icon: FileIcon): void {
  extensions.forEach((extension) => {
    iconCache.set(extension, {
      src: typeof icon === "string" ? icon : icon.url,
      alt: icon && typeof icon === "object" && icon.alt ? icon.alt : `${extension} icon`,
    });
  });
}

export function setFileIcon(path: string, icon: FileIcon): void {
  iconCache.set(path, {
    src: typeof icon === "string" ? icon : icon.url,
    alt: typeof icon === "string" ? `${path} icon` : icon.alt || `${path} icon`,
  });
}

