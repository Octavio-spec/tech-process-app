import Link from "next/link";
import { PageHeader, StatCard, DataTable, InfoCard, StatusBadge } from "./ui";
import { getOperationsByRouteId, operationResources, operations, parts, projects } from "./mock-data";

export default function Home() {
  const activeParts = parts.filter((part) => part.status !== "Архив").length;
  const manualItems = operationResources.filter((resource) =>
    [resource.machine, resource.machineCell, resource.holder, resource.tool].some((item) => item.source === "manual"),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Главная"
        description="Обзор технологических данных MVP: детали, операции, ресурсы и ручные заглушки."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Детали в работе" value={activeParts} hint="mock-реестр деталей" />
        <StatCard label="Проекты" value={projects.length} hint="mock-реестр проектов" />
        <StatCard label="Операции" value={operations.length} hint="по текущим деталям" />
        <StatCard label="Ручные заглушки" value={manualItems} hint="требуют справочника" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <DataTable
          title="Последние детали"
          columns={["Код", "Наименование", "Статус", "Операции", "Изменено"]}
          rows={parts.map((part) => [
            <Link key={part.id} href={`/parts/${part.id}`} className="font-semibold text-blue-700 hover:text-blue-800">
              {part.code}
            </Link>,
            part.name,
            <StatusBadge key={`${part.id}-status`} status={part.status} />,
            String(getOperationsByRouteId(part.routeId).length),
            part.updatedAt,
          ])}
        />
        <InfoCard title="Главная цепочка">
          <div className="space-y-2 text-sm text-slate-700">
            {["Деталь", "Маршрут", "Операция", "Станок", "Ячейка станка", "Оснастка", "Инструмент"].map(
              (item, index) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ),
            )}
          </div>
        </InfoCard>
      </section>
    </div>
  );
}
