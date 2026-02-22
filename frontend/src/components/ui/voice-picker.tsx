"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
}

interface VoicePickerProps {
  voices: Voice[];
  value?: string;
  onValueChange?: (voiceId: string) => void;
  placeholder?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function VoicePicker({
  voices,
  value,
  onValueChange,
  placeholder = "Select a voice...",
  className,
  open: controlledOpen,
  onOpenChange,
}: VoicePickerProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [searchTerm, setSearchTerm] = React.useState("");
  const audioRefs = React.useRef<Record<string, HTMLAudioElement | null>>({});

  const selectedVoice = voices.find((v) => v.voice_id === value);

  const filteredVoices = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return voices;
    }
    const lower = searchTerm.trim().toLowerCase();
    return voices.filter((voice) => voice.name.toLowerCase().includes(lower));
  }, [voices, searchTerm]);

  const handleAudioPlay = React.useCallback((voiceId: string) => {
    Object.entries(audioRefs.current).forEach(([id, element]) => {
      if (id !== voiceId && element) {
        element.pause();
      }
    });
  }, []);

  const handleVoiceToggle = React.useCallback(
    (voice: Voice, checked: boolean) => {
      if (checked) {
        onValueChange?.(voice.voice_id);
        setOpen(false);
      } else if (voice.voice_id === value) {
        onValueChange?.("");
      }
    },
    [onValueChange, setOpen, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedVoice ? selectedVoice.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-3 space-y-3" align="start">
        <Input
          placeholder="Search voices..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <div className="max-h-72 overflow-y-auto pr-2 space-y-2">
            {filteredVoices.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No voices found.
              </div>
            ) : (
              filteredVoices.map((voice) => (
                <div
                  key={voice.voice_id}
                  className={cn(
                    "border border-transparent rounded-md p-2 hover:border-border transition-colors",
                    value === voice.voice_id ? "bg-primary/5 border-primary/40" : "",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full shrink-0 bg-linear-to-br from-purple-500 via-blue-500 to-cyan-500 flex items-center justify-center text-white font-semibold text-lg">
                      {voice.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium leading-tight">{voice.name}</div>
                      {voice.preview_url ? (
                        <audio
                          className="mt-2 w-full"
                          preload="none"
                          controls
                          crossOrigin="anonymous"
                          ref={(element) => {
                            audioRefs.current[voice.voice_id] = element;
                          }}
                          onPlay={() => handleAudioPlay(voice.voice_id)}
                          src={voice.preview_url}
                        />
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground">
                          No preview available
                        </div>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                      checked={value === voice.voice_id}
                      onChange={(event) => handleVoiceToggle(voice, event.target.checked)}
                      aria-label={`Select ${voice.name}`}
                    />
                  </div>
                </div>
              ))
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

