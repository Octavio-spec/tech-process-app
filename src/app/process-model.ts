import {
  getOperationResource,
  getOperationsByRouteId,
  getRouteByPartId,
  holders,
  machineCells,
  machines,
  manualPlaceholders,
  operations,
  parts,
  projects,
  tools,
  type Operation,
  type OperationSetup,
  type OperationStatus,
  type Part,
  type Project,
  type ResourceSource,
  type ToolPosition,
} from "./mock-data";

export type ProcessPart = Part;
export type ProcessOperation = Operation;
export type ProcessProject = Project;
export type { OperationSetup, OperationStatus, ResourceSource, ToolPosition };

export const PROJECTS_STORAGE_KEY = "tech-process:projects";
export const PARTS_STORAGE_KEY = "tech-process:parts";

export function partOperationsStorageKey(partId: string) {
  return `tech-process:operations:${partId}`;
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function getInitialParts(): ProcessPart[] {
  return parts;
}

export function getInitialProjects(): ProcessProject[] {
  return projects;
}

export function getInitialOperationsForPart(partId: string): ProcessOperation[] {
  const route = getRouteByPartId(partId);
  const routeOperations = route ? getOperationsByRouteId(route.id) : operations.filter((operation) => operation.partId === partId);

  return sortOperationsByNumber(routeOperations.map((operation) => {
    const resource = getOperationResource(operation.id);

    return {
      ...operation,
      partId,
      operationNo: operation.operationNo,
      name: operation.name,
      timeNorm: operation.timeNorm,
      comment: operation.comment,
      machineSource: operation.machineSource ?? resource?.machine.source ?? "required",
      machineId: operation.machineId ?? (resource?.machine.source === "catalog" ? resource.machine.catalogId : undefined),
      machineManualText: operation.machineManualText ?? (resource?.machine.source === "manual" ? getManualText(resource.machine.manualPlaceholderId) : undefined),
      setups: operation.setups.length
        ? operation.setups
        : [
            {
              id: createId("setup"),
              setupNo: 1,
              name: "Установ 1",
              description: "Базовый установ операции.",
              fixtureSource: "required",
              comment: operation.comment,
              toolPositions: [
                {
                  id: createId("position"),
                  positionNo: 1,
                  cellSource: resource?.machineCell.source ?? "required",
                  cellId: resource?.machineCell.source === "catalog" ? resource.machineCell.catalogId : undefined,
                  cellManualText: resource?.machineCell.source === "manual" ? getManualText(resource.machineCell.manualPlaceholderId) : undefined,
                  holderSource: resource?.holder.source ?? "required",
                  holderId: resource?.holder.source === "catalog" ? resource.holder.catalogId : undefined,
                  holderManualText: resource?.holder.source === "manual" ? getManualText(resource.holder.manualPlaceholderId) : undefined,
                  toolSource: resource?.tool.source ?? "required",
                  toolId: resource?.tool.source === "catalog" ? resource.tool.catalogId : undefined,
                  toolManualText: resource?.tool.source === "manual" ? getManualText(resource.tool.manualPlaceholderId) : undefined,
                  quantity: 1,
                  comment: "",
                  status: resource?.tool.source === "required" ? "Требует уточнения" : operation.status,
                },
              ],
            },
          ],
    };
  }));
}

export function emptyOperation(partId: string, operationNo: string): ProcessOperation {
  return {
    id: createId("operation"),
    routeId: `local-route-${partId}`,
    partId,
    number: operationNo,
    operationNo,
    title: "Новая операция",
    name: "Новая операция",
    description: "",
    timeNorm: "",
    comment: "",
    technologistComment: "",
    status: "Черновик",
    machineSource: "required",
    resourceId: createId("resource"),
    setups: [],
  };
}

export function emptySetup(setupNo: number): OperationSetup {
  return {
    id: createId("setup"),
    setupNo,
    name: `Установ ${setupNo}`,
    description: "",
    fixtureSource: "required",
    comment: "",
    toolPositions: [],
  };
}

export function emptyToolPosition(positionNo = 1): ToolPosition {
  return {
    id: createId("position"),
    positionNo,
    cellSource: "required",
    holderSource: "required",
    toolSource: "required",
    quantity: 1,
    comment: "",
    status: "Требует уточнения",
  };
}

export function nextOperationNo(operationsList: ProcessOperation[]) {
  const maxNo = operationsList.reduce((max, operation) => {
    const value = Number.parseInt(operation.operationNo, 10);
    return Number.isNaN(value) ? max : Math.max(max, value);
  }, 0);

  return String(maxNo + 10).padStart(3, "0");
}

export function operationNumberSortKey(operationNo?: string) {
  const raw = (operationNo ?? "").trim();
  const match = raw.match(/^(\d+)(.*)$/);

  if (!match) {
    return { isValid: false, number: Number.POSITIVE_INFINITY, suffix: raw.toLowerCase(), raw };
  }

  return {
    isValid: true,
    number: Number.parseInt(match[1], 10),
    suffix: match[2].trim().toLowerCase(),
    raw,
  };
}

export function normalizeOperationNo(operationNo?: string) {
  const key = operationNumberSortKey(operationNo);
  if (!key.isValid) return (operationNo ?? "").trim().toLowerCase();
  return `${key.number}${key.suffix}`;
}

export function sortOperationsByNumber<T extends { operationNo?: string }>(operationsList: T[]): T[] {
  return [...operationsList].sort((first, second) => {
    const a = operationNumberSortKey(first.operationNo);
    const b = operationNumberSortKey(second.operationNo);

    if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
    if (a.number !== b.number) return a.number - b.number;
    if (a.suffix !== b.suffix) return a.suffix.localeCompare(b.suffix, "ru");
    return a.raw.localeCompare(b.raw, "ru");
  });
}

export function loadPartsFromStorage(): ProcessPart[] {
  const saved = window.localStorage.getItem(PARTS_STORAGE_KEY);

  if (!saved) {
    return getInitialParts();
  }

  try {
    return normalizeParts(JSON.parse(saved) as ProcessPart[]);
  } catch {
    window.localStorage.removeItem(PARTS_STORAGE_KEY);
    return getInitialParts();
  }
}

export function savePartsToStorage(nextParts: ProcessPart[]) {
  window.localStorage.setItem(PARTS_STORAGE_KEY, JSON.stringify(normalizeParts(nextParts)));
}

export function updatePart(partId: string, patch: Partial<ProcessPart>) {
  const nextParts = loadPartsFromStorage().map((part) =>
    part.id === partId ? { ...part, ...patch, updatedAt: new Date().toLocaleDateString("ru-RU") } : part,
  );
  savePartsToStorage(nextParts);
  return nextParts;
}

export function loadProjectsFromStorage(): ProcessProject[] {
  const saved = window.localStorage.getItem(PROJECTS_STORAGE_KEY);

  if (!saved) {
    return getInitialProjects();
  }

  try {
    return normalizeProjects(JSON.parse(saved) as ProcessProject[]);
  } catch {
    window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
    return getInitialProjects();
  }
}

export function saveProjectsToStorage(nextProjects: ProcessProject[]) {
  window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(normalizeProjects(nextProjects)));
}

