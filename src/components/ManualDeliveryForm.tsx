"use client";

import { useState } from "react";

interface ManualDeliveryFormProps {
  onAdd: (data: {
    nfNumber: string;
    clientName: string;
    cep: string;
    address: string;
  }) => void;
}

export default function ManualDeliveryForm({ onAdd }: ManualDeliveryFormProps) {
  const [open, setOpen] = useState(false);
  const [nfNumber, setNfNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cep.trim()) return;

    onAdd({
      nfNumber: nfNumber.trim() || "Manual",
      clientName: clientName.trim() || "Cliente",
      cep: cep.trim(),
      address: address.trim(),
    });

    setNfNumber("");
    setClientName("");
    setCep("");
    setAddress("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 font-medium"
      >
        + Adicionar entrega manualmente
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-50 dark:bg-[#0d1829] rounded-lg p-4 space-y-3 border border-gray-200 dark:border-[#1e3050] transition-colors duration-300"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Nº NF
          </label>
          <input
            type="text"
            value={nfNumber}
            onChange={(e) => setNfNumber(e.target.value)}
            placeholder="123456"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2a3f5f] bg-white dark:bg-[#111c32] text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Cliente
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2a3f5f] bg-white dark:bg-[#111c32] text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            CEP *
          </label>
          <input
            type="text"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            placeholder="74000-000"
            required
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2a3f5f] bg-white dark:bg-[#111c32] text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Endereço
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número, bairro"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-[#2a3f5f] bg-white dark:bg-[#111c32] text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 bg-gray-200 dark:bg-[#1a2d4a] text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-[#243a5c] transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
