"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadPartsFromStorage,
  loadProjectsFromStorage,
  savePartsToStorage,
  saveProjectsToStorage,
  type OperationStatus,
  type ProcessPart,
  type ProcessProject,
} from "../../process-model";
import { DataTable, PageHeader, StatCard, StatusBadge } from "../../ui";

type DetailFilter = "active" | "archive" | "deleted";
const statuses: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Архив"];

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProcessProject>();
  const [parts, setParts] = useState<ProcessPart[]>([]);
  const [filter, setFilter] = useState<DetailFilter>("active");
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    setProject(loadProjectsFromStorage().find((item) => item.id === projectId));
    setParts(loadPartsFromStorage());
  }, [projectId]);

  const projectParts = useMemo(() => parts.filter((part) => part.projectId === projectId), [parts, projectId]);
  const visibleParts = projectParts.filter((part) => {
    if (filter === "deleted") return part.isDeleted;
    if (filter === "archive") return !part.isDeleted && part.status === "Архив";
    return !part.isDeleted && part.status !== "Архив";
  });

  function persistParts(nextParts: ProcessPart[]) {
    setParts(nextParts);
    savePartsToStorage(nextParts);
  }

  function addPart(part: ProcessPart) {
    persistParts([...parts, part]);
    setIsFormOpen(false);
  }

  function archivePart(partId: string) {
    persistParts(parts.map((part) => part.id === partId ? { ...part, status: "Архив", updatedAt: nowDate() } : part));
  }

  function deletePart(partId: string) {
    if (!window.confirm("Удалить деталь? Она будет скрыта из активного списка, но данные можно будет восстановить.")) return;
    persistParts(parts.map((part) => part.id === partId ? { ...part, isDeleted: true, deletedAt: nowDate(), updatedAt: nowDate() } : part));
  }

  function restorePart(partId: string) {
    persistParts(parts.map((part) => part.id === partId ? { ...part, isDeleted: false, deletedAt: null, updatedAt: nowDate() } : part));
  }

  function restoreProject() {
    if (!project) return;
    const date = nowDate();
    const nextProject = { ...project, isDeleted: false, deletedAt: null, updatedAt: date };
    const projects = loadProjectsFromStorage().map((item) => item.id === projectId ? nextProject : item);
    setProject(nextProject);
    saveProjectsToStorage(projects);
  }

  if (!project) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Проект не найден.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`${project.code} · ${project.name}`} description={project.description ?? "Карточка проекта"} />

      {project.isDeleted ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-semibold">Проект удалён. Его можно восстановить.</div>
          <button type="button" onClick={restoreProject} className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white">Восстановить проект</button>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Код проекта" value={project.code} hint="идентификатор проекта" />
        <StatCard label="Заказчик" value={project.customer ?? "-"} hint="контрагент" />
        <StatCard label="Статус" value={project.status} hint="состояние проекта" />
        <StatCard label="Деталей" value={projectParts.filter((part) => !part.isDeleted).length} hint="без удалённых" />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setIsFormOpen(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">+ Добавить деталь</button>
        {[
          ["active", "Активные детали"],
          ["archive", "Архив"],
          ["deleted", "Удалённые"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value as DetailFilter)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${filter === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>
        ))}
      </div>

      {isFormOpen ? <PartCreateForm projectId={project.id} onCreate={addPart} onCancel={() => setIsFormOpen(false)} /> : null}

      <DataTable
        title="Детали проекта"
        columns={["Код", "Наименование", "Чертёж", "Статус", "Дата изменения", "Действия"]}
        rows={visibleParts.map((part) => [
          <Link key={`${part.id}-code`} href={`/projects/${project.id}/parts/${part.id}`} className="font-semibold text-blue-700 hover:text-blue-800">{part.code}</Link>,
          part.name,
          part.drawingNumber ?? "",
          <StatusBadge key={`${part.id}-status`} status={part.status} />,
          part.updatedAt,
          <div key={`${part.id}-actions`} className="flex flex-wrap gap-2">
            <Link href={`/projects/${project.id}/parts/${part.id}`} className="text-sm font-semibold text-blue-700">Открыть</Link>
            <Link href={`/projects/${project.id}/parts/${part.id}/process`} className="text-sm font-semibold text-blue-700">Редактировать</Link>
            {filter !== "deleted" ? <button type="button" onClick={() => archivePart(part.id)} className="text-sm font-semibold text-slate-600">Архивировать</button> : null}
            {filter !== "deleted" ? <button type="button" onClick={() => deletePart(part.id)} className="text-sm font-semibold text-rose-700">Удалить</button> : null}
            {filter === "deleted" ? <button type="button" onClick={() => restorePart(part.id)} className="text-sm font-semibold text-emerald-700">Восстановить</button> : null}
          </div>,
        ])}
      />
    </div>
  );
}

function PartCreateForm({ projectId, onCreate, onCancel }: { projectId: string; onCreate: (part: ProcessPart) => void; onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<OperationStatus>("Черновик");

  function submit() {
    const id = `part-${Date.now()}`;
    const date = nowDate();
    onCreate({
      id,
      projectId,
      code: code || "Новая деталь",
      name: name || "Без наименования",
      drawingNumber,
      description,
      status,
      isDeleted: false,
      deletedAt: null,
      createdAt: date,
      routeId: `local-route-${id}`,
      updatedAt: date,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Новая деталь проекта</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Код детали"><Input value={code} onChange={setCode} /></Field>
        <Field label="Наименование"><Input value={name} onChange={setName} /></Field>
        <Field label="Номер чертежа"><Input value={drawingNumber} onChange={setDrawingNumber} /></Field>
        <Field label="Статус">
          <select value={status} onChange={(event) => setStatus(event.target.value as OperationStatus)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Описание" wide><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" /></Field>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={submit} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Сохранить деталь</button>
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Отмена</button>
      </div>
    </section>
  );
}

function nowDate() {
  return new Date().toLocaleDateString("ru-RU");
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "md:col-span-2" : ""}><div className="mb-1 text-sm font-semibold text-slate-700">{label}</div>{children}</label>;
}

function Input({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />;
}
