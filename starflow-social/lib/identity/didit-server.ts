// Server-side foundation only: no public route or production caller in phase 1.
import { createHmac, timingSafeEqual } from 'node:crypto';

type Obj = Record<string, unknown>;
const object = (x: unknown): Obj | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Obj : null;
const uuid = (x: unknown): x is string =>
  typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const approved = (x: unknown) => x === 'Approved' || x === 'APPROVED';

export type IdentityBinding = {
  sessionId: string; workflowId: string; reference: string;
  // Random opaque attempt reference generated and stored server-side, not an email or ID number.
  nodes: { document: string; liveness: string; face: string; aml?: string };
};
export type IdentityResult = 'pending' | 'declined' | 'review' | 'checks_passed';
const one = (x: unknown, node: string): Obj | null => {
  if (!node || !Array.isArray(x)) return null;
  const matches = x.map(object).filter(v => v?.node_id === node);
  return matches.length === 1 ? matches[0] : null;
};
const cleanApproved = (x: Obj | null) =>
  x !== null && approved(x.status) && Array.isArray(x.warnings) && x.warnings.length === 0;

/** Only evaluate a decision from the authenticated provider API, never a browser submission.
 * checks_passed is NOT a public badge, account permission, or authorization decision.
 */
export function evaluateDiditDecision(input: unknown, binding: IdentityBinding): IdentityResult {
  const r = object(input);
  if (!r || !uuid(binding.sessionId) || !uuid(binding.workflowId) || !uuid(binding.reference) ||
      r.session_id !== binding.sessionId || r.workflow_id !== binding.workflowId ||
      r.vendor_data !== binding.reference || r.session_kind !== 'user') return 'review';
  if (['Declined','DECLINED','Expired','Kyc Expired','Abandoned'].includes(String(r.status))) return 'declined';
  if (['Not Started','In Progress','Awaiting User','Resubmitted'].includes(String(r.status))) return 'pending';
  if (!approved(r.status)) return 'review';
  const doc = one(r.id_verifications, binding.nodes.document);
  const live = one(r.liveness_checks, binding.nodes.liveness);
  const face = one(r.face_matches, binding.nodes.face);
  // ACTIVE_3D is mandatory. Passive or absent method never qualifies.
  // null source_image_session_id denotes the document portrait in this session.
  if (!cleanApproved(doc) || !cleanApproved(live) || live?.method !== 'ACTIVE_3D' ||
      !cleanApproved(face) || face?.source_image_session_id !== null) return 'review';
  if (binding.nodes.aml) {
    const aml = one(r.aml_screenings, binding.nodes.aml);
    if (!cleanApproved(aml) || aml?.total_hits !== 0) return 'review';
  }
  return 'checks_passed';
}

export type DiditEvent = { eventId: string; sessionId: string; reference: string; workflowVersion: number };
/** V3 raw-byte signature. No unsigned/simple-signature fallback.
 * Caller must enforce body limits before allocation, persist event IDs, and re-fetch current decision.
 */
export function verifyDiditEvent(
  raw: Uint8Array, signature: string, timestamp: string,
  config: { secret: string; applicationId: string; workflowId: string; workflowVersion: number; environment: 'sandbox'|'live' },
  now = Math.floor(Date.now()/1000),
): DiditEvent | null {
  if (!config.secret || !uuid(config.applicationId) || !uuid(config.workflowId) ||
      !Number.isSafeInteger(config.workflowVersion) || config.workflowVersion < 1 ||
      !/^\d{1,12}$/.test(timestamp) || !Number.isFinite(now) ||
      Math.abs(now - Number(timestamp)) > 300 ||
      raw.length > 1024*1024 || !/^[a-f0-9]{64}$/i.test(signature)) return null;
  const expected = createHmac('sha256', config.secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature,'hex'))) return null;
  try {
    const r = object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
    if (!r || r.timestamp !== Number(timestamp) || r.application_id !== config.applicationId ||
        r.environment !== config.environment || r.workflow_id !== config.workflowId ||
        r.workflow_version !== config.workflowVersion || r.session_kind === 'business' ||
        !['status.updated','data.updated'].includes(String(r.webhook_type)) ||
        !uuid(r.event_id) || !uuid(r.session_id) || !uuid(r.vendor_data)) return null;
    // Never return decision, identity details, images, or provider media URLs.
    return { eventId:r.event_id, sessionId:r.session_id, reference:r.vendor_data, workflowVersion:config.workflowVersion };
  } catch { return null; }
}

/** Read-only reconciliation transport. No creation, top-up, or paid module endpoints.
 * Never expose the provider response to the client or log it.
 */
export async function readDiditDecision(apiKey: string, binding: IdentityBinding, transport: typeof fetch = fetch): Promise<IdentityResult> {
  if (!apiKey || !uuid(binding.sessionId)) return 'review';
  try {
    const res = await transport('https://verification.didit.me/v3/session/'+binding.sessionId+'/decision/', {
      method:'GET', headers:{'x-api-key':apiKey,Accept:'application/json'},
      redirect:'error', cache:'no-store', signal:AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'review';
    // Return only evaluated state; full reports can contain sensitive data.
    return evaluateDiditDecision(await res.json(),binding);
  } catch { return 'review'; }
}
