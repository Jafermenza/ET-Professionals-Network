import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../src/platform/config.js";
import { signToken, verifyToken, requireRole } from "../../src/platform/auth.js";
import { createAuditEvent } from "../../src/platform/audit.js";

test("production config rejects missing or weak JWT secret",()=>{assert.throws(()=>loadConfig({NODE_ENV:"production",JWT_SECRET:"short",PORT:"3000"}),/JWT_SECRET/);});
test("HS256 token authenticates and preserves roles",()=>{const token=signToken({sub:"u1",roles:["member"]},"secret");assert.deepEqual(verifyToken(token,"secret").roles,["member"]);});
test("authorization requires the declared role",()=>{assert.throws(()=>requireRole({sub:"u1",roles:["reviewer"]},"member"),/Forbidden/);});
test("audit events are structured",()=>{const event=createAuditEvent({action:"login",resourceType:"user",resourceId:"u1",outcome:"success"});assert.equal(event.action,"login");assert.equal(event.outcome,"success");assert.ok(event.occurredAt);});
