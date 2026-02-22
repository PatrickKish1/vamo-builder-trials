"use client";

import { cn } from "@/lib/utils";
import { getFileIconProps } from "@/lib/file-icons";
import { X } from "lucide-react";
import { Fragment } from "react";

type TabsBarProps = {
  paths: string[];
  activePath?: string;
  dirtyFiles?: string[];
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

export function TabsBar({ paths, activePath, dirtyFiles = [], onSelect, onClose }: TabsBarProps) {
  if (paths.length === 0) {
    return <div className="border-b h-9 bg-muted/40" />;
  }

  return (
    <div className="border-b bg-muted/30">
      <div className="flex min-h-9 items-center overflow-x-auto">
        <div className="flex min-h-9 items-center gap-1 px-2 py-1">
          {paths.map((path) => {
            const isActive = activePath === path;
            const isDirty = dirtyFiles.includes(path);
            const icon = getFileIconProps(path);

            return (
              <Fragment key={path}>
                <div
                  className={cn(
                    "group flex flex-none items-center gap-2 rounded px-2 py-1 text-sm transition-colors",
                    "max-w-[220px] min-w-[160px]",
                    isActive ? "bg-card text-card-foreground shadow-sm" : "hover:bg-accent"
                  )}
                  onClick={() => onSelect(path)}
                >
                  <img
                    src={icon.src || "/icons/file.svg"}
                    alt={icon.alt || `${path} icon`}
                    className="h-4 w-4 flex-shrink-0 object-contain"
                    onError={(event) => {
                      (event.target as HTMLImageElement).src = "/icons/file.svg";
                    }}
                  />
                  <span className="truncate flex-1">{path.split("/").pop() || path}</span>
                  {isDirty && <span className="h-2 w-2 rounded-full bg-primary" />}
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(path);
                    }}
                    aria-label={`Close ${path}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
