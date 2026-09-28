import { api, cleanParams, downloadFile } from './client';
import type {
  ActivityReport,
  AdminUser,
  ClientComplaintView,
  ComplaintDetail,
  ComplaintFilters,
  ComplaintListItem,
  ComplaintStatus,
  Dashboard,
  DeadlineRule,
  DeadlinesResponse,
  ExportFormat,
  ImportBatch,
  LoginPayload,
  LoginResponse,
  Paginated,
  PublicComplaintCreated,
  PublicReferentials,
  QualityAction,
  RecurringGroup,
  Referentials,
  Resource,
  SolutionListItem,
  User,
  AuditEntry,
  Workload,
  AdminOverview,
} from '@/types/api';

// ——— Auth ———
export const authApi = {
  async me(): Promise<User | null> {
    try {
      const { data } = await api.get<Resource<User>>('/auth/me', { skipAuthRedirect: true, silent: true });
      return data.data;
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 419) return null;
      throw e;
    }
  },
  async login(payload: LoginPayload): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/login', payload, { skipAuthRedirect: true, silent: true });
    return data;
  },
  async logout(): Promise<void> {
    await api.post('/auth/logout', {}, { skipAuthRedirect: true });
  },
  async forgotPassword(email: string): Promise<string> {
    const { data } = await api.post<{ message?: string }>('/auth/forgot-password', { email }, { silent: true });
    return data?.message ?? '';
  },
  async resetPassword(p: { token: string; email: string; password: string; password_confirmation: string }) {
    const { data } = await api.post<{ message?: string }>('/auth/reset-password', p);
    return data?.message ?? '';
  },
  async mfaSetup(): Promise<{ secret: string; otpauth_url: string }> {
    const { data } = await api.post<{ secret: string; otpauth_url: string } | Resource<{ secret: string; otpauth_url: string }>>(
      '/auth/mfa/setup',
    );
    return 'data' in data ? data.data : data;
  },
  async mfaConfirm(code: string): Promise<User | null> {
    const { data } = await api.post<Resource<User> | undefined>('/auth/mfa/confirm', { code }, { silent: true });
    return data && 'data' in data ? data.data : null;
  },
};

// ——— Public ———
export const publicApi = {
  async referentials(): Promise<PublicReferentials> {
    const { data } = await api.get<Resource<PublicReferentials> | PublicReferentials>('/public/referentials');
    return 'data' in data && !Array.isArray(data.data) ? (data as Resource<PublicReferentials>).data : (data as PublicReferentials);
  },
  async createComplaint(form: FormData): Promise<PublicComplaintCreated> {
    const { data } = await api.post<Resource<PublicComplaintCreated>>('/public/complaints', form, { silent: true });
    return data.data;
  },
  async track(reference: string, tracking_code: string): Promise<ClientComplaintView> {
    const { data } = await api.post<Resource<ClientComplaintView>>('/public/track', { reference, tracking_code }, { silent: true });
    return data.data;
  },
  async sendMessage(reference: string, tracking_code: string, body: string): Promise<void> {
    await api.post('/public/track/messages', { reference, tracking_code, body });
  },
  async uploadAttachment(reference: string, tracking_code: string, file: File): Promise<void> {
    const fd = new FormData();
    fd.append('reference', reference);
    fd.append('tracking_code', tracking_code);
    fd.append('file', file);
    await api.post('/public/track/attachments', fd);
  },
  async reopen(
    reference: string,
    tracking_code: string,
    reason: string,
  ): Promise<{ reference?: string; tracking_code?: string } | undefined> {
    const { data } = await api.post<Resource<{ reference?: string; tracking_code?: string }> | undefined>('/public/track/reopen', {
      reference,
      tracking_code,
      reason,
    });
    return data?.data;
  },
};

