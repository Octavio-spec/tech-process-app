"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import {
  cellName,
  createId,
  emptyOperation,
  emptySetup,
  emptyToolPosition,
  holderName,
  loadOperationsFromStorage,
  loadPartsFromStorage,
  loadProjectsFromStorage,
  machineName,
  nextOperationNo,
  saveOperationsToStorage,
  savePartsToStorage,
  saveProjectsToStorage,
  sortOperationsByNumber,
  toolName,
  type OperationSetup,
  type OperationStatus,
  type ProcessOperation,
  type ProcessPart,
  type ProcessProject,
  type ResourceSource,
  type ToolPosition,
} from "../../../process-model";
import { holders, machineCells, machines, tools } from "../../../mock-data";
import { PageHeader, StatusBadge } from "../../../ui";

type FlowBlockType = "project" | "part" | "operation" | "setup" | "tool_position" | "unknown";

type FlowEntity = ProcessProject | ProcessPart | ProcessOperation | OperationSetup | ToolPosition | Record<string, never>;

type FlowNodeData = {
  blockType: FlowBlockType;
  title: string;
  subtitle?: string;
  entity: FlowEntity;
};

type ProcessFlowNode = Node<FlowNodeData, "processBlock">;
type ProcessFlowEdge = Edge;
type FlowSnapshot = { nodes: ProcessFlowNode[]; edges: ProcessFlowEdge[] };

const flowTypeLabels: Record<FlowBlockType, string> = {
  project: "Проект",
  part: "Деталь",
  operation: "Операция",
  setup: "Установ",
  tool_position: "Инструментальная позиция",
  unknown: "Блок",
};

const childTypeByParent: Partial<Record<FlowBlockType, FlowBlockType>> = {
  project: "part",
  part: "operation",
  operation: "setup",
  setup: "tool_position",
};

const statusOptions: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Архив"];
const sourceOptions: Array<{ value: ResourceSource; label: string }> = [
  { value: "catalog", label: "Из справочника" },
  { value: "manual", label: "Ручной ввод" },
  { value: "required", label: "Требуется подобрать" },
];

