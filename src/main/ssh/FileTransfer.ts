import type { Client } from 'ssh2';
import type { IFileTransfer } from './types';

/** Writes files over SFTP with an explicit mode (tech.md 5.2/5.3). */
export class FileTransfer implements IFileTransfer {
  constructor(private readonly client: Client) {}

  writeFile(remotePath: string, content: string, mode: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        sftp.writeFile(remotePath, content, { mode }, (writeErr) => {
          sftp.end();
          if (writeErr) reject(writeErr);
          else resolve();
        });
      });
    });
  }
}
