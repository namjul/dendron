import {
  BulkResp,
  DNoteLoc,
  FindNoteOpts,
  NoteProps,
  NotePropsMeta,
  RespV3,
  WriteNoteMetaOpts,
  WriteNoteOpts,
} from "../types";

/**
 * Interface responsible for interacting with NoteProps storage layer
 */
export interface INoteStore<K> {
  /**
   * Get NoteProps by key
   * If key is not found, return error.
   *
   * @param key: key of NoteProps
   * @return NoteProps
   */
  get(key: K): Promise<RespV3<NoteProps>>;

  /**
   * Bulk get NoteProps by list of key
   * If no notes are found, return empty list.
   *
   * @param key: keys of NoteProps
   * @return list of NoteProps
   */
  bulkGet(keys: K[]): Promise<RespV3<NoteProps>[]>;

  /**
   * Get NoteProps metadata by key
   * If key is not found, return error.
   *
   * @param key: key of NoteProps
   * @return NoteProps metadata
   */
  getMetadata(key: K): Promise<RespV3<NotePropsMeta>>;

  /**
   * Find NoteProps by criteria. If no criteria is set, return empty array.
   * If multiple criterias are set, find NoteProps that matches all criteria
   *
   * @param opts: NoteProps find criteria
   * @return List of NoteProps that matches criteria
   */
  find(opts: FindNoteOpts): Promise<BulkResp<NoteProps[]>>;

  /**
   * Find NoteProps metadata by criteria. If no criteria is set, return empty array.
   * If multiple criterias are set, find NoteProps that matches all criteria
   *
   * @param opts: NoteProps criteria
   * @return List of NoteProps metadata that matches criteria
   */
  findMetaData(opts: FindNoteOpts): Promise<RespV3<NotePropsMeta[]>>;

  /**
   * Write NoteProps to storage layer for given key, overriding existing NoteProps if it already exists
   *
   * @param opts: NoteProps write criteria
   * @return original key
   */
  write(opts: WriteNoteOpts<K>): Promise<RespV3<K>>;

  /**
   * Write NoteProps metadata to storage layer for given key, overriding existing NoteProps metadata if it already exists
   * Unlike {@link INoteStore.write}, this will not touch the filesystem
   *
   * @param opts: NoteProps write criteria
   * @return original key
   */
  writeMetadata(opts: WriteNoteMetaOpts<K>): Promise<RespV3<K>>;

  /**
   * Bulk write NoteProps metadata to storage layer for given key, overriding existing NoteProps metadata if it already exists
   *
   * @param opts: NoteProps write criteria array
   * @return original key array
   */
  bulkWriteMetadata(opts: WriteNoteMetaOpts<K>[]): Promise<RespV3<K>[]>;

  /**
   * Delete NoteProps from storage layer for given key.
   * If key does not exist, do nothing.
   *
   * @param key: key of NoteProps to delete
   * @return original key
   */
  delete(key: K): Promise<RespV3<string>>;

  /**
   * Rename location of NoteProps
   * If old location does not exist, return error.
   *
   * @param oldLoc: old location of NoteProps to rename
   * @param newLoc: new location of NoteProps to rename
   * @return key of NoteProps to rename
   */
  rename(oldLoc: DNoteLoc, newLoc: DNoteLoc): Promise<RespV3<K>>;
}
