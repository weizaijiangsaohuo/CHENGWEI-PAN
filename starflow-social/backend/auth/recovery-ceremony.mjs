// Internal offline acceptance predicate. NOT a reset token issuer or provider adapter.
// All inputs must be trusted server records, never a client's asserted verification result.
// No face images, templates, identity numbers or passwords flow through this function.
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validTime=v=>Number.isSafeInteger(v)&&v>0;
export function hasRecoveryEvidence({attempt,account,proof,possession,now=Date.now()}={}){
 if(!attempt||!account||!proof||!possession||!validTime(now))return false;
 if(!['account','verified_identity'].includes(attempt.method)||attempt.purpose!=='password_reset'||attempt.state!=='selected'||attempt.consumed!==false)return false;
 if(![attempt.id,attempt.selectedSubject,account.subject,account.enrollmentId,attempt.providerSessionId,proof.id,possession.id].every(uuid))return false;
 if(![attempt.createdAt,attempt.expiresAt,proof.verifiedAt,possession.verifiedAt].every(validTime)||attempt.createdAt>now||attempt.expiresAt<=now||attempt.expiresAt-attempt.createdAt>15*60*1000)return false;
 if(account.subject!==attempt.selectedSubject||account.active!==true||account.freshAccount!==true||account.identityVerified!==true||account.recoveryConsent!==true||account.enrollmentActive!==true||account.staff!==false||account.mfaEnabled!==false)return false;
 // Independent pre-enrolled possession proof prevents an identifier or a face match
 // from becoming a sole recovery credential; alternate/manual recovery is separate.
 if(possession.attemptId!==attempt.id||possession.subject!==account.subject||!['verified_contact','recovery_code'].includes(possession.kind)||possession.verified!==true||possession.consumed!==false||possession.verifiedAt<attempt.createdAt||possession.verifiedAt>now||now-possession.verifiedAt>10*60*1000)return false;
 return proof.attemptId===attempt.id&&proof.subject===account.subject&&proof.sessionId===attempt.providerSessionId&&proof.enrollmentId===account.enrollmentId&&
 proof.purpose==='password_reset'&&proof.source==='authenticated_provider'&&proof.environment==='sandbox'&&proof.signatureVerified===true&&proof.verifiedAt>=possession.verifiedAt&&proof.verifiedAt<=now&&now-proof.verifiedAt<=5*60*1000&&
 proof.liveness==='ACTIVE_3D'&&proof.sameEnrolledPerson===true&&proof.status==='approved'&&Array.isArray(proof.warnings)&&proof.warnings.length===0&&proof.consumed===false;
}
