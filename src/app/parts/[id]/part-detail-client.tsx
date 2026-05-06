"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  countRequiredResources,
  hasManualResources,
  loadOperationsFromStorage,
  loadPartsFromStorage,
  loadProjectsFromStorage,
  machineName,
  type ProcessOperation,
  type ProcessPart,
  type ProcessProject,
} from "../../process-model";
import { InfoCard, PageHeader, StatCard, StatusBadge } from "../../ui";

export function PartDetailClient({ partId, projectId, initialPart }: { partId: string; projectId?: string; initialPart?: ProcessPart }) {
  const [part, setPart] = useState<ProcessPart | undefined>(initialPart);
  const [project, setProject] = useState<ProcessProject | undefined>();
  const [operations, setOperations] = useState<ProcessOperation[]>([]);

  useEffect(() => {
    const nextPart = loadPartsFromStorage().find((item) => item.id === partId) ?? initialPart;
    setPart(nextPart);
    setProject(loadProjectsFromStorage().find((item) => item.id === (projectId ?? nextPart?.projectId)));
    setOperations(loadOperationsFromStorage(partId));
  }, [initialPart, partId, projectId]);

  if (!part) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Деталь не найдена.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${part.code} · ${part.name}`}
        description={part.description || "Карточка детали с маршрутом обработки."}
        actionHref={`/projects/${part.projectId}/parts/${part.id}/process`}
        actionLabel="Редактировать техпроцесс"
      />

      <nav className="flex flex-wrap gap-2 text-sm text-slate-600">
        <Link href="/projects" className="font-semibold text-blue-700">Проекты</Link>
        <span>→</span>
        <Link href={`/projects/${part.projectId}`} className="font-semibold text-blue-700">{project?.name ?? "Проект"}</Link>
        <span>→</span>
        <span>{part.name}</span>
        <span>→</span>
        <span>Техпроцесс</span>
      </nav>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Код детали" value={part.code} hint="идентификатор изделия" />
        <StatCard label="Чертёж" value={part.drawingNumber || "-"} hint="номер чертежа" />
        <StatCard label="Статус" value={part.status} hint="состояние проработки" />
        <StatCard label="Операции" value={operations.length} hint="в текущем техпроцессе" />
      </section>

      <InfoCard title="Расширенный маршрут">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {operations.map((operation) => {
            const operationMachine = operation.machineSource === "catalog"
              ? machineName(operation.machineId)
              : operation.machineSource === "manual"
                ? operation.machineManualText
                : undefined;
            const toolCount = operation.setups.reduce((count, setup) => count + setup.toolPositions.length, 0);
            const requiredCount = countRequiredResources(operation);
            const hasManual = hasManualResources(operation);

            return (
              <Link key={operation.id} href={`/projects/${part.projectId}/parts/${part.id}/process`} className="min-w-64 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-700">Операция {operation.operationNo}</div>
                <div className="mt-1 font-semibold text-slate-950">{operation.name}</div>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <div>Установов: {operation.setups.length}</div>
                  <div>Станок: {operationMachine || "Требуется подобрать"}</div>
                  <div>Инструментальных позиций: {toolCount}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge status={operation.status} />
                  {hasManual ? <Tag tone="amber">Есть заглушки</Tag> : null}
                  {requiredCount ? <Tag tone="slate">Требует подбора</Tag> : null}
                </div>
              </Link>
            );
          })}
          {!operations.length ? <div className="text-sm text-slate-600">Операций пока нет. Откройте редактор техпроцесса.</div> : null}
        </div>
      </InfoCard>
    </div>
  );
}

function Tag({ tone, children }: { tone: "amber" | "slate"; children: ReactNode }) {
  const className = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}
