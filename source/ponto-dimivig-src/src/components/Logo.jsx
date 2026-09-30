import React from 'react';

const Logo = ({ className = "h-10 w-auto", showText = true }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <img src="/ponto-dimivig/dimivig-mark.svg" alt="" aria-hidden="true" className="h-full w-auto object-contain" />
    {showText && <span className="flex flex-col leading-none">
      <strong className="text-xl font-extrabold tracking-[.18em] text-[#F2A12D]">DIMIVIG</strong>
      <small className="mt-1.5 text-[8px] font-bold tracking-[.22em] text-gray-400">PONTO DIGITAL</small>
    </span>}
  </div>
);

export default Logo;
