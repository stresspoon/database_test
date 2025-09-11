"use client";
import React, { useState } from 'react';
import TextField from '@/components/TextField';

export default function ReservePage() {
  const [holdToken, setHoldToken] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | { id: number; room?: { name?: string }; period?: { start: string; end: string } }>(null);

  async function submit() {
    setError(null);
    setResult(null);
    if (password !== password2) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdToken, name, phone, password }),
      });
      if (res.status === 410) {
        setError('홀드가 만료되었습니다.');
        return;
      }
      if (res.status === 409) {
        setError('겹침이 발생했습니다. 다시 시도해주세요.');
        return;
      }
      if (!res.ok) throw new Error('reserve_failed');
      const json = await res.json();
      setResult(json);
    } catch {
      setError('예약 실패.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">예약 확정</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="홀드 토큰" value={holdToken} onChange={setHoldToken} />
        <TextField label="이름" value={name} onChange={setName} />
        <TextField label="휴대폰" value={phone} onChange={setPhone} />
        <TextField label="비밀번호" type="password" value={password} onChange={setPassword} />
        <TextField label="비밀번호 확인" type="password" value={password2} onChange={setPassword2} />
      </div>
      <button
        onClick={submit}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? '처리 중…' : '확정'}
      </button>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {result && (
        <div className="border rounded p-4 bg-green-50">
          <div className="font-semibold">예약이 완료되었습니다.</div>
          <div className="text-sm">ID: {result.id}</div>
          <div className="text-sm">방: {result.room?.name}</div>
          <div className="text-sm">
            시간: {result.period
              ? `${new Date(result.period.start).toLocaleString()} ~ ${new Date(result.period.end).toLocaleString()}`
              : '시간 정보 없음'}
          </div>
        </div>
      )}
    </main>
  );
}


