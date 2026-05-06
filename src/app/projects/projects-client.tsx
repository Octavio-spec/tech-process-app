"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadPartsFromStorage,
  loadProjectsFromStorage,
  saveProjectsToStorage,
  type ProcessProject,
} from "../process-model";
import { ProjectForm } from "../project-part-forms";
import { DataTable, PageHeader, StatusBadge } from "../ui";

type ProjectFilter = "active" | "archive" | "deleted";

export function ProjectsClient() {
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [partCounts, setPartCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string>();
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadedProjects = loadProjectsFromStorage();
    const loadedParts = loadPartsFromStorage();
    setProjects(loadedProjects);
    setPartCounts(Object.fromEntries(loadedProjects.map((project) => [project.id, loadedParts.filter((part) => part.projectId === project.id && !part.isDeleted).length])));
  }, []);

  function addProject(project: ProcessProject) {
    const nextProjects = [...projects, project];
    setProjects(nextProjects);
    saveProjectsToStorage(nextProjects);
    setIsFormOpen(false);
    setMessage("Проект сохранён");
  }

  function editProject(project: ProcessProject) {
    const nextProjects = projects.map((item) => item.id === project.id ? project : item);
    setProjects(nextProjects);
    saveProjectsToStorage(nextProjects);
    setEditingProjectId(undefined);
    setMessage("Проект сохранён");
  }

  function persistProjects(nextProjects: ProcessProject[]) {
    setProjects(nextProjects);
    saveProjectsToStorage(nextProjects);
  }

  function deleteProject(projectId: string) {
    if (!window.confirm("Удалить проект? Он будет скрыт из активного списка. Детали проекта также будут скрыты.")) return;
    const date = new Date().toLocaleDateString("ru-RU");
    persistProjects(projects.map((project) => project.id === projectId ? { ...project, isDeleted: true, deletedAt: date, updatedAt: date } : project));
  }

  function restoreProject(projectId: string) {
    const date = new Date().toLocaleDateString("ru-RU");
    persistProjects(projects.map((project) => project.id === projectId ? { ...project, isDeleted: false, deletedAt: null, updatedAt: date } : project));
  }

  const visibleProjects = projects.filter((project) => {
    if (filter === "deleted") return project.isDeleted;
    if (filter === "archive") return !project.isDeleted && project.status === "Архив";
    return !project.isDeleted && project.status !== "Архив";
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Проекты" description="Список проектов, внутри которых создаются детали и техпроцессы." />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setIsFormOpen(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          + Добавить проект
        </button>
        {[
          ["active", "Активные"],
          ["archive", "Архив"],
          ["deleted", "Удалённые"],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value as ProjectFilter)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${filter === value ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>
        ))}
      </div>
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {isFormOpen ? <ProjectForm mode="create" projects={projects} onSubmit={addProject} onCancel={() => setIsFormOpen(false)} /> : null}
      {editingProjectId ? (
        <ProjectForm
          mode="edit"
          project={projects.find((project) => project.id === editingProjectId)}
          projects={projects}
          onSubmit={editProject}
          onCancel={() => setEditingProjectId(undefined)}
        />
      ) : null}
      <DataTable
        title="Реестр проектов"
        columns={["Код проекта", "Название", "Заказчик", "Статус", "Деталей", "Дата изменения", "Действия"]}
        rows={visibleProjects.map((project) => [
          <Link key={project.id} href={`/projects/${project.id}`} className="font-semibold text-blue-700 hover:text-blue-800">{project.code}</Link>,
          project.name,
          project.customer ?? "",
          <StatusBadge key={`${project.id}-status`} status={project.status} />,
          String(partCounts[project.id] ?? 0),
          project.updatedAt,
          <div key={`${project.id}-actions`} className="flex flex-wrap gap-2">
            <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-blue-700">Открыть</Link>
            <button type="button" onClick={() => setEditingProjectId(project.id)} className="text-sm font-semibold text-blue-700">Редактировать</button>
            {filter !== "deleted" ? <button type="button" onClick={() => deleteProject(project.id)} className="text-sm font-semibold text-rose-700">Удалить проект</button> : null}
            {filter === "deleted" ? <button type="button" onClick={() => restoreProject(project.id)} className="text-sm font-semibold text-emerald-700">Восстановить</button> : null}
          </div>,
        ])}
      />
    </div>
  );
}