export function FlowEditor({ partId, projectId, initialPart }: { partId: string; projectId?: string; initialPart?: ProcessPart }) {
  const [part, setPart] = useState<ProcessPart | undefined>(initialPart);
  const [project, setProject] = useState<ProcessProject | undefined>();
  const [operations, setOperations] = useState<ProcessOperation[]>([]);
  const [nodes, setNodes] = useState<ProcessFlowNode[]>([]);
  const [edges, setEdges] = useState<ProcessFlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [past, setPast] = useState<FlowSnapshot[]>([]);
  const [future, setFuture] = useState<FlowSnapshot[]>([]);

  const storageKey = `tech-process:flow:${partId}`;
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId), [nodes, selectedNodeId]);

  const commit = useCallback((nextNodes: ProcessFlowNode[], nextEdges: ProcessFlowEdge[]) => {
    setPast((items) => [...items.slice(-20), { nodes, edges }]);
    setFuture([]);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setDirty(true);
    setMessage("");
  }, [edges, nodes]);

  useEffect(() => {
    const loadedParts = loadPartsFromStorage();
    const loadedProjects = loadProjectsFromStorage();
    const nextPart = loadedParts.find((item) => item.id === partId) ?? initialPart;
    const nextProject = loadedProjects.find((item) => item.id === (projectId ?? nextPart?.projectId));
    const nextOperations = sortOperationsByNumber(loadOperationsFromStorage(partId));

    setPart(nextPart);
    setProject(nextProject);
    setOperations(nextOperations);

    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as FlowSnapshot;
        setNodes(parsed.nodes ?? []);
        setEdges(parsed.edges ?? []);
        setSelectedNodeId(parsed.nodes?.[0]?.id ?? null);
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    const initial = buildInitialFlow(nextProject, nextPart, nextOperations);
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedNodeId(initial.nodes[0]?.id ?? null);
  }, [initialPart, partId, projectId, storageKey]);

  useEffect(() => {
    function addChild(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      setSelectedNodeId(id);
      addBlock(id);
    }

    function deleteNode(event: Event) {
      deleteBlock((event as CustomEvent<string>).detail);
    }

    window.addEventListener("tech-flow:add-child", addChild);
    window.addEventListener("tech-flow:delete-node", deleteNode);
    return () => {
      window.removeEventListener("tech-flow:add-child", addChild);
      window.removeEventListener("tech-flow:delete-node", deleteNode);
    };
  });

  function onNodesChange(changes: NodeChange<ProcessFlowNode>[]) {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
    setDirty(true);
  }

  function onEdgesChange(changes: EdgeChange<ProcessFlowEdge>[]) {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
    setDirty(true);
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;

    const expectedType = childTypeByParent[sourceNode.data.blockType];
    if (!expectedType) {
      setMessage("Для инструментальной позиции нельзя создать дочерний блок");
      return;
    }

    if (targetNode.data.blockType !== expectedType && targetNode.data.blockType !== "unknown") {
      setMessage("Недопустимая связь блоков");
      return;
    }

    const nextNodes = targetNode.data.blockType === "unknown"
      ? nodes.map((node) => node.id === targetNode.id ? withType(node, expectedType) : node)
      : nodes;

    commit(nextNodes, addEdge({ ...connection, type: "smoothstep", animated: false }, edges));
  }

  function addBlock(parentId = selectedNodeId) {
    const parentNode = parentId ? nodes.find((node) => node.id === parentId) : undefined;
    const blockType = parentNode ? childTypeByParent[parentNode.data.blockType] : "unknown";

    if (!blockType) {
      setMessage("Для инструментальной позиции нельзя создать дочерний блок");
      return;
    }

    const position = parentNode
      ? { x: parentNode.position.x + 300, y: parentNode.position.y + 110 }
      : { x: 220, y: 160 };
    const node = createFlowNode(blockType, position, { part, project, operations, parentNode, nodes });
    const nextEdges = parentNode
      ? [...edges, { id: createId("edge"), source: parentNode.id, target: node.id, type: "smoothstep" }]
      : edges;

    commit([...nodes, node], nextEdges);
    setSelectedNodeId(node.id);
  }

  function deleteBlock(nodeId = selectedNodeId) {
    if (!nodeId) return;
    if (!window.confirm("Удалить блок со схемы?")) return;
    commit(nodes.filter((node) => node.id !== nodeId), edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId(null);
  }

  function updateSelectedEntity(patch: Record<string, unknown>) {
    if (!selectedNode) return;
    const nextNodes = nodes.map((node) => {
      if (node.id !== selectedNode.id) return node;
      const entity = { ...node.data.entity, ...patch } as FlowEntity;
      return refreshNode({ ...node, data: { ...node.data, entity } });
    });
    commit(nextNodes, edges);
  }

  function updateSelectedType(blockType: FlowBlockType) {
    if (!selectedNode) return;
    const invalidIncoming = edges.some((edge) => edge.target === selectedNode.id && childTypeByParent[nodes.find((node) => node.id === edge.source)?.data.blockType ?? "unknown"] !== blockType);
    const invalidOutgoing = edges.some((edge) => edge.source === selectedNode.id && childTypeByParent[blockType] !== nodes.find((node) => node.id === edge.target)?.data.blockType);
    if (invalidIncoming || invalidOutgoing) {
      setMessage("Недопустимая связь блоков");
      return;
    }

    commit(nodes.map((node) => node.id === selectedNode.id ? withType(node, blockType) : node), edges);
  }

  function saveFlow() {
    window.localStorage.setItem(storageKey, JSON.stringify({ nodes, edges }));
    persistFlowEntities(nodes);
    persistFlowOperations(partId, nodes, edges);
    setPart(loadPartsFromStorage().find((item) => item.id === partId) ?? part);
    setProject(loadProjectsFromStorage().find((item) => item.id === (projectId ?? part.projectId)));
    setOperations(sortOperationsByNumber(loadOperationsFromStorage(partId)));
    setDirty(false);
    setMessage("Свободная схема сохранена");
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((items) => [{ nodes, edges }, ...items]);
    setPast((items) => items.slice(0, -1));
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setDirty(true);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, { nodes, edges }]);
    setFuture((items) => items.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
    setDirty(true);
  }

  function autoLayout() {
    const levels: Record<FlowBlockType, number> = {
      project: 0,
      part: 1,
      operation: 2,
      setup: 3,
      tool_position: 4,
      unknown: 2,
    };
    const counters: Partial<Record<FlowBlockType, number>> = {};
    const nextNodes = nodes.map((node) => {
      const type = node.data.blockType;
      const index = counters[type] ?? 0;
      counters[type] = index + 1;
      return { ...node, position: { x: 40 + levels[type] * 290, y: 80 + index * 155 } };
    });
    commit(nextNodes, edges);
  }

  if (!part) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Деталь не найдена.</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Свободная схема"
        description={`${part.code} · ${part.name}. Node-based редактор структуры: проект → деталь → операция → установ → инструментальная позиция.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/parts/${part.id}`} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Карточка детали</Link>
          <Link href={`/parts/${part.id}/process`} className="rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Редактор техпроцесса</Link>
          <button type="button" onClick={() => addBlock()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Добавить блок</button>
          <button type="button" onClick={autoLayout} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Автокомпоновка</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Есть несохранённые изменения</span> : null}
          <button type="button" onClick={undo} disabled={!past.length} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Undo</button>
          <button type="button" onClick={redo} disabled={!future.length} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Redo</button>
          <button type="button" onClick={saveFlow} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Сохранить</button>
        </div>
      </div>

      {message ? <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="h-[720px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ processBlock: FlowBlockNode }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onSelectionChange={({ nodes: selectedNodes }) => setSelectedNodeId(selectedNodes[0]?.id ?? null)}
            fitView
          >
            <Background color="#cbd5e1" gap={18} />
            <MiniMap pannable zoomable nodeColor={(node) => nodeColor((node as ProcessFlowNode).data.blockType)} />
            <Controls />
          </ReactFlow>
        </section>

        <PropertiesPanel
          node={selectedNode}
          project={project}
          part={part}
          onTypeChange={updateSelectedType}
          onChange={updateSelectedEntity}
          onDelete={() => deleteBlock()}
        />
      </div>
    </div>
  );
}

