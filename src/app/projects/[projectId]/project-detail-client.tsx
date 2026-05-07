"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadPartsFromStorage,
  loadProjectsFromStorage,
  savePartsToStorage,
  saveProjectsToStorage,
  type ProcessPart,
  type ProcessProject,
} from "../../process-model";
import { PartForm, ProjectForm } from "../../project-part-forms";
import { DataTable, PageHeader, StatCard, StatusBadge } from "../../ui";

type DetailFilter = "active" | "archive" | "deleted";

export function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProcessProject>();
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [parts, setParts] = useState<ProcessPart[]>([]);
  const [filter, setFilter] = useState<DetailFilter>("active");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [editingPartId, setEditingPartId] = useState<string>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadedProjects = loadProjectsFromStorage();
    setProjects(loadedProjects);
    setProject(loadedProjects.find((item) => item.id === projectId));
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
    setMessage("Деталь сохранена");
  }

  function editPart(part: ProcessPart) {
    const nextParts = parts.map((item) => item.id === part.id ? part : item);
    persistParts(nextParts);
    setEditingPartId(undefined);
    setMessage("Деталь сохранена");
  }

  function editProject(project: ProcessProject) {
    const nextProjects = projects.map((item) => item.id === project.id ? project : item);
    setProjects(nextProjects);
    setProject(project);
    saveProjectsToStorage(nextProjects);
    setIsProjectFormOpen(false);
    setMessage("Проект сохранён");
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
        <button type="button" onClick={() => setIsProjectFormOpen(true)} className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700">Редактировать проект</button>
        <button type="button" onClick={() => setIsFormOpen(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">+ Добавить деталь</button>
        {[
          ["active", "Активные детали"],
          ["archive", "Архив"],
          ["deleted", "Удалённые"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value as DetailFilter)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${filter === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>
        ))}
      </div>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {isProjectFormOpen ? <ProjectForm mode="edit" project={project} projects={projects} onSubmit={editProject} onCancel={() => setIsProjectFormOpen(false)} /> : null}
      {isFormOpen ? <PartForm mode="create" parts={parts} projects={projects.filter((project) => !project.isDeleted)} defaultProjectId={project.id} onSubmit={addPart} onCancel={() => setIsFormOpen(false)} /> : null}
      {editingPartId ? (
        <PartForm
          mode="edit"
          part={parts.find((part) => part.id === editingPartId)}
          parts={parts}
          projects={projects.filter((project) => !project.isDeleted)}
          defaultProjectId={project.id}
          onSubmit={editPart}
          onCancel={() => setEditingPartId(undefined)}
        />
      ) : null}

      <DataTable
        title="Детали проекта"
        columns={["Код", "Наименование", "Чертёж", "Статус", "Дата изменения", "Действия"]}
        rows={visibleParts.map((part) => [
          <Link key={`${part.id}-code`} href={`/parts/${part.id}`} className="font-semibold text-blue-700 hover:text-blue-800">{part.code}</Link>,
          part.name,
          part.drawingNumber ?? "",
          <StatusBadge key={`${part.id}-status`} status={part.status} />,
          part.updatedAt,
          <div key={`${part.id}-actions`} className="flex flex-wrap gap-2">
            <Link href={`/parts/${part.id}`} className="text-sm font-semibold text-blue-700">Открыть</Link>
            <button type="button" onClick={() => setEditingPartId(part.id)} className="text-sm font-semibold text-blue-700">Редактировать</button>
            <Link href={`/parts/${part.id}/process`} className="text-sm font-semibold text-blue-700">Техпроцесс</Link>
            {filter !== "deleted" ? <button type="button" onClick={() => archivePart(part.id)} className="text-sm font-semibold text-slate-600">Архивировать</button> : null}
            {filter !== "deleted" ? <button type="button" onClick={() => deletePart(part.id)} className="text-sm font-semibold text-rose-700">Удалить</button> : null}
            {filter === "deleted" ? <button type="button" onClick={() => restorePart(part.id)} className="text-sm font-semibold text-emerald-700">Восстановить</button> : null}
          </div>,
        ])}
      />
    </div>
  );
}

function nowDate() {
  return new Date().toLocaleDateString("ru-RU");
}
