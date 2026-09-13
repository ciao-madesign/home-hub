export interface EngineHandle {
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface EngineCallbacks {
  onTitle(title: string): void;
  onProgress(
    percent: number,
    downloadedBytes: number | null,
    totalBytes: number | null,
    speedBytesPerSec: number | null,
  ): void;
  onDone(error: Error | null): void;
}