// ——— Client connecté ———
export const clientApi = {
  async list(): Promise<ClientComplaintView[]> {
    const { data } = await api.get<{ data: ClientComplaintView[] }>('/client/complaints');
    return data.data;
  },
  async get(reference: string): Promise<ClientComplaintView> {
    const { data } = await api.get<Resource<ClientComplaintView>>(`/client/complaints/${encodeURIComponent(reference)}`);
    return data.data;
  },
  async sendMessage(reference: string, body: string): Promise<ClientComplaintView | undefined> {
    const { data } = await api.post<Resource<ClientComplaintView>>(`/client/complaints/${encodeURIComponent(reference)}/messages`, {
      body,
    });
    return data?.data;
  },
  async uploadAttachment(reference: string, file: File): Promise<ClientComplaintView | undefined> {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post<Resource<ClientComplaintView>>(`/client/complaints/${encodeURIComponent(reference)}/attachments`, fd);
    return data?.data;
  },
  async reopen(reference: string, reason: string): Promise<{ reference?: string; tracking_code?: string } | undefined> {
    const { data } = await api.post<Resource<{ reference?: string; tracking_code?: string }>>(
      `/client/complaints/${encodeURIComponent(reference)}/reopen`,
      { reason },
    );
    return data?.data;
  },
};

// ——— Interne ———
export const referentialsApi = {
  async get(): Promise<Referentials> {
    // L'API renvoie /referentials sans enveloppe `data` (cf. ARCHITECTURE.md §9.4) ; on accepte les deux formes.
    const { data } = await api.get<Resource<Referentials> | Referentials>('/referentials');
    return 'data' in data && !Array.isArray(data.data) ? (data as Resource<Referentials>).data : (data as Referentials);
  },
};

export interface QualifyPayload {
  category_id?: number | null;
  product_id?: number | null;
  processing_entity_id?: number | null;
  priority?: string;
  risk_level?: string;
  amount?: string | null;
  currency?: string | null;
  subject?: string;
  reason: string;
}

export const complaintsApi = {
  async list(filters: ComplaintFilters): Promise<Paginated<ComplaintListItem>> {
    const { data } = await api.get<Paginated<ComplaintListItem>>('/complaints', { params: cleanParams(filters) });
    return data;
  },
  async get(id: number | string): Promise<ComplaintDetail> {
    const { data } = await api.get<Resource<ComplaintDetail>>(`/complaints/${id}`);
    return data.data;
  },
  /** Saisie agent : le code de suivi (meta.tracking_code) n'est renvoyé qu'une fois, à remettre au client. */
  async create(form: FormData): Promise<{ complaint: ComplaintDetail; trackingCode: string | null }> {
    const { data } = await api.post<Resource<ComplaintDetail> & { meta?: { tracking_code?: string } }>('/complaints', form);
    return { complaint: data.data, trackingCode: data.meta?.tracking_code ?? null };
  },
  async qualify(id: number, payload: QualifyPayload) {
    const { data } = await api.patch<Resource<ComplaintDetail>>(`/complaints/${id}`, payload);
    return data.data;
  },
  async transition(id: number, to_status: ComplaintStatus, reason: string) {
    await api.post(`/complaints/${id}/transition`, { to_status, reason });
  },
  async assign(id: number, p: { owner_id: number; deputy_id?: number | null; processing_entity_id?: number | null; reason: string }) {
    await api.post(`/complaints/${id}/assign`, p);
  },
  async acknowledge(id: number, p: { template_id?: number | null; channel: string; delivery_status: string }) {
    await api.post(`/complaints/${id}/acknowledge`, p);
  },
  async addMessage(id: number, p: { kind: 'client_message' | 'internal_note'; body: string; channel?: string }) {
    await api.post(`/complaints/${id}/messages`, p);
  },
  async addAttachment(id: number, file: File, classification: string, visibility: string) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('classification', classification);
    fd.append('visibility', visibility);
    await api.post(`/complaints/${id}/attachments`, fd);
  },
  downloadAttachment(attId: number, name: string) {
    return downloadFile(`/attachments/${attId}/download`, {}, name);
  },
  async addTask(id: number, p: { title: string; assignee_id?: number | null; due_at?: string | null }) {
    await api.post(`/complaints/${id}/tasks`, p);
  },
  async updateTask(taskId: number, p: { status?: string; title?: string }) {
    await api.patch(`/tasks/${taskId}`, p);
  },
  async proposeSolution(
    id: number,
    p: { type: string; description: string; root_cause?: string; amount?: string | null; currency?: string | null; decision: string },
  ) {
    await api.post(`/complaints/${id}/solutions`, p);
  },
  async submitSolution(solutionId: number) {
    await api.post(`/solutions/${solutionId}/submit`);
  },
  async approveSolution(solutionId: number, decision: 'approuve' | 'rejete', comment?: string) {
    await api.post(`/solutions/${solutionId}/approve`, { decision, comment: comment || undefined });
  },
  async sendResponse(id: number, p: { body: string; template_id?: number | null; channel: string }) {
    await api.post(`/complaints/${id}/send-response`, p);
  },
  async reopen(id: number, reason: string): Promise<{ id?: number; reference?: string; trackingCode: string | null }> {
    const { data } = await api.post<(Resource<{ id?: number; reference?: string }> & { meta?: { tracking_code?: string } }) | undefined>(
      `/complaints/${id}/reopen`,
      { reason },
    );
    return { id: data?.data?.id, reference: data?.data?.reference, trackingCode: data?.meta?.tracking_code ?? null };
  },
  async markDuplicate(id: number, duplicate_of_id: number, reason: string) {
    await api.post(`/complaints/${id}/mark-duplicate`, { duplicate_of_id, reason });
  },
  async addControl(id: number, p: { result: string; findings: string }) {
    await api.post(`/complaints/${id}/controls`, p);
  },
  exportFile(filters: ComplaintFilters, format: ExportFormat) {
    const { page: _p, per_page: _pp, ...rest } = filters;
    void _p;
    void _pp;
    return downloadFile('/complaints/export', { ...rest, format }, `reclamations.${format}`);
  },
};

