"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  cellName,
  countRequiredResources,
  emptyOperation,
  emptySetup,
  emptyToolPosition,
  hasManualResources,
  holderName,
  loadPartsFromStorage,
  loadOperationsFromStorage,
  loadProjectsFromStorage,
  machineName,
  nextOperationNo,
  saveOperationsToStorage,
  toolName,
  type OperationSetup,
  type OperationStatus,
  type ProcessOperation,
  type ProcessPart,
  type ProcessProject,
  type ResourceSource,
  type ToolPosition,
} from "../../../process-model";
import { holders, machines, machineCells, tools } from "../../../mock-data";
import { ResourceValue, StatusBadge } from "../../../ui";

type ProcessEditorProps = {
  partId: string;
  projectId?: string;
  initialPart?: ProcessPart;
};

const statuses: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Архив"];

export function ProcessEditor({ partId, projectId, initialPart }: ProcessEditorProps) {
  const [part, setPart] = useState<ProcessPart | undefined>(initialPart);
  const [project, setProject] = useState<ProcessProject | undefined>();
  const [operations, setOperations] = useState<ProcessOperation[]>([]);
  const [occupancyOperations, setOccupancyOperations] = useState<ProcessOperation[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<string>();
  const [selectedSetupId, setSelectedSetupId] = useState<string>();
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const nextPart = loadPartsFromStorage().find((item) => item.id === partId) ?? initialPart;
    setPart(nextPart);
    setProject(loadProjectsFromStorage().find((item) => item.id === (projectId ?? nextPart?.projectId)));
    const loaded = loadOperationsFromStorage(partId);
    setOperations(loaded);
    setSelectedOperationId(loaded[0]?.id);
    setSelectedSetupId(loaded[0]?.setups[0]?.id);
  }, [initialPart, partId, projectId]);

  useEffect(() => {
    const allParts = loadPartsFromStorage();
    const nextOperations = allParts.flatMap((item) => (item.id === partId ? operations : loadOperationsFromStorage(item.id)));
    setOccupancyOperations(nextOperations);
  }, [operations, partId]);

  const selectedOperation = useMemo(
    () => operations.find((operation) => operation.id === selectedOperationId) ?? operations[0],
    [operations, selectedOperationId],
  );
  const selectedSetup = selectedOperation?.setups.find((setup) => setup.id === selectedSetupId) ?? selectedOperation?.setups[0];

  function updateOperation(patch: Partial<ProcessOperation>) {
    if (!selectedOperation) return;
    setOperations((current) => current.map((operation) => (operation.id === selectedOperation.id ? { ...operation, ...patch } : operation)));
    setSavedMessage("");
  }

  function updateSetup(setupId: string, patch: Partial<OperationSetup>) {
    if (!selectedOperation) return;
    updateOperation({
      setups: selectedOperation.setups.map((setup) => (setup.id === setupId ? { ...setup, ...patch } : setup)),
    });
  }

  function addOperation() {
    const operation = emptyOperation(partId, nextOperationNo(operations));
    operation.setups = [emptySetup(1)];
    setOperations((current) => [...current, operation]);
    setSelectedOperationId(operation.id);
    setSelectedSetupId(operation.setups[0].id);
    setSavedMessage("");
  }

  function deleteOperation() {
    if (!selectedOperation) return;
    const next = operations.filter((operation) => operation.id !== selectedOperation.id);
    setOperations(next);
    setSelectedOperationId(next[0]?.id);
    setSelectedSetupId(next[0]?.setups[0]?.id);
    setSavedMessage("");
  }

  function duplicateOperation() {
    if (!selectedOperation) return;
    const operation = {
      ...structuredClone(selectedOperation),
      id: `operation-${Date.now()}`,
      operationNo: nextOperationNo(operations),
      number: nextOperationNo(operations),
      status: "Черновик" as OperationStatus,
      name: `${selectedOperation.name} копия`,
      title: `${selectedOperation.name} копия`,
    };
    setOperations((current) => [...current, operation]);
    setSelectedOperationId(operation.id);
    setSelectedSetupId(operation.setups[0]?.id);
    setSavedMessage("");
  }

  function addSetup() {
    if (!selectedOperation) return;
    const setupNo = selectedOperation.setups.reduce((max, setup) => Math.max(max, setup.setupNo), 0) + 1;
    const setup = emptySetup(setupNo);
    updateOperation({ setups: [...selectedOperation.setups, setup] });
    setSelectedSetupId(setup.id);
  }

  function deleteSetup(setupId: string) {
    if (!selectedOperation) return;
    const nextSetups = selectedOperation.setups.filter((setup) => setup.id !== setupId);
    updateOperation({ setups: nextSetups });
    setSelectedSetupId(nextSetups[0]?.id);
  }

  function duplicateSetup(setup: OperationSetup) {
    if (!selectedOperation) return;
    const setupNo = selectedOperation.setups.reduce((max, item) => Math.max(max, item.setupNo), 0) + 1;
    const nextSetup = { ...structuredClone(setup), id: `setup-${Date.now()}`, setupNo, name: `Установ ${setupNo}` };
    updateOperation({ setups: [...selectedOperation.setups, nextSetup] });
    setSelectedSetupId(nextSetup.id);
  }

  function saveProcess() {
    saveOperationsToStorage(partId, operations);
    setSavedMessage("Техпроцесс сохранён");
  }

  return (
    !part ? (
      <EmptyState text="Деталь не найдена." />
    ) : (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm text-slate-600">
        <a href="/projects" className="font-semibold text-blue-700">Проекты</a>
        <span>→</span>
        <a href={`/projects/${projectId ?? part.projectId}`} className="font-semibold text-blue-700">{project?.name ?? "Проект"}</a>
        <span>→</span>
        <a href={`/projects/${projectId ?? part.projectId}/parts/${part.id}`} className="font-semibold text-blue-700">{part.name}</a>
        <span>→</span>
        <span>Техпроцесс</span>
      </nav>
      <VisualRoute operations={operations} />
      <div className="grid min-h-[calc(100vh-260px)] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_280px]">
        <OperationList
          part={part}
          operations={operations}
          selectedOperationId={selectedOperation?.id}
          onSelect={(operation) => {
            setSelectedOperationId(operation.id);
            setSelectedSetupId(operation.setups[0]?.id);
          }}
          onAdd={addOperation}
        />

        <main className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Операция</h2>
              <p className="mt-1 text-sm text-slate-600">Описание операции и её установов.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={duplicateOperation} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Дублировать операцию</button>
              <button type="button" onClick={deleteOperation} className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">Удалить операцию</button>
            </div>
          </div>

          {selectedOperation ? (
            <>
              <OperationEditor operation={selectedOperation} onChange={updateOperation} />
              <SetupAccordion
                setups={selectedOperation.setups}
                operationId={selectedOperation.id}
                operationMachineLabel={machineLabel(selectedOperation)}
                operationMachineId={selectedOperation.machineId}
                occupancyOperations={occupancyOperations}
                openSetupId={selectedSetup?.id}
                onOpen={setSelectedSetupId}
                onAdd={addSetup}
                onChange={updateSetup}
                onDelete={deleteSetup}
                onDuplicate={duplicateSetup}
              />
            </>
          ) : (
            <EmptyState text="Добавьте первую операцию." />
          )}
        </main>

        <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Сохранение</h2>
              <p className="mt-1 text-sm text-slate-600">Изменения пишутся в localStorage.</p>
            </div>
            <button type="button" onClick={saveProcess} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Сохранить техпроцесс</button>
          </div>
          {savedMessage ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{savedMessage}</div> : null}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Операции, установы и инструментальные позиции редактируются в центральной рабочей области.
          </div>
        </aside>
      </div>
    </div>
    )
  );
}

