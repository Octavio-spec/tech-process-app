import {
  getOperationResource,
  getOperationsByRouteId,
  getRouteByPartId,
  parts,
  resolveResourceValue,
} from "../mock-data";
import { DataTable, InfoCard, PageHeader, ResourceValue } from "../ui";

export default function ReportsPage() {
  const part = parts[0];
  const route = getRouteByPartId(part.id);
  const operations = route ? getOperationsByRouteId(route.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отчёты"
        description="Пока доступен mock-отчёт по списку инструмента и оснастки для детали."
        actionHref="/reports"
        actionLabel="Экспорт отчёта"
      />
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <DataTable
          title={`Список инструмента по детали ${part.code}`}
          columns={["Операция", "Станок", "Оснастка", "Инструмент", "Источник"]}
          rows={operations.map((operation) => {
            const resource = getOperationResource(operation.id);
            const tool = resolveResourceValue(resource?.tool, "tool");

            return [
              `${operation.number} ${operation.title}`,
              <ResourceValue key={`${operation.id}-machine`} resource={resolveResourceValue(resource?.machine, "machine")} />,
              <ResourceValue key={`${operation.id}-holder`} resource={resolveResourceValue(resource?.holder, "holder")} />,
              <ResourceValue key={`${operation.id}-tool`} resource={tool} />,
              tool.source,
            ];
          })}
        />
        <InfoCard title="Назначение Excel">
          <p className="text-sm leading-6 text-slate-600">
            Excel остаётся вспомогательным форматом для экспорта отчётов и будущего импорта старых данных.
            Основная работа технолога ведётся в приложении.
          </p>
        </InfoCard>
      </div>
    </div>
  );
}
