'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import * as d3 from 'd3';

interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description?: string;
  type?: 'milestone' | 'achievement' | 'funding' | 'metric' | 'other';
  value?: number;
  unit?: string;
  holdingId?: string;
  holdingName?: string;
}

interface Props {
  portfolioId: string;
  title?: string | null;
  config?: {
    holdingId?: string; // Optional: filter to specific holding
    eventTypes?: string[]; // Filter by event types
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
    showValues?: boolean; // Show metric values on timeline
    orientation?: 'horizontal' | 'vertical';
    groupByHolding?: boolean; // Group events by holding
  };
}

export default function ImpactTimeline({ portfolioId, title, config }: Props) {
  const [data, setData] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const holdingId = config?.holdingId;
  const startDate = config?.startDate;
  const endDate = config?.endDate;
  const orientation = config?.orientation || 'horizontal';

  // Stabilize eventTypes to prevent infinite loop
  const eventTypesString = useMemo(() => {
    const types = config?.eventTypes || [];
    return types.join(',');
  }, [config?.eventTypes]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (holdingId) params.set('holdingId', holdingId);
        if (eventTypesString) params.set('eventTypes', eventTypesString);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);

        const res = await fetch(
          `/api/portfolio/${encodeURIComponent(portfolioId)}/timeline?${params.toString()}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch timeline data: ${res.status}`);
        }

        const json = await res.json();

        if (mounted) {
          setData(json.data || []);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to load timeline');
          setData([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [portfolioId, holdingId, eventTypesString, startDate, endDate]);

  if (loading) {
    return (
      <div className="w-full p-8 text-center text-neutral-500">
        <div className="inline-block w-6 h-6 border-2 border-neutral-300 border-t-azure rounded-full animate-spin mb-2"></div>
        <p className="text-sm">Loading timeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
        <p className="font-medium text-sm">Error loading timeline</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full p-6 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600">
        <p className="text-sm">No timeline events to display.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {title && (
        <h3 className="text-lg font-semibold text-neutral-900 shrink-0 mb-4">{title}</h3>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {orientation === 'horizontal' ? (
          <HorizontalTimeline
            events={data}
            showValues={config?.showValues ?? true}
            onEventClick={setSelectedEvent}
          />
        ) : (
          <VerticalTimeline
            events={data}
            showValues={config?.showValues ?? true}
            onEventClick={setSelectedEvent}
            groupByHolding={config?.groupByHolding ?? false}
          />
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="text-lg font-semibold text-neutral-900">{selectedEvent.title}</h4>
                <p className="text-sm text-neutral-500">
                  {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            {selectedEvent.holdingName && (
              <p className="text-sm text-neutral-600 mb-2">
                <span className="font-medium">Holding:</span> {selectedEvent.holdingName}
              </p>
            )}

            {selectedEvent.type && (
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium mb-3 ${getEventTypeStyle(selectedEvent.type)}`}>
                {selectedEvent.type}
              </span>
            )}

            {selectedEvent.description && (
              <p className="text-sm text-neutral-700 mb-3">{selectedEvent.description}</p>
            )}

            {selectedEvent.value !== undefined && (
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-xs text-neutral-500 mb-1">Value</p>
                <p className="text-xl font-bold text-neutral-900">
                  {selectedEvent.value.toLocaleString()}
                  {selectedEvent.unit && ` ${selectedEvent.unit}`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getEventTypeStyle(type: string): string {
  switch (type) {
    case 'milestone':
      return 'bg-blue-100 text-blue-700';
    case 'achievement':
      return 'bg-green-100 text-green-700';
    case 'funding':
      return 'bg-purple-100 text-purple-700';
    case 'metric':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-neutral-100 text-neutral-700';
  }
}

function getEventTypeColor(type?: string): string {
  switch (type) {
    case 'milestone':
      return '#3b82f6';
    case 'achievement':
      return '#059669';
    case 'funding':
      return '#9333ea';
    case 'metric':
      return '#d97706';
    default:
      return '#6b7280';
  }
}

interface TimelineProps {
  events: TimelineEvent[];
  showValues: boolean;
  onEventClick: (event: TimelineEvent) => void;
  groupByHolding?: boolean;
}

function HorizontalTimeline({ events, showValues, onEventClick }: TimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || events.length === 0 || containerWidth === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const margin = { top: 60, right: 40, bottom: 40, left: 40 };
    const width = Math.max(containerWidth - margin.left - margin.right, 600);
    const height = 200;

    svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates and sort events
    const sortedEvents = events
      .map(e => ({ ...e, parsedDate: new Date(e.date) }))
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

    // Time scale
    const xScale = d3
      .scaleTime()
      .domain([
        d3.min(sortedEvents, d => d.parsedDate) || new Date(),
        d3.max(sortedEvents, d => d.parsedDate) || new Date()
      ])
      .range([0, width]);

    // Draw timeline axis
    const xAxis = d3.axisBottom(xScale).ticks(6);
    g.append('g')
      .attr('transform', `translate(0,${height / 2})`)
      .call(xAxis as any)
      .selectAll('text')
      .attr('font-size', '11px');

    // Draw timeline line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', height / 2)
      .attr('y2', height / 2)
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 2);

    // Draw events
    sortedEvents.forEach((event, i) => {
      const x = xScale(event.parsedDate);
      const y = height / 2;
      const isEven = i % 2 === 0;
      const yOffset = isEven ? -60 : 60;

      // Connector line
      g.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', y)
        .attr('y2', y + yOffset * 0.6)
        .attr('stroke', getEventTypeColor(event.type))
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '3,3');

      // Event circle
      const circle = g
        .append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 8)
        .attr('fill', getEventTypeColor(event.type))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('click', () => onEventClick(event));

      // Event label
      const label = g
        .append('text')
        .attr('x', x)
        .attr('y', y + yOffset)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 600)
        .attr('fill', '#374151')
        .style('cursor', 'pointer')
        .text(event.title.length > 20 ? event.title.substring(0, 20) + '...' : event.title)
        .on('click', () => onEventClick(event));

      // Value label
      if (showValues && event.value !== undefined) {
        g.append('text')
          .attr('x', x)
          .attr('y', y + yOffset + (isEven ? 15 : -10))
          .attr('text-anchor', 'middle')
          .attr('font-size', '11px')
          .attr('fill', '#6b7280')
          .text(`${event.value.toLocaleString()}${event.unit ? ' ' + event.unit : ''}`);
      }
    });

  }, [events, showValues, onEventClick, containerWidth]);

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg ref={svgRef} role="img" aria-label="Impact timeline chart" />
    </div>
  );
}

function VerticalTimeline({ events, showValues, onEventClick, groupByHolding }: TimelineProps) {
  // Sort events by date (descending - newest first)
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [events]);

  // Group by holding if requested
  const groupedEvents = useMemo(() => {
    if (!groupByHolding) return { 'All Events': sortedEvents };

    const groups: Record<string, TimelineEvent[]> = {};
    for (const event of sortedEvents) {
      const key = event.holdingName || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }
    return groups;
  }, [sortedEvents, groupByHolding]);

  return (
    <div className="w-full space-y-6">
      {Object.entries(groupedEvents).map(([groupName, groupEvents]) => (
        <div key={groupName}>
          {groupByHolding && (
            <h4 className="text-md font-semibold text-neutral-800 mb-3">{groupName}</h4>
          )}
          <div className="relative border-l-2 border-neutral-200 pl-8 space-y-6">
            {groupEvents.map((event, idx) => (
              <div
                key={event.id}
                className="relative cursor-pointer group"
                onClick={() => onEventClick(event)}
              >
                {/* Timeline dot */}
                <div
                  className="absolute -left-[37px] w-4 h-4 rounded-full border-2 border-white shadow-sm group-hover:scale-125 transition-transform"
                  style={{ backgroundColor: getEventTypeColor(event.type) }}
                />

                {/* Event card */}
                <div className="bg-white rounded-lg border border-neutral-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h5 className="font-semibold text-neutral-900">{event.title}</h5>
                      <p className="text-xs text-neutral-500 mt-1">
                        {new Date(event.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    {event.type && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getEventTypeStyle(event.type)}`}>
                        {event.type}
                      </span>
                    )}
                  </div>

                  {event.description && (
                    <p className="text-sm text-neutral-600 mb-2">{event.description}</p>
                  )}

                  {showValues && event.value !== undefined && (
                    <div className="text-sm font-semibold text-neutral-900">
                      {event.value.toLocaleString()}
                      {event.unit && ` ${event.unit}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
