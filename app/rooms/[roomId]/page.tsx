"use client";
import React, { useEffect, useMemo, useState } from 'react';
import SlotGrid from '@/components/SlotGrid';
import TextField from '@/components/TextField';

export default function RoomDetailPage({ params, searchParams }: { params: { roomId: string }; searchParams: { date?: string } }) {
  const roomId = Number(params.roomId);
  const [length, setLength] = useState('60');
  const [unit, setUnit] = useState('30');
  const [buffer, setBuffer] = useState('0');
  const [slots, setSlots] = useState<Array<{ start: string; end: string; available: boolean; reason?: 'outside_hours' | 'blackout' | 'conflict' | 'buffer_blocked' }>>([]);
  const [loading, setLoading] = useState(false);
  const [hold, setHold] = useState<{ token: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const usp = new URLSearchParams({
      date: searchParams?.date ?? new Date().toISOString().slice(0, 10),
      length,
      unit,
      buffer,
    });
    return usp.toString();
  }, [searchParams?.date, length, unit, buffer]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${roomId}?${query}`);
        if (!res.ok) throw new Error(`request_failed_${res.status}`);
        const json = await res.json();
        setSlots(json.slots ?? []);
      } catch {
        setError('슬롯 조회 실패.');
      } finally {
        setLoading(false);
      }
    })();
  }, [roomId, query]);

  async function createHold(slot: { start: string; end: string }) {
    setError(null);
    try {
      const res = await fetch('/api/holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, start: slot.start, end: slot.end }),
      });
      if (res.status === 409) {
        setError('경합으로 실패했습니다. 다시 선택해 주세요.');
        return;
      }
      if (!res.ok) throw new Error('hold_failed');
      const json = await res.json();
      setHold(json);
    } catch {
      setError('홀드 생성 실패.');
    }
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">회의실 슬롯 선택</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TextField label="길이(분)" type="number" value={length} onChange={setLength} />
        <TextField label="단위(분)" type="number" value={unit} onChange={setUnit} />
        <TextField label="완충(분)" type="number" value={buffer} onChange={setBuffer} />
      </div>
      <div>
        {loading ? (
          <div>불러오는 중…</div>
        ) : (
          <SlotGrid slots={slots} onSelect={createHold} />
        )}
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
      </div>
      {hold && (
        <div className="border rounded p-4 bg-green-50">
          <div className="font-semibold">홀드가 생성되었습니다.</div>
          <div className="text-sm">만료: {new Date(hold.expiresAt).toLocaleString()}</div>
        </div>
      )}
    </main>
  );
}


