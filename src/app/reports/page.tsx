"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { holders, machineCells, machines, tools, type Holder, type MachineCell, type Tool } from "../mock-data";
import {
  loadOperationsFromStorage,
  loadPartsFromStorage,
  loadProjectsFromStorage,
  normalizeOperationNo,
  sortOperationsByNumber,
  type OperationSetup,
  type ProcessOperation,
  type ProcessPart,
  type ProcessProject,
  type ToolPosition,
} from "../process-model";
import { PageHeader, StatCard, StatusBadge } from "../ui";

type ReportType = "full" | "tooling" | "machines" | "issues" | "newNomenclature";

type AuxiliaryToolingItem = {
  id: string;
  type?: string;
  itemId?: string;
  name?: string;
  quantity?: number;
  comment?: string;
};

type ExtendedToolPosition = ToolPosition & {
  machineCellId?: string;
  machineCellName?: string;
  mainHolderId?: string;
  mainHolderName?: string;
  auxiliaryText?: string;
  auxiliaryItems?: AuxiliaryToolingItem[];
  toolKind?: "solid" | "indexable" | "other" | null;
  solidToolId?: string;
  solidToolName?: string;
  indexableHolderId?: string;
  indexableHolderName?: string;
  insertId?: string;
  insertName?: string;
};

type ReportRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  partId: string;
  partCode: string;
  partName: string;
  operationId: string;
  operationNo: string;
  operationName: string;
  machineName: string;
  setupId: string;
  setupNo: number | string;
  setupName: string;
  positionId: string;
  positionNo: number | string;
  machineCell: string;
  mainHolder: string;
  auxiliaryTooling: string;
  toolKind: string;
  solidTool: string;
  indexableHolder: string;
  insert: string;
  quantity: number | string;
  status: string;
  comment: string;
  cellConflict: string;
};

type IssueRow = {
  type: string;
  project: string;
  part: string;
  operation: string;
  setup: string;
  position: string;
  description: string;
  status: string;
};

type ReportData = {
  rows: ReportRow[];
  issues: IssueRow[];
  summary: {
    parts: number;
    operations: number;
    setups: number;
    positions: number;
    uniqueHolders: number;
    uniqueTools: number;
    emptyTools: number;
    cellConflicts: number;
  };
};

const FLOW_HOLDERS_STORAGE_KEY = "tech-process-flow-holders";
const FLOW_TOOLS_STORAGE_KEY = "tech-process-flow-tools";

const reportTypes: Array<{ value: ReportType; label: string }> = [
  { value: "full", label: "Полный отчёт по проекту" },
  { value: "tooling", label: "Инструмент по проекту" },
  { value: "machines", label: "Загрузка станков" },
  { value: "issues", label: "Проблемные места" },
  { value: "newNomenclature", label: "Ручные / новые позиции номенклатуры" },
];

const fullColumns: Array<{ key: keyof ReportRow; label: string }> = [
  { key: "projectName", label: "Проект" },
  { key: "partName", label: "Деталь" },
  { key: "partCode", label: "Код детали" },
  { key: "operationNo", label: "Операция №" },
  { key: "operationName", label: "Операция" },
  { key: "machineName", label: "Станок" },
  { key: "setupNo", label: "Установ №" },
  { key: "setupName", label: "Установ" },
  { key: "positionNo", label: "Позиция №" },
  { key: "machineCell", label: "Ячейка станка" },
  { key: "mainHolder", label: "Основная оправка / блок" },
  { key: "auxiliaryTooling", label: "Доп. оснастка" },
  { key: "toolKind", label: "Тип инструмента" },
  { key: "solidTool", label: "Монолитный инструмент" },
  { key: "indexableHolder", label: "Державка / корпус СМП" },
  { key: "insert", label: "Пластина СМП" },
  { key: "quantity", label: "Кол-во" },
  { key: "status", label: "Статус" },
  { key: "comment", label: "Комментарий" },
];

