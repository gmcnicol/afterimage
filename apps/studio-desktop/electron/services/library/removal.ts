import type { DatabaseSync } from 'node:sqlite';
import {
  removeAssets as removeCatalogAssets,
  removeRoot as removeCatalogRoot
} from './catalog.js';

export function createLibraryRemoval({ db }: { db: DatabaseSync }) {
  return {
    removeRoot(rootId: string): boolean {
      return removeCatalogRoot(db, rootId);
    },
    removeAssets(assetIds: string[]): number {
      return removeCatalogAssets(db, assetIds);
    }
  };
}
