import type { ReactNode } from "react";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import type { IconName } from "@/components/ui/Icon";

export function PlaceholderPage({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={description} actions={<Badge>Coming in a later phase</Badge>} />
      {children ?? (
        <Card>
          <EmptyState icon={icon} title={`${title} isn't built yet`} description="This section is planned for a later phase." />
        </Card>
      )}
    </>
  );
}
