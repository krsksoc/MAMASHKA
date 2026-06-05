export class MamashkaError extends Error {
  public context: Record<string, unknown>;

  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "MamashkaError";
    this.context = context;
  }
}

export class ValidationError extends MamashkaError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context);
    this.name = "ValidationError";
  }
}

export class DatabaseError extends MamashkaError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context);
    this.name = "DatabaseError";
  }
}

export class LLMError extends MamashkaError {
  public provider: string;

  constructor(message: string, provider: string, context: Record<string, unknown> = {}) {
    super(message, context);
    this.name = "LLMError";
    this.provider = provider;
  }
}

export class TelegramError extends MamashkaError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context);
    this.name = "TelegramError";
  }
}
