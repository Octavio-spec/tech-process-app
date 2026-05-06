import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { DisplayResource, OperationStatus } from "./mock-data";

type PageHeaderProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function PageHeader({ title, description, actionHref, actionLabel }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

export function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DataTable({ title, columns, rows }: { title: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-5 py-3 text-left font-semibold text-slate-600">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-blue-50/50">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-5 py-3 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const statusStyles: Record<OperationStatus, string> = {
  "Черновик": "border-slate-200 bg-slate-50 text-slate-600",
  "В работе": "border-blue-200 bg-blue-50 text-blue-700",
  "Требует уточнения": "border-amber-200 bg-amber-50 text-amber-700",
  "Готово": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Архив": "border-slate-200 bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: OperationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

export function ResourceValue({ resource }: { resource: DisplayResource }) {
  if (resource.source === "manual") {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
          Ручная заглушка
        </span>
        <div className="font-medium text-slate-900">{resource.value}</div>
      </div>
    );
  }

  if (resource.source === "required") {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          Требуется подбор
        </span>
        <div className="font-medium text-slate-500">{resource.value}</div>
      </div>
    );
  }

  return <span className="font-medium text-slate-900">{resource.value}</span>;
}
