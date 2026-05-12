"use client";

import Link from "next/link";
import { Archive, Database } from "lucide-react";
import type { ReactNode } from "react";
import { DataTable, InfoCard, PageHeader, StatCard, StatusBadge } from "./ui";
import { getOperationsByRouteId, operationResources, operations, parts, projects } from "./mock-data";

export default function Home() {
  const activeProjects = projects.filter((project) => !project.isDeleted && project.status !== "Архив" && project.status !== "Выполнен").length;
  const activeParts = parts.filter((part) => !part.isDeleted && part.status !== "Архив" && part.status !== "Выполнена").length;
  const archiveCount = projects.filter((project) => project.isDeleted || project.status === "Архив" || project.status === "Выполнен").length
    + parts.filter((part) => part.isDeleted || part.status === "Архив" || part.status === "Выполнена").length;
  const manualItems = operationResources.filter((resource) =>
    [resource.machine, resource.machineCell, resource.holder, resource.tool].some((item) => item.source === "manual"),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Главная"
        description="Обзор технологических данных MVP: проекты, детали, техпроцессы, справочники и архив."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Активные проекты" value={activeProjects} hint="проекты в работе" />
        <StatCard label="Детали в работе" value={activeParts} hint="активный реестр деталей" />
        <StatCard label="Ручные заглушки" value={manualItems} hint="требуют справочника" />
        <StatCard label="Архив" value={archiveCount} hint="проекты и детали" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <HomeCard
          title="База данных"
          description="Станки, оснастка и инструмент"
          href="/database"
          icon={<Database className="h-5 w-5" aria-hidden="true" />}
        />
        <HomeCard
          title="Архив"
          description="Выполненные и архивные проекты и детали"
          href="/archive"
          icon={<Archive className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <DataTable
          title="Последние детали"
          columns={["Код", "Наименование", "Статус", "Операции", "Изменено"]}
          rows={parts.slice(0, 6).map((part) => [
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
            {["Проект", "Деталь", "Операция", "Установ", "Ячейка", "Оправка", "Инструмент"].map(
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

function HomeCard({ title, description, href, icon }: { title: string; description: string; href: string; icon: ReactNode }) {
  return (
    <Link href={href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-700">{icon}</div>
        <div>
          <h3 className="font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          <div className="mt-4 text-sm font-semibold text-blue-700">Открыть</div>
        </div>
      </div>
    </Link>
  );
}
