"use client";

import React, { useState, useCallback, useMemo } from "react";
import Papa from "papaparse";
import {
  Search,
  Loader2,
  FileDown,
  Eye,
  CheckCircle2,
  XCircle,
  Copy,
  AlertTriangle,
  Building2,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Linkedin,
  Twitter,
  Globe,
  ExternalLink,
  Shield,
  Trash2,
  ChevronDown,
  ChevronUp,
  UserCircle,
  Filter,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import type {
  ResearchResult,
  StatusFilter,
  DonationRecord,
  BusinessRecord,
  EmploymentRecord,
} from "@/lib/types";
import { US_STATES } from "@/lib/constants";

// ─── Helper functions ──────────────────────────────────────────────────────────

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (confidence >= 50) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function statusColor(status: ResearchResult["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "rejected":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "duplicate":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:
      return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }
}

function statusLabel(status: ResearchResult["status"]): string {
  switch (status) {
    case "confirmed": return "Confirmed";
    case "rejected": return "Rejected";
    case "duplicate": return "Duplicate";
    default: return "Pending";
  }
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function HomePage() {
  const { toast } = useToast();

  // Input state
  const [namesInput, setNamesInput] = useState("");
  const [targetCity, setTargetCity] = useState("");
  const [targetState, setTargetState] = useState("");

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [currentSearchName, setCurrentSearchName] = useState("");

  // Results state
  const [results, setResults] = useState<ResearchResult[]>([]);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByConfidence, setSortByConfidence] = useState<"asc" | "desc">("desc");

  // Detail drawer state
  const [selectedResult, setSelectedResult] = useState<ResearchResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ─── Computed values ──────────────────────────────────────────────────────

  const parsedNames = useMemo(() => {
    return namesInput
      .split(/[\n\r]+/)
      .map((n) => n.replace(/[\t\r]/g, " ").replace(/\s+/g, " ").trim())
      .filter((n) => n.length > 0);
  }, [namesInput]);

  const filteredResults = useMemo(() => {
    let filtered = results;

    // Status filter
    if (statusFilter === "duplicate") {
      filtered = filtered.filter((r) => r.isDuplicate);
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    // Confidence filter
    filtered = filtered.filter((r) => r.confidence >= confidenceMin);

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.politicalActivity.partyAffiliation.toLowerCase().includes(q) ||
          r.businessRecords.some((b) => b.name.toLowerCase().includes(q)) ||
          r.professionalHistory.some((e) => e.employer.toLowerCase().includes(q))
      );
    }

    // Sort by confidence
    filtered = [...filtered].sort((a, b) =>
      sortByConfidence === "desc"
        ? b.confidence - a.confidence
        : a.confidence - b.confidence
    );

    return filtered;
  }, [results, statusFilter, confidenceMin, searchQuery, sortByConfidence]);

  const statusCounts = useMemo(() => {
    return {
      all: results.length,
      pending: results.filter((r) => r.status === "pending").length,
      confirmed: results.filter((r) => r.status === "confirmed").length,
      rejected: results.filter((r) => r.status === "rejected").length,
      duplicate: results.filter((r) => r.isDuplicate).length,
    };
  }, [results]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleStartResearch = useCallback(async () => {
    if (parsedNames.length === 0) {
      toast({
        title: "No names to process",
        description: "Please enter at least one name to research.",
        variant: "destructive",
      });
      return;
    }

    if (parsedNames.length > 100) {
      toast({
        title: "Too many names",
        description: "Maximum 100 names per batch. Please reduce your list.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProgressTotal(parsedNames.length);
    setCurrentSearchName(parsedNames[0]);

    // Process names in smaller batches to show progress
    const batchSize = 5;
    const allResults: ResearchResult[] = [];

    for (let i = 0; i < parsedNames.length; i += batchSize) {
      const batch = parsedNames.slice(i, i + batchSize);
      setCurrentSearchName(batch[0]);

      try {
        const response = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            names: batch,
            targetCity: targetCity || undefined,
            targetState: targetState || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.results) {
          allResults.push(...data.results);
          setResults(allResults);
        }
      } catch (error) {
        toast({
          title: "Batch processing error",
          description: error instanceof Error ? error.message : "Unknown error occurred.",
          variant: "destructive",
        });
      }

      setProgress(Math.min(i + batchSize, parsedNames.length));
    }

    setIsProcessing(false);
    setCurrentSearchName("");
    toast({
      title: "Research complete",
      description: `Processed ${allResults.length} names successfully.`,
    });
  }, [parsedNames, targetCity, targetState, toast]);

  const handleUpdateStatus = useCallback(
    (id: string, status: ResearchResult["status"]) => {
      setResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
      toast({
        title: `Result ${statusLabel(status).toLowerCase()}`,
        description: `The record has been marked as ${statusLabel(status).toLowerCase()}.`,
      });
    },
    [toast]
  );

  const handleOpenDetail = useCallback((result: ResearchResult) => {
    setSelectedResult(result);
    setDrawerOpen(true);
  }, []);

  const handleExportCSV = useCallback(
    (filterType: "all" | "confirmed" | "pending") => {
      let exportData = results;
      if (filterType === "confirmed") {
        exportData = results.filter((r) => r.status === "confirmed");
      } else if (filterType === "pending") {
        exportData = results.filter((r) => r.status === "pending");
      }

      if (exportData.length === 0) {
        toast({
          title: "No data to export",
          description: "There are no records matching the selected filter.",
          variant: "destructive",
        });
        return;
      }

      const flatData = exportData.map((r) => ({
        Name: r.name,
        City: r.targetCity || "",
        State: r.targetState || "",
        Confidence: r.confidence,
        Status: r.status,
        "FEC Record": r.politicalActivity.hasFECRecord ? "Yes" : "No",
        "Total Donations": r.politicalActivity.totalDonations,
        "Party Affiliation": r.politicalActivity.partyAffiliation,
        "Offices Sought": r.politicalActivity.officesSought.join("; "),
        "Business Records": r.businessRecords.map((b) => `${b.name} (${b.type})`).join("; "),
        "Current Employer": r.professionalHistory.find((e) => e.isCurrent)?.employer || "",
        "LinkedIn": r.contactInfo.linkedin || "",
        "Twitter": r.contactInfo.twitter || "",
        "Phones": r.contactInfo.phone.join("; "),
        "Emails": r.contactInfo.email.join("; "),
        "Addresses": r.contactInfo.address.join("; "),
        Summary: r.summary,
        Sources: r.sources.join("; "),
        "Searched At": new Date(r.searchedAt).toLocaleString(),
      }));

      const csv = Papa.unparse(flatData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `election-research-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "CSV exported",
        description: `${exportData.length} records exported successfully.`,
      });
    },
    [results, toast]
  );

  const handleClearResults = useCallback(() => {
    setResults([]);
    setProgress(0);
    setProgressTotal(0);
    setCurrentSearchName("");
    toast({
      title: "Results cleared",
      description: "All research results have been removed.",
    });
  }, [toast]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Election Research Tool
                </h1>
                <p className="text-xs text-muted-foreground">
                  OSINT Public Records Intelligence Platform
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Input Panel */}
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Research Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Names textarea */}
                <div className="lg:col-span-1">
                  <Label htmlFor="names" className="text-sm font-medium mb-2 block">
                    Names to Research
                  </Label>
                  <Textarea
                    id="names"
                    placeholder={"Paste names here, one per line:\nJohn Smith\nJane Doe\nRobert Johnson"}
                    value={namesInput}
                    onChange={(e) => setNamesInput(e.target.value)}
                    className="min-h-[140px] resize-y font-mono text-sm"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {parsedNames.length} name{parsedNames.length !== 1 ? "s" : ""} detected
                    {parsedNames.length > 100 && (
                      <span className="text-destructive ml-1">
                        (max 100)
                      </span>
                    )}
                  </p>
                </div>

                {/* Location fields */}
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city" className="text-sm font-medium mb-2 block">
                      Target City
                    </Label>
                    <Input
                      id="city"
                      placeholder="e.g., Portland"
                      value={targetCity}
                      onChange={(e) => setTargetCity(e.target.value)}
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state" className="text-sm font-medium mb-2 block">
                      Target State
                    </Label>
                    <Select
                      value={targetState}
                      onValueChange={setTargetState}
                      disabled={isProcessing}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {US_STATES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Info cards */}
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-auto">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <UserCircle className="h-4 w-4 text-primary shrink-0" />
                      <span>FEC &amp; ORESTAR political donation records</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <span>Secretary of State business filings</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <Briefcase className="h-4 w-4 text-primary shrink-0" />
                      <span>Professional history &amp; contacts</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress section */}
              {isProcessing && (
                <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="font-medium">
                        Processing: {currentSearchName}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {progress} / {progressTotal}
                    </span>
                  </div>
                  <Progress
                    value={progressTotal > 0 ? (progress / progressTotal) * 100 : 0}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Searching public records databases. This may take several minutes depending
                    on the number of names.
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleStartResearch}
                  disabled={isProcessing || parsedNames.length === 0}
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Start Research
                    </>
                  )}
                </Button>
                {results.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleClearResults}
                    disabled={isProcessing}
                    size="lg"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Results
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filters & Export Bar */}
          {results.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              {/* Status filter tabs */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {(["all", "pending", "confirmed", "rejected", "duplicate"] as StatusFilter[]).map(
                  (status) => (
                    <Button
                      key={status}
                      variant={statusFilter === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatusFilter(status)}
                      className="text-xs"
                    >
                      {status === "all"
                        ? "All"
                        : status === "duplicate"
                          ? "Duplicates"
                          : statusLabel(status as any)}
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                        {statusCounts[status]}
                      </Badge>
                    </Button>
                  )
                )}
              </div>

              {/* Export buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">Export:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV("all")}
                  className="text-xs"
                >
                  <FileDown className="h-3 w-3 mr-1" />
                  All ({results.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV("confirmed")}
                  className="text-xs"
                >
                  <FileDown className="h-3 w-3 mr-1" />
                  Confirmed ({statusCounts.confirmed})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportCSV("pending")}
                  className="text-xs"
                >
                  <FileDown className="h-3 w-3 mr-1" />
                  Pending ({statusCounts.pending})
                </Button>
              </div>
            </div>
          )}

          {/* Advanced Filters */}
          {results.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
              {/* Search within results */}
              <div className="flex-1 w-full sm:max-w-sm">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Search within results
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, employer, party..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Confidence slider */}
              <div className="w-full sm:w-64">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Minimum Confidence: {confidenceMin}%
                </Label>
                <Slider
                  value={[confidenceMin]}
                  onValueChange={(v) => setConfidenceMin(v[0])}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Sort toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSortByConfidence((prev) =>
                    prev === "desc" ? "asc" : "desc"
                  )
                }
                className="shrink-0"
              >
                <BarChart3 className="h-4 w-4 mr-1.5" />
                Confidence
                {sortByConfidence === "desc" ? (
                  <ChevronDown className="h-3 w-3 ml-1" />
                ) : (
                  <ChevronUp className="h-3 w-3 ml-1" />
                )}
              </Button>
            </div>
          )}

          {/* Results Table */}
          {results.length > 0 && (
            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50 hover:bg-transparent">
                        <TableHead className="w-[220px]">Name</TableHead>
                        <TableHead className="w-[110px]">Confidence</TableHead>
                        <TableHead className="w-[110px]">Status</TableHead>
                        <TableHead className="w-[140px]">Donations</TableHead>
                        <TableHead className="w-[100px]">Business</TableHead>
                        <TableHead className="w-[280px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredResults.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            No results match the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredResults.map((result) => (
                          <TableRow
                            key={result.id}
                            className="border-border/30 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => handleOpenDetail(result)}
                          >
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{result.name}</span>
                                {result.isDuplicate && (
                                  <span className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
                                    <Copy className="h-3 w-3" />
                                    Duplicate
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`font-mono text-xs ${confidenceColor(result.confidence)}`}
                              >
                                {result.confidence}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${statusColor(result.status)}`}
                              >
                                {statusLabel(result.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {result.politicalActivity.totalDonations || (
                                  <span className="text-muted-foreground text-xs">N/A</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {result.businessRecords.length > 0
                                  ? `${result.businessRecords.length} record${result.businessRecords.length > 1 ? "s" : ""}`
                                  : (
                                    <span className="text-muted-foreground text-xs">None</span>
                                  )}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDetail(result);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Details</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateStatus(result.id, "confirmed");
                                      }}
                                      disabled={result.status === "confirmed"}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Confirm Match</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateStatus(result.id, "rejected");
                                      }}
                                      disabled={result.status === "rejected"}
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reject Match</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="px-4 py-3 border-t border-border/30 text-xs text-muted-foreground">
                  Showing {filteredResults.length} of {results.length} results
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!isProcessing && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Search className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium mb-1">No Research Results Yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Paste a list of names above and click &quot;Start Research&quot; to begin
                searching public records, political donations, business filings, and more.
              </p>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-xs text-muted-foreground text-center">
              Election Research Tool &mdash; For lawful OSINT and public records research only. 
              All data sourced from publicly available records.
            </p>
          </div>
        </footer>

        {/* Detail Drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl p-0 overflow-hidden"
          >
            {selectedResult && (
              <DetailDrawer
                result={selectedResult}
                onConfirm={() => {
                  handleUpdateStatus(selectedResult.id, "confirmed");
                  setDrawerOpen(false);
                }}
                onReject={() => {
                  handleUpdateStatus(selectedResult.id, "rejected");
                  setDrawerOpen(false);
                }}
                onFlagDuplicate={() => {
                  setResults((prev) =>
                    prev.map((r) =>
                      r.id === selectedResult.id
                        ? {
                            ...r,
                            isDuplicate: true,
                            duplicateWarning: "Manually flagged as duplicate",
                            status: "duplicate" as const,
                          }
                        : r
                    )
                  );
                  toast({
                    title: "Flagged as duplicate",
                    description: `${selectedResult.name} has been marked as a duplicate.`,
                  });
                  setDrawerOpen(false);
                }}
              />
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

// ─── Detail Drawer Component ──────────────────────────────────────────────────

function DetailDrawer({
  result,
  onConfirm,
  onReject,
  onFlagDuplicate,
}: {
  result: ResearchResult;
  onConfirm: () => void;
  onReject: () => void;
  onFlagDuplicate: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <SheetHeader className="p-4 pb-3 border-b border-border/50 shrink-0">
        <SheetTitle className="text-lg">{result.name}</SheetTitle>
        <SheetDescription className="flex items-center gap-3 text-xs">
          <Badge
            variant="outline"
            className={`font-mono ${confidenceColor(result.confidence)}`}
          >
            {result.confidence}% confidence
          </Badge>
          <Badge variant="outline" className={statusColor(result.status)}>
            {statusLabel(result.status)}
          </Badge>
          {result.isDuplicate && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
              <Copy className="h-3 w-3 mr-1" />
              Duplicate
            </Badge>
          )}
        </SheetDescription>
      </SheetHeader>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Summary */}
          <section>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Summary
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {result.summary}
            </p>
            {result.error && (
              <div className="mt-2 p-2 bg-destructive/10 rounded-md text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {result.error}
              </div>
            )}
          </section>

          <Separator className="bg-border/50" />

          {/* Political Activity */}
          <PoliticalSection result={result} />

          <Separator className="bg-border/50" />

          {/* Business Records */}
          <BusinessSection records={result.businessRecords} />

          <Separator className="bg-border/50" />

          {/* Professional History */}
          <ProfessionalSection records={result.professionalHistory} />

          <Separator className="bg-border/50" />

          {/* Contact Info */}
          <ContactSection info={result.contactInfo} />

          <Separator className="bg-border/50" />

          {/* Sources */}
          <SourcesSection sources={result.sources} />
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="p-4 border-t border-border/50 flex flex-wrap gap-2 shrink-0">
        <Button
          size="sm"
          onClick={onConfirm}
          className="flex-1 min-w-[100px] bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onReject}
          className="flex-1 min-w-[100px]"
        >
          <XCircle className="h-4 w-4 mr-1.5" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFlagDuplicate}
          className="flex-1 min-w-[100px]"
        >
          <Copy className="h-4 w-4 mr-1.5" />
          Flag Duplicate
        </Button>
      </div>
    </div>
  );
}

// ─── Section Components ──────────────────────────────────────────────────────

function PoliticalSection({ result }: { result: ResearchResult }) {
  const pa = result.politicalActivity;
  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        Political Activity
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="FEC Record"
          value={pa.hasFECRecord ? "Found" : "None"}
          highlight={pa.hasFECRecord}
        />
        <StatCard
          label="Total Donations"
          value={pa.totalDonations || "N/A"}
        />
        <StatCard
          label="Party"
          value={pa.partyAffiliation || "N/A"}
        />
        <StatCard
          label="Offices Sought"
          value={
            pa.officesSought.length > 0
              ? pa.officesSought.join(", ")
              : "None found"
          }
        />
      </div>

      {pa.donations.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Donation History ({pa.donations.length})
          </h4>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/30">
                  <TableHead className="text-xs h-8">Date</TableHead>
                  <TableHead className="text-xs h-8">Amount</TableHead>
                  <TableHead className="text-xs h-8">Recipient</TableHead>
                  <TableHead className="text-xs h-8">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pa.donations.map((d: DonationRecord, i: number) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell className="text-xs py-2">{d.date || "N/A"}</TableCell>
                    <TableCell className="text-xs py-2 font-mono font-medium">
                      {d.amount || "N/A"}
                    </TableCell>
                    <TableCell className="text-xs py-2">{d.recipient || "N/A"}</TableCell>
                    <TableCell className="text-xs py-2">
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {d.type || "N/A"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

function BusinessSection({ records }: { records: BusinessRecord[] }) {
  if (records.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Business Records
        </h3>
        <p className="text-xs text-muted-foreground">No business records found.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        Business Records ({records.length})
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {records.map((b: BusinessRecord, i: number) => (
          <div
            key={i}
            className="rounded-lg border border-border/50 p-3 bg-muted/20 space-y-1"
          >
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium">{b.name || "Unknown"}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0 ml-2">
                {b.type || "N/A"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {b.state && <span>State: {b.state}</span>}
              {b.status && <span>Status: {b.status}</span>}
              {b.role && <span>Role: {b.role}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfessionalSection({ records }: { records: EmploymentRecord[] }) {
  if (records.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Professional History
        </h3>
        <p className="text-xs text-muted-foreground">No professional history found.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-primary" />
        Professional History ({records.length})
      </h3>
      <div className="space-y-0">
        {records.map((e: EmploymentRecord, i: number) => (
          <div key={i} className="flex gap-3 relative">
            {/* Timeline line */}
            {i < records.length - 1 && (
              <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border/50" />
            )}
            {/* Timeline dot */}
            <div className="mt-1.5 shrink-0">
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 ${
                  e.isCurrent
                    ? "bg-emerald-500/30 border-emerald-500"
                    : "bg-muted border-border"
                }`}
              />
            </div>
            {/* Content */}
            <div className="pb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{e.employer || "Unknown"}</span>
                {e.isCurrent && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  >
                    Current
                  </Badge>
                )}
              </div>
              {e.title && (
                <p className="text-xs text-muted-foreground">{e.title}</p>
              )}
              {e.period && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">{e.period}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContactSection({ info }: { info: ResearchResult["contactInfo"] }) {
  const hasAny =
    info.phone.length > 0 ||
    info.email.length > 0 ||
    info.address.length > 0 ||
    info.linkedin ||
    info.twitter ||
    info.otherSocial.length > 0;

  if (!hasAny) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          Contact Information
        </h3>
        <p className="text-xs text-muted-foreground">No contact information found.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Phone className="h-4 w-4 text-primary" />
        Contact Information
      </h3>
      <div className="space-y-3">
        {info.phone.length > 0 && (
          <div className="flex items-start gap-2.5">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-0.5">
              {info.phone.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        )}
        {info.email.length > 0 && (
          <div className="flex items-start gap-2.5">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-0.5">
              {info.email.map((e, i) => (
                <p key={i} className="text-primary break-all">{e}</p>
              ))}
            </div>
          </div>
        )}
        {info.address.length > 0 && (
          <div className="flex items-start gap-2.5">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-0.5">
              {info.address.map((a, i) => (
                <p key={i}>{a}</p>
              ))}
            </div>
          </div>
        )}
        {(info.linkedin || info.twitter) && (
          <div className="flex items-start gap-2.5">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-0.5">
              {info.linkedin && (
                <p className="flex items-center gap-1.5">
                  <Linkedin className="h-3.5 w-3.5 text-sky-400" />
                  <a
                    href={info.linkedin.startsWith("http") ? info.linkedin : `https://${info.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    LinkedIn Profile
                  </a>
                </p>
              )}
              {info.twitter && (
                <p className="flex items-center gap-1.5">
                  <Twitter className="h-3.5 w-3.5 text-sky-400" />
                  <a
                    href={info.twitter.startsWith("http") ? info.twitter : `https://${info.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    Twitter/X Profile
                  </a>
                </p>
              )}
            </div>
          </div>
        )}
        {info.otherSocial.length > 0 && (
          <div className="flex items-start gap-2.5">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-0.5">
              {info.otherSocial.map((s, i) => (
                <p key={i}>
                  <a
                    href={s.startsWith("http") ? s : `https://${s}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {s}
                  </a>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SourcesSection({ sources }: { sources: string[] }) {
  if (sources.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" />
          Sources
        </h3>
        <p className="text-xs text-muted-foreground">No sources available.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <ExternalLink className="h-4 w-4 text-primary" />
        Sources ({sources.length})
      </h3>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {sources.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all py-0.5"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {url}
          </a>
        ))}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/50 p-2.5 bg-muted/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p
        className={`text-sm font-medium ${
          highlight ? "text-emerald-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
