"use client";

import { TemplatesManager } from "@/components/templates/TemplatesManager";
import { PageHeader } from "@/components/ui/primitives";

export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" description="Reusable BRD, FRD, proposal and presentation outlines for your organization." />
      <TemplatesManager />
    </>
  );
}
