"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant";
}

function Message({ from, className, children, ...props }: MessageProps) {
  return (
    <div
      data-from={from}
      className={cn(
        "group flex gap-3",
        from === "user" ? "justify-end" : "justify-start",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface MessageAvatarProps extends React.ComponentProps<typeof Avatar> {
  src?: string;
  name?: string;
}

function MessageAvatar({ src, name, className, ...props }: MessageAvatarProps) {
  return (
    <Avatar
      className={cn(
        "h-8 w-8 border-2 border-border ring-2 ring-background",
        className
      )}
      {...props}
    >
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback>
        {name ? name.slice(0, 2).toUpperCase() : "?"}
      </AvatarFallback>
    </Avatar>
  );
}

interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "contained" | "flat";
}

function MessageContent({
  variant = "contained",
  className,
  children,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(
        "rounded-lg",
        variant === "contained" && [
          "px-4 py-2",
          "[.group[data-from=user]_&]:bg-primary [.group[data-from=user]_&]:text-primary-foreground",
          "[.group[data-from=assistant]_&]:bg-muted [.group[data-from=assistant]_&]:text-foreground",
        ],
        variant === "flat" && [
          "px-2 py-1",
          "[.group[data-from=user]_&]:bg-primary [.group[data-from=user]_&]:text-primary-foreground",
        ],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Message, MessageAvatar, MessageContent };

