"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowLeft, Rocket, TrendingUp } from "lucide-react";
import { apiV1 } from "@/lib/api";
import { SAMPLE_MARKETPLACE_LISTINGS } from "@/lib/marketplace-samples";

interface MarketplaceListing {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  progressScore: number;
  founderName: string | null;
  whyBuilt?: string | null;
  tractionSignals: Array<{ type: string; description: string }>;
  valuationLow?: number | null;
  valuationHigh?: number | null;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
}

function getProgressLabel(score: number): string {
  if (score <= 25) return "Early Stage";
  if (score <= 50) return "Building";
  if (score <= 75) return "Traction";
  return "Growth";
}

function getProgressBadgeVariant(score: number): "secondary" | "outline" | "default" | "destructive" {
  if (score <= 25) return "secondary";
  if (score <= 50) return "outline";
  if (score <= 75) return "default";
  return "default";
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function MarketplacePage() {
  const router = useRouter();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiV1("/builder/marketplace"));
      if (!response.ok) throw new Error("Failed to load listings");
      const data = (await response.json()) as { listings?: MarketplaceListing[] };
      setListings(data.listings ?? []);
    } catch (error) {
      console.error("Failed to load marketplace listings:", error);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const samplesWithFlag = SAMPLE_MARKETPLACE_LISTINGS.map((s) => ({ ...s, isSample: true as const }));
  const allListings: MarketplaceListing[] = [...samplesWithFlag, ...listings];
  const filteredListings = allListings.filter((l) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      (l.description ?? "").toLowerCase().includes(q) ||
      (l.founderName ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/builder")}
          aria-label="Back to builder"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-lg font-bold">Marketplace</h1>
        </div>
        <Badge variant="secondary" className="ml-auto">
          {allListings.length} listing{allListings.length !== 1 ? "s" : ""}
        </Badge>
      </header>

      <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <section aria-labelledby="marketplace-heading">
          <h2 id="marketplace-heading" className="text-2xl font-bold mb-1">
            Browse projects for sale
          </h2>
          <p className="text-muted-foreground text-sm">
            Discover AI-built projects listed by founders. Each project shows its build progress and traction signals.
          </p>
        </section>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
          <Input
            type="search"
            placeholder="Search by name, description or founder…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search marketplace listings"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Rocket className="h-12 w-12 mx-auto text-muted-foreground opacity-40" aria-hidden />
            <p className="text-lg font-medium">
              {searchQuery ? "No matching projects found" : "No projects listed yet"}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? "Try a different search term."
                : 'Be the first to list your project! Open a project and click "List for Sale" to get started.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => router.push("/builder")} className="mt-2">
                Go to Builder
              </Button>
            )}
          </div>
        ) : (
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="list"
            aria-label="Marketplace listings"
          >
            {filteredListings.map((listing) => (
              <li key={listing.id}>
                <article>
                  <Card
                    className="h-full flex flex-col hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => router.push(`/marketplace/${listing.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/marketplace/${listing.id}`);
                      }
                    }}
                    aria-label={`View ${listing.name} details`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold line-clamp-2">
                          {listing.name}
                        </CardTitle>
                        <div className="flex items-center gap-1 shrink-0">
                          {listing.isSample && (
                            <Badge variant="secondary" className="text-xs">
                              Sample
                            </Badge>
                          )}
                          <Badge variant={getProgressBadgeVariant(listing.progressScore)} className="text-xs">
                            {getProgressLabel(listing.progressScore)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{listing.framework}</span>
                        <span>·</span>
                        <time dateTime={listing.updatedAt}>{formatRelativeTime(listing.updatedAt)}</time>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3">
                      {listing.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {listing.description}
                        </p>
                      )}
                      {listing.founderName && (
                        <p className="text-xs text-muted-foreground">
                          By <span className="font-medium text-foreground">{listing.founderName}</span>
                        </p>
                      )}
                      {(listing.valuationLow != null || listing.valuationHigh != null) && (
                        <p className="text-xs font-medium text-foreground">
                          Valuation: ${listing.valuationLow ?? 0} – ${listing.valuationHigh ?? 0}
                        </p>
                      )}
                      {listing.tractionSignals.length > 0 && (
                        <div className="flex flex-wrap gap-1" aria-label="Traction signals">
                          {listing.tractionSignals.slice(0, 3).map((s, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              <TrendingUp className="h-2.5 w-2.5 mr-1" aria-hidden />
                              {s.description.slice(0, 24)}{s.description.length > 24 ? "…" : ""}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="pt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{listing.progressScore}%</span>
                        </div>
                        <div
                          className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                          role="progressbar"
                          aria-valuenow={listing.progressScore}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Build progress: ${listing.progressScore}%`}
                        >
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, listing.progressScore))}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
