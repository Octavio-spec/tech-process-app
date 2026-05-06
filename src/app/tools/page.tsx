import { tools } from "../mock-data";
import { DataTable, PageHeader } from "../ui";

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Инструменты"
        description="Справочник режущего инструмента и временные позиции, которые нужно перевести в каталог."
        actionHref="/tools"
        actionLabel="Добавить инструмент"
      />
      <DataTable
        title="Справочник инструментов"
        columns={["Код", "Наименование", "Тип", "Статус"]}
        rows={tools.map((tool) => [tool.code, tool.name, tool.type, tool.status])}
      />
    </div>
  );
}
