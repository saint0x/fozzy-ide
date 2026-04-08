import { useDeferredValue, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Diagnostic, LspDocumentBundle } from '@/types';

interface CodeEditorProps {
  value: string;
  language: string;
  diagnostics?: Diagnostic[];
  bundle?: LspDocumentBundle | null;
  onChange: (value: string) => void;
}

const KEYWORDS: Record<string, string[]> = {
  rust: ['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'use', 'mod', 'match', 'if', 'else', 'return', 'async', 'await', 'crate', 'Self', 'self'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'export', 'import', 'from', 'type', 'interface', 'extends', 'async', 'await', 'class', 'new', 'switch', 'case'],
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'export', 'import', 'from', 'async', 'await', 'class', 'new', 'switch', 'case'],
  python: ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'with', 'async', 'await'],
  go: ['func', 'package', 'import', 'return', 'if', 'else', 'for', 'range', 'struct', 'type', 'interface', 'go', 'defer'],
  json: ['true', 'false', 'null'],
  toml: ['true', 'false'],
};

export function CodeEditor({ value, language, diagnostics = [], bundle, onChange }: CodeEditorProps) {
  const deferredValue = useDeferredValue(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split('\n'), [value]);
  const highlightedLines = useMemo(
    () => deferredValue.split('\n').map((line) => highlightLine(line, language)),
    [deferredValue, language],
  );
  const diagnosticsByLine = useMemo(() => {
    const map = new Map<number, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
      const list = map.get(diagnostic.line) ?? [];
      list.push(diagnostic);
      map.set(diagnostic.line, list);
    }
    return map;
  }, [diagnostics]);
  const symbolLines = useMemo(
    () => new Set((bundle?.symbols ?? []).map((symbol) => symbol.line)),
    [bundle?.symbols],
  );

  return (
    <div className="flex h-full min-h-0 bg-bg-primary overflow-hidden">
      <div
        ref={lineNumbersRef}
        className="shrink-0 overflow-hidden border-r border-border-muted/30 bg-bg-secondary/30 py-3 pr-3 text-right select-none"
      >
        {lines.map((_, index) => {
          const lineNumber = index + 1;
          const lineDiagnostics = diagnosticsByLine.get(lineNumber) ?? [];
          const severity = lineDiagnostics[0]?.severity;
          return (
            <div
              key={lineNumber}
              className={cn(
                'flex items-center justify-end gap-2 px-3 font-mono text-[11px] leading-5',
                severity === 'error' && 'text-error',
                severity === 'warning' && 'text-warning',
                !severity && 'text-text-muted/50',
              )}
            >
              {lineDiagnostics.length > 0 ? (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              ) : symbolLines.has(lineNumber) ? (
                <span className="h-1.5 w-1.5 rounded-full bg-accent-primary/60" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
              )}
              <span>{lineNumber}</span>
            </div>
          );
        })}
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-auto"
        >
          <pre className="min-h-full py-3 px-4 text-[12px] leading-5 font-mono whitespace-pre">
            {highlightedLines.map((segments, index) => (
              <div key={index} className="min-h-5">
                {segments.length > 0 ? segments.map((segment, segmentIndex) => (
                  <span key={segmentIndex} className={segment.className}>
                    {segment.text}
                  </span>
                )) : ' '}
              </div>
            ))}
          </pre>
        </div>

        <textarea
          ref={textareaRef}
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const target = event.currentTarget;
            if (overlayRef.current) {
              overlayRef.current.scrollTop = target.scrollTop;
              overlayRef.current.scrollLeft = target.scrollLeft;
            }
            if (lineNumbersRef.current) {
              lineNumbersRef.current.scrollTop = target.scrollTop;
            }
          }}
          className={cn(
            'relative z-10 block h-full min-h-full w-full resize-none overflow-auto bg-transparent py-3 px-4',
            'font-mono text-[12px] leading-5 text-transparent caret-text-primary',
            'selection:bg-accent-primary/25 focus:outline-none',
          )}
          style={{
            caretColor: 'var(--color-text-primary)',
          }}
        />
      </div>
    </div>
  );
}

type HighlightSegment = { text: string; className: string };

function highlightLine(line: string, language: string): HighlightSegment[] {
  if (line.length === 0) return [];

  const segments: HighlightSegment[] = [];
  const push = (text: string, className: string) => {
    if (!text) return;
    segments.push({ text, className });
  };

  const commentPattern = commentRegex(language);
  const stringPattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
  const numberPattern = /\b\d+(?:\.\d+)?\b/g;
  const keywordSet = new Set(KEYWORDS[language] ?? KEYWORDS.typescript);
  const tokenPattern = /([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\s+|.)/g;

  const commentMatch = commentPattern?.exec(line);
  const codePortion = commentMatch ? line.slice(0, commentMatch.index) : line;
  const commentPortion = commentMatch ? line.slice(commentMatch.index) : '';

  for (const token of codePortion.match(tokenPattern) ?? []) {
    if (/^\s+$/.test(token)) {
      push(token, 'text-text-primary');
      continue;
    }
    if (stringPattern.test(token)) {
      push(token, 'text-success');
      stringPattern.lastIndex = 0;
      continue;
    }
    stringPattern.lastIndex = 0;
    if (numberPattern.test(token)) {
      push(token, 'text-warning');
      numberPattern.lastIndex = 0;
      continue;
    }
    numberPattern.lastIndex = 0;
    if (keywordSet.has(token)) {
      push(token, 'text-sky-300');
      continue;
    }
    if (/^[{}[\](),.;:+\-*/%=<>!?&|^~]+$/.test(token)) {
      push(token, 'text-text-tertiary');
      continue;
    }
    if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      push(token, 'text-orange-300');
      continue;
    }
    push(token, 'text-text-primary');
  }

  if (commentPortion) {
    push(commentPortion, 'text-text-muted');
  }

  return segments;
}

function commentRegex(language: string): RegExp | null {
  if (language === 'python' || language === 'toml') {
    return /#/g;
  }
  if (language === 'markdown') {
    return null;
  }
  return /\/\//g;
}
