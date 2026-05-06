"use client";

import { useState, type ReactNode } from "react";
import type { OperationStatus } from "./mock-data";
import type { ProcessPart, ProcessProject } from "./process-model";

const statuses: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Архив"];

export function ProjectForm({ mode, project, projects, onSubmit, onCancel }: {
  mode: "create" | "edit";
  project?: ProcessProject;
  projects: ProcessProject[];
  onSubmit: (project: ProcessProject) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(project?.code ?? "");
  const [name, setName] = useState(project?.name ?? "");
  const [customer, setCustomer] = useState(project?.customer ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<OperationStatus>(project?.status ?? "Черновик");
  const [error, setError] = useState("");

  function submit() {
    const nextCode = code.trim();
    const nextName = name.trim();

    if (!nextCode || !nextName) {
      setError("Код и название обязательны.");
      return;
    }

    const hasDuplicate = projects.some((item) => item.id !== project?.id && item.code.trim().toLowerCase() === nextCode.toLowerCase());
    if (hasDuplicate) {
      setError("Такой код уже используется.");
      return;
    }

    const now = new Date().toLocaleDateString("ru-RU");
    onSubmit({
      id: project?.id ?? `project-${Date.now()}`,
      code: nextCode,
      name: nextName,
      customer: customer.trim(),
      description: description.trim(),
      status,
      isDeleted: project?.isDeleted ?? false,
      deletedAt: project?.deletedAt ?? null,
      createdAt: project?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{mode === "create" ? "Новый проект" : "Редактирование проекта"}</h2>
      {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Код проекта"><Input value={code} onChange={setCode} /></Field>
        <Field label="Название"><Input value={name} onChange={setName} /></Field>
        <Field label="Заказчик"><Input value={customer} onChange={setCustomer} /></Field>
        <Field label="Статус"><Select value={status} onChange={(value) => setStatus(value as OperationStatus)} options={statuses} /></Field>
        <Field label="Описание" wide><Textarea value={description} onChange={setDescription} rows={3} /></Field>
      </div>
      <FormActions onSubmit={submit} onCancel={onCancel} />
    </section>
  );
}

export function PartForm({ mode, part, parts, projects, defaultProjectId, onSubmit, onCancel }: {
  mode: "create" | "edit";
  part?: ProcessPart;
  parts: ProcessPart[];
  projects: ProcessProject[];
  defaultProjectId?: string;
  onSubmit: (part: ProcessPart) => void;
  onCancel: () => void;
}) {
  const [projectId, setProjectId] = useState(part?.projectId ?? defaultProjectId ?? projects[0]?.id ?? "");
  const [code, setCode] = useState(part?.code ?? "");
  const [name, setName] = useState(part?.name ?? "");
  const [drawingNumber, setDrawingNumber] = useState(part?.drawingNumber ?? "");
  const [description, setDescription] = useState(part?.description ?? "");
  const [status, setStatus] = useState<OperationStatus>(part?.status ?? "Черновик");
  const [error, setError] = useState("");

  function submit() {
    const nextCode = code.trim();
    const nextName = name.trim();

    if (!projectId || !nextCode || !nextName) {
      setError("Проект, код и наименование обязательны.");
      return;
    }

    const hasDuplicate = parts.some(
      (item) => item.id !== part?.id && item.projectId === projectId && item.code.trim().toLowerCase() === nextCode.toLowerCase(),
    );
    if (hasDuplicate) {
      setError("Такой код уже используется.");
      return;
    }

    const now = new Date().toLocaleDateString("ru-RU");
    const id = part?.id ?? `part-${Date.now()}`;
    onSubmit({
      id,
      projectId,
      code: nextCode,
      name: nextName,
      drawingNumber: drawingNumber.trim(),
      description: description.trim(),
      status,
      isDeleted: part?.isDeleted ?? false,
      deletedAt: part?.deletedAt ?? null,
      createdAt: part?.createdAt ?? now,
      routeId: part?.routeId ?? `local-route-${id}`,
      updatedAt: now,
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{mode === "create" ? "Новая деталь" : "Редактирование детали"}</h2>
      {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Проект">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
            <option value="">Выберите проект</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </Field>
        <Field label="Код детали"><Input value={code} onChange={setCode} /></Field>
        <Field label="Наименование"><Input value={name} onChange={setName} /></Field>
        <Field label="Номер чертежа"><Input value={drawingNumber} onChange={setDrawingNumber} /></Field>
        <Field label="Статус"><Select value={status} onChange={(value) => setStatus(value as OperationStatus)} options={statuses} /></Field>
        <Field label="Описание" wide><Textarea value={description} onChange={setDescription} rows={3} /></Field>
      </div>
      <FormActions onSubmit={submit} onCancel={onCancel} />
    </section>
  );
}

function FormActions({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={onSubmit} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Сохранить</button>
      <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Отмена</button>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "md:col-span-2" : ""}><div className="mb-1 text-sm font-semibold text-slate-700">{label}</div>{children}</label>;
}

function Input({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />;
}

function Textarea({ value, rows, onChange }: { value: string; rows: number; onChange: (value: string) => void }) {
  return <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />;
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}
