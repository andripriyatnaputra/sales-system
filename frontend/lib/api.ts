// lib/api.ts
// FINAL — Stable JWT API Client with Auto Token & Error Handling

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const API_BASE = "/api";
//const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// --- TOKEN HANDLER ---

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("token", token);
  }
}

export function clearToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
  }
}

// --- INTERNAL REQUEST WRAPPER ---
async function request<T>(
  method: HttpMethod,
  url: string,
  body?: any
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token && url !== "/login") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // AUTO-HANDLE UNAUTHORIZED (session expired / not logged in). A 401 from
  // /login itself means "wrong credentials", not "session expired" -- it
  // must fall through to the normal error handling below so the caller
  // (login page) gets the real message instead of a silent hard redirect.
  if (res.status === 401 && url !== "/login") {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  // Handle no-content responses
  if (res.status === 204) {
    return "" as T;
  }

  // Try to parse JSON safely
  let responseData: any = null;
  const rawText = await res.text();

  try {
    responseData = rawText ? JSON.parse(rawText) : null;
  } catch {
    responseData = rawText;
  }

  if (!res.ok) {
    const msg =
      typeof responseData === "string"
        ? responseData
        : responseData?.error ||
          responseData?.message ||
          "API request failed";
    throw new Error(msg);
  }

  return responseData as T;
}

// --- PUBLIC API FUNCTIONS ---
export async function apiGet<T>(url: string): Promise<T> {
  return request<T>("GET", url);
}

export async function apiPost<T>(url: string, body?: any): Promise<T> {
  return request<T>("POST", url, body);
}

export async function apiPut<T>(url: string, body?: any): Promise<T> {
  return request<T>("PUT", url, body);
}

export async function apiDelete<T>(url: string): Promise<T> {
  return request<T>("DELETE", url);
}

// --- LOGIN & LOGOUT HELPERS ---

export type LoginResponse = {
  token: string;
  role: string;
  division: string;
  username: string;
  role_key?: string;
  department?: string;
  level?: string;
  permissions?: string[];
};

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  clearToken();
  const res = await apiPost<LoginResponse>("/login", { username, password });

  setToken(res.token);
  return res;
}

