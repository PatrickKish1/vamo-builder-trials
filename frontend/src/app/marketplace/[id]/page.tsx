"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Rocket, TrendingUp, DollarSign, FileText, CheckCircle2, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { apiV1, authFetch } from "@/lib/api";
import { getSampleListingById } from "@/lib/marketplace-samples";
import { toast } from "sonner";

interface MarketplaceProjectDetail {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  progressScore: number;
  founderName: string | null;
  whyBuilt: string | null;
  valuationLow: number | null;
  valuationHigh: number | null;
  linkedAssets: Array<{ type: string; url: string; label?: string }>;
  tractionSignals: Array<{ type: string; description: string; createdAt?: string }>;
  recentActivity: Array<{ type: string; description: string; createdAt: string }>;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface MarketplaceBid {
  id: string;
  bidderEmail: string;
  amountLow: number;
  amountHigh: number;
  message: string | null;
  transferType: string;
  status: string;
  createdAt: string;
}

const TERMS_AND_CONDITIONS = `
By accepting this offer you agree to the following:

1. **Transfer of rights**: Ownership or collaboration rights will be transferred as selected (full transfer: you become the sole owner; partial: you are added as an edit collaborator with shared ownership-like rights).

2. **No warranty**: The project is transferred "as is". The previous owner makes no warranties regarding code quality or fitness for a particular purpose.

3. **Good faith**: Both parties act in good faith. The transfer is final once confirmed; no arbitrary revocation by either party.

4. **Disputes**: Any disputes will be resolved in accordance with the platform's terms of service.
`;

const TRANSFER_CLAUSE = `
Transfer of ownership/collaboration: Upon confirmation, the system will update project ownership (full transfer) or add the bidder as an edit collaborator (partial transfer). This action is irreversible through the UI; both parties retain access as per the transfer type selected.
`;

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getProgressLabel(score: number): string {
  if (score <= 25) return "Early Stage";
  if (score <= 50) return "Building";
  if (score <= 75) return "Traction";
  return "Growth";
}

export default function MarketplaceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { user, sessionToken } = useAuth();
  const [project, setProject] = useState<MarketplaceProjectDetail | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<MarketplaceBid[]>([]);
  const [bidCount, setBidCount] = useState(0);
  const [makeOfferOpen, setMakeOfferOpen] = useState(false);
  const [offerAmountLow, setOfferAmountLow] = useState("");
  const [offerAmountHigh, setOfferAmountHigh] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerTransferType, setOfferTransferType] = useState<"full" | "partial">("full");
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmAcceptBidId, setConfirmAcceptBidId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  const loadProject = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const sample = getSampleListingById(id);
    if (sample) {
      setProject({
        id: sample.id,
        name: sample.name,
        description: sample.description,
        framework: sample.framework,
        progressScore: sample.progressScore,
        founderName: sample.founderName,
        whyBuilt: sample.whyBuilt ?? null,
        valuationLow: sample.valuationLow,
        valuationHigh: sample.valuationHigh,
        linkedAssets: sample.linkedAssets ?? [],
        tractionSignals: sample.tractionSignals,
        recentActivity: sample.recentActivity ?? [],
        ownerId: "",
        createdAt: sample.createdAt,
        updatedAt: sample.updatedAt,
      });
      setIsSample(true);
      setBids([]);
      setBidCount(0);
      setLoading(false);
      return;
    }
    setIsSample(false);
    try {
      const res = await fetch(apiV1(`/builder/marketplace/${id}`));
      if (!res.ok) {
        if (res.status === 404) router.replace("/marketplace");
        return;
      }
      const data = (await res.json()) as MarketplaceProjectDetail;
      setProject(data);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const loadBids = useCallback(async () => {
    if (!id || isSample) return;
    try {
      const url = apiV1(`/builder/marketplace/${id}/bids`);
      const res = sessionToken
        ? await authFetch(url, { headers: { Authorization: `Bearer ${sessionToken}` } })
        : await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { bids: MarketplaceBid[]; count: number };
      setBids(data.bids ?? []);
      setBidCount(data.count ?? 0);
    } catch {
      setBids([]);
    }
  }, [id, isSample, sessionToken]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project && !isSample) void loadBids();
  }, [project, isSample, loadBids]);

  const isOwner = Boolean(project && user && project.ownerId === user.id);

  const handleMakeOffer = async () => {
    if (!user || !sessionToken || !project || isSample) {
      setLoginOpen(true);
      return;
    }
    const low = parseInt(offerAmountLow, 10);
    const high = parseInt(offerAmountHigh, 10);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) {
      toast.error("Enter a valid offer range (low ≤ high)");
      return;
    }
    setSubmittingOffer(true);
    try {
      const res = await authFetch(apiV1(`/builder/marketplace/${project.id}/bids`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          amountLow: low,
          amountHigh: high,
          message: offerMessage.trim() || undefined,
          transferType: offerTransferType,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Failed to submit offer");
        return;
      }
      toast.success("Offer submitted");
      setMakeOfferOpen(false);
      setOfferAmountLow("");
      setOfferAmountHigh("");
      setOfferMessage("");
      setOfferTransferType("full");
      void loadBids();
    } catch {
      toast.error("Failed to submit offer");
    } finally {
      setSubmittingOffer(false);
    }
  };

  const openAcceptFlow = (bidId: string) => {
    setConfirmAcceptBidId(bidId);
    setTermsAccepted(false);
    setTermsOpen(true);
  };

  const confirmAcceptBid = async () => {
    if (!termsAccepted || !confirmAcceptBidId || !sessionToken) return;
    setAcceptingBidId(confirmAcceptBidId);
    try {
      const res = await authFetch(apiV1(`/builder/marketplace/bids/${confirmAcceptBidId}/accept`), {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? "Could not accept offer");
        return;
      }
      toast.success("Offer accepted. Transfer completed.");
      setTermsOpen(false);
      setConfirmAcceptBidId(null);
      setTermsAccepted(false);
      void loadProject();
      void loadBids();
      router.push("/builder");
    } catch {
      toast.error("Could not accept offer");
    } finally {
      setAcceptingBidId(null);
    }
  };

  if (!id) return null;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Project not found.</p>
        <Button onClick={() => router.push("/marketplace")}>Back to Marketplace</Button>
      </div>
    );
  }

  const activeBids = bids.filter((b) => b.status === "active");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <Button variant="ghost" size="sm" onClick={() => router.push("/marketplace")} aria-label="Back to marketplace">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-lg font-bold truncate">{project.name}</h1>
        </div>
        {isSample && (
          <Badge variant="secondary" className="ml-auto">
            Sample
          </Badge>
        )}
      </header>

      <main className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        <section aria-labelledby="project-overview-heading">
          <h2 id="project-overview-heading" className="sr-only">
            Project overview
          </h2>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{project.name}</CardTitle>
                <Badge variant="outline" className="capitalize">
                  {project.framework}
                </Badge>
                <Badge>{getProgressLabel(project.progressScore)}</Badge>
              </div>
              {project.founderName && (
                <p className="text-sm text-muted-foreground">
                  By <span className="font-medium text-foreground">{project.founderName}</span>
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {project.description && (
                <p className="text-muted-foreground">{project.description}</p>
              )}
              {project.whyBuilt && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Why built</h3>
                  <p className="text-sm text-muted-foreground">{project.whyBuilt}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="valuation-heading">
          <h2 id="valuation-heading" className="text-lg font-semibold mb-2 flex items-center gap-2">
            <DollarSign className="h-5 w-5" aria-hidden />
            Valuation & progress
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Valuation range</p>
                <p className="text-xl font-semibold">
                  {project.valuationLow != null && project.valuationHigh != null
                    ? `${formatCurrency(project.valuationLow)} – ${formatCurrency(project.valuationHigh)}`
                    : "Not estimated"}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Progress</span>
                  <span>{project.progressScore}%</span>
                </div>
                <div
                  className="h-3 w-full rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-valuenow={project.progressScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, project.progressScore))}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {project.tractionSignals.length > 0 && (
          <section aria-labelledby="traction-heading">
            <h2 id="traction-heading" className="text-lg font-semibold mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" aria-hidden />
              Traction signals
            </h2>
            <ul className="space-y-2" role="list">
              {project.tractionSignals.map((s, i) => (
                <li key={i}>
                  <Card>
                    <CardContent className="py-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                      <span className="text-sm">{s.description}</span>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {project.linkedAssets.length > 0 && (
          <section aria-labelledby="assets-heading">
            <h2 id="assets-heading" className="text-lg font-semibold mb-2">
              Linked assets
            </h2>
            <ul className="flex flex-wrap gap-2" role="list">
              {project.linkedAssets.map((a, i) => (
                <li key={i}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {a.label ?? a.type}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isSample && (
          <>
            <section aria-labelledby="offers-heading">
              <h2 id="offers-heading" className="text-lg font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-5 w-5" aria-hidden />
                Offers
              </h2>
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {isOwner ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {activeBids.length} active offer{activeBids.length !== 1 ? "s" : ""}. You can accept one to
                        complete the transfer.
                      </p>
                      {activeBids.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No offers yet.</p>
                      ) : (
                        <ul className="space-y-3" role="list">
                          {activeBids.map((bid) => (
                            <li key={bid.id}>
                              <Card>
                                <CardContent className="pt-4">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="font-medium flex items-center gap-1">
                                        <User className="h-4 w-4" aria-hidden />
                                        {bid.bidderEmail}
                                      </p>
                                      <p className="text-lg font-semibold mt-1">
                                        {formatCurrency(bid.amountLow)} – {formatCurrency(bid.amountHigh)}
                                      </p>
                                      <p className="text-xs text-muted-foreground capitalize mt-1">
                                        {bid.transferType} transfer
                                      </p>
                                      {bid.message && (
                                        <p className="text-sm text-muted-foreground mt-2">{bid.message}</p>
                                      )}
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {formatRelativeTime(bid.createdAt)}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => openAcceptFlow(bid.id)}
                                      aria-label={`Accept offer from ${bid.bidderEmail}`}
                                    >
                                      Accept offer
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {bidCount} offer{bidCount !== 1 ? "s" : ""} made on this project.
                      </p>
                      <Button
                        onClick={() => (user && sessionToken ? setMakeOfferOpen(true) : setLoginOpen(true))}
                        aria-label="Make an offer"
                      >
                        Make an offer
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}

        {isSample && (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-center text-muted-foreground text-sm">
              <p>This is a sample listing. List your own project from the builder to appear on the marketplace.</p>
              <Button className="mt-4" variant="outline" onClick={() => router.push("/builder")}>
                Go to Builder
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={makeOfferOpen} onOpenChange={setMakeOfferOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby="make-offer-desc">
          <DialogHeader>
            <DialogTitle>Make an offer</DialogTitle>
            <DialogDescription id="make-offer-desc">
              Submit your offer range and choose full transfer (you become owner) or partial (you join as collaborator).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="offer-low">Offer low ($)</Label>
                <Input
                  id="offer-low"
                  type="number"
                  min={0}
                  value={offerAmountLow}
                  onChange={(e) => setOfferAmountLow(e.target.value)}
                  placeholder="e.g. 1000"
                />
              </div>
              <div>
                <Label htmlFor="offer-high">Offer high ($)</Label>
                <Input
                  id="offer-high"
                  type="number"
                  min={0}
                  value={offerAmountHigh}
                  onChange={(e) => setOfferAmountHigh(e.target.value)}
                  placeholder="e.g. 2000"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="transfer-type">Transfer type</Label>
              <Select
                value={offerTransferType}
                onValueChange={(v) => setOfferTransferType(v as "full" | "partial")}
              >
                <SelectTrigger id="transfer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full transfer (I become the owner)</SelectItem>
                  <SelectItem value="partial">Partial (I join as collaborator / contract-based)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="offer-message">Message (optional)</Label>
              <Textarea
                id="offer-message"
                placeholder="Brief note to the owner"
                value={offerMessage}
                onChange={(e) => setOfferMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMakeOfferOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMakeOffer} disabled={submittingOffer}>
              {submittingOffer ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                  Submitting…
                </>
              ) : (
                "Submit offer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={termsOpen} onOpenChange={(open) => !open && setConfirmAcceptBidId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" aria-describedby="terms-desc">
          <DialogHeader>
            <DialogTitle>Terms & transfer</DialogTitle>
            <DialogDescription id="terms-desc">
              Please read and accept before completing the transfer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm whitespace-pre-wrap">{TERMS_AND_CONDITIONS.trim()}</div>
            <div className="text-sm whitespace-pre-wrap text-muted-foreground">{TRANSFER_CLAUSE.trim()}</div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="terms-accept"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor="terms-accept">I have read and agree to the terms and transfer clause.</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTermsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmAcceptBid}
              disabled={!termsAccepted || !!acceptingBidId}
              aria-label="Confirm and complete transfer"
            >
              {acceptingBidId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
                  Completing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden />
                  Confirm transfer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={() => setLoginOpen(false)} />
    </div>
  );
}
