import { assertSupportedNode, localAppEnv, spawnLogged } from './lib';

assertSupportedNode();
spawnLogged('npx', ['next', 'dev', '-p', '3000'], localAppEnv());
