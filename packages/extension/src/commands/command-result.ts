import type { CommandResult } from '../types/commands';
import { CodedError, ErrorCodes } from '../utils/errors';

export function requireSuccessfulCommandResult<T>(
  result: unknown,
  fallbackMessage: string,
): CommandResult<T> {
  if (!result || typeof result !== 'object' || !('success' in result)) {
    throw new CodedError(fallbackMessage, ErrorCodes.COMMAND_FAILED);
  }

  const commandResult = result as CommandResult<T>;
  if (!commandResult.success) {
    throw new CodedError(
      commandResult.error ?? fallbackMessage,
      commandResult.errorCode ?? ErrorCodes.COMMAND_FAILED,
    );
  }

  return commandResult;
}