const toolingColumns: Array<{ key: keyof ReportRow; label: string }> = [
  { key: "partName", label: "Деталь" },
  { key: "operationNo", label: "Операция №" },
  { key: "operationName", label: "Операция" },
  { key: "setupNo", label: "Установ №" },
  { key: "positionNo", label: "Позиция №" },
  { key: "machineName", label: "Станок" },
  { key: "machineCell", label: "Ячейка" },
  { key: "mainHolder", label: "Основная оправка / блок" },
  { key: "auxiliaryTooling", label: "Доп. оснастка" },
  { key: "solidTool", label: "Инструмент" },
  { key: "indexableHolder", label: "Державка" },
  { key: "insert", label: "Пластина" },
  { key: "quantity", label: "Кол-во" },
  { key: "status", label: "Статус" },
];

const machineColumns: Array<{ key: keyof ReportRow; label: string }> = [
  { key: "machineName", label: "Станок" },
  { key: "partName", label: "Деталь" },
  { key: "operationNo", label: "Операция" },
  { key: "setupName", label: "Установ" },
  { key: "machineCell", label: "Ячейка" },
  { key: "mainHolder", label: "Оправка" },
  { key: "solidTool", label: "Инструмент" },
  { key: "status", label: "Статус" },
];

export default function ReportsPage() {
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [parts, setParts] = useState<ProcessPart[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [reportType, setReportType] = useState<ReportType>("full");
  const [generated, setGenerated] = useState<{ projectId: string; partId: string; type: ReportType } | null>(null);
  const [holdersCatalog, setHoldersCatalog] = useState<Holder[]>(holders);
  const [toolsCatalog, setToolsCatalog] = useState<Tool[]>(tools);

  useEffect(() => {
    const loadedProjects = loadProjectsFromStorage();
    const loadedParts = loadPartsFromStorage();
    setProjects(loadedProjects);
    setParts(loadedParts);
    setHoldersCatalog(mergeById(holders, readLocalArray<Holder>(FLOW_HOLDERS_STORAGE_KEY)));
    setToolsCatalog(mergeById(tools, readLocalArray<Tool>(FLOW_TOOLS_STORAGE_KEY)));
    setSelectedProjectId((current) => current || loadedProjects.find((project) => !project.isDeleted)?.id || loadedProjects[0]?.id || "");
  }, []);

  const projectParts = useMemo(
    () => parts.filter((part) => part.projectId === selectedProjectId && !part.isDeleted),
    [parts, selectedProjectId],
  );

  useEffect(() => {
    if (selectedPartId && !projectParts.some((part) => part.id === selectedPartId)) {
      setSelectedPartId("");
    }
  }, [projectParts, selectedPartId]);

  const activeSelection = generated ?? { projectId: selectedProjectId, partId: selectedPartId, type: reportType };
  const selectedProject = projects.find((project) => project.id === activeSelection.projectId);
  const report = useMemo(() => {
    if (!activeSelection.projectId) return emptyReport();
    return buildProjectFullReport(activeSelection.projectId, activeSelection.partId || undefined, projects, parts, holdersCatalog, toolsCatalog);
  }, [activeSelection.partId, activeSelection.projectId, holdersCatalog, parts, projects, toolsCatalog]);

  const visibleRows = useMemo(() => {
    if (activeSelection.type === "machines") return buildMachineLoadingReport(report.rows);
    if (activeSelection.type === "issues") return report.rows;
    if (activeSelection.type === "newNomenclature") return report.rows.filter(isNewOrManualNomenclatureRow);
    return activeSelection.type === "tooling" ? buildProjectToolingReport(report.rows) : report.rows;
  }, [activeSelection.type, report.rows]);

  const currentColumns = activeSelection.type === "tooling"
    ? toolingColumns
    : activeSelection.type === "machines"
      ? machineColumns
      : fullColumns;

  function generateReport() {
    setGenerated({ projectId: selectedProjectId, partId: selectedPartId, type: reportType });
  }

  function exportCurrentReport() {
    if (!selectedProject) return;
    exportReportToExcel(selectedProject, report, activeSelection.type, visibleRows);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отчёты"
        description="Формируйте отчёты по проектам, деталям, техпроцессам, инструментальным позициям и загрузке станков из текущих данных приложения."
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr_1fr_auto_auto]">
          <Field label="Проект">
            <select className="field" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Деталь">
            <select className="field" value={selectedPartId} onChange={(event) => setSelectedPartId(event.target.value)}>
              <option value="">Все детали проекта</option>
              {projectParts.map((part) => (
                <option key={part.id} value={part.id}>{part.code} — {part.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Тип отчёта">
            <select className="field" value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
              {reportTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button type="button" onClick={generateReport} disabled={!selectedProjectId} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              Сформировать
            </button>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={exportCurrentReport} disabled={!selectedProject || !generated} className="w-full rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
              Экспорт в Excel
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Деталей" value={report.summary.parts} hint="В выбранном объёме" />
        <StatCard label="Операций" value={report.summary.operations} hint="Сортировка по номеру" />
        <StatCard label="Установов" value={report.summary.setups} hint="По всем операциям" />
        <StatCard label="Позиций" value={report.summary.positions} hint="Инструментальные позиции" />
        <StatCard label="Проблем" value={report.issues.length} hint="Незаполненные поля и конфликты" />
      </div>

      {!generated ? (
        <EmptyState title="Выберите проект для формирования отчёта." text="Настройте фильтры сверху и нажмите «Сформировать»." />
      ) : activeSelection.type === "issues" ? (
        <IssuesTable rows={report.issues} />
      ) : visibleRows.length ? (
        <div className="space-y-6">
          {activeSelection.type === "full" ? <HierarchyReport project={selectedProject} rows={visibleRows} /> : null}
          {activeSelection.type === "tooling" ? <ToolingSummary report={report} /> : null}
          <ReportTable title={reportTypes.find((type) => type.value === activeSelection.type)?.label ?? "Отчёт"} columns={currentColumns} rows={visibleRows} />
        </div>
      ) : (
        <EmptyState title="В проекте пока нет инструментальных позиций." text="Создайте позиции в блок-схеме проекта, затем сформируйте отчёт повторно." />
      )}
    </div>
  );
}

function buildProjectFullReport(
  projectId: string,
  partId: string | undefined,
  projects: ProcessProject[],
  parts: ProcessPart[],
  holdersCatalog: Holder[],
  toolsCatalog: Tool[],
): ReportData {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return emptyReport();

  const scopedParts = parts.filter((part) => part.projectId === projectId && !part.isDeleted && (!partId || part.id === partId));
  const rows = flattenProjectProcess(project, scopedParts, holdersCatalog, toolsCatalog);
  const issues = buildIssuesReport(project, scopedParts, rows);
  const summary = buildSummary(scopedParts, rows, issues);

  return { rows, issues, summary };
}

function buildProjectToolingReport(rows: ReportRow[]) {
  return rows;
}

function buildMachineLoadingReport(rows: ReportRow[]) {
  return [...rows].sort((first, second) =>
    first.machineName.localeCompare(second.machineName, "ru") ||
    first.partName.localeCompare(second.partName, "ru") ||
    String(first.operationNo).localeCompare(String(second.operationNo), "ru"),
  );
}

function flattenProjectProcess(project: ProcessProject, scopedParts: ProcessPart[], holdersCatalog: Holder[], toolsCatalog: Tool[]): ReportRow[] {
  return scopedParts.flatMap((part) => {
    const operations = sortOperationsByNumber(loadOperationsFromStorage(part.id));

    return operations.flatMap((operation) =>
      operation.setups.flatMap((setup) =>
        setup.toolPositions.map((position) => reportRowFromPosition(project, part, operation, setup, position as ExtendedToolPosition, holdersCatalog, toolsCatalog)),
      ),
    );
  });
}

function reportRowFromPosition(
  project: ProcessProject,
  part: ProcessPart,
  operation: ProcessOperation,
  setup: OperationSetup,
  position: ExtendedToolPosition,
  holdersCatalog: Holder[],
  toolsCatalog: Tool[],
): ReportRow {
  const toolKind = resolveToolKind(position);
  const machine = resolveMachine(operation);
  const cell = resolveCell(position);
  const mainHolder = resolveHolder(position.mainHolderId ?? position.holderId, position.mainHolderName ?? position.holderManualText, holdersCatalog);
  const solidTool = toolKind === "СМП" ? dash() : resolveTool(position.solidToolId ?? position.toolId, position.solidToolName ?? position.toolManualText, toolsCatalog);
  const indexableHolder = toolKind === "СМП" ? resolveTool(position.indexableHolderId, position.indexableHolderName, toolsCatalog) : dash();
  const insert = toolKind === "СМП" ? resolveTool(position.insertId, position.insertName, toolsCatalog) : dash();

  return {
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    partId: part.id,
    partCode: part.code,
    partName: part.name,
    operationId: operation.id,
    operationNo: operation.operationNo || operation.number || dash(),
    operationName: operation.name || operation.title || dash(),
    machineName: machine,
    setupId: setup.id,
    setupNo: setup.setupNo ?? dash(),
    setupName: setup.name || dash(),
    positionId: position.id,
    positionNo: position.positionNo ?? dash(),
    machineCell: cell,
    mainHolder,
    auxiliaryTooling: resolveAuxiliary(position),
    toolKind,
    solidTool,
    indexableHolder,
    insert,
    quantity: position.quantity ?? 1,
    status: position.status || dash(),
    comment: position.comment || setup.comment || operation.comment || dash(),
    cellConflict: "",
  };
}

function buildIssuesReport(project: ProcessProject, scopedParts: ProcessPart[], rows: ReportRow[]): IssueRow[] {
  const issues: IssueRow[] = [];
  const cellConflicts = detectCellConflicts(rows);
  const duplicateOperations = new Set<string>();

  scopedParts.forEach((part) => {
    const operations = sortOperationsByNumber(loadOperationsFromStorage(part.id));
    const operationNoCounts = new Map<string, number>();

    operations.forEach((operation) => {
      const normalized = normalizeOperationNo(operation.operationNo);
      if (normalized) operationNoCounts.set(normalized, (operationNoCounts.get(normalized) ?? 0) + 1);
      if (!operation.operationNo?.trim()) {
        issues.push(issue("Пустой номер операции", project, part, operation, undefined, undefined, "У операции не заполнен номер."));
      }
      if (!resolveMachine(operation, true)) {
        issues.push(issue("Не выбран станок", project, part, operation, undefined, undefined, "В операции не выбран станок."));
      }
    });

    operationNoCounts.forEach((count, normalized) => {
      if (count > 1) duplicateOperations.add(`${part.id}:${normalized}`);
    });

    operations.forEach((operation) => {
      if (duplicateOperations.has(`${part.id}:${normalizeOperationNo(operation.operationNo)}`)) {
        issues.push(issue("Дублирующийся номер операции", project, part, operation, undefined, undefined, `Номер ${operation.operationNo} повторяется в детали.`));
      }

      operation.setups.forEach((setup) => {
        setup.toolPositions.forEach((position) => {
          const extended = position as ExtendedToolPosition;
          const row = rows.find((item) => item.positionId === position.id);
          const toolKind = resolveToolKind(extended);

          if (!resolveCell(extended, true)) issues.push(issue("Пустая ячейка", project, part, operation, setup, extended, "В позиции не выбрана ячейка станка."));
          if (!resolveHolder(extended.mainHolderId ?? extended.holderId, extended.mainHolderName ?? extended.holderManualText, holders, true)) issues.push(issue("Не выбрана оправка", project, part, operation, setup, extended, "В позиции не выбрана основная оправка / блок."));
          if (toolKind === "СМП") {
            if (!resolveTool(extended.indexableHolderId, extended.indexableHolderName, tools, true)) issues.push(issue("Не выбрана державка СМП", project, part, operation, setup, extended, "Для СМП не выбрана державка / корпус."));
            if (!resolveTool(extended.insertId, extended.insertName, tools, true)) issues.push(issue("Не выбрана пластина СМП", project, part, operation, setup, extended, "Для СМП не выбрана пластина."));
          } else if (!resolveTool(extended.solidToolId ?? extended.toolId, extended.solidToolName ?? extended.toolManualText, tools, true)) {
            issues.push(issue("Не выбран инструмент", project, part, operation, setup, extended, "В позиции не выбран инструмент."));
          }
          if (row && cellConflicts.has(row.positionId)) {
            issues.push(issue("Конфликт ячейки", project, part, operation, setup, extended, cellConflicts.get(row.positionId) ?? "Ячейка используется в другой позиции."));
          }
        });
      });
    });
  });

  return issues;
}

function buildSummary(scopedParts: ProcessPart[], rows: ReportRow[], issues: IssueRow[]): ReportData["summary"] {
  const operations = scopedParts.flatMap((part) => loadOperationsFromStorage(part.id));
  const setups = operations.flatMap((operation) => operation.setups);
  const uniqueHolders = new Set(rows.map((row) => row.mainHolder).filter(isRealValue));
  const uniqueTools = new Set(rows.flatMap((row) => [row.solidTool, row.indexableHolder, row.insert]).filter(isRealValue));

  return {
    parts: scopedParts.length,
    operations: operations.length,
    setups: setups.length,
    positions: rows.length,
    uniqueHolders: uniqueHolders.size,
    uniqueTools: uniqueTools.size,
    emptyTools: rows.filter((row) => !isRealValue(row.solidTool) && !isRealValue(row.indexableHolder)).length,
    cellConflicts: issues.filter((issueRow) => issueRow.type === "Конфликт ячейки").length,
  };
}

function exportReportToExcel(project: ProcessProject, report: ReportData, reportType: ReportType, visibleRows: ReportRow[]) {
  const workbook = XLSX.utils.book_new();
  const fullSheetRows = toExcelRows(report.rows, fullColumns);
  const toolingSheetRows = toExcelRows(buildProjectToolingReport(report.rows), toolingColumns);
  const machineSheetRows = toExcelRows(buildMachineLoadingReport(report.rows), machineColumns);
  const issueSheetRows = report.issues.map((row) => ({
    "Тип проблемы": row.type,
    "Проект": row.project,
    "Деталь": row.part,
    "Операция": row.operation,
    "Установ": row.setup,
    "Позиция": row.position,
    "Описание": row.description,
    "Статус": row.status,
  }));

  if (reportType === "tooling") {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toExcelRows(visibleRows, toolingColumns)), "Инструмент по проекту");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([report.summary]), "Сводка");
  } else {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fullSheetRows), "Полный отчёт");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(toolingSheetRows), "Инструмент");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(machineSheetRows), "Станки");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(issueSheetRows), "Проблемы");
  }

  XLSX.writeFile(workbook, `${safeFileName(project.code)}_${safeFileName(project.name)}_отчёт.xlsx`);
}

