"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button size="icon" variant="ghost" disabled className="size-9" aria-hidden>
        <Sun className="h-4 w-4 opacity-0" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-9 text-foreground hover:text-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-current" aria-hidden />
      ) : (
        <Moon className="h-4 w-4 text-current" aria-hidden />
      )}
    </Button>
  );
}


