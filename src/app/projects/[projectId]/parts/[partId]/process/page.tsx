import { redirect } from "next/navigation";

type ProjectPartProcessPageProps = {
  params: Promise<{
    projectId: string;
    partId: string;
  }>;
};

export default async function ProjectPartProcessPage({ params }: ProjectPartProcessPageProps) {
  const { projectId, partId } = await params;

  redirect(`/projects/${projectId}/parts/${partId}/flow`);
}
