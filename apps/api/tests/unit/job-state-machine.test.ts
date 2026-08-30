import { canTransition, EmailJobStatus } from '@mailflow/shared';

describe('EmailJob State Machine Transitions Guard', () => {
  describe('Valid Transitions', () => {
    it('should allow SCHEDULED -> PROCESSING transition', () => {
      expect(canTransition(EmailJobStatus.SCHEDULED, EmailJobStatus.PROCESSING)).toBe(true);
    });

    it('should allow SCHEDULED -> CANCELLED transition', () => {
      expect(canTransition(EmailJobStatus.SCHEDULED, EmailJobStatus.CANCELLED)).toBe(true);
    });

    it('should allow PROCESSING -> SENT transition', () => {
      expect(canTransition(EmailJobStatus.PROCESSING, EmailJobStatus.SENT)).toBe(true);
    });

    it('should allow PROCESSING -> FAILED transition', () => {
      expect(canTransition(EmailJobStatus.PROCESSING, EmailJobStatus.FAILED)).toBe(true);
    });

    it('should allow PROCESSING -> SCHEDULED transition (for retry reschedule)', () => {
      expect(canTransition(EmailJobStatus.PROCESSING, EmailJobStatus.SCHEDULED)).toBe(true);
    });

    it('should allow FAILED -> SCHEDULED transition (for manual/retry requeue)', () => {
      expect(canTransition(EmailJobStatus.FAILED, EmailJobStatus.SCHEDULED)).toBe(true);
    });

    it('should allow self transitions (idempotent state updates)', () => {
      expect(canTransition(EmailJobStatus.SCHEDULED, EmailJobStatus.SCHEDULED)).toBe(true);
      expect(canTransition(EmailJobStatus.SENT, EmailJobStatus.SENT)).toBe(true);
    });
  });

  describe('Invalid Transitions', () => {
    it('should reject SENT -> SCHEDULED transition (terminal state protection)', () => {
      expect(canTransition(EmailJobStatus.SENT, EmailJobStatus.SCHEDULED)).toBe(false);
    });

    it('should reject SENT -> PROCESSING transition', () => {
      expect(canTransition(EmailJobStatus.SENT, EmailJobStatus.PROCESSING)).toBe(false);
    });

    it('should reject CANCELLED -> PROCESSING transition (terminal state protection)', () => {
      expect(canTransition(EmailJobStatus.CANCELLED, EmailJobStatus.PROCESSING)).toBe(false);
    });

    it('should reject CANCELLED -> SENT transition', () => {
      expect(canTransition(EmailJobStatus.CANCELLED, EmailJobStatus.SENT)).toBe(false);
    });

    it('should reject SCHEDULED -> SENT transition without going through PROCESSING', () => {
      expect(canTransition(EmailJobStatus.SCHEDULED, EmailJobStatus.SENT)).toBe(false);
    });
  });
});
