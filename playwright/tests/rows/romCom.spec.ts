import { createRowTest } from '../../utils/createRowTest';

// Row is sometimes absent for this account; when present, content may be VOD.
createRowTest('Rom-Com', { skipOnTimeout: true }, 420682);
