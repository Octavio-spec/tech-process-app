import { parts } from "../../../mock-data";
import { ProcessEditor } from "./process-editor";

type ProcessPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProcessPage({ params }: ProcessPageProps) {
  const { id } = await params;
  const part = parts.find((item) => item.id === id);

  return <ProcessEditor partId={id} initialPart={part} />;
}
