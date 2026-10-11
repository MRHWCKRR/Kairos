import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBillingRules} from '../scripts/verify-billing-rules.cjs';
test('deployed Firebase rules deny all browser billing access while preserving owner workspace access',
  {skip:!process.env.FIREBASE_TOOLS_LIB},async()=>{
    const result=await verifyBillingRules();
    assert.equal(result.passed,158);
  });
