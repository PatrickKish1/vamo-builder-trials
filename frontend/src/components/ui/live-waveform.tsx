"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface LiveWaveformProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onError'> {
  active?: boolean;
  processing?: boolean;
  stream?: MediaStream | null;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  barColor?: string;
  fadeEdges?: boolean;
  fadeWidth?: number;
  height?: string | number;
  sensitivity?: number;
  smoothingTimeConstant?: number;
  fftSize?: number;
  historySize?: number;
  updateRate?: number;
  mode?: "scrolling" | "static";
  onError?: (error: Error) => void;
  onStreamReady?: (stream: MediaStream) => void;
  onStreamEnd?: () => void;
}

export function LiveWaveform({
  active = false,
  processing = false,
  stream: externalStream,
  barWidth = 3,
  barGap = 1,
  barRadius = 1.5,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 64,
  sensitivity = 1,
  smoothingTimeConstant = 0.8,
  fftSize = 256,
  historySize = 60,
  updateRate = 30,
  mode = "static",
  onError,
  onStreamReady,
  onStreamEnd,
  className,
  ...props
}: LiveWaveformProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const dataArrayRef = React.useRef<Uint8Array | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const historyRef = React.useRef<number[]>([]);
  const colorPhaseRef = React.useRef(0);

  // Initialize audio stream
  React.useEffect(() => {
    if (!active && !processing) {
      cleanup();
      return;
    }

    let mounted = true;

    const initAudio = async (useExternalStream?: MediaStream) => {
      try {
        let stream: MediaStream;
        
        if (useExternalStream) {
          stream = useExternalStream;
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        if (!mounted) {
          if (!useExternalStream) {
            stream.getTracks().forEach((track) => track.stop());
          }
          return;
        }

        streamRef.current = stream;
        if (!useExternalStream) {
          onStreamReady?.(stream);
        }

        if (typeof window === "undefined") return;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = smoothingTimeConstant;
        analyserRef.current = analyser;

        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onError?.(err);
        cleanup();
      }
    };

    if (active) {
      if (externalStream) {
        initAudio(externalStream);
      } else {
        initAudio();
      }
    }

    return () => {
      mounted = false;
      cleanup();
    };
  }, [active, processing, externalStream, fftSize, smoothingTimeConstant, onError, onStreamReady]);

  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // Only stop tracks if we created the stream ourselves (not external)
    if (streamRef.current && !externalStream) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      onStreamEnd?.();
    }
    streamRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
  };

  // Render waveform
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = (typeof height === "number" ? height : parseInt(height)) * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${typeof height === "number" ? height : height}px`;

    let lastUpdate = 0;

    const draw = (timestamp: number) => {
      if (timestamp - lastUpdate < updateRate) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      lastUpdate = timestamp;

      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const width = canvas.width / dpr;
      const canvasHeight = canvas.height / dpr;

      if (processing && !active) {
        // Processing animation
        const time = timestamp * 0.001;
        const bars = Math.floor(width / (barWidth + barGap));
        for (let i = 0; i < bars; i++) {
          const x = i * (barWidth + barGap);
          const wave = Math.sin(time * 2 + i * 0.2) * 0.5 + 0.5;
          const barHeight = wave * canvasHeight * 0.3;
          ctx.fillStyle = barColor || getComputedStyle(canvas).color || "#000";
          ctx.fillRect(x, (canvasHeight - barHeight) / 2, barWidth, barHeight);
        }
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      if (!active || !analyserRef.current || !dataArrayRef.current) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);

      const data = dataArrayRef.current;
      const bars = mode === "static" ? Math.floor(data.length / 2) : 1;
      const barColorStyle = barColor || getComputedStyle(canvas).color || "#000";

      if (mode === "static") {
        // Static mode: symmetric bars with pitch-based color coding
        const barCount = Math.min(bars, Math.floor(width / (barWidth + barGap)));
        const centerX = width / 2;
        
        // Calculate frequency range for color mapping
        // Higher frequencies (dataIndex closer to data.length) = higher pitch
        // Lower frequencies (dataIndex closer to 0) = lower pitch
        
        // Helper function to get color based on frequency (pitch)
        const getPitchColor = (freqIndex: number, totalBars: number, amplitude: number): string => {
          // Map frequency index to hue (0-360)
          // Low frequencies (bass) = red/orange (0-60)
          // Mid frequencies = yellow/green (60-180)
          // High frequencies (treble) = blue/purple (180-360)
          const normalizedFreq = freqIndex / totalBars;
          let hue = normalizedFreq * 360;
          
          // Enhance color based on amplitude
          const saturation = 70 + (amplitude * 30); // 70-100%
          const lightness = 50 + (amplitude * 20); // 50-70%
          
          // Convert HSL to RGB
          const h = hue / 360;
          const s = saturation / 100;
          const l = lightness / 100;
          
          const c = (1 - Math.abs(2 * l - 1)) * s;
          const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
          const m = l - c / 2;
          
          let r = 0, g = 0, b = 0;
          if (h < 1/6) { r = c; g = x; b = 0; }
          else if (h < 2/6) { r = x; g = c; b = 0; }
          else if (h < 3/6) { r = 0; g = c; b = x; }
          else if (h < 4/6) { r = 0; g = x; b = c; }
          else if (h < 5/6) { r = x; g = 0; b = c; }
          else { r = c; g = 0; b = x; }
          
          r = Math.round((r + m) * 255);
          g = Math.round((g + m) * 255);
          b = Math.round((b + m) * 255);
          
          return `rgb(${r}, ${g}, ${b})`;
        };

        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor((i / barCount) * data.length);
          const amplitude = (data[dataIndex] / 255) * sensitivity;
          const barHeight = amplitude * canvasHeight;

          const leftX = centerX - (i + 1) * (barWidth + barGap);
          const rightX = centerX + i * (barWidth + barGap);
          
          // Get color based on pitch (frequency) and amplitude
          const pitchColor = barColor || getPitchColor(i, barCount, Math.min(amplitude, 1));

          // Left bar
          if (leftX >= 0) {
            ctx.fillStyle = pitchColor;
            if (barRadius > 0 && typeof ctx.roundRect === "function") {
              ctx.beginPath();
              ctx.roundRect(leftX, (canvasHeight - barHeight) / 2, barWidth, barHeight, barRadius);
              ctx.fill();
            } else {
              ctx.fillRect(leftX, (canvasHeight - barHeight) / 2, barWidth, barHeight);
            }
          }

          // Right bar
          if (rightX + barWidth <= width) {
            ctx.fillStyle = pitchColor;
            if (barRadius > 0 && typeof ctx.roundRect === "function") {
              ctx.beginPath();
              ctx.roundRect(rightX, (canvasHeight - barHeight) / 2, barWidth, barHeight, barRadius);
              ctx.fill();
            } else {
              ctx.fillRect(rightX, (canvasHeight - barHeight) / 2, barWidth, barHeight);
            }
          }
        }

        // Animated RGB fade edges
        if (fadeEdges) {
          // Animate color phase (cycles through RGB)
          colorPhaseRef.current = (colorPhaseRef.current + 0.01) % (Math.PI * 2);
          const phase = colorPhaseRef.current;
          
          // Create pulsing RGB colors using sine waves for smooth transitions
          const r1 = Math.floor((Math.sin(phase) + 1) * 127.5);
          const g1 = Math.floor((Math.sin(phase + (2 * Math.PI / 3)) + 1) * 127.5);
          const b1 = Math.floor((Math.sin(phase + (4 * Math.PI / 3)) + 1) * 127.5);
          
          // Secondary phase offset for richer color mixing
          const phase2 = phase + Math.PI / 4;
          const r2 = Math.floor((Math.sin(phase2) + 1) * 127.5);
          const g2 = Math.floor((Math.sin(phase2 + (2 * Math.PI / 3)) + 1) * 127.5);
          const b2 = Math.floor((Math.sin(phase2 + (4 * Math.PI / 3)) + 1) * 127.5);
          
          // Mix colors with some intensity variation
          const intensity = 0.8 + 0.2 * Math.sin(phase * 2);
          
          // Left edge gradient
          const gradient = ctx.createLinearGradient(0, 0, fadeWidth, 0);
          gradient.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${intensity})`);
          gradient.addColorStop(0.5, `rgba(${r2}, ${g2}, ${b2}, ${intensity * 0.5})`);
          gradient.addColorStop(1, `rgba(${r1}, ${g1}, ${b1}, 0)`);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, fadeWidth, canvasHeight);

          // Right edge gradient (mirrored)
          const gradientRight = ctx.createLinearGradient(width - fadeWidth, 0, width, 0);
          gradientRight.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, 0)`);
          gradientRight.addColorStop(0.5, `rgba(${r2}, ${g2}, ${b2}, ${intensity * 0.5})`);
          gradientRight.addColorStop(1, `rgba(${r1}, ${g1}, ${b1}, ${intensity})`);
          ctx.fillStyle = gradientRight;
          ctx.fillRect(width - fadeWidth, 0, fadeWidth, canvasHeight);
        }
      } else {
        // Scrolling mode: timeline view
        const avgAmplitude = data.reduce((sum, val) => sum + val, 0) / data.length / 255;
        const normalizedAmplitude = avgAmplitude * sensitivity;
        historyRef.current.push(normalizedAmplitude);
        if (historyRef.current.length > historySize) {
          historyRef.current.shift();
        }

        const barCount = Math.min(historyRef.current.length, Math.floor(width / (barWidth + barGap)));
        for (let i = 0; i < barCount; i++) {
          const x = width - (i + 1) * (barWidth + barGap);
          const amp = historyRef.current[historyRef.current.length - 1 - i];
          const barHeight = amp * canvasHeight;

          ctx.fillStyle = barColorStyle;
          if (barRadius > 0 && typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, (canvasHeight - barHeight) / 2, barWidth, barHeight, barRadius);
            ctx.fill();
          } else {
            ctx.fillRect(x, (canvasHeight - barHeight) / 2, barWidth, barHeight);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [active, processing, mode, barWidth, barGap, barRadius, barColor, fadeEdges, fadeWidth, height, sensitivity, updateRate, historySize]);

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
      {...props}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