export function updateProject(projectId: string, patch: Partial<ProcessProject>) {
  const nextProjects = loadProjectsFromStorage().map((project) =>
    project.id === projectId ? { ...project, ...patch, updatedAt: new Date().toLocaleDateString("ru-RU") } : project,
  );
  saveProjectsToStorage(nextProjects);
  return nextProjects;
}

export function projectName(projectId?: string) {
  return loadProjectsFromStorage().find((project) => project.id === projectId)?.name ?? projects.find((project) => project.id === projectId)?.name;
}

export function loadOperationsFromStorage(partId: string): ProcessOperation[] {
  const key = partOperationsStorageKey(partId);
  const saved = window.localStorage.getItem(key);

  if (!saved) {
    return getInitialOperationsForPart(partId);
  }

  try {
    return normalizeOperations(JSON.parse(saved) as ProcessOperation[]);
  } catch {
    window.localStorage.removeItem(key);
    return getInitialOperationsForPart(partId);
  }
}

export function saveOperationsToStorage(partId: string, nextOperations: ProcessOperation[]) {
  window.localStorage.setItem(partOperationsStorageKey(partId), JSON.stringify(normalizeOperations(nextOperations)));
}

export function machineName(machineId?: string) {
  return machines.find((machine) => machine.id === machineId)?.name;
}

export function holderName(holderId?: string) {
  return holders.find((holder) => holder.id === holderId)?.name;
}

export function toolName(toolId?: string) {
  return tools.find((tool) => tool.id === toolId)?.name;
}

export function cellName(cellId?: string) {
  return machineCells.find((cell) => cell.id === cellId)?.label;
}

export function getManualText(manualPlaceholderId?: string) {
  return manualPlaceholders.find((placeholder) => placeholder.id === manualPlaceholderId)?.text;
}

