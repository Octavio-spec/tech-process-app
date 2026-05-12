import { redirect } from "next/navigation";

type ProcessPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProcessPage({ params }: ProcessPageProps) {
  const { id } = await params;

  redirect(`/parts/${id}/flow`);
}
