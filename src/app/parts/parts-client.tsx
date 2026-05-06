"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { loadOperationsFromStorage, loadPartsFromStorage, loadProjectsFromStorage, savePartsToStorage, type ProcessPart, type ProcessProject } from "../process-model";
import type { OperationStatus } from "../mock-data";
import { DataTable, PageHeader, StatusBadge } from "../ui";

const statuses: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Архив"];

export function PartsClient() {
  const [parts, setParts] = useState<ProcessPart[]>([]);
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [operationCounts, setOperationCounts] = useState<Record<string, number>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    const loadedParts = loadPartsFromStorage();
    const loadedProjects = loadProjectsFromStorage();
    setParts(loadedParts);
    setProjects(loadedProjects);
    setOperationCounts(Object.fromEntries(loadedParts.map((part) => [part.id, loadOperationsFromStorage(part.id).length])));
  }, []);

  function addPart(part: ProcessPart) {
    const nextParts = [...parts, part];
    setParts(nextParts);
    setOperationCounts((current) => ({ ...current, [part.id]: 0 }));
    savePartsToStorage(nextParts);
    setIsFormOpen(false);
  }

  const activeProjects = projects.filter((project) => !project.isDeleted);
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Детали"
        description="Список деталей для технологической проработки: статус, количество операций и дата изменения."
      />

      <button
        type="button"
        onClick={() => setIsFormOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        + Добавить деталь
      </button>

      {isFormOpen ? <PartCreateForm projects={activeProjects} onCancel={() => setIsFormOpen(false)} onCreate={addPart} /> : null}

      <DataTable
        title="Реестр деталей"
        columns={["Код детали", "Проект", "Наименование", "Чертёж", "Статус", "Операций", "Описание"]}
        rows={parts.filter((part) => !part.isDeleted && part.status !== "Архив" && activeProjectIds.has(part.projectId)).map((part) => [
          <Link key={part.id} href={`/projects/${part.projectId}/parts/${part.id}`} className="font-semibold text-blue-700 hover:text-blue-800">
            {part.code}
          </Link>,
          activeProjects.find((project) => project.id === part.projectId)?.name ?? "Без проекта",
          part.name,
          part.drawingNumber ?? "",
          <StatusBadge key={`${part.id}-status`} status={part.status} />,
          String(operationCounts[part.id] ?? 0),
          part.description ?? "",
        ])}
      />
    </div>
  );
}

function PartCreateForm({ projects, onCancel, onCreate }: { projects: ProcessProject[]; onCancel: () => void; onCreate: (part: ProcessPart) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<OperationStatus>("Черновик");

  function submit() {
    const partId = `part-${Date.now()}`;
    onCreate({
      id: partId,
      projectId,
      code: code || "Новая деталь",
      name: name || "Без наименования",
      drawingNumber,
      description,
      status,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toLocaleDateString("ru-RU"),
      routeId: `local-route-${partId}`,
      updatedAt: new Date().toLocaleDateString("ru-RU"),
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Новая деталь</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Проект">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </Field>
        <Field label="Код детали"><input value={code} onChange={(event) => setCode(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" /></Field>
        <Field label="Наименование"><input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" /></Field>
        <Field label="Номер чертежа"><input value={drawingNumber} onChange={(event) => setDrawingNumber(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" /></Field>
        <Field label="Статус">
          <select value={status} onChange={(event) => setStatus(event.target.value as OperationStatus)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Описание" wide>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={submit} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Сохранить деталь</button>
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Отмена</button>
      </div>
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <div className="mb-1 text-sm font-semibold text-slate-700">{label}</div>
      {children}
    </label>
  );
}
