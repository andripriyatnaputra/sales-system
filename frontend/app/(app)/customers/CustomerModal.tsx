"use client";

import { useState } from "react";
import { apiPost, apiPut } from "@/lib/api";

type Customer = {
  id?: number;
  name: string;
  industry?: string;
  region?: string;
};

type CustomerModalProps = {
  initial?: Customer | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function CustomerModal({ initial, onClose, onSaved }: CustomerModalProps) {
  const [name, setName] = useState(initial?.name || "");
  const [industry, setIndustry] = useState(initial?.industry || "");
  const [region, setRegion] = useState(initial?.region || "");

  const handleSave = async () => {
    if (initial?.id) {
      await apiPut(`/customers/${initial.id}`, {
        name,
        industry,
        region,
      });
    } else {
      await apiPost(`/customers`, {
        name,
        industry,
        region,
      });
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
      <div className="bg-white w-96 rounded-xl p-6 space-y-4">

        <h2 className="text-lg font-semibold">
          {initial ? "Edit Customer" : "Add Customer"}
        </h2>

        <input
          className="border rounded px-3 py-2 w-full"
          placeholder="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="border rounded px-3 py-2 w-full"
          placeholder="Industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
        />

        <input
          className="border rounded px-3 py-2 w-full"
          placeholder="Region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 border rounded" onClick={onClose}>
            Cancel
          </button>

          <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
