// backend/domain/errors.js — erros de domínio com status HTTP

export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
