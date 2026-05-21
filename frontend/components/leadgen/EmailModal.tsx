"use client";

import { useState } from "react";

export interface OutreachEmail {
  subjek: string;
  kepada: string;
  isi: string;
}

export function EmailButton({
  email,
  instansi,
}: {
  email: OutreachEmail;
  instansi: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
      >
        Lihat Email
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Draft Email — {instansi}</p>
                <p className="font-semibold text-gray-900 text-sm leading-snug">{email.subjek}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-b text-xs text-gray-600 flex gap-6">
              <span>
                <span className="font-medium">Kepada:</span> {email.kepada}
              </span>
            </div>

            <div className="px-6 py-5 overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                {email.isi}
              </pre>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    `Kepada: ${email.kepada}\nSubjek: ${email.subjek}\n\n${email.isi}`
                  )
                }
                className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Salin
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
