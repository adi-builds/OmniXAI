const Logo = ({ className = 'w-32 sm:w-44', onClick }) => {
  return (
    <svg className={className} onClick={onClick} style={{cursor:'pointer'}} viewBox="0 0 220 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="iconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>

      {/* Hexagon */}
      <polygon points="25,4 38,11 38,27 25,34 12,27 12,11" fill="url(#iconGrad)" />

      {/* X inside hexagon */}
      <line x1="17" y1="13" x2="33" y2="28" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="33" y1="13" x2="17" y2="28" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="25" cy="19" r="2.5" fill="white" />

      {/* Omnix text */}
      <text x="46" y="28" fontFamily="system-ui, sans-serif" fontSize="22" fontWeight="700" letterSpacing="-0.5" fill="url(#textGrad)">Omnix</text>

      {/* AI text */}
      <text x="136" y="28" fontFamily="system-ui, sans-serif" fontSize="22" fontWeight="300" letterSpacing="1" fill="#9CA3AF">AI</text>
    </svg>
  )
}

export default Logo
