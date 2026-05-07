'use client';

import * as React from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import CreateWidgetModal from './CreateWidgetModal';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export type WidgetRow = {
  id: string;
  portfolio_id?: string;
  holding_id?: string;
  type: string;
  title: string | null;
  config: any | null;
  position: number;
};

export type EditWidgetsModalProps = {
  portfolioId: string;
  holdingId?: string;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export default function EditWidgetsModal({ portfolioId, holdingId, open, onClose, onChanged }: EditWidgetsModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<Element | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<WidgetRow | null>(null);
  const [draggedWidget, setDraggedWidget] = React.useState<string | null>(null);
  const [dragOverWidget, setDragOverWidget] = React.useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while modal is open
  React.useEffect(() => {
    if (!mounted || !open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mounted]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setEditing(null);
  }, [open, portfolioId]);

  // Focus management
  React.useEffect(() => {
    if (!mounted) return;
    if (open) {
      triggerRef.current = document.activeElement;
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    } else {
      (triggerRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open, mounted]);

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  // Determine API endpoint
  const apiEndpoint = holdingId
    ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
    : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

  const { data, error: fetchError, isLoading, mutate } = useSWR<{ data: WidgetRow[] }>(
    open ? apiEndpoint : null,
    fetcher
  );

  const widgets = React.useMemo(() => (data?.data ?? []).slice().sort((a, b) => a.position - b.position), [data]);

  function startCreate() {
    setEditing(null);
    setShowCreateModal(true);
  }

  function startEdit(w: WidgetRow) {
    setEditing(w);
    setShowCreateModal(true);
  }

  async function removeWidget(id: string) {
    if (!confirm('Delete this widget? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      const deleteUrl = holdingId
        ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets/${encodeURIComponent(id)}`
        : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets/${encodeURIComponent(id)}`;

      const res = await fetch(deleteUrl, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Delete failed');
      }
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete widget');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reorder two widgets by swapping their positions.
   * Uses a 3-step process to avoid unique constraint violations:
   * 1. Move widget A to temporary position
   * 2. Move widget B to A's original position
   * 3. Move widget A to B's original position
   */
  async function reorderWidgets(widgetA: WidgetRow, widgetB: WidgetRow) {
    const baseUrl = holdingId
      ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
      : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

    const tempPosition = 999999;

    // Step 1: Move widget A to temp position
    const res1 = await fetch(`${baseUrl}/${encodeURIComponent(widgetA.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: tempPosition })
    });

    if (!res1.ok) {
      const error1 = await res1.json().catch(() => ({}));
      throw new Error(error1?.error || 'Failed to reorder widgets');
    }

    // Step 2: Move widget B to A's original position
    const res2 = await fetch(`${baseUrl}/${encodeURIComponent(widgetB.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: widgetA.position })
    });

    if (!res2.ok) {
      const error2 = await res2.json().catch(() => ({}));
      throw new Error(error2?.error || 'Failed to reorder widgets');
    }

    // Step 3: Move widget A to B's original position
    const res3 = await fetch(`${baseUrl}/${encodeURIComponent(widgetA.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: widgetB.position })
    });

    if (!res3.ok) {
      const error3 = await res3.json().catch(() => ({}));
      throw new Error(error3?.error || 'Failed to reorder widgets');
    }
  }

  async function move(id: string, delta: number) {
    const idx = widgets.findIndex(w => w.id === id);
    if (idx < 0) return;
    const target = widgets[idx + delta];
    if (!target) return;

    const widgetA = widgets[idx];
    const widgetB = target;

    // Optimistically update UI
    const optimisticData = widgets.map(w => {
      if (w.id === widgetA.id) return { ...w, position: widgetB.position };
      if (w.id === widgetB.id) return { ...w, position: widgetA.position };
      return w;
    });

    mutate({ data: optimisticData }, false);
    setError(null);

    try {
      await reorderWidgets(widgetA, widgetB);
      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to reorder widgets');
      await mutate(); // Revert on error
    }
  }

  function handleDragStart(e: React.DragEvent, widgetId: string) {
    setDraggedWidget(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, widgetId: string) {
    e.preventDefault();
    if (draggedWidget && draggedWidget !== widgetId) {
      setDragOverWidget(widgetId);
    }
  }

  function handleDragLeave() {
    setDragOverWidget(null);
  }

  async function handleWidgetDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverWidget(null);

    if (!draggedWidget || draggedWidget === targetId) {
      setDraggedWidget(null);
      return;
    }

    const fromIdx = widgets.findIndex(w => w.id === draggedWidget);
    const toIdx = widgets.findIndex(w => w.id === targetId);

    if (fromIdx < 0 || toIdx < 0) {
      setDraggedWidget(null);
      return;
    }

    // Compute new order: remove dragged, insert at target index
    const newOrder = [...widgets];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, removed);

    // Each slot in the new order gets the position value from the original slot
    const optimisticData = newOrder.map((w, i) => ({ ...w, position: widgets[i].position }));

    mutate({ data: optimisticData }, false);
    setError(null);
    setDraggedWidget(null);

    const baseUrl = holdingId
      ? `/api/holdings/${encodeURIComponent(holdingId)}/widgets`
      : `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`;

    const tempPosition = 999999;
    const dragged = widgets[fromIdx];

    try {
      // Step 1: Park dragged widget at temp position to free its slot
      const r0 = await fetch(`${baseUrl}/${encodeURIComponent(dragged.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: tempPosition }),
      });
      if (!r0.ok) throw new Error('Failed to reorder widgets');

      if (fromIdx < toIdx) {
        // Drag DOWN: shift [fromIdx+1..toIdx] each one position toward fromIdx
        for (let i = fromIdx + 1; i <= toIdx; i++) {
          const r = await fetch(`${baseUrl}/${encodeURIComponent(widgets[i].id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: widgets[i - 1].position }),
          });
          if (!r.ok) throw new Error('Failed to reorder widgets');
        }
      } else {
        // Drag UP: shift [toIdx..fromIdx-1] each one position toward fromIdx
        for (let i = fromIdx - 1; i >= toIdx; i--) {
          const r = await fetch(`${baseUrl}/${encodeURIComponent(widgets[i].id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: widgets[i + 1].position }),
          });
          if (!r.ok) throw new Error('Failed to reorder widgets');
        }
      }

      // Step final: Place dragged at target position
      const rFinal = await fetch(`${baseUrl}/${encodeURIComponent(dragged.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: widgets[toIdx].position }),
      });
      if (!rFinal.ok) throw new Error('Failed to reorder widgets');

      await mutate();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to reorder widgets');
      await mutate(); // Revert on error
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className={clsx(
        'fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-200'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-widgets-title"
      onKeyDown={handleDialogKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-gradient-to-b from-white to-neutral-50 shadow-2xl ring-1 ring-black/10 animate-in slide-in-from-top-4 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral-200/80 bg-white/80 backdrop-blur-sm rounded-t-3xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-azure via-azure/90 to-azure/70 shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <div>
                <h3 id="edit-widgets-title" className="text-xl font-bold text-neutral-900 tracking-tight">
                  {holdingId ? 'Holding Widgets' : 'Dashboard Widgets'}
                </h3>
                <p className="mt-0.5 text-sm text-neutral-600">
                  Customize your visualizations and insights
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="group rounded-xl p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-all duration-200"
            aria-label="Close"
            disabled={busy}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Error Banner */}
          {error && (
            <div className="mb-4 rounded-2xl bg-red-50 border border-red-200 p-4 animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-red-900">Error</h4>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-azure/10 mb-3">
                  <svg className="w-6 h-6 text-azure animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-sm text-neutral-600">Loading widgets...</p>
              </div>
            </div>
          ) : fetchError ? (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-red-900">Error loading widgets</h4>
                  <p className="text-sm text-red-700 mt-1">{fetchError?.message || 'Failed to load'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Widgets List Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">
                    Your Widgets
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-azure/10 text-azure">
                      {widgets.length}
                    </span>
                  </h4>
                  <p className="text-xs text-neutral-500 mt-0.5">Drag to reorder, or use the arrows</p>
                </div>
                <button
                  type="button"
                  onClick={startCreate}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium shadow-lg shadow-azure/25 hover:shadow-xl hover:shadow-azure/30 hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Widget
                </button>
              </div>

              {/* Widgets List */}
              {widgets.length === 0 ? (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-neutral-100 mb-4">
                    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-900 mb-1">No widgets yet</h4>
                  <p className="text-sm text-neutral-500 mb-4">Get started by adding your first visualization</p>
                  <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-300 hover:bg-neutral-50 text-sm font-medium text-neutral-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Widget
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {widgets.map((w, i) => (
                    <li
                      key={w.id}
                      draggable={!busy}
                      onDragStart={(e) => handleDragStart(e, w.id)}
                      onDragOver={(e) => handleDragOver(e, w.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleWidgetDrop(e, w.id)}
                      className={clsx(
                        'group relative rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200',
                        draggedWidget === w.id && 'opacity-40 scale-95',
                        dragOverWidget === w.id && 'border-azure ring-2 ring-azure/20 scale-102',
                        !draggedWidget && 'hover:shadow-md hover:border-azure/30 cursor-move',
                        draggedWidget && draggedWidget !== w.id && 'cursor-grabbing',
                        !draggedWidget ? 'border-neutral-200' : 'border-neutral-300'
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Drag Handle & Widget Info */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-1.5 rounded-lg hover:bg-neutral-100 cursor-grab active:cursor-grabbing">
                            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-sm font-semibold text-neutral-900 truncate">
                                {w.title || '(Untitled Widget)'}
                              </h5>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-600 flex-shrink-0">
                                {w.type}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500">Position {w.position + 1}</p>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => move(w.id, -1)}
                            disabled={i === 0 || busy}
                            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            aria-label="Move up"
                          >
                            <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => move(w.id, +1)}
                            disabled={i === widgets.length - 1 || busy}
                            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                            aria-label="Move down"
                          >
                            <svg className="w-4 h-4 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(w)}
                            disabled={busy}
                            className="px-3 py-2 rounded-lg border border-neutral-200 hover:bg-azure/5 hover:border-azure/30 hover:text-azure text-sm font-medium text-neutral-700 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeWidget(w.id)}
                            disabled={busy}
                            className="p-2 rounded-lg border border-red-200 hover:bg-red-50 hover:border-red-300 text-red-600 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Delete widget"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Create/Edit Widget Modal */}
        <CreateWidgetModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditing(null);
          }}
          onCreated={async () => {
            await mutate();
            onChanged?.();
            setShowCreateModal(false);
            setEditing(null);
          }}
          portfolioId={portfolioId}
          holdingId={holdingId}
          editing={editing}
        />
      </div>
    </div>,
    document.body
  );
}
