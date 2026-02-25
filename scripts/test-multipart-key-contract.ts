import assert from 'node:assert/strict';

import {
  MULTIPART_KEY_V,
  validateMultipartKeyForUser,
} from '../src/shared/lib/multipart-upload-contract';

function expectOk(key: string, userId: string, fileId: string) {
  const res = validateMultipartKeyForUser(key, userId);
  assert.equal(res.ok, true, `expected ok: ${JSON.stringify(res)}`);
  if (!res.ok) return;
  assert.equal(res.fileId, fileId);
}

function expectErr(key: string, userId: string, error: string) {
  const res = validateMultipartKeyForUser(key, userId);
  assert.equal(res.ok, false, `expected error: ${JSON.stringify(res)}`);
  if (res.ok) return;
  assert.equal(res.error, error);
}

const userId = 'user_xxx';
const fileId = 'uuid-123';
const goodKey = `${userId}/${fileId}/${MULTIPART_KEY_V}`;

expectOk(goodKey, userId, fileId);

expectErr(
  `other/${fileId}/${MULTIPART_KEY_V}`,
  userId,
  'key must start with userId/'
);

expectErr(`/${goodKey}`, userId, 'invalid key');
expectErr(
  `${userId}/${fileId}/original/video/other.mp4`,
  userId,
  `keyV must be ${MULTIPART_KEY_V}`
);
expectErr(`${userId}/${fileId}/../${MULTIPART_KEY_V}`, userId, 'invalid key');
expectErr(`${goodKey}/extra`, userId, 'invalid key');
expectErr(`${userId}//${MULTIPART_KEY_V}`, userId, 'invalid key');

console.log('multipart key contract: ok');