export function logout() {
  clearToken();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

// --- USERS API ---
export async function apiGetUsers() {
  return apiGet<any[]>("/users"); // explicit array return
}

export async function apiCreateUser(payload: any) {
  return apiPost("/users", payload);
}

export async function apiUpdateUser(id: number, payload: any) {
  return apiPut(`/users/${id}`, payload);
}

export async function apiDeleteUser(id: number) {
  return apiDelete(`/users/${id}`);
}

// --- ORG STRUCTURE (referensi dropdown) ---
export async function apiGetDepartments() {
  return apiGet<any[]>("/departments");
}

export async function apiGetOrgUnits(departmentId?: number) {
  const query = departmentId ? `?department_id=${departmentId}` : "";
  return apiGet<any[]>(`/org-units${query}`);
}

export async function apiGetRoles(params?: { orgUnitId?: number; departmentId?: number; level?: string }) {
  const q = new URLSearchParams();
  if (params?.orgUnitId) q.set("org_unit_id", String(params.orgUnitId));
  if (params?.departmentId) q.set("department_id", String(params.departmentId));
  if (params?.level) q.set("level", params.level);
  const query = q.toString() ? `?${q.toString()}` : "";
  return apiGet<any[]>(`/roles${query}`);
}

export async function apiGetPermissions() {
  return apiGet<any[]>("/permissions");
}

export async function apiCreateOrgUnit(payload: { department_id: number; key: string; name: string }) {
  return apiPost("/org-units", payload);
}

export async function apiUpdateOrgUnit(id: number, payload: { name: string }) {
  return apiPut(`/org-units/${id}`, payload);
}

export async function apiDeleteOrgUnit(id: number) {
  return apiDelete(`/org-units/${id}`);
}

export async function apiCreateRole(payload: {
  key: string;
  label: string;
  level: string;
  org_unit_id?: number | null;
  department_id?: number | null;
  legacy_role: string;
  permissions: string[];
}) {
  return apiPost("/roles", payload);
}

export async function apiUpdateRole(
  id: number,
  payload: {
    label: string;
    level: string;
    org_unit_id?: number | null;
    department_id?: number | null;
    legacy_role: string;
    permissions: string[];
  }
) {
  return apiPut(`/roles/${id}`, payload);
}

export async function apiDeleteRole(id: number) {
  return apiDelete(`/roles/${id}`);
}

// --- NON-PROJECT WORK: POC/Demo & Internal Dev Request ---
export type WorkRequest = {
  id: number;
  type: "poc" | "demo" | "internal";
  title: string;
  description?: string;
  customer_id?: number;
  customer_name?: string;
  requesting_department_id?: number;
  requesting_department_name?: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  target_date?: string;
  notes?: string;
  requested_by: number;
  requested_by_username?: string;
  created_at: string;
  updated_at: string;
  attachment_count: number;
  update_count: number;
  task_count: number;
  task_done_count: number;
};

export type WorkRequestAttachment = {
  id: number;
  work_request_id: number;
  file_name: string;
  file_size?: number;
  uploaded_by: number;
  uploaded_by_username?: string;
  created_at: string;
};

export type WorkRequestUpdate = {
  id: number;
  work_request_id: number;
  author_id: number;
  author_username?: string;
  note: string;
  created_at: string;
};

export type WorkRequestTask = {
  id: number;
  work_request_id: number;
  title: string;
  is_done: boolean;
  created_by: number;
  created_by_username?: string;
  created_at: string;
  completed_at?: string;
};

export async function apiGetWorkRequests(params?: { type?: string; status?: string; mine?: boolean }) {
  const q = new URLSearchParams();
  if (params?.type) q.set("type", params.type);
  if (params?.status) q.set("status", params.status);
  if (params?.mine) q.set("mine", "true");
  const qs = q.toString();
  return apiGet<WorkRequest[]>(`/work-requests${qs ? `?${qs}` : ""}`);
}

export async function apiCreateWorkRequest(payload: {
  type: string;
  title: string;
  description?: string;
  customer_id?: number | null;
  requesting_department_id?: number | null;
  target_date?: string;
  notes?: string;
}) {
  return apiPost<{ id: number }>("/work-requests", payload);
}

export async function apiUpdateWorkRequest(
  id: number,
  payload: { title?: string; description?: string; target_date?: string; notes?: string }
) {
  return apiPut(`/work-requests/${id}`, payload);
}

export async function apiUpdateWorkRequestStatus(id: number, status: string) {
  return apiPut(`/work-requests/${id}/status`, { status });
}

export async function apiDeleteWorkRequest(id: number) {
  return apiDelete(`/work-requests/${id}`);
}

export async function apiGetWorkRequestAttachments(workRequestId: number) {
  return apiGet<WorkRequestAttachment[]>(`/work-requests/${workRequestId}/attachments`);
}

export async function apiUploadWorkRequestAttachment(workRequestId: number, file: File) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/work-requests/${workRequestId}/attachments`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Upload gagal");
  }
  return data;
}

export async function apiDownloadWorkRequestAttachment(
  workRequestId: number,
  attachmentId: number,
  fileName: string
) {
  const blob = await apiGetBlob(`/work-requests/${workRequestId}/attachments/${attachmentId}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiDeleteWorkRequestAttachment(workRequestId: number, attachmentId: number) {
  return apiDelete<any>(`/work-requests/${workRequestId}/attachments/${attachmentId}`);
}

export async function apiGetWorkRequestUpdates(workRequestId: number) {
  return apiGet<WorkRequestUpdate[]>(`/work-requests/${workRequestId}/updates`);
}

export async function apiCreateWorkRequestUpdate(workRequestId: number, note: string) {
  return apiPost<{ id: number }>(`/work-requests/${workRequestId}/updates`, { note });
}

export async function apiDeleteWorkRequestUpdate(workRequestId: number, updateId: number) {
  return apiDelete<any>(`/work-requests/${workRequestId}/updates/${updateId}`);
}

export async function apiGetWorkRequestTasks(workRequestId: number) {
  return apiGet<WorkRequestTask[]>(`/work-requests/${workRequestId}/tasks`);
}

export async function apiCreateWorkRequestTask(workRequestId: number, title: string) {
  return apiPost<{ id: number }>(`/work-requests/${workRequestId}/tasks`, { title });
}

export async function apiUpdateWorkRequestTask(
  workRequestId: number,
  taskId: number,
  body: { title?: string; is_done?: boolean }
) {
  return apiPut(`/work-requests/${workRequestId}/tasks/${taskId}`, body);
}

export async function apiDeleteWorkRequestTask(workRequestId: number, taskId: number) {
  return apiDelete<any>(`/work-requests/${workRequestId}/tasks/${taskId}`);
}

// --- PRESALES ANALYSIS + BOQ ---
export async function apiGetPresalesAnalysis(projectId: number | string) {
  return apiGet<any>(`/projects/${projectId}/presales-analysis`);
}

export async function apiUpdatePresalesProdev(projectId: number | string, body: any) {
  return apiPut<any>(`/projects/${projectId}/presales-analysis/prodev`, body);
}

export async function apiUpdatePresalesOperations(projectId: number | string, body: any) {
  return apiPut<any>(`/projects/${projectId}/presales-analysis/operations`, body);
}

export async function apiUpdatePresalesProcurement(projectId: number | string, body: any) {
  return apiPut<any>(`/projects/${projectId}/presales-analysis/procurement`, body);
}

export async function apiUpdatePresalesFinance(projectId: number | string, body: any) {
  return apiPut<any>(`/projects/${projectId}/presales-analysis/finance`, body);
}

export async function apiGetBOQItems(projectId: number | string) {
  return apiGet<any[]>(`/projects/${projectId}/boq-items`);
}

export async function apiCreateBOQItem(projectId: number | string, body: any) {
  return apiPost<any>(`/projects/${projectId}/boq-items`, body);
}

export async function apiUpdateBOQItem(projectId: number | string, itemId: number, body: any) {
  return apiPut<any>(`/projects/${projectId}/boq-items/${itemId}`, body);
}

export async function apiDeleteBOQItem(projectId: number | string, itemId: number) {
  return apiDelete<any>(`/projects/${projectId}/boq-items/${itemId}`);
}

export async function apiGetBOQItemHistory(projectId: number | string, itemId: number) {
  return apiGet<any[]>(`/projects/${projectId}/boq-items/${itemId}/history`);
}

// --- AUDIT LOGS ---
export async function apiGetAuditLogs(params?: { entity_type?: string; entity_id?: string }) {
  const q = new URLSearchParams();
  if (params?.entity_type) q.set("entity_type", params.entity_type);
  if (params?.entity_id) q.set("entity_id", params.entity_id);
  const query = q.toString() ? `?${q.toString()}` : "";
  return apiGet<any[]>(`/audit-logs${query}`);
}

// --- PERMISSION HELPER (UX gating saja, backend tetap source of truth) ---
export function hasPermission(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const perms: string[] = JSON.parse(localStorage.getItem("permissions") || "[]");
    return perms.includes(key);
  } catch {
    return false;
  }
}

