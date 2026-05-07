"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadOperationsFromStorage, loadPartsFromStorage, loadProjectsFromStorage, savePartsToStorage, type ProcessPart, type ProcessProject } from "../process-model";
import { PartForm } from "../project-part-forms";
import { DataTable, PageHeader, StatusBadge } from "../ui";

export function PartsClient() {
  const [parts, setParts] = useState<ProcessPart[]>([]);
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [operationCounts, setOperationCounts] = useState<Record<string, number>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPartId, setEditingPartId] = useState<string>();
  const [message, setMessage] = useState("");

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
    setMessage("Деталь сохранена");
  }

  function editPart(part: ProcessPart) {
    const nextParts = parts.map((item) => item.id === part.id ? part : item);
    setParts(nextParts);
    savePartsToStorage(nextParts);
    setEditingPartId(undefined);
    setMessage("Деталь сохранена");
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

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{message}</div> : null}
      {isFormOpen ? <PartForm mode="create" parts={parts} projects={activeProjects} onCancel={() => setIsFormOpen(false)} onSubmit={addPart} /> : null}
      {editingPartId ? (
        <PartForm
          mode="edit"
          part={parts.find((part) => part.id === editingPartId)}
          parts={parts}
          projects={activeProjects}
          onCancel={() => setEditingPartId(undefined)}
          onSubmit={editPart}
        />
      ) : null}

      <DataTable
        title="Реестр деталей"
        columns={["Код детали", "Проект", "Наименование", "Чертёж", "Статус", "Операций", "Описание", "Действия"]}
        rows={parts.filter((part) => !part.isDeleted && part.status !== "Архив" && activeProjectIds.has(part.projectId)).map((part) => [
          <Link key={part.id} href={`/parts/${part.id}`} className="font-semibold text-blue-700 hover:text-blue-800">
            {part.code}
          </Link>,
          activeProjects.find((project) => project.id === part.projectId)?.name ?? "Без проекта",
          part.name,
          part.drawingNumber ?? "",
          <StatusBadge key={`${part.id}-status`} status={part.status} />,
          String(operationCounts[part.id] ?? 0),
          part.description ?? "",
          <div key={`${part.id}-actions`} className="flex flex-wrap gap-2">
            <Link href={`/parts/${part.id}`} className="text-sm font-semibold text-blue-700">Открыть</Link>
            <button type="button" onClick={() => setEditingPartId(part.id)} className="text-sm font-semibold text-blue-700">Редактировать</button>
            <Link href={`/parts/${part.id}/process`} className="text-sm font-semibold text-blue-700">Техпроцесс</Link>
          </div>,
        ])}
      />
    </div>
  );
}
