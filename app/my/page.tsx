"use client";
import React, { useState } from 'react';
import TextField from '@/components/TextField';

export default function MyPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [reservations, setReservations] = useState<Array<{ id: number; room?: { name?: string }; period?: { start: string; end: string }; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function list() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/my', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', phone, password }),
      });
      if (res.status === 401) {
        setError('인증 실패');
        return;
      }
      if (!res.ok) throw new Error('list_failed');
      const json = await res.json();
      setReservations(json.reservations ?? []);
    } catch {
      setError('조회 실패');
    } finally {
      setLoading(false);
    }
  }

  async function cancel(reservationId: number) {
    setError(null);
    const res = await fetch('/api/my', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', phone, password, reservationId }),
    });
    if (res.status === 401) {
      setError('인증 실패');
      return;
    }
    if (res.status === 422) {
      setError('정책 위반: 시작 이후 취소 불가');
      return;
    }
    if (!res.ok) {
      setError('취소 실패');
      return;
    }
    await list();
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">내 예약</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TextField label="휴대폰" value={phone} onChange={setPhone} />
        <TextField label="비밀번호" type="password" value={password} onChange={setPassword} />
        <button
          onClick={list}
          className="self-end px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '조회 중…' : '조회'}
        </button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <div className="space-y-3">
        {reservations.map((r) => (
          <div key={r.id} className="border rounded p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.room?.name}</div>
              <div className="text-sm text-gray-600">
                {r.period
                  ? `${new Date(r.period.start).toLocaleString()} ~ ${new Date(r.period.end).toLocaleString()}`
                  : '시간 정보 없음'}
              </div>
              <div className="text-xs">상태: {r.status}</div>
            </div>
            {r.status !== 'cancelled' && (
              <button onClick={() => cancel(r.id)} className="px-3 py-1 rounded bg-red-600 text-white">
                취소
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}


