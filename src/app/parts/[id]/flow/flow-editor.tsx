"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
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
  type ReactFlowInstance,
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
import { FLOW_CONTROLS_STORAGE_KEY, parseFlowControls, type FlowWheelMode } from "../../../flow-controls";
import { holders, machineCells, machines, tools } from "../../../mock-data";
import { StatusBadge } from "../../../ui";

type GroupBlockType = "part_group" | "operation_group" | "setup_group" | "tool_position_group";
type EntityBlockType = "project" | "part" | "operation" | "setup" | "tool_position" | "unknown";
type FlowBlockType = EntityBlockType | GroupBlockType;

type CollapsedGroupEntity = {
  id: string;
  groupType: GroupBlockType;
  parentId: string;
  childType: FlowBlockType;
  groupedNodeIds: string[];
  groupedDescendantIds: string[];
  label: string;
  countChildren: number;
  countDescendants: number;
  isCollapsed: boolean;
};

type FlowEntity = ProcessProject | ProcessPart | ProcessOperation | OperationSetup | ToolPosition | CollapsedGroupEntity | Record<string, never>;

type FlowNodeData = {
  blockType: FlowBlockType;
  title: string;
  subtitle?: string;
  entity: FlowEntity;
  canCollapseGroup?: GroupBlockType;
};

type ProcessFlowNode = Node<FlowNodeData, "processBlock">;
type ProcessFlowEdge = Edge;
type FlowSnapshot = { nodes: ProcessFlowNode[]; edges: ProcessFlowEdge[] };
type FlowEditorMode = "part" | "project";

