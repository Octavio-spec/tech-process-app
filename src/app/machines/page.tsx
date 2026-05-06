import Link from "next/link";
import { machineCells, machines } from "../mock-data";
import { DataTable, InfoCard, PageHeader } from "../ui";

export default function MachinesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Станки"
        description="Справочник оборудования и базовая визуализация магазина станка по ячейкам."
        actionHref="/machines"
        actionLabel="Добавить станок"
      />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DataTable
          title="Справочник станков"
          columns={["Код", "Наименование", "Ячеек", "Статус"]}
          rows={machines.map((machine) => [
            <Link key={machine.id} href={`/machines/${machine.id}/magazine`} className="font-semibold text-blue-700 hover:text-blue-800">
              {machine.code}
            </Link>,
            machine.name,
            String(machineCells.filter((cell) => cell.machineId === machine.id).length),
            machine.status,
          ])}
        />
        <InfoCard title="Магазин VMC-850">
          <div className="grid grid-cols-4 gap-2">
            {machineCells
              .filter((cell) => cell.machineId === "machine-vmc-850")
              .map((cell) => (
                <div key={cell.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-xs font-semibold text-blue-700">{cell.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{cell.status}</div>
                </div>
              ))}
          </div>
        </InfoCard>
      </div>
    </div>
  );
}
