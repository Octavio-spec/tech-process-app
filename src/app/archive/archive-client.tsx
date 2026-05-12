"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadOperationsFromStorage,
  loadPartsFromStorage,
  loadProjectsFromStorage,
  savePartsToStorage,
  saveProjectsToStorage,
  type ProcessPart,
  type ProcessProject,
} from "../process-model";
import { DataTable, PageHeader, StatusBadge } from "../ui";

type ArchiveTab = "projects" | "parts";
type ReasonFilter = "all" | "done" | "archive" | "deleted" | "project";

export function ArchiveClient() {
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [parts, setParts] = useState<ProcessPart[]>([]);
  const [operationCounts, setOperationCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<ArchiveTab>("projects");
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadedParts = loadPartsFromStorage();
    setProjects(loadProjectsFromStorage());
    setParts(loadedParts);
    setOperationCounts(Object.fromEntries(loadedParts.map((part) => [part.id, loadOperationsFromStorage(part.id).length])));
  }, []);

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const archivedProjects = useMemo(
    () => projects.filter((project) => isArchivedProject(project)).filter((project) => matchesArchiveFilters(`${project.code} ${project.name} ${project.customer ?? ""}`, projectArchiveReason(project), query, reasonFilter)),
    [projects, query, reasonFilter],
  );
  const archivedParts = useMemo(
    () => parts
      .filter((part) => isArchivedPart(part, projectMap.get(part.projectId)))
      .filter((part) => matchesArchiveFilters(`${part.code} ${part.name} ${part.drawingNumber ?? ""} ${projectMap.get(part.projectId)?.name ?? ""}`, partArchiveReason(part, projectMap.get(part.projectId)), query, reasonFilter)),
    [parts, projectMap, query, reasonFilter],
  );

  function restoreProject(projectId: string) {
    const nextProjects = projects.map((project) => project.id === projectId
      ? { ...project, isDeleted: false, deletedAt: null, status: "В работе" as const, updatedAt: new Date().toLocaleDateString("ru-RU") }
      : project);
    setProjects(nextProjects);
    saveProjectsToStorage(nextProjects);
    setMessage("Проект восстановлен");
  }

  function restorePart(partId: string) {
    const part = parts.find((item) => item.id === partId);
    const project = part ? projectMap.get(part.projectId) : undefined;
    if (!part || isArchivedProject(project)) {
      setMessage("Сначала восстановите проект");
      return;
    }

    const nextParts = parts.map((item) => item.id === partId
      ? { ...item, isDeleted: false, deletedAt: null, status: "В работе" as const, updatedAt: new Date().toLocaleDateString("ru-RU") }
      : item);
    setParts(nextParts);
    savePartsToStorage(nextParts);
    setMessage("Деталь восстановлена");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Архив"
        description="Выполненные, архивные и удалённые проекты и детали. Восстановление сохраняется в localStorage."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по коду / названию"
          className="min-w-64 rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value as ReasonFilter)} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
          <option value="all">Все причины</option>
          <option value="done">Выполнено</option>
          <option value="archive">Архив</option>
          <option value="deleted">Удалено</option>
          <option value="project">Проект в архиве</option>
        </select>
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
          <TabButton active={tab === "projects"} onClick={() => setTab("projects")}>Проекты</TabButton>
          <TabButton active={tab === "parts"} onClick={() => setTab("parts")}>Детали</TabButton>
        </div>
      </div>

      {message ? <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{message}</div> : null}

      {tab === "projects" ? (
        <DataTable
          title="Архив проектов"
          columns={["Код проекта", "Название", "Заказчик", "Статус", "Деталей", "Дата изменения", "Причина", "Действия"]}
          rows={archivedProjects.map((project) => [
            project.code,
            project.name,
            project.customer ?? "-",
            <StatusBadge key={`${project.id}-status`} status={project.status} />,
            parts.filter((part) => part.projectId === project.id).length,
            project.updatedAt,
            <ReasonBadge key={`${project.id}-reason`} reason={projectArchiveReason(project)} />,
            <div key={`${project.id}-actions`} className="flex gap-3">
              <Link href={`/projects/${project.id}`} className="font-semibold text-blue-700">Открыть</Link>
              <button type="button" onClick={() => restoreProject(project.id)} className="font-semibold text-emerald-700">Восстановить</button>
              <button type="button" disabled className="font-semibold text-slate-400">Удалить окончательно</button>
            </div>,
          ])}
        />
      ) : (
        <DataTable
          title="Архив деталей"
          columns={["Код детали", "Наименование", "Проект", "Номер чертежа", "Статус", "Операций", "Дата изменения", "Причина", "Действия"]}
          rows={archivedParts.map((part) => {
            const project = projectMap.get(part.projectId);
            const reason = partArchiveReason(part, project);
            const canRestore = !isArchivedProject(project);

            return [
              part.code,
              part.name,
              project?.name ?? "-",
              part.drawingNumber ?? "-",
              <StatusBadge key={`${part.id}-status`} status={part.status} />,
              operationCounts[part.id] ?? 0,
              part.updatedAt,
              <ReasonBadge key={`${part.id}-reason`} reason={reason} />,
              <div key={`${part.id}-actions`} className="flex gap-3">
                <Link href={`/parts/${part.id}`} className="font-semibold text-blue-700">Открыть</Link>
                <button type="button" onClick={() => restorePart(part.id)} disabled={!canRestore} title={!canRestore ? "Сначала восстановите проект" : undefined} className={canRestore ? "font-semibold text-emerald-700" : "font-semibold text-slate-400"}>Восстановить</button>
                <button type="button" disabled className="font-semibold text-slate-400">Удалить окончательно</button>
              </div>,
            ];
          })}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded px-3 py-1.5 text-sm font-semibold ${active ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>
      {children}
    </button>
  );
}

function ReasonBadge({ reason }: { reason: ArchiveReason }) {
  const styles: Record<ArchiveReason, string> = {
    done: "border-emerald-200 bg-emerald-50 text-emerald-700",
    archive: "border-slate-200 bg-slate-100 text-slate-600",
    deleted: "border-rose-200 bg-rose-50 text-rose-700",
    project: "border-amber-200 bg-amber-50 text-amber-700",
  };
  const labels: Record<ArchiveReason, string> = {
    done: "Выполнено",
    archive: "Архив",
    deleted: "Удалено",
    project: "Проект в архиве",
  };

  return <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${styles[reason]}`}>{labels[reason]}</span>;
}

type ArchiveReason = "done" | "archive" | "deleted" | "project";

function isArchivedProject(project?: ProcessProject) {
  return Boolean(project && (project.isDeleted || project.status === "Архив" || project.status === "Выполнен"));
}

function isArchivedPart(part: ProcessPart, project?: ProcessProject) {
  return part.isDeleted || part.status === "Архив" || part.status === "Выполнена" || isArchivedProject(project);
}

function projectArchiveReason(project: ProcessProject): ArchiveReason {
  if (project.isDeleted) return "deleted";
  if (project.status === "Выполнен") return "done";
  return "archive";
}

function partArchiveReason(part: ProcessPart, project?: ProcessProject): ArchiveReason {
  if (part.isDeleted) return "deleted";
  if (part.status === "Выполнена") return "done";
  if (part.status === "Архив") return "archive";
  return isArchivedProject(project) ? "project" : "archive";
}

function matchesArchiveFilters(text: string, reason: ArchiveReason, query: string, reasonFilter: ReasonFilter) {
  const matchesQuery = !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase());
  const matchesReason = reasonFilter === "all" || reasonFilter === reason;

  return matchesQuery && matchesReason;
}
