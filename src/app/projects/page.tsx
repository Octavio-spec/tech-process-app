import { FlowEditor } from "../parts/[id]/flow/flow-editor";

type ProjectsPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams;
  return <FlowEditor mode="projects" initialView={params?.view === "archive" ? "archive" : "active"} />;
}
