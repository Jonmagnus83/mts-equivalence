/** Drive folder under the owner's My Drive. The experimenter picks one of these two. */
export type StorageFolder = 'Mennesker' | 'Boter-AI';

export function storageFolder(value: string | null | undefined): StorageFolder {
  return value === 'Boter-AI' ? 'Boter-AI' : 'Mennesker';
}
