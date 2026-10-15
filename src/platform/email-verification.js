import { createHash, createHmac, randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { withTransaction, getPool } from "./db.js";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const clean = value => String(value || "").trim();
const emailUrl = (token) => {
  const config = loadConfig();
  const base = clean(process.env.PUBLIC_APP_URL) || (config.nodeEnv === "production" ? "" : "http://localhost:3001");
  if (!base) throw Object.assign(new Error("PUBLIC_APP_URL is required for production email verification."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  const url = new URL("/verify-email", base);
  url.searchParams.set("token", token);
  return url.toString();
};

export function assertEmailDeliveryConfigured() {
  const config = loadConfig();
  if (config.nodeEnv !== "production") return;
  const endpoint = clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL);
  const secret = clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
  if (!endpoint || !secret || !clean(process.env.PUBLIC_APP_URL)) {
    throw Object.assign(new Error("Email verification delivery is not configured. Registration is temporarily unavailable."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  }
  let parsed, publicUrl;
  try { parsed = new URL(endpoint); publicUrl = new URL(clean(process.env.PUBLIC_APP_URL)); } catch { throw Object.assign(new Error("Email delivery endpoint and public app URL must be valid URLs."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" }); }
  if (parsed.protocol !== "https:" || publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password) throw Object.assign(new Error("Production email delivery and the public app URL must use HTTPS."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
}

export async function createEmailVerification(db, userId, email, registrationReference) {
  assertEmailDeliveryConfigured();
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "insert into email_verification_token(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')",
    [userId, sha256(token)]
  );
  return { token, verificationUrl: emailUrl(token), registrationReference, email };
}

export async function deliverEmailVerification(message) {
  const config = loadConfig();
  const endpoint = clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL);
  const secret = clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
  if (!endpoint || !secret) {
    if (config.nodeEnv === "production") throw Object.assign(new Error("Email verification delivery is not configured."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
    return { sent: false, developmentVerificationUrl: message.verificationUrl };
  }
  const payload = {
    to: message.email,
    template: "mpa-email-verification",
    subject: "Verify your MPA Professionals Network email",
    registrationReference: message.registrationReference,
    verificationUrl: message.verificationUrl,
    expiresInHours: 24,
    text: "Verify your email to activate your MPA Professionals Network account. This link expires in 24 hours. Registration reference: " + message.registrationReference + ".",
    html: "<p>Verify your email to activate your MPA Professionals Network account.</p><p>Registration reference: <strong>" + message.registrationReference + "</strong></p><p><a href=\"" + message.verificationUrl + "\">Verify email address</a></p><p>This link expires in 24 hours.</p>"
  };
  const serialized = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(serialized).digest("hex");
  let sent = false, errorCode = null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + secret, "x-mpa-payload-signature": signature },
      body: serialized,
      signal: AbortSignal.timeout(8000)
    });
    sent = response.ok;
    if (!sent) errorCode = "DELIVERY_HTTP_" + response.status;
  } catch {
    errorCode = "DELIVERY_UNREACHABLE";
  }
  await getPool().query(
    "update email_verification_token set delivery_attempted_at=now(),delivery_status=$1,delivery_error_code=$2 where token_hash=$3 and consumed_at is null",
    [sent ? "sent" : "failed", errorCode, sha256(message.token)]
  );
  return { sent };
}

export async function verifyEmailToken(rawToken, requestId) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) {
    throw Object.assign(new Error("The verification link is invalid or expired. Request a new link."), { statusCode: 400, code: "EMAIL_VERIFICATION_INVALID" });
  }
  return withTransaction(async db => {
    const row = (await db.query(
      "select id,user_id from email_verification_token where token_hash=$1 and consumed_at is null and expires_at>now() for update",
      [sha256(rawToken)]
    )).rows[0];
    if (!row) throw Object.assign(new Error("The verification link is invalid, expired, or already used. Request a new link."), { statusCode: 400, code: "EMAIL_VERIFICATION_INVALID" });
    await db.query("update email_verification_token set consumed_at=now() where user_id=$1 and consumed_at is null", [row.user_id]);
    await db.query("update app_user set email_verified_at=coalesce(email_verified_at,now()),updated_at=now() where id=$1", [row.user_id]);
    await db.query(
      "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.email_verified','account',$1,$2,'success',$3)",
      [row.user_id, requestId || null, { method: "single_use_email_link" }]
    );
    return { verified: true };
  });
}

export async function resendEmailVerification(emailInput, requestId) {
  const email = clean(emailInput).toLowerCase();
  if (!email || email.length > 320) return { accepted: true };
  const db = getPool();
  const user = (await db.query("select id,email,registration_reference,email_verified_at from app_user where lower(email)=lower($1) limit 1", [email])).rows[0];
  // Keep responses indistinguishable for unknown and already-verified addresses.
  if (!user || user.email_verified_at) return { accepted: true };
  assertEmailDeliveryConfigured();
  const token = randomBytes(32).toString("base64url");
  await withTransaction(async tx => {
    await tx.query("update email_verification_token set consumed_at=now() where user_id=$1 and consumed_at is null", [user.id]);
    await tx.query("insert into email_verification_token(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours')", [user.id, sha256(token)]);
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.email_verification_resent','account',$1,$2,'success',$3)", [user.id, requestId || null, { method: "email_link" }]);
  });
  const message = { token, verificationUrl: emailUrl(token), registrationReference: user.registration_reference || "MPA account", email: user.email };
  const delivery = await deliverEmailVerification(message);
  return loadConfig().nodeEnv === "production" ? { accepted: true } : { accepted: true, developmentVerificationUrl: delivery.developmentVerificationUrl || message.verificationUrl };
}
