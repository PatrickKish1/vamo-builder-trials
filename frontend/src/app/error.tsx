"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reportCrash } from "@/lib/crashReporter";

const ERROR_ILLUSTRATION =
  "https://cdni.iconscout.com/illustration/premium/thumb/404-error-illustration-svg-download-png-3119148.png";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const router = useRouter();

  useEffect(() => {
    reportCrash(error, { digest: error.digest });
  }, [error]);

  const handleTryAgain = () => {
    reset();
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <img
            src={ERROR_ILLUSTRATION}
            alt=""
            className="h-40 w-auto object-contain"
            width={320}
            height={240}
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Oops… we didn’t forecast this
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If reloading doesn’t fix it, reach out to the team so we can help. An error report was
            sent automatically.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button onClick={handleTryAgain} size="lg" className="gap-2 w-full sm:w-auto">
            Try again
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => router.push("/builder")}
          >
            Go to builder
          </Button>
        </div>

        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono" aria-hidden>
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
