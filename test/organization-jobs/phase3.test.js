import test from "node:test";
import assert from "node:assert/strict";
import { allowedApplicationTransition, ELIGIBILITY_RULES, isEligibleVerifiedClaimForJobs } from "../../src/organization-jobs/service.js";

test("phase 3 eligibility engine exposes controlled rule vocabulary",()=>{
  assert.equal(ELIGIBILITY_RULES.includes("membership_active"),true);
  assert.equal(ELIGIBILITY_RULES.includes("professional_verified"),true);
  assert.equal(ELIGIBILITY_RULES.includes("years_experience"),true);
  assert.equal(ELIGIBILITY_RULES.includes("unknown_rule"),false);
});
test("candidate workflow follows contracted progression",()=>{
  assert.equal(allowedApplicationTransition("submitted","screening"),true);
  assert.equal(allowedApplicationTransition("screening","shortlisted"),true);
  assert.equal(allowedApplicationTransition("shortlisted","interview"),true);
  assert.equal(allowedApplicationTransition("interview","offer"),true);
  assert.equal(allowedApplicationTransition("offer","accepted"),true);
  assert.equal(allowedApplicationTransition("accepted","hired"),true);
  assert.equal(allowedApplicationTransition("submitted","hired"),false);
  assert.equal(allowedApplicationTransition("rejected","screening"),false);
});
test("professional eligibility is distinct from identity or membership verification",()=>{
  assert.equal(isEligibleVerifiedClaimForJobs("professional_certification"),true);
  assert.equal(isEligibleVerifiedClaimForJobs("education"),true);
  assert.equal(isEligibleVerifiedClaimForJobs("identity"),false);
  assert.equal(isEligibleVerifiedClaimForJobs("membership"),false);
});
