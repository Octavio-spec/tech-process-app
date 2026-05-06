import { notFound } from "next/navigation";
import { getMagazineCellsByMachineId, machineCells, machines } from "../../../mock-data";
import { PageHeader, StatCard } from "../../../ui";
import { MagazineBoard } from "./magazine-board";

type MachineMagazinePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MachineMagazinePage({ params }: MachineMagazinePageProps) {
  const { id } = await params;
  const machine = machines.find((item) => item.id === id);

  if (!machine) {
    notFound();
  }

  const cells = getMagazineCellsByMachineId(machine.id);
  const cellCount = machineCells.filter((cell) => cell.machineId === machine.id).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Магазин станка · ${machine.name}`}
        description="Mock-представление ячеек магазина, назначенных операций, оснастки и инструмента."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Станок" value={machine.code} hint={machine.name} />
        <StatCard label="Тип станка" value={machine.type} hint="класс оборудования" />
        <StatCard label="Ячеек" value={cellCount} hint="по mock-магазину" />
        <StatCard label="Статус" value={machine.status} hint="состояние оборудования" />
      </section>

      <MagazineBoard machine={machine} cells={cells} />
    </div>
  );
}
