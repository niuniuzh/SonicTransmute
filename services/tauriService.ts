import { AudioFile } from '../types';

// Declare global window types for Tauri
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: (cmd: string, args?: any) => Promise<any>;
      };
      event: {
        listen: (event: string, handler: (event: any) => void) => Promise<() => void>;
      };
    };
  }
}

/**
 * Service to handle NCM conversion logic.
 * 
 * ARCHITECTURE NOTE:
 * .ncm files are encrypted. FFmpeg cannot open them directly.
 * The Rust backend must:
 * 1. Decrypt the NCM file (removing the RC4 encryption).
 * 2. Pipe the decrypted stream to an encoder (like FFmpeg or Flac lib).
 * 3. Save as .flac.
 */
export class TauriService {
  private static instance: TauriService;
  private isTauriEnv: boolean;

  private constructor() {
    this.isTauriEnv = !!window.__TAURI__;
  }

  public static getInstance(): TauriService {
    if (!TauriService.instance) {
      TauriService.instance = new TauriService();
    }
    return TauriService.instance;
  }

  public getIsTauri(): boolean {
    return this.isTauriEnv;
  }

  /**
   * Listen to backend progress events.
   * Rust backend should emit: app:conversion-progress
   */
  public async listenToProgress(callback: (payload: any) => void): Promise<() => void> {
    if (this.isTauriEnv && window.__TAURI__) {
      return await window.__TAURI__.event.listen('app:conversion-progress', (event) => {
        callback(event.payload);
      });
    }
    return () => {}; // No-op for web
  }

  /**
   * Converts a single NCM file to FLAC.
   * Calls Rust command: `convert_ncm_file`
   */
  public async convertFile(file: AudioFile): Promise<{ success: boolean; message?: string }> {
    if (this.isTauriEnv && window.__TAURI__) {
      try {
        console.log(`[Tauri] Invoking conversion for: ${file.path}`);
        // The Rust function signature should be: 
        // fn convert_ncm_file(id: String, file_path: String) -> Result<(), String>
        await window.__TAURI__.core.invoke('convert_ncm_file', { 
          id: file.id,
          filePath: file.path 
        });
        return { success: true };
      } catch (error) {
        console.error('[Tauri] Conversion failed:', error);
        return { success: false, message: String(error) };
      }
    }

    // --- WEB SIMULATION MODE ---
    // Simulate real-time progress update logic for preview
    return new Promise((resolve) => {
      console.log(`[Web Sim] Decrypting NCM header for ${file.name}...`);
      setTimeout(() => {
        // Simulate random failure
        if (Math.random() > 0.95) {
            resolve({ success: false, message: "Invalid NCM Key or corrupt header" });
        } else {
            resolve({ success: true });
        }
      }, 2000);
    });
  }

  /**
   * Start watching a folder for new .ncm files
   */
  public async startWatcher(path: string): Promise<boolean> {
    if (this.isTauriEnv && window.__TAURI__) {
      await window.__TAURI__.core.invoke('start_folder_watcher', { path });
      return true;
    }
    console.log(`[Web Sim] Watcher started on ${path}`);
    return true;
  }

  public async stopWatcher(): Promise<boolean> {
    if (this.isTauriEnv && window.__TAURI__) {
      await window.__TAURI__.core.invoke('stop_folder_watcher');
      return true;
    }
    console.log(`[Web Sim] Watcher stopped`);
    return true;
  }
}