function HierarchyReport({ project, rows }: { project?: ProcessProject; rows: ReportRow[] }) {
  const groupedParts = groupBy(rows, (row) => row.partId);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">Проект: {project?.name ?? dash()}</h3>
      <div className="mt-4 space-y-5">
        {Object.entries(groupedParts).map(([partId, partRows]) => (
          <div key={partId} className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="font-semibold text-slate-950">Деталь: {partRows[0]?.partName} <span className="text-sm text-slate-500">({partRows[0]?.partCode})</span></div>
            {Object.entries(groupBy(partRows, (row) => row.operationId)).map(([operationId, operationRows]) => (
              <div key={operationId} className="mt-3 border-l-2 border-blue-200 pl-4">
                <div className="font-semibold text-slate-900">Операция {operationRows[0]?.operationNo} — {operationRows[0]?.operationName}</div>
                <div className="mt-1 text-sm text-slate-600">Станок: {operationRows[0]?.machineName}</div>
                {Object.entries(groupBy(operationRows, (row) => row.setupId)).map(([setupId, setupRows]) => (
                  <div key={setupId} className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-900">Установ {setupRows[0]?.setupNo} — {setupRows[0]?.setupName}</div>
                    <div className="mt-2 grid gap-2">
                      {setupRows.map((row) => (
                        <div key={row.positionId} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          <div className="font-semibold text-slate-900">Позиция {row.positionNo}</div>
                          <div>Ячейка: {row.machineCell}</div>
                          <div>Основная оправка: {row.mainHolder}</div>
                          <div>Доп. оснастка: {row.auxiliaryTooling}</div>
                          <div>Инструмент: {row.toolKind === "СМП" ? `${row.indexableHolder} / ${row.insert}` : row.solidTool}</div>
                          <div>Кол-во: {row.quantity}</div>
                          <div>Статус: {row.status}</div>
                          <div>Комментарий: {row.comment}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ToolingSummary({ report }: { report: ReportData }) {
  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
      <SummaryItem label="Уникальных оправок" value={report.summary.uniqueHolders} />
      <SummaryItem label="Уникальных инструментов" value={report.summary.uniqueTools} />
      <SummaryItem label="Позиций без инструмента" value={report.summary.emptyTools} />
      <SummaryItem label="Конфликтов ячеек" value={report.summary.cellConflicts} />
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function ReportTable({ title, columns, rows }: { title: string; columns: Array<{ key: keyof ReportRow; label: string }>; rows: ReportRow[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="max-h-[68vh] overflow-auto">
        <table className="min-w-[1800px] divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left font-semibold text-slate-600">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.positionId} className="hover:bg-blue-50/50">
                {columns.map((column) => (
                  <td key={`${row.positionId}-${column.key}`} className="max-w-64 whitespace-nowrap px-4 py-3 text-slate-700" title={String(row[column.key] ?? dash())}>
                    <span className="block truncate">{String(row[column.key] ?? dash())}</span>
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

function IssuesTable({ rows }: { rows: IssueRow[] }) {
  if (!rows.length) return <EmptyState title="Проблемные места не найдены." text="Для выбранного проекта нет незаполненных обязательных полей и конфликтов ячеек." />;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-950">Проблемные места</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Тип проблемы", "Проект", "Деталь", "Операция", "Установ", "Позиция", "Описание", "Статус"].map((column) => (
                <th key={column} className="px-4 py-3 text-left font-semibold text-slate-600">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={`${row.type}-${index}`} className="hover:bg-blue-50/50">
                <td className="px-4 py-3 font-semibold text-amber-700">{row.type}</td>
                <td className="px-4 py-3 text-slate-700">{row.project}</td>
                <td className="px-4 py-3 text-slate-700">{row.part}</td>
                <td className="px-4 py-3 text-slate-700">{row.operation}</td>
                <td className="px-4 py-3 text-slate-700">{row.setup}</td>
                <td className="px-4 py-3 text-slate-700">{row.position}</td>
                <td className="px-4 py-3 text-slate-700">{row.description}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status as never} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
    </section>
  );
}

function issue(
  type: string,
  project: ProcessProject,
  part: ProcessPart,
  operation: ProcessOperation,
  setup: OperationSetup | undefined,
  position: ExtendedToolPosition | undefined,
  description: string,
): IssueRow {
  return {
    type,
    project: project.name,
    part: `${part.code} ${part.name}`,
    operation: operation.operationNo ? `${operation.operationNo} ${operation.name}` : operation.name || dash(),
    setup: setup ? `${setup.setupNo} ${setup.name}` : dash(),
    position: position ? String(position.positionNo) : dash(),
    description,
    status: position?.status || operation.status || dash(),
  };
}

function detectCellConflicts(rows: ReportRow[]) {
  const byCell = new Map<string, ReportRow[]>();
  rows.forEach((row) => {
    if (!isRealValue(row.machineName) || !isRealValue(row.machineCell)) return;
    const key = `${row.machineName}::${row.machineCell}`;
    byCell.set(key, [...(byCell.get(key) ?? []), row]);
  });

  const conflicts = new Map<string, string>();
  byCell.forEach((items) => {
    if (items.length < 2) return;
    items.forEach((row) => {
      const other = items.find((item) => item.positionId !== row.positionId);
      if (!other) return;
      conflicts.set(row.positionId, `${row.machineCell} уже занята: Операция ${other.operationNo} / Установ ${other.setupNo} / Инструмент: ${other.solidTool || other.indexableHolder}`);
      row.cellConflict = conflicts.get(row.positionId) ?? "";
    });
  });
  return conflicts;
}

function resolveMachine(operation: ProcessOperation, raw = false) {
  if (operation.machineSource === "manual") return operation.machineManualText || (raw ? "" : dash());
  if (operation.machineSource === "catalog") return machines.find((machine) => machine.id === operation.machineId)?.name || (raw ? "" : dash());
  return raw ? "" : dash();
}

function resolveCell(position: ExtendedToolPosition, raw = false) {
  const cellId = position.machineCellId ?? position.cellId;
  const cellName = position.machineCellName ?? position.cellManualText;
  return cellName || machineCells.find((cell) => cell.id === cellId)?.label || (raw ? "" : dash());
}

function resolveHolder(holderId: string | undefined, holderText: string | undefined, holdersCatalog: Holder[], raw = false) {
  return holderText || holdersCatalog.find((holder) => holder.id === holderId)?.name || (raw ? "" : dash());
}

function resolveTool(toolId: string | undefined, toolText: string | undefined, toolsCatalog: Tool[], raw = false) {
  return toolText || toolsCatalog.find((tool) => tool.id === toolId)?.name || (raw ? "" : dash());
}

function resolveAuxiliary(position: ExtendedToolPosition) {
  if (position.auxiliaryText) return position.auxiliaryText;
  if (position.auxiliaryItems?.length) {
    return position.auxiliaryItems.map((item) => `${item.name ?? item.type ?? "Оснастка"}${item.quantity ? ` x${item.quantity}` : ""}`).join("; ");
  }
  return dash();
}

function resolveToolKind(position: ExtendedToolPosition) {
  const kind = position.toolKind ?? (position.indexableHolderId || position.insertId ? "indexable" : position.solidToolId || position.toolId ? "solid" : null);
  if (kind === "indexable") return "СМП";
  if (kind === "solid") return "Монолитный";
  if (kind === "other") return "Прочее";
  return dash();
}

function isNewOrManualNomenclatureRow(row: ReportRow) {
  return [row.machineCell, row.mainHolder, row.auxiliaryTooling, row.solidTool, row.indexableHolder, row.insert]
    .some((value) => isRealValue(value) && /new-|ручн|создан/i.test(value));
}

function toExcelRows(rows: ReportRow[], columns: Array<{ key: keyof ReportRow; label: string }>) {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column.label, row[column.key] ?? dash()])));
}

function emptyReport(): ReportData {
  return {
    rows: [],
    issues: [],
    summary: {
      parts: 0,
      operations: 0,
      setups: 0,
      positions: 0,
      uniqueHolders: 0,
      uniqueTools: 0,
      emptyTools: 0,
      cellConflicts: 0,
    },
  };
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});
}

function readLocalArray<T>(key: string): T[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function mergeById<T extends { id: string }>(base: T[], stored: T[]) {
  const map = new Map(base.map((item) => [item.id, item]));
  stored.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function isRealValue(value: unknown) {
  return typeof value === "string" && value.trim() !== "" && value !== dash();
}

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "report";
}

function dash() {
  return "—";
}
