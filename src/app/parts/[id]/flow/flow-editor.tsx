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
import { holders, machineCells, machines, tools, type Holder, type MachineCell, type Tool } from "../../../mock-data";
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
  entityType?: FlowBlockType | "group";
  entityId?: string;
  title: string;
  subtitle?: string;
  entity: FlowEntity;
  canCollapseGroup?: GroupBlockType;
};

type ProcessFlowNode = Node<FlowNodeData, "processBlock">;
type ProcessFlowEdge = Edge;
type FlowSnapshot = { nodes: ProcessFlowNode[]; edges: ProcessFlowEdge[] };
type FlowEditorMode = "part" | "project" | "projects";
type ProjectsFlowView = "active" | "archive";
type ConfirmDialogState = {
  title: string;
  body?: string;
  details?: string[];
  confirmLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
};

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
const TOOL_POSITION_NODE_HEIGHT = 72;
const HORIZONTAL_SPACING = 360;
const VERTICAL_SPACING = 160;
const TOOL_POSITION_VERTICAL_SPACING = 88;
const SUBTREE_SPACING = 80;
const FLOW_HOLDERS_STORAGE_KEY = "tech-process-flow-holders";
const FLOW_TOOLS_STORAGE_KEY = "tech-process-flow-tools";
const PROPERTIES_PANEL_WIDTH_KEY = "tech-process-flow-properties-width";
const DEFAULT_PROPERTIES_PANEL_WIDTH = 420;
const MIN_PROPERTIES_PANEL_WIDTH = 360;
const MAX_PROPERTIES_PANEL_WIDTH = 900;

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

