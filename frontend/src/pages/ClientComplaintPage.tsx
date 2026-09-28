import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { clientApi } from '@/api/endpoints';
import { toApiError } from '@/api/client';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ErrorState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ClientComplaintView } from '@/features/public/ClientComplaintView';
import { MessageForm, ReopenAction, UploadForm, type ComplaintOps } from '@/features/public/ComplaintActions';

export default function ClientComplaintPage() {
  const { reference = '' } = useParams();
  useDocumentTitle(`Réclamation ${reference}`);
  const q = useQuery({ queryKey: ['client-complaint', reference], queryFn: () => clientApi.get(reference) });
  const qc = useQueryClient();
  const ops: ComplaintOps = {
    sendMessage: (b) => clientApi.sendMessage(reference, b),
    upload: (f) => clientApi.uploadAttachment(reference, f),
    reopen: (r) => clientApi.reopen(reference, r),
    refresh: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['client-complaint', reference] }),
        qc.invalidateQueries({ queryKey: ['client-complaints'] }),
      ]),
    linkFor: (ref) => `/client/${encodeURIComponent(ref)}`,
  };
  return (
    <>
      <Link to="/client" className="btn text" style={{ marginLeft: -8, marginBottom: 10 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Mes réclamations
      </Link>
      {q.isPending ? (
        <SkeletonCard lines={8} />
      ) : q.isError ? (
        <div className="card">
          <ErrorState message={toApiError(q.error).message} onRetry={() => q.refetch()} />
        </div>
      ) : (
        <ClientComplaintView
          v={q.data}
          actions={<ReopenAction ops={ops} canReopen={q.data.can_reopen} />}
          messagesActions={<MessageForm ops={ops} />}
          docsActions={<UploadForm ops={ops} />}
        />
      )}
    </>
  );
}