// canEditDepartment: dipakai modul yang di-gate requireDepartment() di backend
// (Presales, Purchase Request/Order), bukan permission generik -- system_admin
// (legacy role "admin") selalu bisa bypass, sama seperti backend.
export function canEditDepartment(department: string): boolean {
  if (typeof window === "undefined") return false;
  const myRole = localStorage.getItem("role");
  const myDept = localStorage.getItem("department");
  return myRole === "admin" || myDept === department;
}

// levelRank: SAMA PERSIS map di backend (handlers/executive_dashboard.go) --
// jaga konsisten kalau salah satu diubah.
const levelRank: Record<string, number> = {
  staff: 1,
  manager: 2,
  gm: 3,
  executive: 4,
  system_admin: 5,
};

// canAccessLevel: mirror canEditDepartment, tapi berbasis "level" RBAC
// (bukan department) -- dipakai Dashboard Eksekutif (Fase 5 area 2).
export function canAccessLevel(minLevel: string): boolean {
  if (typeof window === "undefined") return false;
  const myRole = localStorage.getItem("role");
  if (myRole === "admin") return true;
  const myLevel = localStorage.getItem("level") || "";
  return (levelRank[myLevel] || 0) >= (levelRank[minLevel] || 0);
}

// --- SALES ORDER + CUSTOMER PO ---
export async function apiGetSalesOrders() {
  return apiGet<any[]>("/sales-orders");
}

export async function apiGetSalesOrder(id: number | string) {
  return apiGet<any>(`/sales-orders/${id}`);
}

