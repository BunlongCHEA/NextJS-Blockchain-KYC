"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Cpu, Layers, Clock, CheckCircle2, RefreshCw, Pickaxe,
  ChevronDown, ChevronUp, Hash, User, Building2, Calendar,
  ArrowRight, AlertTriangle, Loader2, Filter, Search,
  Blocks, TrendingUp, Zap, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockchainStats {
  total_blocks: number;
  total_transactions: number;
  pending_txs: number;
  total_kyc_records: number;
  registered_banks: number;
  difficulty: number;
  latest_block_hash: string;
  is_valid: boolean;
}

interface Transaction {
  id: string;
  type: string;           // CREATE | VERIFY | REJECT | UPDATE | DELETE | SUSPEND
  customer_id: string;
  bank_id: string;
  user_id: string;
  timestamp: number;
  signature?: string;
  description?: string;
  kyc_data?: {
    first_name?: string;
    last_name?: string;
    status?: string;
    risk_level?: string;
  };
}

interface Block {
  index: number;
  timestamp: number;
  hash: string;
  prev_hash: string;
  nonce: number;
  difficulty: number;
  miner: string;
  merkle_root: string;
  transactions: Transaction[];
}

interface PaginatedBlocksResponse {
  data: Block[];
  total_items: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TX_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  CREATE:  { color: "bg-blue-900/60 text-blue-300 border-blue-800",    label: "Create"  },
  VERIFY:  { color: "bg-green-900/60 text-green-300 border-green-800", label: "Verify"  },
  REJECT:  { color: "bg-red-900/60 text-red-300 border-red-800",       label: "Reject"  },
  UPDATE:  { color: "bg-cyan-900/60 text-cyan-300 border-cyan-800",    label: "Update"  },
  DELETE:  { color: "bg-gray-700/60 text-gray-300 border-gray-600",    label: "Delete"  },
  SUSPEND: { color: "bg-orange-900/60 text-orange-300 border-orange-800", label: "Suspend" },
};