export function countRequiredResources(operation: ProcessOperation) {
  const operationRequired = operation.machineSource === "required" ? 1 : 0;
  return operation.setups.reduce((count, setup) => {
    const setupRequired = [setup.fixtureSource].filter((source) => source === "required").length;
    const positionRequired = setup.toolPositions.reduce(
      (positionCount, position) =>
        positionCount + [position.cellSource, position.holderSource, position.toolSource].filter((source) => source === "required").length,
      0,
    );
    return count + setupRequired + positionRequired;
  }, operationRequired);
}

export function hasManualResources(operation: ProcessOperation) {
  return operation.machineSource === "manual" || operation.setups.some(
    (setup) =>
      setup.fixtureSource === "manual" ||
      setup.toolPositions.some(
        (position) =>
          position.cellSource === "manual" ||
          position.holderSource === "manual" ||
          position.toolSource === "manual",
      ),
  );
}

type LegacySetup = OperationSetup & {
  machineSource?: ResourceSource;
  machineId?: string;
  machineManualText?: string;
  cellId?: string;
  holderSource?: ResourceSource;
  holderId?: string;
  holderManualText?: string;
  tools?: Array<{
    id: string;
    toolSource: ResourceSource;
    toolId?: string;
    toolManualText?: string;
    quantity: number;
    cellId?: string;
    comment: string;
    status: OperationStatus;
  }>;
};

export function normalizeOperations(nextOperations: ProcessOperation[]): ProcessOperation[] {
  return nextOperations.map((operation) => {
    const resource = getOperationResource(operation.id);
    const firstSetupMachine = operation.setups.find((setup) => {
      const legacySetup = setup as LegacySetup;
      return legacySetup.machineSource || legacySetup.machineId || legacySetup.machineManualText;
    }) as LegacySetup | undefined;
    const machineSource = operation.machineSource ?? firstSetupMachine?.machineSource ?? resource?.machine.source ?? "required";

    return {
      ...operation,
      machineSource,
      machineId: operation.machineId ?? firstSetupMachine?.machineId ?? (resource?.machine.source === "catalog" ? resource.machine.catalogId : undefined),
      machineManualText: operation.machineManualText ?? firstSetupMachine?.machineManualText ?? (resource?.machine.source === "manual" ? getManualText(resource.machine.manualPlaceholderId) : undefined),
      setups: operation.setups.map((setup) => {
      const legacySetup = setup as LegacySetup;
      const { machineSource: _machineSource, machineId: _machineId, machineManualText: _machineManualText, ...setupWithoutMachine } = setup as LegacySetup;
      const toolPositions = setup.toolPositions?.length
        ? setup.toolPositions
        : (legacySetup.tools ?? []).map((tool, index) => ({
            id: tool.id,
            positionNo: index + 1,
            cellSource: tool.cellId ? "catalog" as ResourceSource : "required" as ResourceSource,
            cellId: tool.cellId,
            holderSource: legacySetup.holderSource ?? "required",
            holderId: legacySetup.holderId,
            holderManualText: legacySetup.holderManualText,
            toolSource: tool.toolSource,
            toolId: tool.toolId,
            toolManualText: tool.toolManualText,
            quantity: tool.quantity,
            comment: tool.comment,
            status: tool.status,
          }));

      return {
        ...setupWithoutMachine,
        fixtureSource: setup.fixtureSource ?? "required",
        toolPositions,
      };
      }),
    };
  });
}

export function normalizeProjects(nextProjects: ProcessProject[]): ProcessProject[] {
  return nextProjects.map((project) => ({
    ...project,
    isDeleted: project.isDeleted ?? false,
    deletedAt: project.deletedAt ?? null,
    createdAt: project.createdAt ?? project.updatedAt ?? new Date().toLocaleDateString("ru-RU"),
    updatedAt: project.updatedAt ?? new Date().toLocaleDateString("ru-RU"),
  }));
}

export function normalizeParts(nextParts: ProcessPart[]): ProcessPart[] {
  return nextParts.map((part) => ({
    ...part,
    projectId: part.projectId ?? "project-r120",
    drawingNumber: part.drawingNumber ?? "",
    description: part.description ?? "",
    isDeleted: part.isDeleted ?? false,
    deletedAt: part.deletedAt ?? null,
    createdAt: part.createdAt ?? part.updatedAt ?? new Date().toLocaleDateString("ru-RU"),
    routeId: part.routeId ?? `local-route-${part.id}`,
    updatedAt: part.updatedAt ?? new Date().toLocaleDateString("ru-RU"),
  }));
}
