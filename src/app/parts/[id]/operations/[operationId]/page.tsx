import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOperationResource,
  getOperationsByRouteId,
  getRouteByPartId,
  operations,
  parts,
  resolveResourceValue,
} from "../../../../mock-data";
import { sortOperationsByNumber } from "../../../../process-model";
import { InfoCard, PageHeader, ResourceValue, StatusBadge } from "../../../../ui";

type OperationDetailPageProps = {
  params: Promise<{
    id: string;
    operationId: string;
  }>;
};

export default async function OperationDetailPage({ params }: OperationDetailPageProps) {
  const { id, operationId } = await params;
  const part = parts.find((item) => item.id === id);
  const route = part ? getRouteByPartId(part.id) : undefined;
  const operation = operations.find((item) => item.id === operationId);
  const routeOperations = route ? sortOperationsByNumber(getOperationsByRouteId(route.id)) : [];
  const isOperationInPart = routeOperations.some((item) => item.id === operation?.id);

  if (!part || !route || !operation || !isOperationInPart) {
    notFound();
  }

  const resource = getOperationResource(operation.id);
  const machineMagazineHref =
    resource?.machine.source === "catalog" && resource.machine.catalogId
      ? `/machines/${resource.machine.catalogId}/magazine`
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Операция ${operation.number} · ${operation.title}`}
        description={`${part.code} · ${part.name} · ${route.name}`}
      />

      <Link href={`/parts/${part.id}`} className="inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800">
        ← Вернуться в карточку детали
      </Link>

      {machineMagazineHref ? (
        <Link href={machineMagazineHref} className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          Открыть магазин станка
        </Link>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.35fr_0.65fr]">
        <InfoCard title="Параметры операции">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">Номер операции</dt>
              <dd className="mt-1 font-semibold text-slate-950">{operation.number}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Название</dt>
              <dd className="mt-1 font-semibold text-slate-950">{operation.title}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Статус</dt>
              <dd className="mt-1"><StatusBadge status={operation.status} /></dd>
            </div>
          </dl>
        </InfoCard>

        <InfoCard title="Описание и комментарий">
          <div className="space-y-4 text-sm leading-6 text-slate-700">
            <div>
              <div className="font-semibold text-slate-950">Описание</div>
              <p className="mt-1">{operation.description}</p>
            </div>
            <div>
              <div className="font-semibold text-slate-950">Комментарий технолога</div>
              <p className="mt-1">{operation.technologistComment}</p>
            </div>
          </div>
        </InfoCard>
      </section>

      <InfoCard title="Ресурсы операции">
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <dt className="text-slate-500">Станок</dt>
            <dd className="mt-2"><ResourceValue resource={resolveResourceValue(resource?.machine, "machine")} /></dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <dt className="text-slate-500">Ячейка станка</dt>
            <dd className="mt-2"><ResourceValue resource={resolveResourceValue(resource?.machineCell, "machineCell")} /></dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <dt className="text-slate-500">Оснастка</dt>
            <dd className="mt-2"><ResourceValue resource={resolveResourceValue(resource?.holder, "holder")} /></dd>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <dt className="text-slate-500">Инструмент</dt>
            <dd className="mt-2"><ResourceValue resource={resolveResourceValue(resource?.tool, "tool")} /></dd>
          </div>
        </dl>
      </InfoCard>
    </div>
  );
}
