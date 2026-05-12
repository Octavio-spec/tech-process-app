"use client";

import Link from "next/link";
import { Database, Hammer, Layers, PackageCheck, Wrench } from "lucide-react";
import { PageHeader } from "../ui";

const sections = [
  {
    title: "Станки",
    description: "Оборудование и ячейки магазинов",
    href: "/machines",
    icon: Database,
  },
  {
    title: "Инструменты",
    description: "Фрезы, сверла, метчики и другой режущий инструмент",
    href: "/tools",
    icon: Wrench,
  },
  {
    title: "Оснастка / оправки",
    description: "Оправки, держатели, приспособления и технологическая оснастка",
    href: "/holders",
    icon: Hammer,
  },
  {
    title: "Материалы",
    description: "Материалы деталей и заготовок",
    href: "#",
    icon: Layers,
  },
  {
    title: "Статусы",
    description: "Статусы проектов, деталей, операций и позиций",
    href: "#",
    icon: PackageCheck,
  },
];

export default function DatabasePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="База данных"
        description="Справочники оборудования, оснастки и инструмента, которые используются в техпроцессах."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <article key={section.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-blue-700">
                <section.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-950">{section.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{section.description}</p>
              </div>
            </div>
            {section.href === "#" ? (
              <button type="button" disabled className="mt-5 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
                Позже
              </button>
            ) : (
              <Link href={section.href} className="mt-5 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                Открыть
              </Link>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