const statusOptions: OperationStatus[] = ["Черновик", "В работе", "Требует уточнения", "Готово", "Выполнен", "Выполнена", "Архив"];
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
  initialView = "active",
}: {
  partId?: string;
  projectId?: string;
  initialPart?: ProcessPart;
  initialProject?: ProcessProject;
  mode?: FlowEditorMode;
  initialView?: ProjectsFlowView;
}) {
  const [part, setPart] = useState<ProcessPart | undefined>(initialPart);
  const [project, setProject] = useState<ProcessProject | undefined>();
  const [projectParts, setProjectParts] = useState<ProcessPart[]>([]);
  const [projects, setProjects] = useState<ProcessProject[]>([]);
  const [projectsView, setProjectsView] = useState<ProjectsFlowView>(initialView);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId);
  const [selectedPartId, setSelectedPartId] = useState<string | undefined>(partId);
  const suppressSelectionRef = useRef(false);
  const [operations, setOperations] = useState<ProcessOperation[]>([]);
  const [nodes, setNodes] = useState<ProcessFlowNode[]>([]);
  const [edges, setEdges] = useState<ProcessFlowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nodesUnlocked, setNodesUnlocked] = useState(false);
  const [wheelMode, setWheelMode] = useState<FlowWheelMode>("pan");
  const [catalogHolders, setCatalogHolders] = useState<Holder[]>(holders);
  const [catalogTools, setCatalogTools] = useState<Tool[]>(tools);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [past, setPast] = useState<FlowSnapshot[]>([]);
  const [future, setFuture] = useState<FlowSnapshot[]>([]);
  const [propertiesPanelWidth, setPropertiesPanelWidth] = useState(DEFAULT_PROPERTIES_PANEL_WIDTH);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const flowCanvasRef = useRef<HTMLDivElement | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<ProcessFlowNode, ProcessFlowEdge> | null>(null);
  const resizingPropertiesPanelRef = useRef(false);

  const storageKey = mode === "projects" ? "tech-process-flow-projects" : mode === "project" ? `tech-process-flow-project-${projectId}` : `tech-process:flow:${partId}`;
  const visualFlow = useMemo(() => withToolPositionGroups(nodes, edges), [edges, nodes]);
  const selectedNode = useMemo(() => visualFlow.nodes.find((node) => node.id === selectedNodeId), [selectedNodeId, visualFlow.nodes]);
  const displayNodes = useMemo(() => enrichFlowNodes(visualFlow.nodes, visualFlow.edges), [visualFlow.edges, visualFlow.nodes]);
  const displayEdges = useMemo(() => enrichFlowEdges(visualFlow.edges), [visualFlow.edges]);

  const commit = useCallback((nextNodes: ProcessFlowNode[], nextEdges: ProcessFlowEdge[]) => {
    setPast((items) => [...items.slice(-20), { nodes, edges }]);
    setFuture([]);
    setNodes(nextNodes);
    setEdges(nextEdges);
    persistFlowSnapshot(storageKey, nextNodes, nextEdges);
    persistFlowData(nextNodes, nextEdges);
    setDirty(true);
    setMessage("");
  }, [edges, mode, nodes, partId, selectedPartId, storageKey]);

  function persistFlowData(nextNodes: ProcessFlowNode[], nextEdges: ProcessFlowEdge[]) {
    persistFlowEntities(nextNodes);

    if (mode === "project") {
      persistFlowOperationsForNodes(nextNodes, nextEdges);
      return;
    }

    if (mode === "projects") {
      persistFlowOperationsForNodes(nextNodes, nextEdges, selectedPartId);
      return;
    }

    if (partId) {
      persistFlowOperations(partId, nextNodes, nextEdges);
    }
  }

  useEffect(() => {
    const loadedParts = loadPartsFromStorage();
    const loadedProjects = loadProjectsFromStorage();
    setCatalogHolders(loadFlowHolders());
    setCatalogTools(loadFlowTools());
    const visibleProjects = getVisibleProjects(loadedProjects, projectsView);
    const nextPart = loadedParts.find((item) => item.id === partId) ?? initialPart;
    const nextProject = loadedProjects.find((item) => item.id === (projectId ?? selectedProjectId ?? nextPart?.projectId)) ?? initialProject;
    const activeProjectParts = nextProject ? getActiveProjectParts(loadedParts, nextProject.id) : [];
    const nextOperations = mode === "project"
      ? activeProjectParts.flatMap((item) => sortOperationsByNumber(loadOperationsFromStorage(item.id)))
      : mode === "projects"
        ? getPartsForProjects(loadedParts, visibleProjects, projectsView).flatMap((item) => sortOperationsByNumber(loadOperationsFromStorage(item.id)))
      : partId ? sortOperationsByNumber(loadOperationsFromStorage(partId)) : [];

    setPart(nextPart);
    setProject(nextProject);
    setProjects(loadedProjects);
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
        const synced = mode === "projects"
          ? syncProjectsFlow(savedSnapshot, visibleProjects, loadedParts, selectedProjectId, selectedPartId, projectsView)
          : mode === "project" && nextProject
          ? syncProjectFlow(savedSnapshot, nextProject, activeProjectParts, getOperationsByPart(activeProjectParts))
          : savedSnapshot;
        setNodes(synced.nodes);
        setEdges(synced.edges);
        persistFlowSnapshot(storageKey, synced.nodes, synced.edges);
        const nextSelectionId = selectionIdForSyncedFlow(synced.nodes, mode, selectedProjectId, selectedPartId);
        setSelectedNodeId(nextSelectionId);
        setSelectedNodeIds(nextSelectionId ? [nextSelectionId] : []);
        setSelectedEdgeIds([]);
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    const initial = mode === "projects"
      ? buildProjectsFlow(visibleProjects, loadedParts, selectedProjectId, selectedPartId, projectsView)
      : mode === "project"
      ? buildProjectFlow(nextProject, activeProjectParts, getOperationsByPart(activeProjectParts))
      : buildInitialFlow(nextProject, nextPart, nextOperations);
    setNodes(initial.nodes);
    setEdges(initial.edges);
    const nextSelectionId = selectionIdForSyncedFlow(initial.nodes, mode, selectedProjectId, selectedPartId);
    setSelectedNodeId(nextSelectionId);
    setSelectedNodeIds(nextSelectionId ? [nextSelectionId] : []);
    setSelectedEdgeIds([]);
    persistFlowSnapshot(storageKey, initial.nodes, initial.edges);
  }, [initialPart, initialProject, mode, partId, projectId, projectsView, selectedPartId, selectedProjectId, storageKey]);

  useEffect(() => {
    function loadFlowControls() {
      setWheelMode(parseFlowControls(window.localStorage.getItem(FLOW_CONTROLS_STORAGE_KEY)).wheelMode);
    }

    loadFlowControls();
    window.addEventListener("storage", loadFlowControls);
    return () => window.removeEventListener("storage", loadFlowControls);
  }, []);

  useEffect(() => {
    const savedWidth = Number.parseInt(window.localStorage.getItem(PROPERTIES_PANEL_WIDTH_KEY) ?? "", 10);
    if (Number.isFinite(savedWidth)) {
      setPropertiesPanelWidth(clampNumber(savedWidth, MIN_PROPERTIES_PANEL_WIDTH, MAX_PROPERTIES_PANEL_WIDTH));
    }
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
      const visualNode = withToolPositionGroups(nodes, edges).nodes.find((node) => node.id === id);
      if (visualNode?.data.blockType === "tool_position_group") {
        const group = visualNode.data.entity as CollapsedGroupEntity;
        addPositionToSetup(group.parentId);
        return;
      }
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
    commit(layoutAfterStructuralChange(nextNodes, nextEdges, mode, selectedProjectId), nextEdges);
  }

  function addBlock(parentId: string | null | undefined = selectedNodeId) {
    const parentNode = parentId ? nodes.find((node) => node.id === parentId) : undefined;

    if (isGroupType(parentNode?.data.blockType)) {
      expandChildGroup(parentNode.id, true);
      return;
    }

    const blockType = parentNode
      ? childTypeByParent[parentNode.data.blockType] ?? (parentNode.data.blockType === "unknown" ? "unknown" : undefined)
      : mode === "projects" ? "project" : "unknown";

    if (!blockType) {
      setMessage("Инструментальная позиция — конечный блок цепочки");
      return;
    }

    if (blockType === "tool_position" && parentNode?.data.blockType === "setup") {
      const groupId = toolPositionGroupNodeId(parentNode.id);
      const existingGroup = nodes.find((node) => node.id === groupId);
      if (existingGroup) {
        selectFlowNode(existingGroup.id);
        return;
      }

      createToolPositionGroupForSetup(parentNode);
      return;
    }

    const position = parentNode
      ? getNextChildPosition(parentNode, outgoing(nodes, edges, parentNode.id, blockType), nodes)
      : blockType === "project"
        ? getNextProjectRootPosition(nodes)
        : findFreePosition({ x: 220, y: 160 }, nodes);
    const contextPart = parentNode ? findNearestPart(nodes, edges, parentNode.id) ?? part : part;
    const contextProject = parentNode ? findNearestProject(nodes, edges, parentNode.id) ?? project : project;
    const contextOperations = contextPart ? sortOperationsByNumber(loadOperationsFromStorage(contextPart.id)) : operations;
    const node = createFlowNode(blockType, position, { part: contextPart, project: contextProject, operations: contextOperations, parentNode, nodes, edges });
    const nextEdges = parentNode
      ? [...edges, createFlowEdge(parentNode.id, node.id)]
      : edges;

    const committedNodes = [...nodes, node];
    if ((mode === "project" || mode === "projects") && (blockType === "part" || blockType === "project")) {
      persistFlowEntities(committedNodes);
      const loadedParts = loadPartsFromStorage();
      const loadedProjects = loadProjectsFromStorage();
      setProjects(loadedProjects);
      setProjectParts(getActiveProjectParts(loadedParts, project?.id));
      if (blockType === "project") setSelectedProjectId((node.data.entity as ProcessProject).id);
    }

    commit(layoutAfterStructuralChange(committedNodes, nextEdges, mode, selectedProjectId), nextEdges);
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeIds([]);
  }

  function addPositionToSetup(setupNodeId: string) {
    const setupNode = nodes.find((node) => node.id === setupNodeId && node.data.blockType === "setup");
    if (!setupNode) return;

    const entity = { ...emptyToolPosition(nextChildNumber(nodes, edges, setupNode, "tool_position", (node) => (node.data.entity as ToolPosition).positionNo)), setupId: (setupNode.data.entity as OperationSetup).id };
    const node = createFlowNode("tool_position", getNextChildPosition(setupNode, outgoing(nodes, edges, setupNode.id, "tool_position"), nodes), { entity });
    const nextEdges = [...edges, createFlowEdge(setupNode.id, node.id)];
    const nextNodes = [...nodes, { ...node, hidden: true }];
    commit(layoutAfterStructuralChange(nextNodes, nextEdges, mode, selectedProjectId), nextEdges);
    const groupId = toolPositionGroupNodeId(setupNode.id);
    setSelectedNodeId(groupId);
    setSelectedNodeIds([groupId]);
    setSelectedEdgeIds([]);
  }

  function createToolPositionGroupForSetup(setupNode: ProcessFlowNode) {
    const groupId = toolPositionGroupNodeId(setupNode.id);
    const existingGroup = nodes.find((node) => node.id === groupId);
    if (existingGroup) {
      selectFlowNode(existingGroup.id);
      return;
    }

    const groupEntity = createToolPositionGroupEntity(setupNode, []);
    const groupNode = createToolPositionGroupNode(setupNode, groupEntity);
    const nextEdges = [...edges, createFlowEdge(setupNode.id, groupNode.id, `edge-${setupNode.id}-${groupNode.id}`)];
    const nextNodes = [...nodes, groupNode];
    commit(layoutAfterStructuralChange(nextNodes, nextEdges, mode, selectedProjectId), nextEdges);
    setSelectedNodeId(groupNode.id);
    setSelectedNodeIds([groupNode.id]);
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

    commit(layoutAfterStructuralChange(nextNodes, nextEdges, mode, selectedProjectId), nextEdges);
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
      const contextProject = findNearestProject(layoutNodes, nextEdges, parentNode.id) ?? project;
      const contextOperations = contextPart ? sortOperationsByNumber(loadOperationsFromStorage(contextPart.id)) : operations;
      const node = createFlowNode(childType, getNextChildPosition(parentNode, childNodes, layoutNodes), { part: contextPart, project: contextProject, operations: contextOperations, parentNode, nodes: layoutNodes, edges: nextEdges });
      const finalEdges = [...nextEdges, createFlowEdge(parentNode.id, node.id)];
      const finalNodes = [...layoutNodes, node];
      if ((mode === "project" || mode === "projects") && childType === "part") {
        persistFlowEntities(finalNodes);
        setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
      }
      commit(layoutAfterStructuralChange(finalNodes, finalEdges, mode, selectedProjectId), finalEdges);
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
      setSelectedEdgeIds([]);
      return;
    }

    commit(layoutAfterStructuralChange(layoutNodes, nextEdges, mode, selectedProjectId), nextEdges);
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

    requestConfirm({
      title: selectedEdgeIds.length > 1 ? "Удалить выбранные связи?" : "Удалить выбранную связь?",
      body: "Связи будут удалены со схемы. Блоки останутся на месте.",
      confirmLabel: "Удалить",
      tone: "danger",
      onConfirm: () => {
        const selectedEdgeIdSet = new Set(selectedEdgeIds);
        const nextEdges = edges.filter((edge) => !selectedEdgeIdSet.has(edge.id));
        commit(layoutAfterStructuralChange(nodes, nextEdges, mode, selectedProjectId), nextEdges);
        setSelectedEdgeIds([]);
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
      },
    });
  }

  function deleteNodesAndEdges(selectedIds: Set<string>) {
    if (!selectedIds.size) return;

    const deleteIds = getNodesToDelete(selectedIds);
    const removedEdges = edges.filter((edge) => deleteIds.has(edge.source) || deleteIds.has(edge.target));
    const childCount = [...deleteIds].filter((nodeId) => !selectedIds.has(nodeId)).length;
    requestConfirm({
      title: selectedIds.size > 1 || childCount > 0 ? "Удалить выбранные блоки?" : "Удалить блок со схемы?",
      body: childCount > 0 ? "Дочерние элементы выбранных блоков тоже будут удалены." : "Действие изменит схему и связанные данные.",
      details: [
        `Выбранных блоков: ${selectedIds.size}`,
        `Дочерних блоков: ${childCount}`,
        `Связей: ${removedEdges.length}`,
      ],
      confirmLabel: "Удалить",
      tone: "danger",
      onConfirm: () => {
        if (mode === "project") {
          softDeletePartNodes(nodes.filter((node) => deleteIds.has(node.id) && node.data.blockType === "part"));
          setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
        } else if (mode === "projects") {
          softDeleteProjectNodes(nodes.filter((node) => deleteIds.has(node.id) && node.data.blockType === "project"));
          softDeletePartNodes(nodes.filter((node) => deleteIds.has(node.id) && node.data.blockType === "part"));
          setProjects(loadProjectsFromStorage());
        }

        const nextNodes = nodes.filter((node) => !deleteIds.has(node.id));
        const nextEdges = edges.filter((edge) => !deleteIds.has(edge.source) && !deleteIds.has(edge.target));
        commit(layoutAfterStructuralChange(nextNodes, nextEdges, mode, selectedProjectId), nextEdges);
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
      },
    });
  }

  function updateSelectedEntity(patch: Record<string, unknown>) {
    if (!selectedNode) return;
    updateNodeEntity(selectedNode.id, patch);
  }

  function updateNodeEntity(nodeId: string, patch: Record<string, unknown>) {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) return;

    let nextNodes = nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const entity = { ...node.data.entity, ...patch } as FlowEntity;
      return refreshNode({ ...node, data: { ...node.data, entity } });
    });
    if (targetNode.data.blockType === "part" || targetNode.data.blockType === "project") {
      persistFlowEntities(nextNodes);
      if (targetNode.data.blockType === "part") {
        setProjectParts(getActiveProjectParts(loadPartsFromStorage(), project?.id));
      }
    }
    if (mode === "projects" && targetNode.data.blockType === "project" && "priority" in patch) {
      nextNodes = reorderProjectRootsByPriority(nextNodes, edges);
    }
    commit(nextNodes, edges);
  }

  function selectFlowNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    setSelectedEdgeIds([]);
  }

  function duplicateToolPosition(positionNodeId: string) {
    const positionNode = nodes.find((node) => node.id === positionNodeId && node.data.blockType === "tool_position");
    const setupNode = positionNode ? findParentNode(nodes, edges, positionNode.id, "setup") : undefined;
    if (!positionNode || !setupNode) return;

    const position = positionNode.data.entity as ToolPosition;
    const positionNo = nextChildNumber(nodes, edges, setupNode, "tool_position", (node) => (node.data.entity as ToolPosition).positionNo);
    const entity: ToolPosition = {
      ...position,
      id: createId("position"),
      positionNo,
      cellSource: "required",
      cellId: undefined,
      cellManualText: "",
    };
    const node = createFlowNode("tool_position", getNextChildPosition(setupNode, outgoing(nodes, edges, setupNode.id, "tool_position"), nodes), { entity });
    const nextEdges = [...edges, createFlowEdge(setupNode.id, node.id)];
    const nextNodes = [...nodes, { ...node, hidden: true }];
    commit(layoutAfterStructuralChange(nextNodes, nextEdges, mode, selectedProjectId), nextEdges);
    selectFlowNode(toolPositionGroupNodeId(setupNode.id));
  }

  function createHolderFromName(name: string) {
    const date = new Date().toLocaleDateString("ru-RU");
    const holder: Holder = {
      id: createId("holder"),
      code: `H-${Date.now()}`,
      name,
      type: "Оправка инструмента",
      status: "В справочнике",
    };
    const nextHolders = [...catalogHolders, holder];
    saveFlowHolders(nextHolders);
    setCatalogHolders(nextHolders);
    setMessage(`Оправка создана: ${name}`);
    void date;
    return holder;
  }

  function createToolFromName(name: string) {
    const tool: Tool = {
      id: createId("tool"),
      code: `T-${Date.now()}`,
      name,
      type: "Инструмент",
      status: "В справочнике",
    };
    const nextTools = [...catalogTools, tool];
    saveFlowTools(nextTools);
    setCatalogTools(nextTools);
    setMessage(`Инструмент создан: ${name}`);
    return tool;
  }

  function archiveSelectedProject() {
    if (!selectedNode || selectedNode.data.blockType !== "project") return;
    requestConfirm({
      title: "Перенести проект в архив?",
      body: "Проект будет скрыт из активной схемы и появится в архивном режиме.",
      confirmLabel: "В архив",
      tone: "danger",
      onConfirm: () => {
        const projectEntity = selectedNode.data.entity as ProcessProject;
        const date = new Date().toLocaleDateString("ru-RU");
        const nextProjects = loadProjectsFromStorage().map((item) => item.id === projectEntity.id ? { ...item, status: "Архив" as OperationStatus, updatedAt: date } : item);
        saveProjectsToStorage(nextProjects);
        setProjects(nextProjects);
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        setSelectedProjectId(undefined);
        const synced = syncProjectsFlow({ nodes, edges }, getVisibleProjects(nextProjects, projectsView), loadPartsFromStorage(), undefined, undefined, projectsView);
        commit(synced.nodes, synced.edges);
      },
    });
  }

  function restoreSelectedProject() {
    if (!selectedNode || selectedNode.data.blockType !== "project") return;
    const projectEntity = selectedNode.data.entity as ProcessProject;
    const date = new Date().toLocaleDateString("ru-RU");
    const nextProjects = loadProjectsFromStorage().map((item) => item.id === projectEntity.id ? { ...item, isDeleted: false, deletedAt: null, status: "В работе" as OperationStatus, updatedAt: date } : item);
    saveProjectsToStorage(nextProjects);
    setProjects(nextProjects);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedProjectId(undefined);
    const synced = syncProjectsFlow({ nodes, edges }, getVisibleProjects(nextProjects, projectsView), loadPartsFromStorage(), undefined, undefined, projectsView);
    commit(synced.nodes, synced.edges);
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
    } else if (mode === "projects") {
      persistFlowOperationsForNodes(nodes, edges, selectedPartId);
      const loadedProjects = loadProjectsFromStorage();
      const loadedParts = loadPartsFromStorage();
      setProjects(loadedProjects);
      setOperations(getPartsForProjects(loadedParts, getVisibleProjects(loadedProjects, projectsView), projectsView).flatMap((item) => sortOperationsByNumber(loadOperationsFromStorage(item.id))));
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
    const nextNodes = mode === "projects" ? layoutProjectsFlowKeepingProjectPositions(nodes, edges, selectedProjectId) : layoutFlowTree(nodes, edges);
    commit(nextNodes, edges);
    window.setTimeout(() => flowInstanceRef.current?.fitView({ padding: 0.2 }), 0);
  }

  function showFullScheme() {
    flowInstanceRef.current?.fitView({ padding: 0.2 });
  }

  function changeWheelMode(nextMode: FlowWheelMode) {
    setWheelMode(nextMode);
    window.localStorage.setItem(FLOW_CONTROLS_STORAGE_KEY, JSON.stringify({ wheelMode: nextMode }));
  }

  function requestConfirm(dialog: ConfirmDialogState) {
    setConfirmDialog(dialog);
  }

  function closePropertiesPanel() {
    suppressSelectionRef.current = true;
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    window.setTimeout(() => {
      suppressSelectionRef.current = false;
    }, 0);
  }

  function startPropertiesPanelResize(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    resizingPropertiesPanelRef.current = true;
    const startX = event.clientX;
    const startWidth = propertiesPanelWidth;
    let latestWidth = startWidth;

    function handleMouseMove(moveEvent: globalThis.MouseEvent) {
      if (!resizingPropertiesPanelRef.current) return;

      const viewportMaxWidth = Math.max(MIN_PROPERTIES_PANEL_WIDTH, Math.min(MAX_PROPERTIES_PANEL_WIDTH, window.innerWidth - 96));
      latestWidth = clampNumber(startWidth + startX - moveEvent.clientX, MIN_PROPERTIES_PANEL_WIDTH, viewportMaxWidth);
      setPropertiesPanelWidth(latestWidth);
    }

    function handleMouseUp() {
      resizingPropertiesPanelRef.current = false;
      window.localStorage.setItem(PROPERTIES_PANEL_WIDTH_KEY, String(Math.round(latestWidth)));
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
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

  const backHref = mode === "projects" ? "/" : mode === "project" && project ? `/projects/${project.id}` : part ? `/parts/${part.id}` : "/projects";
  const backLabel = mode === "projects" ? "Главная" : mode === "project" ? "Карточка проекта" : "Карточка детали";
  const editorTitle = mode === "projects" ? "Проекты" : mode === "project" && project ? `${project.code} · ${project.name}` : part ? `${part.code} · ${part.name}` : "";
  const editorSubtitle = mode === "projects"
    ? "Создавайте проекты, детали и техпроцессы прямо на схеме"
    : mode === "project"
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
          <button type="button" onClick={() => addBlock(mode === "projects" ? null : undefined)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">{mode === "projects" ? "+ Создать проект" : "+ Создать блок"}</button>
          <button type="button" onClick={autoLayout} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Автокомпоновка</button>
          <button type="button" onClick={showFullScheme} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Показать всю схему</button>
          {mode === "projects" ? (
            <div className="flex rounded-md border border-slate-200 bg-white p-1">
              {[
                ["active", "Активные проекты"],
                ["archive", "Архив"],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => {
                  setProjectsView(value as ProjectsFlowView);
                  setSelectedProjectId(undefined);
                  window.history.replaceState(null, "", value === "archive" ? "/projects?view=archive" : "/projects");
                }} className={`rounded px-3 py-1.5 text-sm font-semibold ${projectsView === value ? "bg-blue-600 text-white" : "text-slate-600"}`}>{label}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Есть несохранённые изменения</span> : null}
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
            Колесо:
            <select
              value={wheelMode}
              onChange={(event) => changeWheelMode(event.target.value as FlowWheelMode)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              <option value="pan">движение</option>
              <option value="zoom">масштаб</option>
            </select>
          </label>
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
              if (mode === "projects" && node.data.blockType === "project") {
                const nextProjectId = (node.data.entity as ProcessProject).id;
                setSelectedProjectId((currentId) => {
                  if (currentId !== nextProjectId) setSelectedPartId(undefined);
                  return nextProjectId;
                });
              }
              if (mode === "projects" && node.data.blockType === "part") {
                setSelectedPartId((node.data.entity as ProcessPart).id);
              }
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedNodeIds([]);
              setSelectedEdgeIds([]);
            }}
            onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
              if (suppressSelectionRef.current) return;
              const nodeIds = selectedNodes.map((node) => node.id);
              const edgeIds = selectedEdges.map((edge) => edge.id);
              const nextSelectedNodeId = nodeIds[0] ?? null;

              setSelectedNodeIds((currentIds) => areSameIds(currentIds, nodeIds) ? currentIds : nodeIds);
              setSelectedEdgeIds((currentIds) => areSameIds(currentIds, edgeIds) ? currentIds : edgeIds);
              setSelectedNodeId((currentId) => currentId === nextSelectedNodeId ? currentId : nextSelectedNodeId);
            }}
            panOnDrag={[1]}
            selectionOnDrag
            nodesDraggable={nodesUnlocked}
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
            <Controls onInteractiveChange={(interactive) => setNodesUnlocked(interactive)} />
          </ReactFlow>
        </section>

        {selectedNode ? (
          <div
            className="absolute inset-y-0 right-0 z-10 border-l border-slate-200 bg-white shadow-xl"
            style={{
              width: `${propertiesPanelWidth}px`,
              maxWidth: "calc(100vw - 96px)",
            }}
          >
            <button
              type="button"
              aria-label="Изменить ширину панели свойств"
              className="group absolute inset-y-0 left-0 z-20 w-3 -translate-x-1.5 cursor-col-resize bg-transparent transition hover:bg-blue-500/10"
              onMouseDown={startPropertiesPanelResize}
            >
              <span className="absolute left-1/2 top-1/2 h-14 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 transition group-hover:bg-blue-400" />
            </button>
            <PropertiesPanel
              node={selectedNode}
              project={project}
              part={part}
              onTypeChange={updateSelectedType}
              onChange={updateSelectedEntity}
              onDelete={() => deleteBlock()}
              onArchiveProject={archiveSelectedProject}
              onRestoreProject={restoreSelectedProject}
              isArchiveView={projectsView === "archive"}
              onClose={closePropertiesPanel}
              nodes={nodes}
              edges={edges}
              holdersCatalog={catalogHolders}
              toolsCatalog={catalogTools}
              cellsCatalog={machineCells}
              onSelectNode={selectFlowNode}
              onPatchNode={updateNodeEntity}
              onAddPosition={addPositionToSetup}
              onDuplicatePosition={duplicateToolPosition}
              onDeletePosition={(positionNodeId) => deleteBlock(positionNodeId)}
              onCreateHolder={createHolderFromName}
              onCreateTool={createToolFromName}
            />
          </div>
        ) : null}
        {confirmDialog ? (
          <ConfirmDialog
            dialog={confirmDialog}
            onCancel={() => setConfirmDialog(null)}
            onConfirm={() => {
              const action = confirmDialog.onConfirm;
              setConfirmDialog(null);
              action();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ConfirmDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: ConfirmDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="text-sm font-semibold uppercase text-blue-700">Подтверждение действия</div>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">{dialog.title}</h3>
        {dialog.body ? <p className="mt-2 text-sm text-slate-600">{dialog.body}</p> : null}
        {dialog.details?.length ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {dialog.details.map((item) => <div key={item}>{item}</div>)}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Отмена</button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-2 text-sm font-semibold text-white ${dialog.tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {dialog.confirmLabel ?? "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FlowBlockNode({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  const groupConfig = isGroupType(data.blockType) ? groupConfigByType[data.blockType] : undefined;
  const canAddChild = data.blockType !== "tool_position";
  const entity = data.entity as Record<string, any>;
  const isArchivedProject = data.blockType === "project" && (entity.isDeleted || entity.status === "Архив" || entity.status === "Выполнен");
  const archiveLabel = entity.isDeleted ? "УДАЛЁН" : entity.status === "Выполнен" ? "ВЫПОЛНЕН" : isArchivedProject ? "АРХИВ" : "";
  const statusLabel = typeof entity.status === "string" ? entity.status : "";
  const addTooltip = addTooltipByType(data.blockType, groupConfig);

  const compactPosition = data.blockType === "tool_position";

  return (
    <div className={`relative w-[260px] overflow-visible rounded-lg border bg-white p-3 pr-11 shadow-sm ${compactPosition ? "h-[72px]" : "h-[120px]"} ${isArchivedProject ? "opacity-90" : ""} ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"}`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-500" />
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex h-5 items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">{flowTypeLabels[data.blockType]}</div>
          {archiveLabel ? <div className="inline-flex rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">{archiveLabel}</div> : null}
        </div>
        <div className={`mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-950 ${compactPosition ? "min-h-0" : "min-h-9"}`}>{data.title}</div>
        {data.subtitle ? <div className="mt-1 max-w-44 truncate text-xs text-slate-500">{data.subtitle}</div> : null}
        {data.blockType === "project" ? <div className="mt-auto pb-5 text-xs font-semibold text-slate-500">Деталей: {entity.partCount ?? 0}</div> : null}
      </div>
      <button type="button" title="Удалить блок" onClick={(event) => dispatchNodeEvent(event, "tech-flow:delete-node", id)} className="absolute right-3 top-3 rounded border border-rose-200 bg-white/80 px-2 text-xs font-semibold text-rose-700">×</button>
      {canAddChild && addTooltip ? (
        <FlowNodeAddButton
          tooltipText={addTooltip}
          onAdd={(event) => dispatchNodeEvent(event, "tech-flow:add-child", id)}
        />
      ) : null}
      {data.blockType === "project" && statusLabel ? (
        <div className="absolute bottom-3 right-3 max-w-28 truncate rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
          {statusLabel}
        </div>
      ) : null}
      {data.canCollapseGroup && data.blockType !== "project" ? (
        <button
          type="button"
          onClick={(event) => dispatchNodeEvent(event, "tech-flow:collapse-group", id)}
          className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
        >
          {groupConfigByType[data.canCollapseGroup].collapseLabel}
        </button>
      ) : null}
      {groupConfig && data.blockType !== "tool_position_group" ? (
        <button
          type="button"
          onClick={(event) => dispatchNodeEvent(event, "tech-flow:expand-group", id)}
          className="mt-3 rounded-md border border-blue-200 bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
        >
          Развернуть
        </button>
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-blue-500" style={canAddChild ? undefined : { opacity: 0.35 }} />
    </div>
  );
}

function FlowNodeAddButton({
  tooltipText,
  onAdd,
}: {
  tooltipText: string;
  onAdd: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={tooltipText}
      onClick={onAdd}
      className="group absolute right-4 top-1/2 z-50 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] bg-transparent text-[#64748b] opacity-75 transition-all duration-150 ease-out hover:z-[1000] hover:bg-[rgba(37,99,235,0.12)] hover:text-[#60a5fa] hover:opacity-100 hover:shadow-[0_0_12px_rgba(59,130,246,0.35)]"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="h-6 w-6 overflow-visible"
      >
        <path
          d="M19 8 L27 16 L19 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 16 H16 M12 12 V20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="pointer-events-none absolute left-1/2 top-full z-[1000] mt-2 max-w-36 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-blue-400/40 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-blue-100 opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100">
        {tooltipText}
      </span>
    </button>
  );
}

function addTooltipByType(blockType: FlowBlockType, groupConfig?: NonNullable<(typeof groupConfigByParent)[FlowBlockType]>) {
  if (groupConfig) return `Развернуть и добавить ${flowTypeLabels[groupConfig.childType].toLowerCase()}`;
  if (blockType === "project") return "Создать деталь";
  if (blockType === "part") return "Создать операцию";
  if (blockType === "operation") return "Создать установ";
  if (blockType === "setup") return "Создать позицию";
  return "";
}

const processNodeTypes = { processBlock: FlowBlockNode };

function dispatchNodeEvent(event: MouseEvent, name: string, id: string) {
  event.preventDefault();
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
  onArchiveProject,
  onRestoreProject,
  isArchiveView,
  onClose,
  nodes,
  edges,
  holdersCatalog,
  toolsCatalog,
  cellsCatalog,
  onSelectNode,
  onPatchNode,
  onAddPosition,
  onDuplicatePosition,
  onDeletePosition,
  onCreateHolder,
  onCreateTool,
}: {
  node?: ProcessFlowNode;
  project?: ProcessProject;
  part?: ProcessPart;
  onTypeChange: (type: FlowBlockType) => void;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onArchiveProject?: () => void;
  onRestoreProject?: () => void;
  isArchiveView?: boolean;
  onClose: () => void;
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
  holdersCatalog: Holder[];
  toolsCatalog: Tool[];
  cellsCatalog: MachineCell[];
  onSelectNode: (nodeId: string) => void;
  onPatchNode: (nodeId: string, patch: Record<string, unknown>) => void;
  onAddPosition: (setupNodeId: string) => void;
  onDuplicatePosition: (positionNodeId: string) => void;
  onDeletePosition: (positionNodeId: string) => void;
  onCreateHolder: (name: string) => Holder;
  onCreateTool: (name: string) => Tool;
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
          {node.data.blockType === "project" && !isArchiveView ? <button type="button" onClick={onArchiveProject} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">В архив</button> : null}
          {node.data.blockType === "project" && isArchiveView ? <button type="button" onClick={onRestoreProject} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">Восстановить</button> : null}
          <button type="button" onClick={onDelete} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Удалить</button>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Закрыть</button>
        </div>
      </div>

      <Field label="Тип блока">
        <select value={node.data.blockType} onChange={(event) => onTypeChange(event.target.value as FlowBlockType)} className="field">
          {Object.entries(flowTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>

      {node.data.blockType === "tool_position_group" ? (
        <ToolPositionQuickPanel
          node={node}
          nodes={nodes}
          edges={edges}
          holdersCatalog={holdersCatalog}
          toolsCatalog={toolsCatalog}
          cellsCatalog={cellsCatalog}
          onSelectNode={onSelectNode}
          onPatchNode={onPatchNode}
          onAddPosition={onAddPosition}
          onDuplicatePosition={onDuplicatePosition}
          onDeletePosition={onDeletePosition}
          onCreateHolder={onCreateHolder}
          onCreateTool={onCreateTool}
        />
      ) : null}

      {node.data.blockType === "project" ? (
        <>
          <TextField label="Код проекта" value={entity.code} onChange={(value) => onChange({ code: value })} />
          <TextField label="Название" value={entity.name} onChange={(value) => onChange({ name: value })} />
          <TextField label="Заказчик" value={entity.customer} onChange={(value) => onChange({ customer: value })} />
          <TextareaField label="Описание" value={entity.description} onChange={(value) => onChange({ description: value })} />
          <Field label="Степень важности">
            <select value={entity.priority ?? "normal"} onChange={(event) => onChange({ priority: event.target.value })} className="field">
              <option value="high">Важный</option>
              <option value="normal">Обычный</option>
              <option value="low">Низкий</option>
            </select>
          </Field>
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

      {node.data.blockType === "tool_position" ? null : null}

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

function ToolPositionQuickPanel({
  node,
  nodes,
  edges,
  holdersCatalog,
  toolsCatalog,
  cellsCatalog,
  onSelectNode,
  onPatchNode,
  onAddPosition,
  onDuplicatePosition,
  onDeletePosition,
  onCreateHolder,
  onCreateTool,
}: {
  node: ProcessFlowNode;
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
  holdersCatalog: Holder[];
  toolsCatalog: Tool[];
  cellsCatalog: MachineCell[];
  onSelectNode: (nodeId: string) => void;
  onPatchNode: (nodeId: string, patch: Record<string, unknown>) => void;
  onAddPosition: (setupNodeId: string) => void;
  onDuplicatePosition: (positionNodeId: string) => void;
  onDeletePosition: (positionNodeId: string) => void;
  onCreateHolder: (name: string) => Holder;
  onCreateTool: (name: string) => Tool;
}) {
  const setupNode = resolveSetupForPositionPanel(node, nodes, edges);
  const positions = setupNode ? outgoing(nodes, edges, setupNode.id, "tool_position").sort(compareFlowNodes) : [];
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(positions[0]?.id ?? null);
  const selectedPositionNode = positions.find((position) => position.id === selectedPositionId) ?? positions[0];
  const operationNode = setupNode ? findParentNode(nodes, edges, setupNode.id, "operation") : undefined;
  const operation = operationNode?.data.entity as ProcessOperation | undefined;
  const cellOptions = operation?.machineSource === "catalog" && operation.machineId
    ? cellsCatalog.filter((cell) => cell.machineId === operation.machineId)
    : [];

  if (!setupNode) return null;
  const setup = setupNode.data.entity as OperationSetup;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-950">Инструментальные позиции</div>
          <div className="text-xs text-slate-500">Установ: {setup.name} · Позиций: {positions.length}</div>
        </div>
        <button type="button" onClick={() => onAddPosition(setupNode.id)} className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white">+ Добавить</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!selectedPositionNode} onClick={() => selectedPositionNode && onDuplicatePosition(selectedPositionNode.id)} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40">Дублировать выбранную</button>
        <button type="button" disabled={!selectedPositionNode} onClick={() => selectedPositionNode && onDeletePosition(selectedPositionNode.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40">Удалить выбранную</button>
      </div>

      {positions.length ? (
        <div className="max-h-[58vh] overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="min-w-[1180px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
              <tr>
                {["№", "Ячейка станка", "Основная оправка / блок", "Доп. оснастка", "Тип инструмента", "Инструмент / державка", "Пластина", "Кол-во", "Статус", "Комментарий"].map((header) => (
                  <th key={header} className="border-b border-slate-200 px-2 py-2 font-semibold">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((positionNode) => {
                const position = positionNode.data.entity as ToolPosition & Record<string, any>;
                const active = selectedPositionNode?.id === positionNode.id;
                const toolKind = (position.toolKind ?? (position.indexableHolderId || position.insertId ? "indexable" : "solid")) as "solid" | "indexable" | "other";
                const conflict = cellConflictLabel(nodes, edges, positionNode, holdersCatalog, toolsCatalog);
                return (
                  <tr key={positionNode.id} onClick={() => setSelectedPositionId(positionNode.id)} className={active ? "bg-blue-50" : ""}>
                    <td className="w-16 border-b border-slate-100 p-2 align-top">
                      <input value={String(position.positionNo ?? "")} onChange={(event) => onPatchNode(positionNode.id, { positionNo: Number.parseInt(event.target.value, 10) || 1 })} className="field px-2 py-1 text-xs" />
                    </td>
                    <td className="w-40 border-b border-slate-100 p-2 align-top">
                      <NomenclatureCombobox label="" value={position.machineCellId ?? position.cellId} options={cellOptions} placeholder={operation?.machineId ? "Ячейка" : "Сначала станок"} getOptionLabel={(cell) => cell.label} allowCreate={false} disabled={!operation?.machineId} onSelectExisting={(cell) => onPatchNode(positionNode.id, { machineCellId: cell.id, machineCellName: cell.label, cellSource: "catalog", cellId: cell.id, cellManualText: "" })} onClear={() => onPatchNode(positionNode.id, { machineCellId: undefined, machineCellName: "", cellSource: "required", cellId: undefined, cellManualText: "" })} />
                      {conflict ? <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800" title={conflict}>Ячейка занята</div> : null}
                    </td>
                    <td className="w-48 border-b border-slate-100 p-2 align-top">
                      <NomenclatureCombobox label="" value={position.mainHolderId ?? position.holderId} options={holdersCatalog} placeholder="Оправка / блок" createLabel="Создать" getOptionLabel={(holder) => holder.name} onSelectExisting={(holder) => onPatchNode(positionNode.id, { mainHolderId: holder.id, mainHolderName: holder.name, holderSource: "catalog", holderId: holder.id, holderManualText: "" })} onCreateNew={(name) => { const holder = onCreateHolder(name); onPatchNode(positionNode.id, { mainHolderId: holder.id, mainHolderName: holder.name, holderSource: "catalog", holderId: holder.id, holderManualText: "" }); }} onClear={() => onPatchNode(positionNode.id, { mainHolderId: undefined, mainHolderName: "", holderSource: "required", holderId: undefined, holderManualText: "" })} />
                    </td>
                    <td className="w-44 border-b border-slate-100 p-2 align-top">
                      <input value={position.auxiliaryText ?? ""} onChange={(event) => onPatchNode(positionNode.id, { auxiliaryText: event.target.value, auxiliaryItems: event.target.value ? [{ id: "aux-text", type: "other", name: event.target.value, quantity: 1, comment: "" }] : [] })} className="field px-2 py-1 text-xs" placeholder="—" />
                    </td>
                    <td className="w-36 border-b border-slate-100 p-2 align-top">
                      <select value={toolKind} onChange={(event) => onPatchNode(positionNode.id, { toolKind: event.target.value })} className="field px-2 py-1 text-xs">
                        <option value="solid">Монолитный</option>
                        <option value="indexable">СМП</option>
                        <option value="other">Прочее</option>
                      </select>
                    </td>
                    <td className="w-52 border-b border-slate-100 p-2 align-top">
                      {toolKind === "indexable" ? (
                        <NomenclatureCombobox label="" value={position.indexableHolderId} options={toolsCatalog} placeholder="Державка / корпус" createLabel="Создать" getOptionLabel={(tool) => tool.name} onSelectExisting={(tool) => onPatchNode(positionNode.id, { indexableHolderId: tool.id, indexableHolderName: tool.name, toolId: undefined, solidToolId: undefined })} onCreateNew={(name) => { const tool = onCreateTool(name); onPatchNode(positionNode.id, { indexableHolderId: tool.id, indexableHolderName: tool.name, toolId: undefined, solidToolId: undefined }); }} onClear={() => onPatchNode(positionNode.id, { indexableHolderId: undefined, indexableHolderName: "" })} />
                      ) : toolKind === "solid" ? (
                        <NomenclatureCombobox label="" value={position.solidToolId ?? position.toolId} options={toolsCatalog} placeholder="Инструмент" createLabel="Создать" getOptionLabel={(tool) => tool.name} onSelectExisting={(tool) => onPatchNode(positionNode.id, { solidToolId: tool.id, solidToolName: tool.name, toolSource: "catalog", toolId: tool.id, toolManualText: "", indexableHolderId: undefined })} onCreateNew={(name) => { const tool = onCreateTool(name); onPatchNode(positionNode.id, { solidToolId: tool.id, solidToolName: tool.name, toolSource: "catalog", toolId: tool.id, toolManualText: "", indexableHolderId: undefined }); }} onClear={() => onPatchNode(positionNode.id, { solidToolId: undefined, solidToolName: "", toolSource: "required", toolId: undefined, toolManualText: "" })} />
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="w-44 border-b border-slate-100 p-2 align-top">
                      {toolKind === "indexable" ? (
                        <NomenclatureCombobox label="" value={position.insertId} options={toolsCatalog} placeholder="Пластина" createLabel="Создать" getOptionLabel={(tool) => tool.name} onSelectExisting={(tool) => onPatchNode(positionNode.id, { insertId: tool.id, insertName: tool.name })} onCreateNew={(name) => { const tool = onCreateTool(name); onPatchNode(positionNode.id, { insertId: tool.id, insertName: tool.name }); }} onClear={() => onPatchNode(positionNode.id, { insertId: undefined, insertName: "" })} />
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="w-20 border-b border-slate-100 p-2 align-top">
                      <input value={String(position.quantity ?? 1)} onChange={(event) => onPatchNode(positionNode.id, { quantity: Number.parseInt(event.target.value, 10) || 1 })} className="field px-2 py-1 text-xs" />
                    </td>
                    <td className="w-36 border-b border-slate-100 p-2 align-top">
                      <select value={position.status} onChange={(event) => onPatchNode(positionNode.id, { status: event.target.value as OperationStatus })} className="field px-2 py-1 text-xs">
                        {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td className="w-48 border-b border-slate-100 p-2 align-top">
                      <input value={position.comment ?? ""} onChange={(event) => onPatchNode(positionNode.id, { comment: event.target.value })} className="field px-2 py-1 text-xs" placeholder="—" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">Позиции пока не созданы</div>
      )}
      {selectedPositionNode ? <div className="text-[11px] text-slate-500">Выбрана позиция {(selectedPositionNode.data.entity as ToolPosition).positionNo}. TODO: В будущем сделать зависимые меню для совместимых оправок, доп. оснастки, инструмента и пластин.</div> : null}
    </div>
  );
}

function ToolPositionEditor({
  positionNode,
  holdersCatalog,
  toolsCatalog,
  cellOptions,
  cellConflict,
  hasMachine,
  onPatch,
  onDuplicate,
  onDelete,
  onCreateHolder,
  onCreateTool,
}: {
  positionNode: ProcessFlowNode;
  holdersCatalog: Holder[];
  toolsCatalog: Tool[];
  cellOptions: MachineCell[];
  cellConflict: string;
  hasMachine: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCreateHolder: (name: string) => Holder;
  onCreateTool: (name: string) => Tool;
}) {
  const position = positionNode.data.entity as ToolPosition;

  return (
    <div className="space-y-3">
      <TextField label="№ позиции" value={String(position.positionNo ?? "")} onChange={(value) => onPatch({ positionNo: Number.parseInt(value, 10) || 1 })} />
      <NomenclatureCombobox
        label="Ячейка станка"
        value={position.cellId}
        options={cellOptions}
        placeholder={hasMachine ? "Выберите ячейку" : "Сначала выберите станок операции"}
        getOptionLabel={(cell) => cell.label}
        allowCreate={false}
        disabled={!hasMachine}
        onSelectExisting={(cell) => onPatch({ cellSource: "catalog", cellId: cell.id, cellManualText: "" })}
        onClear={() => onPatch({ cellSource: "required", cellId: undefined, cellManualText: "" })}
      />
      {cellConflict ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{cellConflict}</div> : null}
      <NomenclatureCombobox
        label="Оправка инструмента"
        value={position.holderId}
        options={holdersCatalog}
        placeholder="Найти или создать оправку"
        createLabel="Создать оправку"
        getOptionLabel={(holder) => holder.name}
        onSelectExisting={(holder) => onPatch({ holderSource: "catalog", holderId: holder.id, holderManualText: "" })}
        onCreateNew={(name) => {
          const holder = onCreateHolder(name);
          onPatch({ holderSource: "catalog", holderId: holder.id, holderManualText: "" });
        }}
        onClear={() => onPatch({ holderSource: "required", holderId: undefined, holderManualText: "" })}
      />
      <NomenclatureCombobox
        label="Инструмент"
        value={position.toolId}
        options={toolsCatalog}
        placeholder="Найти или создать инструмент"
        createLabel="Создать инструмент"
        getOptionLabel={(tool) => tool.name}
        onSelectExisting={(tool) => onPatch({ toolSource: "catalog", toolId: tool.id, toolManualText: "" })}
        onCreateNew={(name) => {
          const tool = onCreateTool(name);
          onPatch({ toolSource: "catalog", toolId: tool.id, toolManualText: "" });
        }}
        onClear={() => onPatch({ toolSource: "required", toolId: undefined, toolManualText: "" })}
      />
      <TextField label="Количество" value={String(position.quantity ?? 1)} onChange={(value) => onPatch({ quantity: Number.parseInt(value, 10) || 1 })} />
      <StatusField value={position.status} onChange={(value) => onPatch({ status: value })} />
      <TextareaField label="Комментарий" value={position.comment} onChange={(value) => onPatch({ comment: value })} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onDuplicate} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">Дублировать</button>
        <button type="button" onClick={onDelete} className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Удалить</button>
      </div>
      <div className="text-[11px] text-slate-500">
        TODO: В будущем добавить правила подбора по типу оправки, совместимости инструмента и предупреждениям.
      </div>
    </div>
  );
}

function NomenclatureCombobox<T extends { id: string }>({
  label,
  value,
  options,
  placeholder,
  onSelectExisting,
  onCreateNew,
  onClear,
  getOptionLabel,
  allowCreate = true,
  createLabel = "Создать",
  disabled = false,
}: {
  label: string;
  value?: string;
  options: T[];
  placeholder: string;
  onSelectExisting: (option: T) => void;
  onCreateNew?: (text: string) => void;
  onClear: () => void;
  getOptionLabel: (option: T) => string;
  allowCreate?: boolean;
  createLabel?: string;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) => getOptionLabel(option).toLowerCase().includes(normalizedQuery)).slice(0, 8)
    : options.slice(0, 8);
  const hasExact = options.some((option) => getOptionLabel(option).trim().toLowerCase() === normalizedQuery);
  const canCreate = allowCreate && Boolean(normalizedQuery) && !hasExact && onCreateNew;

  return (
    <div className="relative space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        {value ? <button type="button" onClick={() => { onClear(); setQuery(""); }} className="text-xs font-semibold text-slate-500 hover:text-rose-600">Очистить</button> : null}
      </div>
      <input
        value={open ? query : selected ? getOptionLabel(selected) : ""}
        onFocus={() => {
          setOpen(true);
          setQuery(selected ? getOptionLabel(selected) : "");
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        disabled={disabled}
        className="field"
        placeholder={placeholder}
      />
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectExisting(option);
                setQuery(getOptionLabel(option));
                setOpen(false);
              }}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              {getOptionLabel(option)}
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onCreateNew?.(query.trim());
                setQuery(query.trim());
                setOpen(false);
              }}
              className="w-full rounded px-2 py-1.5 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              + {createLabel}: {query.trim()}
            </button>
          ) : null}
          {!filtered.length && !canCreate ? <div className="px-2 py-2 text-sm text-slate-500">Ничего не найдено</div> : null}
        </div>
      ) : null}
    </div>
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

function buildProjectsFlow(projects: ProcessProject[], parts: ProcessPart[], selectedProjectId: string | undefined, selectedPartId: string | undefined, view: ProjectsFlowView): FlowSnapshot {
  return syncProjectsFlow({ nodes: [], edges: [] }, projects, parts, selectedProjectId, selectedPartId, view);
}

function syncProjectsFlow(snapshot: FlowSnapshot, projects: ProcessProject[], parts: ProcessPart[], selectedProjectId: string | undefined, selectedPartId: string | undefined, view: ProjectsFlowView): FlowSnapshot {
  const visibleProjectIds = new Set(projects.map((project) => project.id));
  const keepIds = new Set<string>();
  let nodes = snapshot.nodes.filter((node) => {
    if (node.data.blockType === "project") return visibleProjectIds.has((node.data.entity as ProcessProject).id);
    return false;
  });
  let edges: ProcessFlowEdge[] = [];

  projects.forEach((project, index) => {
    const projectNodeId = `project-${project.id}`;
    const projectParts = getProjectPartsForView(parts, project, view);
    const projectEntity = { ...project, partCount: projectParts.length } as ProcessProject & { partCount: number };
    const existing = nodes.find((node) => node.id === projectNodeId);
    const projectNode = existing
      ? refreshNode({ ...existing, hidden: false, data: { ...existing.data, blockType: "project", entity: projectEntity } })
      : createFlowNode("project", { x: 40, y: 80 + index * VERTICAL_SPACING }, { entity: projectEntity });
    nodes = [...nodes.filter((node) => node.id !== projectNodeId), projectNode];
    keepIds.add(projectNodeId);

    if (selectedProjectId !== project.id) return;

    const expandedParts = selectedPartId ? projectParts.filter((part) => part.id === selectedPartId) : [];
    const operationsByPart = getOperationsByPart(expandedParts);
    const branch = buildProjectFlow(project, projectParts, operationsByPart);
    const branchProjectNode = branch.nodes.find((node) => node.id === projectNodeId);
    const offsetX = projectNode.position.x - (branchProjectNode?.position.x ?? projectNode.position.x);
    const offsetY = projectNode.position.y - (branchProjectNode?.position.y ?? projectNode.position.y);
    branch.nodes.forEach((branchNode) => {
      if (branchNode.id === projectNodeId) return;
      nodes = [
        ...nodes.filter((node) => node.id !== branchNode.id),
        {
          ...branchNode,
          position: {
            x: branchNode.position.x + offsetX,
            y: branchNode.position.y + offsetY,
          },
        },
      ];
      keepIds.add(branchNode.id);
    });
    branch.edges.forEach((edge) => {
      edges = [...edges.filter((item) => item.id !== edge.id), edge];
    });
  });

  nodes = nodes.filter((node) => keepIds.has(node.id));
  return {
    nodes,
    edges,
  };
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

      operation.setups.forEach((setup) => {
        const setupNodeId = `setup-${setup.id}`;
        if (nodes.some((node) => node.id === setupNodeId)) {
          nodes = nodes.map((node) => node.id === setupNodeId ? refreshNode({ ...node, data: { ...node.data, blockType: "setup", entity: setup } }) : node);
        } else {
          nodes.push(createFlowNode("setup", { x: 1120, y: 80 }, { entity: setup }));
        }

        if (!edges.some((edge) => edge.source === operationNodeId && edge.target === setupNodeId)) {
          edges.push(createFlowEdge(operationNodeId, setupNodeId, `edge-${operation.id}-${setup.id}`));
        }

        setup.toolPositions.forEach((position) => {
          const positionNodeId = `position-${position.id}`;
          if (nodes.some((node) => node.id === positionNodeId)) {
            nodes = nodes.map((node) => node.id === positionNodeId ? refreshNode({ ...node, hidden: true, data: { ...node.data, blockType: "tool_position", entity: position } }) : node);
          } else {
            nodes.push({ ...createFlowNode("tool_position", { x: 1480, y: 80 }, { entity: position }), hidden: true });
          }

          if (!edges.some((edge) => edge.source === setupNodeId && edge.target === positionNodeId)) {
            edges.push(createFlowEdge(setupNodeId, positionNodeId, `edge-${setup.id}-${position.id}`));
          }
        });
      });
    });
  });

  return { nodes: layoutFlowTree(nodes, edges), edges };
}

function layoutProjectsFlowKeepingProjectPositions(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], selectedProjectId: string | undefined) {
  if (!selectedProjectId) return nodes;

  const selectedProjectNodeId = `project-${selectedProjectId}`;
  const selectedProject = nodes.find((node) => node.id === selectedProjectNodeId);
  if (!selectedProject) return nodes;

  const projectPositions = new Map(
    nodes
      .filter((node) => node.data.blockType === "project")
      .map((node) => [node.id, node.position]),
  );
  const branchIds = new Set([selectedProjectNodeId, ...collectAllDescendantIds(nodes, edges, selectedProjectNodeId)]);
  const branchNodes = nodes.filter((node) => branchIds.has(node.id));
  const branchEdges = edges.filter((edge) => branchIds.has(edge.source) && branchIds.has(edge.target));
  const laidOutBranch = layoutFlowTree(branchNodes, branchEdges);
  const laidOutProject = laidOutBranch.find((node) => node.id === selectedProjectNodeId);
  const offsetX = selectedProject.position.x - (laidOutProject?.position.x ?? selectedProject.position.x);
  const offsetY = selectedProject.position.y - (laidOutProject?.position.y ?? selectedProject.position.y);
  const branchById = new Map(
    laidOutBranch.map((node) => [
      node.id,
      {
        ...node,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY,
        },
      },
    ]),
  );

  return nodes.map((node) => {
    if (node.data.blockType === "project") {
      return { ...node, position: projectPositions.get(node.id) ?? node.position };
    }

    return branchById.get(node.id) ?? node;
  });
}

function layoutAfterStructuralChange(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], mode: FlowEditorMode, selectedProjectId: string | undefined) {
  return mode === "projects" ? layoutProjectsFlowKeepingProjectPositions(nodes, edges, selectedProjectId) : layoutFlowTree(nodes, edges);
}

function reorderProjectRootsByPriority(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  const projectNodes = nodes
    .filter((node) => node.data.blockType === "project")
    .sort((first, second) => compareProjectsByPriority(first.data.entity as ProcessProject, second.data.entity as ProcessProject));
  const offsets = new Map<string, number>();

  projectNodes.forEach((node, index) => {
    offsets.set(node.id, 80 + index * VERTICAL_SPACING - node.position.y);
  });

  const nodeToProject = new Map<string, string>();
  projectNodes.forEach((projectNode) => {
    nodeToProject.set(projectNode.id, projectNode.id);
    collectAllDescendantIds(nodes, edges, projectNode.id).forEach((descendantId) => {
      nodeToProject.set(descendantId, projectNode.id);
    });
  });

  return nodes.map((node) => {
    const projectNodeId = nodeToProject.get(node.id);
    const offsetY = projectNodeId ? offsets.get(projectNodeId) ?? 0 : 0;
    if (!offsetY) return node;
    return { ...node, position: { ...node.position, y: node.position.y + offsetY } };
  });
}

function selectionIdForSyncedFlow(nodes: ProcessFlowNode[], mode: FlowEditorMode, selectedProjectId: string | undefined, selectedPartId: string | undefined) {
  const preferredId = mode === "projects"
    ? selectedPartId ? `part-${selectedPartId}` : selectedProjectId ? `project-${selectedProjectId}` : undefined
    : undefined;

  if (preferredId && nodes.some((node) => node.id === preferredId)) {
    return preferredId;
  }

  return nodes[0]?.id ?? null;
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
      entityType: isGroupType(blockType) ? "group" : blockType,
      entityId: (entity as { id?: string }).id,
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
      priority: "normal",
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
    const partId = context.part?.id ?? "local-part";
    return emptyOperation(partId, nextOperationNoForPart(context, partId));
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
  if (blockType === "project") return { title: entity.name || "Новый проект", subtitle: `${entity.customer || "Заказчик не задан"} · ${priorityLabel(entity.priority)}` };
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
    const cell = entity.cellSource === "catalog" ? catalogCellName(entity.cellId) : entity.cellSource === "manual" ? entity.cellManualText : "—";
    const holder = entity.holderSource === "catalog" ? catalogHolderName(entity.holderId) : entity.holderSource === "manual" ? entity.holderManualText : "—";
    const tool = entity.toolSource === "catalog" ? catalogToolName(entity.toolId) : entity.toolSource === "manual" ? entity.toolManualText : "—";
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

function priorityLabel(priority?: string) {
  if (priority === "high") return "Важный";
  if (priority === "low") return "Низкий";
  return "Обычный";
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

  const filledCount = (entity as CollapsedGroupEntity & { filledCount?: number }).filledCount ?? 0;
  const conflictsCount = (entity as CollapsedGroupEntity & { conflictsCount?: number }).conflictsCount ?? 0;
  if (!entity.countChildren) return { title: entity.label || "Инструментальные позиции", subtitle: "Позиций: 0 · нажмите +, чтобы добавить" };
  return {
    title: entity.label || "Инструментальные позиции",
    subtitle: `Позиций: ${entity.countChildren} · Заполнено: ${filledCount}/${entity.countChildren}${conflictsCount ? ` · Конфликты: ${conflictsCount}` : ""}`,
  };
}

function countGroupedType(entity: CollapsedGroupEntity, blockType: FlowBlockType) {
  return entity.groupedDescendantIds.filter((id) => id.startsWith(`${blockType === "tool_position" ? "position" : blockType}-`)).length;
}

function toolPositionGroupNodeId(setupNodeId: string) {
  return `tool-position-group-${setupNodeId}`;
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

function nextOperationNoForPart(
  context: { part?: ProcessPart; operations?: ProcessOperation[]; parentNode?: ProcessFlowNode; nodes?: ProcessFlowNode[]; edges?: ProcessFlowEdge[] },
  partId: string,
) {
  const flowOperations = context.parentNode && context.nodes && context.edges
    ? outgoing(context.nodes, context.edges, context.parentNode.id, "operation").map((node) => node.data.entity as ProcessOperation)
    : context.nodes
      ?.filter((node) => node.data.blockType === "operation" && (node.data.entity as ProcessOperation).partId === partId)
      .map((node) => node.data.entity as ProcessOperation) ?? [];
  const storedOperations = context.operations?.filter((operation) => operation.partId === partId) ?? loadOperationsFromStorage(partId);
  const byNumber = new Map<string, ProcessOperation>();

  [...storedOperations, ...flowOperations].forEach((operation) => {
    byNumber.set(operation.operationNo, operation);
  });

  return nextOperationNo([...byNumber.values()]);
}

function flowLevel(blockType: FlowBlockType) {
  if (blockType === "project") return 0;
  if (blockType === "part" || blockType === "part_group") return 1;
  if (blockType === "operation" || blockType === "operation_group") return 2;
  if (blockType === "setup" || blockType === "setup_group") return 3;
  if (blockType === "tool_position" || blockType === "tool_position_group") return 4;
  return 2;
}

function nodeHeight(node: ProcessFlowNode) {
  return node.data.blockType === "tool_position" ? TOOL_POSITION_NODE_HEIGHT : NODE_HEIGHT;
}

function subtreeSpacing(node: ProcessFlowNode) {
  return node.data.blockType === "tool_position" ? 16 : SUBTREE_SPACING;
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
    if (visiting.has(node.id)) return nodeHeight(node) + subtreeSpacing(node);
    visiting.add(node.id);
    const children = (childrenBySource.get(node.id) ?? []).sort(compareFlowNodes);
    if (!children.length) {
      visiting.delete(node.id);
      return nodeHeight(node) + subtreeSpacing(node);
    }

    const height = Math.max(nodeHeight(node) + subtreeSpacing(node), children.reduce((sum, child) => sum + subtreeHeight(child), 0));
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

function withToolPositionGroups(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]): FlowSnapshot {
  let nextNodes = nodes.map((node) => node.data.blockType === "tool_position" ? { ...node, hidden: true } : node);
  let nextEdges = edges.map((edge) => {
    const target = nodes.find((node) => node.id === edge.target);
    return target?.data.blockType === "tool_position" ? { ...edge, hidden: true } : edge;
  });
  const setups = nextNodes.filter((node) => node.data.blockType === "setup");

  setups.forEach((setupNode) => {
    const positions = outgoing(nodes, edges, setupNode.id, "tool_position").sort(compareFlowNodes);
    const groupId = toolPositionGroupNodeId(setupNode.id);
    const existingGroup = nextNodes.find((node) => node.id === groupId);

    const groupEntity = createToolPositionGroupEntity(setupNode, positions, nodes, edges);
    const groupNode = refreshNode({
      ...(existingGroup ?? createToolPositionGroupNode(setupNode, groupEntity)),
      hidden: false,
      data: {
        ...(existingGroup?.data ?? {}),
        blockType: "tool_position_group",
        entityType: "group",
        entityId: groupId,
        title: "Инструментальные позиции",
        entity: groupEntity,
      },
    } as ProcessFlowNode);

    nextNodes = [...nextNodes.filter((node) => node.id !== groupId), groupNode];
    if (!nextEdges.some((edge) => edge.source === setupNode.id && edge.target === groupId)) {
      nextEdges = [...nextEdges, createFlowEdge(setupNode.id, groupId, `edge-${setupNode.id}-${groupId}`)];
    }
  });

  return { nodes: layoutFlowTree(nextNodes, nextEdges), edges: nextEdges };
}

function createToolPositionGroupEntity(
  setupNode: ProcessFlowNode,
  positions: ProcessFlowNode[],
  nodes: ProcessFlowNode[] = [],
  edges: ProcessFlowEdge[] = [],
): CollapsedGroupEntity & { filledCount: number; conflictsCount: number } {
  const filledCount = positions.filter((positionNode) => {
    const position = positionNode.data.entity as ToolPosition & Record<string, unknown>;
    return Boolean(position.cellId || position.holderId || position.toolId || position.mainHolderId || position.solidToolId || position.indexableHolderId || position.insertId);
  }).length;
  const conflictsCount = nodes.length && edges.length
    ? positions.filter((positionNode) => cellConflictLabel(nodes, edges, positionNode, loadFlowHolders(), loadFlowTools())).length
    : 0;

  return {
    id: toolPositionGroupNodeId(setupNode.id),
    groupType: "tool_position_group",
    parentId: setupNode.id,
    childType: "tool_position",
    groupedNodeIds: positions.map((position) => position.id),
    groupedDescendantIds: [],
    label: "Инструментальные позиции",
    countChildren: positions.length,
    countDescendants: 0,
    isCollapsed: true,
    filledCount,
    conflictsCount,
  };
}

function createToolPositionGroupNode(setupNode: ProcessFlowNode, entity: CollapsedGroupEntity & { filledCount: number; conflictsCount: number }): ProcessFlowNode {
  return refreshNode({
    id: entity.id,
    type: "processBlock",
    position: { x: setupNode.position.x + HORIZONTAL_SPACING, y: setupNode.position.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      blockType: "tool_position_group",
      entityType: "group",
      entityId: entity.id,
      title: "Инструментальные позиции",
      entity,
    },
  });
}

function enrichFlowNodes(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  return nodes.map((node) => {
    if (node.data.blockType === "project") {
      return { ...node, data: { ...node.data, canCollapseGroup: undefined } };
    }

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
  const spacing = parentNode.data.blockType === "setup" ? TOOL_POSITION_VERTICAL_SPACING : VERTICAL_SPACING;
  const nextY = visibleChildren.length
    ? Math.max(...visibleChildren.map((node) => node.position.y)) + spacing
    : parentNode.position.y;
  const basePosition = {
    x: parentNode.position.x + HORIZONTAL_SPACING,
    y: nextY,
  };

  return findFreePosition(basePosition, allNodes);
}

function getNextProjectRootPosition(nodes: ProcessFlowNode[]) {
  const projectNodes = nodes.filter((node) => node.data.blockType === "project" && !node.hidden);
  if (!projectNodes.length) return { x: 40, y: 80 };

  return {
    x: 40,
    y: Math.max(...projectNodes.map((node) => node.position.y)) + VERTICAL_SPACING,
  };
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

function persistFlowOperationsForNodes(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], onlyPartId?: string) {
  const partNodes = nodes.filter((node) => node.data.blockType === "part" && !node.hidden);
  partNodes.forEach((partNode) => {
    const part = partNode.data.entity as ProcessPart;
    if (onlyPartId && part.id !== onlyPartId) return;

    const operationNodes = outgoing(nodes, edges, partNode.id, "operation");
    if (!onlyPartId && !operationNodes.length) return;

    const operationIds = new Set(operationNodes.map((node) => node.id));
    const scopedNodes = nodes.filter((node) => node.id === partNode.id || operationIds.has(node.id) || [...operationIds].some((operationId) => collectAllDescendantIds(nodes, edges, operationId).includes(node.id)));
    persistFlowOperations(part.id, scopedNodes, edges);
  });
}

function persistFlowEntities(nodes: ProcessFlowNode[]) {
  const projectNodes = nodes.filter((node) => node.data.blockType === "project").map((node) => {
    const { partCount, ...project } = node.data.entity as ProcessProject & { partCount?: number };
    return project;
  });
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

function getVisibleProjects(projects: ProcessProject[], view: ProjectsFlowView) {
  return projects.filter((project) => {
    const archived = project.isDeleted || project.status === "Архив" || project.status === "Выполнен";
    return view === "archive" ? archived : !archived;
  }).sort(compareProjectsByPriority);
}

function compareProjectsByPriority(first: ProcessProject, second: ProcessProject) {
  const weight: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const priorityDiff = (weight[first.priority ?? "normal"] ?? 1) - (weight[second.priority ?? "normal"] ?? 1);
  if (priorityDiff) return priorityDiff;
  return first.name.localeCompare(second.name, "ru");
}

function getProjectPartsForView(parts: ProcessPart[], project: ProcessProject, view: ProjectsFlowView) {
  if (view === "archive") {
    return parts.filter((part) => part.projectId === project.id);
  }

  return getActiveProjectParts(parts, project.id);
}

function getPartsForProjects(parts: ProcessPart[], projects: ProcessProject[], view: ProjectsFlowView) {
  return projects.flatMap((project) => getProjectPartsForView(parts, project, view));
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

function findNearestProject(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], nodeId: string): ProcessProject | undefined {
  const node = nodes.find((item) => item.id === nodeId);
  if (node?.data.blockType === "project") return node.data.entity as ProcessProject;

  const incomingEdge = edges.find((edge) => edge.target === nodeId);
  if (!incomingEdge) return undefined;

  return findNearestProject(nodes, edges, incomingEdge.source);
}

function softDeletePartNodes(partNodes: ProcessFlowNode[]) {
  if (!partNodes.length) return;

  const partIds = new Set(partNodes.map((node) => (node.data.entity as ProcessPart).id));
  const date = new Date().toLocaleDateString("ru-RU");
  savePartsToStorage(loadPartsFromStorage().map((part) =>
    partIds.has(part.id) ? { ...part, isDeleted: true, deletedAt: date, updatedAt: date } : part,
  ));
}

function softDeleteProjectNodes(projectNodes: ProcessFlowNode[]) {
  if (!projectNodes.length) return;

  const projectIds = new Set(projectNodes.map((node) => (node.data.entity as ProcessProject).id));
  const date = new Date().toLocaleDateString("ru-RU");
  saveProjectsToStorage(loadProjectsFromStorage().map((project) =>
    projectIds.has(project.id) ? { ...project, isDeleted: true, deletedAt: date, updatedAt: date } : project,
  ));
}

function resolveSetupForPositionPanel(node: ProcessFlowNode, nodes: ProcessFlowNode[], edges: ProcessFlowEdge[]) {
  if (node.data.blockType === "setup") return node;
  if (node.data.blockType === "tool_position") return findParentNode(nodes, edges, node.id, "setup");
  if (node.data.blockType === "tool_position_group") {
    const group = node.data.entity as CollapsedGroupEntity;
    return nodes.find((item) => item.id === group.parentId && item.data.blockType === "setup");
  }
  return undefined;
}

function findParentNode(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], nodeId: string, blockType?: FlowBlockType) {
  const incomingEdge = edges.find((edge) => edge.target === nodeId);
  if (!incomingEdge) return undefined;
  const parent = nodes.find((node) => node.id === incomingEdge.source);
  if (!parent) return undefined;
  if (!blockType || parent.data.blockType === blockType) return parent;
  return findParentNode(nodes, edges, parent.id, blockType);
}

function positionSummary(position: ToolPosition, holdersCatalog: Holder[], toolsCatalog: Tool[], cellsCatalog: MachineCell[]) {
  const cell = cellsCatalog.find((item) => item.id === position.cellId)?.label ?? position.cellManualText ?? "—";
  const holder = holdersCatalog.find((item) => item.id === position.holderId)?.name ?? position.holderManualText ?? "—";
  const tool = toolsCatalog.find((item) => item.id === position.toolId)?.name ?? position.toolManualText ?? "—";
  return `Позиция ${position.positionNo} | ${cell} | ${holder} | ${tool}`;
}

function cellConflictLabel(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], positionNode: ProcessFlowNode, holdersCatalog: Holder[], toolsCatalog: Tool[]) {
  const position = positionNode.data.entity as ToolPosition;
  if (!position.cellId) return "";

  const setupNode = findParentNode(nodes, edges, positionNode.id, "setup");
  const operationNode = setupNode ? findParentNode(nodes, edges, setupNode.id, "operation") : undefined;
  const operation = operationNode?.data.entity as ProcessOperation | undefined;
  if (!operation?.machineId) return "";

  const conflictNode = nodes.find((node) => {
    if (node.id === positionNode.id || node.data.blockType !== "tool_position") return false;
    const other = node.data.entity as ToolPosition;
    if (other.cellId !== position.cellId) return false;
    const otherSetup = findParentNode(nodes, edges, node.id, "setup");
    const otherOperationNode = otherSetup ? findParentNode(nodes, edges, otherSetup.id, "operation") : undefined;
    const otherOperation = otherOperationNode?.data.entity as ProcessOperation | undefined;
    return otherOperation?.machineId === operation.machineId;
  });

  if (!conflictNode) return "";

  const conflict = conflictNode.data.entity as ToolPosition;
  const conflictSetup = findParentNode(nodes, edges, conflictNode.id, "setup");
  const conflictOperationNode = conflictSetup ? findParentNode(nodes, edges, conflictSetup.id, "operation") : undefined;
  const conflictOperation = conflictOperationNode?.data.entity as ProcessOperation | undefined;
  const tool = toolsCatalog.find((item) => item.id === conflict.toolId)?.name ?? conflict.toolManualText ?? "—";
  const setup = conflictSetup?.data.entity as OperationSetup | undefined;
  return `Ячейка уже занята: Операция ${conflictOperation?.operationNo ?? "—"} / Установ ${setup?.setupNo ?? "—"} / Инструмент: ${tool}`;
}

function loadFlowHolders() {
  return mergeCatalogById(holders, readCatalogStorage<Holder>(FLOW_HOLDERS_STORAGE_KEY));
}

function saveFlowHolders(nextHolders: Holder[]) {
  window.localStorage.setItem(FLOW_HOLDERS_STORAGE_KEY, JSON.stringify(nextHolders));
}

function loadFlowTools() {
  return mergeCatalogById(tools, readCatalogStorage<Tool>(FLOW_TOOLS_STORAGE_KEY));
}

function saveFlowTools(nextTools: Tool[]) {
  window.localStorage.setItem(FLOW_TOOLS_STORAGE_KEY, JSON.stringify(nextTools));
}

function readCatalogStorage<T>(key: string): T[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function mergeCatalogById<T extends { id: string }>(base: T[], stored: T[]) {
  return mergeById(base, stored);
}

function catalogHolderName(holderId?: string) {
  return loadFlowHolders().find((holder) => holder.id === holderId)?.name ?? holderName(holderId) ?? "—";
}

function catalogToolName(toolId?: string) {
  return loadFlowTools().find((tool) => tool.id === toolId)?.name ?? toolName(toolId) ?? "—";
}

function catalogCellName(cellId?: string) {
  return machineCells.find((cell) => cell.id === cellId)?.label ?? cellName(cellId) ?? "—";
}

function outgoing(nodes: ProcessFlowNode[], edges: ProcessFlowEdge[], sourceId: string, blockType: FlowBlockType) {
  const targetIds = new Set(edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target));
  return nodes.filter((node) => targetIds.has(node.id) && node.data.blockType === blockType);
}
