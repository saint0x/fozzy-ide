import { open } from '@tauri-apps/plugin-dialog';

export async function selectProjectFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select a project folder to import into Fozzy IDE',
  });
  return typeof selected === 'string' && selected.trim() ? selected.trim() : null;
}
