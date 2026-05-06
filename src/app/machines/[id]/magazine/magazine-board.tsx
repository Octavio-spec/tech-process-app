"use client";

import { useEffect, useState } from "react";
import type { Machine, MachineMagazineCell } from "../../../mock-data";
import { ResourceValue } from "../../../ui";
import { holderName, normalizeOperations, toolName, type ProcessOperation } from "../../../process-model";

type MagazineBoardProps = {
  machine: Machine;
  cells: MachineMagazineCell[];
};

const statusStyles: Record<MachineMagazineCell["status"], string> = {
  "занята": "border-blue-200 bg-blue-50 text-blue-800",
  "резерв": "border-slate-200 bg-slate-50 text-slate-600",
  "пустая": "border-slate-200 bg-white text-slate-500",
  "требует уточнения": "border-amber-200 bg-amber-50 text-amber-800",
};

export function MagazineBoard({ machine, cells }: MagazineBoardProps) {
  const [displayCells, setDisplayCells] = useState(cells);
  const [selectedCellId, setSelectedCellId] = useState(cells[0]?.id);
  const selectedCell = displayCells.find((cell) => cell.id === selectedCellId) ?? displayCells[0];

  useEffect(() => {
    const storedOperations = Object.keys(window.localStorage)
      .filter((key) => key.startsWith("tech-process:operations:"))
      .flatMap((key) => {
        try {
          return normalizeOperations(JSON.parse(window.localStorage.getItem(key) ?? "[]") as ProcessOperation[]);
        } catch {
          return [];
        }
      });

    setDisplayCells(
      cells.map((cell) => {
        for (const operation of storedOperations) {
          if (operation.machineSource !== "catalog" || operation.machineId !== machine.id) continue;
          for (const setup of operation.setups) {
            const position = setup.toolPositions.find((item) => item.cellId === cell.id);
            if (!position) continue;

            const hasRequired = [position.cellSource, position.holderSource, position.toolSource].includes("required");
            const holder = position.holderSource === "manual"
              ? { source: "manual" as const, value: position.holderManualText || "Ручная заглушка" }
              : position.holderSource === "required"
                ? { source: "required" as const, value: "Требуется подобрать" }
                : { source: "catalog" as const, value: holderName(position.holderId) ?? "Оправка не найдена" };
            const tool = position.toolSource === "manual"
              ? { source: "manual" as const, value: position.toolManualText || "Ручная заглушка" }
              : position.toolSource === "required"
                ? { source: "required" as const, value: "Требуется подобрать" }
                : { source: "catalog" as const, value: toolName(position.toolId) ?? "Инструмент не найден" };

            return {
              ...cell,
              status: hasRequired ? "требует уточнения" as const : "занята" as const,
              operation,
              setupNo: setup.setupNo,
              holder,
              tool,
              comment: position.comment || setup.comment || operation.comment,
            };
          }
        }
        return cell;
      }),
    );
  }, [cells, machine.id]);

  return (
    <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayCells.map((cell) => (
            <button
              key={cell.id}
              type="button"
              onClick={() => setSelectedCellId(cell.id)}
              className={`min-h-56 rounded-lg border p-4 text-left transition hover:border-blue-300 hover:shadow-sm ${
                selectedCell?.id === cell.id ? "ring-2 ring-blue-500 ring-offset-2" : ""
              } ${statusStyles[cell.status]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Ячейка</div>
                  <div className="mt-1 text-xl font-semibold text-slate-950">{cell.number}</div>
                </div>
                <span className="rounded-md border border-current/20 bg-white/70 px-2 py-1 text-xs font-semibold">
                  {cell.status}
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Операция</div>
                  <div className="mt-1 font-medium text-slate-900">
                    {cell.operation ? `${cell.operation.operationNo} · ${cell.operation.name}` : "Не назначена"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Оправка</div>
                  <div className="mt-1"><ResourceValue resource={cell.holder} /></div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Инструмент</div>
                  <div className="mt-1"><ResourceValue resource={cell.tool} /></div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">Свойства ячейки</h3>
        {selectedCell ? (
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">Станок</dt>
              <dd className="mt-1 font-semibold text-slate-950">{machine.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Ячейка</dt>
              <dd className="mt-1 font-semibold text-slate-950">{selectedCell.label}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Операция</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {selectedCell.operation ? `${selectedCell.operation.operationNo} · ${selectedCell.operation.name}` : "Не назначена"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Установ</dt>
              <dd className="mt-1 font-semibold text-slate-950">{selectedCell.setupNo ?? "Не назначен"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Оправка</dt>
              <dd className="mt-1"><ResourceValue resource={selectedCell.holder} /></dd>
            </div>
            <div>
              <dt className="text-slate-500">Инструмент</dt>
              <dd className="mt-1"><ResourceValue resource={selectedCell.tool} /></dd>
            </div>
            <div>
              <dt className="text-slate-500">Комментарий</dt>
              <dd className="mt-1 leading-6 text-slate-700">{selectedCell.comment}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-slate-600">У станка нет ячеек магазина.</p>
        )}
      </aside>
    </section>
  );
}