export async function apiGetSalesOrderByProject(projectId: number | string) {
  return apiGet<any>(`/projects/${projectId}/sales-order`);
}

export async function apiUpdateSalesOrder(id: number | string, body: any) {
  return apiPut<any>(`/sales-orders/${id}`, body);
}

export async function apiCreateCustomerPO(salesOrderId: number | string, body: any) {
  return apiPost<any>(`/sales-orders/${salesOrderId}/customer-pos`, body);
}

export async function apiUpdateCustomerPO(salesOrderId: number | string, poId: number, body: any) {
  return apiPut<any>(`/sales-orders/${salesOrderId}/customer-pos/${poId}`, body);
}

export async function apiDeleteCustomerPO(salesOrderId: number | string, poId: number) {
  return apiDelete<any>(`/sales-orders/${salesOrderId}/customer-pos/${poId}`);
}

// --- VENDORS ---
export async function apiGetVendors(status?: string) {
  return apiGet<any[]>(`/vendors${status ? `?status=${status}` : ""}`);
}

export async function apiGetVendor(id: number | string) {
  return apiGet<any>(`/vendors/${id}`);
}

export async function apiCreateVendor(body: any) {
  return apiPost<any>("/vendors", body);
}

export async function apiUpdateVendor(id: number | string, body: any) {
  return apiPut<any>(`/vendors/${id}`, body);
}

export async function apiDeleteVendor(id: number | string) {
  return apiDelete<any>(`/vendors/${id}`);
}

// --- PURCHASE REQUEST ---
export async function apiGetPurchaseRequests(status?: string) {
  return apiGet<any[]>(`/purchase-requests${status ? `?status=${status}` : ""}`);
}

export async function apiGetPurchaseRequest(id: number | string) {
  return apiGet<any>(`/purchase-requests/${id}`);
}

export async function apiCreatePurchaseRequest(body: any) {
  return apiPost<any>("/purchase-requests", body);
}

export async function apiSubmitPurchaseRequest(id: number | string) {
  return apiPost<any>(`/purchase-requests/${id}/submit`);
}

// --- PURCHASE ORDER + PAYMENT SCHEDULES ---
export async function apiGetPurchaseOrders(status?: string) {
  return apiGet<any[]>(`/purchase-orders${status ? `?status=${status}` : ""}`);
}

export async function apiGetPurchaseOrder(id: number | string) {
  return apiGet<any>(`/purchase-orders/${id}`);
}

export async function apiCreatePurchaseOrder(body: any) {
  return apiPost<any>("/purchase-orders", body);
}

export async function apiSubmitPurchaseOrder(id: number | string) {
  return apiPost<any>(`/purchase-orders/${id}/submit`);
}

// --- META (Memo Tagih / Billing Request) + INVOICE ---
export async function apiGetBillingRequests(status?: string) {
  return apiGet<any[]>(`/billing-requests${status ? `?status=${status}` : ""}`);
}

export async function apiGetBillingRequest(id: number | string) {
  return apiGet<any>(`/billing-requests/${id}`);
}

export async function apiCreateBillingRequest(body: any) {
  return apiPost<any>("/billing-requests", body);
}

export async function apiSubmitBillingRequest(id: number | string) {
  return apiPost<any>(`/billing-requests/${id}/submit`);
}

export async function apiGetInvoices(status?: string) {
  return apiGet<any[]>(`/invoices${status ? `?status=${status}` : ""}`);
}

export async function apiGetInvoice(id: number | string) {
  return apiGet<any>(`/invoices/${id}`);
}

export async function apiCreateInvoice(body: any) {
  return apiPost<any>("/invoices", body);
}

export async function apiUpdateInvoiceStatus(id: number | string, status: string, bankAccountId?: number) {
  return apiPut<any>(`/invoices/${id}/status`, {
    status,
    ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
  });
}

export async function apiCreatePaymentSchedule(poId: number | string, body: any) {
  return apiPost<any>(`/purchase-orders/${poId}/payment-schedules`, body);
}

export async function apiUpdatePaymentSchedule(poId: number | string, scheduleId: number, body: any) {
  return apiPut<any>(`/purchase-orders/${poId}/payment-schedules/${scheduleId}`, body);
}

export async function apiDeletePaymentSchedule(poId: number | string, scheduleId: number) {
  return apiDelete<any>(`/purchase-orders/${poId}/payment-schedules/${scheduleId}`);
}

