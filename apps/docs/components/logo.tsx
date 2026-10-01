export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={className}>
      <circle cx="128" cy="128" r="120" fill="#F5A524" />
      <g fill="none" stroke="#1A1203" strokeWidth="21" strokeLinecap="round">
        <path d="M151 82 A30 30 0 0 0 99.8 111.3" />
        <path d="M105 174 A30 30 0 0 0 156.2 144.7" />
      </g>
      <circle cx="128" cy="128" r="13.5" fill="#FFFFFF" />
    </svg>
  );
}
