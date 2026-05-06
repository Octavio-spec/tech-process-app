export type OperationStatus = "Черновик" | "В работе" | "Требует уточнения" | "Готово" | "Архив";
export type ResourceSource = "catalog" | "manual" | "required";

export type Project = {
  id: string;
  code: string;
  name: string;
  customer?: string;
  description?: string;
  status: OperationStatus;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Part = {
  id: string;
  projectId: string;
  code: string;
  name: string;
  drawingNumber?: string;
  description?: string;
  status: OperationStatus;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdAt: string;
  routeId: string;
  updatedAt: string;
};

export type Route = {
  id: string;
  partId: string;
  name: string;
  operationIds: string[];
};

export type Operation = {
  id: string;
  routeId: string;
  partId: string;
  number: string;
  operationNo: string;
  title: string;
  name: string;
  description: string;
  timeNorm: string;
  comment: string;
  technologistComment: string;
  status: OperationStatus;
  machineSource: ResourceSource;
  machineId?: string;
  machineManualText?: string;
  resourceId: string;
  setups: OperationSetup[];
};

export type OperationSetup = {
  id: string;
  setupNo: number;
  name: string;
  description: string;
  fixtureSource: ResourceSource;
  fixtureId?: string;
  fixtureManualText?: string;
  comment: string;
  toolPositions: ToolPosition[];
};

export type ToolPosition = {
  id: string;
  positionNo: number;
  cellSource: ResourceSource;
  cellId?: string;
  cellManualText?: string;
  holderSource: ResourceSource;
  holderId?: string;
  holderManualText?: string;
  toolSource: ResourceSource;
  toolId?: string;
  toolManualText?: string;
  quantity: number;
  comment: string;
  status: OperationStatus;
};

export type Machine = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

export type MachineCell = {
  id: string;
  machineId: string;
  number: number;
  label: string;
  status: "занята" | "резерв" | "пустая" | "требует уточнения";
};

export type Holder = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

export type Tool = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

export type ManualPlaceholder = {
  id: string;
  resourceType: "machine" | "holder" | "tool";
  text: string;
  status: "draft" | "needs_catalog_entry" | "converted_to_catalog" | "rejected";
};

export type ResourceRef = {
  source: ResourceSource;
  catalogId?: string;
  manualPlaceholderId?: string;
};

export type OperationResource = {
  id: string;
  operationId: string;
  machine: ResourceRef;
  machineCell: ResourceRef;
  holder: ResourceRef;
  tool: ResourceRef;
};

export type DisplayResource = {
  source: ResourceSource;
  value: string;
};

export type MachineMagazineCell = {
  id: string;
  number: number;
  label: string;
  status: MachineCell["status"];
  operation?: Operation;
  setupNo?: number;
  holder: DisplayResource;
  tool: DisplayResource;
  comment: string;
};

export const projects: Project[] = [
  {
    id: "project-r120",
    code: "PRJ-R120",
    name: "Редуктор Р-120",
    customer: "ООО Привод",
    description: "Комплект деталей редуктора для запуска технологической подготовки.",
    status: "В работе",
    isDeleted: false,
    deletedAt: null,
    createdAt: "01.05.2026",
    updatedAt: "06.05.2026",
  },
  {
    id: "project-drive",
    code: "PRJ-DRV",
    name: "Приводная группа",
    customer: "Завод Механика",
    description: "Детали приводного узла и кронштейнов.",
    status: "Черновик",
    isDeleted: false,
    deletedAt: null,
    createdAt: "02.05.2026",
    updatedAt: "05.05.2026",
  },
  {
    id: "project-archive",
    code: "PRJ-ARCH",
    name: "Архивная оснастка",
    customer: "Внутренний проект",
    description: "Архивные детали для проверки сценариев восстановления.",
    status: "Архив",
    isDeleted: false,
    deletedAt: null,
    createdAt: "20.04.2026",
    updatedAt: "30.04.2026",
  },
  {
    id: "project-deleted",
    code: "PRJ-DEL",
    name: "Удалённый проект",
    customer: "Тестовый заказчик",
    description: "Проект скрыт через soft delete для проверки восстановления.",
    status: "Черновик",
    isDeleted: true,
    deletedAt: "04.05.2026",
    createdAt: "03.05.2026",
    updatedAt: "04.05.2026",
  },
];

export const parts: Part[] = [
  {
    id: "tp-001",
    projectId: "project-r120",
    code: "ТП-001",
    name: "Корпус редуктора",
    drawingNumber: "КР-00.001",
    description: "Корпусная деталь для отработки маршрута механической обработки.",
    status: "В работе",
    isDeleted: false,
    deletedAt: null,
    createdAt: "01.05.2026",
    routeId: "route-tp-001",
    updatedAt: "06.05.2026",
  },
  {
    id: "tp-002",
    projectId: "project-drive",
    code: "ТП-002",
    name: "Кронштейн привода",
    drawingNumber: "КП-14.020",
    description: "Кронштейн с фрезерной обработкой плоскостей и отверстий.",
    status: "Черновик",
    isDeleted: false,
    deletedAt: null,
    createdAt: "02.05.2026",
    routeId: "route-tp-002",
    updatedAt: "05.05.2026",
  },
  {
    id: "tp-003",
    projectId: "project-archive",
    code: "ТП-003",
    name: "Плита установочная",
    drawingNumber: "ПУ-77.100",
    description: "Архивная установочная плита.",
    status: "Архив",
    isDeleted: false,
    deletedAt: null,
    createdAt: "20.04.2026",
    routeId: "route-tp-003",
    updatedAt: "30.04.2026",
  },
];

export const routes: Route[] = [
  {
    id: "route-tp-001",
    partId: "tp-001",
    name: "Маршрут механической обработки корпуса",
    operationIds: ["op-tp-001-010", "op-tp-001-020", "op-tp-001-030", "op-tp-001-040"],
  },
  {
    id: "route-tp-002",
    partId: "tp-002",
    name: "Маршрут фрезерной обработки кронштейна",
    operationIds: ["op-tp-002-010", "op-tp-002-020", "op-tp-002-030"],
  },
  {
    id: "route-tp-003",
    partId: "tp-003",
    name: "Архивный маршрут обработки плиты",
    operationIds: ["op-tp-003-010", "op-tp-003-020", "op-tp-003-030", "op-tp-003-040"],
  },
];

export const operations: Operation[] = [
  {
    id: "op-tp-001-010",
    routeId: "route-tp-001",
    partId: "tp-001",
    number: "010",
    operationNo: "010",
    title: "Черновое фрезерование баз",
    name: "Черновое фрезерование баз",
    description: "Снять припуск по базовым плоскостям и подготовить корпус к сверлению.",
    timeNorm: "00:30",
    comment: "Проверить вылет оправки перед запуском первой детали.",
    technologistComment: "Проверить вылет оправки перед запуском первой детали.",
    status: "В работе",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-001-010",
    setups: [],
  },
  {
    id: "op-tp-001-020",
    routeId: "route-tp-001",
    partId: "tp-001",
    number: "020",
    operationNo: "020",
    title: "Сверление крепёжных отверстий",
    name: "Сверление крепёжных отверстий",
    description: "Просверлить крепёжные отверстия по карте операции.",
    timeNorm: "00:20",
    comment: "Использовать СОЖ, контроль диаметра после первой детали.",
    technologistComment: "Использовать СОЖ, контроль диаметра после первой детали.",
    status: "Готово",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-001-020",
    setups: [],
  },
  {
    id: "op-tp-001-030",
    routeId: "route-tp-001",
    partId: "tp-001",
    number: "030",
    operationNo: "030",
    title: "Черновая обработка кармана",
    name: "Черновая обработка кармана",
    description: "Черновая выборка кармана с ручной заглушкой по станку и инструменту.",
    timeNorm: "00:45",
    comment: "Нужно завести аналоги в справочник после подтверждения технологом.",
    technologistComment: "Нужно завести аналоги в справочник после подтверждения технологом.",
    status: "Требует уточнения",
    machineSource: "manual",
    machineManualText: "любой вертикально-фрезерный с СОЖ",
    resourceId: "res-tp-001-030",
    setups: [],
  },
  {
    id: "op-tp-001-040",
    routeId: "route-tp-001",
    partId: "tp-001",
    number: "040",
    operationNo: "040",
    title: "Чистовое фрезерование контура",
    name: "Чистовое фрезерование контура",
    description: "Чистовая обработка наружного контура корпуса.",
    timeNorm: "00:35",
    comment: "Оснастку требуется подобрать после уточнения партии.",
    technologistComment: "Оснастку требуется подобрать после уточнения партии.",
    status: "Черновик",
    machineSource: "catalog",
    machineId: "machine-5x",
    resourceId: "res-tp-001-040",
    setups: [],
  },
  {
    id: "op-tp-002-010",
    routeId: "route-tp-002",
    partId: "tp-002",
    number: "010",
    operationNo: "010",
    title: "Фрезерование плоскости",
    name: "Фрезерование плоскости",
    description: "Подготовить базовую плоскость кронштейна.",
    timeNorm: "00:25",
    comment: "Обычный режим обработки.",
    technologistComment: "Обычный режим обработки.",
    status: "Черновик",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-002-010",
    setups: [],
  },
  {
    id: "op-tp-002-020",
    routeId: "route-tp-002",
    partId: "tp-002",
    number: "020",
    operationNo: "020",
    title: "Сверление",
    name: "Сверление",
    description: "Сверление монтажных отверстий.",
    timeNorm: "00:15",
    comment: "Проверить наличие сверла в магазине.",
    technologistComment: "Проверить наличие сверла в магазине.",
    status: "Черновик",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-002-020",
    setups: [],
  },
  {
    id: "op-tp-002-030",
    routeId: "route-tp-002",
    partId: "tp-002",
    number: "030",
    operationNo: "030",
    title: "Снятие фасок",
    name: "Снятие фасок",
    description: "Снять фаски по контуру и отверстиям.",
    timeNorm: "00:10",
    comment: "Инструмент будет уточнён позже.",
    technologistComment: "Инструмент будет уточнён позже.",
    status: "Черновик",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-002-030",
    setups: [],
  },
  {
    id: "op-tp-003-010",
    routeId: "route-tp-003",
    partId: "tp-003",
    number: "010",
    operationNo: "010",
    title: "Архивная операция 010",
    name: "Архивная операция 010",
    description: "Архивный пример операции.",
    timeNorm: "00:10",
    comment: "Не используется в текущем MVP.",
    technologistComment: "Не используется в текущем MVP.",
    status: "Архив",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-003-010",
    setups: [],
  },
  {
    id: "op-tp-003-020",
    routeId: "route-tp-003",
    partId: "tp-003",
    number: "020",
    operationNo: "020",
    title: "Архивная операция 020",
    name: "Архивная операция 020",
    description: "Архивный пример операции.",
    timeNorm: "00:10",
    comment: "Не используется в текущем MVP.",
    technologistComment: "Не используется в текущем MVP.",
    status: "Архив",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-003-020",
    setups: [],
  },
  {
    id: "op-tp-003-030",
    routeId: "route-tp-003",
    partId: "tp-003",
    number: "030",
    operationNo: "030",
    title: "Архивная операция 030",
    name: "Архивная операция 030",
    description: "Архивный пример операции.",
    timeNorm: "00:10",
    comment: "Не используется в текущем MVP.",
    technologistComment: "Не используется в текущем MVP.",
    status: "Архив",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-003-030",
    setups: [],
  },
  {
    id: "op-tp-003-040",
    routeId: "route-tp-003",
    partId: "tp-003",
    number: "040",
    operationNo: "040",
    title: "Архивная операция 040",
    name: "Архивная операция 040",
    description: "Архивный пример операции.",
    timeNorm: "00:10",
    comment: "Не используется в текущем MVP.",
    technologistComment: "Не используется в текущем MVP.",
    status: "Архив",
    machineSource: "catalog",
    machineId: "machine-vmc-850",
    resourceId: "res-tp-003-040",
    setups: [],
  },
];

export const machines: Machine[] = [
  { id: "machine-vmc-850", code: "M-500", name: "Вертикально-фрезерный VMC-850", type: "Вертикально-фрезерный обрабатывающий центр", status: "Доступен" },
  { id: "machine-nlx-2500", code: "M-620", name: "Токарный с ЧПУ NLX-2500", type: "Токарный станок с ЧПУ", status: "Доступен" },
  { id: "machine-5x", code: "M-710", name: "Пятиосевой обрабатывающий центр", type: "Пятиосевой фрезерный центр", status: "Резерв" },
];

export const machineCells: MachineCell[] = [
  { id: "cell-vmc-1", machineId: "machine-vmc-850", number: 1, label: "Ячейка 1", status: "занята" },
  { id: "cell-vmc-2", machineId: "machine-vmc-850", number: 2, label: "Ячейка 2", status: "занята" },
  { id: "cell-vmc-3", machineId: "machine-vmc-850", number: 3, label: "Ячейка 3", status: "занята" },
  { id: "cell-vmc-4", machineId: "machine-vmc-850", number: 4, label: "Ячейка 4", status: "занята" },
  { id: "cell-vmc-5", machineId: "machine-vmc-850", number: 5, label: "Ячейка 5", status: "требует уточнения" },
  { id: "cell-vmc-6", machineId: "machine-vmc-850", number: 6, label: "Ячейка 6", status: "резерв" },
  { id: "cell-vmc-7", machineId: "machine-vmc-850", number: 7, label: "Ячейка 7", status: "пустая" },
  { id: "cell-vmc-8", machineId: "machine-vmc-850", number: 8, label: "Ячейка 8", status: "пустая" },
  { id: "cell-vmc-9", machineId: "machine-vmc-850", number: 9, label: "Ячейка 9", status: "пустая" },
  { id: "cell-vmc-10", machineId: "machine-vmc-850", number: 10, label: "Ячейка 10", status: "пустая" },
  { id: "cell-vmc-11", machineId: "machine-vmc-850", number: 11, label: "Ячейка 11", status: "пустая" },
  { id: "cell-vmc-12", machineId: "machine-vmc-850", number: 12, label: "Ячейка 12", status: "резерв" },
  { id: "cell-5x-1", machineId: "machine-5x", number: 1, label: "Ячейка 1", status: "пустая" },
  { id: "cell-5x-2", machineId: "machine-5x", number: 2, label: "Ячейка 2", status: "пустая" },
  { id: "cell-5x-3", machineId: "machine-5x", number: 3, label: "Ячейка 3", status: "пустая" },
  { id: "cell-5x-4", machineId: "machine-5x", number: 4, label: "Ячейка 4", status: "пустая" },
  { id: "cell-5x-5", machineId: "machine-5x", number: 5, label: "Ячейка 5", status: "резерв" },
  { id: "cell-5x-6", machineId: "machine-5x", number: 6, label: "Ячейка 6", status: "пустая" },
  { id: "cell-5x-7", machineId: "machine-5x", number: 7, label: "Ячейка 7", status: "занята" },
  { id: "cell-5x-8", machineId: "machine-5x", number: 8, label: "Ячейка 8", status: "пустая" },
  { id: "cell-5x-9", machineId: "machine-5x", number: 9, label: "Ячейка 9", status: "пустая" },
  { id: "cell-5x-10", machineId: "machine-5x", number: 10, label: "Ячейка 10", status: "пустая" },
  { id: "cell-5x-11", machineId: "machine-5x", number: 11, label: "Ячейка 11", status: "пустая" },
  { id: "cell-5x-12", machineId: "machine-5x", number: 12, label: "Ячейка 12", status: "резерв" },
];

export const holders: Holder[] = [
  { id: "holder-hsk63-120", code: "H-HSK63-120", name: "Оправка HSK63A, вылет 120 мм", type: "Фрезерная", status: "В справочнике" },
  { id: "holder-bt40-080", code: "H-BT40-080", name: "Патрон BT40, вылет 80 мм", type: "Фрезерная", status: "В справочнике" },
];

export const tools: Tool[] = [
  { id: "tool-end-16", code: "T-END-16", name: "Фреза концевая Ø16, 4 зуба", type: "Фреза", status: "В справочнике" },
  { id: "tool-drl-085", code: "T-DRL-08", name: "Сверло Ø8.5 твердосплавное", type: "Сверло", status: "В справочнике" },
  { id: "tool-chamfer", code: "T-CH-02", name: "Фасочная фреза 90°", type: "Фреза", status: "В справочнике" },
];

export const manualPlaceholders: ManualPlaceholder[] = [
  {
    id: "manual-machine-vmc-coolant",
    resourceType: "machine",
    text: "любой вертикально-фрезерный с СОЖ",
    status: "needs_catalog_entry",
  },
  {
    id: "manual-holder-hsk63-long",
    resourceType: "holder",
    text: "подобрать длинную оправку HSK63A, вылет около 120 мм",
    status: "needs_catalog_entry",
  },
  {
    id: "manual-tool-rough-16",
    resourceType: "tool",
    text: "черновая фреза Ø16, 4 зуба, аналога в базе нет",
    status: "draft",
  },
];

export const operationResources: OperationResource[] = [
  {
    id: "res-tp-001-010",
    operationId: "op-tp-001-010",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "catalog", catalogId: "cell-vmc-1" },
    holder: { source: "catalog", catalogId: "holder-hsk63-120" },
    tool: { source: "catalog", catalogId: "tool-end-16" },
  },
  {
    id: "res-tp-001-020",
    operationId: "op-tp-001-020",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "catalog", catalogId: "cell-vmc-2" },
    holder: { source: "catalog", catalogId: "holder-bt40-080" },
    tool: { source: "catalog", catalogId: "tool-drl-085" },
  },
  {
    id: "res-tp-001-030",
    operationId: "op-tp-001-030",
    machine: { source: "manual", manualPlaceholderId: "manual-machine-vmc-coolant" },
    machineCell: { source: "required" },
    holder: { source: "manual", manualPlaceholderId: "manual-holder-hsk63-long" },
    tool: { source: "manual", manualPlaceholderId: "manual-tool-rough-16" },
  },
  {
    id: "res-tp-001-040",
    operationId: "op-tp-001-040",
    machine: { source: "catalog", catalogId: "machine-5x" },
    machineCell: { source: "catalog", catalogId: "cell-5x-7" },
    holder: { source: "required" },
    tool: { source: "catalog", catalogId: "tool-end-16" },
  },
  {
    id: "res-tp-002-010",
    operationId: "op-tp-002-010",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "catalog", catalogId: "cell-vmc-3" },
    holder: { source: "catalog", catalogId: "holder-bt40-080" },
    tool: { source: "catalog", catalogId: "tool-end-16" },
  },
  {
    id: "res-tp-002-020",
    operationId: "op-tp-002-020",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "catalog", catalogId: "cell-vmc-4" },
    holder: { source: "catalog", catalogId: "holder-bt40-080" },
    tool: { source: "catalog", catalogId: "tool-drl-085" },
  },
  {
    id: "res-tp-002-030",
    operationId: "op-tp-002-030",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "catalog", catalogId: "cell-vmc-5" },
    holder: { source: "catalog", catalogId: "holder-bt40-080" },
    tool: { source: "manual", manualPlaceholderId: "manual-tool-rough-16" },
  },
  {
    id: "res-tp-003-010",
    operationId: "op-tp-003-010",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "required" },
    holder: { source: "required" },
    tool: { source: "required" },
  },
  {
    id: "res-tp-003-020",
    operationId: "op-tp-003-020",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "required" },
    holder: { source: "required" },
    tool: { source: "required" },
  },
  {
    id: "res-tp-003-030",
    operationId: "op-tp-003-030",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "required" },
    holder: { source: "required" },
    tool: { source: "required" },
  },
  {
    id: "res-tp-003-040",
    operationId: "op-tp-003-040",
    machine: { source: "catalog", catalogId: "machine-vmc-850" },
    machineCell: { source: "required" },
    holder: { source: "required" },
    tool: { source: "required" },
  },
];

