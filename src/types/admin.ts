export interface AssignedShowSummary {
  id: string;
  prefix: string;
  title: string;
  channelNumber: number;
}

export interface AdminAccessCode {
  id: string;
  code: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  maxDevices: number | null;
  revoked: boolean;
  revokedAt: string | null;
  _count: { sessions: number };
  assignedShows?: AssignedShowSummary[];
}

export interface AdminSessionAccessCode {
  id: string;
  code: string;
  label: string | null;
  revoked: boolean;
  expiresAt: string | null;
}

export interface AdminSession {
  id: string;
  role: "admin" | "user";
  displayName: string | null;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  userAgent: string | null;
  ip: string | null;
  isActive: boolean;
  accessCode: AdminSessionAccessCode | null;
}