// --- AP AGING + BUKTI PEMBAYARAN (Fase 2 langkah 2) ---
export async function apiGetAllPaymentSchedules(status?: string) {
  return apiGet<any[]>(`/payment-schedules${status ? `?status=${status}` : ""}`);
}

export async function apiUploadPaymentProof(poId: number | string, scheduleId: number, file: File) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/purchase-orders/${poId}/payment-schedules/${scheduleId}/proof`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Upload gagal");
  }
  return data;
}

// --- ASSIGNMENT PROJECT KE SUB-TIM PRODEV ---
export async function apiMarkProjectDocumentsComplete(projectId: number | string, complete: boolean) {
  return apiPut<any>(`/projects/${projectId}/documents-complete`, { complete });
}

export async function apiAssignProdevTeam(projectId: number | string, orgUnitId: number) {
  return apiPut<any>(`/projects/${projectId}/prodev-assignment`, { org_unit_id: orgUnitId });
}

// --- ADDITIONAL COSTS + PROJECT PROFITABILITY (Fase 2 langkah 3+4) ---
export async function apiGetProjectAdditionalCosts(projectId: number | string) {
  return apiGet<any[]>(`/projects/${projectId}/additional-costs`);
}

export async function apiCreateProjectAdditionalCost(projectId: number | string, body: any) {
  return apiPost<any>(`/projects/${projectId}/additional-costs`, body);
}

export async function apiUpdateProjectAdditionalCost(projectId: number | string, costId: number, body: any) {
  return apiPut<any>(`/projects/${projectId}/additional-costs/${costId}`, body);
}

export async function apiDeleteProjectAdditionalCost(projectId: number | string, costId: number) {
  return apiDelete<any>(`/projects/${projectId}/additional-costs/${costId}`);
}

export async function apiGetProjectProfitability(projectId: number | string) {
  return apiGet<any>(`/projects/${projectId}/profitability`);
}

export async function apiGetAllProjectProfitability() {
  return apiGet<any[]>("/project-profitability");
}

// --- TIMESHEET & LABOR COSTING (Fase 5 area 1) ---
export type Timesheet = {
  id: number;
  project_id: number;
  project_code?: string;
  user_id: number;
  username?: string;
  work_date: string;
  hours: number;
  description?: string;
  created_at: string;
  updated_at: string;
};

export async function apiGetProjectTimesheets(projectId: number | string) {
  return apiGet<Timesheet[]>(`/projects/${projectId}/timesheets`);
}

export async function apiCreateTimesheet(projectId: number | string, body: any) {
  return apiPost<any>(`/projects/${projectId}/timesheets`, body);
}

export async function apiUpdateTimesheet(projectId: number | string, tsId: number, body: any) {
  return apiPut<any>(`/projects/${projectId}/timesheets/${tsId}`, body);
}

export async function apiDeleteTimesheet(projectId: number | string, tsId: number) {
  return apiDelete<any>(`/projects/${projectId}/timesheets/${tsId}`);
}

export async function apiGetMyTimesheets(params?: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  return apiGet<Timesheet[]>(`/my-timesheets${qs ? `?${qs}` : ""}`);
}

export type UserRate = {
  id: number;
  username: string;
  division: string;
  hourly_rate: number | null;
};

export async function apiGetUsersForRateManagement() {
  return apiGet<UserRate[]>("/users/hourly-rates");
}

export async function apiUpdateUserHourlyRate(userId: number, hourlyRate: number) {
  return apiPut<any>(`/users/${userId}/hourly-rate`, { hourly_rate: hourlyRate });
}

export async function apiDownloadPaymentProof(poId: number | string, scheduleId: number, fileName: string) {
  const blob = await apiGetBlob(`/purchase-orders/${poId}/payment-schedules/${scheduleId}/proof/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// --- AR/AP AGING GABUNGAN (Fase 2 langkah 5) ---
export type AgingBucket = { bucket: string; count: number; amount: number };
export type ARAPSide = { total_outstanding: number; total_overdue: number; buckets: AgingBucket[] };
export type ARAPAgingSummary = { ar: ARAPSide; ap: ARAPSide; net_position: number };

export async function apiGetARAPAgingSummary() {
  return apiGet<ARAPAgingSummary>("/ar-ap-aging-summary");
}

