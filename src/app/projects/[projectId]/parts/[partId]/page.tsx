import { parts } from "../../../../mock-data";
import { PartDetailClient } from "../../../../parts/[id]/part-detail-client";

type ProjectPartPageProps = {
  params: Promise<{
    projectId: string;
    partId: string;
  }>;
};

export default async function ProjectPartPage({ params }: ProjectPartPageProps) {
  const { projectId, partId } = await params;
  const part = parts.find((item) => item.id === partId);

  return <PartDetailClient partId={partId} projectId={projectId} initialPart={part} />;
}
