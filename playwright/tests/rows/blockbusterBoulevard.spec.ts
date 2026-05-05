import { createRowTest } from '../../utils/createRowTest';

// Blockbuster Boulevard contains a mix of live TV channels and VOD movies.
// Card[0] varies run-to-run — live channels play fine, VOD gets DRM-blocked.
// Skip on timeout rather than fail since the content is outside our control.
createRowTest('Blockbuster Boulevard', { skipOnTimeout: true }, 420671);
