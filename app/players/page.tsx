import { EmptyState, PageHeader } from "@/components/ui";

export default function Page() {
  return (
    <div>
      <PageHeader title="Players" />
      <EmptyState>Coming next.</EmptyState>
    </div>
  );
}
