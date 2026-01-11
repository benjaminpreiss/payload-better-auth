import * as migration_20260111_134031 from './20260111_134031';

export const migrations = [
  {
    name: '20260111_134031',
    down: migration_20260111_134031.down,
    up: migration_20260111_134031.up
  },
];
