import React from 'react';

type Props = {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  name?: string;
};

export default function TextField({ label, type = 'text', value, onChange, error, name }: Props) {
  const id = name ?? label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-500' : 'border-gray-300'}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <span id={`${id}-error`} className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}


