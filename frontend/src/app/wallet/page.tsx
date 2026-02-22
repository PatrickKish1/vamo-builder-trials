"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiV1 } from "@/lib/api";

const REDEEM_MINIMUM = 50;
const REDEEM_TYPE = "Uber Eats Credit";

interface LedgerEntry {
  id: string;
  event_type: string;
  amount: number;
  balance_after: number;
  project_id: string | null;
  created_at: string;
  builder_projects?: { name: string } | null;
}

interface Redemption {
  id: string;
  amount: number;
  reward_type: string;
  status: "pending" | "fulfilled" | "failed";
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function redemptionBadgeVariant(status: Redemption["status"]): "default" | "secondary" | "destructive" {
  if (status === "fulfilled") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

export default function WalletPage() {
  const router = useRouter();
  const { user, sessionToken } = useAuth();

  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [loadingRedemptions, setLoadingRedemptions] = useState(true);

  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(ledgerTotal / pageSize));

  const loadBalance = useCallback(async () => {
    if (!sessionToken) return;
    setLoadingBalance(true);
    try {
      const res = await fetch(apiV1("/profile"), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json() as { profile?: { pineapple_balance?: number } };
      setBalance(data.profile?.pineapple_balance ?? 0);
    } catch {
      toast.error("Failed to load balance");
    } finally {
      setLoadingBalance(false);
    }
  }, [sessionToken]);

  const loadLedger = useCallback(async (page: number) => {
    if (!sessionToken) return;
    setLoadingLedger(true);
    try {
      const res = await fetch(apiV1(`/rewards/ledger?page=${page}&pageSize=${pageSize}`), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json() as { ledger?: LedgerEntry[]; total?: number };
      setLedger(data.ledger ?? []);
      setLedgerTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load reward history");
    } finally {
      setLoadingLedger(false);
    }
  }, [sessionToken]);

  const loadRedemptions = useCallback(async () => {
    if (!sessionToken) return;
    setLoadingRedemptions(true);
    try {
      const res = await fetch(apiV1("/rewards/redemptions"), {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await res.json() as { redemptions?: Redemption[] };
      setRedemptions(data.redemptions ?? []);
    } catch {
      toast.error("Failed to load redemption history");
    } finally {
      setLoadingRedemptions(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadBalance();
    void loadLedger(1);
    void loadRedemptions();
  }, [sessionToken, loadBalance, loadLedger, loadRedemptions]);

  useEffect(() => {
    void loadLedger(ledgerPage);
  }, [ledgerPage, loadLedger]);

  const handleRedeem = useCallback(async () => {
    const amount = parseInt(redeemAmount, 10);
    if (!Number.isFinite(amount) || amount < REDEEM_MINIMUM) {
      toast.error(`Minimum redemption is ${REDEEM_MINIMUM} 🍍`);
      return;
    }
    if (balance !== null && amount > balance) {
      toast.error("Amount exceeds your balance");
      return;
    }
    setRedeeming(true);
    try {
      const res = await fetch(apiV1("/rewards/redeem"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ amount, rewardType: "uber_eats" }),
      });
      const data = await res.json() as { success?: boolean; newBalance?: number; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Redemption failed");
        return;
      }
      setBalance(data.newBalance ?? null);
      toast.success("Redemption submitted! You'll receive your reward within 48 hours.");
      setRedeemOpen(false);
      setRedeemAmount("");
      await Promise.all([loadLedger(1), loadRedemptions()]);
      setLedgerPage(1);
    } catch {
      toast.error("Redemption failed");
    } finally {
      setRedeeming(false);
    }
  }, [redeemAmount, balance, sessionToken, loadLedger, loadRedemptions]);

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-sm w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/builder")}>Go to Builder</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b px-4 py-3 flex items-center justify-between bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/builder")} aria-label="Back to builder">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" aria-hidden />
            <span className="font-semibold text-lg">Pineapple Wallet</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-8">
        <section aria-label="Balance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                <span aria-hidden>🍍</span> Your balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingBalance ? (
                <Skeleton className="h-16 w-32" />
              ) : (
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-bold" aria-label={`${balance} pineapples`}>
                    {balance ?? 0}
                  </span>
                  <span className="text-2xl mb-1" aria-hidden>🍍</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Total from all your projects. Redeem for Uber Eats credits (min {REDEEM_MINIMUM} 🍍).
              </p>
              <Button
                onClick={() => {
                  setRedeemAmount("");
                  setRedeemOpen(true);
                }}
                disabled={loadingBalance || (balance !== null && balance < REDEEM_MINIMUM)}
                aria-label="Redeem pineapples"
              >
                Redeem
              </Button>
            </CardContent>
          </Card>
        </section>

        <section aria-label="Reward history">
          <Card>
            <CardHeader>
              <CardTitle>Reward history</CardTitle>
              <CardDescription>All reward ledger entries (20 per page)</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLedger ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reward history yet. Start building to earn pineapples!</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Balance after</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-muted-foreground text-sm">{formatDate(entry.created_at)}</TableCell>
                            <TableCell className="font-medium">{entry.event_type}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {entry.builder_projects?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={entry.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                                {entry.amount >= 0 ? "+" : ""}{entry.amount} 🍍
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{entry.balance_after}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {totalPages > 1 && (
                    <nav className="flex items-center justify-between pt-4" aria-label="Reward history pagination">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                        disabled={ledgerPage <= 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {ledgerPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLedgerPage((p) => Math.min(totalPages, p + 1))}
                        disabled={ledgerPage >= totalPages}
                        aria-label="Next page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </nav>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-label="Redemption history">
          <Card>
            <CardHeader>
              <CardTitle>Redemption history</CardTitle>
              <CardDescription>Your redemption requests</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRedemptions ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : redemptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No redemptions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Reward type</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {redemptions.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(r.created_at)}</TableCell>
                          <TableCell className="text-right font-medium">{r.amount} 🍍</TableCell>
                          <TableCell className="text-muted-foreground text-sm capitalize">{r.reward_type.replace(/_/g, " ")}</TableCell>
                          <TableCell>
                            <Badge variant={redemptionBadgeVariant(r.status)} className="capitalize">
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby="redeem-desc">
          <DialogHeader>
            <DialogTitle>Redeem pineapples</DialogTitle>
            <DialogDescription id="redeem-desc">
              Minimum {REDEEM_MINIMUM} 🍍. Your balance: {balance ?? 0} 🍍. Fulfilment within 48 hours.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="redeem-amount">Amount to redeem (🍍)</Label>
              <Input
                id="redeem-amount"
                type="number"
                min={REDEEM_MINIMUM}
                max={balance ?? REDEEM_MINIMUM}
                placeholder={String(REDEEM_MINIMUM)}
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                aria-required
              />
            </div>
            <div className="grid gap-2">
              <Label>Reward type</Label>
              <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground bg-muted/50">
                {REDEEM_TYPE}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemOpen(false)} disabled={redeeming}>
              Cancel
            </Button>
            <Button onClick={handleRedeem} disabled={redeeming || !redeemAmount}>
              {redeeming ? "Processing…" : "Confirm redemption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