function FlowBlockNode({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  return (
    <div className={`min-w-56 rounded-lg border bg-white p-3 shadow-sm ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{flowTypeLabels[data.blockType]}</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{data.title}</div>
          {data.subtitle ? <div className="mt-1 max-w-52 truncate text-xs text-slate-500">{data.subtitle}</div> : null}
        </div>
        <div className="flex gap-1">
          <button type="button" title="Добавить дочерний блок" onClick={(event) => dispatchNodeEvent(event, "tech-flow:add-child", id)} className="rounded border border-blue-200 px-2 text-xs font-semibold text-blue-700">+</button>
          <button type="button" title="Удалить блок" onClick={(event) => dispatchNodeEvent(event, "tech-flow:delete-node", id)} className="rounded border border-rose-200 px-2 text-xs font-semibold text-rose-700">×</button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
    </div>
  );
}

function dispatchNodeEvent(event: MouseEvent, name: string, id: string) {
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent(name, { detail: id }));
}

function PropertiesPanel({
  node,
  project,
  part,
  onTypeChange,
  onChange,
  onDelete,
}: {
  node?: ProcessFlowNode;
  project?: ProcessProject;
  part: ProcessPart;
  onTypeChange: (type: FlowBlockType) => void;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  if (!node) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Выберите блок на схеме, чтобы редактировать его свойства.
      </aside>
    );
  }

  const entity = node.data.entity as Record<string, any>;

  return (
    <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-blue-700">Свойства блока</div>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{node.data.title}</h3>
        </div>
        <button type="button" onClick={onDelete} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Удалить</button>
      </div>

      <Field label="Тип блока">
        <select value={node.data.blockType} onChange={(event) => onTypeChange(event.target.value as FlowBlockType)} className="field">
          {Object.entries(flowTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>

      {node.data.blockType === "project" ? (
        <>
          <TextField label="Код проекта" value={entity.code} onChange={(value) => onChange({ code: value })} />
          <TextField label="Название" value={entity.name} onChange={(value) => onChange({ name: value })} />
          <TextField label="Заказчик" value={entity.customer} onChange={(value) => onChange({ customer: value })} />
          <TextareaField label="Описание" value={entity.description} onChange={(value) => onChange({ description: value })} />
          <StatusField value={entity.status} onChange={(value) => onChange({ status: value })} />
        </>
      ) : null}

      {node.data.blockType === "part" ? (
        <>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Проект: {project?.name ?? part.projectId}</div>
          <TextField label="Код детали" value={entity.code} onChange={(value) => onChange({ code: value })} />
          <TextField label="Наименование" value={entity.name} onChange={(value) => onChange({ name: value })} />
          <TextField label="Номер чертежа" value={entity.drawingNumber} onChange={(value) => onChange({ drawingNumber: value })} />
          <TextareaField label="Описание" value={entity.description} onChange={(value) => onChange({ description: value })} />
          <StatusField value={entity.status} onChange={(value) => onChange({ status: value })} />
        </>
      ) : null}

      {node.data.blockType === "operation" ? (
        <>
          <TextField label="№ операции" value={entity.operationNo} onChange={(value) => onChange({ operationNo: value, number: value })} />
          <TextField label="Название" value={entity.name} onChange={(value) => onChange({ name: value, title: value })} />
          <ResourceFields
            label="Станок операции"
            source={entity.machineSource}
            catalogId={entity.machineId}
            manualText={entity.machineManualText}
            options={machines.map((machine) => ({ id: machine.id, label: machine.name }))}
            onChange={onChange}
            sourceKey="machineSource"
            catalogKey="machineId"
            manualKey="machineManualText"
          />
          <TextareaField label="Описание" value={entity.description} onChange={(value) => onChange({ description: value })} />
          <TextareaField label="Комментарий" value={entity.comment} onChange={(value) => onChange({ comment: value, technologistComment: value })} />
          <StatusField value={entity.status} onChange={(value) => onChange({ status: value })} />
        </>
      ) : null}

      {node.data.blockType === "setup" ? (
        <>
          <TextField label="Название установа" value={entity.name} onChange={(value) => onChange({ name: value })} />
          <TextareaField label="Описание" value={entity.description} onChange={(value) => onChange({ description: value })} />
          <ResourceFields
            label="Оснастка детали / приспособление"
            source={entity.fixtureSource}
            catalogId={entity.fixtureId}
            manualText={entity.fixtureManualText}
            options={holders.map((holder) => ({ id: holder.id, label: holder.name }))}
            onChange={onChange}
            sourceKey="fixtureSource"
            catalogKey="fixtureId"
            manualKey="fixtureManualText"
          />
          <TextareaField label="Комментарий" value={entity.comment} onChange={(value) => onChange({ comment: value })} />
        </>
      ) : null}

      {node.data.blockType === "tool_position" ? (
        <>
          <TextField label="№ позиции" value={String(entity.positionNo ?? "")} onChange={(value) => onChange({ positionNo: Number.parseInt(value, 10) || 1 })} />
          <ResourceFields label="Ячейка станка" source={entity.cellSource} catalogId={entity.cellId} manualText={entity.cellManualText} options={machineCells.map((cell) => ({ id: cell.id, label: cell.label }))} onChange={onChange} sourceKey="cellSource" catalogKey="cellId" manualKey="cellManualText" />
          <ResourceFields label="Оправка инструмента" source={entity.holderSource} catalogId={entity.holderId} manualText={entity.holderManualText} options={holders.map((holder) => ({ id: holder.id, label: holder.name }))} onChange={onChange} sourceKey="holderSource" catalogKey="holderId" manualKey="holderManualText" />
          <ResourceFields label="Инструмент" source={entity.toolSource} catalogId={entity.toolId} manualText={entity.toolManualText} options={tools.map((tool) => ({ id: tool.id, label: tool.name }))} onChange={onChange} sourceKey="toolSource" catalogKey="toolId" manualKey="toolManualText" />
          <TextField label="Количество" value={String(entity.quantity ?? 1)} onChange={(value) => onChange({ quantity: Number.parseInt(value, 10) || 1 })} />
          <TextareaField label="Комментарий" value={entity.comment} onChange={(value) => onChange({ comment: value })} />
          <StatusField value={entity.status} onChange={(value) => onChange({ status: value })} />
        </>
      ) : null}

      {node.data.blockType === "unknown" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Свободный блок без типа. Выберите тип вручную или соедините его с родительским блоком.
        </div>
      ) : null}

      {node.data.blockType !== "unknown" ? (
        <div className="pt-2">
          <StatusBadge status={(entity.status ?? "Черновик") as OperationStatus} />
        </div>
      ) : null}
    </aside>
  );
}

function ResourceFields({
  label,
  source,
  catalogId,
  manualText,
  options,
  onChange,
  sourceKey,
  catalogKey,
  manualKey,
}: {
  label: string;
  source: ResourceSource;
  catalogId?: string;
  manualText?: string;
  options: Array<{ id: string; label: string }>;
  onChange: (patch: Record<string, unknown>) => void;
  sourceKey: string;
  catalogKey: string;
  manualKey: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <select value={source} onChange={(event) => onChange({ [sourceKey]: event.target.value })} className="field">
        {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {source === "catalog" ? (
        <select value={catalogId ?? ""} onChange={(event) => onChange({ [catalogKey]: event.target.value })} className="field">
          <option value="">Выберите значение</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      ) : null}
      {source === "manual" ? (
        <>
          <input value={manualText ?? ""} onChange={(event) => onChange({ [manualKey]: event.target.value })} className="field" placeholder="Введите вручную" />
          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Ручная заглушка</span>
        </>
      ) : null}
      {source === "required" ? <div className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-500">Требуется подобрать</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm font-semibold text-slate-700">{label}{children}</label>;
}

function TextField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="field" />
    </Field>
  );
}

function TextareaField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} rows={3} className="field" />
    </Field>
  );
}

function StatusField({ value, onChange }: { value: OperationStatus; onChange: (value: OperationStatus) => void }) {
  return (
    <Field label="Статус">
      <select value={value} onChange={(event) => onChange(event.target.value as OperationStatus)} className="field">
        {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
    </Field>
  );
}

function buildInitialFlow(project: ProcessProject | undefined, part: ProcessPart | undefined, operations: ProcessOperation[]): FlowSnapshot {
  const nodes: ProcessFlowNode[] = [];
  const edges: ProcessFlowEdge[] = [];

  if (project) {
    nodes.push(createFlowNode("project", { x: 40, y: 80 }, { entity: project }));
  }

  if (part) {
    nodes.push(createFlowNode("part", { x: 330, y: 80 }, { entity: part }));
    if (project) edges.push({ id: `edge-${project.id}-${part.id}`, source: `project-${project.id}`, target: `part-${part.id}`, type: "smoothstep" });
  }

  operations.forEach((operation, operationIndex) => {
    nodes.push(createFlowNode("operation", { x: 620, y: 80 + operationIndex * 180 }, { entity: operation }));
    if (part) edges.push({ id: `edge-${part.id}-${operation.id}`, source: `part-${part.id}`, target: `operation-${operation.id}`, type: "smoothstep" });

    operation.setups.forEach((setup, setupIndex) => {
      nodes.push(createFlowNode("setup", { x: 910, y: 80 + operationIndex * 180 + setupIndex * 90 }, { entity: setup }));
      edges.push({ id: `edge-${operation.id}-${setup.id}`, source: `operation-${operation.id}`, target: `setup-${setup.id}`, type: "smoothstep" });

      setup.toolPositions.forEach((position, positionIndex) => {
        nodes.push(createFlowNode("tool_position", { x: 1200, y: 80 + operationIndex * 180 + setupIndex * 90 + positionIndex * 80 }, { entity: position }));
        edges.push({ id: `edge-${setup.id}-${position.id}`, source: `setup-${setup.id}`, target: `position-${position.id}`, type: "smoothstep" });
      });
    });
  });

  return { nodes, edges };
}

function createFlowNode(
  blockType: FlowBlockType,
  position: { x: number; y: number },
  context: {
    entity?: FlowEntity;
    part?: ProcessPart;
    project?: ProcessProject;
    operations?: ProcessOperation[];
    parentNode?: ProcessFlowNode;
    nodes?: ProcessFlowNode[];
  },
): ProcessFlowNode {
  const entity = context.entity ?? defaultEntity(blockType, context);
  return refreshNode({
    id: nodeId(blockType, entity),
    type: "processBlock",
    position,
    data: {
      blockType,
      title: flowTypeLabels[blockType],
      entity,
    },
  });
}

function refreshNode(node: ProcessFlowNode): ProcessFlowNode {
  const { title, subtitle } = describeNode(node.data.blockType, node.data.entity as Record<string, any>);
  return { ...node, data: { ...node.data, title, subtitle } };
}

function withType(node: ProcessFlowNode, blockType: FlowBlockType): ProcessFlowNode {
  const nextNode = createFlowNode(blockType, node.position, { entity: defaultEntity(blockType, {}) });
  return { ...nextNode, id: node.id };
}

function defaultEntity(blockType: FlowBlockType, context: { part?: ProcessPart; project?: ProcessProject; operations?: ProcessOperation[]; parentNode?: ProcessFlowNode; nodes?: ProcessFlowNode[] }): FlowEntity {
  const date = new Date().toLocaleDateString("ru-RU");
  if (blockType === "project") {
    return {
      id: createId("project"),
      code: "",
      name: "Новый проект",
      customer: "",
      description: "",
      status: "Черновик",
      isDeleted: false,
      deletedAt: null,
      createdAt: date,
      updatedAt: date,
    } satisfies ProcessProject;
  }

  if (blockType === "part") {
    return {
      id: createId("part"),
      projectId: context.project?.id ?? "project-r120",
      code: "",
      name: "Новая деталь",
      drawingNumber: "",
      description: "",
      status: "Черновик",
      isDeleted: false,
      deletedAt: null,
      createdAt: date,
      updatedAt: date,
      routeId: createId("route"),
    } satisfies ProcessPart;
  }

  if (blockType === "operation") {
    const flowOperations = context.nodes?.filter((node) => node.data.blockType === "operation").map((node) => node.data.entity as ProcessOperation) ?? [];
    return emptyOperation(context.part?.id ?? "local-part", nextOperationNo([...(context.operations ?? []), ...flowOperations]));
  }

  if (blockType === "setup") {
    const setupCount = context.nodes?.filter((node) => node.data.blockType === "setup").length ?? 0;
    return emptySetup(setupCount + 1);
  }

  if (blockType === "tool_position") {
    const positionCount = context.nodes?.filter((node) => node.data.blockType === "tool_position").length ?? 0;
    return emptyToolPosition(positionCount + 1);
  }

  return {};
}

function describeNode(blockType: FlowBlockType, entity: Record<string, any>) {
  if (blockType === "project") return { title: entity.name || "Новый проект", subtitle: entity.code || "Код не задан" };
  if (blockType === "part") return { title: entity.name || "Новая деталь", subtitle: entity.code || "Код не задан" };
  if (blockType === "operation") {
    const machine = entity.machineSource === "catalog" ? machineName(entity.machineId) : entity.machineSource === "manual" ? entity.machineManualText : "Требуется подобрать";
    return { title: `Операция ${entity.operationNo || "-"}`, subtitle: `${entity.name || "Новая операция"} · ${machine}` };
  }
  if (blockType === "setup") {
    return { title: entity.name || `Установ ${entity.setupNo ?? ""}`, subtitle: entity.fixtureSource === "manual" ? entity.fixtureManualText : entity.fixtureSource === "catalog" ? holderName(entity.fixtureId) : "Приспособление требуется подобрать" };
  }
  if (blockType === "tool_position") {
    const cell = entity.cellSource === "catalog" ? cellName(entity.cellId) : entity.cellSource === "manual" ? entity.cellManualText : "Ячейка?";
    const holder = entity.holderSource === "catalog" ? holderName(entity.holderId) : entity.holderSource === "manual" ? entity.holderManualText : "Оправка?";
    const tool = entity.toolSource === "catalog" ? toolName(entity.toolId) : entity.toolSource === "manual" ? entity.toolManualText : "Инструмент?";
    return { title: `Позиция ${entity.positionNo ?? "-"}`, subtitle: `${cell} → ${holder} → ${tool}` };
  }
  return { title: "Свободный блок", subtitle: "Тип не задан" };
}

function nodeId(blockType: FlowBlockType, entity: FlowEntity) {
  const typed = entity as { id?: string };
  const prefix = blockType === "tool_position" ? "position" : blockType;
  return typed.id ? `${prefix}-${typed.id}` : `${prefix}-${createId("node")}`;
}

function nodeColor(blockType: FlowBlockType) {
  if (blockType === "project") return "#1d4ed8";
  if (blockType === "part") return "#0891b2";
  if (blockType === "operation") return "#2563eb";
  if (blockType === "setup") return "#7c3aed";
  if (blockType === "tool_position") return "#ea580c";
  return "#64748b";
}

function persistFlowOperations(partId: string, nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  const operationNodes = nodes.filter((node) => node.data.blockType === "operation");
  const nextOperations = operationNodes.map((operationNode) => {
    const operation = { ...(operationNode.data.entity as ProcessOperation), partId };
    const setupNodes = outgoing(nodes, edges, operationNode.id, "setup");
    operation.setups = setupNodes.map((setupNode) => {
      const setup = { ...(setupNode.data.entity as OperationSetup) };
      setup.toolPositions = outgoing(nodes, edges, setupNode.id, "tool_position").map((positionNode) => positionNode.data.entity as ToolPosition);
      return setup;
    });
    return operation;
  });

  if (nextOperations.length) {
    saveOperationsToStorage(partId, sortOperationsByNumber(nextOperations));
  }
}

function persistFlowEntities(nodes: ProcessFlowNode[]) {
  const projectNodes = nodes.filter((node) => node.data.blockType === "project").map((node) => node.data.entity as ProcessProject);
  const partNodes = nodes.filter((node) => node.data.blockType === "part").map((node) => node.data.entity as ProcessPart);

  if (projectNodes.length) {
    const existingProjects = loadProjectsFromStorage();
    const nextProjects = mergeById(existingProjects, projectNodes);
    saveProjectsToStorage(nextProjects);
  }

  if (partNodes.length) {
    const existingParts = loadPartsFromStorage();
    const nextParts = mergeById(existingParts, partNodes);
    savePartsToStorage(nextParts);
  }
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const merged = existing.map((item) => incomingById.get(item.id) ?? item);
  const existingIds = new Set(existing.map((item) => item.id));
  return [...merged, ...incoming.filter((item) => !existingIds.has(item.id))];
}

function outgoing(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], sourceId: string, blockType: FlowBlockType) {
  const targetIds = new Set(edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target));
  return nodes.filter((node) => targetIds.has(node.id) && node.data.blockType === blockType);
}
