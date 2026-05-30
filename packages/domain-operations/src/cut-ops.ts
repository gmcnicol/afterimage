import { normalizeProject, type NormalizedProjectFile } from '@afterimage/project-model';
import { repairDuplicateVariantClipIds } from './sequence-ops.js';

function finalizeCutOperation(project: NormalizedProjectFile): NormalizedProjectFile {
  return repairDuplicateVariantClipIds(normalizeProject(project));
}

export function updateCutStatus(project: NormalizedProjectFile, cutId: string, status: 'new' | 'kept' | 'rejected' | 'favorite'): NormalizedProjectFile {
  return finalizeCutOperation({
    ...project,
    cutCandidates: project.cutCandidates.map((cut) => cut.id === cutId ? {
      ...cut,
      status,
      favorite: status === 'favorite' ? true : cut.favorite
    } : cut)
  });
}

export function toggleCutFavorite(project: NormalizedProjectFile, cutId: string): NormalizedProjectFile {
  return finalizeCutOperation({
    ...project,
    cutCandidates: project.cutCandidates.map((cut) => cut.id === cutId ? {
      ...cut,
      favorite: !cut.favorite,
      status: !cut.favorite ? 'favorite' : (cut.status === 'favorite' ? 'kept' : cut.status)
    } : cut)
  });
}

export function trimCut(project: NormalizedProjectFile, cutId: string, startMs: number, endMs: number): NormalizedProjectFile {
  return finalizeCutOperation({
    ...project,
    cutCandidates: project.cutCandidates.map((cut) => cut.id === cutId ? {
      ...cut,
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs)
    } : cut)
  });
}

export function addCutToBin(project: NormalizedProjectFile, cutId: string, binId: string): NormalizedProjectFile {
  return finalizeCutOperation({
    ...project,
    bins: project.bins.map((bin) => bin.id === binId ? {
      ...bin,
      cutIds: [...bin.cutIds, cutId]
    } : bin),
    cutCandidates: project.cutCandidates.map((cut) => cut.id === cutId ? {
      ...cut,
      binIds: [...(cut.binIds ?? []), binId]
    } : cut)
  });
}
