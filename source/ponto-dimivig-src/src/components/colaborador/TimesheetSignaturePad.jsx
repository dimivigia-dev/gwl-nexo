import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TimesheetSignaturePad({ defaultName = '', periodLabel, onSave, saving = false }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [name, setName] = useState(defaultName);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#172033';
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }, []);

  const point = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const start = (event) => {
    event.preventDefault();
    drawing.current = true;
    canvasRef.current.setPointerCapture?.(event.pointerId);
    const context = canvasRef.current.getContext('2d');
    const value = point(event);
    context.beginPath();
    context.moveTo(value.x, value.y);
  };
  const move = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const value = point(event);
    const context = canvasRef.current.getContext('2d');
    context.lineTo(value.x, value.y);
    context.stroke();
    setHasInk(true);
  };
  const stop = () => { drawing.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#172033';
    setHasInk(false);
  };

  return <div className="rounded-2xl border border-gray-700 bg-[#1c1c1c] p-5">
    <div className="flex items-start gap-3"><span className="rounded-lg bg-orange-500/10 p-2 text-[#ff9f2e]"><PenLine className="h-5 w-5" /></span><div><h3 className="font-semibold text-white">Assinar folha de ponto</h3><p className="mt-1 text-xs text-gray-400">Período {periodLabel}. A assinatura fica vinculada ao seu usuário e à folha fechada.</p></div></div>
    <label className="mt-4 block text-xs font-medium text-gray-400">Nome completo<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-700 bg-[#151515] px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff8c00]" /></label>
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-600 bg-white"><canvas ref={canvasRef} width="900" height="230" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} className="h-44 w-full touch-none cursor-crosshair" /><div className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-center text-[11px] text-gray-500">Assine com o dedo, mouse ou caneta</div></div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={clear} className="border-gray-600 text-gray-300"><Eraser className="mr-2 h-4 w-4" />Limpar</Button><Button type="button" disabled={saving || !hasInk || !name.trim()} onClick={() => onSave(canvasRef.current.toDataURL('image/png'), name.trim())} className="bg-[#ff8c00] font-semibold text-black hover:bg-[#ff9f2e]"><Check className="mr-2 h-4 w-4" />{saving ? 'Assinando...' : 'Confirmar assinatura'}</Button></div>
  </div>;
}
