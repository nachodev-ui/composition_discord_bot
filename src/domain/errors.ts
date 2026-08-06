export class BotConfigurationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BotConfigurationError';
  }
}

export class RoleAssignmentError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RoleAssignmentError';
  }
}

export class SignupSlotOccupiedError extends Error {
  public constructor(
    public readonly buildNumber: number,
    public readonly occupantUserId: string,
  ) {
    super(`El puesto #${buildNumber} ya está ocupado por <@${occupantUserId}>.`);
    this.name = 'SignupSlotOccupiedError';
  }
}
