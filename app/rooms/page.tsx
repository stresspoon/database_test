"use client";
import React, { useMemo, useState } from 'react';
import DateTimeRangePicker from '@/components/DateTimeRangePicker';
import TextField from '@/components/TextField';
import Link from 'next/link';

type Room = { id: number; name: string; location: string; capacity: number };

export default function RoomsPage() {
  const now = new Date();
  const defaultDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  const [dt, setDt] = useState({ date: defaultDate, start: '09:00', end: '10:00' });
  const [people, setPeople] = useState('2');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);

  const query = useMemo(() => {
    const usp = new URLSearchParams({
      date: dt.date,
      start: dt.start,
      end: dt.end,
      people,
    });
    if (location) usp.set('location', location);
    return usp.toString();
  }, [dt, people, location]);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms?${query}`);
      if (!res.ok) throw new Error(`request_failed_${res.status}`);
      const json = await res.json();
      setRooms(json.rooms ?? []);
    } catch (e) {
      setError('조회 실패. 다시 시도하세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">회의실 검색</h1>
      <div className="space-y-4">
        <DateTimeRangePicker value={dt} onChange={setDt} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField label="인원" type="number" value={people} onChange={setPeople} />
          <TextField label="위치" value={location} onChange={setLocation} />
        </div>
        <button
          onClick={search}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '조회 중…' : '조회'}
        </button>
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((r) => (
          <Link
            key={r.id}
            href={`/rooms/${r.id}?${new URLSearchParams({ date: dt.date }).toString()}`}
            className="border rounded p-4 hover:bg-gray-50"
          >
            <div className="text-lg font-semibold">{r.name}</div>
            <div className="text-sm text-gray-600">{r.location} · 정원 {r.capacity}명</div>
          </Link>
        ))}
      </div>
    </main>
  );
}


