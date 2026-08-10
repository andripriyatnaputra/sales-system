"use client";

import { ReactNode } from "react";
import { AuthGuard } from "@/components/AuthGuard";

// Placeholder identitas perusahaan -- GANTI begitu template resmi dari user
// tersedia. Sengaja dipusatkan di satu tempat supaya tinggal 1 titik edit.
export const COMPANY_INFO = {
  name: "[NAMA PERUSAHAAN]",
  address: "[Alamat perusahaan — lengkapi sesuai kop surat resmi]",
  contact: "[Telepon / Email perusahaan]",
};

export function PrintDocumentLayout({
  documentTitle,
  documentNumber,
  children,
}: {
  documentTitle: string;
  documentNumber: string;
  children: ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-100 print:bg-white">
        <div className="max-w-[210mm] mx-auto py-6 px-4 print:p-0">
          <div className="flex justify-end gap-2 mb-4 print:hidden">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
            >
              Print / Save as PDF
            </button>
          </div>

          <div className="bg-white shadow-sm print:shadow-none p-10 print:p-0 text-sm text-gray-900">
            {/* KOP SURAT */}
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6">
              <div>
                <div className="font-bold text-lg">{COMPANY_INFO.name}</div>
                <div className="text-xs text-gray-600 max-w-xs">{COMPANY_INFO.address}</div>
                <div className="text-xs text-gray-600">{COMPANY_INFO.contact}</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-base uppercase">{documentTitle}</div>
                <div className="text-xs text-gray-600">No: {documentNumber}</div>
              </div>
            </div>

            {children}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </AuthGuard>
  );
}

export function SignatureBlock({ role, name }: { role: string; name?: string }) {
  return (
    <div className="text-center w-48">
      <div className="text-xs mb-16">{role}</div>
      <div className="border-t border-gray-800 pt-1 text-xs">{name || "(...........................)"}</div>
    </div>
  );
}
