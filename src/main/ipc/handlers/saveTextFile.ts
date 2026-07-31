import { writeFile } from 'node:fs/promises';
import { BrowserWindow, dialog } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { saveTextFileRequestSchema } from '@shared/schemas';

/** Backs the step 4 "Сохранить в файл" button: OS save dialog, then a plain write (tech.md section 4). */
export async function handleSaveTextFile(
  event: IpcMainInvokeEvent,
  payload: unknown,
): Promise<{ saved: boolean }> {
  const { suggestedName, content } = saveTextFileRequestSchema.parse(payload);
  const win = BrowserWindow.fromWebContents(event.sender);

  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, { defaultPath: suggestedName })
    : await dialog.showSaveDialog({ defaultPath: suggestedName });

  if (canceled || !filePath) return { saved: false };

  await writeFile(filePath, content, 'utf8');
  return { saved: true };
}
