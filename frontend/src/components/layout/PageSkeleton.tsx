import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Chargement de la page">
      <span className="sr-only">Chargement de la page…</span>
      <Skeleton width={140} height={12} />
      <Skeleton width={320} height={30} style={{ marginTop: 10 }} />
      <Skeleton width={420} height={14} style={{ marginTop: 10, marginBottom: 22 }} />
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
      <div className="grid">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
      </div>
    </div>
  );
}
