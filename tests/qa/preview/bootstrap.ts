import { installProbe } from './probe.mjs';

installProbe();
// Static imports would initialize the game before storage isolation is installed.
await import('../../../src/main');
const { installCloudStatusFixture } = await import('./cloud-status-fixture');
installCloudStatusFixture();
