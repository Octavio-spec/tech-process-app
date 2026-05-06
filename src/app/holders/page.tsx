import { holders } from "../mock-data";
import { DataTable, PageHeader } from "../ui";

export default function HoldersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Оснастка"
        description="Справочник оправок и технологической оснастки с поддержкой ручных заглушек."
        actionHref="/holders"
        actionLabel="Добавить оснастку"
      />
      <DataTable
        title="Справочник оснастки"
        columns={["Код", "Наименование", "Тип", "Статус"]}
        rows={holders.map((holder) => [holder.code, holder.name, holder.type, holder.status])}
      />
    </div>
  );
}
