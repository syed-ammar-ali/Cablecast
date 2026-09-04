import "server-only";

export interface ProviderHealthStatus {
  id: string;
  name: string;
  isOnline: boolean;
  latencyMs: number;
  lastChecked: number;
  isDynamic: boolean;
  error?: string;
}

export async function getProvidersHealth(): Promise<ProviderHealthStatus[]> {
  return [];
}
