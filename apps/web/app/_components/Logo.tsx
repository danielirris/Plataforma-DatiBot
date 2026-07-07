// Logo de Datibot: baldosa con degradado verde y un "spark" (chispa de IA)
// en negativo. Geométrico, escala bien en cualquier tamaño.
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient
          id="datibot-logo"
          x1="4"
          y1="4"
          x2="36"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#10b981" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#datibot-logo)" />
      {/* chispa grande */}
      <path
        d="M20 8 C20 16, 24 20, 32 20 C24 20, 20 24, 20 32 C20 24, 16 20, 8 20 C16 20, 20 16, 20 8 Z"
        fill="#04140d"
      />
      {/* chispa pequeña */}
      <path
        d="M28.5 8 C28.5 10.6, 29.4 11.5, 32 11.5 C29.4 11.5, 28.5 12.4, 28.5 15 C28.5 12.4, 27.6 11.5, 25 11.5 C27.6 11.5, 28.5 10.6, 28.5 8 Z"
        fill="#04140d"
        opacity="0.75"
      />
    </svg>
  );
}
