export type FlowWheelMode = "pan" | "zoom";

export type FlowControlsSettings = {
  wheelMode: FlowWheelMode;
};

export const FLOW_CONTROLS_STORAGE_KEY = "tech-process-flow-controls";

export const defaultFlowControls: FlowControlsSettings = {
  wheelMode: "pan",
};

export function parseFlowControls(value: string | null): FlowControlsSettings {
  if (!value) return defaultFlowControls;

  try {
    const parsed = JSON.parse(value) as Partial<FlowControlsSettings>;
    return {
      wheelMode: parsed.wheelMode === "zoom" ? "zoom" : "pan",
    };
  } catch {
    return defaultFlowControls;
  }
}
