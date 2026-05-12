import { projects } from "../../../mock-data";
import { FlowEditor } from "../../../parts/[id]/flow/flow-editor";

type ProjectFlowPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectFlowPage({ params }: ProjectFlowPageProps) {
  const { projectId } = await params;
  const project = projects.find((item) => item.id === projectId);

  return <FlowEditor projectId={projectId} initialProject={project} mode="project" />;
}
