import { createRowTest } from '../../utils/createRowTest';

// Most Watched is personalised — the test account's history may include VOD
// content that requires DRM. Skip on timeout rather than fail.
createRowTest('Most Watched', { skipOnTimeout: true }, 420678);
