"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiV1, authFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users,
  FolderKanban,
  TrendingUp,
  ShoppingCart,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface AdminStats {
  totalUsers: number;
  totalProjects: number;
  totalPineapplesEarned: number;
  totalPineapplesRedeemed: number;
  activeListings: number;
  pendingRedemptions: number;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  pineapple_balance: number;
  is_admin: boolean;
  created_at: string;
}

interface AdminRedemption {
  id: string;
  user_id: string;
  amount: number;
  reward_type: string;
  status: string;
  created_at: string;
  fulfilled_at: string | null;
  profiles: { email: string; full_name: string | null } | null;
}

interface AdminProject {
  id: string;
  name: string;
  status: string;
  progress_score: number;
  created_at: string;
  owner_id: string;
  profiles: { email: string; full_name: string | null } | null;
}

interface LedgerEvent {
  id: string;
  user_id: string;
  project_id: string | null;
  event_type: string;
  reward_amount: number;
  balance_after: number;
  created_at: string;
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`rounded-lg p-3 ${color}`}>{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    fulfilled: "default",
    failed: "destructive",
    active: "default",
    listed: "outline",
  };
  return <Badge variant={variants[status] ?? "outline"}>{status}</Badge>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminPage() {
  const router = useRouter();
  const { sessionToken } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [redemptions, setRedemptions] = useState<AdminRedemption[]>([]);
  const [redemptionFilter, setRedemptionFilter] = useState<"all" | "pending" | "fulfilled">("all");
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsPage, setProjectsPage] = useState(1);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const authHeaders = useCallback((): HeadersInit => {
    return { "Content-Type": "application/json" };
  }, []);

  const loadStats = useCallback(async () => {
    if (!sessionToken) return;
    const res = await authFetch(apiV1("/admin/stats"), { credentials: "include", headers: authHeaders() });
    if (!res.ok) {
      if (res.status === 403) {
        toast.error("Admin access only");
        router.push("/");
        return;
      }
      return;
    }
    setStats(await res.json() as AdminStats);
  }, [sessionToken, authHeaders, router]);

  const loadUsers = useCallback(async (page: number) => {
    if (!sessionToken) return;
    const res = await authFetch(apiV1(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}`), {
      credentials: "include",
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json() as { users: AdminUser[]; total: number };
    setUsers(data.users);
    setUsersTotal(data.total);
  }, [sessionToken, authHeaders]);

  const loadRedemptions = useCallback(async (filter: "all" | "pending" | "fulfilled") => {
    if (!sessionToken) return;
    const qs = filter !== "all" ? `?status=${filter}` : "";
    const res = await authFetch(apiV1(`/admin/redemptions${qs}`), { credentials: "include", headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json() as { redemptions: AdminRedemption[] };
    setRedemptions(data.redemptions);
  }, [sessionToken, authHeaders]);

  const loadProjects = useCallback(async (page: number) => {
    if (!sessionToken) return;
    const res = await authFetch(apiV1(`/admin/projects?page=${page}&pageSize=${PAGE_SIZE}`), {
      credentials: "include",
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json() as { projects: AdminProject[]; total: number };
    setProjects(data.projects);
    setProjectsTotal(data.total);
  }, [sessionToken, authHeaders]);

  const loadEvents = useCallback(async (page: number) => {
    if (!sessionToken) return;
    const res = await authFetch(apiV1(`/admin/analytics?page=${page}&pageSize=${PAGE_SIZE}`), {
      credentials: "include",
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json() as { events: LedgerEvent[]; total: number };
    setEvents(data.events);
    setEventsTotal(data.total);
  }, [sessionToken, authHeaders]);

  useEffect(() => {
    if (!sessionToken) return;
    setIsLoading(true);
    void Promise.all([
      loadStats(),
      loadUsers(1),
      loadRedemptions("all"),
      loadProjects(1),
      loadEvents(1),
    ]).finally(() => setIsLoading(false));
  }, [sessionToken, loadStats, loadUsers, loadRedemptions, loadProjects, loadEvents]);

  useEffect(() => {
    void loadRedemptions(redemptionFilter);
  }, [redemptionFilter, loadRedemptions]);

  const handleFulfillRedemption = async (id: string, status: "fulfilled" | "failed") => {
    setUpdatingId(id);
    try {
      const res = await authFetch(apiV1(`/admin/redemptions/${id}`), {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(`Redemption marked as ${status}`);
      await loadRedemptions(redemptionFilter);
      await loadStats();
    } catch {
      toast.error("Failed to update redemption status");
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
            <p className="text-muted-foreground">Platform analytics and management</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void Promise.all([
                loadStats(),
                loadUsers(usersPage),
                loadRedemptions(redemptionFilter),
                loadProjects(projectsPage),
                loadEvents(eventsPage),
              ]);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </header>

        {/* Stats grid */}
        {stats && (
          <section aria-label="Platform statistics">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <StatCard
                title="Total Users"
                value={stats.totalUsers}
                icon={<Users className="h-5 w-5 text-white" />}
                color="bg-blue-500"
              />
              <StatCard
                title="Projects"
                value={stats.totalProjects}
                icon={<FolderKanban className="h-5 w-5 text-white" />}
                color="bg-purple-500"
              />
              <StatCard
                title="🍍 Earned"
                value={stats.totalPineapplesEarned.toLocaleString()}
                icon={<TrendingUp className="h-5 w-5 text-white" />}
                color="bg-yellow-500"
              />
              <StatCard
                title="🍍 Redeemed"
                value={stats.totalPineapplesRedeemed.toLocaleString()}
                icon={<ShoppingCart className="h-5 w-5 text-white" />}
                color="bg-orange-500"
              />
              <StatCard
                title="Active Listings"
                value={stats.activeListings}
                icon={<TrendingUp className="h-5 w-5 text-white" />}
                color="bg-green-500"
              />
              <StatCard
                title="Pending Redemptions"
                value={stats.pendingRedemptions}
                icon={<Clock className="h-5 w-5 text-white" />}
                color={stats.pendingRedemptions > 0 ? "bg-red-500" : "bg-gray-500"}
              />
            </div>
          </section>
        )}

        {/* Main tabs */}
        <Tabs defaultValue="redemptions">
          <TabsList>
            <TabsTrigger value="redemptions">
              Redemptions
              {stats && stats.pendingRedemptions > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
                  {stats.pendingRedemptions}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Redemptions tab */}
          <TabsContent value="redemptions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Redemption Requests</CardTitle>
                <div className="flex gap-2">
                  {(["all", "pending", "fulfilled"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={redemptionFilter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRedemptionFilter(f)}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">User</th>
                        <th className="pb-3 pr-4 font-medium">Amount 🍍</th>
                        <th className="pb-3 pr-4 font-medium">Type</th>
                        <th className="pb-3 pr-4 font-medium">Status</th>
                        <th className="pb-3 pr-4 font-medium">Date</th>
                        <th className="pb-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {redemptions.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <div>
                              <p className="font-medium">{r.profiles?.full_name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{r.profiles?.email ?? r.user_id.slice(0, 8)}</p>
                            </div>
                          </td>
                          <td className="py-3 pr-4 font-mono font-semibold text-yellow-600">{r.amount}</td>
                          <td className="py-3 pr-4">{r.reward_type}</td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{formatDate(r.created_at)}</td>
                          <td className="py-3">
                            {r.status === "pending" && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={updatingId === r.id}
                                  onClick={() => void handleFulfillRedemption(r.id, "fulfilled")}
                                  aria-label="Mark fulfilled"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={updatingId === r.id}
                                  onClick={() => void handleFulfillRedemption(r.id, "failed")}
                                  aria-label="Mark failed"
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {redemptions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">
                            No redemptions found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Users ({usersTotal.toLocaleString()} total)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Name / Email</th>
                        <th className="pb-3 pr-4 font-medium">🍍 Balance</th>
                        <th className="pb-3 pr-4 font-medium">Role</th>
                        <th className="pb-3 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <div>
                              <p className="font-medium">{u.full_name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </td>
                          <td className="py-3 pr-4 font-mono font-semibold text-yellow-600">
                            {u.pineapple_balance ?? 0}
                          </td>
                          <td className="py-3 pr-4">
                            {u.is_admin ? (
                              <Badge>Admin</Badge>
                            ) : (
                              <Badge variant="secondary">User</Badge>
                            )}
                          </td>
                          <td className="py-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-muted-foreground">
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={usersPage}
                  total={usersTotal}
                  pageSize={PAGE_SIZE}
                  onChange={(p) => {
                    setUsersPage(p);
                    void loadUsers(p);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects tab */}
          <TabsContent value="projects">
            <Card>
              <CardHeader>
                <CardTitle>Projects ({projectsTotal.toLocaleString()} total)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">Name</th>
                        <th className="pb-3 pr-4 font-medium">Owner</th>
                        <th className="pb-3 pr-4 font-medium">Status</th>
                        <th className="pb-3 pr-4 font-medium">Progress</th>
                        <th className="pb-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">{p.name}</td>
                          <td className="py-3 pr-4">
                            <div>
                              <p>{p.profiles?.full_name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{p.profiles?.email ?? p.owner_id.slice(0, 8)}</p>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${p.progress_score ?? 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">{p.progress_score ?? 0}%</span>
                            </div>
                          </td>
                          <td className="py-3 text-muted-foreground">{formatDate(p.created_at)}</td>
                        </tr>
                      ))}
                      {projects.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            No projects found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={projectsPage}
                  total={projectsTotal}
                  pageSize={PAGE_SIZE}
                  onChange={(p) => {
                    setProjectsPage(p);
                    void loadProjects(p);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics tab */}
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Reward Ledger ({eventsTotal.toLocaleString()} events)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-3 pr-4 font-medium">User ID</th>
                        <th className="pb-3 pr-4 font-medium">Event</th>
                        <th className="pb-3 pr-4 font-medium">🍍 Amount</th>
                        <th className="pb-3 pr-4 font-medium">Balance After</th>
                        <th className="pb-3 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                            {e.user_id.slice(0, 8)}…
                          </td>
                          <td className="py-3 pr-4">
                            <Badge variant="outline" className="font-mono text-xs">
                              {e.event_type}
                            </Badge>
                          </td>
                          <td className={`py-3 pr-4 font-mono font-semibold ${e.reward_amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {e.reward_amount >= 0 ? "+" : ""}{e.reward_amount}
                          </td>
                          <td className="py-3 pr-4 font-mono text-muted-foreground">
                            {e.balance_after}
                          </td>
                          <td className="py-3 text-muted-foreground">{formatDate(e.created_at)}</td>
                        </tr>
                      ))}
                      {events.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            No events found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={eventsPage}
                  total={eventsTotal}
                  pageSize={PAGE_SIZE}
                  onChange={(p) => {
                    setEventsPage(p);
                    void loadEvents(p);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  return (
    <nav
      className="mt-4 flex items-center justify-between text-sm"
      aria-label="Pagination"
    >
      <p className="text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
