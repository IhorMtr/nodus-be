import { logger } from '../../config/logger.js';

export async function closeStep(
  name: string,
  close: () => Promise<unknown>
): Promise<boolean> {
  try {
    await close();
    return true;
  } catch (error) {
    logger.error({ err: error }, `Failed to close ${name}`);
    return false;
  }
}
