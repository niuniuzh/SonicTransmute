import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from './constants';
import { AudioFile, ConversionStatus, AppStats, FolderConfig, ProgressEventPayload } from './types';
import { FileItem } from './components/FileItem';
import { StatusCard } from './components/StatusCard';
import { TauriService } from './services/tauriService';

const App: React.FC = () => {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [folderConfig, setFolderConfig] = useState<FolderConfig>({ path: null, isWatching: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // Stats derivation
  const stats: AppStats = {
    totalFiles: files.length,
    converted: files.filter(f => f.status === ConversionStatus.COMPLETED).length,
    failed: files.filter(f => f.status === ConversionStatus.FAILED).length,
    pending: files.filter(f => f.status === ConversionStatus.PENDING || f.status === ConversionStatus.IDLE).length,
  };

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${msg}`].slice(-50));
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- Real-time Progress Listener (Tauri) ---
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await TauriService.getInstance().listenToProgress((payload: ProgressEventPayload) => {
        setFiles(prev => prev.map(f => {
          if (f.id === payload.id) {
            // Update progress or status based on event
            const updates: Partial<AudioFile> = { progress: payload.progress };
            if (payload.status === 'completed') updates.status = ConversionStatus.COMPLETED;
            if (payload.status === 'error') {
               updates.status = ConversionStatus.FAILED;
               updates.errorMessage = payload.message;
            }
            return { ...f, ...updates };
          }
          return f;
        }));
      });
      return unlisten;
    };
    
    const unlistenPromise = setupListener();
    return () => { unlistenPromise.then(unlisten => unlisten()); };
  }, []);

  // --- Simulation Progress Effect (Web Only) ---
  useEffect(() => {
    if (TauriService.getInstance().getIsTauri()) return; // Skip in real app
    
    if (!isProcessing) return;
    
    const interval = setInterval(() => {
      setFiles(prevFiles => {
        // Find converting files and increment their progress artificially
        return prevFiles.map(f => {
          if (f.status === ConversionStatus.CONVERTING) {
             const newProgress = Math.min(f.progress + (Math.random() * 5), 99);
             return { ...f, progress: newProgress };
          }
          return f;
        });
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isProcessing]);


  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const selectedFiles = Array.from(event.target.files) as any[];
      const ncmFiles = selectedFiles.filter(f => f.name.endsWith('.ncm'));
      
      const path = selectedFiles[0].webkitRelativePath?.split('/')[0] || "Selected Folder";
      
      addLog(`Selected directory: ${path}`);
      
      if (ncmFiles.length === 0) {
        addLog("No .ncm files found in this selection.");
        return;
      }

      const newFiles: AudioFile[] = ncmFiles.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        name: f.name,
        path: f.webkitRelativePath || f.name, 
        size: f.size,
        status: ConversionStatus.PENDING,
        progress: 0
      }));

      setFiles(newFiles);
      setFolderConfig({ path, isWatching: false });
      addLog(`Queued ${ncmFiles.length} files.`);
    }
  };

  // Processing Queue Logic
  useEffect(() => {
    let active = true;

    const processQueue = async () => {
      if (!isProcessing) return;

      const nextFile = files.find(f => f.status === ConversionStatus.PENDING);
      
      // If no pending files left
      if (!nextFile) {
        const anyConverting = files.some(f => f.status === ConversionStatus.CONVERTING);
        if (!anyConverting && !folderConfig.isWatching && stats.totalFiles > 0) {
            // Only stop if we are not waiting for async results
            setIsProcessing(false);
            addLog("All tasks completed.");
        }
        return;
      }

      // Mark as converting
      setFiles(prev => prev.map(f => f.id === nextFile.id ? { ...f, status: ConversionStatus.CONVERTING, progress: 0 } : f));
      addLog(`Starting: ${nextFile.name}`);

      // Invoke Service
      const tauriService = TauriService.getInstance();
      const result = await tauriService.convertFile(nextFile);

      if (active) {
        // If it's a synchronous return (like simulation or instant fail), handle it.
        // For real Tauri async events, the listenToProgress effect handles completion.
        if (!tauriService.getIsTauri()) {
            setFiles(prev => prev.map(f => {
            if (f.id === nextFile.id) {
                return {
                ...f,
                status: result.success ? ConversionStatus.COMPLETED : ConversionStatus.FAILED,
                errorMessage: result.message,
                progress: 100
                };
            }
            return f;
            }));
            if (result.success) addLog(`Converted: ${nextFile.name}`);
            else addLog(`Error: ${nextFile.name} - ${result.message}`);
        }
      }
    };

    if (isProcessing) {
      // In a real app, we might want to process concurrently, but here we do serial for simplicity
      // Check if we are already processing one?
      const currentlyConverting = files.filter(f => f.status === ConversionStatus.CONVERTING).length;
      if (currentlyConverting < 1) { // Process 1 at a time
          processQueue();
      }
    }

    return () => { active = false; };
  }, [files, isProcessing, folderConfig.isWatching]);

  const toggleWatcher = async () => {
    const tauriService = TauriService.getInstance();
    if (!folderConfig.isWatching) {
        await tauriService.startWatcher(folderConfig.path || "");
        setFolderConfig(prev => ({ ...prev, isWatching: true }));
        setIsProcessing(true);
        addLog("Watcher Mode: Enabled");
    } else {
        await tauriService.stopWatcher();
        setFolderConfig(prev => ({ ...prev, isWatching: false }));
        setIsProcessing(false);
        addLog("Watcher Mode: Disabled");
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden selection:bg-indigo-500/30">
      
      {/* Sidebar / Control Panel */}
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Icons.Music className="text-white w-6 h-6" />
            </div>
            <div>
                <h1 className="font-bold text-xl tracking-tight">SonicTransmute</h1>
                <p className="text-xs text-slate-500 font-mono">v2.0.0-Tauri</p>
            </div>
        </div>

        <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
          {/* Action Area */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</h2>
            
            {!folderConfig.path ? (
               <label className="group flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-slate-800/50 transition-all cursor-pointer">
                  <Icons.FolderOpen className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 mb-2 transition-colors" />
                  <span className="text-sm text-slate-400 group-hover:text-slate-200">Select Folder</span>
                  <input 
                    type="file" 
                    className="hidden" 
                    // @ts-ignore
                    webkitdirectory="" 
                    directory="" 
                    multiple 
                    onChange={handleFolderSelect} 
                  />
               </label>
            ) : (
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <div className="flex items-center gap-3 mb-2">
                        <Icons.FolderOpen className="text-indigo-400 w-5 h-5" />
                        <span className="font-medium truncate text-sm" title={folderConfig.path}>{folderConfig.path}</span>
                    </div>
                    <button 
                        onClick={() => setFiles([]) && setFolderConfig({path: null, isWatching: false})}
                        className="text-xs text-slate-400 hover:text-red-400 underline decoration-slate-600 underline-offset-4"
                    >
                        Change Folder
                    </button>
                </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Controls</h2>
            
            <button
                onClick={() => setIsProcessing(!isProcessing)}
                disabled={!folderConfig.path || folderConfig.isWatching}
                className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                    !folderConfig.path 
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                    : isProcessing 
                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                }`}
            >
                {isProcessing ? <Icons.RefreshCw className="animate-spin w-4 h-4" /> : <Icons.Play className="w-4 h-4" />}
                {isProcessing ? 'Processing Queue...' : 'Start Conversion'}
            </button>

            <button
                onClick={toggleWatcher}
                disabled={!folderConfig.path}
                className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all border ${
                    folderConfig.isWatching
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-transparent border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
            >
                {folderConfig.isWatching ? <Icons.Eye className="w-4 h-4" /> : <Icons.EyeOff className="w-4 h-4" />}
                {folderConfig.isWatching ? 'Watch Mode Active' : 'Enable Watch Mode'}
            </button>
          </div>

          <div className="flex-1"></div>

          <div className="grid grid-cols-2 gap-3">
             <StatusCard label="Total" value={stats.totalFiles} />
             <StatusCard label="Done" value={stats.converted} colorClass="text-emerald-400" />
             <StatusCard label="Pending" value={stats.pending} colorClass="text-indigo-400" />
             <StatusCard label="Failed" value={stats.failed} colorClass="text-red-400" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
        {/* Decorative Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute -top-[20%] -right-[10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-[10%] left-[10%] w-[400px] h-[400px] bg-emerald-600/5 rounded-full blur-3xl"></div>
        </div>

        {/* Header */}
        <header className="h-16 border-b border-slate-800/50 flex items-center justify-between px-6 z-10 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-slate-400">
                <Icons.FolderOpen className="w-4 h-4" />
                <span>/</span>
                <span>{folderConfig.path ? folderConfig.path.split('/').pop() : 'No Selection'}</span>
            </div>
            <div className="flex items-center gap-4">
                <span className={`text-xs font-mono px-2 py-1 rounded border ${TauriService.getInstance().getIsTauri() ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                    {TauriService.getInstance().getIsTauri() ? 'TAURI BACKEND' : 'WEB SIMULATION'}
                </span>
                <button className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                    <Icons.Settings className="w-5 h-5" />
                </button>
            </div>
        </header>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-6 z-10">
            {files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 mx-auto">
                        <Icons.Music className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="text-lg font-medium mb-1">Waiting for Files</p>
                    <p className="text-sm max-w-sm mx-auto">
                        Select a folder containing .ncm files.
                        { !TauriService.getInstance().getIsTauri() && <span className="block mt-2 text-amber-500/60 text-xs">(NCM decryption requires Rust backend. This view is simulating the UI.)</span>}
                    </p>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto">
                    {files.map(file => (
                        <FileItem key={file.id} file={file} />
                    ))}
                </div>
            )}
        </div>

        {/* Log Panel */}
        <div className="h-32 bg-slate-900 border-t border-slate-800 p-3 z-20">
            <div className="h-full bg-slate-950 rounded-lg border border-slate-800/50 p-2 overflow-y-auto font-mono text-xs text-slate-400 space-y-1 shadow-inner">
                {logs.map((log, i) => (
                    <div key={i} className="hover:text-slate-200 transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-2">
                        {log}
                    </div>
                ))}
                <div ref={logEndRef} />
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;