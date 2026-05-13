"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Box, Briefcase, Database, FileText, Home, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { applyTheme, parseTheme, THEME_STORAGE_KEY } from "./theme-settings";

const navItems = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/projects", label: "Проекты", icon: Briefcase },
  { href: "/parts", label: "Детали", icon: Box },
  { href: "/database", label: "База данных", icon: Database },
  { href: "/projects?view=archive", label: "Архив", icon: Archive },
  { href: "/reports", label: "Отчёты", icon: FileText },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFlowEditor = pathname.includes("/flow") || pathname === "/projects";
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(isFlowEditor);

  useEffect(() => {
    const saved = window.localStorage.getItem("tech-process:sidebar-collapsed");
    setIsSidebarCollapsed(saved ? saved === "true" : isFlowEditor);
  }, [isFlowEditor]);

  useEffect(() => {
    function syncTheme() {
      applyTheme(parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY)));
    }

    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("tech-process:theme-change", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("tech-process:theme-change", syncTheme);
    };
  }, []);

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("tech-process:sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-20 hidden border-r border-slate-200 bg-white px-3 py-5 shadow-sm transition-all lg:block ${isSidebarCollapsed ? "w-20" : "w-64"}`}>
        <button type="button" onClick={toggleSidebar} className="mb-4 flex h-9 w-full items-center justify-center rounded-md border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-blue-50">
          {isSidebarCollapsed ? ">" : "<"}
        </button>
        <Link href="/" className={`mb-8 block rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 ${isSidebarCollapsed ? "text-center" : ""}`}>
          <div className="text-sm font-semibold text-blue-800">{isSidebarCollapsed ? "TP" : "Tech Process"}</div>
          {!isSidebarCollapsed ? <div className="text-xs text-slate-500">MVP технолога</div> : null}
        </Link>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} className={`flex items-center rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 ${isSidebarCollapsed ? "justify-center" : "gap-3"}`}>
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {!isSidebarCollapsed ? item.label : null}
            </Link>
          ))}
        </nav>
      </aside>

      <div className={`transition-all ${isSidebarCollapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        <header className={`${isFlowEditor ? "hidden" : "sticky"} top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8`}>
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
        <main className={isFlowEditor ? "p-0" : "px-4 py-6 lg:px-8"}>{children}</main>
      </div>
    </div>
  );
}