function TxTypeBadge({ type }: { type: string }) {
  const cfg = TX_TYPE_CONFIG[type] ?? { color: "bg-gray-700 text-gray-300 border-gray-600", label: type };
  return (
    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2.5 rounded-lg shrink-0 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-white tabular-nums truncate">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-600 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Pending Transaction Row ──────────────────────────────────────────────────

function PendingTxRow({ tx }: { tx: Transaction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 transition-colors text-left"
      >
        <TxTypeBadge type={tx.type} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-mono truncate">{tx.customer_id}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {tx.description || `${tx.type} transaction`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">
            {tx.timestamp ? format(new Date(tx.timestamp * 1000), "MMM d, HH:mm") : "—"}
          </p>
          <p className="text-xs text-gray-600 font-mono mt-0.5">{tx.id?.slice(0, 8)}…</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-800 bg-gray-900/50">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-3">
            {[
              { label: "Transaction ID", value: tx.id, mono: true },
              { label: "Bank ID",        value: tx.bank_id, mono: true },
              { label: "User ID",        value: tx.user_id, mono: true },
              { label: "Timestamp",      value: tx.timestamp ? format(new Date(tx.timestamp * 1000), "yyyy-MM-dd HH:mm:ss") : "—" },
              ...(tx.kyc_data?.first_name ? [
                { label: "Customer Name", value: `${tx.kyc_data.first_name} ${tx.kyc_data.last_name ?? ""}` },
                { label: "KYC Status",    value: tx.kyc_data.status ?? "—" },
                { label: "Risk Level",    value: tx.kyc_data.risk_level ?? "—" },
              ] : []),
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xs mt-0.5 ${mono ? "font-mono text-cyan-400" : "text-gray-200"} break-all`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
          {tx.signature && (
            <div className="mt-2">
              <p className="text-xs text-gray-500">Signature</p>
              <p className="text-xs font-mono text-gray-600 break-all mt-0.5 line-clamp-2">{tx.signature}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Block Row ────────────────────────────────────────────────────────────────

function BlockRow({ block }: { block: Block }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-gray-300">#{block.index}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-mono truncate">{block.hash?.slice(0, 24)}…</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {block.transactions?.length ?? 0} tx · Difficulty {block.difficulty} · Nonce {block.nonce}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">
            {block.timestamp ? formatDistanceToNow(new Date(block.timestamp * 1000), { addSuffix: true }) : "—"}
          </p>
          {block.miner && (
            <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[120px]">{block.miner}</p>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 bg-gray-900/30">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 mb-3">
            {[
              { label: "Block Hash",    value: block.hash,       mono: true },
              { label: "Prev Hash",     value: block.prev_hash,  mono: true },
              { label: "Merkle Root",   value: block.merkle_root, mono: true },
              { label: "Timestamp",     value: block.timestamp ? format(new Date(block.timestamp * 1000), "yyyy-MM-dd HH:mm:ss") : "—" },
              { label: "Miner",         value: block.miner ?? "—", mono: true },
              { label: "Nonce",         value: String(block.nonce) },
            ].map(({ label, value, mono }) => (
              <div key={label} className="col-span-2 sm:col-span-1">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xs mt-0.5 break-all ${mono ? "font-mono text-cyan-400" : "text-gray-300"}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {block.transactions?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Transactions ({block.transactions.length})
              </p>
              <div className="space-y-1.5">
                {block.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-800/40 rounded-lg"
                  >
                    <TxTypeBadge type={tx.type} />
                    <span className="text-xs font-mono text-gray-300 truncate flex-1">{tx.customer_id}</span>
                    <span className="text-xs text-gray-500 shrink-0">{tx.bank_id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlockchainPage() {
  const { toast } = useToast();

  const [stats,          setStats]          = useState<BlockchainStats | null>(null);
  const [statsLoading,   setStatsLoading]   = useState(true);

  const [pendingTxs,     setPendingTxs]     = useState<Transaction[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [txTypeFilter,   setTxTypeFilter]   = useState<string>("ALL");
  const [txSearch,       setTxSearch]       = useState("");

  const [blocks,         setBlocks]         = useState<Block[]>([]);
  const [blocksLoading,  setBlocksLoading]  = useState(true);
  const [blockPage,      setBlockPage]      = useState(1);
  const [totalPages,     setTotalPages]     = useState(1);

  const [mining,         setMining]         = useState(false);

  // ── Fetch stats ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get("/api/v1/blockchain/stats");
      setStats(res.data?.data || res.data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Fetch pending transactions ──────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await api.get("/api/v1/blockchain/pending");
      const data = res.data?.data || res.data || [];
      setPendingTxs(Array.isArray(data) ? data : []);
    } catch {
      setPendingTxs([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  // ── Fetch blocks ─────────────────────────────────────────────────────────
  const fetchBlocks = useCallback(async (page = 1) => {
    setBlocksLoading(true);
    try {
      const res = await api.get("/api/v1/blockchain/blocks", {
        params: { page, per_page: 10 },
      });
      const payload: PaginatedBlocksResponse = res.data;
      const data = payload?.data || (Array.isArray(payload) ? payload : []);
      // Reverse to show newest first
      setBlocks(Array.isArray(data) ? [...data].reverse() : []);
      setTotalPages(payload?.total_pages ?? 1);
    } catch {
      setBlocks([]);
    } finally {
      setBlocksLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchPending();
    fetchBlocks(1);
  }, [fetchStats, fetchPending, fetchBlocks]);

  // ── Mine block ────────────────────────────────────────────────────────────
  const handleMine = async () => {
    if (pendingTxs.length === 0) {
      toast({ title: "No pending transactions to mine", variant: "destructive" });
      return;
    }
    setMining(true);
    try {
      const res = await api.post("/api/v1/blockchain/mine");
      const block = res.data?.data;
      toast({
        title: `Block #${block?.index ?? "?"} mined successfully`,
      });
      // Refresh everything
      await Promise.all([fetchStats(), fetchPending(), fetchBlocks(1)]);
      setBlockPage(1);
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error || "Mining failed",
        variant: "destructive",
      });
    } finally {
      setMining(false);
    }
  };

  // ── Validate chain ────────────────────────────────────────────────────────
  const handleValidate = async () => {
    try {
      const res = await api.get("/api/v1/blockchain/validate");
      const valid = res.data?.data?.is_valid ?? res.data?.is_valid;
      toast({
        title: valid ? "Chain is valid ✓" : "Chain validation FAILED",
        variant: valid ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Could not validate chain", variant: "destructive" });
    }
  };

  // ── Filtered pending ──────────────────────────────────────────────────────
  const filteredPending = pendingTxs.filter((tx) => {
    const matchType = txTypeFilter === "ALL" || tx.type === txTypeFilter;
    const q = txSearch.toLowerCase();
    const matchSearch =
      !q ||
      tx.customer_id?.toLowerCase().includes(q) ||
      tx.id?.toLowerCase().includes(q) ||
      tx.bank_id?.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  // ── KYC VERIFY transactions (the ones that need mining) ───────────────────
  const verifyPending = pendingTxs.filter((tx) => tx.type === "CREATE" || tx.type === "VERIFY");

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Blocks className="h-6 w-6 text-cyan-400" />
            Blockchain
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Monitor chain health, pending transactions, and mine blocks
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300"
            onClick={() => { fetchStats(); fetchPending(); fetchBlocks(blockPage); }}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300"
            onClick={handleValidate}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            Validate
          </Button>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <Skeleton className="h-8 w-16 bg-gray-800 mb-1" />
              <Skeleton className="h-3 w-24 bg-gray-800" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              icon={Layers}
              label="Total Blocks"
              value={stats?.total_blocks ?? 0}
              sub={stats?.latest_block_hash ? `${stats.latest_block_hash.slice(0, 16)}…` : undefined}
              accent="bg-cyan-500/10 text-cyan-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Total Transactions"
              value={stats?.total_transactions ?? 0}
              sub={`${stats?.pending_txs ?? 0} pending`}
              accent="bg-blue-500/10 text-blue-400"
            />
            <StatCard
              icon={Clock}
              label="Pending Transactions"
              value={stats?.pending_txs ?? 0}
              sub={verifyPending.length > 0 ? `${verifyPending.length} KYC ready to mine` : "None awaiting mine"}
              accent={
                (stats?.pending_txs ?? 0) > 0
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-gray-800 text-gray-400"
              }
            />
            <StatCard
              icon={Cpu}
              label="Chain Valid"
              value={stats?.is_valid ? "Valid ✓" : "Invalid ✗"}
              sub={`Difficulty ${stats?.difficulty ?? "—"}`}
              accent={
                stats?.is_valid
                  ? "bg-green-500/10 text-green-400"
                  : "bg-red-500/10 text-red-400"
              }
            />
          </>
        )}
      </div>

      {/* ── Mine block card ── */}
      <div className={`rounded-xl border p-4 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row ${
        pendingTxs.length > 0
          ? "bg-amber-950/20 border-amber-800/40"
          : "bg-gray-900 border-gray-800"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${pendingTxs.length > 0 ? "bg-amber-500/10" : "bg-gray-800"}`}>
            <Pickaxe className={`h-5 w-5 ${pendingTxs.length > 0 ? "text-amber-400" : "text-gray-500"}`} />
          </div>
          <div>
            <p className={`font-semibold ${pendingTxs.length > 0 ? "text-amber-300" : "text-gray-300"}`}>
              {pendingTxs.length > 0
                ? `${pendingTxs.length} pending transaction${pendingTxs.length > 1 ? "s" : ""} ready to mine`
                : "No pending transactions"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {verifyPending.length > 0
                ? `${verifyPending.length} KYC verification${verifyPending.length > 1 ? "s" : ""} will be permanently recorded on-chain`
                : "Mine when verified KYC transactions are pending"}
            </p>
          </div>
        </div>
        <Button
          onClick={handleMine}
          disabled={mining || pendingTxs.length === 0}
          className={`shrink-0 ${
            pendingTxs.length > 0
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-gray-800 text-gray-500 cursor-not-allowed"
          }`}
        >
          {mining ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Mining…
            </>
          ) : (
            <>
              <Pickaxe className="h-4 w-4 mr-2" />
              Mine Block
            </>
          )}
        </Button>
      </div>

      {/* ── Pending Transactions ── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Pending Transactions
              {pendingTxs.length > 0 && (
                <span className="text-xs bg-amber-900/50 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full">
                  {pendingTxs.length}
                </span>
              )}
            </CardTitle>
          </div>
          {/* Filter bar */}
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
              <Input
                placeholder="Search customer ID, tx ID…"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
              />
            </div>
            <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
              <SelectTrigger className="w-[140px] h-8 text-sm bg-gray-800 border-gray-700 text-gray-300">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="VERIFY">Verify</SelectItem>
                <SelectItem value="REJECT">Reject</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="SUSPEND">Suspend</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {pendingLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full bg-gray-800 rounded-lg" />
              ))}
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="h-10 w-10 text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">
                {pendingTxs.length === 0
                  ? "No pending transactions — all caught up"
                  : "No transactions match your filter"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPending.map((tx) => (
                <PendingTxRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
          {!pendingLoading && filteredPending.length > 0 && (
            <p className="text-xs text-gray-600 mt-3">
              Showing {filteredPending.length} of {pendingTxs.length} pending transactions
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Blocks ── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3 border-b border-gray-800">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            Blockchain Blocks
            <span className="text-xs text-gray-500 font-normal ml-1">
              (newest first)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {blocksLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-gray-800 rounded-lg" />
              ))}
            </div>
          ) : blocks.length === 0 ? (
            <div className="text-center py-10">
              <Layers className="h-10 w-10 text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Only genesis block — mine pending transactions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {blocks.map((block) => (
                <BlockRow key={block.hash} block={block} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
              <Button
                variant="outline"
                size="sm"
                className="border-gray-700 text-gray-400 h-8"
                disabled={blockPage <= 1 || blocksLoading}
                onClick={() => {
                  const p = blockPage - 1;
                  setBlockPage(p);
                  fetchBlocks(p);
                }}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-500">
                Page {blockPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-700 text-gray-400 h-8"
                disabled={blockPage >= totalPages || blocksLoading}
                onClick={() => {
                  const p = blockPage + 1;
                  setBlockPage(p);
                  fetchBlocks(p);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}