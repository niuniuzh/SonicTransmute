import React from 'react';
import { AudioFile, ConversionStatus } from '../types';
import { Icons } from '../constants';

interface FileItemProps {
  file: AudioFile;
}

export const FileItem: React.FC<FileItemProps> = ({ file }) => {
  const getStatusIcon = () => {
    switch (file.status) {
      case ConversionStatus.CONVERTING:
        return <Icons.RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
      case ConversionStatus.COMPLETED:
        return <Icons.CheckCircle className="w-5 h-5 text-emerald-400" />;
      case ConversionStatus.FAILED:
        return <Icons.AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Icons.Lock className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusText = () => {
    switch (file.status) {
      case ConversionStatus.PENDING:
        return <span className="text-slate-400 text-xs uppercase tracking-wider">Pending</span>;
      case ConversionStatus.CONVERTING:
        return <span className="text-blue-400 text-xs uppercase tracking-wider animate-pulse">Decrypting...</span>;
      case ConversionStatus.COMPLETED:
        return <span className="text-emerald-400 text-xs uppercase tracking-wider">Flac Ready</span>;
      case ConversionStatus.FAILED:
        return <span className="text-red-400 text-xs uppercase tracking-wider">Error</span>;
      default:
        return <span className="text-slate-500 text-xs uppercase tracking-wider">Waiting</span>;
    }
  };

  return (
    <div className="group flex items-center justify-between p-3 mb-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-all duration-200">
      <div className="flex items-center gap-4 overflow-hidden">
        <div className={`p-2 rounded-full ${file.status === ConversionStatus.COMPLETED ? 'bg-emerald-500/10' : 'bg-slate-700/50'}`}>
           {file.status === ConversionStatus.COMPLETED ? (
              <Icons.Unlock className="w-5 h-5 text-emerald-400" />
           ) : (
              <Icons.Music className="w-5 h-5 text-slate-400" />
           )}
        </div>
        
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-slate-200 truncate pr-4" title={file.name}>
            {file.name}
          </span>
          <div className="flex items-center gap-2">
            {getStatusText()}
            <span className="text-slate-600 text-xs">•</span>
            <span className="text-slate-500 text-xs font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {file.errorMessage && (
           <span className="text-red-400 text-xs mr-2">{file.errorMessage}</span>
        )}
        <div className="w-8 h-8 flex items-center justify-center">
          {getStatusIcon()}
        </div>
      </div>
      
      {/* Progress Bar background for converting state */}
      {file.status === ConversionStatus.CONVERTING && (
        <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500/50 transition-all duration-500" style={{ width: `${file.progress}%` }} />
      )}
    </div>
  );
};