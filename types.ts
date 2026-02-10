export enum ConversionStatus {
  IDLE = 'IDLE',
  PENDING = 'PENDING',
  CONVERTING = 'CONVERTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface AudioFile {
  id: string;
  name: string;
  path: string;
  size: number;
  status: ConversionStatus;
  progress: number; // 0 to 100
  errorMessage?: string;
}

export interface AppStats {
  totalFiles: number;
  converted: number;
  failed: number;
  pending: number;
}

export interface FolderConfig {
  path: string | null;
  isWatching: boolean;
}

export interface ProgressEventPayload {
  id: string;
  progress: number;
  status?: 'processing' | 'completed' | 'error';
  message?: string;
}