"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

interface MicSelectorProps {
  value?: string;
  onValueChange?: (deviceId: string) => void;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function useAudioDevices() {
  const [devices, setDevices] = React.useState<AudioDevice[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasPermission, setHasPermission] = React.useState(false);

  const loadDevices = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);
      stream.getTracks().forEach((track) => track.stop());

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = deviceList
        .filter((device) => device.kind === "audioinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          groupId: device.groupId,
        }));

      setDevices(audioInputs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
      setHasPermission(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDevices();
    const handleDeviceChange = () => loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [loadDevices]);

  return { devices, loading, error, hasPermission, loadDevices };
}

export function MicSelector({
  value,
  onValueChange,
  muted = false,
  onMutedChange,
  disabled = false,
  className,
}: MicSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [previewStream, setPreviewStream] = React.useState<MediaStream | null>(null);
  const { devices, loading, loadDevices } = useAudioDevices();

  const selectedDevice = devices.find((d) => d.deviceId === value) || devices[0];

  React.useEffect(() => {
    if (open && !disabled) {
      const startPreview = async () => {
        try {
          const constraints: MediaStreamConstraints = {
            audio: {
              ...(selectedDevice?.deviceId ? { deviceId: { exact: selectedDevice.deviceId } } : {}),
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000, // Higher quality sample rate
            },
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          setPreviewStream(stream);
        } catch (error) {
          console.error("Failed to start preview:", error);
          setPreviewStream(null);
        }
      };
      startPreview();
    } else {
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
        setPreviewStream(null);
      }
    }

    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
        setPreviewStream(null);
      }
    };
  }, [open, disabled, selectedDevice?.deviceId]);

  const handleSelect = (deviceId: string) => {
    onValueChange?.(deviceId);
  };

  const toggleMute = () => {
    onMutedChange?.(!muted);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || loading}
            onClick={() => {
              // Trigger device loading if needed
            }}
          >
            <Mic className="h-4 w-4 mr-2" />
            {selectedDevice?.label || "Select Microphone"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <div className="p-2">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Microphone Preview
            </div>
            <div className="mb-2">
              <LiveWaveform
                active={!muted && !!previewStream}
                stream={previewStream}
                mode="scrolling"
                height={40}
                barWidth={2}
                barGap={1}
              />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="h-8"
              >
                {muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              </Button>
              <span className="text-xs text-muted-foreground">
                {muted ? "Muted" : "Listening"}
              </span>
            </div>
          </div>
          <div className="border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground px-2 mb-1">
              Available Devices
            </div>
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => handleSelect(device.deviceId)}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent",
                  value === device.deviceId && "bg-accent font-medium"
                )}
              >
                {device.label}
              </button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleMute}
        disabled={disabled}
        className="h-9 w-9 p-0"
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    </div>
  );
}