export interface CustomerMatch {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  customer_number_masked: string | null;
  preferred_channel: string | null;
  complaints_count: number;
}

export const customersApi = {
  async search(search: string): Promise<CustomerMatch[]> {
    const { data } = await api.get<{ data: CustomerMatch[] }>('/customers', { params: { search } });
    return data.data;
  },
};

export const dashboardApi = {
  async get(filters: ComplaintFilters): Promise<Dashboard> {
    const { data } = await api.get<Resource<Dashboard>>('/dashboard', { params: cleanParams(filters) });
    return data.data;
  },
};

export const deadlinesApi = {
  async list(params: ComplaintFilters & { queue: string }): Promise<DeadlinesResponse> {
    const { data } = await api.get<DeadlinesResponse & { meta: DeadlinesResponse['meta'] & Partial<DeadlinesResponse> }>('/deadlines', {
      params: cleanParams(params),
    });
    // Le contrat ne précise pas si summary/rules sont à la racine ou dans meta : on accepte les deux.
    return {
      ...data,
      summary: data.summary ?? data.meta?.summary,
      rules: data.rules ?? data.meta?.rules ?? [],
    };
  },
};

export const solutionsApi = {
  async list(params: { status?: string; page?: string; per_page?: string }): Promise<Paginated<SolutionListItem>> {
    const { data } = await api.get<Paginated<SolutionListItem>>('/solutions', { params: cleanParams(params) });
    return data;
  },
};

export type QualityActionPayload = Partial<Omit<QualityAction, 'id' | 'owner' | 'owner_entity' | 'category'>>;

export const qualityApi = {
  async actions(params: { page?: string; status?: string } = {}): Promise<Paginated<QualityAction>> {
    const { data } = await api.get<Paginated<QualityAction>>('/quality/actions', { params: cleanParams(params) });
    return normalizeList(data);
  },
  async createAction(p: QualityActionPayload) {
    await api.post('/quality/actions', p);
  },
  async updateAction(id: number, p: QualityActionPayload) {
    await api.patch(`/quality/actions/${id}`, p);
  },
  async recurring(params: ComplaintFilters): Promise<RecurringGroup[]> {
    const { data } = await api.get<{ data: RecurringGroup[] }>('/quality/recurring', { params: cleanParams(params) });
    return data.data;
  },
};

