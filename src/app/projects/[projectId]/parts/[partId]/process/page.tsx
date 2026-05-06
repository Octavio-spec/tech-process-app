import { parts } from "../../../../../mock-data";
import { ProcessEditor } from "../../../../../parts/[id]/process/process-editor";

type ProjectPartProcessPageProps = {
  params: Promise<{
    projectId: string;
    partId: string;
  }>;
};

export default async function ProjectPartProcessPage({ params }: ProjectPartProcessPageProps) {
  const { projectId, partId } = await params;
  const part = parts.find((item) => item.id === partId);

  return <ProcessEditor partId={partId} projectId={projectId} initialPart={part} />;
}