const flowTypeLabels: Record<FlowBlockType, string> = {
  project: "Проект",
  part: "Деталь",
  part_group: "Группа деталей",
  operation: "Операция",
  operation_group: "Группа операций",
  setup: "Установ",
  setup_group: "Группа установов",
  tool_position: "Инструментальная позиция",
  tool_position_group: "Группа позиций",
  unknown: "Блок",
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;
const HORIZONTAL_SPACING = 360;
const VERTICAL_SPACING = 160;
const SUBTREE_SPACING = 80;

const childTypeByParent: Partial<Record<FlowBlockType, FlowBlockType>> = {
  project: "part",
  part: "operation",
  operation: "setup",
  setup: "tool_position",
};

const groupConfigByParent: Partial<Record<FlowBlockType, {
  groupType: GroupBlockType;
  childType: FlowBlockType;
  label: string;
  collapseLabel: string;
}>> = {
  project: { groupType: "part_group", childType: "part", label: "Детали", collapseLabel: "Свернуть детали" },
  part: { groupType: "operation_group", childType: "operation", label: "Операции", collapseLabel: "Свернуть операции" },
  operation: { groupType: "setup_group", childType: "setup", label: "Установы", collapseLabel: "Свернуть установы" },
  setup: { groupType: "tool_position_group", childType: "tool_position", label: "Инструментальные позиции", collapseLabel: "Свернуть позиции" },
};

const groupConfigByType = Object.fromEntries(
  Object.values(groupConfigByParent).map((config) => [config.groupType, config]),
) as Record<GroupBlockType, NonNullable<(typeof groupConfigByParent)[FlowBlockType]>>;

const statusOptions: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Архив"];
const sourceOptions: Array<{ value: ResourceSource; label: string }> = [
  { value: "catalog", label: "Из справочника" },
  { value: "manual", label: "Ручной ввод" },
  { value: "required", label: "Требуется подобрать" },
];

export function FlowEditor({
  partId,
  projectId,
  initialPart,
  initialProject,
  mode = "part",
}: {
  partId?: string;
  projectId?: string;
  initialPart?: ProcessPart;
  initialProject?: ProcessProject;
  mode?: FlowEditorMode;
}) {
  const [part, setPart] = useState<ProcessPart | undefined>(initialPart);
  const [project, setProject] = useState<ProcessProject | undefined>();
  const [projectParts, setProjectParts] = useState<ProcessPart[]>([]);
  const [operations, setOperations] = useState<ProcessOperation[]>([]);
  const [nodes, setNodes] = useState<ProcessFlowNode[]>([]);
  const [edges, setEdges] = useState<ProcessFlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wheelMode, setWheelMode] = useState<FlowWheelMode>("pan");
  const [past, setPast] = useState<FlowSnapshot[]>([]);
  const [future, setFuture] = useState<FlowSnapshot[]>([]);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const flowCanvasRef = useRef<HTMLDivElement | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<ProcessFlowNode, ProcessFlowEdge> | null>(null);

  const storageKey = mode === "project" ? `tech-process-flow-project-${projectId}` : `tech-process:flow:${partId}`;
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId), [nodes, selectedNodeId]);
  const displayNodes = useMemo(() => enrichFlowNodes(nodes, edges), [edges, nodes]);
  const displayEdges = useMemo(() => enrichFlowEdges(edges), [edges]);

  const commit = useCallback((nextNodes: ProcessFlowNode[], nextEdges: ProcessFlowEdge[]) => {
    setPast((items) => [...items.slice(-20), { nodes, edges }]);
    setFuture([]);
    setNodes(nextNodes);
    setEdges(nextEdges);
    persistFlowSnapshot(storageKey, nextNodes, nextEdges);
    setDirty(true);
    setMessage("");
  }, [edges, nodes, storageKey]);

  useEffect(() => {
    const loadedParts = loadPartsFromStorage();
    const loadedProjects = loadProjectsFromStorage();
    const nextPart = loadedParts.find((item) => item.id === partId) ?? initialPart;
    const nextProject = loadedProjects.find((item) => item.id === (projectId ?? nextPart?.projectId)) ?? initialProject;
    const activeProjectParts = nextProject ? getActiveProjectParts(loadedParts, nextProject.id) : [];
    const nextOperations = mode === "project"
      ? activeProjectParts.flatMap((item) => sortOperationsByNumber(loadOperationsFromStorage(item.id)))
      : partId ? sortOperationsByNumber(loadOperationsFromStorage(partId)) : [];

    setPart(nextPart);
    setProject(nextProject);
    setProjectParts(activeProjectParts);
    setOperations(nextOperations);

    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as FlowSnapshot;
        const savedSnapshot = {
          nodes: (parsed.nodes ?? []).map(normalizeFlowNode),
          edges: (parsed.edges ?? []).map(normalizeFlowEdge),
        };
        const synced = mode === "project" && nextProject
          ? syncProjectFlow(savedSnapshot, nextProject, activeProjectParts, getOperationsByPart(activeProjectParts))
          : savedSnapshot;
        setNodes(synced.nodes);
        setEdges(synced.edges);
        persistFlowSnapshot(storageKey, synced.nodes, synced.edges);
        setSelectedNodeId(synced.nodes?.[0]?.id ?? null);
        setSelectedNodeIds(synced.nodes?.[0]?.id ? [synced.nodes[0].id] : []);
        setSelectedEdgeIds([]);
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    const initial = mode === "project"
      ? buildProjectFlow(nextProject, activeProjectParts, getOperationsByPart(activeProjectParts))
      : buildInitialFlow(nextProject, nextPart, nextOperations);
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedNodeId(initial.nodes[0]?.id ?? null);
    setSelectedNodeIds(initial.nodes[0]?.id ? [initial.nodes[0].id] : []);
    setSelectedEdgeIds([]);
    persistFlowSnapshot(storageKey, initial.nodes, initial.edges);
  }, [initialPart, initialProject, mode, partId, projectId, storageKey]);

  useEffect(() => {
    function loadFlowControls() {
      setWheelMode(parseFlowControls(window.localStorage.getItem(FLOW_CONTROLS_STORAGE_KEY)).wheelMode);
    }

    loadFlowControls();
    window.addEventListener("storage", loadFlowControls);
    return () => window.removeEventListener("storage", loadFlowControls);
  }, []);

  useEffect(() => {
    const canvas = flowCanvasRef.current;
    if (!canvas) return;

    function handleWheel(event: WheelEvent) {
      if (wheelMode !== "zoom" || !event.ctrlKey) return;

      const instance = flowInstanceRef.current;
      if (!instance) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const viewport = instance.getViewport();
      instance.setViewport({
        ...viewport,
        y: viewport.y - event.deltaY,
      });
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => canvas.removeEventListener("wheel", handleWheel, { capture: true });
  }, [wheelMode]);

  useEffect(() => {
    function addChild(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      setSelectedNodeId(id);
      setSelectedNodeIds([id]);
      setSelectedEdgeIds([]);
      addBlock(id);
    }

    function deleteNode(event: Event) {
      deleteBlock((event as CustomEvent<string>).detail);
    }

    function collapseGroup(event: Event) {
      collapseChildGroup((event as CustomEvent<string>).detail);
    }

    function expandGroup(event: Event) {
      expandChildGroup((event as CustomEvent<string>).detail);
    }

    window.addEventListener("tech-flow:add-child", addChild);
    window.addEventListener("tech-flow:delete-node", deleteNode);
    window.addEventListener("tech-flow:collapse-group", collapseGroup);
    window.addEventListener("tech-flow:expand-group", expandGroup);
    return () => {
      window.removeEventListener("tech-flow:add-child", addChild);
      window.removeEventListener("tech-flow:delete-node", deleteNode);
      window.removeEventListener("tech-flow:collapse-group", collapseGroup);
      window.removeEventListener("tech-flow:expand-group", expandGroup);
    };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Delete" || event.key === "Backspace") {
        if (isTextEditingTarget(event.target as HTMLElement | null)) return;
        if (!selectedNodeIds.length && !selectedEdgeIds.length) return;

        event.preventDefault();
        deleteSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEdgeIds, selectedNodeIds, nodes, edges]);

  function onNodesChange(changes: NodeChange<ProcessFlowNode>[]) {
    setNodes((currentNodes) => {
      const nextNodes = applyNodeChanges(changes, currentNodes);
      persistFlowSnapshot(storageKey, nextNodes, edges);
      return nextNodes;
    });
    setDirty(true);
  }

  function onEdgesChange(changes: EdgeChange<ProcessFlowEdge>[]) {
    setEdges((currentEdges) => {
      const nextEdges = applyEdgeChanges(changes, currentEdges);
      persistFlowSnapshot(storageKey, nodes, nextEdges);
      return nextEdges;
    });
    setDirty(true);
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;

    const expectedType = sourceNode.data.blockType === "unknown" ? "unknown" : childTypeByParent[sourceNode.data.blockType];
    if (!expectedType) {
      setMessage("Инструментальная позиция — конечный блок цепочки");
      return;
    }

    if (targetNode.data.blockType !== expectedType && targetNode.data.blockType !== "unknown") {
      setMessage("Недопустимая связь блоков");
      return;
    }

    const nextNodes = targetNode.data.blockType === "unknown"
      ? nodes.map((node) => node.id === targetNode.id ? withType(node, expectedType) : node)
      : nodes;

    const nextEdges = addEdge(createFlowEdge(connection.source, connection.target), edges);
    commit(layoutFlowTree(nextNodes, nextEdges), nextEdges);
  }

  function addBlock(parentId = selectedNodeId) {
    const parentNode = parentId ? nodes.find((node) => node.id === parentId) : undefined;

    if (isGroupType(parentNode?.data.blockType)) {
      expandChildGroup(parentNode.id, true);
      return;
    }

    const blockType = parentNode ? childTypeByParent[parentNode.data.blockType] ?? (parentNode.data.blockType === "unknown" ? "unknown" : undefined) : "unknown";

    if (!blockType) {
      setMessage("Инструментальная позиция — конечный блок цепочки");
      return;
    }

    const position = parentNode
      ? getNextChildPosition(parentNode, outgoing(nodes, edges, parentNode.id, blockType), nodes)
      : findFreePosition({ x: 220, y: 160 }, nodes);
    const contextPart = parentNode ? findNearestPart(nodes, edges, parentNode.id) ?? part : part;
    const contextProject = mode === "project" ? project : project;
    const contextOperations = contextPart ? sortOperationsByNumber(loadOperationsFromStorage(contextPart.id)) : operations;
    const node = createFlowNode(blockType, position, { part: contextPart, project: contextProject, operations: contextOperations, parentNode, nodes, edges });
    const nextEdges = parentNode
      ? [...edges, createFlowEdge(parentNode.id, node.id)]
      : edges;

    const committedNodes = [...nodes, node];
    if (mode === "project" && blockType === "part") {
      persistFlowEntities(committedNodes);
      setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
    }

    commit(layoutFlowTree(committedNodes, nextEdges), nextEdges);
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeIds([]);
  }

  function collapseChildGroup(parentId: string) {
    const parentNode = nodes.find((node) => node.id === parentId);
    const config = parentNode ? groupConfigByParent[parentNode.data.blockType] : undefined;
    if (!parentNode || !config) return;

    const childNodes = outgoing(nodes, edges, parentId, config.childType).filter((node) => !node.hidden);
    if (childNodes.length < 2) {
      setMessage("Для сворачивания нужно минимум два параллельных блока");
      return;
    }

    const groupedNodeIds = childNodes.map((node) => node.id);
    const groupedDescendantIds = groupedNodeIds.flatMap((nodeId) => collectVisibleDescendantIds(nodes, edges, nodeId));
    const hiddenIds = new Set([...groupedNodeIds, ...groupedDescendantIds]);
    const firstChild = [...childNodes].sort((first, second) => first.position.y - second.position.y)[0];
    const groupNode = createFlowNode(
      config.groupType,
      findFreePosition(firstChild.position, nodes, hiddenIds),
      {
        entity: {
          id: `${parentId}-${config.groupType}`,
          groupType: config.groupType,
          parentId,
          childType: config.childType,
          groupedNodeIds,
          groupedDescendantIds,
          label: config.label,
          countChildren: groupedNodeIds.length,
          countDescendants: groupedDescendantIds.length,
          isCollapsed: true,
        } satisfies CollapsedGroupEntity,
      },
    );

    const nextNodes = [
      ...nodes
        .filter((node) => node.id !== groupNode.id)
        .map((node) => hiddenIds.has(node.id) ? { ...node, hidden: true } : node),
      groupNode,
    ];
    const nextEdges = [
      ...edges
        .filter((edge) => edge.source !== parentId || edge.target !== groupNode.id)
        .map((edge) => hiddenIds.has(edge.source) || hiddenIds.has(edge.target) ? { ...edge, hidden: true } : edge),
      createFlowEdge(parentId, groupNode.id, `edge-${parentId}-${groupNode.id}`),
    ];

    commit(layoutFlowTree(nextNodes, nextEdges), nextEdges);
    setSelectedNodeId(groupNode.id);
    setSelectedNodeIds([groupNode.id]);
    setSelectedEdgeIds([]);
  }

  function expandChildGroup(groupId: string, addChildAfter = false) {
    const groupNode = nodes.find((node) => node.id === groupId);
    if (!groupNode || !isGroupType(groupNode.data.blockType)) return;

    const group = groupNode.data.entity as CollapsedGroupEntity;
    const parentNode = nodes.find((node) => node.id === group.parentId);
    if (!parentNode) return;

    const childIds = new Set(group.groupedNodeIds);
    const descendantIds = new Set(group.groupedDescendantIds);
    const visibleIds = new Set([...childIds, ...descendantIds]);
    const layoutNodes = layoutExpandedGroup(
      nodes.filter((node) => node.id !== groupId).map((node) => visibleIds.has(node.id) ? { ...node, hidden: false } : node),
      edges,
      parentNode,
      [...childIds],
    );
    const nextEdges = edges
      .filter((edge) => edge.source !== groupId && edge.target !== groupId)
      .map((edge) => visibleIds.has(edge.source) || visibleIds.has(edge.target) ? { ...normalizeFlowEdge(edge), hidden: false } : normalizeFlowEdge(edge));

    if (addChildAfter) {
      const childType = group.childType;
      const childNodes = outgoing(layoutNodes, nextEdges, parentNode.id, childType);
      const contextPart = findNearestPart(layoutNodes, nextEdges, parentNode.id) ?? part;
      const contextOperations = contextPart ? sortOperationsByNumber(loadOperationsFromStorage(contextPart.id)) : operations;
      const node = createFlowNode(childType, getNextChildPosition(parentNode, childNodes, layoutNodes), { part: contextPart, project, operations: contextOperations, parentNode, nodes: layoutNodes, edges: nextEdges });
      const finalEdges = [...nextEdges, createFlowEdge(parentNode.id, node.id)];
      const finalNodes = [...layoutNodes, node];
      if (mode === "project" && childType === "part") {
        persistFlowEntities(finalNodes);
        setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
      }
      commit(layoutFlowTree(finalNodes, finalEdges), finalEdges);
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      return;
    }

    commit(layoutFlowTree(layoutNodes, nextEdges), nextEdges);
    setSelectedNodeId(parentNode.id);
    setSelectedNodeIds([parentNode.id]);
    setSelectedEdgeIds([]);
  }

  function deleteBlock(nodeId = selectedNodeId) {
    if (!nodeId) return;
    deleteNodesAndEdges(new Set([nodeId]));
  }

  function getSelectedNodeIds() {
    return selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
  }

  function getDescendantNodeIds(nodeIds: Iterable<string>) {
    const descendants = new Set<string>();
    const queue = [...nodeIds];

    while (queue.length) {
      const nodeId = queue.shift();
      if (!nodeId) continue;

      const node = nodes.find((item) => item.id === nodeId);
      if (node && isGroupType(node.data.blockType)) {
        const group = node.data.entity as CollapsedGroupEntity;
        [...group.groupedNodeIds, ...group.groupedDescendantIds].forEach((groupedId) => {
          if (!descendants.has(groupedId)) {
            descendants.add(groupedId);
            queue.push(groupedId);
          }
        });
      }

      collectAllDescendantIds(nodes, edges, nodeId).forEach((descendantId) => {
        if (!descendants.has(descendantId)) {
          descendants.add(descendantId);
          queue.push(descendantId);
        }
      });
    }

    return descendants;
  }

  function getNodesToDelete(selectedIds: Iterable<string>) {
    const deleteIds = new Set(selectedIds);
    getDescendantNodeIds(deleteIds).forEach((nodeId) => deleteIds.add(nodeId));
    return deleteIds;
  }

  function deleteSelection() {
    const nodeIds = getSelectedNodeIds();

    if (nodeIds.length) {
      deleteNodesAndEdges(new Set(nodeIds));
      return;
    }

    if (!selectedEdgeIds.length) return;

    const message = selectedEdgeIds.length > 1 ? "Удалить выбранные связи?" : "Удалить выбранную связь?";
    if (!window.confirm(message)) return;

    const selectedEdgeIdSet = new Set(selectedEdgeIds);
    const nextEdges = edges.filter((edge) => !selectedEdgeIdSet.has(edge.id));
    commit(layoutFlowTree(nodes, nextEdges), nextEdges);
    setSelectedEdgeIds([]);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }

  function deleteNodesAndEdges(selectedIds: Set<string>) {
    if (!selectedIds.size) return;

    const deleteIds = getNodesToDelete(selectedIds);
    const removedEdges = edges.filter((edge) => deleteIds.has(edge.source) || deleteIds.has(edge.target));
    const childCount = [...deleteIds].filter((nodeId) => !selectedIds.has(nodeId)).length;
    const confirmText = selectedIds.size > 1 || childCount > 0
      ? `Удалить выбранные блоки?\n\nБудет удалено:\n- выбранных блоков: ${selectedIds.size}\n- дочерних блоков: ${childCount}\n- связей: ${removedEdges.length}\n\nПродолжить?`
      : "Удалить блок со схемы?";

    if (!window.confirm(confirmText)) return;

    if (mode === "project") {
      softDeletePartNodes(nodes.filter((node) => deleteIds.has(node.id) && node.data.blockType === "part"));
      setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
    }

    const nextNodes = nodes.filter((node) => !deleteIds.has(node.id));
    const nextEdges = edges.filter((edge) => !deleteIds.has(edge.source) && !deleteIds.has(edge.target));
    commit(layoutFlowTree(nextNodes, nextEdges), nextEdges);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  function updateSelectedEntity(patch: Record<string, unknown>) {
    if (!selectedNode) return;
    const nextNodes = nodes.map((node) => {
      if (node.id !== selectedNode.id) return node;
      const entity = { ...node.data.entity, ...patch } as FlowEntity;
      return refreshNode({ ...node, data: { ...node.data, entity } });
    });
    if (selectedNode.data.blockType === "part" || selectedNode.data.blockType === "project") {
      persistFlowEntities(nextNodes);
      if (selectedNode.data.blockType === "part") {
        setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
      }
    }
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
    if (mode === "project") {
      persistFlowOperationsForNodes(nodes, edges);
      setProject(loadProjectsFromStorage().find((item) => item.id === projectId) ?? project);
      setProjectParts(getActiveProjectParts(loadPartsFromStorage(), projectId));
      setOperations(getActiveProjectParts(loadPartsFromStorage(), projectId).flatMap((item) => sortOperationsByNumber(loadOperationsFromStorage(item.id))));
    } else if (partId) {
      persistFlowOperations(partId, nodes, edges);
      setPart(loadPartsFromStorage().find((item) => item.id === partId) ?? part);
      setProject(loadProjectsFromStorage().find((item) => item.id === (projectId ?? part?.projectId)));
      setOperations(sortOperationsByNumber(loadOperationsFromStorage(partId)));
    }
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
    persistFlowSnapshot(storageKey, previous.nodes, previous.edges);
    setDirty(true);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, { nodes, edges }]);
    setFuture((items) => items.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
    persistFlowSnapshot(storageKey, next.nodes, next.edges);
    setDirty(true);
  }

  function autoLayout() {
    commit(layoutFlowTree(nodes, edges), edges);
    window.setTimeout(() => flowInstanceRef.current?.fitView({ padding: 0.2 }), 0);
  }

  function showFullScheme() {
    flowInstanceRef.current?.fitView({ padding: 0.2 });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      editorRef.current?.requestFullscreen();
      setIsFullscreen(true);
      return;
    }

    document.exitFullscreen();
    setIsFullscreen(false);
  }

  if (mode === "part" && !part) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Деталь не найдена.</div>;
  }

  if (mode === "project" && !project) {
    return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Проект не найден.</div>;
  }

  const backHref = mode === "project" && project ? `/projects/${project.id}` : part ? `/parts/${part.id}` : "/projects";
  const backLabel = mode === "project" ? "Карточка проекта" : "Карточка детали";
  const editorTitle = mode === "project" && project ? `${project.code} · ${project.name}` : part ? `${part.code} · ${part.name}` : "";
  const editorSubtitle = mode === "project"
    ? `Проектная схема · деталей: ${projectParts.length}`
    : "Node-based редактор техпроцесса";

  return (
    <div ref={editorRef} className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={backHref} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">{backLabel}</Link>
          <div className="mr-2 min-w-0 text-sm">
            <div className="font-semibold text-slate-950">{editorTitle}</div>
            <div className="text-xs text-slate-500">{editorSubtitle}</div>
          </div>
          <button type="button" onClick={() => addBlock()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">+ Создать блок</button>
          <button type="button" onClick={autoLayout} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Автокомпоновка</button>
          <button type="button" onClick={showFullScheme} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Показать всю схему</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Есть несохранённые изменения</span> : null}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
            Колесо: {wheelMode === "pan" ? "движение" : "масштаб"}
          </span>
          <Link href="/settings" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            Настройки управления
          </Link>
          <button type="button" onClick={undo} disabled={!past.length} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Undo</button>
          <button type="button" onClick={redo} disabled={!future.length} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Redo</button>
          <button type="button" onClick={saveFlow} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Сохранить</button>
          <button type="button" onClick={toggleFullscreen} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">{isFullscreen ? "Окно" : "На весь экран"}</button>
        </div>
      </div>

      {message ? <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{message}</div> : null}

      <div ref={flowCanvasRef} className="relative min-h-0 flex-1">
        <section className="absolute inset-0 overflow-hidden bg-white">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={processNodeTypes}
            onInit={(instance) => {
              flowInstanceRef.current = instance;
              window.setTimeout(() => instance.fitView({ padding: 0.2 }), 0);
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedNodeIds([node.id]);
              setSelectedEdgeIds([]);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedNodeIds([]);
              setSelectedEdgeIds([]);
            }}
            onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
              const nodeIds = selectedNodes.map((node) => node.id);
              const edgeIds = selectedEdges.map((edge) => edge.id);
              const nextSelectedNodeId = nodeIds[0] ?? null;

              setSelectedNodeIds((currentIds) => areSameIds(currentIds, nodeIds) ? currentIds : nodeIds);
              setSelectedEdgeIds((currentIds) => areSameIds(currentIds, edgeIds) ? currentIds : edgeIds);
              setSelectedNodeId((currentId) => currentId === nextSelectedNodeId ? currentId : nextSelectedNodeId);
            }}
            panOnDrag={[1]}
            selectionOnDrag
            nodesDraggable
            elementsSelectable
            deleteKeyCode={null}
            panOnScroll={wheelMode === "pan"}
            zoomOnScroll={wheelMode === "zoom"}
            zoomOnPinch
            zoomOnDoubleClick={false}
            minZoom={0.05}
            maxZoom={3}
            preventScrolling
            fitView
          >
            <Background color="#cbd5e1" gap={18} />
            <MiniMap pannable zoomable nodeColor={(node) => nodeColor((node as ProcessFlowNode).data.blockType)} />
            <Controls />
          </ReactFlow>
        </section>

        {selectedNode ? (
          <div className="absolute inset-y-0 right-0 z-10 w-full max-w-md border-l border-slate-200 bg-white shadow-xl">
            <PropertiesPanel
              node={selectedNode}
              project={project}
              part={part}
              onTypeChange={updateSelectedType}
              onChange={updateSelectedEntity}
              onDelete={() => deleteBlock()}
              onClose={() => {
                setSelectedNodeId(null);
                setSelectedNodeIds([]);
                setSelectedEdgeIds([]);
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FlowBlockNode({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  const groupConfig = isGroupType(data.blockType) ? groupConfigByType[data.blockType] : undefined;
  const canAddChild = data.blockType !== "tool_position";

  return (
    <div className={`relative min-w-56 rounded-lg border bg-white p-3 pr-8 shadow-sm ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{flowTypeLabels[data.blockType]}</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">{data.title}</div>
          {data.subtitle ? <div className="mt-1 max-w-52 truncate text-xs text-slate-500">{data.subtitle}</div> : null}
        </div>
        <div className="flex gap-1">
          <button type="button" title="Удалить блок" onClick={(event) => dispatchNodeEvent(event, "tech-flow:delete-node", id)} className="rounded border border-rose-200 px-2 text-xs font-semibold text-rose-700">×</button>
        </div>
      </div>
      {data.canCollapseGroup ? (
        <button
          type="button"
          onClick={(event) => dispatchNodeEvent(event, "tech-flow:collapse-group", id)}
          className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
        >
          {groupConfigByType[data.canCollapseGroup].collapseLabel}
        </button>
      ) : null}
      {groupConfig ? (
        <button
          type="button"
          onClick={(event) => dispatchNodeEvent(event, "tech-flow:expand-group", id)}
          className="mt-3 rounded-md border border-blue-200 bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
        >
          Развернуть
        </button>
      ) : null}
      {canAddChild ? (
        <button
          type="button"
          title={groupConfig ? `Развернуть и добавить ${flowTypeLabels[groupConfig.childType].toLowerCase()}` : "Создать дочерний блок"}
          onClick={(event) => dispatchNodeEvent(event, "tech-flow:add-child", id)}
          className="absolute -right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-blue-200 bg-blue-600 text-base font-semibold leading-none text-white shadow-sm hover:bg-blue-700"
        >
          +
        </button>
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-blue-500" style={canAddChild ? undefined : { opacity: 0.35 }} />
    </div>
  );
}

const processNodeTypes = { processBlock: FlowBlockNode };

function dispatchNodeEvent(event: MouseEvent, name: string, id: string) {
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent(name, { detail: id }));
}

function areSameIds(first: string[], second: string[]) {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function isTextEditingTarget(target: HTMLElement | null) {
  if (!target) return false;
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

function PropertiesPanel({
  node,
  project,
  part,
  onTypeChange,
  onChange,
  onDelete,
  onClose,
}: {
  node?: ProcessFlowNode;
  project?: ProcessProject;
  part?: ProcessPart;
  onTypeChange: (type: FlowBlockType) => void;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!node) {
    return null;
  }

  const entity = node.data.entity as Record<string, any>;

  return (
    <aside className="h-full space-y-4 overflow-y-auto bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-blue-700">Свойства блока</div>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{node.data.title}</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onDelete} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Удалить</button>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Закрыть</button>
        </div>
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
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Проект: {project?.name ?? part?.projectId ?? entity.projectId}</div>
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

      {isGroupType(node.data.blockType) ? (
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <div className="font-semibold">Свернутая группа</div>
          <div>{entity.label}: {entity.countChildren ?? 0}</div>
          <div>Вложенных блоков: {entity.countDescendants ?? 0}</div>
        </div>
      ) : null}

      {node.data.blockType !== "unknown" && !isGroupType(node.data.blockType) ? (
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
    if (project) edges.push(createFlowEdge(`project-${project.id}`, `part-${part.id}`, `edge-${project.id}-${part.id}`));
  }

  operations.forEach((operation, operationIndex) => {
    nodes.push(createFlowNode("operation", { x: 620, y: 80 + operationIndex * 180 }, { entity: operation }));
    if (part) edges.push(createFlowEdge(`part-${part.id}`, `operation-${operation.id}`, `edge-${part.id}-${operation.id}`));

    operation.setups.forEach((setup, setupIndex) => {
      nodes.push(createFlowNode("setup", { x: 910, y: 80 + operationIndex * 180 + setupIndex * 90 }, { entity: setup }));
      edges.push(createFlowEdge(`operation-${operation.id}`, `setup-${setup.id}`, `edge-${operation.id}-${setup.id}`));

      setup.toolPositions.forEach((position, positionIndex) => {
        nodes.push(createFlowNode("tool_position", { x: 1200, y: 80 + operationIndex * 180 + setupIndex * 90 + positionIndex * 80 }, { entity: position }));
        edges.push(createFlowEdge(`setup-${setup.id}`, `position-${position.id}`, `edge-${setup.id}-${position.id}`));
      });
    });
  });

  return { nodes: layoutFlowTree(nodes, edges), edges };
}

function buildProjectFlow(project: ProcessProject | undefined, projectParts: ProcessPart[], operationsByPart: Map<string, ProcessOperation[]>): FlowSnapshot {
  const nodes: ProcessFlowNode[] = [];
  const edges: ProcessFlowEdge[] = [];

  if (!project) return { nodes, edges };

  nodes.push(createFlowNode("project", { x: 40, y: 80 }, { entity: project }));

  projectParts.forEach((part, partIndex) => {
    nodes.push(createFlowNode("part", { x: 400, y: 80 + partIndex * 220 }, { entity: part }));
    edges.push(createFlowEdge(`project-${project.id}`, `part-${part.id}`, `edge-${project.id}-${part.id}`));

    (operationsByPart.get(part.id) ?? []).forEach((operation, operationIndex) => {
      nodes.push(createFlowNode("operation", { x: 760, y: 80 + partIndex * 220 + operationIndex * 180 }, { entity: operation }));
      edges.push(createFlowEdge(`part-${part.id}`, `operation-${operation.id}`, `edge-${part.id}-${operation.id}`));

      operation.setups.forEach((setup, setupIndex) => {
        nodes.push(createFlowNode("setup", { x: 1120, y: 80 + partIndex * 220 + operationIndex * 180 + setupIndex * 90 }, { entity: setup }));
        edges.push(createFlowEdge(`operation-${operation.id}`, `setup-${setup.id}`, `edge-${operation.id}-${setup.id}`));

        setup.toolPositions.forEach((position, positionIndex) => {
          nodes.push(createFlowNode("tool_position", { x: 1480, y: 80 + partIndex * 220 + operationIndex * 180 + setupIndex * 90 + positionIndex * 80 }, { entity: position }));
          edges.push(createFlowEdge(`setup-${setup.id}`, `position-${position.id}`, `edge-${setup.id}-${position.id}`));
        });
      });
    });
  });

  return { nodes: layoutFlowTree(nodes, edges), edges };
}

function syncProjectFlow(snapshot: FlowSnapshot, project: ProcessProject, projectParts: ProcessPart[], operationsByPart: Map<string, ProcessOperation[]>): FlowSnapshot {
  const activePartIds = new Set(projectParts.map((part) => part.id));
  const removedPartNodeIds = snapshot.nodes
    .filter((node) => node.data.blockType === "part" && !activePartIds.has((node.data.entity as ProcessPart).id))
    .map((node) => node.id);
  const removeIds = new Set<string>(removedPartNodeIds);
  removedPartNodeIds.forEach((nodeId) => collectAllDescendantIds(snapshot.nodes, snapshot.edges, nodeId).forEach((id) => removeIds.add(id)));

  let nodes = snapshot.nodes.filter((node) => !removeIds.has(node.id));
  let edges = snapshot.edges.filter((edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target));

  const projectNodeId = `project-${project.id}`;
  if (nodes.some((node) => node.id === projectNodeId)) {
    nodes = nodes.map((node) => node.id === projectNodeId ? refreshNode({ ...node, data: { ...node.data, blockType: "project", entity: project } }) : node);
  } else {
    nodes.push(createFlowNode("project", { x: 40, y: 80 }, { entity: project }));
  }

  projectParts.forEach((part) => {
    const partNodeId = `part-${part.id}`;
    if (nodes.some((node) => node.id === partNodeId)) {
      nodes = nodes.map((node) => node.id === partNodeId ? refreshNode({ ...node, data: { ...node.data, blockType: "part", entity: part } }) : node);
    } else {
      nodes.push(createFlowNode("part", { x: 400, y: 80 }, { entity: part }));
    }

    if (!edges.some((edge) => edge.source === projectNodeId && edge.target === partNodeId)) {
      edges.push(createFlowEdge(projectNodeId, partNodeId, `edge-${project.id}-${part.id}`));
    }

    (operationsByPart.get(part.id) ?? []).forEach((operation) => {
      const operationNodeId = `operation-${operation.id}`;
      if (nodes.some((node) => node.id === operationNodeId)) {
        nodes = nodes.map((node) => node.id === operationNodeId ? refreshNode({ ...node, data: { ...node.data, blockType: "operation", entity: operation } }) : node);
      } else {
        nodes.push(createFlowNode("operation", { x: 760, y: 80 }, { entity: operation }));
      }

      if (!edges.some((edge) => edge.source === partNodeId && edge.target === operationNodeId)) {
        edges.push(createFlowEdge(partNodeId, operationNodeId, `edge-${part.id}-${operation.id}`));
      }
    });
  });

  return { nodes: layoutFlowTree(nodes, edges), edges };
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
    edges?: ProcessFlowEdge[];
  },
): ProcessFlowNode {
  const entity = context.entity ?? defaultEntity(blockType, context);
  return refreshNode({
    id: nodeId(blockType, entity),
    type: "processBlock",
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
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

function defaultEntity(blockType: FlowBlockType, context: { part?: ProcessPart; project?: ProcessProject; operations?: ProcessOperation[]; parentNode?: ProcessFlowNode; nodes?: ProcessFlowNode[]; edges?: ProcessFlowEdge[] }): FlowEntity {
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
      code: nextPartCode(context.nodes),
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
    const setupNo = nextChildNumber(context.nodes, context.edges, context.parentNode, "setup", (node) => (node.data.entity as OperationSetup).setupNo);
    return emptySetup(setupNo);
  }

  if (isGroupType(blockType)) {
    const config = groupConfigByType[blockType];
    return {
      id: createId(blockType),
      groupType: blockType,
      parentId: "",
      childType: config.childType,
      groupedNodeIds: [],
      groupedDescendantIds: [],
      label: config.label,
      countChildren: 0,
      countDescendants: 0,
      isCollapsed: true,
    } satisfies CollapsedGroupEntity;
  }

  if (blockType === "tool_position") {
    const positionNo = nextChildNumber(context.nodes, context.edges, context.parentNode, "tool_position", (node) => (node.data.entity as ToolPosition).positionNo);
    return { ...emptyToolPosition(positionNo), status: "Черновик" };
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
  if (isGroupType(blockType)) {
    return describeGroupNode(blockType, entity as CollapsedGroupEntity);
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
  const prefix = blockType === "tool_position" ? "position" : isGroupType(blockType) ? "group" : blockType;
  return typed.id ? `${prefix}-${typed.id}` : `${prefix}-${createId("node")}`;
}

function nodeColor(blockType: FlowBlockType) {
  if (blockType === "project") return "#1d4ed8";
  if (blockType === "part") return "#0891b2";
  if (blockType === "part_group") return "#0e7490";
  if (blockType === "operation") return "#2563eb";
  if (blockType === "operation_group") return "#1d4ed8";
  if (blockType === "setup") return "#7c3aed";
  if (blockType === "setup_group") return "#4f46e5";
  if (blockType === "tool_position") return "#ea580c";
  if (blockType === "tool_position_group") return "#c2410c";
  return "#64748b";
}

function isGroupType(blockType: FlowBlockType | undefined): blockType is GroupBlockType {
  return blockType === "part_group" || blockType === "operation_group" || blockType === "setup_group" || blockType === "tool_position_group";
}

function describeGroupNode(blockType: GroupBlockType, entity: CollapsedGroupEntity) {
  if (blockType === "part_group") {
    return { title: entity.label || "Детали", subtitle: `${entity.countChildren} детали · открыть список деталей` };
  }

  if (blockType === "operation_group") {
    return { title: entity.label || "Операции", subtitle: `${entity.countChildren} операции · сортировка по номеру` };
  }

  if (blockType === "setup_group") {
    return { title: entity.label || "Установы", subtitle: `${entity.countChildren} установа · ${countGroupedType(entity, "tool_position")} позиций` };
  }

  return { title: entity.label || "Инструментальные позиции", subtitle: `${entity.countChildren} позиций · Ячейка → Оправка → Инструмент` };
}

function countGroupedType(entity: CollapsedGroupEntity, blockType: FlowBlockType) {
  return entity.groupedDescendantIds.filter((id) => id.startsWith(`${blockType === "tool_position" ? "position" : blockType}-`)).length;
}

function compareFlowNodes(first: ProcessFlowNode, second: ProcessFlowNode) {
  if (first.data.blockType === "operation" && second.data.blockType === "operation") {
    return sortOperationsByNumber([first.data.entity as ProcessOperation, second.data.entity as ProcessOperation])[0].id === (first.data.entity as ProcessOperation).id ? -1 : 1;
  }

  if (first.data.blockType === "setup" && second.data.blockType === "setup") {
    return ((first.data.entity as OperationSetup).setupNo ?? 0) - ((second.data.entity as OperationSetup).setupNo ?? 0);
  }

  if (first.data.blockType === "tool_position" && second.data.blockType === "tool_position") {
    return ((first.data.entity as ToolPosition).positionNo ?? 0) - ((second.data.entity as ToolPosition).positionNo ?? 0);
  }

  return first.position.y - second.position.y || first.position.x - second.position.x;
}

function nextChildNumber(
  nodes: ProcessFlowNode[] | undefined,
  edges: ProcessFlowEdge[] | undefined,
  parentNode: ProcessFlowNode | undefined,
  childType: FlowBlockType,
  readNumber: (node: ProcessFlowNode) => number | undefined,
) {
  if (!nodes || !edges || !parentNode) return 1;

  const childNumbers = outgoing(nodes, edges, parentNode.id, childType)
    .map(readNumber)
    .filter((value): value is number => Number.isFinite(value));

  return childNumbers.length ? Math.max(...childNumbers) + 1 : 1;
}

function flowLevel(blockType: FlowBlockType) {
  if (blockType === "project") return 0;
  if (blockType === "part" || blockType === "part_group") return 1;
  if (blockType === "operation" || blockType === "operation_group") return 2;
  if (blockType === "setup" || blockType === "setup_group") return 3;
  if (blockType === "tool_position" || blockType === "tool_position_group") return 4;
  return 2;
}

function layoutFlowTree(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  const visibleNodes = nodes.filter((node) => !node.hidden);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => !edge.hidden && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  const incomingByTarget = new Map<string, ProcessFlowEdge[]>();
  const childrenBySource = new Map<string, ProcessFlowNode[]>();

  visibleEdges.forEach((edge) => {
    incomingByTarget.set(edge.target, [...(incomingByTarget.get(edge.target) ?? []), edge]);
    const target = visibleNodes.find((node) => node.id === edge.target);
    if (target) childrenBySource.set(edge.source, [...(childrenBySource.get(edge.source) ?? []), target]);
  });

  const roots = visibleNodes
    .filter((node) => !incomingByTarget.has(node.id))
    .sort((first, second) => flowLevel(first.data.blockType) - flowLevel(second.data.blockType) || compareFlowNodes(first, second));
  const positioned = new Map<string, { x: number; y: number }>();
  const visiting = new Set<string>();

  function subtreeHeight(node: ProcessFlowNode): number {
    if (visiting.has(node.id)) return NODE_HEIGHT + SUBTREE_SPACING;
    visiting.add(node.id);
    const children = (childrenBySource.get(node.id) ?? []).sort(compareFlowNodes);
    if (!children.length) {
      visiting.delete(node.id);
      return NODE_HEIGHT + SUBTREE_SPACING;
    }

    const height = Math.max(NODE_HEIGHT + SUBTREE_SPACING, children.reduce((sum, child) => sum + subtreeHeight(child), 0));
    visiting.delete(node.id);
    return height;
  }

  function placeNode(node: ProcessFlowNode, startY: number) {
    const x = 40 + flowLevel(node.data.blockType) * HORIZONTAL_SPACING;
    positioned.set(node.id, { x, y: startY });

    let childY = startY;
    const children = (childrenBySource.get(node.id) ?? []).sort(compareFlowNodes);
    children.forEach((child) => {
      placeNode(child, childY);
      childY += subtreeHeight(child);
    });
  }

  let cursorY = 80;
  roots.forEach((root) => {
    placeNode(root, cursorY);
    cursorY += subtreeHeight(root);
  });

  return nodes.map((node) => {
    const position = positioned.get(node.id);
    return position ? { ...node, position } : node;
  });
}

function createFlowEdge(source: string, target: string, id = createId("edge")): ProcessFlowEdge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: false,
    style: { stroke: "#2563eb", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#2563eb",
      width: 18,
      height: 18,
    },
  };
}

function normalizeFlowEdge(edge: ProcessFlowEdge): ProcessFlowEdge {
  return { ...createFlowEdge(edge.source, edge.target, edge.id), hidden: edge.hidden, selected: edge.selected };
}

function normalizeFlowNode(node: ProcessFlowNode): ProcessFlowNode {
  if (isGroupType(node.data.blockType)) {
    const config = groupConfigByType[node.data.blockType];
    const legacyEntity = node.data.entity as Partial<CollapsedGroupEntity> & { countSetups?: number; countToolPositions?: number };
    return refreshNode({
      ...node,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        ...node.data,
        entity: {
          id: legacyEntity.id ?? node.id,
          groupType: legacyEntity.groupType ?? node.data.blockType,
          parentId: legacyEntity.parentId ?? "",
          childType: legacyEntity.childType ?? config.childType,
          groupedNodeIds: legacyEntity.groupedNodeIds ?? [],
          groupedDescendantIds: legacyEntity.groupedDescendantIds ?? [],
          label: legacyEntity.label ?? config.label,
          countChildren: legacyEntity.countChildren ?? legacyEntity.countSetups ?? 0,
          countDescendants: legacyEntity.countDescendants ?? legacyEntity.countToolPositions ?? 0,
          isCollapsed: legacyEntity.isCollapsed ?? true,
        } satisfies CollapsedGroupEntity,
      },
    });
  }

  return {
    ...node,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };
}

function enrichFlowEdges(edges: ProcessFlowEdge[]) {
  return edges.map((edge) => ({
    ...edge,
    style: {
      ...(edge.style ?? {}),
      stroke: "#2563eb",
      strokeWidth: edge.selected ? 3 : 2,
    },
  }));
}

function enrichFlowNodes(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  return nodes.map((node) => {
    const config = groupConfigByParent[node.data.blockType];
    if (!config || node.hidden) {
      return node;
    }

    const hasGroup = outgoing(nodes, edges, node.id, config.groupType).some((child) => !child.hidden);
    const visibleChildren = outgoing(nodes, edges, node.id, config.childType).filter((child) => !child.hidden);
    return {
      ...node,
      data: {
        ...node.data,
        canCollapseGroup: visibleChildren.length >= 2 && !hasGroup ? config.groupType : undefined,
      },
    };
  });
}

function getNextChildPosition(parentNode: ProcessFlowNode, existingChildren: ProcessFlowNode[], allNodes: ProcessFlowNode[]) {
  const visibleChildren = existingChildren.filter((node) => !node.hidden);
  const nextY = visibleChildren.length
    ? Math.max(...visibleChildren.map((node) => node.position.y)) + VERTICAL_SPACING
    : parentNode.position.y;
  const basePosition = {
    x: parentNode.position.x + HORIZONTAL_SPACING,
    y: nextY,
  };

  return findFreePosition(basePosition, allNodes);
}

function isPositionOccupied(position: { x: number; y: number }, allNodes: ProcessFlowNode[], ignoredNodeIds = new Set<string>()) {
  return allNodes.some((node) => {
    if (node.hidden || ignoredNodeIds.has(node.id)) return false;
    return Math.abs(node.position.x - position.x) < NODE_WIDTH && Math.abs(node.position.y - position.y) < NODE_HEIGHT;
  });
}

function findFreePosition(position: { x: number; y: number }, allNodes: ProcessFlowNode[], ignoredNodeIds = new Set<string>()) {
  let nextPosition = { ...position };
  let guard = 0;

  while (isPositionOccupied(nextPosition, allNodes, ignoredNodeIds) && guard < 80) {
    nextPosition = { ...nextPosition, y: nextPosition.y + VERTICAL_SPACING };
    guard += 1;
  }

  return nextPosition;
}

function shiftOverlappingNodes(nodes: ProcessFlowNode[], movedNodeIds: string[]) {
  const movedIds = new Set(movedNodeIds);
  const nextNodes = [...nodes];

  for (const movedId of movedNodeIds) {
    const movedNode = nextNodes.find((node) => node.id === movedId);
    if (!movedNode) continue;

    let hasOverlap = true;
    let guard = 0;
    while (hasOverlap && guard < 80) {
      const overlap = nextNodes.find((node) => {
        if (node.id === movedNode.id || node.hidden || movedIds.has(node.id)) return false;
        return Math.abs(node.position.x - movedNode.position.x) < NODE_WIDTH && Math.abs(node.position.y - movedNode.position.y) < NODE_HEIGHT;
      });
      hasOverlap = Boolean(overlap);
      if (overlap) {
        overlap.position = { ...overlap.position, y: overlap.position.y + VERTICAL_SPACING };
      }
      guard += 1;
    }
  }

  return nextNodes;
}

function collectVisibleDescendantIds(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], sourceId: string): string[] {
  const children = edges
    .filter((edge) => edge.source === sourceId && !edge.hidden)
    .map((edge) => nodes.find((node) => node.id === edge.target))
    .filter((node): node is ProcessFlowNode => Boolean(node) && !node.hidden);

  return children.flatMap((node) => [node.id, ...collectVisibleDescendantIds(nodes, edges, node.id)]);
}

function collectAllDescendantIds(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], sourceId: string): string[] {
  const children = edges
    .filter((edge) => edge.source === sourceId)
    .map((edge) => nodes.find((node) => node.id === edge.target))
    .filter((node): node is ProcessFlowNode => Boolean(node));

  return children.flatMap((node) => [node.id, ...collectAllDescendantIds(nodes, edges, node.id)]);
}

function layoutExpandedGroup(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], parentNode: ProcessFlowNode, childIds: string[]) {
  const childIdSet = new Set(childIds);
  const childNodes = nodes
    .filter((node) => childIdSet.has(node.id))
    .sort(compareFlowNodes);

  let nextNodes = nodes.map((node) => ({ ...node, position: { ...node.position } }));
  childNodes.forEach((childNode, childIndex) => {
    const childPosition = findFreePosition(
      {
        x: parentNode.position.x + HORIZONTAL_SPACING,
        y: parentNode.position.y + childIndex * VERTICAL_SPACING,
      },
      nextNodes,
      childIdSet,
    );
    nextNodes = nextNodes.map((node) => node.id === childNode.id ? { ...node, position: childPosition } : node);

    nextNodes = layoutVisibleDescendants(nextNodes, edges, childNode.id, childPosition, childIdSet);
  });

  return nextNodes;
}

function layoutVisibleDescendants(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], parentId: string, parentPosition: { x: number; y: number }, ignoredNodeIds: Set<string>) {
  let nextNodes = nodes;
  const children = edges
    .filter((edge) => edge.source === parentId && !edge.hidden)
    .map((edge) => nextNodes.find((node) => node.id === edge.target))
    .filter((node): node is ProcessFlowNode => Boolean(node) && !node.hidden)
    .sort(compareFlowNodes);
  const childIds = new Set(children.map((node) => node.id));

  children.forEach((child, childIndex) => {
    const nextPosition = findFreePosition(
      {
        x: parentPosition.x + HORIZONTAL_SPACING,
        y: parentPosition.y + childIndex * VERTICAL_SPACING,
      },
      nextNodes,
      new Set([...ignoredNodeIds, ...childIds]),
    );
    nextNodes = nextNodes.map((node) => node.id === child.id ? { ...node, position: nextPosition } : node);
    nextNodes = layoutVisibleDescendants(nextNodes, edges, child.id, nextPosition, new Set([...ignoredNodeIds, ...childIds]));
  });

  return nextNodes;
}

function nextPartCode(nodes?: ProcessFlowNode[]) {
  const count = nodes?.filter((node) => node.data.blockType === "part").length ?? 0;
  return `ТП-${String(count + 1).padStart(3, "0")}`;
}

function persistFlowSnapshot(storageKey: string, nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  window.localStorage.setItem(storageKey, JSON.stringify({ nodes, edges }));
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

  saveOperationsToStorage(partId, sortOperationsByNumber(nextOperations));
}

function persistFlowOperationsForNodes(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  const partNodes = nodes.filter((node) => node.data.blockType === "part" && !node.hidden);
  partNodes.forEach((partNode) => {
    const part = partNode.data.entity as ProcessPart;
    const operationNodes = outgoing(nodes, edges, partNode.id, "operation");
    const operationIds = new Set(operationNodes.map((node) => node.id));
    const scopedNodes = nodes.filter((node) => node.id === partNode.id || operationIds.has(node.id) || [...operationIds].some((operationId) => collectAllDescendantIds(nodes, edges, operationId).includes(node.id)));
    persistFlowOperations(part.id, scopedNodes, edges);
  });
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

function getActiveProjectParts(parts: ProcessPart[], projectId?: string) {
  return parts.filter((part) =>
    part.projectId === projectId &&
    !part.isDeleted &&
    part.status !== "Архив" &&
    part.status !== "Выполнена",
  );
}

function getOperationsByPart(parts: ProcessPart[]) {
  return new Map(parts.map((part) => [part.id, sortOperationsByNumber(loadOperationsFromStorage(part.id))]));
}

function findNearestPart(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], nodeId: string): ProcessPart | undefined {
  const node = nodes.find((item) => item.id === nodeId);
  if (node?.data.blockType === "part") return node.data.entity as ProcessPart;

  const incomingEdge = edges.find((edge) => edge.target === nodeId);
  if (!incomingEdge) return undefined;

  return findNearestPart(nodes, edges, incomingEdge.source);
}

function softDeletePartNodes(partNodes: ProcessFlowNode[]) {
  if (!partNodes.length) return;

  const partIds = new Set(partNodes.map((node) => (node.data.entity as ProcessPart).id));
  const date = new Date().toLocaleDateString("ru-RU");
  savePartsToStorage(loadPartsFromStorage().map((part) =>
    partIds.has(part.id) ? { ...part, isDeleted: true, deletedAt: date, updatedAt: date } : part,
  ));
}

function outgoing(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], sourceId: string, blockType: FlowBlockType) {
  const targetIds = new Set(edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target));
  return nodes.filter((node) => targetIds.has(node.id) && node.data.blockType === blockType);
}
