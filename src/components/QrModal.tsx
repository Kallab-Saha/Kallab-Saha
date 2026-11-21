import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import type { EquipmentRecord } from '../shared/types';

interface QrModalProps {
  equipment: EquipmentRecord | null;
  onClose: () => void;
}

export function QrModal({ equipment, onClose }: QrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!equipment) return;
    const payload = JSON.stringify({
      system: 'UEM-LET',
      asset_tag: equipment.asset_tag,
      name: equipment.name,
      serial_no: equipment.serial_no,
      lab: equipment.lab_name || '',
    });
    QRCode.toDataURL(payload, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [equipment]);

  if (!equipment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 id="qr-modal-title" className="text-base font-semibold text-slate-900">
              Asset Tag &amp; QR Label
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ISO/IEC 18004 Machine-Readable Identifier
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close QR dialog for ${equipment.asset_tag}`}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center">
          <div className="p-4 border border-slate-200 rounded-lg bg-white">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${equipment.asset_tag}`}
                className="w-48 h-48 block"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-500">
                Generating QR code...
              </div>
            )}
          </div>

          <p className="mt-4 font-mono text-base font-semibold text-slate-900 tracking-tight">
            {equipment.asset_tag}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">{equipment.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {equipment.lab_name} {equipment.room_no ? `· Room ${equipment.room_no}` : ''} · S/N{' '}
            <span className="font-mono">{equipment.serial_no}</span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Print Label
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-900 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