// --- MY WORK QUEUE ---
export type WorkQueueItem = {
  entity_type: string;
  entity_id: number;
  code: string;
  title: string;
  detail?: string;
  link: string;
  created_at: string;
  division?: string;
};

export async function apiGetMyWorkQueue() {
  return apiGet<{ department: string; items: WorkQueueItem[]; by_division?: Record<string, number> }>("/my-work-queue");
}

// --- NOTIFIKASI (Fase 4 langkah 4) ---
export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  detail?: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

export async function apiGetNotifications() {
  return apiGet<{ notifications: NotificationItem[]; unread_count: number; reminders: WorkQueueItem[] }>(
    "/notifications"
  );
}

export async function apiMarkNotificationRead(id: number) {
  return apiPut<any>(`/notifications/${id}/read`, {});
}

export async function apiMarkAllNotificationsRead() {
  return apiPost<any>("/notifications/read-all", {});
}

export type SalesProgressItem = {
  project_id: number;
  project_code: string;
  description?: string;
  customer_name?: string;
  division: string;
  sales_stage: number;
  bottleneck_label: string;
  blocking_department?: string;
  aging_days?: number | null;
};

export async function apiGetSalesProgress(division?: string) {
  const q = division ? `?division=${encodeURIComponent(division)}` : "";
  return apiGet<{ division: string; projects: SalesProgressItem[] }>(`/sales-progress${q}`);
}

// --- APPROVALS (generik) ---
export async function apiGetApprovals(params?: { mine?: boolean; status?: string; entityType?: string }) {
  const q = new URLSearchParams();
  if (params?.mine) q.set("mine", "true");
  if (params?.status) q.set("status", params.status);
  if (params?.entityType) q.set("entity_type", params.entityType);
  const query = q.toString() ? `?${q.toString()}` : "";
  return apiGet<any[]>(`/approvals${query}`);
}

export async function apiGetApproval(id: number | string) {
  return apiGet<any>(`/approvals/${id}`);
}

export async function apiApproveApproval(id: number | string, comment?: string) {
  return apiPost<any>(`/approvals/${id}/approve`, { comment: comment || "" });
}

export async function apiRejectApproval(id: number | string, comment?: string) {
  return apiPost<any>(`/approvals/${id}/reject`, { comment: comment || "" });
}

// --- BAST VENDOR & BAST CUSTOMER ---
export async function apiGetBASTVendorList(purchaseOrderId?: number | string) {
  return apiGet<any[]>(`/bast-vendor${purchaseOrderId ? `?purchase_order_id=${purchaseOrderId}` : ""}`);
}

export async function apiGetBASTVendor(id: number | string) {
  return apiGet<any>(`/bast-vendor/${id}`);
}

export async function apiCreateBASTVendor(body: any) {
  return apiPost<any>("/bast-vendor", body);
}

export async function apiGetBASTCustomerList(salesOrderId?: number | string) {
  return apiGet<any[]>(`/bast-customer${salesOrderId ? `?sales_order_id=${salesOrderId}` : ""}`);
}

export async function apiGetBASTCustomer(id: number | string) {
  return apiGet<any>(`/bast-customer/${id}`);
}

export async function apiCreateBASTCustomer(body: any) {
  return apiPost<any>("/bast-customer", body);
}

// --- PROJECT DOCUMENTS (RFQ/TOR/dll) ---
export async function apiGetProjectDocuments(projectId: number | string) {
  return apiGet<any[]>(`/projects/${projectId}/documents`);
}

