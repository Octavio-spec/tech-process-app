"use client";

import Link from "next/link";
import { Box, Briefcase, Cpu, FileText, Home, Settings, ToolCase, Wrench } from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/projects", label: "Проекты", icon: Briefcase },
  { href: "/parts", label: "Детали", icon: Box },
  { href: "/machines", label: "Станки", icon: Cpu },
  { href: "/holders", label: "Оснастка", icon: Wrench },
  { href: "/tools", label: "Инструменты", icon: ToolCase },
  { href: "/reports", label: "Отчёты", icon: FileText },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 shadow-sm lg:block">
        <Link href="/" className="mb-8 block rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="text-sm font-semibold text-blue-800">Tech Process</div>
          <div className="text-xs text-slate-500">MVP технолога</div>
        </Link>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-blue-700">Технологическая подготовка</p>
              <h1 className="text-lg font-semibold text-slate-950">Каркас MVP</h1>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Mock-данные
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
