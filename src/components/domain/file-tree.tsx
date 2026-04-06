import { useState, useCallback } from 'react';
import type { FileNode } from '@/types';
import { cn } from '@/lib/utils';

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (node: FileNode) => void;
  selectedPath: string | null;
}

const fileIconByExtension: Record<string, string> = {
  rs: 'rs',
  ts: 'ts',
  tsx: 'tx',
  js: 'js',
  json: '{}',
  toml: 'tm',
  md: 'md',
  py: 'py',
  go: 'go',
};

function getFileIcon(name: string): string {
  const ext = name.split('.').pop() ?? '';
  return fileIconByExtension[ext] ?? '--';
}

function FileTreeNode({ node, depth, onFileSelect, selectedPath }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedPath;

  const handleClick = useCallback(() => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(node);
    }
  }, [isDir, node, onFileSelect]);

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1.5 w-full text-left py-[3px] pr-2 text-xs',
          'transition-colors duration-100 rounded-sm',
          'hover:bg-bg-hover',
          isSelected && 'bg-bg-active text-text-primary',
          !isSelected && 'text-text-secondary',
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {/* Chevron / spacer */}
        {isDir ? (
          <svg
            className={cn(
              'h-3 w-3 shrink-0 text-text-muted transition-transform duration-150',
              expanded && 'rotate-90',
            )}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {isDir ? (
          <span className="text-[10px] shrink-0">
            {expanded ? (
              <svg className="h-3.5 w-3.5 text-accent-primary" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5.5A1.5 1.5 0 0014.5 4H8L6.354 2.354A.5.5 0 006 2H1.5z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 text-text-muted" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.54 3.87L.5 3a2 2 0 012-2h3.672a2 2 0 011.414.586l.828.828A2 2 0 009.828 3H13.5a2 2 0 012 2v.172l-7.46 3.655L.54 3.87z" />
                <path d="M14.5 6H1.46l-.01.023-.036.078-1.35 3.375A1 1 0 00.926 11H2.1a1 1 0 00.832-.445l.553-.83a.5.5 0 01.416-.225h7.198a.5.5 0 01.416.225l.553.83A1 1 0 0012.9 11h1.174a1 1 0 00.926-1.524L14.5 6z" />
              </svg>
            )}
          </span>
        ) : (
          <span className="text-[9px] font-mono font-bold shrink-0 w-3.5 text-center text-text-muted opacity-60">
            {getFileIcon(node.name)}
          </span>
        )}

        {/* Name */}
        <span className="truncate">{node.name}</span>
      </button>

      {/* Children */}
      {isDir && expanded && node.children && (
        <div>
          {[...node.children]
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileSelect={onFileSelect}
                selectedPath={selectedPath}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Exported wrapper ──────────────────────────────────────────────────────────

interface FileTreeProps {
  root: FileNode;
  onFileSelect: (node: FileNode) => void;
  selectedPath?: string | null;
  className?: string;
}

export function FileTree({ root, onFileSelect, selectedPath = null, className }: FileTreeProps) {
  return (
    <div className={cn('overflow-y-auto overflow-x-hidden select-none', className)}>
      <FileTreeNode
        node={root}
        depth={0}
        onFileSelect={onFileSelect}
        selectedPath={selectedPath}
      />
    </div>
  );
}