export async function apiUploadProjectDocument(
  projectId: number | string,
  file: File,
  category: string,
  notes?: string,
  expiryDate?: string,
  supersedesId?: number
) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  if (notes) form.append("notes", notes);
  if (expiryDate) form.append("expiry_date", expiryDate);
  if (supersedesId) form.append("supersedes_id", String(supersedesId));

  const res = await fetch(`${API_BASE}/projects/${projectId}/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Upload gagal");
  }
  return data;
}

export async function apiDownloadProjectDocument(
  projectId: number | string,
  docId: number,
  fileName: string
) {
  const blob = await apiGetBlob(`/projects/${projectId}/documents/${docId}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiDeleteProjectDocument(projectId: number | string, docId: number) {
  return apiDelete<any>(`/projects/${projectId}/documents/${docId}`);
}

export async function apiGetExpiringDocuments() {
  return apiGet<any[]>("/document-expiry");
}

// --- PRESALES DOCUMENTS (lampiran per bagian presales) ---
export async function apiGetPresalesDocuments(projectId: number | string) {
  return apiGet<any[]>(`/projects/${projectId}/presales-documents`);
}

export async function apiUploadPresalesDocument(
  projectId: number | string,
  section: string,
  file: File,
  notes?: string,
  supersedesId?: number
) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  form.append("section", section);
  if (notes) form.append("notes", notes);
  if (supersedesId) form.append("supersedes_id", String(supersedesId));

  const res = await fetch(`${API_BASE}/projects/${projectId}/presales-documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Upload gagal");
  }
  return data;
}

export async function apiDownloadPresalesDocument(
  projectId: number | string,
  docId: number,
  fileName: string
) {
  const blob = await apiGetBlob(`/projects/${projectId}/presales-documents/${docId}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function apiDeletePresalesDocument(projectId: number | string, docId: number) {
  return apiDelete<any>(`/projects/${projectId}/presales-documents/${docId}`);
}

export async function apiGetBlob(url: string): Promise<Blob> {
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token && url !== "/login") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  console.log("[API REQUEST]", `${API_BASE}${url}`);

  const res = await fetch(`${API_BASE}${url}`, {
    method: "GET",
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    // coba baca text error
    const msg = await res.text();
    throw new Error(msg || "Export failed");
  }

  return await res.blob();
}


export async function apiGetProjectPipelineSummary(query = "") {
  return apiGet(`/projects/pipeline/summary${query}`);
}

export async function apiGetProjectPipelineDetails(query = "") {
  return apiGet(`/projects/pipeline/details${query}`);
}

export async function apiGetProjectSPHSummary(query = "") {
  return apiGet(`/projects/sph/summary${query}`);
}

export async function apiGetProjectSPHDetails(query = "") {
  return apiGet(`/projects/sph/details${query}`);
}

// --- CHART OF ACCOUNTS (Fase 3 langkah 1) ---
export type ChartOfAccount = {
  id: number;
  account_code: string;
  account_name: string;
  account_type: "Asset" | "Liability" | "Equity" | "Revenue" | "COGS" | "Expense";
  parent_id?: number | null;
  parent_code?: string;
  status: "active" | "inactive";
  description?: string | null;
  normal_balance: "debit" | "credit";
  created_at: string;
  updated_at: string;
};

export async function apiGetChartOfAccounts(params?: { type?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.type) q.set("type", params.type);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return apiGet<ChartOfAccount[]>(`/chart-of-accounts${qs ? `?${qs}` : ""}`);
}

export async function apiCreateAccount(body: {
  account_code: string;
  account_name: string;
  account_type: string;
  parent_id?: number | null;
  description?: string | null;
}) {
  return apiPost<{ id: number }>("/chart-of-accounts", body);
}

export async function apiUpdateAccount(
  id: number | string,
  body: { account_name: string; account_type: string; parent_id?: number | null; description?: string | null }
) {
  return apiPut<any>(`/chart-of-accounts/${id}`, body);
}

export async function apiDeleteAccount(id: number | string) {
  return apiDelete<any>(`/chart-of-accounts/${id}`);
}

// --- GENERAL LEDGER / JURNAL UMUM (Fase 3 langkah 2) ---
export type JournalEntryLine = {
  id: number;
  journal_entry_id: number;
  account_id: number;
  account_code?: string;
  account_name?: string;
  project_id?: number | null;
  project_code?: string;
  debit: number;
  credit: number;
  memo?: string | null;
  created_at: string;
};

export type JournalEntry = {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  source_type: string;
  source_id?: number | null;
  created_by: number;
  created_by_username?: string;
  total_debit: number;
  total_credit: number;
  created_at: string;
  updated_at: string;
  lines?: JournalEntryLine[];
};

export async function apiGetJournalEntries(params?: { from?: string; to?: string; account_id?: number }) {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  if (params?.account_id) q.set("account_id", String(params.account_id));
  const qs = q.toString();
  return apiGet<JournalEntry[]>(`/journal-entries${qs ? `?${qs}` : ""}`);
}

export async function apiGetJournalEntry(id: number | string) {
  return apiGet<JournalEntry>(`/journal-entries/${id}`);
}

export async function apiCreateJournalEntry(body: {
  entry_date?: string;
  description: string;
  lines: { account_id: number; project_id?: number | null; debit: number; credit: number; memo?: string | null }[];
}) {
  return apiPost<{ id: number; entry_number: string }>("/journal-entries", body);
}

// --- NERACA / BALANCE SHEET (Fase 3 langkah 4) ---
export type BalanceSheetLine = { account_code: string; account_name: string; balance: number };
export type BalanceSheet = {
  as_of: string;
  assets: BalanceSheetLine[];
  total_assets: number;
  liabilities: BalanceSheetLine[];
  total_liabilities: number;
  equity: BalanceSheetLine[];
  current_earnings: number;
  total_equity: number;
  balanced: boolean;
};

export async function apiGetBalanceSheet(asOf?: string) {
  const q = asOf ? `?as_of=${asOf}` : "";
  return apiGet<BalanceSheet>(`/balance-sheet${q}`);
}

// --- LABA RUGI / INCOME STATEMENT (Fase 3 langkah 5) ---
export type PLSummary = { revenue: number; cogs: number; gross_profit: number; expense: number; net_income: number };
export type ProjectPL = PLSummary & { project_id: number; project_code: string; division: string };
export type DivisionPL = PLSummary & { division: string };
export type IncomeStatement = {
  from: string;
  to: string;
  company: PLSummary;
  unassigned: PLSummary;
  by_project: ProjectPL[];
  by_division: DivisionPL[];
};

export async function apiGetIncomeStatement(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return apiGet<IncomeStatement>(`/income-statement${qs ? `?${qs}` : ""}`);
}

// --- ARUS KAS / CASH FLOW STATEMENT (Fase 3 langkah 6) ---
export type CashFlowLine = { account_code: string; account_name: string; amount: number };
export type CashFlowStatement = {
  from: string;
  to: string;
  beginning_cash: number;
  operating: CashFlowLine[];
  operating_total: number;
  investing: CashFlowLine[];
  investing_total: number;
  financing: CashFlowLine[];
  financing_total: number;
  net_change_in_cash: number;
  ending_cash: number;
  balanced: boolean;
};

export async function apiGetCashFlowStatement(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return apiGet<CashFlowStatement>(`/cash-flow-statement${qs ? `?${qs}` : ""}`);
}

// --- CASH & BANK (Fase 4 langkah 3, multi-rekening via hierarki COA) ---
export type CashBankAccount = {
  id: number;
  account_code: string;
  account_name: string;
  balance: number;
};

export async function apiGetCashBankSummary() {
  return apiGet<CashBankAccount[]>("/cash-bank-summary");
}

// --- DASHBOARD EKSEKUTIF (Fase 5 area 2, level>=gm) ---
export async function apiGetExecutiveDashboard(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return apiGet<any>(`/executive-dashboard${qs ? `?${qs}` : ""}`);
}

// --- KATALOG ITEM/JASA & PRICE LIST (Fase 4 langkah 1) ---
export type ItemCatalog = {
  id: number;
  item_code: string;
  item_name: string;
  unit?: string;
  category?: string;
  default_vendor_cost?: number;
  default_install_cost?: number;
  default_sell_price?: number;
  status: "active" | "inactive";
  notes?: string;
  created_at: string;
  updated_at: string;
};

export async function apiGetItemCatalog(params?: { status?: string; search?: string }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiGet<ItemCatalog[]>(`/item-catalog${qs ? `?${qs}` : ""}`);
}

export async function apiCreateItemCatalog(body: {
  item_name: string;
  unit?: string | null;
  category?: string | null;
  default_vendor_cost?: number | null;
  default_install_cost?: number | null;
  default_sell_price?: number | null;
  notes?: string | null;
}) {
  return apiPost<{ id: number; item_code: string }>("/item-catalog", body);
}

export async function apiUpdateItemCatalog(
  id: number | string,
  body: {
    item_name?: string;
    unit?: string | null;
    category?: string | null;
    default_vendor_cost?: number | null;
    default_install_cost?: number | null;
    default_sell_price?: number | null;
    notes?: string | null;
  }
) {
  return apiPut<any>(`/item-catalog/${id}`, body);
}

export async function apiDeleteItemCatalog(id: number | string) {
  return apiDelete<any>(`/item-catalog/${id}`);
}

