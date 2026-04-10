"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onFilesProcessed: (results: ProcessedNF[], errors: string[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export interface ProcessedNF {
  nfNumber: string;
  clientName: string;
  address: string;
  cep: string;
  city: string;
  state: string;
  value: number;
}

export default function FileUpload({
  onFilesProcessed,
  isLoading,
  setIsLoading,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setIsLoading(true);

      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append("files", file);
      });

      try {
        const res = await fetch("/api/parse-nf", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text();
          onFilesProcessed([], [`Erro do servidor (${res.status}): ${text.slice(0, 200)}`]);
          return;
        }

        const data = await res.json();

        if (data.error) {
          onFilesProcessed([], [data.error]);
        } else {
          const info = data.totalOrders
            ? [`Encontrados ${data.totalOrders} pedidos em ${data.totalStops} paradas únicas`]
            : [];
          onFilesProcessed(data.results || [], [...info, ...(data.errors || [])]);
        }
      } catch (err) {
        onFilesProcessed([], [`Erro ao processar: ${(err as Error).message}`]);
      } finally {
        setIsLoading(false);
      }
    },
    [onFilesProcessed, setIsLoading]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
        dragActive
          ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
          : "border-gray-300 dark:border-[#2a3f5f] hover:border-violet-400 dark:hover:border-violet-500 hover:bg-gray-50 dark:hover:bg-[#1a2d4a]/50"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = ".pdf,.xml";
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files) processFiles(files);
        };
        input.click();
      }}
    >
      {isLoading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-violet-500 border-t-transparent" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">Processando NFs...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl">📄</div>
          <p className="text-gray-700 dark:text-gray-200 font-medium">
            Arraste PDFs ou XMLs de Notas Fiscais aqui
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">ou clique para selecionar arquivos</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            Formatos aceitos: PDF, XML (NFe)
          </p>
        </div>
      )}
    </div>
  );
}
