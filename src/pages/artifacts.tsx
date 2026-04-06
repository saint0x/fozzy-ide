import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifacts } from '@/hooks/use-data';
import { useAppStore } from '@/stores/app-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import type { Artifact } from '@/types';

const TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All types', value: 'all' },
  { label: 'Report', value: 'report' },
  { label: 'Log', value: 'log' },
  { label: 'Coverage', value: 'coverage' },
  { label: 'Trace', value: 'trace' },
  { label: 'Screenshot', value: 'screenshot' },
  { label: 'Binary', value: 'binary' },
];

function typeVariant(type: Artifact['type']) {
  switch (type) {
    case 'report': return 'info' as const;
    case 'log': return 'default' as const;
    case 'coverage': return 'success' as const;
    case 'trace': return 'warning' as const;
    case 'screenshot': return 'info' as const;
    case 'binary': return 'default' as const;
  }
}

function isPreviewable(type: Artifact['type']): boolean {
  return type === 'report' || type === 'log' || type === 'coverage';
}

export default function ArtifactsPage() {
  const setActiveSection = useAppStore((s) => s.setActiveSection);
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    setActiveSection('artifacts');
  }, [setActiveSection]);

  const artifactsQuery = useArtifacts();
  const allArtifacts = artifactsQuery.data ?? [];

  const filteredArtifacts = useMemo(() => {
    if (typeFilter === 'all') return allArtifacts;
    return allArtifacts.filter((a) => a.type === typeFilter);
  }, [allArtifacts, typeFilter]);

  const selectedTypeLabel =
    TYPE_OPTIONS.find((o) => o.value === typeFilter)?.label ?? 'All types';

  if (artifactsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" className="text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-text-primary">Artifacts</h1>
        <Dropdown
          trigger={
            <Button variant="outline" size="sm">
              {selectedTypeLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </Button>
          }
        >
          {TYPE_OPTIONS.map((opt) => (
            <DropdownItem
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
            >
              {opt.label}
            </DropdownItem>
          ))}
        </Dropdown>
      </div>

      {/* Artifact grid */}
      {filteredArtifacts.length === 0 ? (
        <EmptyState
          title="No artifacts"
          description={
            typeFilter !== 'all'
              ? 'No artifacts match this filter.'
              : 'Artifacts will appear here after runs produce output files.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredArtifacts.map((art) => (
            <Card key={art.id} hoverable className="flex flex-col">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-text-primary truncate flex-1">
                    {art.name}
                  </span>
                  <Badge variant={typeVariant(art.type)} size="sm">
                    {art.type}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-tertiary">Run</span>
                    <button
                      onClick={() => navigate(`/runs/${art.runId}`)}
                      className="text-accent-primary hover:underline"
                    >
                      {art.runId}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-tertiary">Size</span>
                    <span className="text-text-secondary tabular-nums">
                      {formatBytes(art.size)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-tertiary">Created</span>
                    <span className="text-text-secondary">
                      {formatRelativeTime(art.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                    Download
                  </Button>
                  {isPreviewable(art.type) && (
                    <Button variant="ghost" size="sm">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Preview
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
