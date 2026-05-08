import { parts } from "../../../mock-data";
import { FlowEditor } from "./flow-editor";

type FlowPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FlowPage({ params }: FlowPageProps) {
  const { id } = await params;
  const part = parts.find((item) => item.id === id);

  return <FlowEditor partId={id} initialPart={part} />;
}