export const reportsApi = {
  async activity(filters: ComplaintFilters): Promise<ActivityReport> {
    const { data } = await api.get<Resource<ActivityReport> | ActivityReport>('/reports/activity', { params: cleanParams(filters) });
    return 'data' in data && data.data && typeof data.data === 'object' && 'opening_stock' in data.data
      ? (data as Resource<ActivityReport>).data
      : (data as ActivityReport);
  },
  async validate(p: { from: string; to: string; as_of?: string; filters?: Record<string, string | number>; comment?: string }) {
    const { data } = await api.post<Resource<{ id: number; validated_by: { id: number; name: string }; validated_at: string }>>(
      '/reports/activity/validate',
      p,
    );
    return data.data;
  },
  exportFile(filters: ComplaintFilters, format: ExportFormat) {
    return downloadFile('/reports/activity', { ...filters, format }, `rapport-activite.${format}`);
  },
};

// ——— Administration (formes de liste non détaillées par le contrat : tolérance tableau / paginé) ———
function normalizeList<T>(data: Paginated<T> | { data: T[] } | T[]): Paginated<T> {
  if (Array.isArray(data)) return { data, meta: { current_page: 1, last_page: 1, per_page: data.length, total: data.length } };
  const meta = (data as Paginated<T>).meta;
  return {
    data: data.data,
    meta:
      meta && typeof meta.total === 'number'
        ? meta
        : { current_page: 1, last_page: 1, per_page: data.data.length, total: data.data.length },
  };
}

export const workloadApi = {
  async get(): Promise<Workload> {
    const { data } = await api.get<Resource<Workload>>('/me/workload');
    return data.data;
  },
};

export const adminApi = {
  async overview(): Promise<AdminOverview> {
    const { data } = await api.get<Resource<AdminOverview>>('/admin/overview');
    return data.data;
  },
  async list<T>(resource: string, params: Record<string, string | undefined> = {}): Promise<Paginated<T>> {
    const { data } = await api.get<Paginated<T> | { data: T[] }>(`/admin/${resource}`, { params: cleanParams(params) });
    return normalizeList(data);
  },
  async create<T>(resource: string, payload: Record<string, unknown>): Promise<T> {
    const { data } = await api.post<Resource<T>>(`/admin/${resource}`, payload);
    return data?.data;
  },
  async update<T>(resource: string, id: number, payload: Record<string, unknown>): Promise<T> {
    const { data } = await api.patch<Resource<T>>(`/admin/${resource}/${id}`, payload);
    return data?.data;
  },
  async remove(resource: string, id: number): Promise<void> {
    await api.delete(`/admin/${resource}/${id}`);
  },
  async validateRule(id: number): Promise<DeadlineRule> {
    const { data } = await api.post<Resource<DeadlineRule>>(`/admin/deadline-rules/${id}/validate`);
    return data?.data;
  },
  async auditLogs(params: Record<string, string | undefined>): Promise<Paginated<AuditEntry>> {
    const { data } = await api.get<Paginated<AuditEntry>>('/admin/audit-logs', { params: cleanParams(params) });
    return normalizeList(data);
  },
  async imports(params: Record<string, string | undefined> = {}): Promise<Paginated<ImportBatch>> {
    const { data } = await api.get<Paginated<ImportBatch>>('/admin/imports', { params: cleanParams(params) });
    return normalizeList(data);
  },
  async importDetail(id: number): Promise<ImportBatch> {
    const { data } = await api.get<Resource<ImportBatch>>(`/admin/imports/${id}`);
    return data.data;
  },
  /** Idempotent : un fichier déjà importé (même SHA-256) renvoie le lot existant avec meta.already_imported. */
  async uploadImport(file: File, source_system: string): Promise<{ batch: ImportBatch; alreadyImported: boolean; message: string | null }> {
    const fd = new FormData();
    fd.append('file', file);
    if (source_system) fd.append('source_system', source_system);
    const { data } = await api.post<Resource<ImportBatch> & { meta?: { already_imported?: boolean; message?: string } }>(
      '/admin/imports',
      fd,
    );
    return { batch: data?.data, alreadyImported: Boolean(data?.meta?.already_imported), message: data?.meta?.message ?? null };
  },
};

export type { AdminUser };
