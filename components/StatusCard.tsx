import React from 'react';

interface StatusCardProps {
  label: string;
  value: number;
  icon?: React.ReactNode;
  colorClass?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ label, value, icon, colorClass = "text-slate-100" }) => {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl flex items-center justify-between backdrop-blur-sm">
      <div>
        <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">{label}</p>
        <p className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</p>
      </div>
      {icon && <div className="opacity-80">{icon}</div>}
    </div>
  );
};