export function getRouteByPartId(partId: string) {
  return routes.find((route) => route.partId === partId);
}

export function getOperationsByRouteId(routeId: string) {
  const route = routes.find((item) => item.id === routeId);

  if (!route) {
    return [];
  }

  return route.operationIds
    .map((operationId) => operations.find((operation) => operation.id === operationId))
    .filter((operation): operation is Operation => Boolean(operation));
}

export function getOperationResource(operationId: string) {
  return operationResources.find((resource) => resource.operationId === operationId);
}

export function getPartByOperationId(operationId: string) {
  const operation = operations.find((item) => item.id === operationId);
  const route = operation ? routes.find((item) => item.id === operation.routeId) : undefined;

  return route ? parts.find((part) => part.id === route.partId) : undefined;
}

export function resolveResourceValue(resourceRef: ResourceRef | undefined, resourceType: "machine" | "machineCell" | "holder" | "tool"): DisplayResource {
  if (!resourceRef || resourceRef.source === "required") {
    return { source: "required", value: "Требуется подобрать" };
  }

  if (resourceRef.source === "manual") {
    const placeholder = manualPlaceholders.find((item) => item.id === resourceRef.manualPlaceholderId);
    return { source: "manual", value: placeholder?.text ?? "Ручная заглушка" };
  }

  if (resourceType === "machine") {
    const machine = machines.find((item) => item.id === resourceRef.catalogId);
    return { source: "catalog", value: machine?.name ?? "Станок не найден" };
  }

  if (resourceType === "machineCell") {
    const cell = machineCells.find((item) => item.id === resourceRef.catalogId);
    return { source: "catalog", value: cell?.label ?? "Ячейка не найдена" };
  }

  if (resourceType === "holder") {
    const holder = holders.find((item) => item.id === resourceRef.catalogId);
    return { source: "catalog", value: holder?.name ?? "Оснастка не найдена" };
  }

  const tool = tools.find((item) => item.id === resourceRef.catalogId);
  return { source: "catalog", value: tool?.name ?? "Инструмент не найден" };
}

export function getMagazineCellsByMachineId(machineId: string): MachineMagazineCell[] {
  return machineCells
    .filter((cell) => cell.machineId === machineId)
    .sort((a, b) => a.number - b.number)
    .map((cell) => {
      const resource = operationResources.find(
        (item) => item.machineCell.source === "catalog" && item.machineCell.catalogId === cell.id,
      );
      const operation = resource ? operations.find((item) => item.id === resource.operationId) : undefined;
      const hasNonCatalogResource = resource
        ? [resource.holder, resource.tool].some((item) => item.source !== "catalog")
        : false;

      return {
        id: cell.id,
        number: cell.number,
        label: cell.label,
        status: operation && hasNonCatalogResource ? "требует уточнения" : cell.status,
        operation,
        setupNo: operation ? 1 : undefined,
        holder: resolveResourceValue(resource?.holder, "holder"),
        tool: resolveResourceValue(resource?.tool, "tool"),
        comment: operation?.technologistComment ?? "Ячейка свободна для назначения.",
      };
    });
}
