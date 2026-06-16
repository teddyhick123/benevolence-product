import { assertSupportedNode, localAppEnv, spawnInherited } from './lib';

assertSupportedNode();
spawnInherited('npx', ['next', 'dev', '-p', '3000'], localAppEnv());
