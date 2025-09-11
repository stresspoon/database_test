import React from 'react';

type DateTime = { date: string; start: string; end: string };

type Props = {
  value: DateTime;
  onChange: (v: DateTime) => void;
  min?: Date;
  step?: number; // minutes
};

export default function DateTimeRangePicker({ value, onChange, min = new Date(), step = 30 }: Props) {
  const onDate = (date: string) => onChange({ ...value, date });
  const onStart = (start: string) => onChange({ ...value, start });
  const onEnd = (end: string) => onChange({ ...value, end });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="date">
          날짜
        </label>
        <input
          id="date"
          type="date"
          value={value.date}
          min={new Date(min.getTime() - min.getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
          onChange={(e) => onDate(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="start">
          시작
        </label>
        <input
          id="start"
          type="time"
          step={step * 60}
          value={value.start}
          onChange={(e) => onStart(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="end">
          종료
        </label>
        <input
          id="end"
          type="time"
          step={step * 60}
          value={value.end}
          onChange={(e) => onEnd(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>
    </div>
  );
}


