"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import CustomerModal from "./CustomerModal";

type Customer = {
  id: number;
  name: string;
  industry?: string;
  region?: string;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [openModal, setOpenModal] = useState(false);
  const [editData, setEditData] = useState<Customer | null>(null);

  /* ------------------- LOAD DATA ------------------- */
  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await apiGet<Customer[]>("/customers");
      setCustomers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Reset page ketika search berubah
  useEffect(() => {
    setPage(1);
  }, [search]);

  /* ------------------- FILTER + SEARCH ------------------- */

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry || "").toLowerCase().includes(q) ||
        (c.region || "").toLowerCase().includes(q)
      );
    });
  }, [customers, search]);

  /* ------------------- PAGINATION ------------------- */

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  /* ------------------- ACTIONS ------------------- */

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus customer ini?")) return;
    await apiDelete(`/customers/${id}`);
    loadCustomers();
  };

  /* ------------------- RENDER ------------------- */

  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Customers</h1>

        <button
          className="px-3 py-2 bg-blue-600 text-white rounded"
          onClick={() => {
            setEditData(null);
            setOpenModal(true);
          }}
        >
          + Add Customer
        </button>
      </div>

      {/* SEARCH */}
      <input
        type="text"
        placeholder="Search name / industry / region..."
        className="border px-3 py-2 rounded w-full text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* TABLE */}
      <div className="bg-white border rounded-xl shadow-sm overflow-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Industry</th>
                <th className="px-3 py-2 text-left">Region</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    No customers found.
                  </td>
                </tr>
              ) : (
                paged.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2">{c.industry || "-"}</td>
                    <td className="px-3 py-2">{c.region || "-"}</td>
                    <td className="px-3 py-2 text-right space-x-3">
                      <button
                        onClick={() => {
                          setEditData(c);
                          setOpenModal(true);
                        }}
                        className="text-blue-600 text-xs"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-600 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center text-sm">
        <div>
          Page {page} of {totalPages}
        </div>

        <div className="space-x-2">
          <button
            className="px-2 py-1 border rounded"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </button>

          <button
            className="px-2 py-1 border rounded"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {/* MODAL */}
      {openModal && (
        <CustomerModal
          initial={editData}
          onClose={() => setOpenModal(false)}
          onSaved={loadCustomers}
        />
      )}
    </div>
  );
}
