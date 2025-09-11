import React from 'react';
import type { Slot } from '@/lib/types';

type Props = {
  slots: Slot[];
  onSelect: (slot: Slot) => void;
};

function ReasonBadge({ reason }: { reason: NonNullable<Slot['reason']> }) {
  const labelMap: Record<string, string> = {
    outside_hours: '영업시간 외',
    blackout: '블랙아웃',
    conflict: '겹침',
    buffer_blocked: '완충 차단',
  };
  return <span className="ml-2 text-xs rounded bg-gray-200 px-2 py-0.5">{labelMap[reason]}</span>;
}

export default function SlotGrid({ slots, onSelect }: Props) {
  if (!slots.length) return <div className="text-gray-500">표시할 슬롯이 없습니다.</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {slots.map((s, idx) => {
        const disabled = !s.available;
        return (
          <button
            key={`${s.start}-${idx}`}
            disabled={disabled}
            onClick={() => !disabled && onSelect(s)}
            className={`border rounded px-2 py-2 text-left hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed`}
            aria-disabled={disabled}
          >
            <div className="text-sm font-medium">
              {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' - '}
              {new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {s.reason && <ReasonBadge reason={s.reason} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}


