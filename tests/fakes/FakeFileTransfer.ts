import type { IFileTransfer } from '../../src/main/ssh/types';

interface WrittenFile {
  remotePath: string;
  content: string;
  mode: number;
}

/** In-memory IFileTransfer for domain tests - no SFTP round trip. */
export class FakeFileTransfer implements IFileTransfer {
  readonly writes: WrittenFile[] = [];

  async writeFile(remotePath: string, content: string, mode: number): Promise<void> {
    this.writes.push({ remotePath, content, mode });
  }
}
