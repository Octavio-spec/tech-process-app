import { parts } from "../../../../../mock-data";
import { FlowEditor } from "../../../../../parts/[id]/flow/flow-editor";

type ProjectPartFlowPageProps = {
  params: Promise<{
    projectId: string;
    partId: string;
  }>;
};

export default async function ProjectPartFlowPage({ params }: ProjectPartFlowPageProps) {
  const { projectId, partId } = await params;
  const part = parts.find((item) => item.id === partId);

  return <FlowEditor partId={partId} projectId={projectId} initialPart={part} />;
}
