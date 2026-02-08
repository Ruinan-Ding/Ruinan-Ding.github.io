export interface SystemMetrics {
  uptime: number;
  status: 'operational' | 'degraded' | 'offline';
  version: string;
}
