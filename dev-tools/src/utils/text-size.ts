export const SIZE_SCALE = [
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
  'text-9xl',
] as const;

const SIZE_REM: Record<(typeof SIZE_SCALE)[number], string> = {
  'text-xs': '0.75rem',
  'text-sm': '0.875rem',
  'text-base': '1rem',
  'text-lg': '1.125rem',
  'text-xl': '1.25rem',
  'text-2xl': '1.5rem',
  'text-3xl': '1.875rem',
  'text-4xl': '2.25rem',
  'text-5xl': '3rem',
  'text-6xl': '3.75rem',
  'text-7xl': '4.5rem',
  'text-8xl': '6rem',
  'text-9xl': '8rem',
};

const LINE_HEIGHT: Record<string, string> = {
  '0.75rem': '1rem',
  '0.875rem': '1.25rem',
  '1rem': '1.5rem',
  '1.125rem': '1.75rem',
  '1.25rem': '1.75rem',
  '1.5rem': '2rem',
  '1.875rem': '2.25rem',
  '2.25rem': '2.5rem',
  '3rem': '1',
  '3.75rem': '1',
  '4.5rem': '1',
  '6rem': '1',
  '8rem': '1',
};

export function remForSizeClass(size: (typeof SIZE_SCALE)[number]): string {
  return SIZE_REM[size];
}

export function lineHeightForFontSize(fontSize: string): string | undefined {
  return LINE_HEIGHT[fontSize];
}
