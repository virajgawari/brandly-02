"use client";
import { useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { PhotoGrid } from "@/components/brand/BrandPhotos";
import { fromBrandDNA } from "@/lib/brand/projection";
import type { BrandModel } from "@/lib/brand/model";
import { useStore } from "@/lib/store";

/** One place for every real photo the brand uses: product shots and lifestyle photos. */
export default function AssetsPage() {
  const { getActiveBrand, saveBrandModel } = useStore();
  const brand = getActiveBrand();
  const model = useMemo(() => (brand ? brand.model ?? fromBrandDNA(brand.dna, brand.id) : null), [brand]);

  if (!brand || !model) {
    return (
      <AppShell>
        <EmptyState
          title="No brand yet"
          description="Set up your brand to add photos."
          action={
            <Link href="/onboarding">
              <Button>Set up your brand</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  const save = (photos: NonNullable<BrandModel["expression"]["photos"]>) => saveBrandModel({ ...model, expression: { ...model.expression, photos } }, brand.sources);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <PageHeader title="Assets" subtitle="Real photos Brandly uses in your posts. Real photos beat generated ones, so add as many as you can." />
        <Card className="p-5">
          <h2 className="font-medium mb-1">Products</h2>
          <p className="text-xs text-text-muted mb-4">Named product shots, used in product carousels.</p>
          <PhotoGrid model={model} role="product" onChange={save} />
        </Card>
        <Card className="p-5">
          <h2 className="font-medium mb-1">Photos</h2>
          <p className="text-xs text-text-muted mb-4">Your space, team and lifestyle shots.</p>
          <PhotoGrid model={model} role="lifestyle" onChange={save} />
        </Card>
      </div>
    </AppShell>
  );
}