function VisualRoute({ operations }: { operations: ProcessOperation[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">Визуальный маршрут</h2>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {operations.map((operation) => {
          const toolCount = operation.setups.reduce((count, setup) => count + setup.toolPositions.length, 0);
          const requiredCount = countRequiredResources(operation);
          const hasManual = hasManualResources(operation);
          const operationMachine = machineLabel(operation);

          return (
            <button key={operation.id} type="button" className="min-w-64 rounded-lg border border-blue-200 bg-blue-50 p-4 text-left">
              <div className="text-sm font-semibold text-blue-700">Операция {operation.operationNo}</div>
              <div className="mt-1 font-semibold text-slate-950">{operation.name}</div>
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <div>Установов: {operation.setups.length}</div>
                <div>Станок: {operationMachine || "Требуется подобрать"}</div>
                <div>Инструментальных позиций: {toolCount}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge status={operation.status} />
                {hasManual ? <SmallTag tone="amber">Есть заглушки</SmallTag> : null}
                {requiredCount ? <SmallTag tone="slate">Требует подбора</SmallTag> : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OperationList({ part, operations, selectedOperationId, onSelect, onAdd }: {
  part: ProcessPart;
  operations: ProcessOperation[];
  selectedOperationId?: string;
  onSelect: (operation: ProcessOperation) => void;
  onAdd: () => void;
}) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="border-b border-slate-100 pb-4">
        <div className="text-xs font-semibold uppercase text-blue-700">Деталь</div>
        <h1 className="mt-1 text-lg font-semibold text-slate-950">{part.name}</h1>
        <div className="mt-1 text-sm text-slate-600">{part.code} · {part.drawingNumber}</div>
      </div>
      <button type="button" onClick={onAdd} className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">+ Добавить операцию</button>
      <div className="mt-4 space-y-2">
        {operations.map((operation) => (
          <button key={operation.id} type="button" onClick={() => onSelect(operation)} className={`w-full rounded-md border px-3 py-2 text-left ${operation.id === selectedOperationId ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-blue-700">{operation.operationNo}</span>
              <StatusBadge status={operation.status} />
            </div>
            <div className="mt-1 text-sm text-slate-700">{operation.name}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function OperationEditor({ operation, onChange }: { operation: ProcessOperation; onChange: (patch: Partial<ProcessOperation>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Номер операции"><Input value={operation.operationNo} onChange={(value) => onChange({ operationNo: value, number: value })} /></Field>
        <Field label="Статус"><Select value={operation.status} options={statuses} onChange={(value) => onChange({ status: value as OperationStatus })} /></Field>
        <Field label="Название"><Input value={operation.name} onChange={(value) => onChange({ name: value, title: value })} /></Field>
        <Field label="Норма времени"><Input value={operation.timeNorm} onChange={(value) => onChange({ timeNorm: value })} /></Field>
        <Field label="Описание" wide><Textarea value={operation.description} onChange={(value) => onChange({ description: value })} rows={4} /></Field>
        <Field label="Комментарий" wide><Textarea value={operation.comment} onChange={(value) => onChange({ comment: value, technologistComment: value })} rows={3} /></Field>
      </div>
      <ResourceSelector label="Станок операции" source={operation.machineSource} catalogId={operation.machineId} manualText={operation.machineManualText} catalogItems={machines} getLabel={(item) => item.name} onChange={(value) => onChange({ machineSource: value.source, machineId: value.catalogId, machineManualText: value.manualText })} />
    </div>
  );
}

function SetupAccordion({ setups, operationId, operationMachineLabel, operationMachineId, occupancyOperations, openSetupId, onOpen, onAdd, onChange, onDelete, onDuplicate }: {
  setups: OperationSetup[];
  operationId: string;
  operationMachineLabel?: string;
  operationMachineId?: string;
  occupancyOperations: ProcessOperation[];
  openSetupId?: string;
  onOpen: (setupId: string) => void;
  onAdd: () => void;
  onChange: (setupId: string, patch: Partial<OperationSetup>) => void;
  onDelete: (setupId: string) => void;
  onDuplicate: (setup: OperationSetup) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">Установы</h3>
        <button type="button" onClick={onAdd} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">+ Добавить установ</button>
      </div>
      <div className="mt-3 space-y-3">
        {setups.map((setup) => (
          <details
            key={setup.id}
            open={setup.id === openSetupId}
            onToggle={(event) => {
              if (event.currentTarget.open) onOpen(setup.id);
            }}
            className="rounded-lg border border-slate-200 bg-white"
          >
            <summary className="cursor-pointer list-none p-4">
              <SetupSummary setup={setup} operationMachineLabel={operationMachineLabel} />
            </summary>
            <div className="border-t border-slate-100 p-4">
              <SetupEditor
                setup={setup}
                operationId={operationId}
                operationMachineId={operationMachineId}
                occupancyOperations={occupancyOperations}
                onChange={(patch) => onChange(setup.id, patch)}
                onDelete={() => onDelete(setup.id)}
                onDuplicate={() => onDuplicate(setup)}
              />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function SetupSummary({ setup, operationMachineLabel }: { setup: OperationSetup; operationMachineLabel?: string }) {
  const requiredCount = [setup.fixtureSource].filter((source) => source === "required").length
    + setup.toolPositions.reduce((count, position) => count + [position.cellSource, position.holderSource, position.toolSource].filter((source) => source === "required").length, 0);
  const hasManual = setup.fixtureSource === "manual" ||
    setup.toolPositions.some((position) => position.cellSource === "manual" || position.holderSource === "manual" || position.toolSource === "manual");

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-semibold text-blue-700">Установ {setup.setupNo}</span>
      <span className="font-semibold text-slate-950">{setup.name}</span>
      <span className="text-slate-600">Станок: {operationMachineLabel || "Требуется подобрать"}</span>
      <span className="text-slate-600">Позиции: {setup.toolPositions.length}</span>
      {hasManual ? <SmallTag tone="amber">Есть заглушки</SmallTag> : null}
      {requiredCount ? <SmallTag tone="slate">Требует подбора</SmallTag> : null}
    </div>
  );
}

function SetupEditor({ setup, operationId, operationMachineId, occupancyOperations, onChange, onDelete, onDuplicate }: {
  setup: OperationSetup;
  operationId: string;
  operationMachineId?: string;
  occupancyOperations: ProcessOperation[];
  onChange: (patch: Partial<OperationSetup>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  function updatePosition(positionId: string, patch: Partial<ToolPosition>) {
    onChange({ toolPositions: setup.toolPositions.map((position) => (position.id === positionId ? { ...position, ...patch } : position)) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDuplicate} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Дублировать установ</button>
        <button type="button" onClick={onDelete} className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">Удалить установ</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Номер установа"><Input value={String(setup.setupNo)} onChange={(value) => onChange({ setupNo: Number(value) || setup.setupNo })} /></Field>
        <Field label="Название"><Input value={setup.name} onChange={(value) => onChange({ name: value })} /></Field>
        <Field label="Описание" wide><Textarea value={setup.description} onChange={(value) => onChange({ description: value })} rows={3} /></Field>
      </div>
      <ResourceSelector label="Оснастка детали / приспособление" source={setup.fixtureSource} catalogId={setup.fixtureId} manualText={setup.fixtureManualText} catalogItems={holders} getLabel={(item) => item.name} onChange={(value) => onChange({ fixtureSource: value.source, fixtureId: value.catalogId, fixtureManualText: value.manualText })} />
      <Field label="Комментарий"><Textarea value={setup.comment} onChange={(value) => onChange({ comment: value })} rows={3} /></Field>
      <ToolPositionList
        positions={setup.toolPositions}
        operationId={operationId}
        setupId={setup.id}
        setupNo={setup.setupNo}
        machineId={operationMachineId}
        occupancyOperations={occupancyOperations}
        onAdd={() => onChange({ toolPositions: [...setup.toolPositions, emptyToolPosition(nextPositionNo(setup.toolPositions))] })}
        onDelete={(positionId) => onChange({ toolPositions: setup.toolPositions.filter((position) => position.id !== positionId) })}
        onDuplicate={(position) => onChange({ toolPositions: [...setup.toolPositions, { ...structuredClone(position), id: `position-${Date.now()}`, positionNo: nextPositionNo(setup.toolPositions) }] })}
        onChange={updatePosition}
      />
    </div>
  );
}

function ToolPositionList({ positions, operationId, setupId, setupNo, machineId, occupancyOperations, onAdd, onDelete, onDuplicate, onChange }: {
  positions: ToolPosition[];
  operationId: string;
  setupId: string;
  setupNo: number;
  machineId?: string;
  occupancyOperations: ProcessOperation[];
  onAdd: () => void;
  onDelete: (positionId: string) => void;
  onDuplicate: (position: ToolPosition) => void;
  onChange: (positionId: string, patch: Partial<ToolPosition>) => void;
}) {
  const [openPositionId, setOpenPositionId] = useState(positions[0]?.id);
  const [savedMessage, setSavedMessage] = useState("");
  const selectedPosition = positions.find((position) => position.id === openPositionId) ?? positions[0];

  useEffect(() => {
    if (!positions.length) {
      setOpenPositionId(undefined);
      return;
    }

    if (!openPositionId || !positions.some((position) => position.id === openPositionId)) {
      setOpenPositionId(positions[0].id);
    }
  }, [openPositionId, positions]);

  function handleAdd() {
    onAdd();
    setSavedMessage("");
  }

  function handleOpen(positionId: string) {
    setOpenPositionId(positionId);
    setSavedMessage("");
  }

  function handleDuplicate(position: ToolPosition) {
    onDuplicate(position);
    setSavedMessage("");
  }

  function handleDelete(positionId: string) {
    onDelete(positionId);
    setSavedMessage("");
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">Инструментальные позиции</h3>
        <button type="button" onClick={handleAdd} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">+ Добавить инструментальную позицию</button>
      </div>
      {positions.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">№</th>
                <th className="px-3 py-2">Ячейка</th>
                <th className="px-3 py-2">Оправка</th>
                <th className="px-3 py-2">Инструмент</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Метки</th>
                <th className="px-3 py-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {positions.map((position) => {
                const hasManual = [position.cellSource, position.holderSource, position.toolSource].includes("manual");
                const hasRequired = [position.cellSource, position.holderSource, position.toolSource].includes("required");
                const isOpen = position.id === selectedPosition?.id;

                return (
                  <tr key={position.id} onClick={() => handleOpen(position.id)} className={`${isOpen ? "bg-blue-50/70" : "bg-white"} cursor-pointer`}>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-blue-700">{position.positionNo}</td>
                    <td className="px-3 py-3 text-slate-700">{resourceDisplay(position.cellSource, position.cellId, position.cellManualText).value}</td>
                    <td className="px-3 py-3 text-slate-700">{resourceDisplay(position.holderSource, position.holderId, position.holderManualText).value}</td>
                    <td className="px-3 py-3 text-slate-700">{resourceDisplay(position.toolSource, position.toolId, position.toolManualText).value}</td>
                    <td className="px-3 py-3"><StatusBadge status={position.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {hasManual ? <SmallTag tone="amber">Ручная заглушка</SmallTag> : null}
                        {hasRequired ? <SmallTag tone="slate">Требует подбора</SmallTag> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleOpen(position.id); }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Открыть</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleDuplicate(position); }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Дублировать</button>
                        <button type="button" onClick={(event) => { event.stopPropagation(); handleDelete(position.id); }} className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700">Удалить</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Инструментальные позиции пока не добавлены." />
      )}
      <button type="button" onClick={handleAdd} className="mt-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700">+ Добавить инструментальную позицию</button>
      {selectedPosition ? (
        <ToolPositionEditor
          position={selectedPosition}
          operationId={operationId}
          setupId={setupId}
          setupNo={setupNo}
          machineId={machineId}
          occupancyOperations={occupancyOperations}
          savedMessage={savedMessage}
          onChange={(patch) => onChange(selectedPosition.id, patch)}
          onSave={() => setSavedMessage("Позиция сохранена в состоянии редактора")}
          onDuplicate={() => handleDuplicate(selectedPosition)}
          onDelete={() => handleDelete(selectedPosition.id)}
        />
      ) : null}
    </section>
  );
}

function ToolPositionEditor({ position, operationId, setupId, setupNo, machineId, occupancyOperations, savedMessage, onChange, onSave, onDuplicate, onDelete }: {
  position: ToolPosition;
  operationId: string;
  setupId: string;
  setupNo: number;
  machineId?: string;
  occupancyOperations: ProcessOperation[];
  savedMessage: string;
  onChange: (patch: Partial<ToolPosition>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const cellOptions = machineId ? machineCells.filter((cell) => cell.machineId === machineId) : [];
  const cellOccupancy = getCellOccupancy({
    machineId,
    cellId: position.cellSource === "catalog" ? position.cellId : undefined,
    operationId,
    setupId,
    positionId: position.id,
    operations: occupancyOperations,
  });
  const summary = [
    resourceDisplay(position.cellSource, position.cellId, position.cellManualText).value,
    resourceDisplay(position.holderSource, position.holderId, position.holderManualText).value,
    resourceDisplay(position.toolSource, position.toolId, position.toolManualText).value,
  ].join(" → ");

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="text-xs font-semibold uppercase text-blue-700">Редактор позиции</div>
          <h4 className="mt-1 text-lg font-semibold text-slate-950">Позиция {position.positionNo}</h4>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{summary}</div>
          <div className="mt-2"><StatusBadge status={position.status} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSave} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Сохранить</button>
          <button type="button" onClick={onDuplicate} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Дублировать позицию</button>
          <button type="button" onClick={onDelete} className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700">Удалить позицию</button>
        </div>
      </div>
      {savedMessage ? <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{savedMessage}</div> : null}

      <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h5 className="text-sm font-semibold text-slate-950">Основное</h5>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="№ позиции"><Input value={String(position.positionNo)} onChange={(value) => onChange({ positionNo: Number(value) || position.positionNo })} /></Field>
          <Field label="Количество"><Input value={String(position.quantity)} onChange={(value) => onChange({ quantity: Number(value) || 1 })} /></Field>
          <Field label="Статус"><Select value={position.status} options={statuses} onChange={(value) => onChange({ status: value as OperationStatus })} /></Field>
          <Field label="Комментарий"><Textarea value={position.comment} onChange={(value) => onChange({ comment: value })} rows={3} /></Field>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h5 className="text-sm font-semibold text-slate-950">Инструментальная связка</h5>
        <div className="mt-4 space-y-4">
          <div>
            {!machineId ? <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Сначала выберите станок операции или используйте ручной ввод ячейки.</div> : null}
            <ResourceSelector
              label="Ячейка станка"
              source={position.cellSource}
              catalogId={position.cellId}
              manualText={position.cellManualText}
              catalogItems={cellOptions}
              getLabel={(item) => item.label}
              getOptionLabel={(item) => cellOptionLabel(item.id, operationId, setupId, position.id, occupancyOperations)}
              onChange={(value) => onChange({ cellSource: value.source, cellId: value.catalogId, cellManualText: value.manualText })}
            />
            {cellOccupancy ? (
              <div className={`mt-2 rounded-md border px-3 py-2 text-sm font-semibold ${cellOccupancy.sameOperation ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
                {cellOccupancy.sameOperation
                  ? `${cellOccupancy.cellLabel} уже занята: Операция ${cellOccupancy.operationNo} / Установ ${cellOccupancy.setupNo} / Инструмент: ${cellOccupancy.toolLabel}`
                  : `${cellOccupancy.cellLabel} используется в другой операции на этом станке: Операция ${cellOccupancy.operationNo} / Установ ${cellOccupancy.setupNo} / Инструмент: ${cellOccupancy.toolLabel}`}
              </div>
            ) : null}
          </div>
          <ResourceSelector label="Оправка инструмента" source={position.holderSource} catalogId={position.holderId} manualText={position.holderManualText} catalogItems={holders} getLabel={(item) => item.name} onChange={(value) => onChange({ holderSource: value.source, holderId: value.catalogId, holderManualText: value.manualText })} />
          <ResourceSelector label="Инструмент" source={position.toolSource} catalogId={position.toolId} manualText={position.toolManualText} catalogItems={tools} getLabel={(item) => item.name} onChange={(value) => onChange({ toolSource: value.source, toolId: value.catalogId, toolManualText: value.manualText })} />
        </div>
      </section>
    </div>
  );
}

function ResourceSelector<T extends { id: string }>({ label, source, catalogId, manualText, catalogItems, getLabel, getOptionLabel, onChange }: {
  label: string;
  source: ResourceSource;
  catalogId?: string;
  manualText?: string;
  catalogItems: T[];
  getLabel: (item: T) => string;
  getOptionLabel?: (item: T) => string;
  onChange: (value: { source: ResourceSource; catalogId?: string; manualText?: string }) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <div className="text-sm font-semibold text-slate-950">{label}</div>
        <div className="mt-2 text-sm text-slate-700">
          <ResourceValue resource={resourceDisplay(source, catalogId, manualText)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 rounded-md bg-slate-100 p-1">
        {[
          ["catalog", "Из справочника"],
          ["manual", "Ручной ввод"],
          ["required", "Требуется подобрать"],
        ].map(([nextSource, text]) => (
          <button key={nextSource} type="button" onClick={() => onChange({ source: nextSource as ResourceSource })} className={`min-w-0 flex-1 rounded px-2 py-2 text-xs font-semibold transition sm:flex-none ${source === nextSource ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}>{text}</button>
        ))}
      </div>
      {source === "catalog" ? (
        <select value={catalogId ?? ""} onChange={(event) => onChange({ source: "catalog", catalogId: event.target.value || undefined })} className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Выбрать из справочника</option>
          {catalogItems.map((item) => <option key={item.id} value={item.id}>{getOptionLabel ? getOptionLabel(item) : getLabel(item)}</option>)}
        </select>
      ) : null}
      {source === "manual" ? (
        <div className="mt-3 space-y-2">
          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Ручная заглушка</span>
          <textarea value={manualText ?? ""} onChange={(event) => onChange({ source: "manual", manualText: event.target.value })} rows={2} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
        </div>
      ) : null}
      {source === "required" ? <div className="mt-3 inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">Требуется подбор</div> : null}
    </div>
  );
}

type CellOccupancy = {
  cellLabel: string;
  operationId: string;
  operationNo: string;
  setupNo: number;
  toolLabel: string;
  sameOperation: boolean;
};

function getCellOccupancy({ machineId, cellId, operationId, setupId, positionId, operations }: {
  machineId?: string;
  cellId?: string;
  operationId: string;
  setupId: string;
  positionId: string;
  operations: ProcessOperation[];
}): CellOccupancy | undefined {
  if (!machineId || !cellId) return undefined;

  for (const operation of operations) {
    if (operation.machineSource !== "catalog" || operation.machineId !== machineId) continue;

    for (const setup of operation.setups) {
      for (const position of setup.toolPositions) {
        const isSamePosition = operation.id === operationId && setup.id === setupId && position.id === positionId;
        if (isSamePosition || position.cellSource !== "catalog" || position.cellId !== cellId) continue;

        return {
          cellLabel: cellName(cellId) ?? "Ячейка",
          operationId: operation.id,
          operationNo: operation.operationNo,
          setupNo: setup.setupNo,
          toolLabel: resourceDisplay(position.toolSource, position.toolId, position.toolManualText).value,
          sameOperation: operation.id === operationId,
        };
      }
    }
  }

  return undefined;
}

function cellOptionLabel(cellId: string, operationId: string, setupId: string, positionId: string, operations: ProcessOperation[]) {
  const cell = machineCells.find((item) => item.id === cellId);
  const occupancy = getCellOccupancy({
    machineId: cell?.machineId,
    cellId,
    operationId,
    setupId,
    positionId,
    operations,
  });

  if (!cell) return "Ячейка не найдена";
  if (!occupancy) return `${cell.number} — свободна`;

  return `${cell.number} — занята (Опер. ${occupancy.operationNo}, ${occupancy.toolLabel})`;
}

function resourceDisplay(source: ResourceSource, catalogId?: string, manualText?: string) {
  if (source === "manual") return { source, value: manualText || "Ручная заглушка" };
  if (source === "required") return { source, value: "Требуется подобрать" };
  return { source, value: machineName(catalogId) ?? cellName(catalogId) ?? holderName(catalogId) ?? toolName(catalogId) ?? "Не выбрано" };
}

function machineLabel(operation: ProcessOperation) {
  if (operation.machineSource === "catalog") return machineName(operation.machineId);
  if (operation.machineSource === "manual") return operation.machineManualText;
  return undefined;
}

function nextPositionNo(positions: ToolPosition[]) {
  return positions.reduce((max, position) => Math.max(max, position.positionNo), 0) + 1;
}

function SmallTag({ tone, children }: { tone: "amber" | "slate"; children: ReactNode }) {
  const className = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-100 text-slate-600";
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "md:col-span-2" : ""}><div className="mb-1 text-sm font-semibold text-slate-700">{label}</div>{children}</label>;
}

function Input({ value, onChange, placeholder }: { value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />;
}

function Textarea({ value, onChange, rows }: { value: string; rows: number; onChange: (value: string) => void }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />;
}

function Select({ value, options, getLabel, onChange }: { value: string; options: string[]; getLabel?: (value: string) => string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">{options.map((option) => <option key={option} value={option}>{getLabel ? getLabel(option) : option}</option>)}</select>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-600">{text}</div>;
}
