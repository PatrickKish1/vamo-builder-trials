"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

const NOT_FOUND_ILLUSTRATION =
  "https://img.freepik.com/premium-vector/oops-404-error-with-broken-robot-concept-illustration_114360-1932.jpg";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <img
            src={NOT_FOUND_ILLUSTRATION}
            alt=""
            className="h-48 w-auto object-contain rounded-lg"
            width={400}
            height={300}
          />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Page not found
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This page doesn’t exist or was moved. Head back to the builder or home to continue.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/builder">Go to builder</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
