'use client';
import { useState } from 'react';

export default function PackageFiles({ files }: { files: Record<string, string> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const entries = Object.entries(files);

  return (
    <div className="space-y-2">
      {entries.map(([name, content]) => (
        <div key={name} className="rounded border border-gray-800/50 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === name ? null : name)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/30 transition-colors"
          >
            <svg className={`w-3 h-3 text-gray-500 transition-transform ${expanded === name ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-sm font-mono text-gray-300">{name}</span>
            <span className="ml-auto text-[11px] text-gray-600">{content.split('\n').length} lines</span>
          </button>
          {expanded === name && (
            <pre className="px-4 py-3 text-xs text-gray-400 bg-black/50 border-t border-gray-800/50 overflow-x-auto max-h-96">
              <code>{content}</code>
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
