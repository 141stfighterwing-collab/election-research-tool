export interface DonationRecord {
  date: string;
  amount: string;
  recipient: string;
  type: string; // "campaign" | "PAC" | "party"
}

export interface BusinessRecord {
  name: string;
  type: string; // "LLC" | "Corporation" | "Partnership"
  state: string;
  status: string;
  role: string;
}

export interface EmploymentRecord {
  employer: string;
  title: string;
  period: string;
  isCurrent: boolean;
}

export interface ContactInfo {
  phone: string[];
  email: string[];
  address: string[];
  linkedin: string;
  twitter: string;
  otherSocial: string[];
}

export interface ResearchResult {
  id: string;
  name: string;
  targetCity?: string;
  targetState?: string;
  confidence: number; // 0-100
  status: "pending" | "confirmed" | "rejected" | "duplicate";
  isDuplicate: boolean;
  duplicateWarning?: string;
  politicalActivity: {
    hasFECRecord: boolean;
    totalDonations: string;
    donations: DonationRecord[];
    officesSought: string[];
    partyAffiliation: string;
  };
  businessRecords: BusinessRecord[];
  professionalHistory: EmploymentRecord[];
  contactInfo: ContactInfo;
  summary: string;
  sources: string[];
  searchedAt: string;
  error?: string;
}

export interface SearchRequest {
  names: string[];
  targetCity?: string;
  targetState?: string;
}

export interface SearchProgress {
  current: number;
  total: number;
  currentName: string;
  status: "idle" | "searching" | "paused" | "complete" | "error";
  error?: string;
}

export type StatusFilter = "all" | "pending" | "confirmed" | "rejected" | "duplicate";
