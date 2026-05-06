import { parts } from "../../mock-data";
import { PartDetailClient } from "./part-detail-client";

type PartDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PartDetailPage({ params }: PartDetailPageProps) {
  const { id } = await params;
  const part = parts.find((item) => item.id === id);

  return <PartDetailClient partId={id} initialPart={part} />;
}
